const assert = require('node:assert/strict');
const path = require('node:path');
const { app, BrowserWindow, ipcMain } = require('electron');

app.setPath('userData', process.env.TODO_TEST_USER_DATA);

async function main() {
  await app.whenReady();
  let resolvedPayload = null;
  let abortedPayload = null;
  let failResolve = false;
  ipcMain.handle('strong-reminder:resolve', async (event, payload) => {
    if (failResolve) return { ok: false, error: 'test_failure' };
    resolvedPayload = payload;
    return { ok: true };
  });
  ipcMain.handle('strong-reminder:abort', async (event, payload) => {
    abortedPayload = payload;
    return { ok: true };
  });

  const window = new BrowserWindow({
    width: 900,
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
  const mainWindow = new BrowserWindow({
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
    await window.loadFile(path.join(__dirname, '..', 'renderer', 'strong-reminder.html'));
    window.show();
    window.webContents.send('strong-reminder:show', {
      eventId: 'strong-test',
      taskId: 'task-strong',
      reminderId: 'reminder-strong',
      title: '必须处理的待办',
      detail: '强提醒测试',
      deadline: '2026-09-18T09:00:00.000Z',
      questions: ['真的完成了吗？', '下一次强提醒怎么处理？'],
    });

    const completedBranch = await window.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (predicate) => {
          const deadline = performance.now() + 5000;
          while (!predicate() && performance.now() < deadline) await sleep(10);
          return predicate();
        };
        await waitFor(() => document.getElementById('strong-task-title').textContent === '必须处理的待办');
        const initial = {
          title: document.getElementById('strong-task-title').textContent,
          question: document.getElementById('strong-question-text').textContent,
          nextDisabled: document.getElementById('strong-next').disabled,
        };
        document.querySelector('[data-answer="completed"]').click();
        const openedImmediately = !document.getElementById('strong-complete-confirm').hidden;
        const confirmInitiallyDisabled = document.getElementById('strong-complete-confirm-button').disabled;
        await sleep(550);
        const confirmEnabledAfterDelay = !document.getElementById('strong-complete-confirm-button').disabled;
        document.getElementById('strong-complete-cancel').click();
        await waitFor(() => document.getElementById('strong-complete-confirm').hidden);
        const cancelled = {
          confirmHidden: document.getElementById('strong-complete-confirm').hidden,
          nextDisabled: document.getElementById('strong-next').disabled,
          question: document.getElementById('strong-question-text').textContent,
        };
        document.querySelector('[data-answer="completed"]').click();
        await sleep(550);
        document.getElementById('strong-complete-confirm-button').click();
        await sleep(30);
        return {
          initial,
          openedImmediately,
          confirmInitiallyDisabled,
          confirmEnabledAfterDelay,
          cancelled,
        };
      })()
    `);

    const completedDeadline = Date.now() + 5000;
    while (!resolvedPayload && Date.now() < completedDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }

    assert.deepEqual(completedBranch, {
      initial: {
        title: '必须处理的待办',
        question: '真的完成了吗？',
        nextDisabled: true,
      },
      openedImmediately: true,
      confirmInitiallyDisabled: true,
      confirmEnabledAfterDelay: true,
      cancelled: {
        confirmHidden: true,
        nextDisabled: true,
        question: '真的完成了吗？',
      },
    });
    assert.deepEqual(resolvedPayload, {
      eventId: 'strong-test',
      answers: ['completed', 'stop'],
      completionConfirmed: true,
      strongReminderAt: '',
    });

    resolvedPayload = null;
    window.webContents.send('strong-reminder:show', {
      eventId: 'strong-incomplete',
      taskId: 'task-strong',
      reminderId: 'reminder-strong-2',
      title: '必须处理的待办',
      detail: '未完成分支测试',
      deadline: '2026-09-18T09:00:00.000Z',
      questions: ['真的完成了吗？', '下一次强提醒怎么处理？'],
    });
    const incompleteBranch = await window.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (predicate) => {
          const deadline = performance.now() + 5000;
          while (!predicate() && performance.now() < deadline) await sleep(10);
          return predicate();
        };
        await waitFor(() => document.getElementById('strong-step-label').textContent === '问题 1 / 2');
        document.querySelector('[data-answer="not_completed"]').click();
        document.getElementById('strong-next').click();
        await waitFor(() => document.getElementById('strong-step-label').textContent === '问题 2 / 2');
        const secondQuestion = document.getElementById('strong-question-text').textContent;
        document.querySelector('[data-answer="custom"]').click();
        document.getElementById('strong-deadline').value = '2026-09-18T10:00';
        document.getElementById('strong-deadline').dispatchEvent(new Event('input', { bubbles: true }));
        document.getElementById('strong-next').click();
        await sleep(30);
        return { secondQuestion };
      })()
    `);
    const incompleteDeadline = Date.now() + 5000;
    while ((!resolvedPayload || resolvedPayload.eventId !== 'strong-incomplete') && Date.now() < incompleteDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.deepEqual(incompleteBranch, {
      secondQuestion: '下一次强提醒怎么处理？',
    });
    assert.deepEqual(resolvedPayload, {
      eventId: 'strong-incomplete',
      answers: ['not_completed', 'custom'],
      completionConfirmed: false,
      strongReminderAt: new Date('2026-09-18T10:00').toISOString(),
    });

    resolvedPayload = null;
    window.webContents.send('strong-reminder:show', {
      eventId: 'strong-linked-extend',
      taskId: 'task-strong',
      reminderId: 'reminder-strong-linked',
      title: '联动顺延测试',
      detail: '强提醒时间原本与截止时间一致',
      deadline: '2026-09-18T01:00:00.000Z',
      linked: true,
      questions: ['真的完成了吗？', '下一次强提醒怎么处理？'],
    });
    const linkedExtend = await window.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (predicate) => {
          const deadline = performance.now() + 5000;
          while (!predicate() && performance.now() < deadline) await sleep(10);
          return predicate();
        };
        await waitFor(() => document.getElementById('strong-task-title').textContent === '联动顺延测试');
        document.querySelector('[data-answer="not_completed"]').click();
        document.getElementById('strong-next').click();
        await waitFor(() => document.getElementById('strong-step-label').textContent === '问题 2 / 2');
        document.querySelector('[data-answer="custom"]').click();
        document.getElementById('strong-deadline-toggle').click();
        await waitFor(() => !document.getElementById('strong-date-picker').hidden);
        await sleep(30);
        const pickerOpened = !document.getElementById('strong-date-picker').hidden;
        const pickerOpensUp = document.getElementById('strong-date-picker').classList.contains('opens-up');
        document.querySelector('[data-strong-picker-day="1"]').click();
        await sleep(20);
        const pickerStaysOpenAfterDate = !document.getElementById('strong-date-picker').hidden;
        document.getElementById('strong-picker-done').click();
        const pickerClosed = document.getElementById('strong-date-picker').hidden;
        document.getElementById('strong-deadline').value = '2026-09-18T10:00';
        document.getElementById('strong-deadline').dispatchEvent(new Event('input', { bubbles: true }));
        const deadlineValue = document.getElementById('strong-deadline').value;
        document.getElementById('strong-next').click();
        await sleep(30);
        return {
          customLabel: document.querySelector('[data-answer="custom"]').textContent,
          pickerOpened,
          pickerOpensUp,
          pickerStaysOpenAfterDate,
          pickerClosed,
          deadlineValue,
        };
      })()
    `);
    const linkedExtendDeadline = Date.now() + 5000;
    while ((!resolvedPayload || resolvedPayload.eventId !== 'strong-linked-extend') && Date.now() < linkedExtendDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.match(linkedExtend.customLabel, /同时顺延截止时间/);
    assert.equal(linkedExtend.pickerOpened, true);
    assert.equal(linkedExtend.pickerOpensUp, true);
    assert.equal(linkedExtend.pickerStaysOpenAfterDate, true);
    assert.equal(linkedExtend.pickerClosed, true);
    assert.equal(linkedExtend.deadlineValue, '2026/09/18 10:00');
    assert.deepEqual(resolvedPayload, {
      eventId: 'strong-linked-extend',
      answers: ['not_completed', 'custom_extend'],
      completionConfirmed: false,
      strongReminderAt: new Date('2026-09-18T10:00').toISOString(),
    });

    resolvedPayload = null;
    window.webContents.send('strong-reminder:show', {
      eventId: 'strong-independent-extend',
      taskId: 'task-strong',
      reminderId: 'reminder-strong-independent',
      title: '独立顺延测试',
      detail: '必须明确选择顺延',
      deadline: '2026-09-18T01:00:00.000Z',
      linked: false,
      questions: ['真的完成了吗？', '下一次强提醒怎么处理？'],
    });
    const independentExtend = await window.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (predicate) => {
          const deadline = performance.now() + 5000;
          while (!predicate() && performance.now() < deadline) await sleep(10);
          return predicate();
        };
        await waitFor(() => document.getElementById('strong-task-title').textContent === '独立顺延测试');
        document.querySelector('[data-answer="not_completed"]').click();
        document.getElementById('strong-next').click();
        await waitFor(() => document.getElementById('strong-step-label').textContent === '问题 2 / 2');
        document.querySelector('[data-answer="custom"]').click();
        document.getElementById('strong-deadline').value = '2026-09-18T10:00';
        document.getElementById('strong-deadline').dispatchEvent(new Event('input', { bubbles: true }));
        await waitFor(() => Boolean(document.querySelector('[data-answer="custom_extend"]')));
        const optionVisible = Boolean(document.querySelector('[data-answer="custom_extend"]'));
        document.querySelector('[data-answer="custom_extend"]').click();
        document.getElementById('strong-next').click();
        await sleep(30);
        return { optionVisible };
      })()
    `);
    const independentExtendDeadline = Date.now() + 5000;
    while ((!resolvedPayload || resolvedPayload.eventId !== 'strong-independent-extend') && Date.now() < independentExtendDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(independentExtend.optionVisible, true);
    assert.deepEqual(resolvedPayload, {
      eventId: 'strong-independent-extend',
      answers: ['not_completed', 'custom_extend'],
      completionConfirmed: false,
      strongReminderAt: new Date('2026-09-18T10:00').toISOString(),
    });

    failResolve = true;
    window.webContents.send('strong-reminder:show', {
      eventId: 'strong-failure',
      taskId: 'task-strong',
      reminderId: 'reminder-strong-3',
      title: '应急退出测试',
      detail: '保存失败测试',
      deadline: '2026-09-18T09:00:00.000Z',
      questions: ['完成了吗？', '下一次强提醒怎么处理？'],
    });
    const emergencyState = await window.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (predicate) => {
          const deadline = performance.now() + 5000;
          while (!predicate() && performance.now() < deadline) await sleep(10);
          return predicate();
        };
        await waitFor(() => document.getElementById('strong-step-label').textContent === '问题 1 / 2');
        document.querySelector('[data-answer="not_completed"]').click();
        document.getElementById('strong-next').click();
        document.querySelector('[data-answer="stop"]').click();
        document.getElementById('strong-next').click();
        await waitFor(() => !document.getElementById('strong-emergency-exit').hidden);
        const errorVisible = !document.getElementById('strong-error').hidden;
        document.getElementById('strong-emergency-exit').click();
        await sleep(30);
        return { errorVisible };
      })()
    `);
    const abortDeadline = Date.now() + 5000;
    while (!abortedPayload && Date.now() < abortDeadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(emergencyState.errorVisible, true);
    assert.deepEqual(abortedPayload, { eventId: 'strong-failure' });

    await mainWindow.loadFile(path.join(__dirname, '..', 'renderer', 'index.html'));
    await mainWindow.webContents.executeJavaScript(`
      localStorage.setItem('notch-todo-data', JSON.stringify({
        version: 3,
        lists: [{ id: 'inbox', name: '收集箱', parentId: '', order: 0, defaultReminderOffsets: [], defaultSoundId: 'bright', sortMode: 'auto' }],
        tasks: [{
          id: 'task-strong',
          text: '第四题集成测试',
          listId: 'inbox',
          done: false,
          strongReminder: false,
          strongReminderAt: '',
          strongReminderLinked: false,
          deadline: '2026-09-18T09:00:00.000Z',
          reminders: [],
          subtasks: [],
        }, {
          id: 'task-snooze',
          text: '稍后提醒测试',
          listId: 'inbox',
          done: false,
          deadline: '2026-09-18T11:00:00.000Z',
          reminders: [{
            id: 'snooze-source',
            offsetMinutes: 0,
            at: '2026-09-18T11:00:00.000Z',
            firedAt: 0,
            soundId: 'alert',
            strong: false,
          }, {
            id: 'snooze-one-hour',
            offsetMinutes: 60,
            at: '2026-09-18T10:00:00.000Z',
            firedAt: 0,
            soundId: 'alert',
            strong: false,
          }],
          subtasks: [],
        }],
        settings: { missedReminderPolicy: '24h', strongReminderQuestions: [], templates: [], savedFilters: [] },
        reminderHistory: [],
        trash: [],
      }));
    `);
    const reloaded = new Promise((resolve) => mainWindow.webContents.once('did-finish-load', resolve));
    mainWindow.reload();
    await reloaded;
    const setupState = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const waitFor = async (predicate) => {
          const deadline = performance.now() + 3000;
          while (!predicate() && performance.now() < deadline) await sleep(10);
          return predicate();
        };
        const readTask = () => JSON.parse(localStorage.getItem('notch-todo-data'))
          .tasks.find((item) => item.id === 'task-strong');
        const checkbox = document.getElementById('todo-detail-strong-reminder');
        const warning = document.getElementById('strong-reminder-warning');
        const warningStep = document.getElementById('strong-reminder-warning-step');
        const timeStep = document.getElementById('strong-reminder-time-step');
        const warningConfirm = document.getElementById('strong-reminder-warning-confirm');
        const timeConfirm = document.getElementById('strong-reminder-time-confirm');
        const customInput = document.getElementById('strong-reminder-custom-at');
        const picker = document.getElementById('todo-picker');
        window.NotchTodo.openTask('task-strong');

        checkbox.click();
        await waitFor(() => !warning.hidden && !warningStep.hidden);
        const warningOpened = !warning.hidden && !warningStep.hidden;
        const notSavedYet = readTask().strongReminder !== true;
        warningConfirm.click();
        await waitFor(() => !timeStep.hidden);
        const timeStepOpened = !timeStep.hidden;
        document.getElementById('strong-reminder-time-confirm').click();
        await waitFor(() => readTask().strongReminder === true);
        const sameTask = readTask();

        checkbox.click();
        await waitFor(() => readTask().strongReminder === false);
        checkbox.click();
        await waitFor(() => !warning.hidden);
        warningConfirm.click();
        await waitFor(() => !timeStep.hidden);
        document.querySelector('[data-strong-reminder-time="10"]').click();
        timeConfirm.click();
        await waitFor(() => (
          readTask().strongReminder === true
          && readTask().strongReminderLinked === false
        ));
        const tenMinuteTask = readTask();

        checkbox.click();
        await waitFor(() => readTask().strongReminder === false);
        checkbox.click();
        await waitFor(() => !warning.hidden);
        warningConfirm.click();
        await waitFor(() => !timeStep.hidden);
        document.querySelector('[data-strong-reminder-time="custom"]').click();
        customInput.click();
        await waitFor(() => !picker.hidden);
        const pickerOpened = !picker.hidden;
        document.getElementById('todo-picker-done').click();
        await waitFor(() => picker.hidden);
        timeConfirm.click();
        await waitFor(() => (
          readTask().strongReminder === true
          && readTask().strongReminderLinked === false
        ));
        const customTask = readTask();

        checkbox.click();
        await waitFor(() => readTask().strongReminder === false);
        checkbox.click();
        await waitFor(() => !warning.hidden);
        warningConfirm.click();
        await waitFor(() => !timeStep.hidden);
        document.querySelector('[data-strong-reminder-time="custom"]').click();
        const later = new Date(Date.parse(sameTask.deadline) + 10 * 60 * 1000);
        const pad = (value) => String(value).padStart(2, '0');
        customInput.value = [
          later.getFullYear(),
          pad(later.getMonth() + 1),
          pad(later.getDate()),
        ].join('/') + ' ' + [
          pad(later.getHours()),
          pad(later.getMinutes()),
        ].join(':');
        customInput.dispatchEvent(new Event('input', { bubbles: true }));
        timeConfirm.click();
        const invalidBlocked = !document.getElementById('strong-reminder-time-error').hidden
          && readTask().strongReminder !== true;
        document.getElementById('strong-reminder-time-cancel').click();
        return {
          warningOpened,
          notSavedYet,
          timeStepOpened,
          sameAt: sameTask.strongReminderAt,
          sameLinked: sameTask.strongReminderLinked,
          tenMinuteDelta: Date.parse(sameTask.deadline) - Date.parse(tenMinuteTask.strongReminderAt),
          tenMinuteLinked: tenMinuteTask.strongReminderLinked,
          pickerOpened,
          pickerClosed: picker.hidden,
          customAt: customTask.strongReminderAt,
          customLinked: customTask.strongReminderLinked,
          invalidBlocked,
        };
      })()
    `);
    assert.deepEqual(setupState, {
      warningOpened: true,
      notSavedYet: true,
      timeStepOpened: true,
      sameAt: '2026-09-18T09:00:00.000Z',
      sameLinked: true,
      tenMinuteDelta: 10 * 60 * 1000,
      tenMinuteLinked: false,
      pickerOpened: true,
      pickerClosed: true,
      customAt: '2026-09-18T09:00:00.000Z',
      customLinked: false,
      invalidBlocked: true,
    });
    mainWindow.webContents.send('todo:strong-resolved', {
      taskId: 'task-strong',
      answers: ['not_completed', 'custom'],
      strongReminderAt: '2026-09-18T08:30:00.000Z',
    });
    const applied = await mainWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const deadline = performance.now() + 5000;
        const read = () => {
          const task = JSON.parse(localStorage.getItem('notch-todo-data')).tasks.find((item) => item.id === 'task-strong');
          if (task?.reminders?.some((item) => item.at === '2026-09-18T08:30:00.000Z' && item.strong === true)) {
            resolve({
              deadline: task.deadline,
              strongReminder: task.strongReminder,
              reminders: task.reminders.map((item) => ({ at: item.at, strong: item.strong, firedAt: item.firedAt })),
              notes: task.notes,
            });
            return;
          }
          if (performance.now() >= deadline) {
            resolve(null);
            return;
          }
          setTimeout(read, 20);
        };
        read();
      })
    `);
    assert.equal(applied.deadline, '2026-09-18T09:00:00.000Z');
    assert.equal(applied.strongReminder, true);
    assert.deepEqual(applied.reminders.find((item) => item.at === '2026-09-18T08:30:00.000Z'), {
      at: '2026-09-18T08:30:00.000Z',
      strong: true,
      firedAt: 0,
    });
    assert.match(applied.notes, /完成状态：未完成/);
    assert.match(applied.notes, /下一次强提醒/);

    mainWindow.webContents.send('todo:strong-resolved', {
      taskId: 'task-strong',
      answers: ['not_completed', 'custom_extend'],
      strongReminderAt: '2026-09-18T10:30:00.000Z',
      extendDeadline: true,
    });
    const extended = await mainWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const deadline = performance.now() + 5000;
        const read = () => {
          const task = JSON.parse(localStorage.getItem('notch-todo-data')).tasks.find((item) => item.id === 'task-strong');
          if (
            task?.deadline === '2026-09-18T10:30:00.000Z'
            && task?.strongReminderLinked === true
            && task?.reminders?.some((item) => item.at === '2026-09-18T10:30:00.000Z' && item.strong === true)
          ) {
            resolve({
              deadline: task.deadline,
              strongReminderAt: task.strongReminderAt,
              strongReminderLinked: task.strongReminderLinked,
              notes: task.notes,
            });
            return;
          }
          if (performance.now() >= deadline) {
            resolve(null);
            return;
          }
          setTimeout(read, 20);
        };
        read();
      })
    `);
    assert.equal(extended.deadline, '2026-09-18T10:30:00.000Z');
    assert.equal(extended.strongReminderAt, '2026-09-18T10:30:00.000Z');
    assert.equal(extended.strongReminderLinked, true);
    assert.match(extended.notes, /原任务截止时间/);
    assert.match(extended.notes, /新任务截止时间/);
    assert.match(extended.notes, /截止时间变更原因：强提醒顺延/);

    const snoozedAt = new Date(Date.now() - 60 * 60 * 1000).toISOString();
    const nextDailyReviewAt = new Date(Date.parse(snoozedAt) + 24 * 60 * 60 * 1000).toISOString();
    mainWindow.webContents.send('todo:snoozed', {
      taskId: 'task-snooze',
      sourceReminderId: 'snooze-source',
      reminderId: 'snooze-created',
      at: snoozedAt,
      soundId: 'alert',
    });
    const snoozed = await mainWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const deadline = performance.now() + 5000;
        const read = () => {
          const task = JSON.parse(localStorage.getItem('notch-todo-data')).tasks.find((item) => item.id === 'task-snooze');
          if (task?.deadline === '${snoozedAt}') {
            resolve({
              deadline: task.deadline,
              snoozeReminder: task.reminders.find((item) => item.id === 'snooze-created') || null,
              oneHourFiredAt: task.reminders.find((item) => item.id === 'snooze-one-hour')?.firedAt || 0,
            });
            return;
          }
          if (performance.now() >= deadline) {
            resolve(null);
            return;
          }
          setTimeout(read, 20);
        };
        read();
      })
    `);
    assert.equal(snoozed.deadline, snoozedAt);
    assert.equal(snoozed.snoozeReminder?.at, snoozedAt);
    assert.equal(snoozed.snoozeReminder?.offsetMinutes, null);
    assert.equal(snoozed.snoozeReminder?.firedAt, 0);
    assert.ok(snoozed.oneHourFiredAt > 0);

    const dailyReview = await mainWindow.webContents.executeJavaScript(`
      (async () => {
        const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const opened = window.NotchTodo.openDailyReview();
        const deadline = performance.now() + 5000;
        let button = null;
        while (!button && performance.now() < deadline) {
          button = document.querySelector('[data-daily-review-action="tomorrow"][data-task-id="task-snooze"]');
          if (!button) await sleep(10);
        }
        const expandedDeadline = performance.now() + 5000;
        while (
          !document.getElementById('app').classList.contains('expanded')
          && performance.now() < expandedDeadline
        ) {
          await sleep(10);
        }
        const buttonFound = Boolean(button);
        let clickObserved = false;
        button?.addEventListener('click', () => { clickObserved = true; }, { once: true });
        button?.click();
        const readDeadline = performance.now() + 5000;
        while (performance.now() < readDeadline) {
          const task = JSON.parse(localStorage.getItem('notch-todo-data')).tasks.find((item) => item.id === 'task-snooze');
          if (task?.deadline === '${nextDailyReviewAt}') {
            return { opened, buttonFound, clickObserved, deadline: task.deadline };
          }
          await sleep(20);
        }
        return { opened, buttonFound, clickObserved, deadline: '' };
      })()
    `);
    assert.deepEqual(dailyReview, {
      opened: true,
      buttonFound: true,
      clickObserved: true,
      deadline: nextDailyReviewAt,
    });

    mainWindow.webContents.send('todo:strong-resolved', {
      taskId: 'task-strong',
      answers: ['completed', 'stop'],
      completionConfirmed: true,
    });
    const completedApplied = await mainWindow.webContents.executeJavaScript(`
      new Promise((resolve) => {
        const deadline = performance.now() + 5000;
        const read = () => {
          const task = JSON.parse(localStorage.getItem('notch-todo-data')).tasks.find((item) => item.id === 'task-strong');
          if (task?.done === true && task?.strongReminder === false) {
            resolve({
              done: task.done,
              strongReminder: task.strongReminder,
              strongReminders: task.reminders.filter((item) => item.strong === true).length,
              notes: task.notes,
            });
            return;
          }
          if (performance.now() >= deadline) {
            resolve(null);
            return;
          }
          setTimeout(read, 20);
        };
        read();
      })
    `);
    assert.equal(completedApplied.done, true);
    assert.equal(completedApplied.strongReminder, false);
    assert.equal(completedApplied.strongReminders, 0);
    assert.match(completedApplied.notes, /完成状态：已完成/);
    assert.match(completedApplied.notes, /完成确认：已二次确认/);
    assert.match(completedApplied.notes, /后续强提醒：已停止/);
    console.log('Strong reminder renderer checks passed');
  } finally {
    ipcMain.removeHandler('strong-reminder:resolve');
    ipcMain.removeHandler('strong-reminder:abort');
    mainWindow.destroy();
    window.destroy();
  }
}

main().then(() => app.quit(), (error) => {
  console.error(error);
  app.exit(1);
});
