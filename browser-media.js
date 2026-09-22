const { execFile } = require('node:child_process');

const CHROMIUM_BROWSERS = [
  'Google Chrome',
  'Arc',
  'Microsoft Edge',
  'Brave Browser',
  'Chromium',
];

const SAFARI_SCRIPT = `
function run() {
  try {
    const safari = Application('Safari');
    if (!safari.running()) return 'null';
    const windows = safari.windows();
    for (let wi = 0; wi < windows.length; wi += 1) {
      const tabs = windows[wi].tabs();
      for (let ti = 0; ti < tabs.length; ti += 1) {
        const tab = tabs[ti];
        try {
          const playing = safari.doJavaScript(
            'Array.from(document.querySelectorAll("audio,video")).some(function (media) { return !media.paused && !media.ended && media.readyState > 2; })',
            { in: tab }
          );
          if (playing) {
            return JSON.stringify({
              browser: 'Safari',
              title: String(tab.name() || ''),
              url: String(tab.url() || ''),
            });
          }
        } catch (error) {}
      }
    }
    return 'null';
  } catch (error) {
    return 'null';
  }
}`;

const MEDIA_DETECTION_JAVASCRIPT = `
(() => {
  const qqPlayer = document.querySelector('.mod_player .player__ft');
  const qqButton = qqPlayer && qqPlayer.querySelector('.btn_big_play');
  if (qqPlayer && qqButton && qqButton.classList.contains('btn_big_play--pause')) {
    const info = qqPlayer.querySelector('.player_music__info');
    const timeText = String(qqPlayer.querySelector('.player_music')?.innerText || '');
    const title = String(info?.querySelector('a:not(.playlist__author)')?.innerText || '').trim();
    const artist = String(info?.querySelector('.playlist__author')?.innerText || '').trim();
    const match = timeText.match(/(\\d{1,2}:\\d{2})\\s*\\/\\s*(\\d{1,2}:\\d{2})/);
    if (title && match) {
      const toSeconds = (value) => {
        const parts = String(value || '').split(':').map(Number);
        return parts.length === 2 ? parts[0] * 60 + parts[1] : 0;
      };
      return JSON.stringify({
        title,
        artist,
        album: '',
        elapsed: toSeconds(match[1]),
        duration: toSeconds(match[2]),
      });
    }
  }
  const media = Array.from(document.querySelectorAll('audio,video'))
    .filter((item) => !item.paused && !item.ended && item.readyState > 2);
  if (!media.length) return '';
  const metadata = navigator.mediaSession && navigator.mediaSession.metadata;
  return JSON.stringify({
    title: metadata && metadata.title || document.title || '',
    artist: metadata && metadata.artist || '',
    album: metadata && metadata.album || '',
    elapsed: media[0].currentTime || 0,
    duration: Number.isFinite(media[0].duration) ? media[0].duration : 0,
  });
})()`;

const CHROMIUM_SCRIPT = `
function run(argv) {
  const name = argv[0];
  try {
    const browser = Application(name);
    if (!browser.running()) return 'null';
    let fallback = null;
    const windows = browser.windows();
    for (let wi = 0; wi < windows.length; wi += 1) {
      const tabs = windows[wi].tabs();
      for (let ti = 0; ti < tabs.length; ti += 1) {
        const tab = tabs[ti];
        let title = '';
        let url = '';
        try {
          title = String(tab.title() || '');
          url = String(tab.url() || '');
        } catch (error) {
          continue;
        }
        const isMediaUrl = /(y\.qq\.com|music\.163\.com|spotify\.com|music\.apple\.com|youtube\.com|bilibili\.com|soundcloud\.com)/i.test(url);
        if (!isMediaUrl) {
          try {
            if (tab.audible()) {
              return JSON.stringify({ browser: name, title, url, artist: '', album: '' });
            }
          } catch (error) {}
          continue;
        }
        try {
          const raw = browser.execute(tab, { javascript: ${JSON.stringify(MEDIA_DETECTION_JAVASCRIPT)} });
          if (raw) {
            const media = JSON.parse(String(raw));
            if (media && media.title) {
              return JSON.stringify({
                browser: name,
                title: media.title,
                artist: media.artist || '',
                album: media.album || '',
                elapsed: Number(media.elapsed) || 0,
                duration: Number(media.duration) || 0,
                url,
              });
            }
          }
        } catch (error) {
          if (isMediaUrl) {
            const candidate = {
              browser: name,
              title,
              artist: '需要开启 Apple Events JavaScript 权限',
              url,
              restricted: true,
            };
            if (!fallback || /(player|playlist|\\.mp3|\\.m4a)/i.test(url)) {
              fallback = JSON.stringify(candidate);
            }
          }
        }
        try {
          if (!tab.audible()) continue;
          return JSON.stringify({ browser: name, title, url, artist: '', album: '' });
        } catch (error) {}
      }
    }
    return fallback || 'null';
  } catch (error) {
    return 'null';
  }
}`;

function runJxa(script, args = [], timeout = 1800) {
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', script, ...args], {
      timeout,
      maxBuffer: 512 * 1024,
    }, (error, stdout) => {
      if (error) {
        resolve(null);
        return;
      }
      try {
        resolve(JSON.parse(String(stdout || '').trim()));
      } catch (parseError) {
        resolve(null);
      }
    });
  });
}

async function detectBrowserMedia() {
  if (process.platform !== 'darwin') return null;
  for (const browser of CHROMIUM_BROWSERS) {
    const result = await runJxa(CHROMIUM_SCRIPT, [browser]);
    if (result?.title) return result;
  }
  const safari = await runJxa(SAFARI_SCRIPT);
  return safari?.title ? safari : null;
}

module.exports = {
  CHROMIUM_BROWSERS,
  detectBrowserMedia,
};
