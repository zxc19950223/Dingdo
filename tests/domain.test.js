const test = require('node:test');
const assert = require('node:assert/strict');

const domain = require('../renderer/domain');
const {
  normalizeHttpUrl,
  classifyLink,
  addLinkToGroups,
  renameGroup,
  createCommand,
  createRecording,
  removeRecordingState,
  calculateRecordingDuration,
  completionMatchesWindow,
  deriveWindowDisplayName,
  numberWindowLabels,
  createTodo,
  updateTodo,
  createTodoList,
  createDetailedTodo,
  updateDetailedTodo,
  normalizeTodoWorkspace,
  normalizeTodoReminderOffsets,
  normalizeTodoRecurrence,
  nextTodoDeadline,
  normalizeTodoSettings,
  normalizeStrongReminderQuestions,
  normalizeDailyReviewSettings,
  normalizeSiriImportSettings,
  normalizeTodoActivity,
  DEFAULT_STRONG_REMINDER_QUESTIONS,
  createNextTodoOccurrence,
  todoListDescendantIds,
  sortDetailedTodos,
  sortTodoTasksForList,
  reorderTodoTasks,
  filterTodoTasks,
  summarizeTodoViewCounts,
  parseTodoQuickInput,
  todoChecklistProgress,
  currentMonthDeadline,
  calendarDeadline,
  shiftCalendarMonth,
  defaultTodoDeadline,
  normalizeTodoCategoryNames,
  normalizeHomeWidgetSizes,
  packHomeWidgetLayout,
  normalizeHiddenHomeModules,
  updateHomeModuleVisibility,
  resolveHomeWidgetLayout,
  validateHomeWidgetLayout,
  layoutVariantForPlacement,
  calculateAudioLevel,
  normalizeHomeLayout,
  swapHomeLayoutSlots,
  resampleFloat32ToPcm16,
  shouldTogglePanelForSpace,
  todoTimeBattery,
  updateRangeSelection,
  sortTodosForDisplay,
  preferredLinkGroupId,
  moveLinkToGroup,
  moveLinkToPosition,
  filterCredentials,
  credentialRowAction,
  visiblePanelTabs,
  resolveDefaultPanelTab,
  settingsSummary,
  normalizeNoteArchive,
  filterNotes,
  updateNoteInArchive,
  updateNoteTitle,
  applyGeneratedNoteTitle,
  apiCredentialStatuses,
  prependClipboardHistory,
  createExclusiveAsyncTask,
} = domain;

const HOME_MODULES = ['music', 'pomodoro', 'recorder', 'windows', 'mirror', 'note', 'commands'];

test('an exclusive async task coalesces repeated starts until the first attempt settles', async () => {
  let release;
  let attempts = 0;
  const pendingStates = [];
  const task = createExclusiveAsyncTask((pending) => pendingStates.push(pending));
  const work = () => {
    attempts += 1;
    return new Promise((resolve) => { release = resolve; });
  };

  const first = task.run(work);
  const second = task.run(work);

  assert.equal(task.isPending(), true);
  assert.strictEqual(second, first);
  assert.equal(attempts, 1);
  assert.deepEqual(pendingStates, [true]);

  release('started');
  assert.equal(await first, 'started');
  assert.equal(task.isPending(), false);
  assert.deepEqual(pendingStates, [true, false]);

  assert.equal(await task.run(async () => {
    attempts += 1;
    return 'started-again';
  }), 'started-again');
  assert.equal(attempts, 2);
});

function assertExactHomeCover(layout, expectedIds) {
  assert.ok(layout);
  assert.equal(validateHomeWidgetLayout(layout, expectedIds, 12, 4), true);
  assert.deepEqual(Object.keys(layout.placements).sort(), [...expectedIds].sort());
  const cells = Array(48).fill(0);
  Object.entries(layout.placements).forEach(([id, item]) => {
    assert.ok(Number.isInteger(item.column) && item.column >= 0, `${id} has an invalid column`);
    assert.ok(Number.isInteger(item.row) && item.row >= 0, `${id} has an invalid row`);
    assert.ok(Number.isInteger(item.width) && item.width > 0, `${id} has an invalid width`);
    assert.ok(Number.isInteger(item.height) && item.height > 0, `${id} has an invalid height`);
    assert.ok(item.column + item.width <= 12, `${id} exceeds the grid width`);
    assert.ok(item.row + item.height <= 4, `${id} exceeds the grid height`);
    for (let row = item.row; row < item.row + item.height; row += 1) {
      for (let column = item.column; column < item.column + item.width; column += 1) {
        cells[row * 12 + column] += 1;
      }
    }
  });
  assert.deepEqual(cells, Array(48).fill(1));
}

test('clipboard history preserves repeated copies of identical text', () => {
  const previous = [{ id: 'first', type: 'text', text: '同一段内容', timestamp: 100 }];
  const next = { id: 'second', type: 'text', text: '同一段内容', timestamp: 200 };
  const result = prependClipboardHistory(previous, next, 100);

  assert.deepEqual(result.history.map((entry) => entry.id), ['second', 'first']);
  assert.deepEqual(result.evicted, []);
});

test('clipboard history evicts only entries beyond its capacity', () => {
  const previous = [
    { id: 'first', type: 'text', text: 'A', timestamp: 100 },
    { id: 'older-image', type: 'image', imagePath: '/tmp/old.png', timestamp: 50 },
  ];
  const result = prependClipboardHistory(
    previous,
    { id: 'new', type: 'text', text: 'A', timestamp: 200 },
    2
  );

  assert.deepEqual(result.history.map((entry) => entry.id), ['new', 'first']);
  assert.deepEqual(result.evicted.map((entry) => entry.id), ['older-image']);
});

test('normalizeHttpUrl adds https and removes URL credentials', () => {
  assert.equal(normalizeHttpUrl(' example.com/docs '), 'https://example.com/docs');
  assert.equal(normalizeHttpUrl('https://user:secret@example.com/a'), 'https://example.com/a');
});

test('normalizeHttpUrl rejects non-web and local URLs', () => {
  assert.equal(normalizeHttpUrl('javascript:alert(1)'), null);
  assert.equal(normalizeHttpUrl('file:///tmp/a'), null);
  assert.equal(normalizeHttpUrl('http://localhost:3000'), null);
  assert.equal(normalizeHttpUrl('http://127.0.0.1/private'), null);
});

test('classifyLink maps familiar services and falls back to 其他', () => {
  assert.equal(classifyLink('https://github.com/openai', 'OpenAI repository'), '开发');
  assert.equal(classifyLink('https://www.feishu.cn/', '飞书'), '工作');
  assert.equal(classifyLink('https://www.bilibili.com/video/1', '视频'), '影音');
  assert.equal(classifyLink('https://example.com/', 'Example Domain'), '其他');
});

test('addLinkToGroups reuses a matching group and creates a missing group', () => {
  const initial = [{ id: 'g1', name: '开发', collapsed: false, links: [] }];
  const first = addLinkToGroups(initial, {
    id: 'l1',
    url: 'https://github.com/',
    title: 'GitHub',
  }, '开发');
  assert.equal(first.length, 1);
  assert.deepEqual(first[0].links.map((link) => link.id), ['l1']);

  const second = addLinkToGroups(first, {
    id: 'l2',
    url: 'https://example.com/',
    title: 'Example',
  }, '其他');
  assert.equal(second.length, 2);
  assert.equal(second[1].name, '其他');
  assert.equal(second[1].links[0].id, 'l2');
});

test('same-site links reuse an existing group before automatic classification', () => {
  const groups = [
    { id: 'product', name: 'Lollipop', links: [{ id: 'home', url: 'https://lollipop.plus/' }] },
    { id: 'work', name: '工作', links: [{ id: 'docs', url: 'https://docs.example.com/' }] },
  ];
  assert.equal(preferredLinkGroupId(groups, 'https://docs.lollipop.plus/guide'), 'product');
  assert.equal(preferredLinkGroupId(groups, 'https://news.example.com/'), 'work');
  assert.equal(preferredLinkGroupId(groups, 'https://openai.com/'), '');
});

