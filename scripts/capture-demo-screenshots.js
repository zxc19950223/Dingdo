'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');
const { createDemoTodoData } = require('../docs/demo/demo-profile');

const root = path.join(__dirname, '..');
const outputDirectory = path.join(root, 'docs', 'screenshots');
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'dingdo-demo-screenshots-'));

app.commandLine.appendSwitch('user-data-dir', profile);
if (process.platform === 'darwin') app.commandLine.appendSwitch('use-mock-keychain');
fs.mkdirSync(profile, { recursive: true });
fs.writeFileSync(path.join(profile, 'workspace.json'), JSON.stringify({
  version: 1,
  localStorage: {
    'notch-todo-data': JSON.stringify(createDemoTodoData()),
    'notch-appearance-v1': JSON.stringify({
      theme: 'midnight',
      accent: 'blue',
      density: 'comfortable',
      fontSize: 'standard',
      reduceMotion: true,
      browserMedia: false,
      showProgress: true,
      showVolume: true,
    }),
  },
}, null, 2));

function delay(milliseconds) {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}

async function waitForValue(factory, timeoutMs = 20000) {
  const startedAt = Date.now();
  while (Date.now() - startedAt <= timeoutMs) {
    const value = await factory();
    if (value) return value;
    await delay(50);
  }
  throw new Error('Demo screenshot timeout');
}

async function capture(window, name) {
  await delay(250);
  const image = await window.webContents.capturePage();
  fs.writeFileSync(path.join(outputDirectory, name), image.toPNG());
  console.log(`Captured docs/screenshots/${name}`);
}

app.whenReady().then(async () => {
  fs.mkdirSync(outputDirectory, { recursive: true });
  const window = await waitForValue(() => (
    BrowserWindow.getAllWindows().find((candidate) => (
      !candidate.isDestroyed()
      && candidate.webContents.getURL().endsWith('/renderer/index.html')
    ))
  ));
  await waitForValue(() => window.webContents.executeJavaScript(`Boolean(window.NotchTodo && window.NotchHome)`));
  await window.webContents.executeJavaScript(`document.getElementById('notch').click()`);
  await waitForValue(() => window.webContents.executeJavaScript(`document.getElementById('app').classList.contains('expanded')`));

  await window.webContents.executeJavaScript(`
    document.getElementById('tab-button-home').click();
  `);
  await delay(350);
  await capture(window, 'home.png');

  await window.webContents.executeJavaScript(`
    document.getElementById('tab-button-todo').click();
    document.querySelector('[data-todo-list-view="all"]')?.click();
  `);
  await delay(300);
  await capture(window, 'todo-dark.png');

  await window.webContents.executeJavaScript(`
    window.NotchTodo.openTask('demo-project-plan');
  `);
  await delay(250);
  await capture(window, 'task-detail.png');

  await window.webContents.executeJavaScript(`
    document.querySelector('[data-todo-view="calendar"]').click();
  `);
  await delay(250);
  await capture(window, 'calendar.png');

  await window.webContents.executeJavaScript(`
    window.NotchTheme.update({ theme: 'frost' });
    document.getElementById('tab-button-todo').click();
    document.querySelector('[data-todo-list-view="all"]')?.click();
  `);
  await delay(300);
  await capture(window, 'todo-light.png');

  await window.webContents.executeJavaScript(`
    window.NotchTheme.update({ theme: 'midnight' });
    document.getElementById('tab-button-settings').click();
  `);
  await delay(300);
  await capture(window, 'settings.png');

  window.destroy();
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  app.quit();
}).catch((error) => {
  console.error(error);
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 10, retryDelay: 100 });
  app.exit(1);
});

require('../main.js');
