const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.setPath('userData', process.env.TODO_TEST_USER_DATA);

async function main() {
  await app.whenReady();
  const window = new BrowserWindow({
    width: 280,
    height: 38,
    show: false,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    webPreferences: { backgroundThrottling: false },
  });

  try {
    await window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    window.show();
    window.focus();
    const initial = await window.webContents.executeJavaScript(`
      (() => {
        const notch = document.getElementById('notch');
        const eyes = document.getElementById('notch-eyes');
        const notchRect = notch.getBoundingClientRect();
        const eyesRect = eyes.getBoundingClientRect();
        return {
          viewportWidth: window.innerWidth,
          notchWidth: notchRect.width,
          notchRight: notchRect.right,
          eyesLeft: eyesRect.left,
          eyeWidth: eyes.querySelector('.notch-eye').getBoundingClientRect().width,
          eyeHeight: eyes.querySelector('.notch-eye').getBoundingClientRect().height,
          eyesHidden: eyes.hidden,
          mediaHidden: document.getElementById('notch-media').hidden,
          coverLeft: getComputedStyle(document.getElementById('notch-cover')).left,
          eqRight: getComputedStyle(document.getElementById('notch-eq')).right,
          hasStatus: notch.classList.contains('has-collapsed-status'),
        };
      })()
    `);

    assert.deepEqual(initial, {
      viewportWidth: 280,
      notchWidth: 280,
      notchRight: 280,
      eyesLeft: 243,
      eyeWidth: 14,
      eyeHeight: 13,
      eyesHidden: false,
      mediaHidden: true,
      coverLeft: '8px',
      eqRight: '8px',
      hasStatus: true,
    }, '折叠态应是统一胶囊，媒体与眼睛均位于胶囊左右内侧');

    const themedShells = await window.webContents.executeJavaScript(`
      (() => {
        const previous = window.NotchTheme.getSettings();
        window.NotchTheme.update({ theme: 'frost' });
        const light = getComputedStyle(document.getElementById('notch')).backgroundColor;
        window.NotchTheme.update({ theme: 'midnight' });
        const dark = getComputedStyle(document.getElementById('notch')).backgroundColor;
        window.NotchTheme.update(previous);
        return { light, dark };
      })()
    `);
    assert.deepEqual(themedShells, {
      light: 'rgb(11, 12, 15)',
      dark: 'rgb(11, 12, 15)',
    }, '折叠胶囊必须在亮色和暗色主题下保持同一种颜色');

    const gaze = await window.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const notch = document.getElementById('notch');
        const eyes = document.getElementById('notch-eyes');
        notch.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 0, clientY: 19 }));
        await sleep(30);
        const left = getComputedStyle(eyes).getPropertyValue('--eye-x').trim();
        notch.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 320, clientY: 0 }));
        await sleep(30);
        const right = getComputedStyle(eyes).getPropertyValue('--eye-x').trim();
        const up = getComputedStyle(eyes).getPropertyValue('--eye-y').trim();
        notch.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: 130, clientY: 38 }));
        await sleep(30);
        const down = getComputedStyle(eyes).getPropertyValue('--eye-y').trim();
        return {
          left,
          right,
          up,
          down,
          reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches
            || window.NotchTheme.getSettings().reduceMotion === true,
        };
      })()
    `);
    if (!gaze.reducedMotion) {
      assert.equal(gaze.left, '-3.4px');
      assert.equal(gaze.right, '3.4px');
      assert.equal(gaze.up, '-1.8px');
      assert.equal(gaze.down, '1.8px');
    }

    const mediaState = await window.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        let active = true;
        let trackTitle = 'Collapsed test track';
        const modeCalls = [];
        window.notchAPI = {
          getMusicStatus: async () => ({
            sessionActive: active,
            playing: active,
            title: active ? trackTitle : '',
            source: 'Test player',
          }),
          setMode: async (mode) => {
            modeCalls.push(mode);
          },
        };
        document.dispatchEvent(new CustomEvent('notch:modechange', { detail: { expanded: false } }));
        const mediaDeadline = performance.now() + 2000;
        while (document.getElementById('notch-media').hidden && performance.now() < mediaDeadline) {
          await sleep(10);
        }
        const playing = {
          mediaHidden: document.getElementById('notch-media').hidden,
          eyesHidden: document.getElementById('notch-eyes').hidden,
          isPlaying: document.getElementById('notch-media').classList.contains('is-playing'),
          coverPlaceholder: Boolean(document.querySelector('.notch-cover-placeholder')),
          peekActive: document.getElementById('notch').classList.contains('music-peek'),
          peekTitle: document.getElementById('notch-peek-title').textContent,
          modeCalls: [...modeCalls],
        };
        const closeDeadline = performance.now() + 5000;
        while (
          (
            document.getElementById('notch').classList.contains('music-peek')
            || !modeCalls.includes('collapsed')
          )
          && performance.now() < closeDeadline
        ) {
          await sleep(20);
        }
        const notch = document.getElementById('notch');
        notch.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
        const hoverDeadline = performance.now() + 2000;
        while (
          !notch.classList.contains('music-peek')
          && performance.now() < hoverDeadline
        ) {
          await sleep(10);
        }
        const hoverOpen = notch.classList.contains('music-peek');
        await sleep(1600);
        trackTitle = 'Second test track';
        document.dispatchEvent(new CustomEvent('notch:modechange', { detail: { expanded: false } }));
        const changedDeadline = performance.now() + 2500;
        while (
          (
            !document.getElementById('notch').classList.contains('music-peek')
            || document.getElementById('notch-peek-title').textContent !== trackTitle
          )
          && performance.now() < changedDeadline
        ) {
          await sleep(10);
        }
        const trackChange = {
          peekActive: document.getElementById('notch').classList.contains('music-peek'),
          peekTitle: document.getElementById('notch-peek-title').textContent,
          hoverOpen,
        };
        notch.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
        await sleep(400);
        const hoverLeaveHeld = notch.classList.contains('music-peek');
        const hoverCloseDeadline = performance.now() + 4000;
        while (
          (
            notch.classList.contains('music-peek')
            || modeCalls.filter((mode) => mode === 'collapsed').length < 2
          )
          && performance.now() < hoverCloseDeadline
        ) {
          await sleep(20);
        }
        trackChange.hoverLeaveHeld = hoverLeaveHeld;
        trackChange.closedAfterDelay = !notch.classList.contains('music-peek');
        active = false;
        document.dispatchEvent(new CustomEvent('notch:modechange', { detail: { expanded: false } }));
        const idleDeadline = performance.now() + 2000;
        while (
          (
            document.getElementById('notch-eyes').hidden
            || document.getElementById('notch').classList.contains('music-peek')
            || modeCalls.filter((mode) => mode === 'collapsed').length < 2
          )
          && performance.now() < idleDeadline
        ) {
          await sleep(10);
        }
        const idle = {
          mediaHidden: document.getElementById('notch-media').hidden,
          eyesHidden: document.getElementById('notch-eyes').hidden,
          peekActive: document.getElementById('notch').classList.contains('music-peek'),
          modeCalls: [...modeCalls],
        };
        return { playing, trackChange, idle };
      })()
    `);
    mediaState.idle.modeCalls = mediaState.idle.modeCalls.slice(0, 2);
    assert.deepEqual(mediaState, {
      playing: {
        mediaHidden: false,
        eyesHidden: true,
        isPlaying: true,
        coverPlaceholder: true,
        peekActive: true,
        peekTitle: 'Collapsed test track',
        modeCalls: ['peek'],
      },
      trackChange: {
        peekActive: true,
        peekTitle: '今天没有待办',
        hoverOpen: true,
        hoverLeaveHeld: false,
        closedAfterDelay: true,
      },
      idle: {
        mediaHidden: true,
        eyesHidden: false,
        peekActive: false,
        modeCalls: ['peek', 'collapsed'],
      },
    }, '折叠态应在播放媒体和空闲眼睛之间切换');

    const hoverPreview = await window.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const task = window.NotchTodo.quickAdd('悬浮待办 明天下午3点');
        const preview = window.NotchTodo.getHoverPreview();
        const notch = document.getElementById('notch');
        notch.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
        await sleep(340);
        const active = notch.classList.contains('todo-peek');
        const title = document.getElementById('notch-peek-title').textContent;
        const meta = document.getElementById('notch-peek-meta').textContent;
        notch.dispatchEvent(new PointerEvent('pointerleave', { bubbles: true }));
        await sleep(220);
        return {
          taskId: task?.id || '',
          previewKind: preview?.kind || '',
          previewTaskId: preview?.taskId || '',
          active,
          title,
          meta,
          closed: !notch.classList.contains('todo-peek'),
        };
      })()
    `);
    assert.equal(hoverPreview.previewKind, 'upcoming');
    assert.equal(hoverPreview.previewTaskId, hoverPreview.taskId);
    assert.equal(hoverPreview.active, true);
    assert.equal(hoverPreview.title, '悬浮待办');
    assert.match(hoverPreview.meta, /下一条/);
    assert.equal(hoverPreview.closed, true);

    const importPeek = await window.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const opened = await window.NotchWorkspace.showPeek({
          title: '已同步 2 条 Siri 待办',
          meta: '给王总打电话 · 买票',
          kind: 'siri',
          duration: 1800,
        });
        await sleep(80);
        const notch = document.getElementById('notch');
        const visible = {
          opened,
          active: notch.classList.contains('music-peek'),
          kind: notch.dataset.previewKind,
          title: document.getElementById('notch-peek-title').textContent,
          meta: document.getElementById('notch-peek-meta').textContent,
        };
        await sleep(2000);
        return {
          ...visible,
          closed: !notch.classList.contains('music-peek'),
        };
      })()
    `);
    assert.deepEqual(importPeek, {
      opened: true,
      active: true,
      kind: 'siri',
      title: '已同步 2 条 Siri 待办',
      meta: '给王总打电话 · 买票',
      closed: true,
    });

    const expanded = await window.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        document.getElementById('notch-eyes').click();
        const deadline = performance.now() + 3000;
        while (!document.getElementById('app').classList.contains('expanded') && performance.now() < deadline) {
          await sleep(10);
        }
        return {
          expanded: document.getElementById('app').classList.contains('expanded'),
          eyesHidden: document.getElementById('notch-eyes').hidden,
          mediaHidden: document.getElementById('notch-media').hidden,
        };
      })()
    `);
    assert.deepEqual(expanded, {
      expanded: true,
      eyesHidden: true,
      mediaHidden: true,
    }, '点击眼睛仍需展开面板，并停止折叠态动画');

    console.log('Collapsed media and eye checks passed');
  } finally {
    window.destroy();
  }
}

main().then(() => app.quit(), (error) => {
  console.error(error);
  app.exit(1);
});