test('same-site grouping respects common multi-part and hosted public suffixes', () => {
  const groups = [
    { id: 'uk', name: '英国站', links: [{ id: 'uk-docs', url: 'https://docs.example.co.uk/' }] },
    { id: 'alice', name: 'Alice', links: [{ id: 'alice-home', url: 'https://alice.github.io/' }] },
  ];
  assert.equal(preferredLinkGroupId(groups, 'https://news.example.co.uk/'), 'uk');
  assert.equal(preferredLinkGroupId(groups, 'https://bob.github.io/'), '');
});

test('moving a link changes only its group and keeps an emptied source group available', () => {
  const groups = [
    { id: 'source', name: '来源', collapsed: false, links: [{ id: 'move-me', url: 'https://example.com/' }] },
    { id: 'target', name: '目标', collapsed: true, links: [{ id: 'stay', url: 'https://openai.com/' }] },
  ];
  const moved = moveLinkToGroup(groups, 'move-me', 'target');
  assert.deepEqual(moved.map((group) => [group.id, group.links.map((link) => link.id)]), [
    ['source', []],
    ['target', ['stay', 'move-me']],
  ]);
  assert.equal(groups[0].links.length, 1);
});

test('moveLinkToPosition reorders links inside one group in both directions', () => {
  const groups = [{ id: 'g1', name: '开发', collapsed: false, links: [
    { id: 'a', url: 'https://a.example.com/' },
    { id: 'b', url: 'https://b.example.com/' },
    { id: 'c', url: 'https://c.example.com/' },
  ] }];
  const order = (result) => result[0].links.map((link) => link.id);

  // 落点下标按「移动前」的行序算：拖 a 到 c 之后 = 目标下标 3。
  // 同组要先摘后插，若不把下标减一就会多跳一格，这里正是那个边界。
  assert.deepEqual(order(moveLinkToPosition(groups, 'a', 'g1', 3)), ['b', 'c', 'a']);
  // 往上拖不需要修正下标。
  assert.deepEqual(order(moveLinkToPosition(groups, 'c', 'g1', 0)), ['c', 'a', 'b']);
  // 拖到 c 之前 = 下标 2，修正后落在 b 与 c 之间。
  assert.deepEqual(order(moveLinkToPosition(groups, 'a', 'g1', 2)), ['b', 'a', 'c']);
  // 拖回原位视为无变化。
  assert.deepEqual(order(moveLinkToPosition(groups, 'b', 'g1', 1)), ['a', 'b', 'c']);
  // 原数组不能被改动，渲染层靠这一点判断顺序有没有真的变。
  assert.deepEqual(order(groups), ['a', 'b', 'c']);
});

test('moveLinkToPosition inserts at an exact slot when crossing groups', () => {
  const groups = [
    { id: 'source', name: '来源', collapsed: false, links: [{ id: 'x', url: 'https://x.example.com/' }] },
    { id: 'target', name: '目标', collapsed: false, links: [
      { id: 'p', url: 'https://p.example.com/' },
      { id: 'q', url: 'https://q.example.com/' },
    ] },
  ];
  const layout = (result) => result.map((group) => [group.id, group.links.map((link) => link.id)]);

  assert.deepEqual(layout(moveLinkToPosition(groups, 'x', 'target', 1)),
    [['source', []], ['target', ['p', 'x', 'q']]]);
  // 落在分组空白或折叠标题上时没有具体行，index 为 null 表示追加到末尾。
  assert.deepEqual(layout(moveLinkToPosition(groups, 'x', 'target', null)),
    [['source', []], ['target', ['p', 'q', 'x']]]);
  // 越界下标要被夹住，不能凭空造出空洞。
  assert.deepEqual(layout(moveLinkToPosition(groups, 'x', 'target', 99)),
    [['source', []], ['target', ['p', 'q', 'x']]]);
  // 未知链接或未知分组一律原样返回。
  assert.deepEqual(layout(moveLinkToPosition(groups, 'nope', 'target', 0)), layout(groups));
  assert.deepEqual(layout(moveLinkToPosition(groups, 'x', 'nope', 0)), layout(groups));
});

test('renameGroup trims names but never creates an empty name', () => {
  const groups = [{ id: 'g1', name: '开发', collapsed: false, links: [] }];
  assert.equal(renameGroup(groups, 'g1', '  资料  ')[0].name, '资料');
  assert.equal(renameGroup(groups, 'g1', '   ')[0].name, '开发');
});

test('createCommand and createRecording normalize user-authored metadata', () => {
  assert.deepEqual(createCommand('  npm test  ', 'c1', 100), {
    id: 'c1',
    text: 'npm test',
    createdAt: 100,
  });
  assert.equal(createCommand('   ', 'c2', 100), null);
  const recording = createRecording({
    id: 'r1',
    createdAt: 200,
    durationMs: 1234.8,
    transcript: '  第一段录音  ',
    audioPath: '/tmp/r1.webm',
    mimeType: 'audio/webm',
  });
  assert.equal(recording.id, 'r1');
  assert.equal(recording.transcript, '第一段录音');
  assert.notEqual(recording.title, recording.transcript);
  assert.equal(recording.category, '未分类');
});

test('single recording deletion removes only its row and keeps a valid active recording', () => {
  const recordings = [
    { id: 'first', title: '第一条' },
    { id: 'second', title: '第二条' },
    { id: 'third', title: '第三条' },
  ];
  assert.deepEqual(removeRecordingState(recordings, 'second', ['first', 'second'], 'second'), {
    recordings: [recordings[0], recordings[2]],
    selection: ['first'],
    selectedId: 'third',
  });
  assert.deepEqual(removeRecordingState(recordings, 'third', [], 'first'), {
    recordings: [recordings[0], recordings[1]],
    selection: [],
    selectedId: 'first',
  });
});

test('completionMatchesWindow distinguishes projects across VS Code windows', () => {
  const completion = { project: '灵动岛', title: '链接页已完成' };
  assert.equal(completionMatchesWindow(completion, {
    appName: 'Visual Studio Code',
    title: '灵动岛 — main.js — Visual Studio Code',
  }), true);
  assert.equal(completionMatchesWindow(completion, {
    appName: 'Visual Studio Code',
    title: 'website — page.tsx — Visual Studio Code',
  }), false);
});

test('calculateRecordingDuration does not double subtract an active pause', () => {
  assert.equal(calculateRecordingDuration({
    startedAt: 1000,
    status: 'recording',
    pausedAt: 0,
    pausedTotalMs: 2000,
    now: 11000,
  }), 8000);
  assert.equal(calculateRecordingDuration({
    startedAt: 1000,
    status: 'paused',
    pausedAt: 6000,
    pausedTotalMs: 0,
    now: 8000,
  }), 5000);
});

test('window labels expose VS Code workspace names instead of app sequence numbers', () => {
  assert.deepEqual(numberWindowLabels([
    { appName: 'Code', id: 'a', title: 'main.js — 灵动岛 — Visual Studio Code' },
    { appName: 'WeChat', id: 'b' },
    { appName: 'Code', id: 'c', title: 'Lollipop-Test' },
  ]).map((item) => item.displayName), ['灵动岛', 'WeChat', 'Lollipop-Test']);
});

test('window labels disambiguate duplicate workspace names without losing their identity', () => {
  assert.equal(deriveWindowDisplayName({ appName: 'Cursor', title: 'README.md — CourseKit — Cursor' }), 'CourseKit');
  assert.deepEqual(numberWindowLabels([
    { appName: 'Code', id: 'a', title: '灵动岛' },
    { appName: 'Code', id: 'b', title: '灵动岛' },
  ]).map((item) => item.displayName), ['灵动岛 · 1', '灵动岛 · 2']);
});

