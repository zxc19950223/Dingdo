'use strict';

(() => {
  const Domain = window.NotchDomain;
  const STORAGE_KEY = 'notch-todo-data';
  const BACKUP_KEY = 'notch-todo-data-v1-backup';
  const CATEGORY_KEY = 'notch-todo-category-names-v1';
  const VIEW_KEY = 'notch-todo-view-v2';
  const INBOX_ID = 'inbox';
  const DEFAULT_CATEGORY_NAMES = {
    P0: '课程',
    P1: '自媒体&写作',
    P2: 'Vibe coding',
    P3: '日常',
  };
  const PRIORITY_LABELS = {
    none: '无',
    low: '低',
    medium: '中',
    high: '高',
    urgent: '紧急',
  };
  const STATUS_LABELS = Domain?.TODO_STATUS_LABELS || {
    todo: '待办',
    in_progress: '进行中',
    blocked: '受阻',
    done: '已完成',
  };
  const BLOCK_REASON_LABELS = Domain?.TODO_BLOCK_REASON_LABELS || {
    waiting: '等待别人',
    materials: '资料不足',
    time: '时间不够',
    conditions: '条件未满足',
    changed: '计划变化',
    personal: '个人原因',
    other: '其他',
  };
  const VIEW_META = {
    inbox: { kicker: '收集箱', title: '收集箱', description: '还没分类的任务' },
    today: { kicker: '今天', title: '今天要做', description: '今天开始或今天到期' },
    upcoming: { kicker: '计划', title: '未来 7 天', description: '接下来一周内的截止任务' },
    overdue: { kicker: '需要处理', title: '已经逾期', description: '未完成且已经过了截止时间' },
    blocked: { kicker: '需要跟进', title: '受阻任务', description: '已经记录原因、暂时无法推进的任务' },
    all: { kicker: '全部', title: '所有任务', description: '当前未完成任务' },
    completed: { kicker: '归档', title: '已完成', description: '可以恢复或删除的任务' },
    calendar: { kicker: '计划', title: '日历', description: '按月查看截止任务' },
    history: { kicker: '提醒', title: '提醒记录', description: '已提醒、已稍后和错过记录' },
    trash: { kicker: '恢复', title: '回收站', description: '保留最近 30 天删除的任务' },
  };

  const page = document.getElementById('todo-page');
  const smartNav = document.getElementById('todo-smart-nav');
  const listTree = document.getElementById('todo-list-tree');
  const savedFilters = document.getElementById('todo-saved-filters');
  const savedFilterList = document.getElementById('todo-saved-filter-list');
  const listAddButton = document.getElementById('todo-list-add');
  const listForm = document.getElementById('todo-list-form');
  const listNameInput = document.getElementById('todo-list-name');
  const listParentSelect = document.getElementById('todo-list-parent');
  const listDefaultReminders = document.getElementById('todo-list-default-reminders');
  const listDefaultSound = document.getElementById('todo-list-default-sound');
  const listSortMode = document.getElementById('todo-list-sort-mode');
  const listCancelButton = document.getElementById('todo-list-cancel');
  const viewKicker = document.getElementById('todo-view-kicker');
  const viewTitle = document.getElementById('todo-view-title');
  const viewSummary = document.getElementById('todo-view-summary');
  const searchInput = document.getElementById('todo-search');
  const sortToggle = document.getElementById('todo-sort-toggle');
  const calendarPrevious = document.getElementById('todo-calendar-previous');
  const calendarNext = document.getElementById('todo-calendar-next');
  const missedPolicySelect = document.getElementById('todo-missed-policy');
  const saveFilterButton = document.getElementById('todo-save-filter');
  const templateSelect = document.getElementById('todo-template-select');
  const bulkDeleteButton = document.getElementById('todo-bulk-delete');
  const backupNowButton = document.getElementById('todo-backup-now');
  const siriImportButton = document.getElementById('todo-siri-import');
  const exportReportButton = document.getElementById('todo-export-report');
  const exportDataButton = document.getElementById('todo-export-data');
  const importDataButton = document.getElementById('todo-import-data');
  const dataToolbar = backupNowButton?.closest('.todo-data-toolbar');
  const quickAddForm = document.getElementById('todo-quick-add');
  const quickTitleInput = document.getElementById('todo-quick-title');
  const quickDeadlineInput = document.getElementById('todo-quick-deadline');
  const quickPreview = document.getElementById('todo-quick-preview');
  const picker = document.getElementById('todo-picker');
  const pickerMonth = document.getElementById('todo-picker-month');
  const pickerPrevious = document.getElementById('todo-picker-previous');
  const pickerNext = document.getElementById('todo-picker-next');
  const pickerGrid = document.getElementById('todo-picker-grid');
  const pickerHour = document.getElementById('todo-picker-hour');
  const pickerMinute = document.getElementById('todo-picker-minute');
  const pickerClear = document.getElementById('todo-picker-clear');
  const pickerToday = document.getElementById('todo-picker-today');
  const pickerDone = document.getElementById('todo-picker-done');
  const calendarDayPopover = document.getElementById('todo-calendar-day-popover');
  const calendarDayTitle = document.getElementById('todo-calendar-day-title');
  const calendarDayList = document.getElementById('todo-calendar-day-list');
  const calendarDayClose = document.getElementById('todo-calendar-day-close');
  const templateDialog = document.getElementById('todo-template-dialog');
  const templateForm = document.getElementById('todo-template-form');
  const templateNameInput = document.getElementById('todo-template-name');
  const templateCancel = document.getElementById('todo-template-cancel');
  const templateCancelButton = document.getElementById('todo-template-cancel-button');
  const taskList = document.getElementById('todo-task-list');
  const detail = document.getElementById('todo-detail');
  const detailEmpty = document.getElementById('todo-detail-empty');
  const detailForm = document.getElementById('todo-detail-form');
  const detailStatus = document.getElementById('todo-detail-status');
  const detailTitle = document.getElementById('todo-detail-title');
  const detailState = document.getElementById('todo-detail-state');
  const detailList = document.getElementById('todo-detail-list');
  const detailPriority = document.getElementById('todo-detail-priority');
  const detailStart = document.getElementById('todo-detail-start');
  const detailDeadline = document.getElementById('todo-detail-deadline');
  const detailNotes = document.getElementById('todo-detail-notes');
  const blockSummary = document.getElementById('todo-block-summary');
  const blockSummaryType = document.getElementById('todo-block-summary-type');
  const blockSummaryReason = document.getElementById('todo-block-summary-reason');
  const blockSummaryNext = document.getElementById('todo-block-summary-next');
  const blockEdit = document.getElementById('todo-block-edit');
  const blockClear = document.getElementById('todo-block-clear');
  const detailSound = document.getElementById('todo-detail-sound');
  const detailRecurrence = document.getElementById('todo-detail-recurrence');
  const detailRecurrenceInterval = document.getElementById('todo-detail-recurrence-interval');
  const recurrenceUnit = document.getElementById('todo-recurrence-unit');
  const detailStrongReminder = document.getElementById('todo-detail-strong-reminder');
  const detailStrongReminderAt = document.getElementById('todo-detail-strong-reminder-at');
  const detailStrongReminderTimeField = document.getElementById('todo-detail-strong-reminder-time-field');
  const strongReminderWarning = document.getElementById('strong-reminder-warning');
  const strongReminderWarningStep = document.getElementById('strong-reminder-warning-step');
  const strongReminderTimeStep = document.getElementById('strong-reminder-time-step');
  const strongReminderWarningCancel = document.getElementById('strong-reminder-warning-cancel');
  const strongReminderWarningConfirm = document.getElementById('strong-reminder-warning-confirm');
  const strongReminderTimeOptions = document.getElementById('strong-reminder-time-options');
  const strongReminderTimeCustomField = document.getElementById('strong-reminder-time-custom-field');
  const strongReminderCustomAt = document.getElementById('strong-reminder-custom-at');
  const strongReminderTimeError = document.getElementById('strong-reminder-time-error');
  const strongReminderTimeCancel = document.getElementById('strong-reminder-time-cancel');
  const strongReminderTimeConfirm = document.getElementById('strong-reminder-time-confirm');
  const reminderPresets = document.getElementById('todo-reminder-presets');
  const reminderMinutes = document.getElementById('todo-reminder-minutes');
  const reminderAddButton = document.getElementById('todo-reminder-add');
  const reminderHint = document.getElementById('todo-reminder-hint');
  const subtaskList = document.getElementById('todo-subtask-list');
  const subtaskProgress = document.getElementById('todo-subtask-progress');
  const subtaskAddButton = document.getElementById('todo-subtask-add-button');
  const subtaskTitle = document.getElementById('todo-subtask-title');
  const detailDelete = document.getElementById('todo-detail-delete');
  const detailDesktopCard = document.getElementById('todo-detail-desktop-card');
  const detailExportReport = document.getElementById('todo-detail-export-report');
  const saveTemplateButton = document.getElementById('todo-save-template');
  const detailPin = document.getElementById('todo-detail-pin');
  const detailClose = document.getElementById('todo-detail-close');
  const activityToggle = document.getElementById('todo-activity-toggle');
  const activityPreview = document.getElementById('todo-activity-preview');
  const activityList = document.getElementById('todo-activity-list');
  const blockDialog = document.getElementById('todo-block-dialog');
  const blockForm = document.getElementById('todo-block-form');
  const blockReasonOptions = document.getElementById('todo-block-reason-options');
  const blockReasonInput = document.getElementById('todo-block-reason');
  const blockNextActionInput = document.getElementById('todo-block-next-action');
  const blockDialogError = document.getElementById('todo-block-dialog-error');
  const blockCancel = document.getElementById('todo-block-cancel');
  const blockCancelButton = document.getElementById('todo-block-cancel-button');
  const exportDialog = document.getElementById('todo-export-dialog');
  const exportForm = document.getElementById('todo-export-form');
  const exportScope = document.getElementById('todo-export-scope');
  const exportFormat = document.getElementById('todo-export-format');
  const exportIncludeCompleted = document.getElementById('todo-export-include-completed');
  const exportIncludeActivity = document.getElementById('todo-export-include-activity');
  const exportNote = document.getElementById('todo-export-note');
  const exportCancel = document.getElementById('todo-export-cancel');
  const exportCancelButton = document.getElementById('todo-export-cancel-button');
  const siriImportDialog = document.getElementById('siri-import-dialog');
  const siriImportForm = document.getElementById('siri-import-form');
  const siriImportClose = document.getElementById('siri-import-close');
  const siriImportCancel = document.getElementById('siri-import-cancel');
  const siriImportReminderList = document.getElementById('siri-import-reminder-list');
  const siriImportTargetList = document.getElementById('siri-import-target-list');
  const siriImportAuto = document.getElementById('siri-import-auto');
  const siriImportNote = document.getElementById('siri-import-note');
  const dailyReviewBackdrop = document.getElementById('daily-review-backdrop');
  const dailyReviewClose = document.getElementById('daily-review-close');
  const dailyReviewSummary = document.getElementById('daily-review-summary');
  const dailyReviewTasks = document.getElementById('daily-review-tasks');
  const dailyReviewAllTomorrow = document.getElementById('daily-review-all-tomorrow');
  const dailyReviewAllMorning = document.getElementById('daily-review-all-morning');
  const dailyReviewDone = document.getElementById('daily-review-done');
  const dailyReviewCustomAt = document.getElementById('daily-review-custom-at');

  if (!Domain || !page) return;

  function generateId(prefix) {
    return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  function escapeHtml(value) {
    return String(value)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function readCategoryNames() {
    try {
      const normalized = Domain.normalizeTodoCategoryNames(
        JSON.parse(localStorage.getItem(CATEGORY_KEY) || 'null'),
        DEFAULT_CATEGORY_NAMES
      );
      return normalized;
    } catch (error) {
      return { ...DEFAULT_CATEGORY_NAMES };
    }
  }

  function readWorkspace() {
    let raw = null;
    try {
      raw = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
    } catch (error) {
      raw = null;
    }
    if (raw && !Number.isInteger(raw.version) && ['P0', 'P1', 'P2', 'P3'].some((key) => Array.isArray(raw[key]))) {
      try {
        if (!localStorage.getItem(BACKUP_KEY)) localStorage.setItem(BACKUP_KEY, JSON.stringify(raw));
      } catch (error) {}
    }
    return Domain.normalizeTodoWorkspace(raw, { categoryNames: readCategoryNames() });
  }

  function writeWorkspace(options = {}) {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(workspace));
    } catch (error) {
      showToast('待办保存失败，请检查本机存储空间');
      return;
    }
    if (options.scheduleReminders !== false) scheduleReminders();
    if (desktopCardsLoaded) scheduleDesktopCardsSync();
    document.dispatchEvent(new CustomEvent('notch:todo-changed'));
  }

  function scheduleReminders() {
    if (typeof window.notchAPI?.scheduleTodoReminders !== 'function') return;
    window.notchAPI.scheduleTodoReminders(workspace.tasks, {
      missedReminderPolicy: workspace.settings?.missedReminderPolicy || '24h',
      strongReminderQuestions: Domain.normalizeStrongReminderQuestions(
        workspace.settings?.strongReminderQuestions
      ),
    }).catch(() => {});
  }

  function desktopCardPayload(task) {
    const progress = Domain.todoChecklistProgress(task);
    const state = taskStatus(task);
    return {
      id: task.id,
      text: task.text,
      status: state,
      statusLabel: statusLabel(state),
      dueText: formatDue(task.deadline) || '无日期',
      overdue: task.done !== true
        && Number.isFinite(Date.parse(String(task.deadline || '')))
        && Date.parse(String(task.deadline)) < Date.now(),
      priorityLabel: task.priority && task.priority !== 'none'
        ? PRIORITY_LABELS[task.priority]
        : '',
      blockReasonType: BLOCK_REASON_LABELS[task.blockReasonType] || (state === 'blocked' ? '其他' : ''),
      blockReason: task.blockReason || '',
      nextAction: task.nextAction || '',
      subtaskDone: progress.done,
      subtaskTotal: progress.total,
      done: task.done === true,
    };
  }

  function scheduleDesktopCardsSync() {
    if (!desktopCardsLoaded || typeof window.notchAPI?.syncDesktopCards !== 'function') return;
    if (desktopCardsSyncTimer) clearTimeout(desktopCardsSyncTimer);
    desktopCardsSyncTimer = setTimeout(() => {
      desktopCardsSyncTimer = null;
      syncDesktopCards();
    }, 80);
  }

  function syncDesktopCards() {
    if (!desktopCardsLoaded || typeof window.notchAPI?.syncDesktopCards !== 'function') return;
    const items = workspace.tasks
      .filter((task) => desktopCardIds.has(task.id))
      .map(desktopCardPayload);
    window.notchAPI.syncDesktopCards(items).then((result) => {
      if (Array.isArray(result?.ids)) {
        desktopCardIds = new Set(result.ids);
        if (selectedTaskId) renderDetail();
      }
    }).catch(() => {});
  }

  async function loadDesktopCards() {
    if (typeof window.notchAPI?.listDesktopCards !== 'function') return;
    const result = await window.notchAPI.listDesktopCards().catch(() => null);
    desktopCardIds = new Set(Array.isArray(result?.ids) ? result.ids : []);
    desktopCardsLoaded = true;
    syncDesktopCards();
    if (selectedTaskId) renderDetail();
  }

  async function setDesktopCard(taskId, enabled) {
    if (typeof window.notchAPI?.setDesktopCardEnabled !== 'function') return;
    const result = await window.notchAPI.setDesktopCardEnabled(taskId, enabled).catch(() => null);
    if (!result?.ok) {
      showToast('桌面卡片操作失败');
      return;
    }
    desktopCardIds = new Set(Array.isArray(result.ids) ? result.ids : []);
    desktopCardsLoaded = true;
    syncDesktopCards();
    renderBoard();
    if (selectedTaskId) renderDetail();
    showToast(enabled ? '已发送到桌面' : '已关闭桌面卡片');
  }

  function siriImportSettings() {
    workspace.settings ||= {};
    workspace.settings.siriImport = Domain.normalizeSiriImportSettings(
      workspace.settings.siriImport,
      workspace.lists
    );
    return workspace.settings.siriImport;
  }

  function renderSiriTargetOptions(selectedId) {
    if (!siriImportTargetList) return;
    const options = [];
    const append = (list, depth) => {
      options.push(`<option value="${escapeHtml(list.id)}">${depth ? '　↳ ' : ''}${escapeHtml(list.name)}</option>`);
      childLists(list.id).forEach((child) => append(child, depth + 1));
    };
    const inbox = findList(INBOX_ID);
    if (inbox) append(inbox, 0);
    rootLists().forEach((list) => append(list, 0));
    siriImportTargetList.innerHTML = options.join('');
    siriImportTargetList.value = selectedId || INBOX_ID;
  }

  async function loadReminderLists(selectedId = '') {
    if (!siriImportReminderList) return [];
    if (typeof window.notchAPI?.listReminderLists !== 'function') return [];
    siriImportReminderList.innerHTML = '<option value="">读取中…</option>';
    const result = await window.notchAPI.listReminderLists().catch(() => null);
    const lists = Array.isArray(result?.lists) ? result.lists : [];
    siriImportReminderList.innerHTML = lists.length
      ? lists.map((list) => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name)}</option>`).join('')
      : '<option value="">没有读取到提醒列表</option>';
    if (selectedId && lists.some((list) => list.id === selectedId)) {
      siriImportReminderList.value = selectedId;
    }
    if (siriImportNote) {
      siriImportNote.textContent = result?.ok
        ? '只会读取所选列表中尚未完成的提醒。'
        : '无法读取提醒事项，请在系统设置的“隐私与安全性 → 提醒事项”中允许叮做。';
    }
    return lists;
  }

  async function openSiriImportDialog() {
    if (!siriImportDialog) return;
    const settings = siriImportSettings();
    renderSiriTargetOptions(settings.targetListId);
    if (siriImportAuto) siriImportAuto.checked = settings.enabled;
    siriImportDialog.hidden = false;
    await loadReminderLists(settings.reminderListId);
  }

  function closeSiriImportDialog() {
    if (siriImportDialog) siriImportDialog.hidden = true;
  }

  function importedReminderIds() {
    const settings = siriImportSettings();
    const ids = new Set(settings.importedIds);
    for (const task of [...workspace.tasks, ...(workspace.trash || [])]) {
      if (task.externalSource === 'apple-reminders' && task.externalId) ids.add(task.externalId);
    }
    return ids;
  }

  function renderSiriImportButtonState() {
    if (!siriImportButton) return;
    const settings = siriImportSettings();
    siriImportButton.textContent = settings.enabled ? 'Siri 导入 · 自动' : 'Siri 导入';
    siriImportButton.title = settings.enabled
      ? '自动检查已开启，应用运行时会定时读取系统提醒事项'
      : '自动检查未开启，仅在点击后手动导入';
  }

  function showSiriImportFeedback(importedTasks, count) {
    const title = `已同步 ${count} 条 Siri 待办`;
    const meta = importedTasks
      .map((task) => String(task?.text || '').trim())
      .filter(Boolean)
      .join(' · ');
    if (typeof window.NotchWorkspace?.showPeek === 'function') {
      window.NotchWorkspace.showPeek({
        title,
        meta,
        kind: 'siri',
        duration: 3200,
      }).catch?.(() => {});
      return;
    }
    showToast(title);
  }

  async function importSiriReminders(options = {}) {
    if (siriImportRunning) {
      siriImportQueued = true;
      return 0;
    }
    siriImportRunning = true;
    const settings = siriImportSettings();
    try {
      if (!settings.reminderListId) {
        if (options.manual) showToast('请先选择系统提醒事项列表');
        return 0;
      }
      if (typeof window.notchAPI?.listReminderItems !== 'function') return 0;
      const result = await window.notchAPI.listReminderItems(settings.reminderListId).catch(() => null);
      if (!result?.ok) {
        if (options.manual) showToast('读取提醒事项失败，请检查系统权限');
        return 0;
      }
      const imported = importedReminderIds();
      const importedTasks = [];
      for (const reminder of result.items || []) {
        if (reminder.completed || !reminder.id || !reminder.name) continue;
        if (imported.has(reminder.id)) continue;
        const deadline = Number.isFinite(Date.parse(String(reminder.due || '')))
          ? new Date(Date.parse(reminder.due)).toISOString()
          : Domain.defaultTodoDeadline(new Date());
        const task = createTask({
          text: reminder.name,
          listId: settings.targetListId,
          deadline,
          priority: reminder.priority || 'none',
          notes: reminder.body || '',
          externalSource: 'apple-reminders',
          externalId: reminder.id,
        });
        if (!task) continue;
        task.activity = appendActivity(
          task,
          'siri_imported',
          `从 Siri / 系统提醒事项导入${reminder.createdAt ? `，系统创建于 ${formatActivityTime(reminder.createdAt)}` : ''}`
        );
        imported.add(reminder.id);
        importedTasks.push(task);
        settings.importedIds.push(reminder.id);
      }
      const count = importedTasks.length;
      if (count) {
        settings.importedIds = [...new Set(settings.importedIds)].slice(-2000);
        writeWorkspace({ scheduleReminders: true });
        renderAll();
        showSiriImportFeedback(importedTasks, count);
      } else if (options.manual) {
        showToast('没有新的 Siri 待办');
      }
      return count;
    } finally {
      siriImportRunning = false;
      if (siriImportQueued) {
        siriImportQueued = false;
        setTimeout(() => importSiriReminders(), 120);
      }
    }
  }

  function scheduleSiriImport() {
    if (siriImportTimer) clearInterval(siriImportTimer);
    if (siriImportInitialTimer) clearTimeout(siriImportInitialTimer);
    siriImportTimer = null;
    siriImportInitialTimer = null;
    const settings = siriImportSettings();
    renderSiriImportButtonState();
    if (!settings.enabled || !settings.reminderListId) return;
    siriImportInitialTimer = setTimeout(() => {
      siriImportInitialTimer = null;
      importSiriReminders();
    }, 1500);
    siriImportTimer = setInterval(() => importSiriReminders(), 15000);
  }

  function appendReminderHistory(entry) {
    workspace.reminderHistory ||= [];
    workspace.reminderHistory.unshift({
      id: generateId('history'),
      taskId: String(entry.taskId || ''),
      title: String(entry.title || '').slice(0, 160),
      reminderId: String(entry.reminderId || ''),
      status: ['fired', 'snoozed', 'missed', 'dismissed'].includes(entry.status)
        ? entry.status
        : 'fired',
      at: String(entry.at || ''),
      firedAt: Math.max(0, Number(entry.firedAt) || Date.now()),
      soundId: ['none', 'soft', 'bright', 'alert'].includes(entry.soundId)
        ? entry.soundId
        : 'bright',
    });
    workspace.reminderHistory = workspace.reminderHistory.slice(0, 500);
  }

  function showToast(message, options) {
    if (typeof window.showStatusToast === 'function') {
      window.showStatusToast(message, options);
      return;
    }
    document.dispatchEvent(new CustomEvent('todo:status', { detail: { message, ...options } }));
  }

  function loadSelectedView() {
    try {
      const stored = localStorage.getItem(VIEW_KEY);
      if (stored && (VIEW_META[stored] || stored.startsWith('list:'))) return stored;
    } catch (error) {}
    return INBOX_ID;
  }

  let workspace = readWorkspace();
  let selectedView = loadSelectedView();
  let selectedTaskId = '';
  let query = '';
  let editingListId = '';
  let selectedTaskIds = new Set();
  let selectionAnchor = '';
  let detailSaveTimer = null;
  let draggedTaskId = '';
  let suppressTodoClickUntil = 0;
  let pickerContext = null;
  let calendarDayPopoverValue = null;
  let templateSourceTaskId = '';
  let strongReminderWarningOpen = false;
  let strongReminderTimeDraft = {
    kind: 'same',
    minutes: 0,
    at: '',
  };
  let expandedSubtaskTaskId = '';
  let expandedActivityTaskId = '';
  let dailyReviewTimer = null;
  let dailyReviewCustomTaskId = '';
  let blockDialogTaskId = '';
  let blockDraftReasonType = '';
  let desktopCardIds = new Set();
  let desktopCardsLoaded = false;
  let desktopCardsSyncTimer = null;
  let desktopDragTaskId = '';
  let siriImportTimer = null;
  let siriImportInitialTimer = null;
  let siriImportRunning = false;
  let siriImportQueued = false;
  const calendarInitial = new Date();
  let calendarYear = calendarInitial.getFullYear();
  let calendarMonth = calendarInitial.getMonth();

  function findTask(id) {
    return workspace.tasks.find((task) => task.id === String(id || '')) || null;
  }

  function acknowledgeTaskReminder(taskId) {
    const task = findTask(taskId);
    if (!task?.unhandledReminderAt) return false;
    const next = Domain.updateDetailedTodo(task, {
      unhandledReminderAt: '',
      unhandledReminderId: '',
    }, workspace.lists, Date.now());
    if (!next || !replaceTask(next, { scheduleReminders: false })) return false;
    renderBoard();
    return true;
  }

  function activityEntry(type, message, at = Date.now()) {
    return {
      id: generateId('activity'),
      type: String(type || 'general'),
      at: new Date(Number(at) || Date.now()).toISOString(),
      message: String(message || '').trim().slice(0, 320),
    };
  }

  function appendActivity(task, type, message, at = Date.now()) {
    const entry = activityEntry(type, message, at);
    if (!entry.message) return task?.activity || [];
    return [...(task?.activity || []), entry].slice(-800);
  }

  function formatActivityTime(value) {
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) return '';
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  function startOfLocalDay(value = Date.now()) {
    const date = new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  function endOfLocalDay(value = Date.now()) {
    const date = new Date(value);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1).getTime() - 1;
  }

  function localDateKey(value = Date.now()) {
    const date = new Date(value);
    return [
      date.getFullYear(),
      String(date.getMonth() + 1).padStart(2, '0'),
      String(date.getDate()).padStart(2, '0'),
    ].join('-');
  }

  function dateAtLocalTime(dayOffset, hour, minute = 0) {
    const now = new Date();
    return new Date(
      now.getFullYear(),
      now.getMonth(),
      now.getDate() + dayOffset,
      hour,
      minute,
      0,
      0
    ).getTime();
  }

  function nextFutureMinute(value) {
    const now = Date.now();
    const numeric = Number(value);
    const parsed = Number.isFinite(numeric) && numeric > 0
      ? numeric
      : Date.parse(String(value || ''));
    if (Number.isFinite(parsed) && parsed > now) return parsed;
    const next = new Date(now + 60 * 1000);
    next.setSeconds(0, 0);
    return next.getTime();
  }

  function findList(id) {
    return workspace.lists.find((list) => list.id === String(id || '')) || null;
  }

  function rootLists() {
    return workspace.lists.filter((list) => list.id !== INBOX_ID && !list.parentId);
  }

  function childLists(parentId) {
    return workspace.lists.filter((list) => list.parentId === String(parentId || ''));
  }

  function listPath(listId) {
    const list = findList(listId);
    if (!list) return '收集箱';
    if (!list.parentId) return list.name;
    return `${findList(list.parentId)?.name || '未分类'} / ${list.name}`;
  }

  function viewListId() {
    return selectedView.startsWith('list:') ? selectedView.slice(5) : '';
  }

  function resolveNewTaskListId() {
    const listId = viewListId();
    return listId && findList(listId) ? listId : INBOX_ID;
  }

  function parseQuickTask() {
    return Domain.parseTodoQuickInput(quickTitleInput?.value || '', Date.now(), workspace.lists);
  }

  function renderQuickPreview() {
    if (!quickPreview) return;
    const parsed = parseQuickTask();
    if (!parsed || !parsed.matched.length) {
      quickPreview.hidden = true;
      quickPreview.replaceChildren();
      return;
    }
    const chips = [];
    if (parsed.text) chips.push(['任务', parsed.text]);
    if (parsed.listId) chips.push(['分类', listPath(parsed.listId)]);
    if (parsed.deadline && !quickDeadlineInput?.value) chips.push(['截止', formatDue(parsed.deadline)]);
    if (parsed.priority !== 'none') chips.push(['优先级', PRIORITY_LABELS[parsed.priority]]);
    parsed.reminderOffsets.forEach((offset) => chips.push(['提醒', reminderLabel(offset)]));
    quickPreview.innerHTML = chips.map(([label, value]) => `
      <span><b>${escapeHtml(label)}</b>${escapeHtml(value)}</span>
    `).join('');
    quickPreview.hidden = chips.length === 0;
  }

  function toLocalInput(iso) {
    const date = new Date(String(iso || ''));
    if (!Number.isFinite(date.getTime())) return '';
    const pad = (value) => String(value).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
  }

  function fromLocalInput(value) {
    if (!value) return '';
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : '';
  }

  function toTodoDateDisplay(iso) {
    const local = toLocalInput(iso);
    return local ? local.replace('T', ' ').replace(/-/g, '/') : '';
  }

  function sameTodoMinute(left, right) {
    const leftTime = Date.parse(String(left || ''));
    const rightTime = Date.parse(String(right || ''));
    if (!Number.isFinite(leftTime) && !Number.isFinite(rightTime)) return true;
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return false;
    return Math.floor(leftTime / 60000) === Math.floor(rightTime / 60000);
  }

  function ensureTodoPickerOptions() {
    if (pickerHour && !pickerHour.options.length) {
      for (let hour = 0; hour < 24; hour += 1) {
        pickerHour.add(new Option(String(hour).padStart(2, '0'), String(hour)));
      }
    }
    if (pickerMinute && !pickerMinute.options.length) {
      for (let minute = 0; minute < 60; minute += 1) {
        pickerMinute.add(new Option(String(minute).padStart(2, '0'), String(minute)));
      }
    }
  }

  function pickerInitialDate(input) {
    const parsed = new Date(String(input?.value || ''));
    if (Number.isFinite(parsed.getTime())) return parsed;
    const now = new Date();
    now.setSeconds(0, 0);
    now.setMinutes(Math.ceil(now.getMinutes() / 5) * 5, 0, 0);
    return now;
  }

  function applyTodoPickerValue() {
    if (!pickerContext?.input) return;
    pickerContext.input.value = toTodoDateDisplay(pickerContext.value.toISOString());
    pickerContext.input.dispatchEvent(new Event('input', { bubbles: true }));
    pickerContext.input.dispatchEvent(new Event('change', { bubbles: true }));
  }

  function renderTodoPicker() {
    if (!picker || !pickerContext) return;
    const selected = pickerContext.value;
    const year = selected.getFullYear();
    const month = selected.getMonth();
    const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
    const days = new Date(year, month + 1, 0).getDate();
    const today = new Date();
    if (pickerMonth) pickerMonth.textContent = `${year}年 ${month + 1}月`;
    pickerGrid?.replaceChildren();
    for (let index = 0; index < firstWeekday; index += 1) {
      pickerGrid.append(document.createElement('span'));
    }
    for (let day = 1; day <= days; day += 1) {
      const button = document.createElement('button');
      button.type = 'button';
      button.textContent = String(day);
      button.dataset.todoPickerDay = String(day);
      button.classList.toggle('selected', day === selected.getDate());
      button.classList.toggle(
        'today',
        year === today.getFullYear() && month === today.getMonth() && day === today.getDate()
      );
      pickerGrid.append(button);
    }
    if (pickerHour) pickerHour.value = String(selected.getHours());
    if (pickerMinute) pickerMinute.value = String(selected.getMinutes());
  }

  function positionTodoPicker(input) {
    if (!picker || !input) return;
    const rect = input.getBoundingClientRect();
    const width = picker.offsetWidth || 236;
    const height = picker.offsetHeight || 280;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.right - width));
    const top = rect.bottom + height + 8 <= window.innerHeight
      ? rect.bottom + 6
      : Math.max(12, rect.top - height - 6);
    picker.style.left = `${Math.round(left)}px`;
    picker.style.top = `${Math.round(top)}px`;
  }

  function openTodoPicker(input) {
    if (!picker || !input || input.disabled) return;
    ensureTodoPickerOptions();
    pickerContext = {
      input,
      value: pickerInitialDate(input),
    };
    picker.hidden = false;
    renderTodoPicker();
    requestAnimationFrame(() => positionTodoPicker(input));
  }

  function closeTodoPicker() {
    if (picker) picker.hidden = true;
    pickerContext = null;
  }

  function moveTodoPickerMonth(offset) {
    if (!pickerContext) return;
    const day = pickerContext.value.getDate();
    pickerContext.value.setDate(1);
    pickerContext.value.setMonth(pickerContext.value.getMonth() + offset);
    pickerContext.value.setDate(Math.min(day, new Date(
      pickerContext.value.getFullYear(),
      pickerContext.value.getMonth() + 1,
      0
    ).getDate()));
    renderTodoPicker();
  }

  function formatDue(iso) {
    const date = new Date(String(iso || ''));
    if (!Number.isFinite(date.getTime())) return '';
    const now = new Date();
    const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1);
    const targetDay = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    const time = new Intl.DateTimeFormat('zh-CN', {
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
    if (targetDay.getTime() === today.getTime()) return `今天 ${time}`;
    if (targetDay.getTime() === tomorrow.getTime()) return `明天 ${time}`;
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(date);
  }

  function taskStatus(task) {
    return ['todo', 'in_progress', 'blocked', 'done'].includes(task?.status)
      ? task.status
      : task?.done === true ? 'done' : 'todo';
  }

  function statusLabel(value) {
    return STATUS_LABELS[value] || STATUS_LABELS.todo;
  }

  function renderBlockSummary(task) {
    if (!blockSummary) return;
    const blocked = taskStatus(task) === 'blocked';
    blockSummary.hidden = !blocked;
    if (!blocked) return;
    const reasonType = BLOCK_REASON_LABELS[task.blockReasonType] || '其他';
    blockSummaryType.textContent = `受阻 · ${reasonType}`;
    blockSummaryReason.textContent = task.blockReason || '尚未填写具体说明';
    blockSummaryNext.textContent = task.nextAction ? `下一步：${task.nextAction}` : '';
    blockSummaryNext.hidden = !task.nextAction;
  }

  function setBlockReasonSelection(reasonType) {
    blockDraftReasonType = BLOCK_REASON_LABELS[reasonType] ? reasonType : '';
    blockReasonOptions?.querySelectorAll('[data-block-reason]').forEach((button) => {
      button.classList.toggle('active', button.dataset.blockReason === blockDraftReasonType);
    });
  }

  function openBlockDialog(taskId = selectedTaskId) {
    const task = findTask(taskId);
    if (!task || !blockDialog) return;
    blockDialogTaskId = task.id;
    setBlockReasonSelection(task.blockReasonType || '');
    blockReasonInput.value = task.blockReason || '';
    blockNextActionInput.value = task.nextAction || '';
    if (blockDialogError) {
      blockDialogError.hidden = true;
      blockDialogError.textContent = '';
    }
    blockDialog.hidden = false;
    requestAnimationFrame(() => blockReasonInput.focus({ preventScroll: true }));
  }

  function closeBlockDialog() {
    if (blockDialog) blockDialog.hidden = true;
    blockDialogTaskId = '';
    blockDraftReasonType = '';
    if (detailState && selectedTaskId) {
      const task = findTask(selectedTaskId);
      detailState.value = taskStatus(task);
    }
  }

  function reminderLabel(minutes) {
    const value = Math.max(0, Math.round(Number(minutes) || 0));
    if (value === 0) return '到期时';
    if (value < 60) return `提前 ${value} 分钟`;
    if (value < 1440) {
      const hours = value / 60;
      return `提前 ${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`;
    }
    const days = value / 1440;
    return `提前 ${Number.isInteger(days) ? days : days.toFixed(1)} 天`;
  }

  function taskMatchesCurrentView(task) {
    return Domain.filterTodoTasks(
      [task],
      workspace.lists,
      selectedView,
      query,
      Date.now()
    ).length === 1;
  }

  function updateViewCounts(counts) {
    const extraCounts = {
      calendar: workspace.tasks.filter((task) => task.done !== true && task.deadline).length,
      history: workspace.reminderHistory?.length || 0,
      trash: workspace.trash?.length || 0,
    };
    smartNav?.querySelectorAll('[data-todo-view]').forEach((button) => {
      const view = button.dataset.todoView;
      const count = extraCounts[view] ?? (Number(counts?.views?.[view]) || 0);
      const countElement = smartNav.querySelector(`[data-todo-view-count="${view}"]`);
      if (countElement) countElement.textContent = String(count);
      button.classList.toggle('active', selectedView === view);
      button.setAttribute('aria-current', selectedView === view ? 'true' : 'false');
    });
  }

  function renderListParentOptions() {
    if (!listParentSelect) return;
    const selected = listParentSelect.value;
    listParentSelect.innerHTML = '<option value="">作为大类</option>' + rootLists()
      .map((list) => `<option value="${escapeHtml(list.id)}">${escapeHtml(list.name)} 下的小类</option>`)
      .join('');
    if ([...listParentSelect.options].some((option) => option.value === selected)) {
      listParentSelect.value = selected;
    }
  }

  function renderListTree(counts) {
    if (!listTree) return;
    const rows = [];
    const renderRow = (list, depth) => {
      const editing = editingListId === list.id;
      const selected = selectedView === `list:${list.id}`;
      const count = Number(counts?.lists?.[list.id]) || 0;
      if (editing) {
        rows.push(`
          <div class="todo-list-editor" data-list-id="${escapeHtml(list.id)}" data-depth="${depth}">
            <div class="todo-list-row is-editing">
              <input class="todo-list-rename" value="${escapeHtml(list.name)}" maxlength="24" aria-label="重命名分类" />
              <button type="button" class="todo-list-save" data-todo-list-rename-save="${escapeHtml(list.id)}" aria-label="保存分类设置">✓</button>
            </div>
            <span class="todo-list-setting-label">默认提醒</span>
            <div class="todo-list-default-reminders">
              ${[10, 60, 1440].map((offset) => `
                <button type="button" data-list-setting-reminder="${offset}"${list.defaultReminderOffsets.includes(offset) ? ' class="active"' : ''}>${escapeHtml(reminderLabel(offset).replace('提前 ', ''))}</button>
              `).join('')}
            </div>
            <div class="todo-list-form-row">
              <select data-list-setting-sound aria-label="分类默认提示音">
                ${['bright', 'soft', 'alert', 'none'].map((soundId) => `
                  <option value="${soundId}"${list.defaultSoundId === soundId ? ' selected' : ''}>${soundId === 'bright' ? '清脆' : soundId === 'soft' ? '柔和' : soundId === 'alert' ? '强提醒' : '静音'}</option>
                `).join('')}
              </select>
              <select data-list-setting-sort aria-label="分类排序方式">
                <option value="auto"${list.sortMode !== 'manual' ? ' selected' : ''}>自动</option>
                <option value="manual"${list.sortMode === 'manual' ? ' selected' : ''}>手动</option>
              </select>
            </div>
          </div>
        `);
        return;
      }
      rows.push(`
        <div class="todo-list-row${selected ? ' active' : ''}" data-depth="${depth}">
          <button class="todo-list-view" type="button" data-todo-list-view="${escapeHtml(list.id)}" aria-current="${selected ? 'true' : 'false'}">
            <span class="todo-list-branch" aria-hidden="true">${depth ? '↳' : '•'}</span>
            <span class="todo-list-name">${escapeHtml(list.name)}</span>
            <b>${count}</b>
          </button>
          <span class="todo-list-actions">
            <button type="button" data-todo-list-edit="${escapeHtml(list.id)}" aria-label="重命名${escapeHtml(list.name)}" title="重命名">✎</button>
            <button type="button" data-todo-list-delete="${escapeHtml(list.id)}" aria-label="删除${escapeHtml(list.name)}" title="删除">×</button>
          </span>
        </div>
      `);
    };
    rootLists().forEach((list) => {
      renderRow(list, 0);
      childLists(list.id).forEach((child) => renderRow(child, 1));
    });
    listTree.innerHTML = rows.join('') || '<div class="todo-list-empty">还没有分类，点击右上角添加</div>';
  }

  function renderDetailListOptions(selectedListId) {
    if (!detailList) return;
    const options = [];
    const append = (list, depth) => {
      options.push(`<option value="${escapeHtml(list.id)}">${depth ? '　↳ ' : ''}${escapeHtml(list.name)}</option>`);
      childLists(list.id).forEach((child) => append(child, depth + 1));
    };
    const inbox = findList(INBOX_ID);
    if (inbox) append(inbox, 0);
    rootLists().forEach((list) => append(list, 0));
    detailList.innerHTML = options.join('');
    detailList.value = selectedListId || INBOX_ID;
  }

  function renderSavedFilters() {
    if (!savedFilters || !savedFilterList) return;
    const filters = workspace.settings?.savedFilters || [];
    savedFilters.hidden = filters.length === 0;
    savedFilterList.innerHTML = filters.map((filter) => `
      <div class="todo-saved-filter-row">
        <button type="button" data-saved-filter-apply="${escapeHtml(filter.id)}">
          <span>${escapeHtml(filter.name)}</span>
          <small>${escapeHtml(filter.view)}${filter.query ? ` · ${escapeHtml(filter.query)}` : ''}</small>
        </button>
        <button type="button" data-saved-filter-delete="${escapeHtml(filter.id)}" aria-label="删除筛选">×</button>
      </div>
    `).join('');
  }

  function renderTemplateSelect() {
    if (!templateSelect) return;
    const templates = workspace.settings?.templates || [];
    templateSelect.innerHTML = '<option value="">模板…</option>' + templates
      .map((template) => `<option value="${escapeHtml(template.id)}">${escapeHtml(template.name)}</option>`)
      .join('');
  }

  function currentFilteredTasks() {
    return Domain.filterTodoTasks(
      workspace.tasks,
      workspace.lists,
      selectedView,
      query,
      Date.now()
    );
  }

  function taskRowHtml(task) {
    const due = formatDue(task.deadline);
    const overdue = task.done !== true && task.deadline && Date.parse(task.deadline) < Date.now();
    const progress = Domain.todoChecklistProgress(task);
    const selected = selectedTaskIds.has(task.id) ? ' multi-selected' : '';
    const active = selectedTaskId === task.id ? ' is-open' : '';
    const priority = task.priority && task.priority !== 'none' ? task.priority : '';
    const taskStatus = ['todo', 'in_progress', 'blocked', 'done'].includes(task.status)
      ? task.status
      : task.done === true ? 'done' : 'todo';
    const blockedLabel = taskStatus === 'blocked'
      ? BLOCK_REASON_LABELS[task.blockReasonType] || '已记录原因'
      : '';
    const statusText = statusLabel(taskStatus);
    const statusDetail = taskStatus === 'blocked' ? ` · ${blockedLabel}` : '';
    const desktopActive = desktopCardIds.has(task.id);
    const selectedList = viewListId() ? findList(viewListId()) : null;
    const manualSort = selectedList?.sortMode === 'manual' && !query;
    const subtasksExpanded = expandedSubtaskTaskId === task.id && progress.total > 0;
    const unhandledReminder = task.done !== true && Number.isFinite(Date.parse(String(task.unhandledReminderAt || '')));
    return `
      <div class="todo-task-row todo-item${task.done ? ' done' : ''}${selected}${active}${task.pinned ? ' is-pinned' : ''}${taskStatus === 'blocked' ? ' is-blocked' : ''}${manualSort ? ' is-manual' : ''}${unhandledReminder ? ' is-unhandled' : ''}" data-task-id="${escapeHtml(task.id)}" data-line-sidebar-item role="listitem" draggable="${manualSort}">
        <span class="todo-task-drag" aria-hidden="true">⋮⋮</span>
        <button class="checkbox" type="button" data-todo-action="toggle" aria-label="${task.done ? '恢复' : '完成'}：${escapeHtml(task.text)}" aria-pressed="${task.done}">
          <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
        </button>
        <div class="todo-task-main" data-todo-action="open" role="button" tabindex="0" aria-label="打开任务详情：${escapeHtml(task.text)}">
          <div class="todo-task-title-row">
            <span class="todo-task-title">${escapeHtml(task.text)}</span>
            <i class="todo-status-pill" data-status="${escapeHtml(taskStatus)}" title="${escapeHtml(taskStatus === 'blocked' && task.blockReason ? task.blockReason : statusText)}">${escapeHtml(statusText)}${escapeHtml(statusDetail)}</i>
          </div>
          <span class="todo-task-meta">
            <span class="todo-task-list-name">${escapeHtml(listPath(task.listId))}</span>
            ${taskStatus === 'blocked' && task.blockReason ? `<span class="todo-block-reason-preview" title="${escapeHtml(task.blockReason)}">${escapeHtml(task.blockReason)}</span>` : ''}
            ${priority ? `<i class="todo-priority" data-priority="${escapeHtml(priority)}">${escapeHtml(PRIORITY_LABELS[priority])}</i>` : ''}
            ${task.strongReminderAt
              ? `<i class="todo-strong-badge">强提醒 ${escapeHtml(formatDue(task.strongReminderAt))}</i>`
              : ''}
            ${unhandledReminder ? '<i class="todo-unhandled-badge">提醒未处理</i>' : ''}
            ${progress.total ? `
              <button class="todo-subtask-count" type="button" data-todo-action="toggle-subtasks" aria-expanded="${subtasksExpanded}" aria-label="${subtasksExpanded ? '收起' : '展开'}子任务">
                <span>${progress.done}/${progress.total}</span>
                <svg viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" aria-hidden="true"><path d="m3 4.5 3 3 3-3"/></svg>
              </button>
            ` : ''}
          </span>
        </div>
        ${due ? `<time class="todo-task-due" datetime="${escapeHtml(task.deadline)}"${overdue ? ' data-overdue="true"' : ''}>${escapeHtml(due)}</time>` : '<span class="todo-task-due is-empty">无日期</span>'}
        <button class="todo-task-desktop${desktopActive ? ' active' : ''}" type="button" data-todo-action="desktop" draggable="true" data-desktop-drag="${escapeHtml(task.id)}" aria-label="${desktopActive ? '桌面卡片已创建' : '发送到桌面'}：${escapeHtml(task.text)}" title="${desktopActive ? '桌面卡片已创建，拖到外部可重新定位' : '点击发送到桌面，或拖到桌面'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><rect x="3.5" y="4.5" width="17" height="12" rx="2"/><path d="M8 20h8M12 16.5V20"/></svg>
        </button>
        <button class="todo-task-pin" type="button" data-todo-action="pin" aria-label="${task.pinned ? '取消置顶' : '置顶'}：${escapeHtml(task.text)}" aria-pressed="${task.pinned}" title="${task.pinned ? '取消置顶' : '置顶'}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="m9 4 6 0-.8 5 3.8 3v2H6v-2l3.8-3L9 4Z"/><path d="M12 14v6"/></svg>
        </button>
        ${subtasksExpanded ? `
          <div class="todo-inline-subtasks" data-inline-subtasks="${escapeHtml(task.id)}">
            ${task.subtasks.map((subtask) => `
              <div class="todo-inline-subtask${subtask.done ? ' done' : ''}" data-inline-subtask-id="${escapeHtml(subtask.id)}">
                <button class="checkbox" type="button" data-inline-subtask-action="toggle" aria-label="${subtask.done ? '恢复' : '完成'}子任务：${escapeHtml(subtask.text)}" aria-pressed="${subtask.done}">
                  <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
                </button>
                <span>${escapeHtml(subtask.text)}</span>
              </div>
            `).join('')}
          </div>
        ` : ''}
      </div>
    `;
  }

  function taskEmptyHtml() {
    return `
      <div class="todo-task-empty">
        <span aria-hidden="true">✓</span>
        <strong>${query ? '没有匹配的任务' : '这里暂时没有任务'}</strong>
        <p>${query ? '换个关键词试试。' : '从上方输入任务，回车即可添加。'}</p>
      </div>
    `;
  }

  function renderTaskList() {
    if (!taskList) return;
    const tasks = currentFilteredTasks();
    if (!tasks.length) {
      taskList.innerHTML = taskEmptyHtml();
      return;
    }
    taskList.innerHTML = tasks.map(taskRowHtml).join('');
  }

  function calendarTasksForMonth() {
    return workspace.tasks
      .filter((task) => {
        if (task.done === true || !task.deadline) return false;
        const date = new Date(task.deadline);
        return date.getFullYear() === calendarYear && date.getMonth() === calendarMonth;
      })
      .sort((left, right) => Date.parse(left.deadline) - Date.parse(right.deadline));
  }

  function calendarTasksForDay(day) {
    return calendarTasksForMonth().filter((task) => new Date(task.deadline).getDate() === Number(day));
  }

  function closeCalendarDayPopover() {
    if (calendarDayPopover) calendarDayPopover.hidden = true;
    calendarDayPopoverValue = null;
  }

  function positionCalendarDayPopover(anchor) {
    if (!calendarDayPopover || !anchor) return;
    const rect = anchor.getBoundingClientRect();
    const width = calendarDayPopover.offsetWidth || 244;
    const height = calendarDayPopover.offsetHeight || 220;
    const left = Math.max(12, Math.min(window.innerWidth - width - 12, rect.left));
    const top = rect.bottom + height + 8 <= window.innerHeight
      ? rect.bottom + 5
      : Math.max(12, rect.top - height - 5);
    calendarDayPopover.style.left = `${Math.round(left)}px`;
    calendarDayPopover.style.top = `${Math.round(top)}px`;
  }

  function openCalendarDayPopover(day, anchor) {
    if (!calendarDayPopover || !calendarDayList) return;
    const tasks = calendarTasksForDay(day);
    if (!tasks.length) return;
    const date = new Date(calendarYear, calendarMonth, Number(day));
    calendarDayPopoverValue = { day: Number(day), date };
    if (calendarDayTitle) {
      calendarDayTitle.textContent = `${calendarMonth + 1}月${day}日 · ${tasks.length} 项`;
    }
    calendarDayList.innerHTML = tasks.map((task) => `
      <button type="button" class="todo-calendar-day-task" data-calendar-popover-task="${escapeHtml(task.id)}">
        <time>${escapeHtml(new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(task.deadline)))}</time>
        <span>${escapeHtml(task.text)}</span>
      </button>
    `).join('');
    calendarDayPopover.hidden = false;
    requestAnimationFrame(() => positionCalendarDayPopover(anchor));
  }

  function renderCalendarView() {
    if (!taskList) return;
    const firstWeekday = (new Date(calendarYear, calendarMonth, 1).getDay() + 6) % 7;
    const days = new Date(calendarYear, calendarMonth + 1, 0).getDate();
    const byDay = new Map();
    calendarTasksForMonth().forEach((task) => {
      const day = new Date(task.deadline).getDate();
      if (!byDay.has(day)) byDay.set(day, []);
      byDay.get(day).push(task);
    });
    const today = new Date();
    const cells = [];
    for (let index = 0; index < firstWeekday; index += 1) {
      cells.push('<div class="todo-calendar-day is-empty"></div>');
    }
    for (let day = 1; day <= days; day += 1) {
      const tasks = byDay.get(day) || [];
      cells.push(`
        <div class="todo-calendar-day${today.getFullYear() === calendarYear && today.getMonth() === calendarMonth && today.getDate() === day ? ' is-today' : ''}" data-calendar-day="${day}">
          <button class="todo-calendar-day-number" type="button" data-calendar-pick="${day}">${day}</button>
          <div class="todo-calendar-day-tasks">
            ${tasks.slice(0, 3).map((task) => `
              <button type="button" data-calendar-task="${escapeHtml(task.id)}" title="${escapeHtml(task.text)}">
                <time>${escapeHtml(new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(task.deadline)))}</time>
                <span>${escapeHtml(task.text)}</span>
              </button>
            `).join('')}
            ${tasks.length > 3 ? `<button class="todo-calendar-more" type="button" data-calendar-more="${day}">还有 ${tasks.length - 3} 项</button>` : ''}
          </div>
        </div>
      `);
    }
    const used = firstWeekday + days;
    const trailing = (7 - used % 7) % 7;
    for (let index = 0; index < trailing; index += 1) {
      cells.push('<div class="todo-calendar-day is-empty"></div>');
    }
    taskList.innerHTML = `<div class="todo-calendar-view">${cells.join('')}</div>`;
  }

  function historyLabel(status) {
    return {
      fired: '已提醒',
      missed: '已错过',
      snoozed: '已稍后',
      dismissed: '已关闭',
    }[status] || '已提醒';
  }

  function renderHistoryView() {
    const rows = workspace.reminderHistory || [];
    taskList.innerHTML = rows.length
      ? `<div class="todo-history-list">${rows.map((item) => {
        const task = findTask(item.taskId);
        return `
          <div class="todo-history-row" data-history-id="${escapeHtml(item.id)}">
            <span class="todo-history-status" data-status="${escapeHtml(item.status)}">${escapeHtml(historyLabel(item.status))}</span>
            <button type="button" data-history-task="${escapeHtml(item.taskId)}"${task ? '' : ' disabled'}>
              <strong>${escapeHtml(item.title)}</strong>
              <small>${escapeHtml(new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(item.firedAt || Date.now())))}</small>
            </button>
          </div>
        `;
      }).join('')}</div>`
      : `<div class="todo-task-empty"><span aria-hidden="true">◷</span><strong>还没有提醒记录</strong><p>提醒触发、错过或稍后后会显示在这里。</p></div>`;
  }

  function renderTrashView() {
    const rows = workspace.trash || [];
    taskList.innerHTML = rows.length
      ? `<div class="todo-trash-list">${rows.map((task) => `
          <div class="todo-trash-row" data-trash-id="${escapeHtml(task.id)}">
            <div>
              <strong>${escapeHtml(task.text)}</strong>
              <small>删除于 ${escapeHtml(new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date(task.deletedAt)))}</small>
            </div>
            <button type="button" data-trash-restore="${escapeHtml(task.id)}">恢复</button>
            <button type="button" data-trash-delete="${escapeHtml(task.id)}">彻底删除</button>
          </div>
        `).join('')}</div>`
      : `<div class="todo-task-empty"><span aria-hidden="true">×</span><strong>回收站是空的</strong><p>删除的任务会在这里保留 30 天。</p></div>`;
  }

  function refreshTaskRow(task, reorder = false) {
    if (!taskList || !task) return;
    const existing = taskList.querySelector(`[data-task-id="${CSS.escape(task.id)}"]`);
    const shouldReorder = !existing || reorder;
    if (!taskMatchesCurrentView(task)) {
      existing?.remove();
    } else {
      const html = taskRowHtml(task);
      if (existing) existing.outerHTML = html;
      else taskList.insertAdjacentHTML('beforeend', html);
    }
    if (!shouldReorder) return;
    const visibleTasks = currentFilteredTasks();
    if (!visibleTasks.length) {
      taskList.innerHTML = taskEmptyHtml();
      return;
    }
    taskList.querySelector('.todo-task-empty')?.remove();
    const fragment = document.createDocumentFragment();
    visibleTasks.forEach((visibleTask) => {
      const row = taskList.querySelector(`[data-task-id="${CSS.escape(visibleTask.id)}"]`);
      if (row) fragment.append(row);
    });
    taskList.append(fragment);
  }

  function updateOpenTaskRow(taskId) {
    taskList?.querySelector('.todo-task-row.is-open')?.classList.remove('is-open');
    taskList?.querySelector(`[data-task-id="${CSS.escape(taskId)}"]`)?.classList.add('is-open');
  }

  function navigateTodoTasks(offset) {
    const tasks = currentFilteredTasks();
    if (!tasks.length) return;
    const currentIndex = tasks.findIndex((task) => task.id === selectedTaskId);
    const nextIndex = currentIndex < 0
      ? (offset > 0 ? 0 : tasks.length - 1)
      : Math.max(0, Math.min(tasks.length - 1, currentIndex + offset));
    const next = tasks[nextIndex];
    selectedTaskId = next.id;
    renderDetail(next);
    updateOpenTaskRow(next.id);
    taskList.querySelector(`[data-task-id="${CSS.escape(next.id)}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }

  function renderBoard() {
    const selectedList = viewListId() ? findList(viewListId()) : null;
    const specialView = ['calendar', 'history', 'trash'].includes(selectedView);
    const meta = viewListId()
      ? { kicker: '分类', title: listPath(viewListId()), description: '只显示这个分类及其小类中的任务' }
      : VIEW_META[selectedView] || VIEW_META.inbox;
    const tasks = specialView ? [] : currentFilteredTasks();
    if (viewKicker) viewKicker.textContent = meta.kicker;
    if (viewTitle) {
      viewTitle.textContent = selectedView === 'calendar'
        ? `${calendarYear}年 ${calendarMonth + 1}月`
        : meta.title;
    }
    if (viewSummary) {
      if (selectedView === 'calendar') {
        viewSummary.textContent = `${calendarTasksForMonth().length} 项任务 · ${meta.description}`;
      } else if (selectedView === 'history') {
        viewSummary.textContent = `${workspace.reminderHistory?.length || 0} 条记录 · ${meta.description}`;
      } else if (selectedView === 'trash') {
        viewSummary.textContent = `${workspace.trash?.length || 0} 项已删除 · ${meta.description}`;
      } else {
        viewSummary.textContent = query
        ? `${tasks.length} 项匹配 · ${meta.description}`
        : `${tasks.length} 项${selectedView === 'completed' ? '已完成' : selectedView === 'all' ? '全部' : '待办'} · ${meta.description}`;
      }
    }
    bulkDeleteButton.hidden = specialView || selectedTaskIds.size === 0;
    if (!bulkDeleteButton.hidden) {
      bulkDeleteButton.textContent = `删除所选 ${selectedTaskIds.size}`;
      bulkDeleteButton.setAttribute('aria-label', `删除所选 ${selectedTaskIds.size} 项`);
    }
    if (sortToggle) {
      sortToggle.hidden = !selectedList || specialView;
      sortToggle.textContent = selectedList?.sortMode === 'manual' ? '手动排序' : '自动排序';
      sortToggle.setAttribute('aria-label', selectedList?.sortMode === 'manual' ? '切换为自动排序' : '切换为手动排序');
    }
    if (calendarPrevious) calendarPrevious.hidden = selectedView !== 'calendar';
    if (calendarNext) calendarNext.hidden = selectedView !== 'calendar';
    if (missedPolicySelect) {
      missedPolicySelect.hidden = selectedView !== 'history';
      missedPolicySelect.value = workspace.settings?.missedReminderPolicy || '24h';
    }
    if (saveFilterButton) saveFilterButton.hidden = specialView || !query;
    if (templateSelect) templateSelect.hidden = selectedView === 'history' || selectedView === 'trash';
    const searchWrap = searchInput?.closest('.todo-search');
    if (searchWrap) searchWrap.hidden = specialView;
    if (quickAddForm) quickAddForm.hidden = selectedView === 'history' || selectedView === 'trash';
    if (quickPreview) {
      if (selectedView === 'history' || selectedView === 'trash') quickPreview.hidden = true;
      else requestAnimationFrame(renderQuickPreview);
    }
    if (dataToolbar) dataToolbar.hidden = false;
    if (selectedView === 'calendar') renderCalendarView();
    else if (selectedView === 'history') renderHistoryView();
    else if (selectedView === 'trash') renderTrashView();
    else renderTaskList();
  }

  function renderReminderPresets(task) {
    if (!reminderPresets) return;
    const deadlineValid = Boolean(task && Number.isFinite(Date.parse(String(task.deadline || ''))));
    const offsets = new Map();
    const presets = [0, 1, 10, 60, 1440];
    const oneTime = [];
    (task?.reminders || []).forEach((reminder) => {
      if (Number.isFinite(Number(reminder.offsetMinutes))) {
        offsets.set(Number(reminder.offsetMinutes), true);
        presets.push(Number(reminder.offsetMinutes));
      } else if (
        reminder.strong !== true
        && Number.isFinite(Date.parse(String(reminder.at || '')))
      ) {
        oneTime.push(reminder);
      }
    });
    const unique = [...new Set(presets)].sort((left, right) => left - right);
    reminderPresets.innerHTML = unique.map((offset) => `
      <button type="button" data-reminder-offset="${offset}"${offsets.has(offset) ? ' class="active"' : ''}${deadlineValid ? '' : ' disabled'}>${escapeHtml(reminderLabel(offset))}</button>
    `).join('') + oneTime.map((reminder) => `
      <button type="button" data-reminder-id="${escapeHtml(reminder.id)}" class="active">稍后 ${escapeHtml(formatDue(reminder.at))}</button>
    `).join('');
    if (reminderHint) {
      reminderHint.textContent = deadlineValid
        ? '提醒会由主进程常驻调度，面板收起后仍然生效。'
        : '先设置截止时间，再添加提醒。';
    }
    if (reminderAddButton) reminderAddButton.disabled = !deadlineValid;
    if (reminderMinutes) reminderMinutes.disabled = !deadlineValid;
  }

  function renderSubtasks(task) {
    if (!subtaskList) return;
    const subtasks = Array.isArray(task?.subtasks) ? task.subtasks : [];
    const progress = Domain.todoChecklistProgress(task);
    if (subtaskProgress) subtaskProgress.textContent = `${progress.done} / ${progress.total}`;
    subtaskList.innerHTML = subtasks.length
      ? subtasks.map((subtask) => `
          <div class="todo-subtask-row${subtask.done ? ' done' : ''}" data-subtask-id="${escapeHtml(subtask.id)}" data-line-sidebar-item>
            <button class="checkbox" type="button" data-todo-subtask-action="toggle" aria-label="${subtask.done ? '恢复' : '完成'}子任务：${escapeHtml(subtask.text)}" aria-pressed="${subtask.done}">
              <svg viewBox="0 0 12 12" fill="none" xmlns="http://www.w3.org/2000/svg"><path d="M2.5 6L5 8.5L9.5 3.5" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>
            </button>
            <span>${escapeHtml(subtask.text)}</span>
            <button type="button" data-todo-subtask-action="delete" aria-label="删除子任务：${escapeHtml(subtask.text)}">×</button>
          </div>
        `).join('')
      : '<div class="todo-subtask-empty">还没有子任务</div>';
  }

  function renderActivity(task) {
    const entries = [...(task?.activity || [])];
    const expanded = expandedActivityTaskId === task?.id;
    if (activityToggle) activityToggle.setAttribute('aria-expanded', String(expanded));
    if (activityPreview) {
      const latest = entries[entries.length - 1];
      activityPreview.textContent = latest
        ? `${formatActivityTime(latest.at)} · ${latest.message}`
        : '暂无记录';
    }
    if (!activityList) return;
    activityList.hidden = !expanded;
    if (!expanded) {
      activityList.replaceChildren();
      return;
    }
    activityList.innerHTML = entries.length
      ? entries.slice().reverse().map((entry) => `
          <div class="todo-activity-row">
            <time>${escapeHtml(formatActivityTime(entry.at))}</time>
            <span>${escapeHtml(entry.message)}</span>
          </div>
        `).join('')
      : '<div class="todo-subtask-empty">还没有活动记录</div>';
  }

  function unfinishedDailyReviewTasks() {
    const end = endOfLocalDay();
    return workspace.tasks
      .filter((task) => (
        task.done !== true
        && task.deadline
        && Date.parse(task.deadline) <= end
      ))
      .sort((left, right) => Date.parse(left.deadline) - Date.parse(right.deadline));
  }

  function dailyReviewSummaryData(tasks = unfinishedDailyReviewTasks()) {
    const start = startOfLocalDay();
    const completed = workspace.tasks.filter((task) => (
      task.done === true
      && Number(task.completedAt) >= start
    )).length;
    const created = workspace.tasks.filter((task) => Number(task.createdAt) >= start).length;
    const fired = (workspace.reminderHistory || []).filter((item) => (
      Number(item.firedAt) >= start
      && ['fired', 'missed'].includes(item.status)
    )).length;
    const rescheduled = workspace.tasks.reduce((count, task) => (
      count + (task.activity || []).filter((entry) => (
        Number(Date.parse(entry.at)) >= start
        && ['rescheduled', 'strong_rescheduled', 'daily_review_rescheduled'].includes(entry.type)
      )).length
    ), 0);
    const overdue = tasks.filter((task) => Date.parse(task.deadline) < Date.now()).length;
    return {
      completed,
      created,
      fired,
      rescheduled,
      overdue,
      unfinished: tasks.length,
    };
  }

  function renderDailyReview() {
    if (!dailyReviewBackdrop) return;
    const tasks = unfinishedDailyReviewTasks();
    const summary = dailyReviewSummaryData(tasks);
    if (dailyReviewSummary) {
      dailyReviewSummary.innerHTML = `
        <strong>今天完成 ${summary.completed} 项，新增 ${summary.created} 项</strong><br>
        还有 ${summary.unfinished} 项未完成，其中 ${summary.overdue} 项已逾期；今日提醒触发 ${summary.fired} 次，顺延 ${summary.rescheduled} 次。
      `;
    }
    if (dailyReviewTasks) {
      dailyReviewTasks.innerHTML = tasks.length
        ? tasks.slice(0, 12).map((task) => `
            <div class="daily-review-task">
              <div>
                <strong>${escapeHtml(task.text)}</strong>
                <small>${Date.parse(task.deadline) < Date.now() ? '已逾期' : '今天'} · ${escapeHtml(formatDue(task.deadline))}</small>
              </div>
              <div class="daily-review-task-actions">
                <button type="button" data-daily-review-action="block" data-task-id="${escapeHtml(task.id)}">记录原因</button>
                <button type="button" data-daily-review-action="tomorrow" data-task-id="${escapeHtml(task.id)}">顺延一天</button>
                <button type="button" data-daily-review-action="custom" data-task-id="${escapeHtml(task.id)}">自定义</button>
              </div>
            </div>
          `).join('')
        : '<div class="todo-subtask-empty">今天没有需要继续处理的待办。</div>';
    }
    const disabled = tasks.length === 0;
    if (dailyReviewAllTomorrow) dailyReviewAllTomorrow.disabled = disabled;
    if (dailyReviewAllMorning) dailyReviewAllMorning.disabled = disabled;
  }

  function markDailyReviewShown() {
    try {
      localStorage.setItem(`notch-daily-review-shown-${localDateKey()}`, '1');
    } catch (error) {}
  }

  function showDailyReview() {
    if (!dailyReviewBackdrop) return;
    const tasks = unfinishedDailyReviewTasks();
    const activityCount = workspace.tasks.reduce(
      (count, task) => count + (
        (task.activity || []).some((entry) => Number(Date.parse(entry.at)) >= startOfLocalDay())
          ? 1
          : 0
      ),
      0
    );
    if (!tasks.length && activityCount === 0) {
      markDailyReviewShown();
      return;
    }
    markDailyReviewShown();
    renderDailyReview();
    dailyReviewBackdrop.hidden = false;
    document.dispatchEvent(new CustomEvent('notch:open-todo'));
  }

  function scheduleDailyReview() {
    if (dailyReviewTimer) clearTimeout(dailyReviewTimer);
    dailyReviewTimer = null;
    const settings = Domain.normalizeDailyReviewSettings(workspace.settings?.dailyReview);
    if (!settings.enabled) return;
    const [hour, minute] = settings.time.split(':').map(Number);
    let nextAt = dateAtLocalTime(0, hour, minute);
    if (nextAt <= Date.now()) nextAt = dateAtLocalTime(1, hour, minute);
    const todayKey = `notch-daily-review-shown-${localDateKey()}`;
    if (
      dateAtLocalTime(0, hour, minute) <= Date.now()
      && !localStorage.getItem(todayKey)
    ) {
      setTimeout(showDailyReview, 0);
      return;
    }
    dailyReviewTimer = setTimeout(() => {
      dailyReviewTimer = null;
      showDailyReview();
      scheduleDailyReview();
    }, Math.max(250, nextAt - Date.now()));
  }

  function rescheduleTaskFromDailyReview(taskId, at, reason) {
    const task = findTask(taskId);
    const nextAt = nextFutureMinute(at);
    if (!task || !Number.isFinite(nextAt)) return false;
    const reminders = (task.reminders || []).map((reminder) => (
      Number.isFinite(Number(reminder.offsetMinutes))
        ? { ...reminder, at: '', firedAt: 0 }
        : reminder
    ));
    const next = Domain.updateDetailedTodo(task, {
      deadline: new Date(nextAt).toISOString(),
      reminders,
      unhandledReminderAt: '',
      unhandledReminderId: '',
      activity: appendActivity(
        task,
        'daily_review_rescheduled',
        `${reason}：${formatDue(task.deadline) || '未设置'} → ${formatDue(nextAt)}`
      ),
    }, workspace.lists, Date.now());
    if (!next || !replaceTask(next, { scheduleReminders: true })) return false;
    return true;
  }

  function applyDesktopCardUpdate(payload) {
    const taskId = String(payload?.taskId || '');
    const patch = payload?.patch && typeof payload.patch === 'object' ? payload.patch : {};
    let task = findTask(taskId);
    if (!task) return false;
    let changed = false;

    if (Number.isFinite(Number(patch.snoozeMinutes))) {
      const target = Date.now() + Math.max(1, Number(patch.snoozeMinutes)) * 60 * 1000;
      changed = rescheduleTaskFromDailyReview(taskId, target, '桌面卡片调整时间') || changed;
      task = findTask(taskId);
    } else if (patch.deadlinePreset === 'tomorrow') {
      changed = rescheduleTaskFromDailyReview(
        taskId,
        dateAtLocalTime(1, 9, 0),
        '桌面卡片调整到明天 09:00'
      ) || changed;
      task = findTask(taskId);
    } else if (patch.deadlinePreset === 'today') {
      changed = rescheduleTaskFromDailyReview(
        taskId,
        dateAtLocalTime(0, 18, 0),
        '桌面卡片调整到今天 18:00'
      ) || changed;
      task = findTask(taskId);
    }
    if (!task) return changed;

    const text = String(patch.text || '').trim();
    if (text && text !== task.text) {
      updateTask(taskId, {
        text,
        activity: appendActivity(task, 'updated', '桌面卡片修改任务名称'),
      }, { render: false });
      changed = true;
      task = findTask(taskId);
    }

    if (patch.status === 'done') {
      if (!task.done) toggleTask(taskId);
      return true;
    }

    const status = ['todo', 'in_progress', 'blocked'].includes(patch.status)
      ? patch.status
      : null;
    const blockReason = String(patch.blockReason || task.blockReason || '').trim();
    const nextAction = String(patch.nextAction || task.nextAction || '').trim();
    const shouldUpdateStatus = Boolean(status && status !== task.status);
    const shouldUpdateReason = status === 'blocked'
      && (blockReason !== task.blockReason || nextAction !== task.nextAction);
    if (shouldUpdateStatus || shouldUpdateReason) {
      if (status === 'blocked' && !blockReason) return changed;
      const state = status || task.status;
      const updates = {
        status: state,
        done: false,
        completedAt: 0,
        blockedAt: state === 'blocked' ? task.blockedAt || Date.now() : 0,
        blockReasonType: state === 'blocked'
          ? task.blockReasonType || 'other'
          : '',
        blockReason: state === 'blocked' ? blockReason : '',
        nextAction: state === 'blocked' ? nextAction : '',
        activity: appendActivity(
          task,
          state === 'blocked' ? 'blocked' : 'status_changed',
          state === 'blocked'
            ? `桌面卡片更新受阻原因：${BLOCK_REASON_LABELS[task.blockReasonType || 'other'] || '其他'} · ${blockReason}`
            : `桌面卡片状态改为${statusLabel(state)}`
        ),
      };
      updateTask(taskId, updates, { render: false });
      changed = true;
    }
    if (changed) renderAll();
    return changed;
  }

  function rescheduleAllDailyReview(days, hour = null) {
    const tasks = unfinishedDailyReviewTasks();
    let changed = 0;
    tasks.forEach((task) => {
      const base = new Date(task.deadline);
      const target = hour === null
        ? base.getTime() + days * 24 * 60 * 60 * 1000
        : dateAtLocalTime(days, hour, 0);
      if (rescheduleTaskFromDailyReview(
        task.id,
        target,
        hour === null ? `全部顺延 ${days} 天` : '全部顺延到明天 09:00'
      )) changed += 1;
    });
    if (changed) {
      renderAll();
      renderDailyReview();
      showToast(`已顺延 ${changed} 项待办`);
    }
  }

  function hoverTodoPreview() {
    const now = Date.now();
    const unfinished = workspace.tasks.filter((task) => task.done !== true);
    const overdue = unfinished
      .filter((task) => task.deadline && Date.parse(task.deadline) < now)
      .sort((left, right) => Date.parse(left.deadline) - Date.parse(right.deadline));
    if (overdue.length) {
      const task = overdue[0];
      return {
        kind: 'overdue',
        taskId: task.id,
        title: task.text,
        meta: `${overdue.length > 1 ? `逾期 ${overdue.length} 项 · ` : ''}${formatDue(task.deadline)}`,
      };
    }
    const end = endOfLocalDay(now);
    const today = unfinished
      .filter((task) => (
        task.deadline
        && Date.parse(task.deadline) >= now
        && Date.parse(task.deadline) <= end
      ))
      .sort((left, right) => Date.parse(left.deadline) - Date.parse(right.deadline));
    if (today.length) {
      const task = today[0];
      return {
        kind: 'today',
        taskId: task.id,
        title: task.text,
        meta: `今天 ${formatDue(task.deadline)}`,
      };
    }
    const upcoming = unfinished
      .filter((task) => task.deadline && Date.parse(task.deadline) > now)
      .sort((left, right) => Date.parse(left.deadline) - Date.parse(right.deadline));
    if (upcoming.length) {
      const task = upcoming[0];
      return {
        kind: 'upcoming',
        taskId: task.id,
        title: task.text,
        meta: `下一条 ${formatDue(task.deadline)}`,
      };
    }
    const completed = workspace.tasks.filter((task) => (
      task.done === true
      && Number(task.completedAt) >= startOfLocalDay(now)
    )).length;
    if (completed > 0) {
      return {
        kind: 'completed',
        taskId: '',
        title: '今天的待办都完成了',
        meta: `今天已完成 ${completed} 项`,
      };
    }
    return {
      kind: 'empty',
      taskId: '',
      title: '今天没有待办',
      meta: '可以安心休息一下',
    };
  }

  function renderDetail(task = findTask(selectedTaskId)) {
    if (!detailEmpty || !detailForm) return;
    if (!task) {
      selectedTaskId = '';
      detail.classList.add('is-empty');
      detailEmpty.hidden = false;
      detailForm.hidden = true;
      return;
    }
    selectedTaskId = task.id;
    detail.classList.remove('is-empty');
    detailEmpty.hidden = true;
    detailForm.hidden = false;
    detailTitle.value = task.text;
    if (detailState) detailState.value = taskStatus(task);
    renderDetailListOptions(task.listId);
    detailPriority.value = task.priority || 'none';
    detailStart.value = toTodoDateDisplay(task.startAt);
    detailDeadline.value = toTodoDateDisplay(task.deadline);
    detailNotes.value = task.notes || '';
    if (detailStrongReminder) detailStrongReminder.checked = task.strongReminder === true;
    if (detailStrongReminderAt) {
      detailStrongReminderAt.value = toTodoDateDisplay(task.strongReminderAt);
      detailStrongReminderAt.dataset.linked = task.strongReminderLinked === true ? 'true' : 'false';
    }
    if (detailStrongReminderTimeField) {
      detailStrongReminderTimeField.hidden = task.strongReminder !== true;
    }
    detailSound.value = task.reminders?.find((item) => item.soundId)?.soundId
      || findList(task.listId)?.defaultSoundId
      || 'bright';
    if (detailRecurrence) detailRecurrence.value = task.recurrence?.unit || '';
    if (detailRecurrenceInterval) detailRecurrenceInterval.value = String(task.recurrence?.interval || 1);
    if (recurrenceUnit) {
      recurrenceUnit.textContent = task.recurrence?.unit === 'day'
        ? '天'
        : task.recurrence?.unit === 'week'
          ? '周'
          : task.recurrence?.unit === 'month'
            ? '个月'
            : task.recurrence?.unit === 'weekday'
              ? '个工作日'
              : '次';
    }
    if (detailPin) {
      detailPin.setAttribute('aria-pressed', String(task.pinned === true));
      detailPin.classList.toggle('active', task.pinned === true);
      detailPin.title = task.pinned ? '取消置顶' : '置顶任务';
      detailPin.setAttribute('aria-label', task.pinned ? '取消置顶' : '置顶任务');
    }
    if (detailDesktopCard) {
      const active = desktopCardIds.has(task.id);
      detailDesktopCard.classList.toggle('active', active);
      detailDesktopCard.setAttribute('aria-pressed', String(active));
      detailDesktopCard.title = active ? '关闭桌面卡片' : '发送到桌面';
      detailDesktopCard.setAttribute('aria-label', detailDesktopCard.title);
    }
    renderReminderPresets(task);
    renderSubtasks(task);
    renderBlockSummary(task);
    renderActivity(task);
    if (detailStatus) detailStatus.textContent = '自动保存';
  }

  function renderSidebar() {
    const counts = Domain.summarizeTodoViewCounts(workspace.tasks, workspace.lists, Date.now());
    updateViewCounts(counts);
    renderListTree(counts);
    renderListParentOptions();
    renderSavedFilters();
    renderTemplateSelect();
  }

  function renderAll(options = {}) {
    renderSidebar();
    renderBoard();
    renderQuickPreview();
    if (options.detail !== false) renderDetail();
  }

  function selectView(view) {
    if (!VIEW_META[view] && !String(view).startsWith('list:')) return;
    selectedView = view;
    selectedTaskId = '';
    selectedTaskIds.clear();
    selectionAnchor = '';
    expandedSubtaskTaskId = '';
    closeCalendarDayPopover();
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch (error) {}
    renderAll();
  }

  function createTask(payload) {
    const requestedList = findList(payload.listId);
    const deadline = payload.deadline || '';
    const explicitReminderOffsets = Object.prototype.hasOwnProperty.call(payload, 'reminderOffsets')
      ? Domain.normalizeTodoReminderOffsets(payload.reminderOffsets, [])
      : null;
    const inheritedReminderOffsets = requestedList?.defaultReminderOffsets || [];
    const reminderOffsets = explicitReminderOffsets || inheritedReminderOffsets;
    const soundId = ['none', 'soft', 'bright', 'alert'].includes(payload.soundId)
      ? payload.soundId
      : requestedList?.defaultSoundId || 'bright';
    const reminders = Array.isArray(payload.reminders)
      ? payload.reminders
      : deadline
        ? reminderOffsets.map((offsetMinutes) => ({
          offsetMinutes,
          soundId,
        }))
        : [];
    const nextOrder = workspace.tasks.reduce((maximum, task) => Math.max(maximum, Number(task.order) || 0), -1) + 1;
    const task = Domain.createDetailedTodo({
      ...payload,
      deadline,
      reminders,
      remindersInitialized: true,
      order: nextOrder,
    }, workspace.lists, generateId('todo'), Date.now());
    if (!task) return null;
    task.activity = appendActivity(
      task,
      'created',
      `创建待办${deadline ? `，初始截止 ${formatDue(deadline)}` : ''}`
    );
    workspace.tasks.push(task);
    writeWorkspace({ scheduleReminders: true });
    return task;
  }

  function replaceTask(nextTask, options = {}) {
    const index = workspace.tasks.findIndex((task) => task.id === nextTask.id);
    if (index < 0) return false;
    workspace.tasks[index] = nextTask;
    writeWorkspace(options);
    return true;
  }

  function updateTask(taskId, updates, options = {}) {
    const task = findTask(taskId);
    if (!task) return null;
    const previousSortState = {
      done: task.done,
      priority: task.priority,
      deadline: task.deadline,
      order: task.order,
    };
    const next = Domain.updateDetailedTodo(task, updates, workspace.lists, Date.now());
    if (!next || !replaceTask(next, options)) return null;
    if (options.render === 'all') renderAll();
    else if (options.render !== false) {
      const countsChanged = task.listId !== next.listId
        || task.done !== next.done
        || task.status !== next.status
        || task.deadline !== next.deadline
        || task.startAt !== next.startAt;
      if (countsChanged) renderSidebar();
      refreshTaskRow(next, next.done !== previousSortState.done
        || next.priority !== previousSortState.priority
        || !sameTodoMinute(next.deadline, previousSortState.deadline)
        || next.order !== previousSortState.order);
      if (selectedTaskId === next.id && options.renderDetail !== false) renderDetail(next);
    }
    return next;
  }

  function toggleTask(taskId) {
    const task = findTask(taskId);
    if (!task) return;
    const done = !task.done;
    if (done && expandedSubtaskTaskId === taskId) expandedSubtaskTaskId = '';
    const next = updateTask(taskId, {
      done,
      completedAt: done ? Date.now() : 0,
      activity: appendActivity(
        task,
        done ? 'completed' : 'reopened',
        done ? '标记为已完成' : '恢复为未完成'
      ),
    });
    if (!next) return;
    if (done && next.recurrence) {
      const nextOrder = workspace.tasks.reduce(
        (maximum, item) => Math.max(maximum, Number(item.order) || 0),
        -1
      ) + 1;
      const occurrence = Domain.createNextTodoOccurrence(
        { ...next, order: nextOrder },
        workspace.lists,
        generateId('todo'),
        Date.now()
      );
      if (occurrence) {
        occurrence.activity = appendActivity(
          occurrence,
          'recurrence_created',
          `由重复任务生成，截止 ${formatDue(occurrence.deadline)}`
        );
        workspace.tasks.push(occurrence);
        writeWorkspace({ scheduleReminders: true });
        renderAll();
        showToast(`已完成，下一次安排在 ${formatDue(occurrence.deadline)}`);
      }
    }
    if (done) {
      requestAnimationFrame(() => {
        const checkbox = taskList?.querySelector(
          `[data-task-id="${CSS.escape(taskId)}"] .checkbox`
        );
        checkbox?.classList.add('pop');
        setTimeout(() => checkbox?.classList.remove('pop'), 420);
      });
    }
  }

  function toggleTaskPin(taskId) {
    const task = findTask(taskId);
    if (!task) return;
    const pinned = !task.pinned;
    updateTask(taskId, {
      pinned,
      activity: appendActivity(task, 'pinned', pinned ? '置顶待办' : '取消置顶'),
    }, { scheduleReminders: false });
  }

  function toggleInlineSubtasks(taskId) {
    const task = findTask(taskId);
    if (!task?.subtasks?.length) return;
    expandedSubtaskTaskId = expandedSubtaskTaskId === taskId ? '' : taskId;
    refreshTaskRow(task, false);
  }

  function deleteTask(taskId) {
    const index = workspace.tasks.findIndex((task) => task.id === taskId);
    if (index < 0) return;
    const [removed] = workspace.tasks.splice(index, 1);
    const deletedAt = Date.now();
    removed.activity = appendActivity(removed, 'deleted', '移入回收站', deletedAt);
    workspace.trash ||= [];
    workspace.trash.unshift({ ...removed, deletedAt });
    workspace.trash = workspace.trash.slice(0, 500);
    selectedTaskIds.delete(taskId);
    if (expandedSubtaskTaskId === taskId) expandedSubtaskTaskId = '';
    if (selectedTaskId === taskId) selectedTaskId = '';
    writeWorkspace({ scheduleReminders: true });
    renderAll();
    showToast(`已删除“${removed.text.length > 18 ? `${removed.text.slice(0, 18)}…` : removed.text}”`, {
      actionLabel: '撤销',
      duration: 5000,
      onAction: () => {
        workspace.trash = (workspace.trash || []).filter((item) => (
          item.id !== removed.id || item.deletedAt !== deletedAt
        ));
        workspace.tasks.splice(Math.min(index, workspace.tasks.length), 0, removed);
        writeWorkspace({ scheduleReminders: true });
        renderAll();
        showToast('已撤销删除');
      },
    });
  }

  function selectionIds() {
    return currentFilteredTasks().map((task) => task.id);
  }

  function toggleTaskSelection(taskId, shiftKey = false) {
    const result = Domain.updateRangeSelection(
      selectionIds(),
      [...selectedTaskIds],
      taskId,
      selectionAnchor,
      shiftKey,
      true
    );
    selectedTaskIds = new Set(result.selected);
    selectionAnchor = result.anchor;
    renderBoard();
  }

  function clearSelection() {
    selectedTaskIds.clear();
    selectionAnchor = '';
    renderBoard();
  }

  function closeDetail() {
    selectedTaskId = '';
    renderDetail();
    renderBoard();
  }

  function currentReminderOffsets() {
    return [...(reminderPresets?.querySelectorAll('[data-reminder-offset].active') || [])]
      .map((button) => Number(button.dataset.reminderOffset))
      .filter((value) => Number.isFinite(value) && value >= 0);
  }

  function collectDetailUpdates() {
    const task = findTask(selectedTaskId);
    if (!task) return null;
    const deadline = fromLocalInput(detailDeadline?.value || '');
    const deadlineChanged = !sameTodoMinute(task.deadline, deadline);
    const requestedStrongReminderAt = fromLocalInput(detailStrongReminderAt?.value || '');
    const strongReminderAtChanged = !sameTodoMinute(
      task.strongReminderAt,
      requestedStrongReminderAt
    );
    let strongReminderLinked = detailStrongReminderAt?.dataset.linked === 'true';
    if (task.strongReminderLinked === true && deadlineChanged && !strongReminderAtChanged) {
      strongReminderLinked = true;
    }
    const strongReminderAt = strongReminderLinked && deadline
      ? deadline
      : requestedStrongReminderAt;
    const soundId = detailSound?.value || 'bright';
    const existing = new Map(
      (task.reminders || [])
        .filter((reminder) => (
          reminder.strong !== true
          && Number.isFinite(Number(reminder.offsetMinutes))
        ))
        .map((reminder) => [Number(reminder.offsetMinutes), reminder])
    );
    const existingById = new Map((task.reminders || [])
      .filter((reminder) => reminder.strong !== true)
      .map((reminder) => [reminder.id, reminder]));
    let reminders = currentReminderOffsets().map((offsetMinutes) => {
      const previous = existing.get(offsetMinutes);
      return {
        id: previous?.id || generateId('reminder'),
        offsetMinutes,
        at: deadlineChanged ? '' : previous?.at || '',
        firedAt: deadlineChanged ? 0 : previous?.firedAt || 0,
        soundId,
        strong: false,
      };
    });
    reminderPresets?.querySelectorAll('[data-reminder-id].active').forEach((button) => {
      const reminder = existingById.get(button.dataset.reminderId);
      if (reminder) {
        reminders.push({
          ...reminder,
          soundId,
          strong: false,
        });
      }
    });
    if (!task.remindersInitialized && deadline && reminders.length === 0) {
      const list = findList(detailList?.value || task.listId);
      reminders = (list?.defaultReminderOffsets || []).map((offsetMinutes) => ({
        id: generateId('reminder'),
        offsetMinutes,
        at: '',
        firedAt: 0,
        soundId: list?.defaultSoundId || soundId,
      }));
    }
    const previousStrong = (task.reminders || []).find((reminder) => reminder.strong === true);
    if (detailStrongReminder?.checked === true && strongReminderAt) {
      reminders.push({
        id: previousStrong?.id || generateId('strong-reminder'),
        offsetMinutes: null,
        at: strongReminderAt,
        firedAt: previousStrong?.at === strongReminderAt
          ? Math.max(0, Number(previousStrong.firedAt) || 0)
          : 0,
        soundId: 'alert',
        strong: true,
      });
    }
    return {
      text: detailTitle?.value || '',
      listId: detailList?.value || INBOX_ID,
      priority: detailPriority?.value || 'none',
      startAt: fromLocalInput(detailStart?.value || ''),
      deadline,
      notes: detailNotes?.value || '',
      strongReminder: detailStrongReminder?.checked === true && Boolean(strongReminderAt),
      strongReminderAt,
      strongReminderLinked: detailStrongReminder?.checked === true
        && Boolean(strongReminderAt)
        && strongReminderLinked,
      reminders,
      remindersInitialized: Boolean(deadline || reminders.length || task.remindersInitialized),
      recurrence: detailRecurrence?.value
        ? {
          unit: detailRecurrence.value,
          interval: Math.max(1, Math.min(365, Math.round(Number(detailRecurrenceInterval?.value) || 1))),
        }
        : null,
    };
  }

  function commitDetail(options = {}) {
    if (detailSaveTimer) {
      clearTimeout(detailSaveTimer);
      detailSaveTimer = null;
    }
    const task = findTask(selectedTaskId);
    const updates = collectDetailUpdates();
    if (!task || !updates) return;
    if (!String(updates.text || '').trim()) {
      if (detailStatus) detailStatus.textContent = '任务名称不能为空';
      return;
    }
    if (updates.strongReminder) {
      const strongAt = Date.parse(String(updates.strongReminderAt || ''));
      const deadlineAt = Date.parse(String(updates.deadline || ''));
      if (!Number.isFinite(strongAt) || !Number.isFinite(deadlineAt) || strongAt > deadlineAt) {
        if (detailStatus) detailStatus.textContent = '强提醒时间不能晚于截止时间';
        showToast('强提醒时间必须早于或等于截止时间');
        return;
      }
      if (updates.strongReminderLinked && !sameTodoMinute(updates.strongReminderAt, updates.deadline)) {
        if (detailStatus) detailStatus.textContent = '联动强提醒时间必须与截止时间一致';
        showToast('联动强提醒时间必须与截止时间一致');
        return;
      }
    }
    const previousSortState = {
      done: task.done,
      priority: task.priority,
      deadline: task.deadline,
      order: task.order,
    };
    const next = Domain.updateDetailedTodo(task, updates, workspace.lists, Date.now());
    const activityMessages = [];
    if (!sameTodoMinute(task.deadline, next?.deadline)) {
      activityMessages.push(
        `截止时间：${formatDue(task.deadline) || '未设置'} → ${formatDue(next?.deadline) || '未设置'}`
      );
    }
    if (!sameTodoMinute(task.startAt, next?.startAt)) {
      activityMessages.push(
        `开始时间：${formatDue(task.startAt) || '未设置'} → ${formatDue(next?.startAt) || '未设置'}`
      );
    }
    if (task.priority !== next?.priority) {
      activityMessages.push(
        `优先级：${PRIORITY_LABELS[task.priority] || '无'} → ${PRIORITY_LABELS[next?.priority] || '无'}`
      );
    }
    if (task.listId !== next?.listId) {
      activityMessages.push(`分类：${listPath(task.listId)} → ${listPath(next?.listId)}`);
    }
    const previousOffsets = (task.reminders || [])
      .filter((item) => item.strong !== true && Number.isFinite(Number(item.offsetMinutes)))
      .map((item) => Number(item.offsetMinutes))
      .sort((left, right) => left - right);
    const nextOffsets = (next?.reminders || [])
      .filter((item) => item.strong !== true && Number.isFinite(Number(item.offsetMinutes)))
      .map((item) => Number(item.offsetMinutes))
      .sort((left, right) => left - right);
    if (JSON.stringify(previousOffsets) !== JSON.stringify(nextOffsets)) {
      activityMessages.push(
        `普通提醒：${previousOffsets.length ? previousOffsets.map(reminderLabel).join('、') : '无'} → ${nextOffsets.length ? nextOffsets.map(reminderLabel).join('、') : '无'}`
      );
    }
    if (
      task.strongReminder !== next?.strongReminder
      || task.strongReminderLinked !== next?.strongReminderLinked
      || !sameTodoMinute(task.strongReminderAt, next?.strongReminderAt)
    ) {
      activityMessages.push(
        next?.strongReminder
          ? `强提醒：${formatDue(next.strongReminderAt)}${next.strongReminderLinked ? '（跟随截止时间）' : ''}`
          : '关闭强提醒'
      );
    }
    const previousRecurrence = task.recurrence
      ? `${task.recurrence.interval}${task.recurrence.unit}`
      : '';
    const nextRecurrence = next?.recurrence
      ? `${next.recurrence.interval}${next.recurrence.unit}`
      : '';
    if (previousRecurrence !== nextRecurrence) {
      activityMessages.push(`重复设置：${previousRecurrence || '不重复'} → ${nextRecurrence || '不重复'}`);
    }
    if (activityMessages.length) {
      next.activity = [
        ...(task.activity || []),
        ...activityMessages.map((message) => activityEntry('updated', message)),
      ].slice(-800);
    }
    const scheduleRemindersForUpdate = !sameTodoMinute(task.deadline, next?.deadline)
      || JSON.stringify(task.reminders || []) !== JSON.stringify(next?.reminders || [])
      || task.strongReminder !== next?.strongReminder
      || task.strongReminderLinked !== next?.strongReminderLinked;
    if (!next || !replaceTask(next, { scheduleReminders: scheduleRemindersForUpdate })) return;
    if (detailStatus) detailStatus.textContent = '已保存';
    let viewChanged = false;
    if (selectedView.startsWith('list:') && !taskMatchesCurrentView(next)) {
      selectedView = `list:${next.listId}`;
      viewChanged = true;
      try { localStorage.setItem(VIEW_KEY, selectedView); } catch (error) {}
    }
    const countsChanged = task.listId !== next.listId
      || task.done !== next.done
      || task.status !== next.status
      || !sameTodoMinute(task.deadline, next.deadline)
      || !sameTodoMinute(task.startAt, next.startAt);
    if (viewChanged || countsChanged) renderSidebar();
    if (viewChanged) renderBoard();
    else refreshTaskRow(next, next.done !== previousSortState.done
      || next.priority !== previousSortState.priority
      || !sameTodoMinute(next.deadline, previousSortState.deadline)
      || next.order !== previousSortState.order);
    if (options.rerenderDetail) renderDetail(next);
  }

  function scheduleDetailSave(options = {}) {
    if (detailSaveTimer) clearTimeout(detailSaveTimer);
    if (detailStatus) detailStatus.textContent = '正在保存…';
    detailSaveTimer = setTimeout(() => commitDetail(options), 650);
  }

  function addReminderOffset(offset) {
    const task = findTask(selectedTaskId);
    if (!task || !Number.isFinite(Date.parse(String(task.deadline || '')))) {
      showToast('请先设置截止时间');
      return;
    }
    const existing = reminderPresets?.querySelector(`[data-reminder-offset="${offset}"]`);
    if (existing) {
      existing.classList.add('active');
      commitDetail();
      renderDetail(findTask(selectedTaskId));
      return;
    }
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.reminderOffset = String(offset);
    button.className = 'active';
    button.textContent = reminderLabel(offset);
    reminderPresets?.append(button);
    commitDetail();
    renderDetail(findTask(selectedTaskId));
  }

  function addSubtask() {
    const task = findTask(selectedTaskId);
    const text = String(subtaskTitle?.value || '').trim();
    if (!task || !text) return;
    const subtasks = [
      ...(task.subtasks || []),
      {
        id: generateId('subtask'),
        text,
        done: false,
        order: task.subtasks?.length || 0,
        createdAt: Date.now(),
        completedAt: 0,
      },
    ];
    subtaskTitle.value = '';
    updateTask(task.id, {
      subtasks,
      activity: appendActivity(task, 'subtask_added', `添加子任务：${text}`),
    }, { scheduleReminders: false });
    renderDetail(findTask(task.id));
  }

  function toggleSubtaskForTask(taskId, subtaskId) {
    const task = findTask(taskId);
    const subtask = task?.subtasks?.find((item) => item.id === subtaskId);
    if (!task || !subtask) return null;
    const done = !subtask.done;
    const subtasks = task.subtasks.map((item) => item.id === subtaskId
      ? { ...item, done, completedAt: done ? Date.now() : 0 }
      : item);
    const next = updateTask(task.id, { subtasks }, {
      activity: appendActivity(
        task,
        done ? 'subtask_completed' : 'subtask_reopened',
        `${done ? '完成' : '恢复'}子任务：${subtask.text}`
      ),
      scheduleReminders: false,
      renderDetail: false,
    });
    if (!next) return null;
    if (done && !next.done && next.subtasks.every((item) => item.done)) {
      showToast('所有子任务已完成', {
        actionLabel: '完成主任务',
        duration: 6000,
        onAction: () => toggleTask(next.id),
      });
    }
    return next;
  }

  function toggleSubtask(subtaskId) {
    const next = toggleSubtaskForTask(selectedTaskId, subtaskId);
    if (next) renderDetail(next);
  }

  function deleteSubtask(subtaskId) {
    const task = findTask(selectedTaskId);
    if (!task) return;
    const subtask = task.subtasks?.find((item) => item.id === subtaskId);
    const subtasks = (task.subtasks || []).filter((item) => item.id !== subtaskId);
    const next = updateTask(task.id, {
      subtasks,
      activity: appendActivity(task, 'subtask_deleted', `删除子任务：${subtask?.text || ''}`),
    }, { scheduleReminders: false });
    renderDetail(next);
  }

  function renderNewListForm() {
    if (!listForm) return;
    listForm.hidden = false;
    renderListParentOptions();
    const selectedList = findList(viewListId());
    listParentSelect.value = selectedList?.parentId ? selectedList.parentId : '';
    listNameInput.value = '';
    listDefaultReminders?.querySelectorAll('[data-new-list-reminder]').forEach((button) => {
      button.classList.toggle('active', button.dataset.newListReminder === '60');
    });
    if (listDefaultSound) listDefaultSound.value = 'bright';
    if (listSortMode) listSortMode.value = 'auto';
    requestAnimationFrame(() => listNameInput.focus({ preventScroll: true }));
  }

  function closeNewListForm() {
    if (listForm) listForm.hidden = true;
  }

  function createList() {
    const defaultReminderOffsets = [...(listDefaultReminders?.querySelectorAll('[data-new-list-reminder].active') || [])]
      .map((button) => Number(button.dataset.newListReminder))
      .filter((value) => Number.isFinite(value));
    const next = Domain.createTodoList(
      workspace.lists,
      listNameInput?.value || '',
      listParentSelect?.value || '',
      generateId('list'),
      Date.now(),
      {
        defaultReminderOffsets,
        defaultSoundId: listDefaultSound?.value || 'bright',
        sortMode: listSortMode?.value || 'auto',
      }
    );
    if (!next) {
      showToast('分类名称不能为空，也不能重复');
      return;
    }
    workspace.lists.push(next);
    writeWorkspace({ scheduleReminders: false });
    closeNewListForm();
    selectedView = `list:${next.id}`;
    try { localStorage.setItem(VIEW_KEY, selectedView); } catch (error) {}
    renderAll();
  }

  function commitListRename(listId) {
    const list = findList(listId);
    const editor = listTree?.querySelector(`[data-list-id="${CSS.escape(listId)}"]`);
    const input = editor?.querySelector('.todo-list-rename');
    if (!list || !input) return;
    const name = String(input.value || '').replace(/\s+/g, ' ').trim().slice(0, 24);
    if (!name) {
      editingListId = '';
      renderSidebar();
      return;
    }
    const duplicate = workspace.lists.some((item) => (
      item.id !== list.id
      && item.name === name
      && String(item.parentId || '') === String(list.parentId || '')
    ));
    if (duplicate) {
      showToast('同一层级已有这个分类');
      return;
    }
    list.name = name;
    list.defaultReminderOffsets = [...(editor.querySelectorAll('[data-list-setting-reminder].active') || [])]
      .map((button) => Number(button.dataset.listSettingReminder))
      .filter((value) => Number.isFinite(value))
      .sort((left, right) => left - right);
    list.defaultSoundId = editor.querySelector('[data-list-setting-sound]')?.value || 'bright';
    list.sortMode = editor.querySelector('[data-list-setting-sort]')?.value === 'manual' ? 'manual' : 'auto';
    editingListId = '';
    writeWorkspace({ scheduleReminders: false });
    renderAll();
  }

  function deleteList(listId) {
    const list = findList(listId);
    if (!list || list.id === INBOX_ID) return;
    const hasChildren = childLists(list.id).length > 0;
    const hasTasks = workspace.tasks.some((task) => task.listId === list.id);
    if (hasChildren || hasTasks) {
      showToast('请先移动这个分类下的任务和子分类');
      return;
    }
    workspace.lists = workspace.lists.filter((item) => item.id !== list.id);
    if (selectedView === `list:${list.id}`) selectedView = INBOX_ID;
    writeWorkspace({ scheduleReminders: false });
    renderAll();
  }

  function restoreTrashTask(taskId) {
    const index = (workspace.trash || []).findIndex((task) => task.id === taskId);
    if (index < 0) return;
    const [entry] = workspace.trash.splice(index, 1);
    const restored = { ...entry };
    delete restored.deletedAt;
    restored.activity = appendActivity(restored, 'restored', '从回收站恢复');
    workspace.tasks.push(restored);
    writeWorkspace({ scheduleReminders: true });
    renderAll();
    showToast('任务已恢复');
  }

  function deleteTrashTaskPermanently(taskId) {
    workspace.trash = (workspace.trash || []).filter((task) => task.id !== taskId);
    writeWorkspace({ scheduleReminders: false });
    renderBoard();
  }

  function purgeExpiredTrash() {
    const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000;
    workspace.trash = (workspace.trash || []).filter((task) => (
      Math.max(0, Number(task.deletedAt) || 0) >= cutoff
    ));
  }

  function closeTemplateDialog() {
    if (templateDialog) templateDialog.hidden = true;
    templateSourceTaskId = '';
  }

  function openTemplateDialog() {
    const task = findTask(selectedTaskId);
    if (!task) return;
    templateSourceTaskId = task.id;
    if (templateNameInput) templateNameInput.value = task.text;
    if (templateDialog) templateDialog.hidden = false;
    requestAnimationFrame(() => {
      templateNameInput?.focus({ preventScroll: true });
      templateNameInput?.select();
    });
  }

  function commitTemplateDialog() {
    const task = findTask(templateSourceTaskId);
    const name = String(templateNameInput?.value || '').trim();
    if (!task || !name) {
      templateNameInput?.focus({ preventScroll: true });
      return;
    }
    if (!name) return;
    const deadlineMs = Date.parse(String(task.deadline || ''));
    const deadlineOffsetMinutes = Number.isFinite(deadlineMs) && deadlineMs > Date.now()
      ? Math.max(1, Math.round((deadlineMs - Date.now()) / 60000))
      : null;
    workspace.settings ||= { missedReminderPolicy: '24h', templates: [], savedFilters: [] };
    workspace.settings.templates ||= [];
    workspace.settings.templates.unshift({
      id: generateId('template'),
      name: name.slice(0, 48),
      text: task.text,
      listId: task.listId,
      notes: task.notes,
      priority: task.priority,
      deadlineOffsetMinutes,
      reminderOffsets: (task.reminders || [])
        .map((reminder) => Number(reminder.offsetMinutes))
        .filter(Number.isFinite),
      soundId: task.reminders?.[0]?.soundId || detailSound?.value || 'bright',
      subtasks: (task.subtasks || []).map((subtask) => ({ text: subtask.text })),
    });
    workspace.settings.templates = workspace.settings.templates.slice(0, 50);
    writeWorkspace({ scheduleReminders: false });
    renderTemplateSelect();
    closeTemplateDialog();
    showToast('已保存为模板');
  }

  function createTaskFromTemplate(templateId) {
    const template = workspace.settings?.templates?.find((item) => item.id === templateId);
    if (!template) return;
    const deadline = Number.isFinite(Number(template.deadlineOffsetMinutes))
      ? new Date(Date.now() + Number(template.deadlineOffsetMinutes) * 60000).toISOString()
      : '';
    const task = createTask({
      text: template.text,
      listId: template.listId,
      notes: template.notes,
      priority: template.priority,
      deadline,
      reminderOffsets: deadline ? template.reminderOffsets : [],
      soundId: template.soundId,
      subtasks: (template.subtasks || []).map((item, index) => ({
        id: generateId('subtask'),
        text: item.text,
        done: false,
        order: index,
        createdAt: Date.now(),
        completedAt: 0,
      })),
    });
    if (!task) return;
    selectedTaskId = task.id;
    renderAll();
    showToast(`已从模板创建：${template.name}`);
  }

  function quickAddText(value) {
    const parsed = Domain.parseTodoQuickInput(String(value || ''), Date.now(), workspace.lists);
    if (!parsed?.text) return null;
    const task = createTask({
      text: parsed.text,
      listId: parsed.listId || INBOX_ID,
      deadline: parsed.deadline,
      priority: parsed.priority,
      ...(parsed.reminderOffsets.length ? { reminderOffsets: parsed.reminderOffsets } : {}),
    });
    if (task) renderAll();
    return task;
  }

  function saveCurrentFilter() {
    if (!query.trim()) {
      showToast('先输入搜索词再保存筛选');
      return;
    }
    const name = window.prompt('筛选名称', query.trim().slice(0, 24))?.trim();
    if (!name) return;
    workspace.settings ||= { missedReminderPolicy: '24h', templates: [], savedFilters: [] };
    workspace.settings.savedFilters ||= [];
    workspace.settings.savedFilters.unshift({
      id: generateId('filter'),
      name: name.slice(0, 40),
      view: selectedView,
      query: query.trim(),
      priority: 'none',
    });
    workspace.settings.savedFilters = workspace.settings.savedFilters.slice(0, 50);
    writeWorkspace({ scheduleReminders: false });
    renderSavedFilters();
    showToast('筛选已保存');
  }

  function applySavedFilter(filterId) {
    const filter = workspace.settings?.savedFilters?.find((item) => item.id === filterId);
    if (!filter) return;
    selectedView = filter.view;
    query = filter.query;
    if (searchInput) searchInput.value = query;
    selectedTaskId = '';
    selectedTaskIds.clear();
    renderAll();
  }

  async function backupTodoData(force = false) {
    if (typeof window.notchAPI?.backupTodoData !== 'function') return;
    const result = await window.notchAPI.backupTodoData(workspace, force).catch(() => null);
    if (!result?.ok) {
      showToast('备份失败');
      return;
    }
    if (force) showToast(result.skipped ? '今天的备份已存在' : '备份已创建');
  }

  function reportReminderText(task) {
    const offsets = (task.reminders || [])
      .filter((reminder) => reminder.strong !== true && Number.isFinite(Number(reminder.offsetMinutes)))
      .map((reminder) => reminderLabel(reminder.offsetMinutes));
    const timed = (task.reminders || [])
      .filter((reminder) => reminder.strong !== true && !Number.isFinite(Number(reminder.offsetMinutes)) && reminder.at)
      .map((reminder) => formatDue(reminder.at));
    return [...offsets, ...timed].filter(Boolean).join('、');
  }

  function buildReportTask(task, includeActivity = false) {
    return {
      title: task.text,
      listPath: listPath(task.listId),
      status: statusLabel(taskStatus(task)),
      priority: PRIORITY_LABELS[task.priority] || '无',
      createdAt: task.createdAt,
      startAt: task.startAt,
      deadline: task.deadline,
      completedAt: task.completedAt,
      reminders: reportReminderText(task),
      strongReminder: task.strongReminder === true
        ? `${formatDue(task.strongReminderAt)}${task.strongReminderLinked ? '（跟随截止时间）' : ''}`
        : '',
      blockReasonType: BLOCK_REASON_LABELS[task.blockReasonType] || (taskStatus(task) === 'blocked' ? '其他' : ''),
      blockReason: task.blockReason || '',
      nextAction: task.nextAction || '',
      notes: task.notes || '',
      subtasks: (task.subtasks || []).map((subtask) => ({
        text: subtask.text,
        done: subtask.done === true,
      })),
      activity: includeActivity
        ? (task.activity || []).map((entry) => ({
          at: entry.at,
          message: entry.message,
        }))
        : [],
    };
  }

  function reportScopeData(scope, includeCompleted, includeActivity) {
    let tasks = [];
    let scopeLabel = '';
    if (scope === 'task') {
      const task = findTask(selectedTaskId);
      if (task) tasks = [task];
      scopeLabel = task ? `当前待办 · ${task.text}` : '当前待办';
    } else {
      const listId = viewListId();
      if (listId) {
        const listIds = new Set(Domain.todoListDescendantIds(workspace.lists, listId));
        tasks = workspace.tasks.filter((task) => listIds.has(String(task.listId || '')));
        scopeLabel = `当前名录 · ${listPath(listId)}及子名录`;
      } else {
        tasks = currentFilteredTasks();
        scopeLabel = `当前视图 · ${viewTitle?.textContent || '待办'}`;
      }
    }
    if (!includeCompleted) tasks = tasks.filter((task) => task.done !== true);
    tasks = Domain.sortDetailedTodos(tasks);
    const now = Date.now();
    const summary = {
      total: tasks.length,
      unfinished: tasks.filter((task) => task.done !== true).length,
      completed: tasks.filter((task) => task.done === true).length,
      overdue: tasks.filter((task) => (
        task.done !== true
        && Number.isFinite(Date.parse(String(task.deadline || '')))
        && Date.parse(String(task.deadline)) < now
      )).length,
      blocked: tasks.filter((task) => taskStatus(task) === 'blocked').length,
    };
    const title = scope === 'task'
      ? tasks[0]?.text || '待办报告'
      : scopeLabel.replace(/^当前名录 ·\s*/, '') || '待办报告';
    return {
      title,
      scopeLabel,
      generatedAt: new Date().toISOString(),
      summary: [
        { label: '任务总数', value: String(summary.total) },
        { label: '未完成', value: String(summary.unfinished) },
        { label: '已完成', value: String(summary.completed) },
        { label: '已逾期', value: String(summary.overdue) },
        { label: '受阻', value: String(summary.blocked) },
      ],
      tasks: tasks.map((task) => buildReportTask(task, includeActivity)),
    };
  }

  function updateExportDialogNote() {
    if (!exportNote) return;
    const task = findTask(selectedTaskId);
    const listId = viewListId();
    if (exportScope) {
      const taskOption = exportScope.querySelector('option[value="task"]');
      const listOption = exportScope.querySelector('option[value="list"]');
      if (taskOption) taskOption.disabled = !task;
      if (listOption) {
        listOption.textContent = listId ? '当前名录及子名录' : '当前筛选结果';
      }
    }
    const scope = exportScope?.value === 'task' && task ? 'task' : 'list';
    const includeCompleted = exportIncludeCompleted?.checked !== false;
    const includeActivity = exportIncludeActivity?.checked === true;
    const report = reportScopeData(scope, includeCompleted, includeActivity);
    exportNote.textContent = report.tasks.length
      ? `将导出 ${report.tasks.length} 条待办，格式为${exportFormat?.value === 'docx' ? ' Word' : ' PDF'}。`
      : '当前范围内没有可导出的待办。';
  }

  function openExportDialog(source = 'list') {
    if (!exportDialog || !exportScope) return;
    const hasTask = Boolean(findTask(selectedTaskId));
    exportScope.value = source === 'task' && hasTask ? 'task' : 'list';
    exportDialog.hidden = false;
    updateExportDialogNote();
    requestAnimationFrame(() => exportScope.focus({ preventScroll: true }));
  }

  function closeExportDialog() {
    if (exportDialog) exportDialog.hidden = true;
  }

  async function submitExportReport() {
    if (typeof window.notchAPI?.exportTodoReport !== 'function') return;
    const scope = exportScope?.value === 'task' && findTask(selectedTaskId) ? 'task' : 'list';
    const includeCompleted = exportIncludeCompleted?.checked !== false;
    const includeActivity = exportIncludeActivity?.checked === true;
    const report = reportScopeData(scope, includeCompleted, includeActivity);
    if (!report.tasks.length) {
      showToast('当前范围内没有可导出的待办');
      return;
    }
    const format = exportFormat?.value === 'docx' ? 'docx' : 'pdf';
    const result = await window.notchAPI.exportTodoReport({
      format,
      report,
    }).catch(() => null);
    if (result?.ok) {
      closeExportDialog();
      showToast(`已导出${format === 'docx' ? ' Word' : ' PDF'}报告`);
    } else if (!result?.canceled) {
      showToast(result?.error === 'empty_report' ? '没有可导出的待办' : '导出失败');
    }
  }

  async function exportTodoData() {
    if (typeof window.notchAPI?.exportTodoData !== 'function') return;
    const result = await window.notchAPI.exportTodoData(workspace).catch(() => null);
    if (result?.ok) showToast('待办数据已导出');
    else if (!result?.canceled) showToast('导出失败');
  }

  async function importTodoData() {
    if (typeof window.notchAPI?.importTodoData !== 'function') return;
    const result = await window.notchAPI.importTodoData().catch(() => null);
    if (!result?.ok) {
      if (!result?.canceled) showToast('导入失败，文件格式不正确');
      return;
    }
    workspace = Domain.normalizeTodoWorkspace(result.data);
    purgeExpiredTrash();
    selectedTaskId = '';
    selectedTaskIds.clear();
    expandedSubtaskTaskId = '';
    writeWorkspace({ scheduleReminders: true });
    renderAll();
    showToast('待办数据已导入');
  }

  smartNav?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-todo-view]');
    if (!button) return;
    selectView(button.dataset.todoView);
  });

  calendarPrevious?.addEventListener('click', () => {
    closeCalendarDayPopover();
    calendarMonth -= 1;
    if (calendarMonth < 0) {
      calendarMonth = 11;
      calendarYear -= 1;
    }
    renderBoard();
  });
  calendarNext?.addEventListener('click', () => {
    closeCalendarDayPopover();
    calendarMonth += 1;
    if (calendarMonth > 11) {
      calendarMonth = 0;
      calendarYear += 1;
    }
    renderBoard();
  });
  missedPolicySelect?.addEventListener('change', () => {
    workspace.settings ||= { missedReminderPolicy: '24h', templates: [], savedFilters: [] };
    workspace.settings.missedReminderPolicy = ['none', '1h', '24h', '3d'].includes(missedPolicySelect.value)
      ? missedPolicySelect.value
      : '24h';
    writeWorkspace({ scheduleReminders: true });
    showToast('错过提醒策略已更新');
  });
  saveFilterButton?.addEventListener('click', saveCurrentFilter);
  savedFilterList?.addEventListener('click', (event) => {
    const applyButton = event.target.closest('[data-saved-filter-apply]');
    if (applyButton) {
      applySavedFilter(applyButton.dataset.savedFilterApply);
      return;
    }
    const deleteButton = event.target.closest('[data-saved-filter-delete]');
    if (deleteButton) {
      workspace.settings.savedFilters = (workspace.settings.savedFilters || [])
        .filter((item) => item.id !== deleteButton.dataset.savedFilterDelete);
      writeWorkspace({ scheduleReminders: false });
      renderSavedFilters();
    }
  });
  templateSelect?.addEventListener('change', () => {
    const templateId = templateSelect.value;
    templateSelect.value = '';
    if (templateId) createTaskFromTemplate(templateId);
  });
  backupNowButton?.addEventListener('click', () => backupTodoData(true));
  siriImportButton?.addEventListener('click', openSiriImportDialog);
  exportReportButton?.addEventListener('click', () => openExportDialog('list'));
  detailDesktopCard?.addEventListener('click', () => {
    const task = findTask(selectedTaskId);
    if (!task) return;
    setDesktopCard(task.id, !desktopCardIds.has(task.id));
  });
  detailExportReport?.addEventListener('click', () => openExportDialog('task'));
  exportDataButton?.addEventListener('click', exportTodoData);
  importDataButton?.addEventListener('click', importTodoData);
  exportScope?.addEventListener('change', updateExportDialogNote);
  exportFormat?.addEventListener('change', updateExportDialogNote);
  exportIncludeCompleted?.addEventListener('change', updateExportDialogNote);
  exportIncludeActivity?.addEventListener('change', updateExportDialogNote);
  exportCancel?.addEventListener('click', closeExportDialog);
  exportCancelButton?.addEventListener('click', closeExportDialog);
  exportDialog?.addEventListener('click', (event) => {
    if (event.target === exportDialog) closeExportDialog();
  });
  exportForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    submitExportReport();
  });
  siriImportClose?.addEventListener('click', closeSiriImportDialog);
  siriImportCancel?.addEventListener('click', closeSiriImportDialog);
  siriImportDialog?.addEventListener('click', (event) => {
    if (event.target === siriImportDialog) closeSiriImportDialog();
  });
  siriImportForm?.addEventListener('submit', async (event) => {
    event.preventDefault();
    const settings = siriImportSettings();
    settings.reminderListId = String(siriImportReminderList?.value || '');
    settings.targetListId = String(siriImportTargetList?.value || INBOX_ID);
    settings.enabled = siriImportAuto?.checked === true;
    if (!settings.reminderListId) {
      showToast('请选择系统提醒事项列表');
      return;
    }
    renderSiriImportButtonState();
    writeWorkspace({ scheduleReminders: false });
    scheduleSiriImport();
    closeSiriImportDialog();
    await importSiriReminders({ manual: true });
  });
  saveTemplateButton?.addEventListener('click', openTemplateDialog);
  templateForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    commitTemplateDialog();
  });
  templateCancel?.addEventListener('click', closeTemplateDialog);
  templateCancelButton?.addEventListener('click', closeTemplateDialog);
  templateDialog?.addEventListener('click', (event) => {
    if (event.target === templateDialog) closeTemplateDialog();
  });
  window.notchAPI?.onDesktopCardRemoved?.((taskId) => {
    desktopCardIds.delete(String(taskId || ''));
    renderBoard();
    if (selectedTaskId) renderDetail();
  });
  window.notchAPI?.onTodoToggleFromCard?.((payload) => {
    if (payload?.taskId) toggleTask(payload.taskId);
  });
  window.notchAPI?.onTodoUpdateFromCard?.((payload) => {
    applyDesktopCardUpdate(payload);
  });

  listTree?.addEventListener('click', (event) => {
    const viewButton = event.target.closest('[data-todo-list-view]');
    if (viewButton) {
      selectView(`list:${viewButton.dataset.todoListView}`);
      return;
    }
    const editButton = event.target.closest('[data-todo-list-edit]');
    if (editButton) {
      editingListId = editButton.dataset.todoListEdit;
      renderSidebar();
      return;
    }
    const deleteButton = event.target.closest('[data-todo-list-delete]');
    if (deleteButton) {
      deleteList(deleteButton.dataset.todoListDelete);
      return;
    }
    const saveButton = event.target.closest('[data-todo-list-rename-save]');
    if (saveButton) commitListRename(saveButton.dataset.todoListRenameSave);
    const reminderButton = event.target.closest('[data-list-setting-reminder]');
    if (reminderButton) reminderButton.classList.toggle('active');
  });

  listTree?.addEventListener('keydown', (event) => {
    const input = event.target.closest('.todo-list-rename');
    if (!input) return;
    const listId = input.closest('[data-list-id]')?.dataset.listId;
    if (event.key === 'Enter' && !event.isComposing) {
      event.preventDefault();
      commitListRename(listId);
    } else if (event.key === 'Escape') {
      editingListId = '';
      renderSidebar();
    }
  });

  listTree?.addEventListener('focusout', (event) => {
    const input = event.target.closest('.todo-list-rename');
    if (!input) return;
    const listId = input.closest('[data-list-id]')?.dataset.listId;
    setTimeout(() => {
      const editor = listTree?.querySelector(`[data-list-id="${CSS.escape(listId)}"]`);
      if (
        editingListId === listId
        && editor
        && !editor.contains(document.activeElement)
      ) commitListRename(listId);
    }, 0);
  });

  listAddButton?.addEventListener('click', renderNewListForm);
  listCancelButton?.addEventListener('click', closeNewListForm);
  listDefaultReminders?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-new-list-reminder]');
    if (button) button.classList.toggle('active');
  });
  listForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    createList();
  });

  searchInput?.addEventListener('input', () => {
    query = searchInput.value;
    expandedSubtaskTaskId = '';
    renderBoard();
  });

  quickTitleInput?.addEventListener('input', renderQuickPreview);
  quickDeadlineInput?.addEventListener('input', renderQuickPreview);
  quickDeadlineInput?.addEventListener('change', renderQuickPreview);
  [
    quickDeadlineInput,
    detailStart,
    detailDeadline,
    detailStrongReminderAt,
    strongReminderCustomAt,
    dailyReviewCustomAt,
  ].forEach((input) => {
    if (!input) return;
    input.addEventListener('focus', () => openTodoPicker(input));
    input.addEventListener('click', (event) => {
      event.preventDefault();
      openTodoPicker(input);
    });
  });
  pickerPrevious?.addEventListener('click', () => moveTodoPickerMonth(-1));
  pickerNext?.addEventListener('click', () => moveTodoPickerMonth(1));
  pickerGrid?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-todo-picker-day]');
    if (!button || !pickerContext) return;
    pickerContext.value.setDate(Number(button.dataset.todoPickerDay));
    renderTodoPicker();
    applyTodoPickerValue();
  });
  pickerHour?.addEventListener('change', () => {
    if (!pickerContext) return;
    pickerContext.value.setHours(Number(pickerHour.value), pickerContext.value.getMinutes(), 0, 0);
    applyTodoPickerValue();
  });
  pickerMinute?.addEventListener('change', () => {
    if (!pickerContext) return;
    pickerContext.value.setMinutes(Number(pickerMinute.value), 0, 0);
    applyTodoPickerValue();
  });
  pickerClear?.addEventListener('click', () => {
    if (!pickerContext?.input) return;
    pickerContext.input.value = '';
    pickerContext.input.dispatchEvent(new Event('input', { bubbles: true }));
    pickerContext.input.dispatchEvent(new Event('change', { bubbles: true }));
    closeTodoPicker();
  });
  pickerToday?.addEventListener('click', () => {
    if (!pickerContext) return;
    const now = new Date();
    pickerContext.value.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
    renderTodoPicker();
    applyTodoPickerValue();
  });
  pickerDone?.addEventListener('click', () => {
    applyTodoPickerValue();
    closeTodoPicker();
  });
  calendarDayClose?.addEventListener('click', closeCalendarDayPopover);
  calendarDayList?.addEventListener('click', (event) => {
    const taskButton = event.target.closest('[data-calendar-popover-task]');
    if (!taskButton) return;
    selectedTaskId = taskButton.dataset.calendarPopoverTask;
    acknowledgeTaskReminder(selectedTaskId);
    closeCalendarDayPopover();
    renderDetail();
  });
  document.addEventListener('pointerdown', (event) => {
    if (!picker || picker.hidden) return;
    if (picker.contains(event.target) || event.target.closest('[data-todo-date-input]')) return;
    closeTodoPicker();
  }, true);
  document.addEventListener('pointerdown', (event) => {
    if (!calendarDayPopover || calendarDayPopover.hidden) return;
    if (
      calendarDayPopover.contains(event.target)
      || event.target.closest('[data-calendar-more]')
    ) return;
    closeCalendarDayPopover();
  }, true);
  window.addEventListener('resize', () => {
    if (pickerContext?.input) positionTodoPicker(pickerContext.input);
    closeCalendarDayPopover();
  });
  document.addEventListener('scroll', () => {
    if (pickerContext?.input) positionTodoPicker(pickerContext.input);
    closeCalendarDayPopover();
  }, true);

  quickAddForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const text = String(quickTitleInput?.value || '').trim();
    if (!text) return;
    const parsed = parseQuickTask();
    const deadline = fromLocalInput(quickDeadlineInput?.value || '') || parsed?.deadline || '';
    const parsedText = String(parsed?.text || '').trim() || text;
    const task = createTask({
      text: parsedText,
      listId: parsed?.listId || resolveNewTaskListId(),
      deadline,
      priority: parsed?.priority || 'none',
      ...(parsed?.reminderOffsets?.length
        ? { reminderOffsets: parsed.reminderOffsets }
        : {}),
    });
    if (!task) {
      showToast('任务名称不能为空');
      return;
    }
    quickTitleInput.value = '';
    if (quickDeadlineInput) quickDeadlineInput.value = '';
    renderQuickPreview();
    selectedTaskId = task.id;
    renderAll();
    requestAnimationFrame(() => quickTitleInput?.focus({ preventScroll: true }));
  });

  taskList?.addEventListener('click', (event) => {
    if (Date.now() < suppressTodoClickUntil) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    const calendarTask = event.target.closest('[data-calendar-task]');
    if (calendarTask) {
      selectedTaskId = calendarTask.dataset.calendarTask;
      acknowledgeTaskReminder(selectedTaskId);
      renderDetail();
      return;
    }
    const calendarPopoverTask = event.target.closest('[data-calendar-popover-task]');
    if (calendarPopoverTask) {
      selectedTaskId = calendarPopoverTask.dataset.calendarPopoverTask;
      acknowledgeTaskReminder(selectedTaskId);
      closeCalendarDayPopover();
      renderDetail();
      return;
    }
    const calendarMore = event.target.closest('[data-calendar-more]');
    if (calendarMore) {
      openCalendarDayPopover(calendarMore.dataset.calendarMore, calendarMore);
      return;
    }
    const calendarPick = event.target.closest('[data-calendar-pick]');
    if (calendarPick) {
      const date = new Date(calendarYear, calendarMonth, Number(calendarPick.dataset.calendarPick), 23, 30, 0, 0);
      if (quickDeadlineInput) {
        quickDeadlineInput.value = toTodoDateDisplay(date.toISOString());
        quickDeadlineInput.dispatchEvent(new Event('input', { bubbles: true }));
      }
      quickTitleInput?.focus({ preventScroll: true });
      return;
    }
    const historyTask = event.target.closest('[data-history-task]');
    if (historyTask && !historyTask.disabled) {
      selectedTaskId = historyTask.dataset.historyTask;
      renderDetail();
      return;
    }
    const restoreButton = event.target.closest('[data-trash-restore]');
    if (restoreButton) {
      restoreTrashTask(restoreButton.dataset.trashRestore);
      return;
    }
    const permanentDelete = event.target.closest('[data-trash-delete]');
    if (permanentDelete) {
      deleteTrashTaskPermanently(permanentDelete.dataset.trashDelete);
      return;
    }
    const row = event.target.closest('[data-task-id]');
    if (!row) return;
    const taskId = row.dataset.taskId;
    const inlineSubtaskAction = event.target.closest('[data-inline-subtask-action]');
    if (inlineSubtaskAction?.dataset.inlineSubtaskAction === 'toggle') {
      event.preventDefault();
      event.stopPropagation();
      toggleSubtaskForTask(taskId, inlineSubtaskAction.closest('[data-inline-subtask-id]')?.dataset.inlineSubtaskId);
      return;
    }
    if (event.shiftKey || event.metaKey || event.ctrlKey) {
      event.preventDefault();
      toggleTaskSelection(taskId, event.shiftKey);
      return;
    }
    const action = event.target.closest('[data-todo-action]')?.dataset.todoAction;
    if (action === 'toggle') {
      toggleTask(taskId);
      return;
    }
    if (action === 'pin') {
      toggleTaskPin(taskId);
      return;
    }
    if (action === 'desktop') {
      event.preventDefault();
      event.stopPropagation();
      setDesktopCard(taskId, !desktopCardIds.has(taskId));
      return;
    }
    if (action === 'toggle-subtasks') {
      toggleInlineSubtasks(taskId);
      return;
    }
    selectedTaskId = taskId;
    acknowledgeTaskReminder(taskId);
    renderDetail();
    updateOpenTaskRow(taskId);
  });

  taskList?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const main = event.target.closest('.todo-task-main[data-todo-action="open"]');
    if (!main || event.target.closest('button')) return;
    event.preventDefault();
    const row = main.closest('[data-task-id]');
    if (!row) return;
    selectedTaskId = row.dataset.taskId;
    acknowledgeTaskReminder(selectedTaskId);
    renderDetail();
    updateOpenTaskRow(selectedTaskId);
  });

  taskList?.addEventListener('dragstart', (event) => {
    const desktopHandle = event.target.closest('[data-desktop-drag]');
    if (desktopHandle) {
      draggedTaskId = '';
      desktopDragTaskId = desktopHandle.dataset.desktopDrag;
      event.dataTransfer.effectAllowed = 'copy';
      event.dataTransfer.setData('text/plain', `desktop-card:${desktopDragTaskId}`);
      return;
    }
    const list = findList(viewListId());
    const row = event.target.closest('[data-task-id].is-manual');
    if (!list || list.sortMode !== 'manual' || !row) {
      event.preventDefault();
      return;
    }
    draggedTaskId = row.dataset.taskId;
    row.classList.add('is-dragging');
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', draggedTaskId);
  });

  taskList?.addEventListener('dragover', (event) => {
    if (!draggedTaskId) return;
    event.preventDefault();
    const row = event.target.closest('[data-task-id]');
    taskList.querySelectorAll('.drop-before, .drop-after').forEach((item) => {
      item.classList.remove('drop-before', 'drop-after');
    });
    if (!row || row.dataset.taskId === draggedTaskId) return;
    const rect = row.getBoundingClientRect();
    row.classList.add(event.clientY < rect.top + rect.height / 2 ? 'drop-before' : 'drop-after');
  });

  taskList?.addEventListener('drop', (event) => {
    if (!draggedTaskId) return;
    event.preventDefault();
    const target = event.target.closest('[data-task-id]');
    const ids = [...taskList.querySelectorAll('[data-task-id]')].map((row) => row.dataset.taskId);
    const sourceIndex = ids.indexOf(draggedTaskId);
    if (sourceIndex < 0) return;
    ids.splice(sourceIndex, 1);
    if (target && target.dataset.taskId !== draggedTaskId) {
      let targetIndex = ids.indexOf(target.dataset.taskId);
      const rect = target.getBoundingClientRect();
      if (event.clientY >= rect.top + rect.height / 2) targetIndex += 1;
      ids.splice(Math.max(0, targetIndex), 0, draggedTaskId);
    } else {
      ids.splice(sourceIndex, 0, draggedTaskId);
    }
    workspace.tasks = Domain.reorderTodoTasks(workspace.tasks, ids);
    writeWorkspace({ scheduleReminders: false });
    suppressTodoClickUntil = Date.now() + 240;
    draggedTaskId = '';
    renderBoard();
  });

  taskList?.addEventListener('dragend', () => {
    if (desktopDragTaskId) {
      const taskId = desktopDragTaskId;
      desktopDragTaskId = '';
      suppressTodoClickUntil = Date.now() + 350;
      window.notchAPI?.addDesktopCardFromDrop?.(taskId).then((result) => {
        if (!result?.ok) return;
        desktopCardIds = new Set(Array.isArray(result.ids) ? result.ids : []);
        desktopCardsLoaded = true;
        syncDesktopCards();
        renderBoard();
        if (selectedTaskId) renderDetail();
        showToast('已发送到桌面');
      }).catch(() => {});
      return;
    }
    draggedTaskId = '';
    taskList.querySelectorAll('.is-dragging, .drop-before, .drop-after').forEach((item) => {
      item.classList.remove('is-dragging', 'drop-before', 'drop-after');
    });
  });

  bulkDeleteButton?.addEventListener('click', () => {
    if (!selectedTaskIds.size) return;
    const count = selectedTaskIds.size;
    const deletedAt = Date.now();
    workspace.trash ||= [];
    workspace.tasks
      .filter((task) => selectedTaskIds.has(task.id))
      .forEach((task) => workspace.trash.unshift({ ...task, deletedAt }));
    workspace.trash = workspace.trash.slice(0, 500);
    workspace.tasks = workspace.tasks.filter((task) => !selectedTaskIds.has(task.id));
    selectedTaskIds.clear();
    selectionAnchor = '';
    expandedSubtaskTaskId = '';
    if (!findTask(selectedTaskId)) selectedTaskId = '';
    writeWorkspace();
    renderAll();
    showToast(`已删除 ${count} 项待办`);
  });

  sortToggle?.addEventListener('click', () => {
    const list = findList(viewListId());
    if (!list) return;
    list.sortMode = list.sortMode === 'manual' ? 'auto' : 'manual';
    writeWorkspace({ scheduleReminders: false });
    renderBoard();
  });

  detailClose?.addEventListener('click', closeDetail);
  activityToggle?.addEventListener('click', () => {
    if (!selectedTaskId) return;
    expandedActivityTaskId = expandedActivityTaskId === selectedTaskId ? '' : selectedTaskId;
    renderDetail(findTask(selectedTaskId));
  });
  dailyReviewClose?.addEventListener('click', () => {
    if (dailyReviewBackdrop) dailyReviewBackdrop.hidden = true;
  });
  dailyReviewDone?.addEventListener('click', () => {
    if (dailyReviewBackdrop) dailyReviewBackdrop.hidden = true;
  });
  dailyReviewBackdrop?.addEventListener('click', (event) => {
    if (event.target === dailyReviewBackdrop) dailyReviewBackdrop.hidden = true;
  });
  dailyReviewTasks?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-daily-review-action]');
    if (!button) return;
    const task = findTask(button.dataset.taskId);
    if (!task) return;
    if (button.dataset.dailyReviewAction === 'block') {
      openBlockDialog(task.id);
      return;
    }
    if (button.dataset.dailyReviewAction === 'tomorrow') {
      const target = Date.parse(task.deadline) + 24 * 60 * 60 * 1000;
      if (rescheduleTaskFromDailyReview(task.id, target, '每日收尾顺延一天')) {
        renderAll();
        renderDailyReview();
      }
      return;
    }
    if (button.dataset.dailyReviewAction === 'custom') {
      dailyReviewCustomTaskId = task.id;
      dailyReviewCustomAt.value = toTodoDateDisplay(task.deadline);
      openTodoPicker(dailyReviewCustomAt);
    }
  });
  dailyReviewAllTomorrow?.addEventListener('click', () => {
    rescheduleAllDailyReview(1);
  });
  dailyReviewAllMorning?.addEventListener('click', () => {
    rescheduleAllDailyReview(1, 9);
  });
  dailyReviewCustomAt?.addEventListener('change', () => {
    if (!dailyReviewCustomTaskId) return;
    const nextAt = fromLocalInput(dailyReviewCustomAt.value);
    const taskId = dailyReviewCustomTaskId;
    dailyReviewCustomTaskId = '';
    closeTodoPicker();
    if (!nextAt || Date.parse(nextAt) <= Date.now()) {
      showToast('请选择晚于当前时间的收尾时间');
      return;
    }
    if (rescheduleTaskFromDailyReview(taskId, nextAt, '每日收尾自定义时间')) {
      renderAll();
      renderDailyReview();
    }
  });
  detailPin?.addEventListener('click', () => {
    if (selectedTaskId) toggleTaskPin(selectedTaskId);
  });
  detailDelete?.addEventListener('click', () => {
    if (selectedTaskId) deleteTask(selectedTaskId);
  });
  detailStrongReminder?.addEventListener('input', (event) => {
    event.stopPropagation();
  });
  detailStrongReminderAt?.addEventListener('input', () => {
    detailStrongReminderAt.dataset.linked = 'false';
  });

  function setStrongReminderTimeError(message = '') {
    if (!strongReminderTimeError) return;
    strongReminderTimeError.textContent = message;
    strongReminderTimeError.hidden = !message;
  }

  function renderStrongReminderTimeDraft() {
    const task = findTask(selectedTaskId);
    const deadlineAt = Date.parse(String(task?.deadline || ''));
    if (!Number.isFinite(deadlineAt)) {
      setStrongReminderTimeError('请先设置任务截止时间。');
      return;
    }
    let at = '';
    if (strongReminderTimeDraft.kind === 'same') {
      at = task.deadline;
    } else if (strongReminderTimeDraft.kind === 'minutes') {
      at = new Date(
        deadlineAt - Math.max(0, Number(strongReminderTimeDraft.minutes) || 0) * 60 * 1000
      ).toISOString();
    } else {
      at = strongReminderTimeDraft.at || task.deadline;
    }
    strongReminderTimeDraft.at = at;
    strongReminderTimeOptions?.querySelectorAll('[data-strong-reminder-time]').forEach((button) => {
      const value = button.dataset.strongReminderTime;
      const active = value === 'same'
        ? strongReminderTimeDraft.kind === 'same'
        : value === 'custom'
          ? strongReminderTimeDraft.kind === 'custom'
          : strongReminderTimeDraft.kind === 'minutes'
            && Number(value) === Number(strongReminderTimeDraft.minutes);
      button.classList.toggle('active', active);
    });
    const custom = strongReminderTimeDraft.kind === 'custom';
    if (strongReminderTimeCustomField) strongReminderTimeCustomField.hidden = !custom;
    if (strongReminderCustomAt) {
      strongReminderCustomAt.disabled = !custom;
      strongReminderCustomAt.value = custom ? toTodoDateDisplay(strongReminderTimeDraft.at) : '';
    }
  }

  function closeStrongReminderDialog(options = {}) {
    const task = findTask(selectedTaskId);
    strongReminderWarningOpen = false;
    if (strongReminderWarning) strongReminderWarning.hidden = true;
    if (strongReminderWarningStep) strongReminderWarningStep.hidden = false;
    if (strongReminderTimeStep) strongReminderTimeStep.hidden = true;
    setStrongReminderTimeError('');
    if (options.restoreCheckbox !== false && detailStrongReminder) {
      detailStrongReminder.checked = task?.strongReminder === true;
    }
  }

  function openStrongReminderTimeStep() {
    const task = findTask(selectedTaskId);
    if (!task || !Number.isFinite(Date.parse(String(task.deadline || '')))) {
      closeStrongReminderDialog();
      if (detailStrongReminder) detailStrongReminder.checked = false;
      showToast('请先设置截止时间，再开启强提醒');
      return;
    }
    strongReminderTimeDraft = {
      kind: 'same',
      minutes: 0,
      at: task.deadline,
    };
    if (strongReminderWarningStep) strongReminderWarningStep.hidden = true;
    if (strongReminderTimeStep) strongReminderTimeStep.hidden = false;
    renderStrongReminderTimeDraft();
    setStrongReminderTimeError('');
    strongReminderTimeConfirm?.focus({ preventScroll: true });
  }

  function selectStrongReminderTime(value) {
    if (value === 'custom') {
      strongReminderTimeDraft = {
        ...strongReminderTimeDraft,
        kind: 'custom',
        minutes: 0,
        at: strongReminderTimeDraft.at || findTask(selectedTaskId)?.deadline || '',
      };
    } else if (value === 'same') {
      strongReminderTimeDraft = { kind: 'same', minutes: 0, at: '' };
    } else {
      strongReminderTimeDraft = {
        kind: 'minutes',
        minutes: Number(value) || 0,
        at: '',
      };
    }
    setStrongReminderTimeError('');
    renderStrongReminderTimeDraft();
  }

  function confirmStrongReminderTime() {
    const task = findTask(selectedTaskId);
    if (!task) return;
    const at = strongReminderTimeDraft.kind === 'custom'
      ? fromLocalInput(strongReminderCustomAt?.value || '')
      : strongReminderTimeDraft.at;
    const deadlineAt = Date.parse(String(task.deadline || ''));
    const strongAt = Date.parse(String(at || ''));
    if (!Number.isFinite(strongAt)) {
      setStrongReminderTimeError('请选择强提醒时间。');
      return;
    }
    if (!Number.isFinite(deadlineAt) || strongAt > deadlineAt) {
      setStrongReminderTimeError('强提醒时间不能晚于任务截止时间。');
      return;
    }
    if (detailStrongReminder) detailStrongReminder.checked = true;
    if (detailStrongReminderTimeField) detailStrongReminderTimeField.hidden = false;
    if (detailStrongReminderAt) {
      detailStrongReminderAt.value = toTodoDateDisplay(at);
      detailStrongReminderAt.dataset.linked = strongReminderTimeDraft.kind === 'same'
        ? 'true'
        : 'false';
    }
    closeStrongReminderDialog();
    if (detailStrongReminder) detailStrongReminder.checked = true;
    commitDetail();
  }

  detailStrongReminder?.addEventListener('change', (event) => {
    event.stopPropagation();
    const task = findTask(selectedTaskId);
    if (!task) return;
    if (!detailStrongReminder.checked) {
      closeStrongReminderDialog({ restoreCheckbox: false });
      if (detailStrongReminderTimeField) detailStrongReminderTimeField.hidden = true;
      if (detailStrongReminderAt) {
        detailStrongReminderAt.value = '';
        detailStrongReminderAt.dataset.linked = 'false';
      }
      commitDetail();
      return;
    }
    if (task.strongReminder === true) {
      strongReminderWarningOpen = false;
      if (strongReminderWarning) strongReminderWarning.hidden = true;
      if (detailStrongReminderTimeField) detailStrongReminderTimeField.hidden = false;
      commitDetail();
      return;
    }
    strongReminderWarningOpen = true;
    if (strongReminderWarning) {
      strongReminderWarning.hidden = false;
      strongReminderWarningStep?.removeAttribute('hidden');
      strongReminderTimeStep?.setAttribute('hidden', '');
      setStrongReminderTimeError('');
    }
    strongReminderWarningConfirm?.focus({ preventScroll: true });
  });
  strongReminderWarningCancel?.addEventListener('click', () => {
    closeStrongReminderDialog();
  });
  strongReminderWarningConfirm?.addEventListener('click', () => {
    openStrongReminderTimeStep();
  });
  strongReminderTimeOptions?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-strong-reminder-time]');
    if (!button) return;
    selectStrongReminderTime(button.dataset.strongReminderTime);
  });
  strongReminderCustomAt?.addEventListener('input', () => {
    const at = fromLocalInput(strongReminderCustomAt.value);
    if (at) strongReminderTimeDraft.at = at;
    setStrongReminderTimeError('');
  });
  strongReminderTimeCancel?.addEventListener('click', () => {
    closeStrongReminderDialog();
  });
  strongReminderTimeConfirm?.addEventListener('click', () => {
    confirmStrongReminderTime();
  });
  strongReminderWarning?.addEventListener('click', (event) => {
    if (event.target !== strongReminderWarning) return;
    closeStrongReminderDialog();
  });

  detailState?.addEventListener('change', () => {
    const task = findTask(selectedTaskId);
    if (!task) return;
    const nextStatus = detailState.value;
    if (nextStatus === 'blocked') {
      openBlockDialog(task.id);
      return;
    }
    if (nextStatus === 'done') {
      if (!task.done) toggleTask(task.id);
      return;
    }
    const wasBlocked = taskStatus(task) === 'blocked';
    const activityMessage = nextStatus === 'done'
      ? '标记为已完成'
      : wasBlocked
        ? `解除受阻，状态改为${statusLabel(nextStatus)}`
        : `状态改为${statusLabel(nextStatus)}`;
    updateTask(task.id, {
      done: nextStatus === 'done',
      status: nextStatus,
      completedAt: nextStatus === 'done' ? Date.now() : 0,
      blockedAt: 0,
      blockReasonType: '',
      blockReason: '',
      nextAction: '',
      activity: appendActivity(task, nextStatus === 'done' ? 'completed' : wasBlocked ? 'unblocked' : 'status_changed', activityMessage),
    });
  });

  blockReasonOptions?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-block-reason]');
    if (!button) return;
    setBlockReasonSelection(button.dataset.blockReason);
    if (blockDialogError) {
      blockDialogError.hidden = true;
      blockDialogError.textContent = '';
    }
  });
  blockCancel?.addEventListener('click', closeBlockDialog);
  blockCancelButton?.addEventListener('click', closeBlockDialog);
  blockEdit?.addEventListener('click', () => openBlockDialog(selectedTaskId));
  blockClear?.addEventListener('click', () => {
    const task = findTask(selectedTaskId);
    if (!task || taskStatus(task) !== 'blocked') return;
    updateTask(task.id, {
      status: 'todo',
      blockedAt: 0,
      blockReasonType: '',
      blockReason: '',
      nextAction: '',
      activity: appendActivity(task, 'unblocked', '解除受阻，恢复为待办'),
    });
    showToast('已解除受阻');
  });
  blockDialog?.addEventListener('click', (event) => {
    if (event.target === blockDialog) closeBlockDialog();
  });
  blockForm?.addEventListener('submit', (event) => {
    event.preventDefault();
    const task = findTask(blockDialogTaskId || selectedTaskId);
    if (!task) return;
    const reasonType = blockDraftReasonType;
    const reason = String(blockReasonInput?.value || '').trim();
    if (!reasonType) {
      if (blockDialogError) {
        blockDialogError.textContent = '请选择受阻原因类型。';
        blockDialogError.hidden = false;
      }
      return;
    }
    if (!reason) {
      if (blockDialogError) {
        blockDialogError.textContent = '请填写具体说明，说明任务为什么无法推进。';
        blockDialogError.hidden = false;
      }
      blockReasonInput?.focus();
      return;
    }
    const nextAction = String(blockNextActionInput?.value || '').trim();
    const previous = taskStatus(task) === 'blocked';
    const label = BLOCK_REASON_LABELS[reasonType] || '其他';
    const next = updateTask(task.id, {
      status: 'blocked',
      blockedAt: task.blockedAt || Date.now(),
      blockReasonType: reasonType,
      blockReason: reason,
      nextAction,
      activity: appendActivity(
        task,
        'blocked',
        `${previous ? '更新受阻原因' : '标记受阻'}：${label} · ${reason}${nextAction ? ` · 下一步：${nextAction}` : ''}`
      ),
    });
    if (!next) return;
    closeBlockDialog();
    if (dailyReviewBackdrop && !dailyReviewBackdrop.hidden) renderDailyReview();
    showToast(previous ? '受阻记录已更新' : '已记录受阻原因');
  });

  detailForm?.addEventListener('input', (event) => {
    if (event.target === detailDeadline) {
      scheduleDetailSave({ rerenderDetail: true });
      return;
    }
    scheduleDetailSave();
  });

  detailForm?.addEventListener('change', (event) => {
    if (event.target === detailState) return;
    if (event.target === detailDeadline) {
      scheduleDetailSave({ rerenderDetail: true });
      return;
    }
    scheduleDetailSave();
  });

  detailForm?.addEventListener('focusout', (event) => {
    if (strongReminderWarningOpen && event.target === detailStrongReminder) return;
    if (event.target.matches('input, textarea, select')) commitDetail();
  });
  detailRecurrence?.addEventListener('change', () => {
    const unit = detailRecurrence.value;
    if (recurrenceUnit) {
      recurrenceUnit.textContent = unit === 'day'
        ? '天'
        : unit === 'week'
          ? '周'
          : unit === 'month'
            ? '个月'
            : unit === 'weekday'
              ? '个工作日'
              : '次';
    }
    commitDetail();
  });

  reminderPresets?.addEventListener('click', (event) => {
    const button = event.target.closest('[data-reminder-offset], [data-reminder-id]');
    if (!button || button.disabled) return;
    button.classList.toggle('active');
    commitDetail();
  });

  reminderAddButton?.addEventListener('click', () => {
    const minutes = Math.max(1, Math.min(525600, Math.round(Number(reminderMinutes?.value) || 0)));
    if (!minutes) return;
    if (reminderMinutes) reminderMinutes.value = '';
    addReminderOffset(minutes);
  });

  subtaskAddButton?.addEventListener('click', addSubtask);
  subtaskTitle?.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.isComposing) return;
    event.preventDefault();
    addSubtask();
  });

  subtaskList?.addEventListener('click', (event) => {
    const row = event.target.closest('[data-subtask-id]');
    if (!row) return;
    const action = event.target.closest('[data-todo-subtask-action]')?.dataset.todoSubtaskAction;
    if (action === 'toggle') toggleSubtask(row.dataset.subtaskId);
    if (action === 'delete') deleteSubtask(row.dataset.subtaskId);
  });

  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (dailyReviewBackdrop && !dailyReviewBackdrop.hidden) {
        event.preventDefault();
        dailyReviewBackdrop.hidden = true;
        return;
      }
      if (templateDialog && !templateDialog.hidden) {
        event.preventDefault();
        closeTemplateDialog();
        return;
      }
      if (calendarDayPopover && !calendarDayPopover.hidden) {
        event.preventDefault();
        closeCalendarDayPopover();
        return;
      }
      if (picker && !picker.hidden) {
        event.preventDefault();
        closeTodoPicker();
        return;
      }
      if (selectedTaskIds.size) {
        event.preventDefault();
        clearSelection();
      }
      return;
    }
    const tab = document.getElementById('tab-todo');
    if (!tab?.classList.contains('active') || tab.inert) return;
    const target = event.target instanceof Element ? event.target : null;
    if (target?.closest('input, textarea, select, [contenteditable]')) return;
    if (event.metaKey || event.ctrlKey || event.altKey) return;
    const key = event.key.toLowerCase();
    if (key === 'j' || key === 'k') {
      event.preventDefault();
      navigateTodoTasks(key === 'j' ? 1 : -1);
    } else if (key === 'c' && selectedTaskId) {
      event.preventDefault();
      toggleTask(selectedTaskId);
    } else if (key === 'p' && selectedTaskId) {
      event.preventDefault();
      toggleTaskPin(selectedTaskId);
    } else if (key === 'n') {
      event.preventDefault();
      quickTitleInput?.focus({ preventScroll: true });
    } else if (key === '/') {
      event.preventDefault();
      searchInput?.focus({ preventScroll: true });
    }
  });

  function appendStrongReminderNote(source, text) {
    const line = `[强提醒 ${new Date().toLocaleString('zh-CN', { hour12: false })}] ${text}`;
    const base = typeof source === 'string' ? source : source?.notes;
    return [String(base || '').trim(), line].filter(Boolean).join('\n');
  }

  function applyStrongReminderResult(payload) {
    const task = findTask(payload?.taskId);
    const answers = Array.isArray(payload?.answers) ? payload.answers : [];
    if (!task || answers.length !== 2) return;
    const [completionAnswer, timeAnswer] = answers;
    const completionConfirmed = payload?.completionConfirmed === true;
    const wasDone = task.done === true;

    if (completionAnswer === 'completed' && completionConfirmed) {
      const completedAt = Date.now();
      const reminders = (task.reminders || []).map((reminder) => ({
        ...reminder,
        strong: false,
      }));
      const notes = appendStrongReminderNote(task, [
        '完成状态：已完成',
        '完成确认：已二次确认',
        '后续强提醒：已停止',
      ].join('；'));
      const completedTask = Domain.updateDetailedTodo(task, {
        done: true,
        completedAt,
        reminders,
        strongReminder: false,
        notes,
        activity: appendActivity(task, 'strong_completed', '强提醒：确认已完成'),
      }, workspace.lists, Date.now());
      if (!completedTask || !replaceTask(completedTask, { scheduleReminders: true })) return;
      if (!wasDone && completedTask.recurrence) {
        const nextOrder = workspace.tasks.reduce(
          (maximum, item) => Math.max(maximum, Number(item.order) || 0),
          -1
        ) + 1;
        const occurrence = Domain.createNextTodoOccurrence(
          { ...completedTask, order: nextOrder },
          workspace.lists,
          generateId('todo'),
          Date.now()
        );
        if (occurrence) {
          occurrence.activity = appendActivity(
            occurrence,
            'recurrence_created',
            `由重复任务生成，截止 ${formatDue(occurrence.deadline)}`
          );
          workspace.tasks.push(occurrence);
          writeWorkspace({ scheduleReminders: true });
        }
      }
      renderAll();
      showToast('强提醒已完成并停止后续提醒。');
      return;
    }

    if (completionAnswer !== 'not_completed') return;
    const customNextStrong = ['custom', 'custom_extend'].includes(timeAnswer);
    const nextStrongAt = customNextStrong && payload?.strongReminderAt
      ? payload.strongReminderAt
      : timeAnswer === 'deadline'
        ? task.deadline || ''
        : '';
    const extendDeadline = Boolean(nextStrongAt)
      && (payload?.extendDeadline === true || timeAnswer === 'custom_extend');
    const nextDeadline = extendDeadline ? nextStrongAt : task.deadline;
    const strongReminderLinked = Boolean(nextStrongAt)
      && (timeAnswer === 'deadline' || extendDeadline);
    let reminders = (task.reminders || [])
      .filter((reminder) => (
        reminder.strong !== true
      ))
      .map((reminder) => (
        Number.isFinite(Number(reminder.offsetMinutes))
          ? { ...reminder, at: '', firedAt: 0, strong: false }
          : reminder
      ));
    const strongReminder = Boolean(nextStrongAt);
    if (nextStrongAt) {
      reminders.push({
        id: generateId('reminder'),
        offsetMinutes: null,
        at: nextStrongAt,
        firedAt: 0,
        soundId: 'alert',
        strong: true,
      });
    }
    const notes = appendStrongReminderNote(task, (
      extendDeadline
        ? [
          '完成状态：未完成',
          `原任务截止时间：${formatDue(task.deadline) || '未设置'}`,
          `新任务截止时间：${formatDue(nextDeadline) || '未设置'}`,
          `下一次强提醒：${formatDue(nextStrongAt)}`,
          '截止时间变更原因：强提醒顺延',
        ]
        : [
          '完成状态：未完成',
          `任务截止时间：${formatDue(task.deadline) || '未设置'}`,
          `下一次强提醒：${nextStrongAt ? formatDue(nextStrongAt) : '已停止'}`,
        ]
    ).join('；'));

    const next = Domain.updateDetailedTodo(task, {
      done: false,
      completedAt: 0,
      deadline: nextDeadline,
      reminders,
      strongReminder,
      strongReminderAt: nextStrongAt,
      strongReminderLinked,
      notes,
      activity: appendActivity(
        task,
        'strong_rescheduled',
        extendDeadline
          ? `强提醒顺延：截止 ${formatDue(task.deadline) || '未设置'} → ${formatDue(nextDeadline)}，下一次强提醒 ${formatDue(nextStrongAt)}`
          : nextStrongAt
            ? `强提醒回答：未完成，下一次 ${formatDue(nextStrongAt)}`
            : '强提醒回答：未完成，停止后续强提醒'
      ),
    }, workspace.lists, Date.now());
    if (!next || !replaceTask(next, { scheduleReminders: true })) return;
    renderAll();
    showToast('强提醒已回答，待办已更新。');
  }

  window.notchAPI?.onStrongReminderResolved?.((payload) => {
    applyStrongReminderResult(payload);
  });

  window.notchAPI?.onStrongReminderAborted?.((payload) => {
    const task = findTask(payload?.taskId);
    if (!task) return;
    const next = Domain.updateDetailedTodo(task, {
      strongReminder: false,
      reminders: (task.reminders || []).map((reminder) => ({
        ...reminder,
        strong: false,
      })),
      notes: appendStrongReminderNote(
        task,
        '强提醒保存失败，已应急退出并停止强提醒。'
      ),
    }, workspace.lists, Date.now());
    if (!next || !replaceTask(next, { scheduleReminders: true })) return;
    renderAll();
    showToast('已应急退出强提醒，待办保持原状态。');
  });

  window.notchAPI?.onTodoReminder?.((payload) => {
    const task = findTask(payload?.id || payload?.taskId);
    if (!task || !payload?.reminderId) return;
    const reminder = task.reminders?.find((item) => item.id === payload.reminderId);
    if (!reminder) return;
    reminder.firedAt = Math.max(0, Number(payload.firedAt || payload.remindedAt) || Date.now());
    if (reminder.strong !== true) {
      task.unhandledReminderAt = new Date(reminder.firedAt).toISOString();
      task.unhandledReminderId = reminder.id;
    }
    task.activity = appendActivity(
      task,
      reminder.strong ? 'strong_reminder_fired' : 'reminder_fired',
      `${reminder.strong ? '强提醒' : '提醒'}已触发：${formatDue(payload.reminderAt || reminder.at)}`
    );
    appendReminderHistory({
      taskId: task.id,
      title: task.text,
      reminderId: reminder.id,
      status: payload.status === 'missed' ? 'missed' : 'fired',
      at: payload.reminderAt || reminder.at,
      firedAt: reminder.firedAt,
      soundId: payload.soundId || reminder.soundId,
    });
    writeWorkspace();
    renderBoard();
    if (task.id === selectedTaskId) renderDetail(task);
  });

  window.notchAPI?.onTodoSnoozed?.((payload) => {
    const task = findTask(payload?.taskId);
    if (!task || !payload?.reminderId || !payload?.at) return;
    const snoozedAt = Date.parse(String(payload.at));
    const snoozedAtMs = Number.isFinite(snoozedAt) ? snoozedAt : Date.now();
    const sourceReminderId = String(payload.sourceReminderId || '');
    let replacedSource = false;
    const reminders = (task.reminders || []).map((reminder) => {
      if (!replacedSource && reminder.id === sourceReminderId && reminder.strong !== true) {
        replacedSource = true;
        return {
          ...reminder,
          id: payload.reminderId,
          offsetMinutes: null,
          at: payload.at,
          firedAt: 0,
          strong: false,
          soundId: payload.soundId || reminder.soundId,
        };
      }
      const offsetMinutes = Number(reminder.offsetMinutes);
      if (Number.isFinite(offsetMinutes) && reminder.strong !== true) {
        return {
          ...reminder,
          at: '',
          firedAt: Date.now(),
          soundId: payload.soundId || reminder.soundId,
        };
      }
      const reminderAt = Date.parse(String(reminder.at || ''));
      if (
        reminder.strong !== true
        && Number.isFinite(reminderAt)
        && reminderAt <= snoozedAtMs
      ) {
        return { ...reminder, firedAt: Date.now() };
      }
      return reminder;
    });
    if (!replacedSource) {
      reminders.push({
        id: payload.reminderId,
        offsetMinutes: null,
        at: payload.at,
        firedAt: 0,
        soundId: payload.soundId || 'bright',
        strong: false,
      });
    }
    appendReminderHistory({
      taskId: task.id,
      title: task.text,
      reminderId: payload.reminderId,
      status: 'snoozed',
      at: payload.at,
      firedAt: Date.now(),
      soundId: payload.soundId || 'bright',
    });
    const next = Domain.updateDetailedTodo(task, {
      deadline: payload.at,
      reminders,
      unhandledReminderAt: '',
      unhandledReminderId: '',
      activity: appendActivity(
        task,
        'rescheduled',
        `稍后提醒：${formatDue(task.deadline) || '未设置'} → ${formatDue(payload.at)}`
      ),
    }, workspace.lists, Date.now());
    if (!next || !replaceTask(next, { scheduleReminders: true })) return;
    renderAll();
    showToast(`已顺延到 ${formatDue(payload.at)}`);
  });

  window.notchAPI?.onTodoReminderHandled?.((payload) => {
    if (!acknowledgeTaskReminder(payload?.taskId)) return;
    if (selectedTaskId === String(payload?.taskId || '')) renderDetail();
  });

  window.notchAPI?.onOpenTodoTask?.((payload) => {
    const task = findTask(payload?.taskId);
    if (!task) return;
    selectedTaskId = task.id;
    acknowledgeTaskReminder(task.id);
    if (!taskMatchesCurrentView(task) && !['calendar', 'history', 'trash'].includes(selectedView)) {
      selectedView = `list:${task.listId}`;
      try { localStorage.setItem(VIEW_KEY, selectedView); } catch (error) {}
      renderAll();
    } else {
      renderDetail(task);
      updateOpenTaskRow(task.id);
    }
    requestAnimationFrame(() => {
      taskList?.querySelector(`[data-task-id="${CSS.escape(task.id)}"]`)
        ?.scrollIntoView({ block: 'center' });
    });
  });

  document.addEventListener('notch:open-todo-task', (event) => {
    const taskId = String(event.detail?.taskId || '');
    if (!findTask(taskId)) return;
    selectedTaskId = taskId;
    renderAll();
    document.dispatchEvent(new CustomEvent('notch:open-todo'));
  });

  document.addEventListener('notch:tabchange', (event) => {
    if (event.detail?.tab === 'todo') renderAll();
    else closeTodoPicker();
  });
  document.addEventListener('notch:modechange', (event) => {
    if (event.detail?.expanded !== true) {
      closeTodoPicker();
      closeBlockDialog();
      closeExportDialog();
      closeSiriImportDialog();
    }
  });

  window.addEventListener('beforeunload', () => {
    if (siriImportTimer) clearInterval(siriImportTimer);
    if (siriImportInitialTimer) clearTimeout(siriImportInitialTimer);
    siriImportTimer = null;
    siriImportInitialTimer = null;
    commitDetail();
  });

  window.NotchTodo = Object.freeze({
    getWorkspace: () => JSON.parse(JSON.stringify(workspace)),
    getStrongReminderQuestions: () => Domain.normalizeStrongReminderQuestions(
      workspace.settings?.strongReminderQuestions
    ),
      setStrongReminderQuestions: (questions) => {
      const normalized = Domain.normalizeStrongReminderQuestions(questions);
      workspace.settings ||= {};
      workspace.settings.strongReminderQuestions = normalized;
      writeWorkspace({ scheduleReminders: true });
        return [...normalized];
      },
      getDailyReviewSettings: () => Domain.normalizeDailyReviewSettings(
        workspace.settings?.dailyReview
      ),
      openDailyReview: () => {
        showDailyReview();
        return dailyReviewBackdrop?.hidden !== false ? false : true;
      },
      rescheduleDailyReviewTask: (taskId, at, reason = '每日收尾顺延') => (
        rescheduleTaskFromDailyReview(taskId, at, reason)
      ),
      getHoverPreview: () => hoverTodoPreview(),
      setDailyReviewSettings: (settings) => {
        const normalized = Domain.normalizeDailyReviewSettings(settings);
        workspace.settings ||= {};
        workspace.settings.dailyReview = normalized;
        writeWorkspace({ scheduleReminders: false });
        scheduleDailyReview();
        return { ...normalized };
      },
      resetStrongReminderQuestions: () => {
      const normalized = [...Domain.DEFAULT_STRONG_REMINDER_QUESTIONS];
      workspace.settings ||= {};
      workspace.settings.strongReminderQuestions = normalized;
      writeWorkspace({ scheduleReminders: true });
      return [...normalized];
    },
    refresh: renderAll,
    selectView,
    getSelectedTaskId: () => selectedTaskId,
    clearSelection,
    closeDetail,
    openTask: (taskId) => {
      const task = findTask(taskId);
      if (!task) return false;
      selectedTaskId = task.id;
      acknowledgeTaskReminder(task.id);
      renderDetail(task);
      updateOpenTaskRow(task.id);
      return true;
    },
    toggleTask: (taskId) => {
      if (!findTask(taskId)) return false;
      toggleTask(taskId);
      return true;
    },
    quickAdd: quickAddText,
    handleEscape: () => {
      if (siriImportDialog && !siriImportDialog.hidden) {
        closeSiriImportDialog();
        return true;
      }
      if (blockDialog && !blockDialog.hidden) {
        closeBlockDialog();
        return true;
      }
      if (exportDialog && !exportDialog.hidden) {
        closeExportDialog();
        return true;
      }
      if (dailyReviewBackdrop && !dailyReviewBackdrop.hidden) {
        dailyReviewBackdrop.hidden = true;
        return true;
      }
      if (templateDialog && !templateDialog.hidden) {
        closeTemplateDialog();
        return true;
      }
      if (calendarDayPopover && !calendarDayPopover.hidden) {
        closeCalendarDayPopover();
        return true;
      }
      if (picker && !picker.hidden) {
        closeTodoPicker();
        return true;
      }
      return false;
    },
  });

  purgeExpiredTrash();
  scheduleDailyReview();
  writeWorkspace();
  renderAll();
  loadDesktopCards();
  if (window.notchAPI?.platform !== 'darwin') siriImportButton?.setAttribute('hidden', '');
  scheduleSiriImport();
  setTimeout(() => backupTodoData(false), 1200);
})();
