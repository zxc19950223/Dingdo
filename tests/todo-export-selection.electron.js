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
        ['导出任务一', '导出任务二', '导出任务三', '导出任务四']
          .forEach((title) => window.NotchTodo.quickAdd(title));
        window.NotchTodo.selectView('all');
        document.getElementById('todo-export-report').click();
        await waitFor(() => !document.getElementById('todo-export-dialog').hidden);
        const scope = document.getElementById('todo-export-scope');
        const count = document.getElementById('todo-export-selection-count');
        const note = document.getElementById('todo-export-note');
        const rows = [...document.querySelectorAll('[data-export-task-id]')];
        const actionButtons = [...document.querySelectorAll('[data-export-selection-action]')];
        const actionTops = actionButtons.map((button) => Math.round(button.getBoundingClientRect().top));
        const initial = {
          scope: scope.value,
          count: count.textContent,
          note: note.textContent,
          rows: rows.length,
          actionDirection: getComputedStyle(actionButtons[0].parentElement).flexDirection,
          actionSameRow: new Set(actionTops).size === 1,
        };
        document.querySelector('[data-export-selection-action="none"]').click();
        const afterNone = {
          count: count.textContent,
          note: note.textContent,
        };
        document.querySelector('[data-export-task-id]').click();
        const remaining = [...document.querySelectorAll('[data-export-task-id]:not(:checked)')];
        remaining[0].click();
        await sleep(20);
        const selectedRows = [...document.querySelectorAll('[data-export-task-id]:checked')];
        const afterSelection = {
          count: count.textContent,
          note: note.textContent,
          selected: selectedRows.length,
          titles: selectedRows
            .map((input) => input.closest('.todo-export-task-row')?.querySelector('strong')?.textContent || '')
            .sort(),
        };
        document.getElementById('todo-export-cancel-button').click();
        return { initial, afterNone, afterSelection };
      })()
    `);

    assert.deepEqual(result.initial, {
      scope: 'filter',
      count: '已选 4 / 4',
      note: '将导出 4 条待办，格式为 PDF。',
      rows: 4,
      actionDirection: 'row',
      actionSameRow: true,
    });
    assert.deepEqual(result.afterNone, {
      count: '已选 0 / 4',
      note: '当前范围内没有可导出的待办。',
    });
    assert.deepEqual(result.afterSelection, {
      count: '已选 2 / 4',
      note: '将导出 2 条待办，格式为 PDF。',
      selected: 2,
      titles: ['导出任务一', '导出任务二'],
    });
    console.log('Todo export selection checks passed');
  } finally {
    if (!window.isDestroyed()) window.destroy();
  }
}

main().then(() => app.quit()).catch((error) => {
  console.error(error);
  app.exit(1);
});