test('multiple browser windows use page titles instead of generic app numbers', () => {
  assert.deepEqual(numberWindowLabels([
    { appName: 'Arc', id: 'a', title: '阿里云百炼控制台 — Arc' },
    { appName: 'Arc', id: 'b', title: 'NotchTodo 设计稿 — Arc' },
  ]).map((item) => item.displayName), ['阿里云百炼控制台', 'NotchTodo 设计稿']);
});

test('createTodo requires a valid DDL and preserves reminder metadata', () => {
  assert.equal(createTodo('没有截止时间', '', 't0', 100), null);
  assert.equal(createTodo('日期无效', 'not-a-date', 't0', 100), null);
  assert.deepEqual(createTodo('  发布新版  ', '2026-08-22T10:30:00.000Z', 't1', 100), {
    id: 't1',
    text: '发布新版',
    done: false,
    createdAt: 100,
    deadline: '2026-08-22T10:30:00.000Z',
    remindedAt: 0,
  });
});

test('legacy P0-P3 workspace migrates to hierarchical lists without losing tasks or reminder state', () => {
  const workspace = normalizeTodoWorkspace({
    P0: [{
      id: 'legacy-task',
      text: '迁移旧任务',
      done: false,
      createdAt: 100,
      deadline: '2026-08-22T10:30:00.000Z',
      remindedAt: 200,
    }],
    P1: [],
    P2: [],
    P3: [],
  }, {
    categoryNames: { P0: '课程', P1: '写作', P2: '开发', P3: '日常' },
  });

  assert.equal(workspace.version, 3);
  assert.deepEqual(workspace.lists.map((item) => [item.id, item.name, item.parentId]), [
    ['inbox', '收集箱', ''],
    ['P0', '课程', ''],
    ['P1', '写作', ''],
    ['P2', '开发', ''],
    ['P3', '日常', ''],
  ]);
  assert.equal(workspace.tasks.length, 1);
  assert.equal(workspace.tasks[0].listId, 'P0');
  assert.equal(workspace.tasks[0].text, '迁移旧任务');
  assert.equal(workspace.tasks[0].reminders[0].firedAt, 200);
  assert.equal(workspace.tasks[0].reminders[0].offsetMinutes, 60);
});

test('todo lists allow one sublevel and reject blank or duplicate siblings', () => {
  const root = createTodoList([{ id: 'inbox', name: '收集箱', parentId: '', order: 0 }], '工作', '', 'work', 10);
  assert.deepEqual(root, {
    id: 'work',
    name: '工作',
    parentId: '',
    order: 1,
    createdAt: 10,
    defaultReminderOffsets: [60],
    defaultSoundId: 'bright',
    sortMode: 'auto',
  });
  const child = createTodoList([{ id: 'inbox', name: '收集箱', parentId: '', order: 0 }, root], '产品', 'work', 'product', 20);
  assert.equal(child.parentId, 'work');
  assert.equal(createTodoList([root], '', '', 'blank', 20), null);
  assert.equal(createTodoList([root, child], '产品', 'work', 'duplicate', 20), null);
  assert.equal(createTodoList([root, child], '三级', 'product', 'deep', 20), null);
  assert.deepEqual(todoListDescendantIds([root, child], 'work'), ['work', 'product']);
});

test('todo list reminder defaults normalize offsets and support manual sorting mode', () => {
  assert.deepEqual(normalizeTodoReminderOffsets([60, 10, 60, 0, 20000], []), [10, 60, 20000]);
  const list = createTodoList([], '工作', '', 'work', 1, {
    defaultReminderOffsets: [1440, 60, 60],
    defaultSoundId: 'alert',
    sortMode: 'manual',
  });
  assert.deepEqual(list.defaultReminderOffsets, [60, 1440]);
  assert.equal(list.defaultSoundId, 'alert');
  assert.equal(list.sortMode, 'manual');
});

test('uninitialized tasks inherit their list default reminders during migration', () => {
  const workspace = normalizeTodoWorkspace({
    version: 2,
    lists: [{
      id: 'work',
      name: '工作',
      parentId: '',
      order: 0,
      defaultReminderOffsets: [10, 1440],
      defaultSoundId: 'alert',
      sortMode: 'auto',
    }],
    tasks: [{
      id: 'old-task',
      text: '旧任务',
      listId: 'work',
      deadline: '2026-09-18T08:00:00.000Z',
      reminders: [],
      createdAt: 1,
    }],
  });
  const task = workspace.tasks[0];
  assert.equal(task.remindersInitialized, true);
  assert.deepEqual(task.reminders.map((item) => item.offsetMinutes), [10, 1440]);
  assert.equal(task.reminders[0].soundId, 'alert');
  assert.equal(task.reminders[0].at, '2026-09-18T07:50:00.000Z');
});

test('detailed todos preserve notes, priority, reminders, subtasks, and completion metadata', () => {
  const lists = [
    { id: 'inbox', name: '收集箱', parentId: '', order: 0 },
    { id: 'work', name: '工作', parentId: '', order: 1 },
  ];
  const created = createDetailedTodo({
    text: '发布 1.2 版本',
    listId: 'work',
    priority: 'urgent',
    deadline: '2026-08-22T10:30:00.000Z',
    notes: '检查安装包',
    reminders: [
      { id: 'r1', offsetMinutes: 60, soundId: 'alert' },
      { id: 'r2', offsetMinutes: 1440, soundId: 'soft' },
    ],
    subtasks: [
      { id: 's1', text: '写更新日志', done: true },
      { id: 's2', text: '发布 Release', done: false },
    ],
  }, lists, 'todo-1', 100);

  assert.equal(created.listId, 'work');
  assert.equal(created.priority, 'urgent');
  assert.equal(created.reminders.length, 2);
  assert.equal(created.reminders[0].at, '2026-08-22T09:30:00.000Z');
  assert.equal(created.reminders[1].at, '2026-08-21T10:30:00.000Z');
  assert.deepEqual(todoChecklistProgress(created), { done: 1, total: 2, percent: 50 });

  const imported = createDetailedTodo({
    text: 'Siri 创建的提醒',
    listId: 'inbox',
    externalSource: 'apple-reminders',
    externalId: 'x-apple-reminder://item-1',
  }, lists, 'todo-imported', 100);
  assert.equal(imported.externalSource, 'apple-reminders');
  assert.equal(imported.externalId, 'x-apple-reminder://item-1');
  const unhandled = createDetailedTodo({
    text: '提醒未处理',
    listId: 'inbox',
    unhandledReminderAt: '2026-08-22T09:30:00.000Z',
    unhandledReminderId: 'r-unhandled',
  }, lists, 'todo-unhandled', 100);
  assert.equal(unhandled.unhandledReminderAt, '2026-08-22T09:30:00.000Z');
  assert.equal(unhandled.unhandledReminderId, 'r-unhandled');
  const handled = updateDetailedTodo(unhandled, {
    unhandledReminderAt: '',
    unhandledReminderId: '',
  }, lists, 200);
  assert.equal(handled.unhandledReminderAt, '');
  assert.equal(handled.unhandledReminderId, '');

  const completed = updateDetailedTodo(created, {
    done: true,
    completedAt: 500,
    notes: '安装包已确认',
  }, lists, 500);
  assert.equal(completed.done, true);
  assert.equal(completed.completedAt, 500);
  assert.equal(completed.notes, '安装包已确认');
  assert.equal(completed.reminders[0].firedAt, 0);
});

