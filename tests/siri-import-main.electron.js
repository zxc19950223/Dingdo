const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const childProcess = require('node:child_process');
const { app, BrowserWindow } = require('electron');

const profile = process.env.TODO_TEST_USER_DATA;
app.commandLine.appendSwitch('user-data-dir', profile);
if (process.platform === 'darwin') app.commandLine.appendSwitch('use-mock-keychain');
fs.writeFileSync(path.join(profile, 'workspace.json'), JSON.stringify({ version: 1, localStorage: {} }));

const originalExecFile = childProcess.execFile;
childProcess.execFile = (file, args, options, callback) => {
  if (file === '/usr/bin/pgrep' && Array.isArray(args) && args.includes('Reminders')) {
    process.nextTick(() => callback(null, '4242\n'));
    return {};
  }
  if (file === '/usr/bin/open' && Array.isArray(args) && args.includes('Reminders')) {
    process.nextTick(() => callback(null, ''));
    return {};
  }
  const script = Array.isArray(args) ? String(args[3] || '') : '';
  if (file === '/usr/bin/osascript' && script.includes("Application('Reminders')")) {
    const output = script.includes('const wanted =')
      ? JSON.stringify({
        ok: true,
        items: [
          {
            id: 'x-apple-reminder://siri-import-test-1',
            name: 'Siri 导入测试一',
            body: '来自系统提醒事项',
            completed: false,
            priority: 1,
            due: '2026-09-22T07:00:00.000Z',
            createdAt: '2026-09-21T07:09:49.000Z',
          },
          {
            id: 'x-apple-reminder://siri-import-test-2',
            name: 'Siri 导入测试二',
            body: '',
            completed: false,
            priority: 5,
            due: '2026-09-22T08:00:00.000Z',
            createdAt: '2026-09-21T07:10:49.000Z',
          },
          {
            id: 'x-apple-reminder://siri-import-test-3',
            name: 'Siri 导入测试三',
            body: '',
            completed: false,
            priority: 9,
            due: '',
            createdAt: '2026-09-21T07:11:49.000Z',
          },
        ],
      })
      : JSON.stringify([{ id: 'list-1', name: 'Siri 收件箱' }]);
    process.nextTick(() => callback(null, output));
    return {};
  }
  return originalExecFile(file, args, options, callback);
};

function waitFor(predicate, timeoutMs = 20000) {
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
        reject(new Error('Siri import integration timeout'));
      }
    }, 25);
  });
}

async function waitForValue(factory, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const value = await factory();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Siri import value timeout');
}

const timeout = setTimeout(() => {
  console.error('Siri import integration timed out');
  app.exit(1);
}, 40000);

app.whenReady().then(async () => {
  try {
    const mainWindow = await waitFor(() => (
      BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('/renderer/index.html'))
    ));
    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('todo-siri-import').click();
    `);
    await waitForValue(() => mainWindow.webContents.executeJavaScript(`
      document.querySelectorAll('#siri-import-reminder-list option').length > 0
        && document.getElementById('siri-import-reminder-list').value === 'list-1'
    `));
    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('siri-import-auto').checked = true;
      document.getElementById('siri-import-form').requestSubmit();
    `);
    const imported = await waitForValue(() => mainWindow.webContents.executeJavaScript(`
      (() => {
        const workspace = JSON.parse(localStorage.getItem('notch-todo-data') || '{}');
        const tasks = (workspace.tasks || []).filter((task) => (
          task.externalId === 'x-apple-reminder://siri-import-test-1'
          && (workspace.tasks || []).some((item) => item.externalId === 'x-apple-reminder://siri-import-test-2')
          && (workspace.tasks || []).some((item) => item.externalId === 'x-apple-reminder://siri-import-test-3')
        ));
        return tasks.length ? tasks[0] : null;
      })()
    `));
    assert.equal(imported.text, 'Siri 导入测试一');
    assert.equal(imported.notes, '来自系统提醒事项');
    assert.equal(imported.priority, 'urgent');
    assert.equal(imported.externalSource, 'apple-reminders');
    assert.equal(imported.deadline, '2026-09-22T07:00:00.000Z');
    const peek = await waitForValue(() => mainWindow.webContents.executeJavaScript(`
      (() => {
        const notch = document.getElementById('notch');
        if (!notch.classList.contains('music-peek')) return null;
        return {
          kind: notch.dataset.previewKind,
          title: document.getElementById('notch-peek-title').textContent,
          meta: document.getElementById('notch-peek-meta').textContent,
        };
      })()
    `));
    assert.equal(peek.kind, 'siri');
    assert.equal(peek.title, '已同步 3 条 Siri 待办');
    assert.match(peek.meta, /Siri 导入测试一/);

    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('todo-siri-import').click();
    `);
    await waitForValue(() => mainWindow.webContents.executeJavaScript(`
      document.getElementById('siri-import-dialog').hidden === false
    `));
    await mainWindow.webContents.executeJavaScript(`
      document.getElementById('siri-import-form').requestSubmit();
    `);
    await new Promise((resolve) => setTimeout(resolve, 250));
    const count = await mainWindow.webContents.executeJavaScript(`
      JSON.parse(localStorage.getItem('notch-todo-data')).tasks
        .filter((task) => [
          'x-apple-reminder://siri-import-test-1',
          'x-apple-reminder://siri-import-test-2',
          'x-apple-reminder://siri-import-test-3',
        ].includes(task.externalId)).length
    `);
    assert.equal(count, 3);
    console.log('Siri import main integration checks passed');
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    console.error(error);
    clearTimeout(timeout);
    app.exit(1);
  }
});

require('../main.js');
