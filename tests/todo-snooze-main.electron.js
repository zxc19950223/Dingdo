const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const profile = process.env.TODO_TEST_USER_DATA;
app.commandLine.appendSwitch('user-data-dir', profile);
if (process.platform === 'darwin') app.commandLine.appendSwitch('use-mock-keychain');

const deadline = new Date(Date.now() - 1000).toISOString();
fs.writeFileSync(path.join(profile, 'workspace.json'), JSON.stringify({
  version: 1,
  localStorage: {},
}));
fs.writeFileSync(path.join(profile, 'app-settings.json'), JSON.stringify({
  todoNotificationDurationSeconds: 0,
}));
const todoData = {
  version: 3,
  lists: [{
    id: 'inbox',
    name: '收集箱',
    parentId: '',
    order: 0,
    defaultReminderOffsets: [],
    defaultSoundId: 'bright',
    sortMode: 'auto',
  }],
  tasks: [{
    id: 'snooze-loop-task',
    text: '稍后提醒循环测试',
    listId: 'inbox',
    done: false,
    deadline,
    remindersInitialized: true,
    reminders: [{
      id: 'snooze-source',
      offsetMinutes: 0,
      at: deadline,
      firedAt: 0,
      soundId: 'alert',
      strong: false,
    }, {
      id: 'snooze-one-hour',
      offsetMinutes: 60,
      at: new Date(Date.parse(deadline) - 60 * 60 * 1000).toISOString(),
      firedAt: 0,
      soundId: 'alert',
      strong: false,
    }],
    subtasks: [],
  }],
  settings: {
    missedReminderPolicy: '24h',
    strongReminderQuestions: [],
    templates: [],
    savedFilters: [],
  },
  reminderHistory: [],
  trash: [],
};

function waitFor(predicate, timeoutMs = 8000) {
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
        reject(new Error('Todo snooze integration timeout'));
      }
    }, 25);
  });
}

async function waitForValue(factory, timeoutMs = 8000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const value = await factory();
    if (value) return value;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  throw new Error('Todo snooze value timeout');
}

function notificationWindow() {
  return BrowserWindow.getAllWindows().find((window) => (
    !window.isDestroyed()
    && window.webContents.getURL().endsWith('/renderer/notification.html')
  ));
}

const timeout = setTimeout(() => {
  console.error('Todo snooze integration timed out');
  app.exit(1);
}, 25000);

app.whenReady().then(async () => {
  let stage = 'startup';
  let mainWindow = null;
  try {
    stage = 'main-window';
    mainWindow = await waitFor(() => (
      BrowserWindow.getAllWindows().find((window) => window.webContents.getURL().endsWith('/renderer/index.html'))
    ));
    await mainWindow.webContents.executeJavaScript(`
      localStorage.setItem('notch-todo-data', ${JSON.stringify(JSON.stringify(todoData))});
    `);
    const reloaded = new Promise((resolve) => mainWindow.webContents.once('did-finish-load', resolve));
    mainWindow.reload();
    await reloaded;
    stage = 'notification-window';
    const notification = await waitFor(() => notificationWindow());
    stage = 'notification-visible';
    await waitForValue(() => notification.webContents.executeJavaScript(`
      document.getElementById('notification-root').hidden === false
    `));
    await new Promise((resolve) => setTimeout(resolve, 1200));
    const persistent = await notification.webContents.executeJavaScript(`
      document.getElementById('notification-root').hidden === false
    `);
    assert.equal(persistent, true);
    const unhandled = await waitForValue(() => mainWindow.webContents.executeJavaScript(`
      JSON.parse(localStorage.getItem('notch-todo-data')).tasks
        .find((task) => task.id === 'snooze-loop-task')?.unhandledReminderAt || ''
    `));
    assert.ok(unhandled);
    await mainWindow.webContents.executeJavaScript(`
      window.NotchTodo.openTask('snooze-loop-task');
    `);
    await waitForValue(() => mainWindow.webContents.executeJavaScript(`
      (() => {
        const task = JSON.parse(localStorage.getItem('notch-todo-data')).tasks
          .find((item) => item.id === 'snooze-loop-task');
        const row = document.querySelector('[data-task-id="snooze-loop-task"]');
        return task?.unhandledReminderAt === '' && row && !row.classList.contains('is-unhandled');
      })()
    `));

    await notification.webContents.executeJavaScript(`
      const select = document.getElementById('notification-snooze-select');
      select.value = '60';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    `);
    const task = await waitForValue(() => mainWindow.webContents.executeJavaScript(`
      (() => {
        const item = JSON.parse(localStorage.getItem('notch-todo-data')).tasks
          .find((task) => task.id === 'snooze-loop-task');
        if (!item || item.deadline === '${deadline}') return null;
        return item;
      })()
    `));
    stage = 'task-updated';
    const snoozeReminder = task.reminders.find((reminder) => reminder.offsetMinutes === null);
    assert.ok(snoozeReminder);
    assert.equal(snoozeReminder.at, task.deadline);
    assert.equal(snoozeReminder.firedAt, 0);
    assert.equal(task.unhandledReminderAt, '');
    assert.equal(task.unhandledReminderId, '');
    assert.ok(task.reminders.find((reminder) => reminder.id === 'snooze-one-hour').firedAt > 0);

    await new Promise((resolve) => setTimeout(resolve, 1200));
    const visibleNotification = notificationWindow();
    if (visibleNotification) {
      const visible = await visibleNotification.webContents.executeJavaScript(`
        document.getElementById('notification-root').hidden === false
      `);
      assert.equal(visible, false);
    }
    console.log('Todo snooze main integration checks passed');
    clearTimeout(timeout);
    app.exit(0);
  } catch (error) {
    const urls = BrowserWindow.getAllWindows().map((window) => window.webContents.getURL() || '[empty]');
    console.error(`Todo snooze integration failed at ${stage}: ${urls.join(', ')}`);
    if (mainWindow && !mainWindow.isDestroyed()) {
      try {
        const state = await mainWindow.webContents.executeJavaScript(`
          ({
            stored: localStorage.getItem('notch-todo-data'),
            window: typeof window.NotchTodo,
          })
        `);
        console.error(JSON.stringify(state));
      } catch (stateError) {
        console.error(stateError);
      }
    }
    console.error(error);
    clearTimeout(timeout);
    app.exit(1);
  }
});

require('../main.js');