test('blocked todos preserve a structured reason and clear it when work resumes', () => {
  const lists = [
    { id: 'inbox', name: '收集箱', parentId: '', order: 0 },
    { id: 'work', name: '工作', parentId: '', order: 1 },
  ];
  const blocked = createDetailedTodo({
    text: '提交项目材料',
    listId: 'work',
    status: 'blocked',
    blockedAt: 200,
    blockReasonType: 'waiting',
    blockReason: '等待客户签字',
    nextAction: '明天联系客户',
  }, lists, 'blocked-1', 100);
  assert.equal(blocked.status, 'blocked');
  assert.equal(blocked.blockedAt, 200);
  assert.equal(blocked.blockReasonType, 'waiting');
  assert.equal(blocked.blockReason, '等待客户签字');
  assert.equal(blocked.nextAction, '明天联系客户');
  assert.equal(
    filterTodoTasks([blocked], lists, 'all', '客户签字', Date.now()).length,
    1
  );
  assert.equal(filterTodoTasks([blocked], lists, 'blocked', '', Date.now()).length, 1);

  const resumed = updateDetailedTodo(blocked, {
    status: 'in_progress',
    blockedAt: 0,
    blockReasonType: '',
    blockReason: '',
    nextAction: '',
  }, lists, 300);
  assert.equal(resumed.status, 'in_progress');
  assert.equal(resumed.blockedAt, 0);
  assert.equal(resumed.blockReasonType, '');
  assert.equal(resumed.blockReason, '');
  assert.equal(resumed.nextAction, '');
  assert.equal(filterTodoTasks([resumed], lists, 'blocked', '', Date.now()).length, 0);
});

test('recurring tasks calculate the next occurrence and reset execution state', () => {
  assert.deepEqual(normalizeTodoRecurrence({ unit: 'week', interval: 2 }), {
    unit: 'week',
    interval: 2,
  });
  assert.equal(nextTodoDeadline(
    { unit: 'weekday', interval: 1 },
    '2026-09-18T09:00:00.000Z'
  ), '2026-09-21T09:00:00.000Z');
  assert.equal(nextTodoDeadline(
    { unit: 'month', interval: 1 },
    '2026-01-31T09:00:00.000Z'
  ), '2026-02-28T09:00:00.000Z');

  const current = createDetailedTodo({
    id: 'repeat',
    text: '周报',
    listId: 'inbox',
    done: true,
    deadline: '2026-09-18T09:00:00.000Z',
    recurrence: { unit: 'week', interval: 1 },
    reminders: [{ id: 'r1', offsetMinutes: 60, soundId: 'bright' }],
    subtasks: [{ id: 's1', text: '整理数据', done: true }],
  }, [{ id: 'inbox', name: '收集箱' }], 'repeat', 1);
  current.unhandledReminderAt = '2026-09-18T08:00:00.000Z';
  current.unhandledReminderId = 'old-handle';
  const next = createNextTodoOccurrence(current, [{ id: 'inbox', name: '收集箱' }], 'repeat-2', 1000);
  assert.equal(next.id, 'repeat-2');
  assert.equal(next.done, false);
  assert.equal(next.completedAt, 0);
  assert.equal(next.unhandledReminderAt, '');
  assert.equal(next.unhandledReminderId, '');
  assert.equal(next.deadline, '2026-09-25T09:00:00.000Z');
  assert.equal(next.reminders[0].firedAt, 0);
  assert.equal(next.reminders[0].offsetMinutes, 60);
  assert.equal(next.subtasks[0].done, false);
});

test('linked strong reminders follow deadline changes while independent reminders keep their time', () => {
  const lists = [{ id: 'inbox', name: '收集箱' }];
  const deadline = '2026-09-18T09:00:00.000Z';
  const movedDeadline = '2026-09-18T10:00:00.000Z';
  const linked = createDetailedTodo({
    id: 'linked',
    text: '联动强提醒',
    listId: 'inbox',
    deadline,
    strongReminder: true,
    strongReminderAt: deadline,
    strongReminderLinked: true,
    reminders: [{
      id: 'linked-strong',
      offsetMinutes: null,
      at: deadline,
      soundId: 'alert',
      strong: true,
    }],
  }, lists, 'linked', 1);
  const movedLinked = updateDetailedTodo(linked, { deadline: movedDeadline }, lists, 2);
  assert.equal(movedLinked.strongReminderLinked, true);
  assert.equal(movedLinked.strongReminderAt, movedDeadline);
  assert.equal(movedLinked.reminders.find((item) => item.strong).offsetMinutes, null);
  assert.equal(movedLinked.reminders.find((item) => item.strong).at, movedDeadline);

  const independentAt = '2026-09-18T08:00:00.000Z';
  const independent = createDetailedTodo({
    id: 'independent',
    text: '独立强提醒',
    listId: 'inbox',
    deadline,
    strongReminder: true,
    strongReminderAt: independentAt,
    strongReminderLinked: false,
    reminders: [{
      id: 'independent-strong',
      offsetMinutes: null,
      at: independentAt,
      soundId: 'alert',
      strong: true,
    }],
  }, lists, 'independent', 1);
  const movedIndependent = updateDetailedTodo(independent, { deadline: movedDeadline }, lists, 2);
  assert.equal(movedIndependent.strongReminderLinked, false);
  assert.equal(movedIndependent.strongReminderAt, independentAt);
  assert.equal(movedIndependent.reminders.find((item) => item.strong).at, independentAt);

  const occurrence = createNextTodoOccurrence({
    ...independent,
    done: true,
    recurrence: { unit: 'day', interval: 1 },
  }, lists, 'independent-next', Date.parse('2026-09-18T09:00:00.000Z'));
  assert.equal(occurrence.deadline, '2026-09-19T09:00:00.000Z');
  assert.equal(occurrence.strongReminderAt, '2026-09-19T08:00:00.000Z');
  assert.equal(occurrence.strongReminderLinked, false);
});

test('todo settings preserve templates, saved filters, and missed reminder policy', () => {
  const settings = normalizeTodoSettings({
    missedReminderPolicy: '3d',
    strongReminderQuestions: ['完成了没？', '', '下一步做什么？'],
    templates: [{
      id: 't1',
      name: '客户入驻',
      text: '客户入驻',
      listId: 'inbox',
      reminderOffsets: [60, 1440],
      subtasks: [{ text: '收资料' }, { text: '开账号' }],
    }],
    savedFilters: [{
      id: 'f1',
      name: '今天重要',
      view: 'today',
      query: '客户',
    }],
  }, [{ id: 'inbox', name: '收集箱' }]);
  assert.equal(settings.missedReminderPolicy, '3d');
  assert.deepEqual(settings.strongReminderQuestions, [
    '完成了没？',
    DEFAULT_STRONG_REMINDER_QUESTIONS[1],
  ]);
  assert.deepEqual(
    normalizeStrongReminderQuestions([]),
    DEFAULT_STRONG_REMINDER_QUESTIONS
  );
  assert.equal(settings.templates[0].name, '客户入驻');
  assert.deepEqual(settings.templates[0].reminderOffsets, [60, 1440]);
  assert.equal(settings.templates[0].subtasks.length, 2);
  assert.deepEqual(settings.savedFilters[0], {
    id: 'f1',
    name: '今天重要',
    view: 'today',
    query: '客户',
    priority: 'none',
  });
});

test('Siri import settings validate the target list and deduplicate reminder ids', () => {
  assert.deepEqual(normalizeSiriImportSettings({
    enabled: true,
    reminderListId: ' reminders-default ',
    targetListId: 'work',
    importedIds: ['r1', 'r1', '', 'r2'],
  }, [
    { id: 'inbox', name: '收集箱' },
    { id: 'work', name: '工作' },
  ]), {
    enabled: true,
    reminderListId: 'reminders-default',
    targetListId: 'work',
    importedIds: ['r1', 'r2'],
  });
  assert.deepEqual(normalizeSiriImportSettings({
    enabled: 'yes',
    reminderListId: 42,
    targetListId: 'missing',
    importedIds: 'r1',
  }, [{ id: 'inbox', name: '收集箱' }]), {
    enabled: false,
    reminderListId: '42',
    targetListId: 'inbox',
    importedIds: [],
  });
});

