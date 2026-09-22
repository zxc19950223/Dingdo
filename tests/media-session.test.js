const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const {
  MediaSessionService,
  normalizeMediaStatus,
  MEDIA_ACTIONS,
} = require('../media-session');

test('media status normalization exposes stable player metadata', () => {
  assert.deepEqual(normalizeMediaStatus({
    ok: true,
    active: true,
    playing: true,
    pid: 42,
    appName: 'Spotify',
    bundleId: 'com.spotify.client',
    title: '歌曲',
    artist: '歌手',
    album: '专辑',
    duration: 210,
    elapsed: 30,
    playbackRate: 1,
    volume: 42,
    artworkMime: 'image/png',
    artworkBase64: 'AA==',
  }), {
    available: true,
    active: true,
    playing: true,
    pid: 42,
    appName: 'Spotify',
    bundleId: 'com.spotify.client',
    appPath: '',
    title: '歌曲',
    artist: '歌手',
    album: '专辑',
    duration: 210,
    elapsed: 30,
    playbackRate: 1,
    volume: 42,
    artwork: 'data:image/png;base64,AA==',
  });
  assert.deepEqual([...MEDIA_ACTIONS], ['play', 'pause', 'toggle', 'next', 'previous']);
  assert.equal(normalizeMediaStatus({ ok: true, playbackState: 1, playing: false }).playing, true);
  assert.equal(normalizeMediaStatus({ ok: true, playbackState: 2, playing: true }).playing, false);
});

test('media helper returns a valid idle snapshot on macOS', async (t) => {
  if (process.platform !== 'darwin') return t.skip('macOS only');
  const helperPath = path.join(__dirname, '..', 'build', 'media-session-helper');
  if (!fs.existsSync(helperPath)) return t.skip('helper not built');
  const service = new MediaSessionService({ helperPath });
  service.start();
  const status = await service.getStatus();
  assert.equal(service.isAvailable(), true);
  assert.equal(typeof status.active, 'boolean');
  assert.equal(typeof status.playing, 'boolean');
  assert.equal(typeof status.title, 'string');
  service.stop();
});
