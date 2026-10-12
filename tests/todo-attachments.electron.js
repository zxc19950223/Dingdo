const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

app.setPath('userData', process.env.TODO_TEST_USER_DATA);

async function main() {
  await app.whenReady();
  const window = new BrowserWindow({
    width: 1240,
    height: 700,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, '..', 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  try {
    await window.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    const result = await window.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (predicate) => {
          const deadline = performance.now() + 3000;
          while (!predicate() && performance.now() < deadline) await sleep(10);
          return predicate();
        };
        const task = window.NotchTodo.quickAdd('附件链接测试');
        window.NotchTodo.openTask(task.id);
        document.getElementById('todo-attachment-add-link').click();
        document.getElementById('todo-attachment-link-name').value = '项目主页';
        document.getElementById('todo-attachment-link-url').value = 'https://example.com/docs';
        document.getElementById('todo-attachment-link-submit').click();
        await waitFor(() => {
          const saved = window.NotchTodo.getWorkspace().tasks.find((item) => item.id === task.id);
          return saved?.attachments?.length === 1;
        });
        const added = window.NotchTodo.getWorkspace().tasks.find((item) => item.id === task.id);
        const row = document.querySelector('[data-attachment-id]');
        const addedView = {
          progress: document.getElementById('todo-attachment-progress').textContent,
          name: row?.querySelector('strong')?.textContent || '',
          meta: row?.querySelector('small')?.textContent || '',
          kind: added.attachments[0].kind,
          url: added.attachments[0].url,
        };
        document.querySelector('[data-attachment-action="remove"]').click();
        await waitFor(() => {
          const saved = window.NotchTodo.getWorkspace().tasks.find((item) => item.id === task.id);
          return saved?.attachments?.length === 0;
        });
        const removed = window.NotchTodo.getWorkspace().tasks.find((item) => item.id === task.id);
        return {
          addedView,
          removedCount: removed.attachments.length,
          emptyText: document.querySelector('.todo-attachment-empty')?.textContent || '',
        };
      })()
    `);

    assert.deepEqual(result.addedView, {
      progress: '1 项',
      name: '项目主页',
      meta: 'example.com',
      kind: 'link',
      url: 'https://example.com/docs',
    });
    assert.equal(result.removedCount, 0);
    assert.match(result.emptyText, /还没有附件或链接/);
    console.log('Todo attachment link checks passed');
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

main().then(() => app.quit()).catch((error) => {
  console.error(error);
  app.exit(1);
});