test('daily review settings and task activity are normalized safely', () => {
  assert.deepEqual(normalizeDailyReviewSettings({
    enabled: true,
    time: '18:30',
  }), {
    enabled: true,
    time: '18:30',
  });
  assert.deepEqual(normalizeDailyReviewSettings({
    enabled: true,
    time: '99:99',
  }), {
    enabled: true,
    time: '18:00',
  });
  assert.deepEqual(normalizeTodoActivity([
    { type: 'created', message: '创建待办', at: '2026-09-18T10:00:00.000Z' },
    { type: 'updated', message: '', at: '2026-09-18T10:01:00.000Z' },
  ]).map((item) => [item.type, item.message]), [
    ['created', '创建待办'],
  ]);
});

test('manual todo ordering keeps pinned tasks on top and persists explicit order', () => {
  const list = { id: 'work', sortMode: 'manual' };
  const rows = [
    { id: 'third', done: false, pinned: false, order: 3, createdAt: 3 },
    { id: 'pinned', done: false, pinned: true, order: 8, createdAt: 8 },
    { id: 'first', done: false, pinned: false, order: 1, createdAt: 1 },
  ];
  assert.deepEqual(sortTodoTasksForList(rows, list).map((item) => item.id), [
    'pinned',
    'first',
    'third',
  ]);
  const reordered = reorderTodoTasks(rows, ['third', 'first', 'pinned']);
  assert.deepEqual(
    reordered.map((item) => [item.id, item.order]),
    [['third', 0], ['pinned', 2], ['first', 1]]
  );
});

test('quick todo parser extracts Chinese date, category, priority, and reminders', () => {
  const now = new Date(2026, 8, 17, 10, 0, 0, 0);
  const lists = [
    { id: 'work', name: '工作', parentId: '' },
    { id: 'product', name: '产品', parentId: 'work' },
  ];
  const parsed = parseTodoQuickInput(
    '发布方案 #工作/产品 !高 明天下午3点 提醒1小时前',
    now,
    lists
  );
  const deadline = new Date(parsed.deadline);
  assert.equal(parsed.text, '发布方案');
  assert.equal(parsed.listId, 'product');
  assert.equal(parsed.priority, 'high');
  assert.deepEqual(parsed.reminderOffsets, [60]);
  assert.deepEqual([
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate(),
    deadline.getHours(),
    deadline.getMinutes(),
  ], [2026, 8, 18, 15, 0]);

  const tonight = parseTodoQuickInput('回电话 晚上8点 提前10分钟', now, lists);
  const tonightDate = new Date(tonight.deadline);
  assert.equal(tonight.text, '回电话');
  assert.deepEqual(tonight.reminderOffsets, [10]);
  assert.deepEqual([
    tonightDate.getFullYear(),
    tonightDate.getMonth(),
    tonightDate.getDate(),
    tonightDate.getHours(),
  ], [2026, 8, 17, 20]);
});

test('smart todo views filter by hierarchy, deadline, completion, and search text', () => {
  const now = new Date(2026, 8, 17, 10, 0, 0, 0).getTime();
  const lists = [
    { id: 'inbox', name: '收集箱', parentId: '', order: 0 },
    { id: 'work', name: '工作', parentId: '', order: 1 },
    { id: 'product', name: '产品', parentId: 'work', order: 2 },
  ];
  const tasks = [
    { id: 'today', listId: 'product', text: '今天任务', done: false, deadline: new Date(now + 60 * 60 * 1000).toISOString(), priority: 'high', createdAt: 1 },
    { id: 'upcoming', listId: 'product', text: '七天内', done: false, deadline: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(), priority: 'none', createdAt: 2 },
    { id: 'overdue', listId: 'inbox', text: '逾期任务', done: false, deadline: new Date(now - 60 * 1000).toISOString(), priority: 'urgent', createdAt: 3 },
    { id: 'done', listId: 'inbox', text: '完成事项', done: true, deadline: new Date(now - 60 * 1000).toISOString(), priority: 'none', createdAt: 4 },
  ];

  assert.deepEqual(filterTodoTasks(tasks, lists, 'today', '', now).map((item) => item.id), ['today']);
  assert.deepEqual(filterTodoTasks(tasks, lists, 'upcoming', '', now).map((item) => item.id), ['upcoming']);
  assert.deepEqual(filterTodoTasks(tasks, lists, 'overdue', '', now).map((item) => item.id), ['overdue']);
  assert.deepEqual(filterTodoTasks(tasks, lists, 'completed', '', now).map((item) => item.id), ['done']);
  assert.deepEqual(filterTodoTasks(tasks, lists, 'list:work', '', now).map((item) => item.id), ['today', 'upcoming']);
  assert.deepEqual(filterTodoTasks(tasks, lists, 'inbox', '逾期', now).map((item) => item.id), ['overdue']);
});

test('todo view counts are computed in one pass and include child list totals', () => {
  const now = new Date(2026, 8, 17, 10, 0, 0, 0).getTime();
  const lists = [
    { id: 'inbox', name: '收集箱', parentId: '', order: 0 },
    { id: 'work', name: '工作', parentId: '', order: 1 },
    { id: 'product', name: '产品', parentId: 'work', order: 2 },
  ];
  const tasks = [
    { id: 'today', listId: 'product', done: false, deadline: new Date(now + 60 * 60 * 1000).toISOString(), startAt: '' },
    { id: 'upcoming', listId: 'product', done: false, deadline: new Date(now + 2 * 24 * 60 * 60 * 1000).toISOString(), startAt: '' },
    { id: 'overdue', listId: 'inbox', done: false, deadline: new Date(now - 60 * 1000).toISOString(), startAt: '' },
    { id: 'done', listId: 'inbox', done: true, deadline: new Date(now - 60 * 1000).toISOString(), startAt: '' },
  ];

  assert.deepEqual(summarizeTodoViewCounts(tasks, lists, now), {
    views: { inbox: 1, today: 1, upcoming: 1, overdue: 1, all: 4, completed: 1, blocked: 0 },
    lists: { inbox: 1, work: 2, product: 2 },
  });
});

test('detailed todo sorting keeps priority ahead of deadline for unfinished tasks', () => {
  const rows = sortDetailedTodos([
    { id: 'low', done: false, priority: 'low', deadline: '2026-08-20T00:00:00.000Z', order: 0, createdAt: 1 },
    { id: 'urgent', done: false, priority: 'urgent', deadline: '2026-08-25T00:00:00.000Z', order: 1, createdAt: 2 },
    { id: 'done', done: true, priority: 'urgent', deadline: '2026-08-19T00:00:00.000Z', order: 2, createdAt: 3 },
  ]);
  assert.deepEqual(rows.map((item) => item.id), ['urgent', 'low', 'done']);
});

test('todo editor updates text and deadline while keeping completion state', () => {
  const original = { ...createTodo('旧标题', '2026-08-22T10:30:00.000Z', 't1', 100), done: true, remindedAt: 88 };
  const updated = updateTodo(original, '新标题', '2026-08-23T09:00:00.000Z');
  assert.equal(updated.id, 't1');
  assert.equal(updated.text, '新标题');
  assert.equal(updated.done, true);
  assert.equal(updated.remindedAt, 0);
  const localDeadline = new Date(currentMonthDeadline(
    { day: 21, hour: 14, minute: 30 },
    new Date(2026, 7, 1, 0, 0, 0, 0),
  ));
  assert.deepEqual([
    localDeadline.getFullYear(),
    localDeadline.getMonth(),
    localDeadline.getDate(),
    localDeadline.getHours(),
    localDeadline.getMinutes(),
  ], [2026, 7, 21, 14, 30]);
  assert.equal(currentMonthDeadline(
    { day: 32, hour: 14, minute: 30 },
    new Date(2026, 7, 1, 0, 0, 0, 0),
  ), null);
});

