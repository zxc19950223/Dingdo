const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const profile = process.env.TODO_TEST_USER_DATA;
app.commandLine.appendSwitch('user-data-dir', profile);
if (process.platform === 'darwin') app.commandLine.appendSwitch('use-mock-keychain');
fs.writeFileSync(path.join(profile, 'workspace.json'), JSON.stringify({ version: 1, localStorage: {} }));

function windowUrls() {
  return BrowserWindow.getAllWindows().map((window) => window.webContents.getURL() || '[empty]');
}

function waitFor(predicate, timeoutMs = 5000) {
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
        reject(new Error(`desktop card integration timeout: ${windowUrls().join(', ')}`));
      }
    }, 25);
  });
}

const timeout = setTimeout(() => {
  console.error('Desktop card integration timed out');
  app.exit(1);
}, 20000);

app.whenReady().then(async () => {
  try {
    const mainWindow = await waitFor(() => (
      BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('/renderer/index.html'))
    ));
    const taskId = await mainWindow.webContents.executeJavaScript(`
      (() => {
        const task = window.NotchTodo.quickAdd('桌面卡片集成测试');
        return task && task.id;
      })()
    `);
    assert.ok(taskId);
    await mainWindow.webContents.executeJavaScript(`
      window.NotchTodo.openTask('${taskId}');
      document.getElementById('todo-detail-desktop-card').click();
    `);
    await new Promise((resolve) => setTimeout(resolve, 300));
    const cardWindow = await waitFor(() => (
      BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('/renderer/desktop-card.html'))
    ));
    const state = await cardWindow.webContents.executeJavaScript(`window.desktopCardAPI.getState()`);
    assert.equal(state.text, '桌面卡片集成测试');
    assert.equal(state.status, 'todo');
    assert.equal(state.blockReason, '');
    const updated = await cardWindow.webContents.executeJavaScript(`
      window.desktopCardAPI.updateTask({
        text: '桌面卡片修改后的标题',
        status: 'in_progress',
        blockReason: '',
        nextAction: ''
      })
    `);
    assert.equal(updated.ok, true);
    const persisted = await mainWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const deadline = performance.now() + 3000;
        const read = () => {
          const task = JSON.parse(localStorage.getItem('notch-todo-data')).tasks.find((item) => item.id === '${taskId}');
          if (task?.text === '桌面卡片修改后的标题' && task?.status === 'in_progress') {
            resolve(true);
            return;
          }
          if (performance.now() >= deadline) {
            resolve(false);
            return;
          }
          setTimeout(read, 20);
        };
        read();
      })
    `);
    assert.equal(persisted, true);
    const saved = await mainWindow.webContents.executeJavaScript(`
      JSON.parse(localStorage.getItem('notch-todo-data')).tasks.find((item) => item.id === '${taskId}')
    `);
    assert.equal(saved.text, '桌面卡片修改后的标题');
    assert.equal(saved.status, 'in_progress');
    const closed = await cardWindow.webContents.executeJavaScript(`window.desktopCardAPI.closeCard()`);
    assert.equal(closed.ok, true);
    console.log('Desktop card main integration checks passed');
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error(error);
    clearTimeout(timeout);
    app.exit(1);
  }
});

require('../main.js');
