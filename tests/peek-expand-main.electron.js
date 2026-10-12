const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dingdo-peek-expand-'));
app.commandLine.appendSwitch('user-data-dir', profile);

function waitFor(predicate, timeoutMs = 12000) {
  return new Promise((resolve, reject) => {
    const startedAt = Date.now();
    const timer = setInterval(() => {
      const value = predicate();
      if (value) {
        clearInterval(timer);
        resolve(value);
        return;
      }
      if (Date.now() - startedAt > timeoutMs) {
        clearInterval(timer);
        reject(new Error('peek expand integration timeout'));
      }
    }, 25);
  });
}

const timeout = setTimeout(() => {
  console.error('Peek expand integration timed out');
  app.exit(1);
}, 30000);

app.whenReady().then(async () => {
  try {
    const mainWindow = await waitFor(() => BrowserWindow.getAllWindows().find((window) => (
      window.webContents.getURL().endsWith('/renderer/index.html')
    )));
    const before = mainWindow.getBounds();
    const renderer = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        window.NotchTheme.update({ theme: 'frost' });
        const notch = document.getElementById('notch');
        let expandedMode = false;
        document.addEventListener('notch:modechange', (event) => {
          if (event.detail?.expanded) expandedMode = true;
        });
        notch.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true }));
        await sleep(350);
        notch.click();
        const deadline = performance.now() + 3000;
        while (!expandedMode && performance.now() < deadline) await sleep(20);
        await sleep(350);
        const appElement = document.getElementById('app');
        return {
          expandedMode,
          expanded: appElement.classList.contains('expanded'),
          opening: appElement.classList.contains('opening'),
          peek: notch.classList.contains('music-peek'),
        };
      })()
    `);
    const after = mainWindow.getBounds();
    assert.equal(renderer.expandedMode, true);
    assert.equal(renderer.expanded, true);
    assert.equal(renderer.opening, false);
    assert.equal(renderer.peek, false);
    assert.ok(after.width > before.width + 500, '展开后原生窗口宽度应明显增加');
    assert.ok(after.height > before.height + 300, '展开后原生窗口高度应明显增加');
    console.log('Peek then expand main integration checks passed');
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error(error);
    clearTimeout(timeout);
    app.exit(1);
  }
});

require('../main.js');