test('todo calendar month navigation crosses year boundaries in both directions', () => {
  assert.equal(typeof shiftCalendarMonth, 'function', 'shiftCalendarMonth must exist');
  assert.deepEqual(shiftCalendarMonth({ year: 2026, month: 11 }, 1), { year: 2027, month: 0 });
  assert.deepEqual(shiftCalendarMonth({ year: 2027, month: 0 }, -1), { year: 2026, month: 11 });
});

test('todo deadline uses the calendar month being viewed instead of the current month', () => {
  assert.equal(typeof calendarDeadline, 'function', 'calendarDeadline must exist');
  const deadline = new Date(calendarDeadline({
    year: 2027,
    month: 0,
    day: 2,
    hour: 23,
    minute: 30,
  }));
  assert.deepEqual([
    deadline.getFullYear(),
    deadline.getMonth(),
    deadline.getDate(),
    deadline.getHours(),
    deadline.getMinutes(),
  ], [2027, 0, 2, 23, 30]);
  assert.equal(calendarDeadline({ year: 2027, month: 1, day: 29, hour: 23, minute: 30 }), null);
});

test('default todo deadline stays on the current local day, including after 23:30', () => {
  const daytime = new Date(2026, 7, 28, 9, 15, 0, 0);
  const sameDayDeadline = new Date(defaultTodoDeadline(daytime));
  assert.deepEqual([
    sameDayDeadline.getFullYear(),
    sameDayDeadline.getMonth(),
    sameDayDeadline.getDate(),
    sameDayDeadline.getHours(),
    sameDayDeadline.getMinutes(),
  ], [2026, 7, 28, 23, 30]);

  const afterCutoff = new Date(2026, 7, 31, 23, 31, 0, 0);
  const sameDayAfterCutoff = new Date(defaultTodoDeadline(afterCutoff));
  assert.deepEqual([
    sameDayAfterCutoff.getFullYear(),
    sameDayAfterCutoff.getMonth(),
    sameDayAfterCutoff.getDate(),
    sameDayAfterCutoff.getHours(),
    sameDayAfterCutoff.getMinutes(),
  ], [2026, 7, 31, 23, 30]);
});

test('todos sort unfinished by DDL and creation time with completed items last', () => {
  const rows = sortTodosForDisplay([
    { id: 'done', done: true, deadline: '2026-08-20T00:00:00.000Z', createdAt: 1 },
    { id: 'late', done: false, deadline: '2026-08-22T00:00:00.000Z', createdAt: 2 },
    { id: 'early-new', done: false, deadline: '2026-08-21T00:00:00.000Z', createdAt: 3 },
    { id: 'early-old', done: false, deadline: '2026-08-21T00:00:00.000Z', createdAt: 1 },
  ]);
  assert.deepEqual(rows.map((row) => row.id), ['early-old', 'early-new', 'late', 'done']);
});

test('credential search matches service or account without exposing passwords', () => {
  const rows = [
    { id: 'github', service: 'GitHub', account: 'hello@example.com', passwordMask: '********' },
    { id: 'feishu', service: '飞书', account: '13800000000', passwordMask: '********' },
  ];
  assert.deepEqual(filterCredentials(rows, 'GITHUB').map((row) => row.id), ['github']);
  assert.deepEqual(filterCredentials(rows, 'example').map((row) => row.id), ['github']);
  assert.deepEqual(filterCredentials(rows, '').map((row) => row.id), ['github', 'feishu']);
});

test('credential row routes its trailing action to delete while its body still opens editing', () => {
  assert.equal(typeof credentialRowAction, 'function', 'credentialRowAction must exist');
  assert.deepEqual(credentialRowAction({ requestedAction: 'delete' }), {
    type: 'delete',
    label: '删除',
    ariaLabel: '删除密钥',
  });
  assert.deepEqual(credentialRowAction({ copyField: 'account' }), { type: 'copy', field: 'account' });
  assert.deepEqual(credentialRowAction({ rowBody: true }), { type: 'edit' });
  assert.deepEqual(credentialRowAction({ rowBody: true, shiftKey: true }), { type: 'select' });
  assert.deepEqual(credentialRowAction({ rowBody: true, selected: true }), { type: 'select' });
});

test('settings stays at the far right when optional tabs are hidden', () => {
  assert.equal(typeof visiblePanelTabs, 'function', 'visiblePanelTabs must exist');
  const tabs = ['home', 'todo', 'notes', 'links', 'recordings', 'credentials', 'clip', 'settings'];
  assert.deepEqual(visiblePanelTabs(tabs, { todo: false, clip: true }), [
    'home', 'notes', 'links', 'recordings', 'credentials', 'clip', 'settings',
  ]);
  assert.deepEqual(visiblePanelTabs(tabs, {
    todo: false,
    notes: false,
    links: false,
    recordings: false,
    credentials: false,
    clip: false,
    settings: false,
  }), ['home', 'settings']);
});

test('default panel tab uses the preference only while that tab is visible', () => {
  assert.equal(resolveDefaultPanelTab('todo', ['home', 'todo', 'settings']), 'todo');
  assert.equal(resolveDefaultPanelTab('todo', ['home', 'settings']), 'home');
  assert.equal(resolveDefaultPanelTab('unknown', ['home', 'settings']), 'home');
});

test('settings summary combines safe API status with local device settings', () => {
  assert.equal(typeof settingsSummary, 'function', 'settingsSummary must exist');
  assert.deepEqual(settingsSummary({
    appSettings: { shortcut: 'Command+Shift+P', autoLaunch: true },
    workspace: { path: '/Users/test/Panel', portable: true },
    transcription: { configured: true, llmConfigured: false },
  }), {
    shortcut: 'Command+Shift+P',
    defaultTab: 'home',
    autoLaunch: true,
    workspacePath: '/Users/test/Panel',
    workspaceLabel: '自定义文件夹',
    transcription: { label: '已安全保存', state: 'saved' },
    llm: { label: '未配置', state: 'empty' },
  });
  assert.doesNotMatch(JSON.stringify(settingsSummary({
    transcription: { configured: true, apiKey: 'api-secret' },
  })), /api-secret/);
});

test('saved notes preserve cleared content and keep recently updated notes first', () => {
  const notes = normalizeNoteArchive([
    { id: 'older', title: '产品复盘', titleSource: 'model', content: '  # 旧笔记\n正文  ', createdAt: 100, updatedAt: 200 },
    { id: 'newer', content: '新笔记', createdAt: 300, updatedAt: 400 },
    { id: 'empty', content: '', createdAt: 500, updatedAt: 500 },
    null,
  ]);
  assert.deepEqual(notes.map((note) => note.id), ['empty', 'newer', 'older']);
  assert.equal(notes[0].content, '');
  assert.equal(notes[2].content, '  # 旧笔记\n正文  ');
  assert.equal(notes[2].title, '产品复盘');
  assert.equal(notes[2].titleSource, 'model');
  assert.equal(notes[2].updatedAt, 200);
});

test('editing a saved note updates content and timestamp without losing its identity', () => {
  const notes = normalizeNoteArchive([
    { id: 'selected', content: '旧内容', createdAt: 100, updatedAt: 200 },
    { id: 'other', content: '其他笔记', createdAt: 150, updatedAt: 300 },
  ]);
  const updated = updateNoteInArchive(notes, 'selected', '新内容\n第二行', 400);
  assert.deepEqual(updated.map((note) => note.id), ['selected', 'other']);
  assert.deepEqual(updated[0], {
    id: 'selected',
    title: '',
    titleSource: '',
    content: '新内容\n第二行',
    createdAt: 100,
    updatedAt: 400,
  });

  const cleared = updateNoteInArchive(updated, 'selected', '', 500);
  assert.equal(cleared[0].content, '');
  assert.equal(normalizeNoteArchive(JSON.parse(JSON.stringify(cleared)))[0].id, 'selected');
});

