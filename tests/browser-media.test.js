const test = require('node:test');
const assert = require('node:assert/strict');

const {
  CHROMIUM_BROWSERS,
  detectBrowserMedia,
} = require('../browser-media');

test('browser media adapter covers common Chromium browsers', () => {
  assert.deepEqual(CHROMIUM_BROWSERS, [
    'Google Chrome',
    'Arc',
    'Microsoft Edge',
    'Brave Browser',
    'Chromium',
  ]);
});

test('browser media detection returns an optional display-only snapshot', async () => {
  const result = await detectBrowserMedia();
  assert.ok(result === null || (
    typeof result.browser === 'string'
    && typeof result.title === 'string'
    && typeof result.url === 'string'
  ));
});
