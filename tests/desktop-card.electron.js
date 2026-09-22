const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

async function main() {
  await app.whenReady();
  let state = {
    id: 'desktop-task',
    text: '提交项目材料',
    status: 'blocked',
    statusLabel: '受阻',
    dueText: '今天 18:00',
    overdue: false,
    priorityLabel: '紧急',
    blockReasonType: '等待别人',
    blockReason: '等待客户签字',
    nextAction: '明天联系客户',
    subtaskDone: 1,
    subtaskTotal: 2,
    done: false,
    alwaysOnTop: false,
  };
  let toggleCount = 0;
  let openCount = 0;
  let closeCount = 0;
  let updatePatch = null;
  ipcMain.handle('desktop-card:get-state', () => state);
  ipcMain.handle('desktop-card:toggle-task', () => {
    toggleCount += 1;
    return { ok: true };
  });
  ipcMain.handle('desktop-card:open-task', () => {
    openCount += 1;
    return { ok: true };
  });
  ipcMain.handle('desktop-card:close', () => {
    closeCount += 1;
    return { ok: true };
  });
  ipcMain.handle('desktop-card:update-task', (event, patch) => {
    updatePatch = patch;
    return { ok: true };
  });
  ipcMain.handle('desktop-card:resize-content', () => ({ ok: true }));
  ipcMain.handle('desktop-card:set-always-on-top', (event, enabled) => {
    state = { ...state, alwaysOnTop: enabled === true };
    return { ok: true, alwaysOnTop: state.alwaysOnTop };
  });
  const window = new BrowserWindow({
    width: 300,
    height: 190,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'renderer', 'desktop-card-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  try {
    await window.loadFile(path.join(__dirname, '..', 'renderer', 'desktop-card.html'));
    const initial = await window.webContents.executeJavaScript(`
      ({
        title: document.getElementById('desktop-card-title').textContent,
        status: document.getElementById('desktop-card-status').textContent,
        reason: document.getElementById('desktop-card-reason').textContent,
        next: document.getElementById('desktop-card-next').textContent,
        progress: document.getElementById('desktop-card-progress').textContent,
        titleWrap: getComputedStyle(document.getElementById('desktop-card-title')).whiteSpace,
      })
    `);
    assert.deepEqual(initial, {
      title: '提交项目材料',
      status: '受阻',
      reason: '等待别人：等待客户签字',
      next: '下一步：明天联系客户',
      progress: '子任务 1/2',
      titleWrap: 'normal',
    });
    await window.webContents.executeJavaScript(`
      document.getElementById('desktop-card-toggle').click();
      document.getElementById('desktop-card-open').click();
      document.getElementById('desktop-card-pin').click();
      document.getElementById('desktop-card-close').click();
    `);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.equal(toggleCount, 1);
    assert.equal(openCount, 1);
    assert.equal(closeCount, 1);
    window.webContents.send('desktop-card:state', {
      ...state,
      status: 'done',
      statusLabel: '已完成',
      done: true,
    });
    await window.webContents.executeJavaScript(`
      new Promise((resolve) => setTimeout(resolve, 50))
    `);
    const done = await window.webContents.executeJavaScript(`
      ({
        status: document.getElementById('desktop-card-status').textContent,
        label: document.getElementById('desktop-card-toggle-label').textContent,
        state: document.getElementById('desktop-card').dataset.status,
      })
    `);
    assert.deepEqual(done, { status: '已完成', label: '恢复待办', state: 'done' });
    await window.webContents.executeJavaScript(`
      document.getElementById('desktop-card-edit-toggle').click();
      document.getElementById('desktop-card-status-select').value = 'blocked';
      document.getElementById('desktop-card-reason-input').value = '等待新的签字';
      document.getElementById('desktop-card-next-input').value = '下午继续跟进';
      document.querySelector('[data-desktop-deadline="30"]').click();
      document.getElementById('desktop-card-edit-save').click();
    `);
    await new Promise((resolve) => setTimeout(resolve, 50));
    assert.deepEqual(updatePatch, {
      status: 'blocked',
      blockReason: '等待新的签字',
      nextAction: '下午继续跟进',
      snoozeMinutes: 30,
    });
    console.log('Desktop card renderer checks passed');
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

main().then(() => app.quit()).catch((error) => {
  console.error(error);
  app.exit(1);
});