test('note search matches titles and full content without changing archive order', () => {
  const notes = normalizeNoteArchive([
    { id: 'one', title: 'Dingdo 设计', titleSource: 'model', content: '正文没有产品英文名', createdAt: 100, updatedAt: 300 },
    { id: 'two', content: '会议备忘\n下周交付录制功能', createdAt: 200, updatedAt: 200 },
  ]);
  assert.deepEqual(filterNotes(notes, 'dingdo').map((note) => note.id), ['one']);
  assert.deepEqual(filterNotes(notes, '录制').map((note) => note.id), ['two']);
  assert.deepEqual(filterNotes(notes, '').map((note) => note.id), ['one', 'two']);
});

test('users can rename a note without changing its content', () => {
  const notes = normalizeNoteArchive([
    { id: 'note-1', title: '模型标题', titleSource: 'model', content: '正文', createdAt: 100, updatedAt: 200 },
  ]);
  const renamed = updateNoteTitle(notes, 'note-1', '  用户自己的标题  ', 300);
  assert.deepEqual(renamed[0], {
    id: 'note-1',
    title: '用户自己的标题',
    titleSource: 'user',
    content: '正文',
    createdAt: 100,
    updatedAt: 300,
  });
});

test('generated note titles never overwrite user titles or stale content', () => {
  const base = normalizeNoteArchive([
    { id: 'note-1', content: '最初正文', createdAt: 100, updatedAt: 200 },
  ]);
  const generated = applyGeneratedNoteTitle(base, 'note-1', '模型概括标题', '最初正文');
  assert.equal(generated[0].title, '模型概括标题');
  assert.equal(generated[0].titleSource, 'model');

  const userRenamed = updateNoteTitle(generated, 'note-1', '我的标题', 300);
  assert.equal(applyGeneratedNoteTitle(userRenamed, 'note-1', '迟到的模型标题', '最初正文')[0].title, '我的标题');

  const edited = updateNoteInArchive(base, 'note-1', '已经变化的正文', 400);
  assert.equal(applyGeneratedNoteTitle(edited, 'note-1', '过期标题', '最初正文')[0].title, '');
});

test('API credential statuses distinguish saved, missing, and legacy keys that need re-entry', () => {
  assert.deepEqual(apiCredentialStatuses({
    configured: true,
    llmConfigured: false,
    llmNeedsReentry: true,
  }), {
    transcription: { label: '已安全保存', state: 'saved' },
    llm: { label: '需重新输入', state: 'warning' },
  });
  assert.deepEqual(apiCredentialStatuses({}), {
    transcription: { label: '未配置', state: 'empty' },
    llm: { label: '未配置', state: 'empty' },
  });
});

test('home layout swaps complete slot assignments without duplicates', () => {
  const defaults = {
    windows: 'tall-left',
    clock: 'small-top',
    recorder: 'medium-top',
    mirror: 'square-top',
    commands: 'tall-right',
    note: 'wide-bottom',
  };
  assert.deepEqual(normalizeHomeLayout({ windows: 'wide-bottom' }, defaults), defaults);
  assert.deepEqual(swapHomeLayoutSlots(defaults, 'mirror', 'clock'), {
    windows: 'tall-left',
    clock: 'square-top',
    recorder: 'medium-top',
    mirror: 'small-top',
    commands: 'tall-right',
    note: 'wide-bottom',
  });
});

test('todo category names migrate to work streams and reject blank edits', () => {
  const defaults = {
    P0: '课程',
    P1: '自媒体&写作',
    P2: 'Vibe coding',
    P3: '日常',
  };
  assert.deepEqual(normalizeTodoCategoryNames(null, defaults), defaults);
  assert.deepEqual(normalizeTodoCategoryNames({ P0: '  教学产品  ', P1: '', P4: '无效' }, defaults), {
    P0: '教学产品',
    P1: '自媒体&写作',
    P2: 'Vibe coding',
    P3: '日常',
  });
});

test('home widget sizes keep the requested tile large and adapt siblings to the grid budget', () => {
  const defaults = {
    character: 'small',
    windows: 'large',
    recorder: 'medium',
    mirror: 'medium',
    note: 'large',
    commands: 'medium',
  };
  assert.deepEqual(normalizeHomeWidgetSizes({ windows: 'huge' }, defaults, 'windows', 22), defaults);
  const fitted = normalizeHomeWidgetSizes({
    character: 'large',
    windows: 'large',
    recorder: 'large',
    mirror: 'large',
    note: 'large',
    commands: 'large',
  }, defaults, 'mirror', 22);
  assert.equal(fitted.mirror, 'large');
  assert.ok(Object.values(fitted).some((size) => size !== 'large'));
});

test('home widget sizes fill the complete bento capacity without blank cells', () => {
  const defaults = {
    music: 'medium',
    windows: 'large',
    recorder: 'small',
    mirror: 'medium',
    note: 'medium',
    commands: 'mini',
    pomodoro: 'mini',
  };
  const area = { mini: 2, small: 4, medium: 8, large: 16 };
  const fitted = normalizeHomeWidgetSizes({ ...defaults, mirror: 'large' }, defaults, 'mirror', 48);
  assert.equal(fitted.mirror, 'large');
  assert.equal(Object.values(fitted).reduce((total, size) => total + area[size], 0), 48);
});

test('home widget packing fills all four rows even when logical order would fragment the grid', () => {
  const order = ['recorder', 'windows', 'commands', 'mirror', 'music', 'note', 'pomodoro'];
  const sizes = {
    recorder: 'small',
    windows: 'large',
    commands: 'mini',
    mirror: 'medium',
    music: 'medium',
    note: 'medium',
    pomodoro: 'mini',
  };
  const layout = packHomeWidgetLayout(order, sizes, 12, 4);
  assert.ok(layout);
  const occupied = new Set();
  Object.entries(layout).forEach(([id, item]) => {
    for (let row = item.row; row < item.row + item.height; row += 1) {
      for (let column = item.column; column < item.column + item.width; column += 1) {
        const cell = `${row}:${column}`;
        assert.equal(occupied.has(cell), false, `${id} overlaps ${cell}`);
        occupied.add(cell);
      }
    }
  });
  assert.equal(occupied.size, 48);
});

test('hidden homepage modules are deduplicated and normalized to module order', () => {
  assert.deepEqual(
    normalizeHiddenHomeModules(['mirror', 'unknown', 'mirror', 'music'], HOME_MODULES),
    ['music', 'mirror']
  );
  assert.deepEqual(normalizeHiddenHomeModules('mirror', HOME_MODULES), []);
  assert.deepEqual(normalizeHiddenHomeModules([...HOME_MODULES], HOME_MODULES), []);
});

test('homepage visibility refuses to hide the final visible module', () => {
  const sixHidden = HOME_MODULES.slice(0, 6);
  assert.deepEqual(
    updateHomeModuleVisibility(sixHidden, HOME_MODULES, 'commands', false),
    { ok: false, error: 'at_least_one_required', hiddenIds: sixHidden }
  );
  assert.deepEqual(
    updateHomeModuleVisibility(['mirror'], HOME_MODULES, 'mirror', true),
    { ok: true, hiddenIds: [] }
  );
  assert.deepEqual(
    updateHomeModuleVisibility([], HOME_MODULES, 'unknown', false),
    { ok: false, error: 'invalid_module', hiddenIds: [] }
  );
});

