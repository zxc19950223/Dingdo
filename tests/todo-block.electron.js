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
        const longTitle = '这是一个用于验证待办标题必须完整显示、不能被省略号截断的较长任务名称';
        const task = window.NotchTodo.quickAdd(longTitle);
        if (!task) return { error: 'task_not_created' };
        window.NotchTodo.openTask(task.id);
        const titleElement = document.querySelector('[data-task-id="' + task.id + '"] .todo-task-title');
        const titleCheck = {
          full: titleElement?.textContent === longTitle,
          whiteSpace: titleElement ? getComputedStyle(titleElement).whiteSpace : '',
        };
        const state = document.getElementById('todo-detail-state');
        state.value = 'blocked';
        state.dispatchEvent(new Event('change', { bubbles: true }));
        await waitFor(() => !document.getElementById('todo-block-dialog').hidden);
        document.querySelector('[data-block-reason="waiting"]').click();
        document.getElementById('todo-block-reason').value = '等待客户签字';
        document.getElementById('todo-block-next-action').value = '明天联系客户';
        document.getElementById('todo-block-form').requestSubmit();
        await waitFor(() => {
          const saved = JSON.parse(localStorage.getItem('notch-todo-data')).tasks.find((item) => item.id === task.id);
          return saved?.status === 'blocked' && saved?.blockReason === '等待客户签字';
        });
        const blocked = JSON.parse(localStorage.getItem('notch-todo-data')).tasks.find((item) => item.id === task.id);
        document.getElementById('todo-block-clear').click();
        await waitFor(() => {
          const saved = JSON.parse(localStorage.getItem('notch-todo-data')).tasks.find((item) => item.id === task.id);
          return saved?.status === 'todo';
        });
        const resumed = JSON.parse(localStorage.getItem('notch-todo-data')).tasks.find((item) => item.id === task.id);
        document.getElementById('todo-detail-export-report').click();
        await waitFor(() => !document.getElementById('todo-export-dialog').hidden);
        const exportOpened = !document.getElementById('todo-export-dialog').hidden;
        const exportScope = document.getElementById('todo-export-scope').value;
        const exportNote = document.getElementById('todo-export-note').textContent;
        return {
          blocked: {
            status: blocked.status,
            reasonType: blocked.blockReasonType,
            reason: blocked.blockReason,
            nextAction: blocked.nextAction,
          },
          resumed: {
            status: resumed.status,
            reasonType: resumed.blockReasonType,
            reason: resumed.blockReason,
            nextAction: resumed.nextAction,
          },
          exportOpened,
          exportScope,
          exportNote,
          titleCheck,
        };
      })()
    `);
    assert.deepEqual(result, {
      blocked: {
        status: 'blocked',
        reasonType: 'waiting',
        reason: '等待客户签字',
        nextAction: '明天联系客户',
      },
      resumed: {
        status: 'todo',
        reasonType: '',
        reason: '',
        nextAction: '',
      },
      exportOpened: true,
      exportScope: 'task',
      exportNote: '将导出 1 条待办，格式为 PDF。',
      titleCheck: {
        full: true,
        whiteSpace: 'normal',
      },
    });
    console.log('Todo blocked reason UI checks passed');
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

main().then(() => app.quit()).catch((error) => {
  console.error(error);
  app.exit(1);
});