test('every non-empty homepage widget subset exactly covers the bento grid', () => {
  const order = ['music', 'pomodoro', 'windows', 'recorder', 'mirror', 'note', 'commands'];
  const sizes = {
    music: 'medium', pomodoro: 'mini', windows: 'large', recorder: 'small',
    mirror: 'medium', note: 'medium', commands: 'mini',
  };
  for (let visibleMask = 1; visibleMask < 2 ** order.length; visibleMask += 1) {
    const hiddenIds = order.filter((id, index) => (visibleMask & (1 << index)) === 0);
    const expectedIds = order.filter((id) => !hiddenIds.includes(id));
    const before = JSON.stringify({ order, sizes, hiddenIds });
    const layout = resolveHomeWidgetLayout(order, sizes, hiddenIds, 12, 4);
    assertExactHomeCover(layout, expectedIds);
    assert.equal(JSON.stringify({ order, sizes, hiddenIds }), before, 'resolver mutated its inputs');
  }
});

test('five-widget layout chooses the largest preference and breaks ties by saved order', () => {
  const order = ['music', 'pomodoro', 'windows', 'recorder', 'mirror', 'note', 'commands'];
  const sizes = {
    music: 'medium', pomodoro: 'mini', windows: 'large', recorder: 'small',
    mirror: 'large', note: 'medium', commands: 'mini',
  };
  const layout = resolveHomeWidgetLayout(order, sizes, ['pomodoro', 'commands'], 12, 4);
  assert.deepEqual(layout.placements.windows, { column: 0, row: 0, width: 4, height: 4 });
  assert.equal(layout.variants.windows, 'tall');
});

test('layout variants reflect actual rectangles instead of saved preferences', () => {
  assert.equal(layoutVariantForPlacement({ width: 2, height: 1 }), 'mini');
  assert.equal(layoutVariantForPlacement({ width: 2, height: 2 }), 'compact');
  assert.equal(layoutVariantForPlacement({ width: 6, height: 2 }), 'wide');
  assert.equal(layoutVariantForPlacement({ width: 4, height: 4 }), 'tall');
  assert.equal(layoutVariantForPlacement({ width: 12, height: 4 }), 'full');
});

test('home layout validation rejects every incomplete or unsafe shape', () => {
  const valid = resolveHomeWidgetLayout(
    ['music', 'windows'],
    { music: 'large', windows: 'large' },
    [],
    12,
    4
  );
  assert.equal(validateHomeWidgetLayout(valid, ['music', 'windows'], 12, 4), true);
  assert.equal(validateHomeWidgetLayout(null, ['music'], 12, 4), false);
  assert.equal(validateHomeWidgetLayout({ placements: {} }, ['music'], 12, 4), false);
  assert.equal(validateHomeWidgetLayout({
    placements: { music: { column: 0, row: 0, width: 12, height: 3 } },
  }, ['music'], 12, 4), false);
  assert.equal(validateHomeWidgetLayout({
    placements: { music: { column: 0, row: 0, width: 12.5, height: 4 } },
  }, ['music'], 12, 4), false);
  assert.equal(validateHomeWidgetLayout({
    placements: {
      music: { column: 0, row: 0, width: 8, height: 4 },
      windows: { column: 6, row: 0, width: 6, height: 4 },
    },
  }, ['music', 'windows'], 12, 4), false);
});

test('audio level returns stable RMS volume for recording strands', () => {
  assert.equal(calculateAudioLevel(new Float32Array([0, 0, 0])), 0);
  assert.equal(calculateAudioLevel(new Float32Array([0.5, -0.5, 0.5, -0.5])), 0.5);
  assert.equal(calculateAudioLevel(new Float32Array([2, -2])), 1);
});

test('resampleFloat32ToPcm16 downsamples and clamps audio', () => {
  const pcm = resampleFloat32ToPcm16(new Float32Array([1.5, 1, -1.5, -1]), 32000, 16000);
  assert.deepEqual(Array.from(pcm), [32767, -32768]);
});

test('shouldTogglePanelForSpace toggles plain Space but never steals typing input', () => {
  assert.equal(shouldTogglePanelForSpace({ key: ' ', repeat: false, editable: false }), true);
  assert.equal(shouldTogglePanelForSpace({ key: 'Spacebar', repeat: false, editable: false }), true);
  assert.equal(shouldTogglePanelForSpace({ key: ' ', repeat: true, editable: false }), false);
  assert.equal(shouldTogglePanelForSpace({ key: ' ', repeat: false, editable: true }), false);
  assert.equal(shouldTogglePanelForSpace({ key: ' ', repeat: false, editable: false, metaKey: true }), false);
});

test('mirror pinch zooms only a live camera and stays within safe bounds', () => {
  assert.equal(domain.shouldHandleMirrorPinch?.({ live: false, ctrlKey: true }), false);
  assert.equal(domain.shouldHandleMirrorPinch?.({ live: true, ctrlKey: false }), false);
  assert.equal(domain.shouldHandleMirrorPinch?.({ live: true, ctrlKey: true }), true);
  assert.equal(domain.adjustMirrorZoom?.(1, -100), 1.2);
  assert.equal(domain.adjustMirrorZoom?.(1, 100), 1);
  assert.equal(domain.adjustMirrorZoom?.(2.55, -100), 2.6);
});

test('todo time battery reports the remaining share with exact color boundaries', () => {
  const createdAt = Date.parse('2026-08-21T00:00:00.000Z');
  const deadline = '2026-08-21T10:00:00.000Z';
  const todo = { createdAt, deadline, done: false };
  assert.deepEqual(todoTimeBattery(todo, Date.parse('2026-08-21T02:00:00.000Z')), {
    percent: 80,
    tone: 'green',
    overdue: false,
    label: '剩余 80%',
  });
  assert.equal(todoTimeBattery(todo, Date.parse('2026-08-21T05:00:00.000Z')).tone, 'yellow');
  assert.equal(todoTimeBattery(todo, Date.parse('2026-08-21T07:00:00.000Z')).tone, 'red');
  // 恰好压在截止点上就算逾期，不再是「剩余 0%」。
  assert.deepEqual(todoTimeBattery(todo, Date.parse('2026-08-21T10:00:00.000Z')), {
    percent: 0,
    tone: 'red',
    overdue: true,
    label: '已逾期',
  });
  assert.deepEqual(todoTimeBattery(todo, Date.parse('2026-08-21T11:00:00.000Z')), {
    percent: 0,
    tone: 'red',
    overdue: true,
    label: '已逾期',
  });
  // 逾期前的最后一刻仍是「剩余 0%」：取整落到 0 与真正欠账必须可区分。
  const almostDue = todoTimeBattery(todo, Date.parse('2026-08-21T09:59:00.000Z'));
  assert.equal(almostDue.overdue, false);
  assert.equal(almostDue.percent, 0);
  assert.equal(almostDue.label, '剩余 0%');
  assert.equal(todoTimeBattery({ createdAt, deadline, done: true }, createdAt), null);
  assert.deepEqual(todoTimeBattery({ deadline }, createdAt), {
    percent: 0,
    tone: 'red',
    overdue: false,
    label: '待补充有效截止时间',
  });
});

test('Shift range selection selects contiguous rows while plain selection resets the range', () => {
  const ids = ['a', 'b', 'c', 'd'];
  assert.deepEqual(updateRangeSelection(ids, [], 'b', null, false), {
    selected: ['b'],
    anchor: 'b',
  });
  assert.deepEqual(updateRangeSelection(ids, ['b'], 'd', 'b', true), {
    selected: ['b', 'c', 'd'],
    anchor: 'b',
  });
  assert.deepEqual(updateRangeSelection(ids, ['b', 'c', 'd'], 'c', 'b', false), {
    selected: ['c'],
    anchor: 'c',
  });
  assert.deepEqual(updateRangeSelection(ids, ['a'], 'missing', 'a', true), {
    selected: ['a'],
    anchor: 'a',
  });
});

test('credential selection can toggle its only selected row off', () => {
  const ids = ['a', 'b', 'c'];
  assert.deepEqual(updateRangeSelection(ids, ['b'], 'b', 'b', false, true), {
    selected: [],
    anchor: null,
  });
});
