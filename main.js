const {
  app,
  BrowserWindow,
  screen,
  ipcMain,
  powerMonitor,
  Notification,
  Tray,
  Menu,
  nativeImage,
  shell,
  systemPreferences,
  clipboard,
  globalShortcut,
  safeStorage,
  dialog,
  desktopCapturer,
  ClipboardItem,
} = require('electron');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const http = require('http');
const dns = require('dns');
const crypto = require('crypto');
const { execFile } = require('child_process');
const platformPolicy = require('./platform');
const { MediaSessionService } = require('./media-session');
const { detectBrowserMedia } = require('./browser-media');
const {
  normalizeTodoReport,
  suggestedReportFileName,
  buildTodoReportHtml,
  buildTodoReportDocx,
} = require('./report-export');
const PLATFORM_CAPABILITIES = platformPolicy.capabilities(process.platform);
const {
  isPrivateAddress,
  extractPageTitle,
  recordingExtension,
  normalizeWindowRows,
  todoReminderState,
  todoReminderStateAfterResume,
  todoMissedReminderWindowMs,
  shouldUseNativeTodoNotification,
  normalizeStrongReminderQuestions,
  normalizeStrongReminderAnswers,
  createTodoReminderSchedule,
  todoReminderTimerDelay,
  taskNotificationIdentity,
  normalizeCredentialInput,
  parseSmartLinkMetadata,
  extractFaviconHref,
  parseSmartMaterialMetadata,
  clipboardServicePolicy,
  createClipboardImageFingerprint,
  prepareClipboardImagePayload,
  installLocalWebContentsGuards,
  runOwnedOpenDialog,
  readClipboardObservation,
  screenRecordingProbePolicy,
  taskNotificationWindowPolicy,
  updateFeaturePreference,
  controlSodaMusic,
  sodaShortcutSpec,
  selectTranscriptionSettings,
  createWorkspacePersistenceGate,
  hoverSpacePollingPolicy,
  reduceClipboardObservation,
  normalizeDefaultTabPreference,
  updateDefaultTabPreference,
  normalizeTodoNotificationDuration,
  createForegroundMediaPermissionCoordinator,
} = require('./main-services');

// Copy the previous local workspace into the Dingdo directory once so existing
// users keep their tasks and settings after the bundle identity changes.
const LEGACY_USER_DATA_PATH = path.join(app.getPath('appData'), ['Dynamic', 'Panel'].join(' '));
const USER_DATA_PATH = path.join(app.getPath('appData'), 'Dingdo');
const configuredUserDataPath = app.commandLine.getSwitchValue('user-data-dir');
if (!configuredUserDataPath && !fs.existsSync(USER_DATA_PATH) && fs.existsSync(LEGACY_USER_DATA_PATH)) {
  try {
    fs.cpSync(LEGACY_USER_DATA_PATH, USER_DATA_PATH, { recursive: true, force: false, errorOnExist: false });
  } catch (error) {}
}
app.setName('叮做');
// Honor Electron's standard profile switch for isolated automated tests.
app.setPath('userData', configuredUserDataPath || USER_DATA_PATH);

function createNotchTrayIcon() {
  const icon = nativeImage
    .createFromPath(path.join(__dirname, 'build', 'dingdo-icon.png'))
    .resize({ width: process.platform === 'win32' ? 32 : 18, height: process.platform === 'win32' ? 32 : 18 });
  if (process.platform === 'darwin') icon.setTemplateImage(true);
  return icon;
}

// 缩小态使用一个与物理刘海同色的完整胶囊；左右各 40px 用于媒体封面、
// 节奏线和空闲眼睛。窗口本身居中，展开后仍由内容层占满完整宽度。
const COLLAPSED_WIDTH = 280;
const COLLAPSED_MIN_HEIGHT = 38;
const MUSIC_PEEK_HEIGHT = 34;
// NOTCH_LIP（原 6px 唇边）已移除：折叠条高度现在恰好等于菜单栏高（≈物理刘海高），
// 一个像素都不超出物理刘海。虽然折叠条完全在菜单栏拦截带内，
// 但本项目窗口使用 setAlwaysOnTop(true,'screen-saver') 级别，
// 实测菜单栏不拦截该级别窗口的点击，折叠条仍可点击展开。
// （见项目记忆 notch-top-geometry-constraint / commit f12aea1）

// 所有 Tab 共用同一展开尺寸，切换内容时不再改变原生窗口边界。
// 原生窗口只在折叠/展开两个模式间切换，避免 Tab 切换产生明显的宽高跳变。
const EXPANDED_WIDTH = 1240;
const EXPANDED_PANEL_HEIGHT = 540;
const TAB_SIZES = {
  home: { width: EXPANDED_WIDTH, panelHeight: EXPANDED_PANEL_HEIGHT },
  todo: { width: EXPANDED_WIDTH, panelHeight: EXPANDED_PANEL_HEIGHT },
  notes: { width: EXPANDED_WIDTH, panelHeight: EXPANDED_PANEL_HEIGHT },
  clip: { width: EXPANDED_WIDTH, panelHeight: EXPANDED_PANEL_HEIGHT },
  links: { width: EXPANDED_WIDTH, panelHeight: EXPANDED_PANEL_HEIGHT },
  recordings: { width: EXPANDED_WIDTH, panelHeight: EXPANDED_PANEL_HEIGHT },
  credentials: { width: EXPANDED_WIDTH, panelHeight: EXPANDED_PANEL_HEIGHT },
  settings: { width: EXPANDED_WIDTH, panelHeight: EXPANDED_PANEL_HEIGHT },
};
// 与渲染层结构常量对应：panel padding-top(--s-2 8) + 顶栏(--topbar-h 40)
// + panels margin-top(--s-3 12) + panel padding-bottom(--s-4 16)。内容顶到屏幕最上沿，不留菜单栏带。
const EXPANDED_CHROME_Y = 76;
const SCREEN_MARGIN = 24; // 宽度超屏时两侧保留的安全边
const COLLAPSE_WATCHDOG_MS = 650;

const CLIP_MAX_ITEMS = 100;
const CLIP_POLL_INTERVAL_MS = 500;
// 大图从系统 ClipboardItem 复制到进程仍有固定成本；图片探测降到 3 秒一次，
// 文本继续保持 500ms 响应，不影响日常文字剪贴体验。
const CLIP_IMAGE_POLL_INTERVAL_MS = 3000;
const CLIP_IMAGES_DIR_NAME = 'clipboard-images';

const RECORDINGS_DIR_NAME = 'recordings';
const TRANSCRIPTION_SETTINGS_FILE = 'transcription-settings.json';
const CREDENTIALS_VAULT_FILE = 'credentials.vault.json';
const APP_SETTINGS_FILE = 'app-settings.json';
const WORKSPACE_SETTINGS_FILE = 'workspace-settings.json';
const WORKSPACE_DATA_FILE = 'workspace.json';
const TODO_BACKUP_DIR = 'todo-backups';
const TODO_BACKUP_LIMIT = 7;
const MIRROR_IMAGE_FILE = 'mirror-cover.jpg';
const workspacePersistenceGate = createWorkspacePersistenceGate();
const SODA_MUSIC_APP = '/Applications/汽水音乐.app';
const TRANSCRIPTION_MODEL = 'qwen3-asr-flash-realtime';
const TRANSCRIPTION_SAMPLE_RATE = 16000;
const TRANSCRIPTION_FINISH_TIMEOUT_MS = 7000;
const RECORDING_MAX_BYTES = 200 * 1024 * 1024;
const LINK_FETCH_TIMEOUT_MS = 8000;
const LINK_FETCH_MAX_BYTES = 512 * 1024;
const LINK_FETCH_MAX_REDIRECTS = 3;

const TASK_NOTIFICATION_WIDTH = 400;
const TASK_NOTIFICATION_HEIGHT = 128;
const TASK_NOTIFICATION_SCREEN_MARGIN = 12;
const TASK_NOTIFICATION_VISIBLE_MS = 10000;
const TASK_NOTIFICATION_LEAVE_MS = 360;
const TASK_NOTIFICATION_DEDUPE_MS = 2000;
const TASK_NOTIFICATION_MAX_QUEUE = 5;
const TASK_NOTIFICATION_BODY_LIMIT = 64 * 1024;
const TASK_NOTIFICATION_HOST = '127.0.0.1';
const TASK_NOTIFICATION_PORT = 43821;
// /notify/<source> 的来源白名单：只放行已知 Agent，其余一律 404。
const TASK_NOTIFICATION_SOURCES = new Set(['codex', 'gpt', 'claude']);
const TODO_REMINDER_LEAD_MS = 60 * 60 * 1000;
const TODO_REMINDER_GRACE_MS = 10 * 60 * 1000;
const TODO_NATIVE_NOTIFICATION_GROUP = 'todo-reminders';
const DESKTOP_CARD_FILE = 'desktop-cards.json';
const DESKTOP_CARD_DEFAULT_WIDTH = 280;
const DESKTOP_CARD_DEFAULT_HEIGHT = 206;
const DESKTOP_CARD_MIN_WIDTH = 240;
const DESKTOP_CARD_MIN_HEIGHT = 168;
const DESKTOP_CARD_SCREEN_MARGIN = 18;
const DESKTOP_CARD_SNAP_DISTANCE = 26;
const NOTIFICATION_SOUND_FILES = {
  soft: '/System/Library/Sounds/Tink.aiff',
  bright: '/System/Library/Sounds/Glass.aiff',
  alert: '/System/Library/Sounds/Hero.aiff',
};

let mainWindow = null;
let tray = null;
let currentMode = 'collapsed';
let currentTab = 'home';
let collapseWatchdog = null;
let collapseGeneration = 0;
let hideWhenCollapsed = false;
let isQuitting = false;
let mediaPermissionRequests = 0;
let mediaPermissionBatchHadCamera = false;
let transientSystemInteractionRequests = 0;
let cameraBlurDeferred = false;
let sodaMusicPlaying = false;
const mediaSessionService = new MediaSessionService();
const mediaIconCache = new Map();
let browserMediaCache = { value: null, checkedAt: 0 };
let browserMediaPending = null;
const mediaPermissionCoordinator = createForegroundMediaPermissionCoordinator();

let notificationWindow = null;
let notificationWindowReady = false;
let notificationServer = null;
let notificationServerAvailable = false;
let strongReminderWindow = null;
let strongReminderWindowReady = false;
let activeStrongReminder = null;
let strongReminderQueue = [];
let allowStrongReminderClose = false;
let activeTaskNotification = null;
let taskNotificationLeaving = false;
let taskNotificationTimer = null;
let taskNotificationFallbackTimer = null;
let taskNotificationTimerStartedAt = 0;
let taskNotificationRemainingMs = TASK_NOTIFICATION_VISIBLE_MS;
let taskNotificationPaused = false;
let taskNotificationPersistent = false;
const taskNotificationQueue = [];
const todoNotificationQueue = [];
const recentTaskNotifications = new Map();
const taskCompletionHistory = [];
const nativeTodoNotifications = new Map();
let todoReminderTimer = null;
let todoReminderWatchdogTimer = null;
let scheduledTodoReminders = [];
let todoMissedReminderPolicy = '24h';
let systemLocked = false;
let systemSuspended = false;
let remindersEnsurePromise = null;
let desktopCardConfigs = null;
const desktopCardWindows = new Map();
const desktopCardStates = new Map();
const disposingDesktopCards = new Set();

let clipPollTimer = null;
let clipBaselineTimer = null;
let clipPollingEnabled = false;
let clipPolling = false; // 互斥锁：大图 toPNG 同步耗时，防止上一轮未完成又进入
let clipObservationState = { textFingerprint: null, imageFingerprint: null };
let lastClipImageProbeAt = 0;
let clipPollingGeneration = 0;
let spaceShortcutTimer = null;
let spaceShortcutRegistered = false;
let configuredShortcut = '';
let previousPasteTarget = null;
let windowScanCache = new Map();
const windowIconCache = new Map();
const transcriptionSessions = new Map();

const gotTheLock = app.requestSingleInstanceLock();

if (!gotTheLock) {
  app.quit();
} else {
  app.on('second-instance', () => {
    if (mainWindow) {
      hideWhenCollapsed = false;
      repositionWindow(getTargetDisplay());
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
    }
  });
}

// 多屏适配：定位到"鼠标当前所在屏"的物理顶端居中
// 这样接上外接屏后，无论副屏在主屏的左/右/上/下，刘海都跟着用户视线走
function getTargetDisplay() {
  try {
    const cursor = screen.getCursorScreenPoint();
    return screen.getDisplayNearestPoint(cursor);
  } catch (e) {
    return screen.getPrimaryDisplay();
  }
}

// 窗口当前所在屏：模式切换 / Tab 变形必须锚定在这块屏上。
// 若跟随光标（getTargetDisplay），失焦收起瞬间会把刘海"瞬移"到光标所在的另一块屏。
function getWindowDisplay() {
  try {
    if (mainWindow) return screen.getDisplayMatching(mainWindow.getBounds());
  } catch (e) {
    // fallthrough
  }
  return getTargetDisplay();
}

function getCenteredBounds(width, height, display) {
  const d = display || getTargetDisplay();
  const area = process.platform === 'win32' ? d.workArea : d.bounds;
  return {
    x: Math.round(area.x + (area.width - width) / 2),
    y: area.y,
    width,
    height,
  };
}

// macOS 菜单栏会拦截其高度带内的所有鼠标点击（即使窗口绘制在其上方），
// 刘海屏机型菜单栏高约 37pt，等于物理刘海高度。
function getMenuBarHeight(display) {
  return Math.max(0, display.workArea.y - display.bounds.y);
}

function getCollapsedHeight(display) {
  if (process.platform === 'win32') return COLLAPSED_MIN_HEIGHT;
  const mb = getMenuBarHeight(display);
  // 折叠条高度恰好等于菜单栏带（≈物理刘海高），一个像素都不超出物理刘海。
  // 无刘海的外接屏 menuBarHeight 仍是真实菜单栏高，能正常露头；
  // 异常取到 0 才回退兜底（COLLAPSED_MIN_HEIGHT = 38px）。
  return mb > 0 ? mb : COLLAPSED_MIN_HEIGHT;
}

// 展开尺寸按当前 Tab 取值；宽度超出屏幕时 clamp 到工作区内。
// 窗口从屏幕最顶垂下（y=0），内容直接顶到最上沿，高度不含菜单栏带。
function getExpandedSize(display) {
  const size = TAB_SIZES[currentTab] || TAB_SIZES.home;
  return {
    width: Math.min(size.width, display.workArea.width - SCREEN_MARGIN),
    height: Math.min(
      EXPANDED_CHROME_Y + size.panelHeight,
      Math.max(getCollapsedHeight(display), display.bounds.height - SCREEN_MARGIN)
    ),
  };
}

// display 不传时锚定窗口当前所在屏；只有"召唤"类动作（启动/重新居中/显示）才传光标屏。
// 一律瞬时 setBounds：系统动画 resize 会持续重绘 web 内容（卡顿）。
// 原生窗口只提供透明画布，用户可见的岛体形变交给渲染层 CSS。
function getBoundsForMode(mode, display) {
  const d = display || getWindowDisplay();
  if (process.platform === 'win32') {
    const bounds = platformPolicy.panelBounds(process.platform, d, mode === 'expanded');
    if (mode === 'peek') bounds.height += MUSIC_PEEK_HEIGHT;
    return bounds;
  }
  if (mode === 'expanded') {
    const { width, height } = getExpandedSize(d);
    return getCenteredBounds(width, height, d);
  }
  const height = getCollapsedHeight(d) + (mode === 'peek' ? MUSIC_PEEK_HEIGHT : 0);
  return getCenteredBounds(COLLAPSED_WIDTH, height, d);
}

function cancelCollapseWatchdog() {
  collapseGeneration++;
  if (collapseWatchdog) {
    clearTimeout(collapseWatchdog);
    collapseWatchdog = null;
  }
}

function applyMode(mode, display) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  cancelCollapseWatchdog();
  mainWindow.setBounds(getBoundsForMode(mode, display));
  mainWindow.setIgnoreMouseEvents(false);
  currentMode = mode;
  if (mode === 'expanded') hideWhenCollapsed = false;
  if (mode === 'collapsed' && hideWhenCollapsed) {
    hideWhenCollapsed = false;
    mainWindow.hide();
    refreshTrayMenu();
  }
  syncHoverSpacePolling();
}

// 纯重新定位不能改变收起事务，否则屏幕变化会取消 watchdog 并重新吞掉鼠标。
function repositionWindow(display) {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.setBounds(getBoundsForMode(currentMode, display));
}

function beginNativeCollapse() {
  if (!mainWindow || currentMode !== 'expanded') return;
  const targetWindow = mainWindow;
  const generation = ++collapseGeneration;
  targetWindow.setIgnoreMouseEvents(true);
  if (collapseWatchdog) clearTimeout(collapseWatchdog);
  collapseWatchdog = setTimeout(() => {
    if (generation !== collapseGeneration) return;
    collapseWatchdog = null;
    if (mainWindow === targetWindow && currentMode === 'expanded') {
      applyMode('collapsed');
    }
  }, COLLAPSE_WATCHDOG_MS);
}

function requestRendererCollapse() {
  if (!mainWindow || currentMode !== 'expanded') return;
  beginNativeCollapse();
  mainWindow.webContents.send('window:request-collapse');
}

function hideWindowAfterCollapse() {
  if (!mainWindow || mainWindow.isDestroyed()) return;
  if (currentMode === 'expanded') {
    hideWhenCollapsed = true;
    requestRendererCollapse();
    return;
  }
  hideWhenCollapsed = false;
  mainWindow.hide();
  refreshTrayMenu();
}

// ============ Codex / Claude / GPT 任务完成提醒 ============
// 使用独立的非激活窗口，避免打断主刘海窗口的展开、收起和焦点状态机。

function pickTaskNotificationValue(payload, keys) {
  for (const key of keys) {
    const value = payload[key];
    if ((typeof value === 'string' || typeof value === 'number') && String(value).trim()) {
      return String(value);
    }
  }
  return '';
}

function cleanTaskNotificationText(value, maxLength) {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  const firstLine = String(value)
    .replace(/[\u202a-\u202e\u2066-\u2069]/g, '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find(Boolean);
  if (!firstLine) return '';
  const cleaned = firstLine
    .replace(/^[#>*`_~\-\s]+/, '')
    .replace(/[`*_~]/g, '')
    .replace(/[\u0000-\u001f\u007f-\u009f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  const characters = Array.from(cleaned);
  return characters.length > maxLength ? characters.slice(0, maxLength).join('') : cleaned;
}

function isSubagentNotification(payload) {
  const agentType = pickTaskNotificationValue(payload, [
    'agent_type',
    'agent-type',
    'agentType',
  ]).toLowerCase();
  const hookEvent = pickTaskNotificationValue(payload, [
    'hook_event_name',
    'hook-event-name',
    'hookEventName',
  ]).toLowerCase();
  // Claude Code 的 agent_type 存的是子代理名（Explore / security-reviewer 等），
  // 不含 subagent 字样，只有身处子代理时才带 agent_id，故以该字段存在为准。
  const agentId = pickTaskNotificationValue(payload, ['agent_id', 'agent-id', 'agentId']);
  return Boolean(agentId)
    || hookEvent.includes('subagent')
    || agentType.includes('subagent')
    || payload.is_subagent === true
    || payload.isSubagent === true;
}

function normalizeTaskNotification(payload, source) {
  if (!payload || typeof payload !== 'object' || Array.isArray(payload)) return null;
  if (isSubagentNotification(payload)) return null;
  const identity = taskNotificationIdentity(payload, source);

  const taskId = cleanTaskNotificationText(
    pickTaskNotificationValue(payload, [
      'turn_id',
      'turn-id',
      'turnId',
      'thread_id',
      'thread-id',
      'threadId',
      'session_id',
      'session-id',
      'sessionId',
      'task_id',
      'task-id',
      'taskId',
      'id',
    ]),
    160
  );

  const completedAtValue = Number(
    pickTaskNotificationValue(payload, ['completed_at', 'completed-at', 'completedAt'])
  );
  const completedAt = Number.isFinite(completedAtValue) && completedAtValue > 0
    ? completedAtValue
    : Date.now();

  return {
    eventId: `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`,
    source,
    taskId,
    title: identity.title,
    project: identity.project,
    completedAt,
  };
}

function queueNotificationCount(queue) {
  return queue.reduce(
    (total, item) => total + (item.summaryCount || 1),
    0
  );
}

function getPendingTaskNotificationCount() {
  return queueNotificationCount(todoNotificationQueue)
    + queueNotificationCount(taskNotificationQueue);
}

function hasPendingTaskNotifications() {
  return todoNotificationQueue.length > 0 || taskNotificationQueue.length > 0;
}

function shiftPendingTaskNotification() {
  return todoNotificationQueue.shift() || taskNotificationQueue.shift() || null;
}

function prependPendingTaskNotification(notification) {
  if (!notification) return;
  if (notification.source === 'todo') {
    todoNotificationQueue.unshift(notification);
    return;
  }
  taskNotificationQueue.unshift(notification);
}

function sendTaskNotificationQueueCount() {
  if (
    !notificationWindow ||
    notificationWindow.isDestroyed() ||
    !notificationWindowReady ||
    !activeTaskNotification
  ) {
    return;
  }
  notificationWindow.webContents.send(
    'task-notification:queue',
    getPendingTaskNotificationCount()
  );
}

function enqueueTaskNotification(notification) {
  if (!notification) return 'ignored';
  const now = Date.now();
  for (const [key, seenAt] of recentTaskNotifications) {
    if (now - seenAt > TASK_NOTIFICATION_DEDUPE_MS) recentTaskNotifications.delete(key);
  }

  const identity = notification.taskId || `${notification.title}:${notification.project}`;
  const dedupeKey = `${notification.source}:${identity}`;
  const lastSeenAt = recentTaskNotifications.get(dedupeKey);
  if (lastSeenAt && now - lastSeenAt <= TASK_NOTIFICATION_DEDUPE_MS) return 'duplicate';
  recentTaskNotifications.set(dedupeKey, now);

  if (notification.source !== 'todo') {
    taskCompletionHistory.unshift(notification);
    if (taskCompletionHistory.length > 20) taskCompletionHistory.length = 20;
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('task-completion:new', notification);
    }
  }

  if (notification.source === 'todo') {
    todoNotificationQueue.push(notification);
  } else if (taskNotificationQueue.length < TASK_NOTIFICATION_MAX_QUEUE) {
    taskNotificationQueue.push(notification);
  } else {
    const lastIndex = taskNotificationQueue.length - 1;
    const previous = taskNotificationQueue[lastIndex];
    const summaryCount = previous.isSummary ? previous.summaryCount + 1 : 2;
    taskNotificationQueue[lastIndex] = {
      ...notification,
      source: 'task',
      taskId: '',
      title: `另有 ${summaryCount} 个任务已完成`,
      project: '',
      isSummary: true,
      summaryCount,
    };
  }

  if (activeTaskNotification) {
    sendTaskNotificationQueueCount();
  } else {
    showNextTaskNotification();
  }
  return 'queued';
}

function clearTodoReminderTimer() {
  if (todoReminderTimer) clearTimeout(todoReminderTimer);
  todoReminderTimer = null;
}

function ensureTodoReminderWatchdog() {
  if (todoReminderWatchdogTimer) return;
  todoReminderWatchdogTimer = setInterval(() => {
    scheduleNextTodoReminder();
  }, 15000);
}

function todoReminderDetail(reminder) {
  const deadline = Date.parse(String(reminder.deadline || ''));
  if (Number.isFinite(deadline) && deadline < Date.now()) return '任务已逾期';
  const offsetMinutes = Number(reminder.offsetMinutes);
  const prefix = reminder.caughtUp ? '刚刚错过提醒 · ' : '';
  if (!Number.isFinite(offsetMinutes)) return `${prefix}提醒时间已到`;
  if (offsetMinutes < 60) return `${prefix}距离截止还有 ${offsetMinutes} 分钟`;
  if (offsetMinutes < 1440) {
    const hours = offsetMinutes / 60;
    return `${prefix}距离截止还有 ${Number.isInteger(hours) ? hours : hours.toFixed(1)} 小时`;
  }
  const days = offsetMinutes / 1440;
  return `${prefix}距离截止还有 ${Number.isInteger(days) ? days : days.toFixed(1)} 天`;
}

function formatTodoNotificationDeadline(value) {
  const timestamp = Date.parse(String(value || ''));
  if (!Number.isFinite(timestamp)) return '';
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(timestamp);
  } catch (error) {
    return '';
  }
}

function showNativeTodoNotification(notification, onFailure) {
  if (process.platform !== 'darwin' || !Notification.isSupported()) return false;
  const deadlineText = formatTodoNotificationDeadline(notification.deadline);
  const body = [
    notification.reminderStatus === 'missed' ? '电脑恢复后补发提醒' : notification.detail,
    deadlineText ? `截止 ${deadlineText}` : '',
  ].filter(Boolean).join(' · ');
  const nativeNotification = new Notification({
    id: notification.eventId,
    groupId: TODO_NATIVE_NOTIFICATION_GROUP,
    title: notification.title,
    subtitle: notification.reminderStatus === 'missed' ? '已错过提醒' : '待办提醒',
    body,
    silent: notification.soundId === 'none',
  });
  nativeTodoNotifications.set(notification.eventId, nativeNotification);
  const cleanup = () => {
    if (nativeTodoNotifications.get(notification.eventId) === nativeNotification) {
      nativeTodoNotifications.delete(notification.eventId);
    }
  };
  nativeNotification.once('close', cleanup);
  nativeNotification.once('failed', () => {
    cleanup();
    if (typeof onFailure === 'function') onFailure();
  });
  nativeNotification.once('click', () => {
    cleanup();
    notifyTodoReminderHandled(notification);
    activateTodoNotification(notification).catch(() => {});
  });
  nativeNotification.show();
  return true;
}

function notifyTodoReminderHandled(notification) {
  if (!notification?.taskId || !mainWindow || mainWindow.isDestroyed()) return;
  mainWindow.webContents.send('todo:reminder-handled', {
    taskId: String(notification.taskId),
    reminderId: String(notification.reminderId || ''),
  });
}

function getStrongReminderBounds(display) {
  const d = display || getTargetDisplay();
  return { ...d.bounds };
}

function recoverClosedStrongReminderWindow(targetWindow) {
  if (strongReminderWindow !== targetWindow) return;
  const interrupted = activeStrongReminder;
  strongReminderWindow = null;
  strongReminderWindowReady = false;
  activeStrongReminder = null;
  allowStrongReminderClose = false;
  if (!isQuitting && interrupted) strongReminderQueue.unshift(interrupted);
  if (!isQuitting) setTimeout(showNextStrongReminder, 80);
}

function createStrongReminderWindow() {
  if (strongReminderWindow && !strongReminderWindow.isDestroyed()) return strongReminderWindow;
  const bounds = getStrongReminderBounds();
  strongReminderWindowReady = false;
  allowStrongReminderClose = false;
  strongReminderWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    focusable: true,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    hiddenInMissionControl: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    closable: false,
    roundedCorners: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  installLocalWebContentsGuards(strongReminderWindow.webContents);
  const targetWindow = strongReminderWindow;
  targetWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  if (process.platform === 'darwin') {
    targetWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  }
  targetWindow.setIgnoreMouseEvents(false);
  targetWindow.loadFile(path.join(__dirname, 'renderer', 'strong-reminder.html'));
  targetWindow.webContents.once('did-finish-load', () => {
    if (strongReminderWindow !== targetWindow || targetWindow.isDestroyed()) return;
    strongReminderWindowReady = true;
    showNextStrongReminder();
  });
  targetWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown') return;
    const key = String(input.key || '').toLowerCase();
    if (key === 'escape' || key === 'f4' || ((input.meta || input.control) && key === 'w')) {
      event.preventDefault();
    }
  });
  targetWindow.webContents.on('render-process-gone', () => {
    if (!targetWindow.isDestroyed()) targetWindow.destroy();
  });
  targetWindow.on('close', (event) => {
    if (!isQuitting && !allowStrongReminderClose) event.preventDefault();
  });
  targetWindow.on('closed', () => recoverClosedStrongReminderWindow(targetWindow));
  return strongReminderWindow;
}

function enqueueStrongReminder(notification, options = {}) {
  if (!notification?.eventId) return;
  const duplicate = activeStrongReminder?.eventId === notification.eventId
    || strongReminderQueue.some((item) => item.eventId === notification.eventId);
  if (duplicate) return;
  strongReminderQueue.push(notification);
  if (activeStrongReminder || options.defer === true) return;
  showNextStrongReminder();
}

function showNextStrongReminder() {
  if (activeStrongReminder || !strongReminderQueue.length || isQuitting) return;
  const targetWindow = createStrongReminderWindow();
  if (!strongReminderWindowReady || !targetWindow || targetWindow.isDestroyed()) return;
  activeStrongReminder = strongReminderQueue.shift();
  allowStrongReminderClose = false;
  targetWindow.setBounds(getStrongReminderBounds(getTargetDisplay()));
  targetWindow.show();
  if (process.platform === 'darwin') app.focus({ steal: true });
  targetWindow.moveTop();
  targetWindow.focus();
  targetWindow.webContents.send('strong-reminder:show', {
    ...activeStrongReminder,
    questions: normalizeStrongReminderQuestions(activeStrongReminder.strongQuestions),
  });
}

function finishStrongReminder() {
  const completedWindow = strongReminderWindow;
  activeStrongReminder = null;
  allowStrongReminderClose = true;
  if (completedWindow && !completedWindow.isDestroyed()) completedWindow.hide();
  setTimeout(() => {
    if (strongReminderQueue.length) {
      showNextStrongReminder();
      return;
    }
    if (
      strongReminderWindow === completedWindow
      && completedWindow
      && !completedWindow.isDestroyed()
    ) {
      completedWindow.destroy();
    }
  }, 80);
}

function fireTodoReminder(reminder, options = {}) {
  const deadline = Date.parse(String(reminder.deadline || ''));
  const firedAt = Date.now();
  const notification = {
    eventId: `todo-${reminder.taskId}-${reminder.id}-${reminder.at}`,
    source: 'todo',
    taskId: String(reminder.taskId || ''),
    reminderId: String(reminder.id || ''),
    title: String(reminder.text || '').trim() || '待办提醒',
    project: '',
    detail: todoReminderDetail(reminder),
    deadline: Number.isFinite(deadline) ? deadline : Date.parse(String(reminder.at || '')),
    soundId: reminder.soundId || 'bright',
    strongQuestions: Array.isArray(reminder.strongQuestions) ? reminder.strongQuestions : [],
    linked: reminder.linked === true,
    reminderStatus: reminder.caughtUp ? 'missed' : 'fired',
    completedAt: firedAt,
  };
  const useNative = shouldUseNativeTodoNotification({
    nativeSupported: process.platform === 'darwin' && Notification.isSupported(),
    forceNative: options.forceNative === true,
    locked: systemLocked,
    suspended: systemSuspended,
  });
  const nativeDelivered = useNative && showNativeTodoNotification(notification, () => {
    if (reminder.strong === true) enqueueStrongReminder(notification);
    else enqueueTaskNotification(notification);
  });
  if (reminder.strong === true) {
    enqueueStrongReminder(notification, { defer: nativeDelivered });
  } else if (!nativeDelivered) {
    enqueueTaskNotification(notification);
  }
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('todo:reminded', {
      id: notification.taskId,
      taskId: notification.taskId,
      reminderId: notification.reminderId,
      deadline: String(reminder.deadline || ''),
      reminderAt: String(reminder.at || ''),
      reminderScheduledAt: String(reminder.scheduledAt || ''),
      status: reminder.caughtUp ? 'missed' : 'fired',
      soundId: reminder.soundId || 'bright',
      firedAt,
      remindedAt: firedAt,
    });
  }
}

function scheduleNextTodoReminder(options = {}) {
  ensureTodoReminderWatchdog();
  clearTodoReminderTimer();
  const now = Date.now();
  const recoveryWindowMs = Number(options.recoveryWindowMs);
  const useRecoveryWindow = Number.isFinite(recoveryWindowMs) && recoveryWindowMs > 0;
  let nextDelay = Infinity;
  for (const reminder of scheduledTodoReminders) {
    const status = useRecoveryWindow
      ? todoReminderStateAfterResume(
        reminder,
        now,
        recoveryWindowMs,
        TODO_REMINDER_GRACE_MS
      )
      : todoReminderState(reminder, now, 0, TODO_REMINDER_GRACE_MS);
    if (status.state === 'due') {
      const scheduledAt = Date.parse(String(reminder.scheduledAt || reminder.at || ''));
      if (Number.isFinite(scheduledAt) && now - scheduledAt > TODO_REMINDER_GRACE_MS) {
        reminder.caughtUp = true;
      }
      reminder.firedAt = now;
      fireTodoReminder(reminder, { forceNative: options.forceNative === true });
      continue;
    }
    if (status.state === 'scheduled') nextDelay = Math.min(nextDelay, status.delayMs);
  }
  if (Number.isFinite(nextDelay)) {
    todoReminderTimer = setTimeout(
      () => scheduleNextTodoReminder(),
      todoReminderTimerDelay(nextDelay)
    );
  }
}

ipcMain.handle('todos:schedule-reminders', (event, items, options = {}) => {
  todoMissedReminderPolicy = options.missedReminderPolicy || '24h';
  scheduledTodoReminders = createTodoReminderSchedule(
    items,
    TODO_REMINDER_LEAD_MS,
    Date.now(),
    todoMissedReminderPolicy,
    options.strongReminderQuestions
  );
  scheduleNextTodoReminder();
  return { ok: true, count: scheduledTodoReminders.length };
});

ipcMain.handle('todos:snooze', (event, payload) => {
  const taskId = String(payload && payload.taskId || '');
  if (!taskId) return { ok: false, error: 'invalid_task' };
  const sourceReminderId = String(payload && payload.reminderId || '');
  const base = scheduledTodoReminders.find((reminder) => (
    reminder.taskId === taskId
    && sourceReminderId
    && reminder.id === sourceReminderId
  )) || scheduledTodoReminders.find((reminder) => reminder.taskId === taskId);
  if (!base) return { ok: false, error: 'task_not_scheduled' };
  const minutes = Math.max(1, Math.min(1440, Math.round(Number(payload && payload.minutes) || 10)));
  const at = Date.now() + minutes * 60 * 1000;
  const reminderId = `snooze-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
  const atIso = new Date(at).toISOString();

  // 先把该任务已排队的旧提醒全部撤掉，再把当前这条替换成一次性稍后提醒。
  // 否则“提前 1 小时”的提醒会按新截止时间重新计算回现在，形成反复弹窗。
  for (let index = todoNotificationQueue.length - 1; index >= 0; index -= 1) {
    if (todoNotificationQueue[index]?.taskId === taskId) todoNotificationQueue.splice(index, 1);
  }
  scheduledTodoReminders = scheduledTodoReminders.filter((reminder) => reminder.taskId !== taskId);
  scheduledTodoReminders.push({
    ...base,
    id: reminderId,
    at: atIso,
    scheduledAt: atIso,
    offsetMinutes: null,
    firedAt: 0,
    caughtUp: false,
    strong: false,
    soundId: String(payload && payload.soundId || base.soundId || 'bright'),
  });
  scheduleNextTodoReminder();
  sendTaskNotificationQueueCount();

  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('todo:snoozed', {
      taskId,
      sourceReminderId,
      reminderId,
      at: atIso,
      soundId: String(payload && payload.soundId || base.soundId || 'bright'),
    });
  }
  return { ok: true, reminderId, at: atIso };
});

function todoBackupDirectory() {
  return path.join(app.getPath('userData'), TODO_BACKUP_DIR);
}

function pruneTodoBackups() {
  const directory = todoBackupDirectory();
  try {
    const files = fs.readdirSync(directory)
      .filter((name) => /^todo-\d{4}-\d{2}-\d{2}\.json$/.test(name))
      .sort()
      .reverse();
    files.slice(TODO_BACKUP_LIMIT).forEach((name) => {
      try { fs.unlinkSync(path.join(directory, name)); } catch (error) {}
    });
  } catch (error) {}
}

function writeTodoBackup(data, force = false) {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'invalid_data' };
  }
  const directory = todoBackupDirectory();
  const today = new Date().toISOString().slice(0, 10);
  const destination = path.join(directory, `todo-${today}.json`);
  if (!force && fs.existsSync(destination)) return { ok: true, path: destination, skipped: true };
  try {
    fs.mkdirSync(directory, { recursive: true });
    const temporary = `${destination}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({
      version: 3,
      exportedAt: new Date().toISOString(),
      todo: data,
    }, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, destination);
    pruneTodoBackups();
    return { ok: true, path: destination, skipped: false };
  } catch (error) {
    return { ok: false, error: 'write_failed' };
  }
}

ipcMain.handle('todos:backup', (event, data, force = false) => writeTodoBackup(data, force === true));

ipcMain.handle('todos:export', async (event, data) => {
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return { ok: false, error: 'invalid_data' };
  }
  const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const options = {
    title: '导出待办数据',
    defaultPath: `Dingdo-${new Date().toISOString().slice(0, 10)}.json`,
    filters: [{ name: 'JSON', extensions: ['json'] }],
  };
  const result = owner
    ? await dialog.showSaveDialog(owner, options)
    : await dialog.showSaveDialog(options);
  const destination = result.canceled ? '' : result.filePath;
  if (!destination) return { ok: false, canceled: true };
  try {
    fs.writeFileSync(destination, JSON.stringify({
      version: 3,
      exportedAt: new Date().toISOString(),
      todo: data,
    }, null, 2), { mode: 0o600 });
    return { ok: true, path: destination };
  } catch (error) {
    return { ok: false, error: 'write_failed' };
  }
});

function desktopCardsPath() {
  return path.join(app.getPath('userData'), DESKTOP_CARD_FILE);
}

function loadDesktopCardConfigs() {
  if (desktopCardConfigs) return desktopCardConfigs;
  const configs = new Map();
  try {
    const parsed = JSON.parse(fs.readFileSync(desktopCardsPath(), 'utf8'));
    for (const item of Array.isArray(parsed?.cards) ? parsed.cards : []) {
      const taskId = String(item?.taskId || '').trim();
      const bounds = item?.bounds && typeof item.bounds === 'object' ? item.bounds : null;
      if (!taskId || !bounds) continue;
      configs.set(taskId, {
        taskId,
        bounds: {
          x: Number(bounds.x),
          y: Number(bounds.y),
          width: Number(bounds.width),
          height: Number(bounds.height),
        },
        alwaysOnTop: item.alwaysOnTop === true,
      });
    }
  } catch (error) {}
  desktopCardConfigs = configs;
  return desktopCardConfigs;
}

function persistDesktopCardConfigs() {
  const configs = loadDesktopCardConfigs();
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    const temporary = `${desktopCardsPath()}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({
      version: 1,
      cards: [...configs.values()],
    }, null, 2), { mode: 0o600 });
    fs.renameSync(temporary, desktopCardsPath());
  } catch (error) {}
}

function desktopCardDisplayForPoint(point) {
  try {
    return screen.getDisplayNearestPoint(point);
  } catch (error) {
    return getTargetDisplay();
  }
}

function fitDesktopCardBounds(bounds, point = null) {
  const source = bounds && typeof bounds === 'object' ? bounds : {};
  const requestedWidth = Math.max(
    DESKTOP_CARD_MIN_WIDTH,
    Math.round(Number(source.width) || DESKTOP_CARD_DEFAULT_WIDTH)
  );
  const requestedHeight = Math.max(
    DESKTOP_CARD_MIN_HEIGHT,
    Math.round(Number(source.height) || DESKTOP_CARD_DEFAULT_HEIGHT)
  );
  const center = point || (
    Number.isFinite(Number(source.x)) && Number.isFinite(Number(source.y))
      ? { x: Number(source.x) + requestedWidth / 2, y: Number(source.y) + requestedHeight / 2 }
      : screen.getCursorScreenPoint()
  );
  const display = desktopCardDisplayForPoint(center);
  const workArea = display.workArea;
  const width = Math.min(requestedWidth, Math.max(DESKTOP_CARD_MIN_WIDTH, workArea.width - 24));
  const height = Math.min(requestedHeight, Math.max(DESKTOP_CARD_MIN_HEIGHT, workArea.height - 24));
  const fallbackX = workArea.x + workArea.width - width - DESKTOP_CARD_SCREEN_MARGIN;
  const fallbackY = workArea.y + Math.max(
    DESKTOP_CARD_SCREEN_MARGIN,
    Math.round((workArea.height - height) / 2)
  );
  const requestedX = Number.isFinite(Number(source.x)) ? Number(source.x) : fallbackX;
  const requestedY = Number.isFinite(Number(source.y)) ? Number(source.y) : fallbackY;
  return {
    x: Math.max(workArea.x + 8, Math.min(workArea.x + workArea.width - width - 8, Math.round(requestedX))),
    y: Math.max(workArea.y + 8, Math.min(workArea.y + workArea.height - height - 8, Math.round(requestedY))),
    width,
    height,
  };
}

function snappedDesktopCardBounds(bounds) {
  const fitted = fitDesktopCardBounds(bounds);
  const display = desktopCardDisplayForPoint({
    x: fitted.x + fitted.width / 2,
    y: fitted.y + fitted.height / 2,
  });
  const workArea = display.workArea;
  const left = workArea.x + DESKTOP_CARD_SCREEN_MARGIN;
  const right = workArea.x + workArea.width - fitted.width - DESKTOP_CARD_SCREEN_MARGIN;
  if (Math.abs(fitted.x - left) <= DESKTOP_CARD_SNAP_DISTANCE) fitted.x = left;
  if (Math.abs(fitted.x - right) <= DESKTOP_CARD_SNAP_DISTANCE) fitted.x = right;
  return fitted;
}

function createDesktopCardConfig(taskId, options = {}) {
  const configs = loadDesktopCardConfigs();
  const existing = configs.get(taskId);
  if (existing) return existing;
  const point = options.point || screen.getCursorScreenPoint();
  const display = desktopCardDisplayForPoint(point);
  const bounds = options.side === 'right'
    ? fitDesktopCardBounds({
      x: display.workArea.x + display.workArea.width - DESKTOP_CARD_DEFAULT_WIDTH - DESKTOP_CARD_SCREEN_MARGIN,
      y: point.y - DESKTOP_CARD_DEFAULT_HEIGHT / 2,
      width: DESKTOP_CARD_DEFAULT_WIDTH,
      height: DESKTOP_CARD_DEFAULT_HEIGHT,
    }, point)
    : options.side === 'left'
    ? fitDesktopCardBounds({
      x: display.workArea.x + DESKTOP_CARD_SCREEN_MARGIN,
      y: point.y - DESKTOP_CARD_DEFAULT_HEIGHT / 2,
      width: DESKTOP_CARD_DEFAULT_WIDTH,
      height: DESKTOP_CARD_DEFAULT_HEIGHT,
    }, point)
    : fitDesktopCardBounds({
      x: point.x - DESKTOP_CARD_DEFAULT_WIDTH / 2,
      y: point.y - DESKTOP_CARD_DEFAULT_HEIGHT / 2,
      width: DESKTOP_CARD_DEFAULT_WIDTH,
      height: DESKTOP_CARD_DEFAULT_HEIGHT,
    }, point);
  const config = {
    taskId,
    bounds,
    alwaysOnTop: false,
  };
  configs.set(taskId, config);
  persistDesktopCardConfigs();
  return config;
}

function sendDesktopCardState(taskId) {
  const targetWindow = desktopCardWindows.get(taskId);
  if (!targetWindow || targetWindow.isDestroyed()) return;
  const state = desktopCardStates.get(taskId);
  if (!state) return;
  targetWindow.webContents.send('desktop-card:state', state);
}

function createDesktopCardWindow(taskId) {
  const existing = desktopCardWindows.get(taskId);
  if (existing && !existing.isDestroyed()) return existing;
  const configs = loadDesktopCardConfigs();
  const config = configs.get(taskId) || createDesktopCardConfig(taskId);
  const bounds = fitDesktopCardBounds(config.bounds);
  config.bounds = bounds;
  const cardWindow = new BrowserWindow({
    ...bounds,
    minWidth: DESKTOP_CARD_MIN_WIDTH,
    minHeight: DESKTOP_CARD_MIN_HEIGHT,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: true,
    movable: true,
    alwaysOnTop: config.alwaysOnTop === true,
    skipTaskbar: true,
    hasShadow: false,
    hiddenInMissionControl: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'renderer', 'desktop-card-preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });
  desktopCardWindows.set(taskId, cardWindow);
  installLocalWebContentsGuards(cardWindow.webContents);
  if (config.alwaysOnTop) {
    cardWindow.setAlwaysOnTop(true, 'floating');
    if (process.platform === 'darwin') {
      cardWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: false });
    }
  }
  cardWindow.loadFile(path.join(__dirname, 'renderer', 'desktop-card.html'));
  cardWindow.webContents.once('did-finish-load', () => {
    if (cardWindow.isDestroyed()) return;
    sendDesktopCardState(taskId);
    if (!cardWindow.isVisible()) cardWindow.showInactive();
  });
  let moveTimer = null;
  let snapping = false;
  const saveBounds = (snap = false) => {
    if (cardWindow.isDestroyed() || snapping) return;
    const next = snap
      ? snappedDesktopCardBounds(cardWindow.getBounds())
      : fitDesktopCardBounds(cardWindow.getBounds());
    const currentConfig = loadDesktopCardConfigs().get(taskId);
    if (currentConfig) {
      currentConfig.bounds = {
        x: next.x,
        y: next.y,
        width: next.width,
        height: next.height,
      };
      persistDesktopCardConfigs();
    }
    const actual = cardWindow.getBounds();
    if (actual.x !== next.x || actual.y !== next.y) {
      snapping = true;
      cardWindow.setBounds(next);
      setTimeout(() => { snapping = false; }, 120);
    }
  };
  const scheduleSave = (snap = false) => {
    if (moveTimer) clearTimeout(moveTimer);
    moveTimer = setTimeout(() => {
      moveTimer = null;
      saveBounds(snap);
    }, 140);
  };
  cardWindow.on('move', () => scheduleSave(false));
  cardWindow.on('moved', () => scheduleSave(true));
  cardWindow.on('resize', () => scheduleSave(false));
  cardWindow.on('resized', () => scheduleSave(true));
  cardWindow.on('closed', () => {
    desktopCardWindows.delete(taskId);
    if (disposingDesktopCards.delete(taskId) || isQuitting) return;
    const configsNow = loadDesktopCardConfigs();
    if (configsNow.delete(taskId)) persistDesktopCardConfigs();
    if (mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('desktop-card:removed', taskId);
    }
  });
  return cardWindow;
}

function disposeDesktopCard(taskId) {
  const targetWindow = desktopCardWindows.get(taskId);
  disposingDesktopCards.add(taskId);
  desktopCardWindows.delete(taskId);
  desktopCardStates.delete(taskId);
  const configs = loadDesktopCardConfigs();
  configs.delete(taskId);
  persistDesktopCardConfigs();
  if (targetWindow && !targetWindow.isDestroyed()) targetWindow.destroy();
  else disposingDesktopCards.delete(taskId);
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('desktop-card:removed', taskId);
  }
}

function normalizeDesktopCardState(value) {
  const source = value && typeof value === 'object' ? value : {};
  const clean = (input, maxLength = 300) => String(input || '').slice(0, maxLength);
  return {
    id: clean(source.id, 120),
    text: clean(source.text, 160),
    status: ['todo', 'in_progress', 'blocked', 'done'].includes(source.status) ? source.status : 'todo',
    statusLabel: clean(source.statusLabel, 40),
    dueText: clean(source.dueText, 80),
    overdue: source.overdue === true,
    priorityLabel: clean(source.priorityLabel, 40),
    blockReasonType: clean(source.blockReasonType, 40),
    blockReason: clean(source.blockReason, 500),
    nextAction: clean(source.nextAction, 300),
    subtaskDone: Math.max(0, Math.round(Number(source.subtaskDone) || 0)),
    subtaskTotal: Math.max(0, Math.round(Number(source.subtaskTotal) || 0)),
    done: source.done === true,
  };
}

function reconcileDesktopCards(items) {
  const configs = loadDesktopCardConfigs();
  const normalizedItems = (Array.isArray(items) ? items : [])
    .map(normalizeDesktopCardState)
    .filter((item) => item.id)
    .slice(0, 10);
  const activeIds = new Set(normalizedItems.map((item) => item.id));
  for (const taskId of [...configs.keys()]) {
    if (!activeIds.has(taskId)) disposeDesktopCard(taskId);
  }
  for (const item of normalizedItems) {
    const config = configs.get(item.id) || createDesktopCardConfig(item.id);
    desktopCardStates.set(item.id, {
      ...item,
      alwaysOnTop: config.alwaysOnTop === true,
    });
    const cardWindow = createDesktopCardWindow(item.id);
    if (cardWindow.webContents.isLoading()) continue;
    sendDesktopCardState(item.id);
  }
  return { ok: true, ids: [...configs.keys()] };
}

function desktopCardTaskIdForEvent(event) {
  for (const [taskId, cardWindow] of desktopCardWindows) {
    if (!cardWindow.isDestroyed() && event.sender === cardWindow.webContents) return taskId;
  }
  return '';
}

ipcMain.handle('desktop-cards:list', () => ({
  ok: true,
  ids: [...loadDesktopCardConfigs().keys()],
}));

ipcMain.handle('desktop-cards:set-enabled', (event, taskId, enabled) => {
  const id = String(taskId || '').trim();
  if (!id) return { ok: false, error: 'invalid_task' };
  if (enabled === true) {
    const config = createDesktopCardConfig(id, { side: 'right' });
    const state = desktopCardStates.get(id) || { id, text: '待办', status: 'todo', statusLabel: '待办' };
    desktopCardStates.set(id, { ...state, alwaysOnTop: config.alwaysOnTop === true });
    createDesktopCardWindow(id);
  } else {
    disposeDesktopCard(id);
  }
  return { ok: true, ids: [...loadDesktopCardConfigs().keys()] };
});

ipcMain.handle('desktop-cards:add-from-drop', (event, taskId) => {
  const id = String(taskId || '').trim();
  const cardWindow = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const point = screen.getCursorScreenPoint();
  const insideMain = cardWindow && cardWindow.getBounds();
  if (
    insideMain
    && point.x >= insideMain.x
    && point.x <= insideMain.x + insideMain.width
    && point.y >= insideMain.y
    && point.y <= insideMain.y + insideMain.height
  ) return { ok: false, error: 'inside_window' };
  if (!id) return { ok: false, error: 'invalid_task' };
  createDesktopCardConfig(id, { point });
  return { ok: true, ids: [...loadDesktopCardConfigs().keys()] };
});

ipcMain.handle('desktop-cards:sync', (event, items) => reconcileDesktopCards(items));

ipcMain.handle('desktop-card:get-state', (event) => {
  const taskId = desktopCardTaskIdForEvent(event);
  return taskId ? desktopCardStates.get(taskId) || null : null;
});

ipcMain.handle('desktop-card:toggle-task', (event) => {
  const taskId = desktopCardTaskIdForEvent(event);
  if (!taskId || !mainWindow || mainWindow.isDestroyed()) return { ok: false };
  mainWindow.webContents.send('todo:toggle-from-card', { taskId });
  return { ok: true };
});

ipcMain.handle('desktop-card:open-task', async (event) => {
  const taskId = desktopCardTaskIdForEvent(event);
  if (!taskId) return { ok: false };
  return { ok: await activateTodoNotification({ taskId }) };
});

ipcMain.handle('desktop-card:update-task', (event, patch) => {
  const taskId = desktopCardTaskIdForEvent(event);
  if (!taskId || !mainWindow || mainWindow.isDestroyed()) return { ok: false };
  const source = patch && typeof patch === 'object' ? patch : {};
  const clean = (value, maxLength) => String(value || '').trim().slice(0, maxLength);
  const normalized = {};
  if (Object.prototype.hasOwnProperty.call(source, 'text')) {
    const text = clean(source.text, 160);
    if (!text) return { ok: false, error: 'invalid_text' };
    normalized.text = text;
  }
  if (['todo', 'in_progress', 'blocked', 'done'].includes(source.status)) {
    normalized.status = source.status;
  }
  if (Object.prototype.hasOwnProperty.call(source, 'blockReason')) {
    normalized.blockReason = clean(source.blockReason, 2000);
  }
  if (Object.prototype.hasOwnProperty.call(source, 'nextAction')) {
    normalized.nextAction = clean(source.nextAction, 1200);
  }
  if (Number.isFinite(Number(source.snoozeMinutes))) {
    normalized.snoozeMinutes = Math.max(1, Math.min(1440, Math.round(Number(source.snoozeMinutes))));
  }
  if (['tomorrow', 'today'].includes(source.deadlinePreset)) {
    normalized.deadlinePreset = source.deadlinePreset;
  }
  mainWindow.webContents.send('todo:update-from-card', { taskId, patch: normalized });
  return { ok: true };
});

ipcMain.handle('desktop-card:resize-content', (event, requestedHeight) => {
  const taskId = desktopCardTaskIdForEvent(event);
  const cardWindow = taskId ? desktopCardWindows.get(taskId) : null;
  if (!taskId || !cardWindow || cardWindow.isDestroyed()) return { ok: false };
  const bounds = cardWindow.getBounds();
  const height = Math.max(
    DESKTOP_CARD_MIN_HEIGHT,
    Math.min(720, Math.round(Number(requestedHeight) || bounds.height))
  );
  if (Math.abs(height - bounds.height) < 3) return { ok: true, height: bounds.height };
  const next = fitDesktopCardBounds({ ...bounds, height });
  cardWindow.setBounds(next);
  const config = loadDesktopCardConfigs().get(taskId);
  if (config) {
    config.bounds = next;
    persistDesktopCardConfigs();
  }
  return { ok: true, height: next.height };
});

ipcMain.handle('desktop-card:close', (event) => {
  const taskId = desktopCardTaskIdForEvent(event);
  if (!taskId) return { ok: false };
  setTimeout(() => disposeDesktopCard(taskId), 0);
  return { ok: true };
});

ipcMain.handle('desktop-card:set-always-on-top', (event, enabled) => {
  const taskId = desktopCardTaskIdForEvent(event);
  const cardWindow = taskId ? desktopCardWindows.get(taskId) : null;
  const config = taskId ? loadDesktopCardConfigs().get(taskId) : null;
  if (!taskId || !cardWindow || cardWindow.isDestroyed() || !config) return { ok: false };
  config.alwaysOnTop = enabled === true;
  cardWindow.setAlwaysOnTop(config.alwaysOnTop, config.alwaysOnTop ? 'floating' : 'normal');
  if (process.platform === 'darwin') {
    cardWindow.setVisibleOnAllWorkspaces(config.alwaysOnTop, {
      visibleOnFullScreen: false,
    });
  }
  const state = desktopCardStates.get(taskId);
  if (state) desktopCardStates.set(taskId, { ...state, alwaysOnTop: config.alwaysOnTop });
  persistDesktopCardConfigs();
  sendDesktopCardState(taskId);
  return { ok: true, alwaysOnTop: config.alwaysOnTop };
});

async function createTodoReportPdf(report) {
  const html = buildTodoReportHtml(report);
  const temporary = path.join(
    app.getPath('temp'),
    `todo-report-${process.pid}-${Date.now().toString(36)}.html`
  );
  let reportWindow = null;
  try {
    await fs.promises.writeFile(temporary, html, { mode: 0o600 });
    reportWindow = new BrowserWindow({
      width: 900,
      height: 1200,
      show: false,
      backgroundColor: '#ffffff',
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        backgroundThrottling: false,
      },
    });
    await reportWindow.loadFile(temporary);
    return await reportWindow.webContents.printToPDF({
      printBackground: true,
      pageSize: 'A4',
      preferCSSPageSize: true,
    });
  } finally {
    if (reportWindow && !reportWindow.isDestroyed()) reportWindow.destroy();
    try { await fs.promises.unlink(temporary); } catch (error) {}
  }
}

ipcMain.handle('todos:export-report', async (event, payload) => {
  const source = payload && typeof payload === 'object' ? payload : {};
  const format = source.format === 'docx' ? 'docx' : source.format === 'pdf' ? 'pdf' : '';
  const report = normalizeTodoReport(source.report);
  if (!format) return { ok: false, error: 'invalid_format' };
  if (!report.tasks.length) return { ok: false, error: 'empty_report' };
  const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const options = {
    title: format === 'docx' ? '导出 Word 待办报告' : '导出 PDF 待办报告',
    defaultPath: suggestedReportFileName(report, format),
    filters: format === 'docx'
      ? [{ name: 'Word 文档', extensions: ['docx'] }]
      : [{ name: 'PDF 文档', extensions: ['pdf'] }],
  };
  const result = owner
    ? await dialog.showSaveDialog(owner, options)
    : await dialog.showSaveDialog(options);
  let destination = result.canceled ? '' : result.filePath;
  if (!destination) return { ok: false, canceled: true };
  if (path.extname(destination).toLowerCase() !== `.${format}`) {
    destination = `${destination}.${format}`;
  }
  try {
    const data = format === 'docx'
      ? buildTodoReportDocx(report)
      : await createTodoReportPdf(report);
    await fs.promises.writeFile(destination, data, { mode: 0o600 });
    return { ok: true, path: destination, format };
  } catch (error) {
    return { ok: false, error: 'write_failed' };
  }
});

ipcMain.handle('todos:import', async () => {
  const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  const options = {
    title: '导入待办数据',
    properties: ['openFile'],
    filters: [{ name: 'JSON', extensions: ['json'] }],
  };
  const result = owner
    ? await dialog.showOpenDialog(owner, options)
    : await dialog.showOpenDialog(options);
  const source = result.canceled ? '' : result.filePaths[0];
  if (!source) return { ok: false, canceled: true };
  try {
    const stats = fs.statSync(source);
    if (!stats.isFile() || stats.size > 20 * 1024 * 1024) {
      return { ok: false, error: 'file_too_large' };
    }
    const parsed = JSON.parse(fs.readFileSync(source, 'utf8'));
    const todo = parsed && typeof parsed === 'object' && parsed.todo ? parsed.todo : parsed;
    if (!todo || typeof todo !== 'object' || Array.isArray(todo)) {
      return { ok: false, error: 'invalid_data' };
    }
    const confirmationOptions = {
      type: 'warning',
      buttons: ['取消', '导入并替换'],
      defaultId: 0,
      cancelId: 0,
      noLink: true,
      message: '导入会替换当前待办数据，是否继续？',
      detail: '建议保留当前自动备份，确认数据无误后再继续。',
    };
    const confirmation = owner
      ? await dialog.showMessageBox(owner, confirmationOptions)
      : await dialog.showMessageBox(confirmationOptions);
    if (confirmation.response !== 1) return { ok: false, canceled: true };
    return { ok: true, data: todo, path: source };
  } catch (error) {
    return { ok: false, error: 'read_failed' };
  }
});

ipcMain.handle('pomodoro:notify', (event, minutes) => {
  const safeMinutes = Math.max(1, Math.min(120, Math.round(Number(minutes) || 25)));
  const completedAt = Date.now();
  const notification = {
    eventId: `pomodoro-${completedAt}`,
    taskId: `pomodoro-${completedAt}`,
    source: 'pomodoro',
    project: '番茄钟',
    title: '专注完成',
    body: `${safeMinutes} 分钟专注计时已结束`,
    completedAt,
  };
  return { ok: true, result: enqueueTaskNotification(notification) };
});

function getTaskNotificationBounds(display) {
  const d = display || getTargetDisplay();
  const width = Math.min(
    TASK_NOTIFICATION_WIDTH,
    Math.max(280, d.bounds.width - TASK_NOTIFICATION_SCREEN_MARGIN * 2)
  );
  return getCenteredBounds(width, TASK_NOTIFICATION_HEIGHT, d);
}

function recoverClosedTaskNotificationWindow(targetWindow) {
  if (notificationWindow !== targetWindow) return;
  const interruptedNotification = activeTaskNotification;
  clearTaskNotificationTimers();
  notificationWindow = null;
  notificationWindowReady = false;
  activeTaskNotification = null;
  taskNotificationLeaving = false;
  taskNotificationPaused = false;
  taskNotificationPersistent = false;
  taskNotificationRemainingMs = TASK_NOTIFICATION_VISIBLE_MS;
  if (!isQuitting && interruptedNotification) {
    prependPendingTaskNotification(interruptedNotification);
  }
  if (!isQuitting) setTimeout(showNextTaskNotification, 80);
}

function createTaskNotificationWindow() {
  if (notificationWindow && !notificationWindow.isDestroyed()) return notificationWindow;
  const bounds = getTaskNotificationBounds();
  notificationWindowReady = false;
  notificationWindow = new BrowserWindow({
    ...bounds,
    frame: false,
    transparent: true,
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    focusable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: false,
    hiddenInMissionControl: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    roundedCorners: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
    },
  });

  installLocalWebContentsGuards(notificationWindow.webContents);

  const targetWindow = notificationWindow;
  notificationWindow.setAlwaysOnTop(true, 'screen-saver', 1);
  if (process.platform === 'darwin') notificationWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  notificationWindow.setIgnoreMouseEvents(false);
  notificationWindow.loadFile(path.join(__dirname, 'renderer', 'notification.html'));

  targetWindow.webContents.once('did-finish-load', () => {
    if (notificationWindow !== targetWindow || targetWindow.isDestroyed()) return;
    notificationWindowReady = true;
    showNextTaskNotification();
  });

  targetWindow.webContents.on('render-process-gone', () => {
    if (!targetWindow.isDestroyed()) targetWindow.destroy();
  });
  targetWindow.on('closed', () => {
    recoverClosedTaskNotificationWindow(targetWindow);
  });
  return notificationWindow;
}

function clearTaskNotificationTimers() {
  if (taskNotificationTimer) {
    clearTimeout(taskNotificationTimer);
    taskNotificationTimer = null;
  }
  if (taskNotificationFallbackTimer) {
    clearTimeout(taskNotificationFallbackTimer);
    taskNotificationFallbackTimer = null;
  }
}

function todoNotificationDurationSeconds() {
  const configured = normalizeTodoNotificationDuration(
    readAppSettings().todoNotificationDurationSeconds
  );
  return configured === null ? 10 : configured;
}

function todoNotificationVisibleMs() {
  return todoNotificationDurationSeconds() * 1000;
}

function scheduleTaskNotificationDismiss() {
  if (!activeTaskNotification || taskNotificationLeaving || taskNotificationPaused) return;
  if (taskNotificationPersistent) return;
  if (taskNotificationTimer) clearTimeout(taskNotificationTimer);
  taskNotificationTimerStartedAt = Date.now();
  taskNotificationTimer = setTimeout(
    beginTaskNotificationDismiss,
    Math.max(0, taskNotificationRemainingMs)
  );
}

function setTaskNotificationPaused(paused) {
  if (!activeTaskNotification || taskNotificationLeaving || taskNotificationPaused === paused) return;
  taskNotificationPaused = paused;
  if (paused) {
    if (taskNotificationTimer) {
      taskNotificationRemainingMs = Math.max(
        0,
        taskNotificationRemainingMs - (Date.now() - taskNotificationTimerStartedAt)
      );
      clearTimeout(taskNotificationTimer);
      taskNotificationTimer = null;
    }
  } else {
    scheduleTaskNotificationDismiss();
  }
}

function showNextTaskNotification() {
  if (activeTaskNotification || !hasPendingTaskNotifications() || isQuitting) return;
  const targetWindow = createTaskNotificationWindow();
  if (!notificationWindowReady || !targetWindow || targetWindow.isDestroyed()) return;

  activeTaskNotification = shiftPendingTaskNotification();
  if (!activeTaskNotification) return;
  taskNotificationLeaving = false;
  taskNotificationPaused = false;
  taskNotificationPersistent = todoNotificationDurationSeconds() === 0;
  taskNotificationRemainingMs = todoNotificationVisibleMs();
  targetWindow.setBounds(getTaskNotificationBounds(getTargetDisplay()));
  targetWindow.showInactive();
  targetWindow.webContents.send('task-notification:show', {
    ...activeTaskNotification,
    pendingCount: getPendingTaskNotificationCount(),
    visibleMs: taskNotificationRemainingMs,
  });
  scheduleTaskNotificationDismiss();
}

function beginTaskNotificationDismiss() {
  if (!activeTaskNotification || taskNotificationLeaving) return;
  taskNotificationLeaving = true;
  clearTaskNotificationTimers();
  const eventId = activeTaskNotification.eventId;
  if (notificationWindow && !notificationWindow.isDestroyed() && notificationWindowReady) {
    notificationWindow.webContents.send('task-notification:hide', eventId);
  }
  taskNotificationFallbackTimer = setTimeout(
    () => finishTaskNotification(eventId),
    TASK_NOTIFICATION_LEAVE_MS + 120
  );
}

function finishTaskNotification(eventId) {
  if (!activeTaskNotification || activeTaskNotification.eventId !== eventId) return;
  clearTaskNotificationTimers();
  const completedWindow = notificationWindow;
  if (completedWindow && !completedWindow.isDestroyed()) completedWindow.hide();
  activeTaskNotification = null;
  taskNotificationLeaving = false;
  taskNotificationPaused = false;
  taskNotificationPersistent = false;
  taskNotificationRemainingMs = TASK_NOTIFICATION_VISIBLE_MS;
  setTimeout(() => {
    showNextTaskNotification();
    const policy = taskNotificationWindowPolicy({
      active: Boolean(activeTaskNotification),
      queueLength: getPendingTaskNotificationCount(),
    });
    if (
      policy === 'dispose'
      && notificationWindow === completedWindow
      && completedWindow
      && !completedWindow.isDestroyed()
    ) {
      completedWindow.destroy();
    }
  }, 80);
}

function sendTaskNotificationResponse(response, statusCode, body) {
  if (response.headersSent) return;
  const json = JSON.stringify(body);
  response.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(json),
    'Cache-Control': 'no-store',
  });
  response.end(json);
}

function startTaskNotificationServer() {
  if (notificationServer) return;
  const server = http.createServer((request, response) => {
    let requestUrl;
    try {
      requestUrl = new URL(request.url || '/', `http://${TASK_NOTIFICATION_HOST}`);
    } catch (error) {
      sendTaskNotificationResponse(response, 400, { ok: false, error: 'invalid_url' });
      return;
    }
    if (request.method === 'GET' && requestUrl.pathname === '/health') {
      sendTaskNotificationResponse(response, 200, { ok: true });
      return;
    }

    const sourceMatch = /^\/notify\/([a-z0-9-]{1,32})$/i.exec(requestUrl.pathname);
    const requestedSource = sourceMatch ? sourceMatch[1].toLowerCase() : '';
    const source = TASK_NOTIFICATION_SOURCES.has(requestedSource) ? requestedSource : null;
    if (request.method !== 'POST' || !source) {
      sendTaskNotificationResponse(response, 404, { ok: false, error: 'not_found' });
      return;
    }
    const contentType = String(request.headers['content-type'] || '')
      .split(';', 1)[0]
      .trim()
      .toLowerCase();
    if (contentType !== 'application/json') {
      sendTaskNotificationResponse(response, 415, {
        ok: false,
        error: 'application_json_required',
      });
      return;
    }

    const chunks = [];
    let bodyLength = 0;
    let bodyTooLarge = false;
    request.on('data', (chunk) => {
      bodyLength += chunk.length;
      if (bodyLength > TASK_NOTIFICATION_BODY_LIMIT) {
        bodyTooLarge = true;
        chunks.length = 0;
        return;
      }
      if (!bodyTooLarge) chunks.push(chunk);
    });
    request.on('end', () => {
      if (bodyTooLarge) {
        sendTaskNotificationResponse(response, 413, { ok: false, error: 'body_too_large' });
        return;
      }
      let payload;
      try {
        const rawBody = Buffer.concat(chunks).toString('utf8').trim();
        payload = rawBody ? JSON.parse(rawBody) : {};
      } catch (error) {
        sendTaskNotificationResponse(response, 400, { ok: false, error: 'invalid_json' });
        return;
      }
      if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
        sendTaskNotificationResponse(response, 400, { ok: false, error: 'invalid_payload' });
        return;
      }
      const result = enqueueTaskNotification(normalizeTaskNotification(payload, source));
      sendTaskNotificationResponse(response, 202, { ok: true, result });
    });
    request.on('error', () => {
      if (!response.headersSent) sendTaskNotificationResponse(response, 400, { ok: false });
    });
  });
  notificationServer = server;

  server.on('clientError', (error, socket) => {
    if (socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\n\r\n');
  });
  server.once('listening', () => {
    if (notificationServer !== server) return;
    notificationServerAvailable = true;
    refreshTrayMenu();
  });
  server.on('error', (error) => {
    if (notificationServer === server) notificationServer = null;
    notificationServerAvailable = false;
    refreshTrayMenu();
    console.warn(`Task notification server unavailable: ${error.message}`);
  });
  server.listen(TASK_NOTIFICATION_PORT, TASK_NOTIFICATION_HOST);
}

function stopTaskNotificationServer() {
  const server = notificationServer;
  notificationServer = null;
  notificationServerAvailable = false;
  if (server) server.close();
}

ipcMain.on('task-notification:hover', (event, paused) => {
  if (
    notificationWindow &&
    !notificationWindow.isDestroyed() &&
    event.sender === notificationWindow.webContents
  ) {
    setTaskNotificationPaused(paused === true);
  }
});

ipcMain.on('task-notification:dismissed', (event, eventId) => {
  if (
    notificationWindow &&
    !notificationWindow.isDestroyed() &&
    event.sender === notificationWindow.webContents &&
    typeof eventId === 'string'
  ) {
    finishTaskNotification(eventId);
  }
});
ipcMain.on('task-notification:handled', (event, eventId) => {
  if (
    notificationWindow
    && !notificationWindow.isDestroyed()
    && event.sender === notificationWindow.webContents
    && activeTaskNotification
    && activeTaskNotification.source === 'todo'
    && (!eventId || activeTaskNotification.eventId === eventId)
  ) {
    notifyTodoReminderHandled(activeTaskNotification);
  }
});

ipcMain.handle('strong-reminder:resolve', (event, payload) => {
  if (
    !strongReminderWindow
    || strongReminderWindow.isDestroyed()
    || event.sender !== strongReminderWindow.webContents
    || !activeStrongReminder
  ) {
    return { ok: false, error: 'no_active_strong_reminder' };
  }
  if (String(payload?.eventId || '') !== String(activeStrongReminder.eventId || '')) {
    return { ok: false, error: 'stale_reminder' };
  }
  const normalized = normalizeStrongReminderAnswers(payload?.answers, {
    strongReminderAt: payload?.strongReminderAt,
    taskDeadline: activeStrongReminder.deadline,
    completionConfirmed: payload?.completionConfirmed === true,
  });
  if (!normalized) return { ok: false, error: 'incomplete_answers' };
  const result = {
    taskId: activeStrongReminder.taskId,
    reminderId: activeStrongReminder.reminderId,
    answers: normalized.answers,
    strongReminderAt: normalized.strongReminderAt,
    extendDeadline: normalized.extendDeadline === true,
    completionConfirmed: normalized.completionConfirmed === true,
    resolvedAt: Date.now(),
  };
  allowStrongReminderClose = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('todo:strong-resolved', result);
  }
  finishStrongReminder();
  return { ok: true };
});

ipcMain.handle('strong-reminder:abort', (event, payload) => {
  if (
    !strongReminderWindow
    || strongReminderWindow.isDestroyed()
    || event.sender !== strongReminderWindow.webContents
    || !activeStrongReminder
  ) {
    return { ok: false, error: 'no_active_strong_reminder' };
  }
  if (String(payload?.eventId || '') !== String(activeStrongReminder.eventId || '')) {
    return { ok: false, error: 'stale_reminder' };
  }
  allowStrongReminderClose = true;
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('todo:strong-aborted', {
      taskId: activeStrongReminder.taskId,
      reminderId: activeStrongReminder.reminderId,
      reason: 'save_failed',
      abortedAt: Date.now(),
    });
  }
  finishStrongReminder();
  return { ok: true };
});

ipcMain.handle('notification:play-sound', async (event, soundId) => {
  if (
    process.platform !== 'darwin'
    || !notificationWindow
    || notificationWindow.isDestroyed()
    || event.sender !== notificationWindow.webContents
  ) {
    return { ok: false, error: 'unsupported' };
  }
  const soundPath = NOTIFICATION_SOUND_FILES[String(soundId || '')];
  if (!soundPath || !fs.existsSync(soundPath)) return { ok: false, error: 'invalid_sound' };
  return new Promise((resolve) => {
    execFile('/usr/bin/afplay', [soundPath], { timeout: 8000 }, (error) => {
      resolve(error ? { ok: false, error: 'play_failed' } : { ok: true });
    });
  });
});

function createWindow() {
  const initial = getCenteredBounds(COLLAPSED_WIDTH, getCollapsedHeight(getTargetDisplay()));

  mainWindow = new BrowserWindow({
    width: initial.width,
    height: initial.height,
    x: initial.x,
    y: initial.y,
    frame: false,
    transparent: true,
    // 必须显式给透明底色：只写 transparent 时 BrowserWindow 仍保留不透明的默认底色，
    // 展开瞬间 setBounds 放大后，新暴露的区域会先用它画一两帧，
    // 在菜单栏带上表现为一次黑块闪烁（通知窗口一直是这么写的）。
    backgroundColor: '#00000000',
    resizable: false,
    movable: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    hasShadow: true,
    acceptFirstMouse: true,
    hiddenInMissionControl: true,
    fullscreenable: false,
    minimizable: false,
    maximizable: false,
    roundedCorners: false,
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      backgroundThrottling: false,
    },
  });

  installLocalWebContentsGuards(mainWindow.webContents);

  mainWindow.setAlwaysOnTop(true, 'screen-saver');
  if (process.platform === 'darwin') mainWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
  if (process.platform === 'win32') mainWindow.setMenu(null);

  // Escape 在到达页面前会被 Chromium 浏览器层吞掉（实测 document keydown 收不到），
  // 用 before-input-event 在分发前拦截并转发给渲染层处理（退出输入 / 收起面板）
  mainWindow.webContents.on('before-input-event', (event, input) => {
    if (input.type === 'keyDown' && input.key === 'Escape') {
      mainWindow.webContents.send('key:escape');
    }
  });

  // 失焦时让渲染层走完整退场动画，再由渲染层请求缩小原生窗口。
  mainWindow.on('blur', () => {
    if (mediaPermissionRequests > 0 || transientSystemInteractionRequests > 0) {
      cameraBlurDeferred = true;
      return;
    }
    requestRendererCollapse();
  });

  mainWindow.on('focus', () => {
    cameraBlurDeferred = false;
  });
  mainWindow.on('show', syncHoverSpacePolling);
  mainWindow.on('hide', syncHoverSpacePolling);

  mainWindow.loadFile(path.join(__dirname, 'renderer', 'index.html'));

  mainWindow.once('ready-to-show', () => {
    applyMode('collapsed');
    mainWindow.show();
  });

  mainWindow.on('closed', () => {
    cancelCollapseWatchdog();
    hideWhenCollapsed = false;
    mainWindow = null;
  });

  mainWindow.on('close', (event) => {
    if (isQuitting) return;
    event.preventDefault();
    hideWindowAfterCollapse();
  });
}

function toggleVisibility() {
  if (!mainWindow) {
    createWindow();
    return;
  }
  if (mainWindow.isVisible()) {
    hideWindowAfterCollapse();
  } else {
    hideWhenCollapsed = false;
    repositionWindow(getTargetDisplay()); // 显示前先回到鼠标所在屏顶部
    mainWindow.show();
    refreshTrayMenu();
  }
}

function isAutoLaunchEnabled() {
  if (!PLATFORM_CAPABILITIES.autoLaunch) return false;
  try {
    return app.getLoginItemSettings().openAtLogin;
  } catch (e) {
    return false;
  }
}

function setAutoLaunch(enabled) {
  if (!PLATFORM_CAPABILITIES.autoLaunch) return false;
  try {
    app.setLoginItemSettings({ openAtLogin: enabled, openAsHidden: false });
    return isAutoLaunchEnabled() === enabled;
  } catch (e) {
    return false;
  }
}

const DEFAULT_FEATURES = {
  home: true,
  todo: true,
  notes: false,
  links: false,
  recordings: false,
  credentials: false,
  clip: false,
};

function getJsonSettingsPath(name) {
  return path.join(app.getPath('userData'), name);
}

function readJsonFile(filePath, fallback = {}) {
  try {
    const parsed = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : fallback;
  } catch (error) {
    return fallback;
  }
}

function writeJsonFile(filePath, value) {
  const temporaryPath = `${filePath}.${process.pid}.tmp`;
  try {
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(temporaryPath, JSON.stringify(value, null, 2), { mode: 0o600 });
    fs.renameSync(temporaryPath, filePath);
    return true;
  } catch (error) {
    try { fs.unlinkSync(temporaryPath); } catch (unlinkError) {}
    return false;
  }
}

function readAppSettings() {
  const stored = readJsonFile(getJsonSettingsPath(APP_SETTINGS_FILE));
  const features = {
    ...DEFAULT_FEATURES,
    ...(stored.features || {}),
    home: true,
    todo: true,
    notes: false,
    links: false,
    recordings: false,
    credentials: false,
    clip: false,
  };
  return {
    features,
    shortcut: isValidPanelShortcut(stored.shortcut) ? stored.shortcut : 'Space',
    defaultTab: normalizeDefaultTabPreference(stored.defaultTab, features),
    todoNotificationDurationSeconds: normalizeTodoNotificationDuration(
      stored.todoNotificationDurationSeconds
    ) ?? 10,
  };
}

function publicAppSettings() {
  return { ...readAppSettings(), autoLaunch: isAutoLaunchEnabled() };
}

function saveAppSettings(settings) {
  return writeJsonFile(getJsonSettingsPath(APP_SETTINGS_FILE), settings);
}

function workspaceRoot() {
  const settings = readJsonFile(getJsonSettingsPath(WORKSPACE_SETTINGS_FILE));
  const configured = String(settings.path || '').trim();
  return configured && path.isAbsolute(configured) ? configured : app.getPath('userData');
}

function workspacePath(name) {
  return path.join(workspaceRoot(), name);
}

function showOwnedOpenDialog(options) {
  const owner = mainWindow && !mainWindow.isDestroyed() ? mainWindow : null;
  if (owner) {
    if (!owner.isVisible()) owner.show();
    owner.focus();
  }
  return runOwnedOpenDialog(
    dialog.showOpenDialog.bind(dialog),
    owner,
    options,
    (delta) => {
      transientSystemInteractionRequests = Math.max(0, transientSystemInteractionRequests + delta);
      if (delta < 0 && transientSystemInteractionRequests === 0 && mediaPermissionRequests === 0) {
        cameraBlurDeferred = false;
      }
    }
  );
}

function copyWorkspaceAssets(sourceRoot, targetRoot) {
  if (!sourceRoot || !targetRoot || path.resolve(sourceRoot) === path.resolve(targetRoot)) return;
  for (const directory of [RECORDINGS_DIR_NAME, CLIP_IMAGES_DIR_NAME]) {
    const source = path.join(sourceRoot, directory);
    const target = path.join(targetRoot, directory);
    try {
      if (!fs.existsSync(source) || !fs.lstatSync(source).isDirectory()) continue;
      fs.mkdirSync(target, { recursive: true });
      fs.cpSync(source, target, { recursive: true, force: false, errorOnExist: false });
    } catch (error) {}
  }
  for (const filename of [WORKSPACE_DATA_FILE, MIRROR_IMAGE_FILE]) {
    const source = path.join(sourceRoot, filename);
    const target = path.join(targetRoot, filename);
    try {
      if (fs.existsSync(source) && fs.lstatSync(source).isFile() && !fs.existsSync(target)) {
        fs.copyFileSync(source, target, fs.constants.COPYFILE_EXCL);
      }
    } catch (error) {}
  }
}

async function chooseWorkspaceFolder() {
  const result = await showOwnedOpenDialog({
    title: '选择叮做数据文件夹',
    properties: ['openDirectory', 'createDirectory'],
  });
  const selected = !result.canceled && result.filePaths && result.filePaths[0];
  if (!selected) return false;
  const previousRoot = workspaceRoot();
  copyWorkspaceAssets(previousRoot, selected);
  if (!writeJsonFile(getJsonSettingsPath(WORKSPACE_SETTINGS_FILE), { path: selected })) return false;
  for (const directory of [RECORDINGS_DIR_NAME, CLIP_IMAGES_DIR_NAME]) {
    try { fs.mkdirSync(path.join(selected, directory), { recursive: true }); } catch (error) {}
  }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('workspace:changed', { path: selected });
  refreshTrayMenu();
  return true;
}

function applyFeatureServices(features) {
  const policy = clipboardServicePolicy(features);
  if (policy.recordHistory) startClipboardPolling();
  else stopClipboardPolling();
}

function isValidPanelShortcut(shortcut) {
  if (shortcut === 'Space') return true;
  if (typeof shortcut !== 'string' || shortcut.length > 80) return false;
  const tokens = shortcut.split('+');
  if (tokens.length < 2) return false;
  const key = tokens.pop();
  const modifiers = new Set(['CommandOrControl', 'Command', 'Control', 'Alt', 'Option', 'Shift']);
  return tokens.length > 0
    && tokens.every((token) => modifiers.has(token))
    && /^(?:[A-Z0-9]|F(?:[1-9]|1[0-9]|2[0-4])|Space|Tab|Escape|Left|Right|Up|Down|Home|End|PageUp|PageDown|Backspace|Delete|Enter)$/.test(key);
}

function setPanelShortcut(shortcut) {
  if (!isValidPanelShortcut(shortcut)) return false;
  const previousShortcut = configuredShortcut || 'Space';
  stopHoverSpaceShortcut();
  if (configuredShortcut && configuredShortcut !== 'Space' && globalShortcut.isRegistered(configuredShortcut)) {
    globalShortcut.unregister(configuredShortcut);
  }
  if (shortcut === 'Space') {
    configuredShortcut = shortcut;
    startHoverSpaceShortcut();
    return true;
  }
  let registered = false;
  try {
    registered = globalShortcut.register(shortcut, () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      hideWhenCollapsed = false;
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('shortcut:toggle-panel');
    });
  } catch (error) {}
  if (registered) {
    configuredShortcut = shortcut;
    return true;
  }
  configuredShortcut = previousShortcut;
  startHoverSpaceShortcut();
  return false;
}

function applyAppSettings() {
  const settings = readAppSettings();
  applyFeatureServices(settings.features);
  if (!setPanelShortcut(settings.shortcut)) {
    settings.shortcut = 'Space';
    saveAppSettings(settings);
    setPanelShortcut('Space');
  }
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('settings:changed', publicAppSettings());
}

function openRendererPanel(channel) {
  if (!mainWindow || mainWindow.isDestroyed()) createWindow();
  if (!mainWindow || mainWindow.isDestroyed()) return;
  hideWhenCollapsed = false;
  repositionWindow(getTargetDisplay());
  mainWindow.show();
  const send = () => {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel);
  };
  if (mainWindow.webContents.isLoadingMainFrame()) mainWindow.webContents.once('did-finish-load', send);
  else send();
}

function mirrorImagePath() {
  return workspacePath(MIRROR_IMAGE_FILE);
}

function mirrorImageDataUrl() {
  try {
    const image = nativeImage.createFromPath(mirrorImagePath());
    if (image.isEmpty()) return null;
    return image.toDataURL();
  } catch (error) {
    return null;
  }
}

async function chooseMirrorImage() {
  const result = await showOwnedOpenDialog({
    title: '替换镜子配图',
    properties: ['openFile'],
    filters: [{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'heic'] }],
  });
  const selected = !result.canceled && result.filePaths && result.filePaths[0];
  if (!selected) return { ok: true, canceled: true };
  try {
    const image = nativeImage.createFromPath(selected);
    if (image.isEmpty()) throw new Error('invalid_image');
    const size = image.getSize();
    if (!size.width || !size.height || size.width * size.height > 60_000_000) throw new Error('image_too_large');
    fs.writeFileSync(mirrorImagePath(), image.toJPEG(92), { mode: 0o600 });
    const dataUrl = mirrorImageDataUrl();
    if (dataUrl && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('mirror:image-changed', dataUrl);
    }
    return { ok: true, canceled: false, dataUrl };
  } catch (error) {
    await dialog.showMessageBox({ type: 'error', title: '无法替换配图', message: '请选择一张有效且尺寸适中的图片。' });
    return { ok: false, error: 'invalid_image' };
  }
}

function refreshTrayMenu() {
  if (!tray) return;
  const autoLaunch = isAutoLaunchEnabled();
  const settings = readAppSettings();
  const featureLabels = { todo: '待办' };
  const menu = Menu.buildFromTemplate([
    {
      label: 'API 配置…',
      click: () => openRendererPanel('app:open-api-settings'),
    },
    {
      label: '替换镜子配图…',
      click: chooseMirrorImage,
    },
    {
      label: '显示功能',
      submenu: Object.entries(featureLabels).map(([id, label]) => ({
        label,
        type: 'checkbox',
        checked: settings.features[id] !== false,
        click: (item) => {
          const next = readAppSettings();
          next.features[id] = item.checked;
          saveAppSettings(next);
          applyAppSettings();
          refreshTrayMenu();
        },
      })),
    },
    {
      label: `设置快捷键…  当前：${settings.shortcut}`,
      click: () => openRendererPanel('app:record-shortcut'),
    },
    {
      label: '数据文件夹',
      submenu: [
        { label: '打开文件夹', click: () => shell.openPath(workspaceRoot()) },
        { label: '更换文件夹…', click: chooseWorkspaceFolder },
      ],
    },
    { type: 'separator' },
    {
      label: '开机自动启动',
      type: 'checkbox',
      checked: autoLaunch,
      click: (item) => {
        setAutoLaunch(item.checked);
        refreshTrayMenu();
      },
    },
    { type: 'separator' },
    {
      label: '关于',
      click: () => {
        dialog.showMessageBox({
          type: 'info',
          title: '关于叮做',
          message: '叮做 · Dingdo',
          detail:
            `版本 ${app.getVersion()}\n\n一个开源、常驻屏幕顶部的本地工作台。工作区数据默认保存在本机；账号密码与 API Key 由系统安全存储加密。\n\nMIT License`,
          buttons: ['查看 GitHub', '好'],
          defaultId: 1,
          cancelId: 1,
          noLink: true,
        }).then(({ response }) => {
          if (response === 0) shell.openExternal('https://github.com/zxc19950223/Dingdo');
        });
      },
    },
    { type: 'separator' },
    {
      label: '退出',
      accelerator: 'CommandOrControl+Q',
      click: () => app.quit(),
    },
  ]);
  tray.setContextMenu(menu);
}

function createTray() {
  tray = new Tray(createNotchTrayIcon());
  tray.setToolTip('叮做');
  tray.on('click', () => {
    if (!mainWindow) return;
    if (!mainWindow.isVisible()) {
      hideWhenCollapsed = false;
      repositionWindow(getTargetDisplay());
      mainWindow.show();
      refreshTrayMenu();
    }
  });
  refreshTrayMenu();
}

ipcMain.handle('window:set-mode', async (event, mode) => {
  if (mode === 'expanded') await rememberPasteTarget();
  applyMode(mode === 'expanded' ? 'expanded' : mode === 'peek' ? 'peek' : 'collapsed');
});

ipcMain.handle('window:begin-collapse', () => {
  beginNativeCollapse();
});

ipcMain.handle('settings:get', () => publicAppSettings());
ipcMain.handle('settings:set-feature', (event, payload) => {
  const current = readAppSettings();
  const features = updateFeaturePreference(current.features, payload && payload.featureId, payload && payload.enabled);
  if (!features) return { ok: false, error: 'invalid_feature' };
  const next = { ...current, features };
  if (!saveAppSettings(next)) return { ok: false, error: 'save_failed' };
  applyAppSettings();
  refreshTrayMenu();
  return { ok: true, settings: publicAppSettings() };
});
ipcMain.handle('settings:set-default-tab', (event, defaultTab) => {
  const next = updateDefaultTabPreference(readAppSettings(), defaultTab);
  if (!next) return { ok: false, error: 'invalid_default_tab' };
  if (!saveAppSettings(next)) return { ok: false, error: 'save_failed' };
  applyAppSettings();
  return { ok: true, settings: publicAppSettings() };
});
ipcMain.handle('settings:set-todo-notification-duration', (event, seconds) => {
  const duration = normalizeTodoNotificationDuration(seconds);
  if (duration === null) return { ok: false, error: 'invalid_duration' };
  const next = {
    ...readAppSettings(),
    todoNotificationDurationSeconds: duration,
  };
  if (!saveAppSettings(next)) return { ok: false, error: 'save_failed' };
  if (activeTaskNotification && !taskNotificationLeaving) {
    taskNotificationPersistent = duration === 0;
    taskNotificationRemainingMs = duration * 1000;
    if (taskNotificationPersistent) {
      if (taskNotificationTimer) clearTimeout(taskNotificationTimer);
      taskNotificationTimer = null;
    } else if (!taskNotificationPaused) {
      scheduleTaskNotificationDismiss();
    }
  }
  const settings = publicAppSettings();
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('settings:changed', settings);
  }
  return { ok: true, settings };
});
ipcMain.handle('settings:set-auto-launch', (event, enabled) => {
  if (typeof enabled !== 'boolean') return { ok: false, error: 'invalid' };
  if (!setAutoLaunch(enabled)) return { ok: false, error: 'save_failed', autoLaunch: isAutoLaunchEnabled() };
  const settings = publicAppSettings();
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('settings:changed', settings);
  refreshTrayMenu();
  return { ok: true, autoLaunch: settings.autoLaunch };
});
ipcMain.handle('settings:set-shortcut', (event, accelerator) => {
  if (!isValidPanelShortcut(accelerator)) return { ok: false, error: 'invalid' };
  if (!setPanelShortcut(accelerator)) return { ok: false, error: 'occupied' };
  const next = readAppSettings();
  next.shortcut = accelerator;
  if (!saveAppSettings(next)) return { ok: false, error: 'save_failed' };
  if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send('settings:changed', publicAppSettings());
  refreshTrayMenu();
  return { ok: true, shortcut: accelerator };
});
ipcMain.handle('workspace:get', () => ({ path: workspaceRoot(), portable: workspaceRoot() !== app.getPath('userData') }));
ipcMain.handle('workspace:load-data', () => {
  const payload = readJsonFile(workspacePath(WORKSPACE_DATA_FILE), {});
  return payload && payload.localStorage && typeof payload.localStorage === 'object'
    ? payload.localStorage
    : {};
});

function normalizePortableStorage(storage) {
  const portable = { ...storage };
  const normalizers = [
    ['notch-recordings', 'audioPath', RECORDINGS_DIR_NAME],
    ['notch-clip-history', 'imagePath', CLIP_IMAGES_DIR_NAME],
  ];
  for (const [storageKey, property, directory] of normalizers) {
    try {
      const rows = JSON.parse(portable[storageKey]);
      if (!Array.isArray(rows)) continue;
      portable[storageKey] = JSON.stringify(rows.map((row) => {
        if (!row || typeof row !== 'object' || !row[property]) return row;
        return { ...row, [property]: platformPolicy.portableMediaPath(directory, row[property]) };
      }));
    } catch (error) {}
  }
  return portable;
}

ipcMain.handle('workspace:save-data', (event, storage) => {
  if (!storage || typeof storage !== 'object' || Array.isArray(storage)) return false;
  const portableStorage = normalizePortableStorage(storage);
  const serialized = JSON.stringify(portableStorage);
  if (Buffer.byteLength(serialized) > 8 * 1024 * 1024) return false;
  const destination = workspacePath(WORKSPACE_DATA_FILE);
  if (!workspacePersistenceGate.shouldWrite(portableStorage, destination)) return true;
  const written = writeJsonFile(destination, {
    version: 1,
    updatedAt: Date.now(),
    localStorage: portableStorage,
  });
  if (written) workspacePersistenceGate.markWritten(portableStorage, destination);
  return written;
});
ipcMain.handle('workspace:open', () => shell.openPath(workspaceRoot()));
ipcMain.handle('workspace:choose', () => chooseWorkspaceFolder());

function getLayoutMetrics(display) {
  const d = display || getWindowDisplay();
  return {
    stripHeight: getCollapsedHeight(d), // 折叠黑条总高（= 菜单栏高 = 物理刘海高，不含唇边）
    menuBarHeight: getMenuBarHeight(d), // 折叠态菜单栏带高（折叠条上半部分被其拦截）
    chromeY: EXPANDED_CHROME_Y,
    tabSizes: TAB_SIZES,
  };
}

ipcMain.handle('window:metrics', () => {
  return getLayoutMetrics();
});

// Tab 仅改变内容；固定展开尺寸下不再触发原生窗口 resize。
ipcMain.handle('window:set-tab', (event, tab) => {
  currentTab = Object.prototype.hasOwnProperty.call(TAB_SIZES, tab) ? tab : 'home';
});

async function requestMacMediaAccess(mediaType) {
  if (process.platform !== 'darwin') return true;
  if (systemPreferences.getMediaAccessStatus(mediaType) === 'granted') return true;
  return mediaPermissionCoordinator.run({
    owner: mainWindow,
    // screen-saver 层级会压住 macOS 的 TCC 授权气泡。请求前临时降到普通层，
    // 并把应用激活，让“不允许 / 允许”确实处在可点击的最前方。
    activate: () => app.focus({ steal: true }),
    track: (delta) => {
      if (delta > 0 && mediaType === 'camera') mediaPermissionBatchHadCamera = true;
      mediaPermissionRequests = Math.max(0, mediaPermissionRequests + delta);
      if (delta >= 0 || mediaPermissionRequests > 0) return;
      const shouldCollapse = cameraBlurDeferred && mediaPermissionBatchHadCamera;
      mediaPermissionBatchHadCamera = false;
      cameraBlurDeferred = false;
      if (!shouldCollapse) return;
      const targetWindow = mainWindow;
      setTimeout(() => {
        if (
          mainWindow === targetWindow &&
          targetWindow &&
          !targetWindow.isDestroyed() &&
          !targetWindow.isFocused()
        ) {
          requestRendererCollapse();
        }
      }, 200);
    },
    request: () => systemPreferences.askForMediaAccess(mediaType),
  });
}

// macOS 渲染层 getUserMedia 不会自动弹 TCC 授权，必须由主进程申请摄像头/麦克风权限。
ipcMain.handle('media:camera', () => requestMacMediaAccess('camera'));
ipcMain.handle('media:microphone', () => requestMacMediaAccess('microphone'));

ipcMain.handle('tasks:recent', () => taskCompletionHistory);

// 快捷链接：URL 走外部浏览器（仅 http/https），本地路径走系统打开（仅绝对路径）
ipcMain.handle('shell:openExternal', (event, url) => {
  if (typeof url === 'string' && /^https?:\/\//i.test(url)) {
    return shell.openExternal(url);
  }
});

ipcMain.handle('shell:openPath', (event, p) => {
  if (typeof p === 'string' && path.isAbsolute(p)) {
    return shell.openPath(p);
  }
});

// 只放行固定的几个隐私面板，渲染层传来的值只能当作枚举的键来查，
// 绝不能拼进 URL：x-apple.systempreferences: 能打开任意设置面板。
const PRIVACY_SETTINGS_PANES = process.platform === 'win32' ? {
  microphone: 'ms-settings:privacy-microphone',
  camera: 'ms-settings:privacy-webcam',
} : {
  accessibility: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Accessibility',
  'screen-recording': 'x-apple.systempreferences:com.apple.preference.security?Privacy_ScreenCapture',
  microphone: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Microphone',
  camera: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Camera',
  reminders: 'x-apple.systempreferences:com.apple.preference.security?Privacy_Reminders',
};

ipcMain.handle('shell:open-privacy-settings', (event, pane) => {
  const target = PRIVACY_SETTINGS_PANES[String(pane || '')];
  if (!target) return false;
  shell.openExternal(target);
  return true;
});

// ============ 启动时的权限自检 ============
// DMG 装的是全新二进制，TCC 授权不会从开发版继承，而这几项缺失时的表现都是「静默失效」：
// 缺「屏幕录制」→ CGWindowList 照样返回窗口但标题全空，当前窗口看起来像真的没窗口；
// 缺「辅助功能」→ 枚举、聚焦窗口和汽水音乐发按键全部无效。
// 系统对前者根本不弹提示，所以只能由应用自己说，否则用户完全无从下手。
const PERMISSION_PROMPT_SKIP_FILE = 'permission-prompt-skipped';

// 先尊重系统的明确状态，尤其不能在 not-determined 时调用 desktopCapturer，
// 否则启动自检本身就会抢先弹出系统录屏框。只有系统报告 granted 时才通过
// 无缩略图的窗口标题做二次确认；未知状态 fail-open，等用户实际使用时再申请。
async function hasScreenRecordingAccess() {
  const policy = screenRecordingProbePolicy(systemPreferences.getMediaAccessStatus('screen'));
  if (!policy.inspectWindowTitles) return policy.hasAccess;
  try {
    const sources = await desktopCapturer.getSources({
      types: ['window'],
      thumbnailSize: { width: 0, height: 0 },
      fetchWindowIcons: false,
    });
    if (sources.length === 0) return true; // 拿不到源无法判定，不误报
    return sources.some((source) => String(source.name || '').trim().length > 0);
  } catch (error) {
    return true; // 探测本身失败时不打扰用户
  }
}

async function promptForMissingPermissions() {
  if (process.platform !== 'darwin') return;
  const skipFlag = path.join(app.getPath('userData'), PERMISSION_PROMPT_SKIP_FILE);
  if (fs.existsSync(skipFlag)) return;

  const missing = [];
  // 传 false 只查询不弹系统框：先把缺失项攒齐一次性告知，避免连弹两个系统对话框。
  if (!systemPreferences.isTrustedAccessibilityClient(false)) missing.push('accessibility');
  if (!await hasScreenRecordingAccess()) missing.push('screen-recording');
  if (missing.length === 0) return;

  const names = missing.map((key) => (key === 'accessibility' ? '辅助功能' : '屏幕录制'));
  const { response, checkboxChecked } = await dialog.showMessageBox({
    type: 'info',
    message: `叮做需要「${names.join('」和「')}」权限`,
    detail: [
      '缺少这些权限时，「当前窗口」会读不到任何窗口，汽水音乐的播放控制也不会生效。',
      '',
      '授权后需要重新启动叮做才会生效。',
      'ad-hoc 签名的应用每次重新打包都要重新授权一次，这是没有开发者账号分发的固有限制。',
    ].join('\n'),
    buttons: ['打开系统设置', '以后再说'],
    defaultId: 0,
    cancelId: 1,
    checkboxLabel: '不再提示',
    checkboxChecked: false,
  });

  if (checkboxChecked) {
    try { fs.writeFileSync(skipFlag, new Date().toISOString()); } catch (error) {}
  }
  if (response !== 0) return;

  // 顺带用 true 触发一次系统的辅助功能提示：这一步会把应用登记进系统设置的列表里，
  // 否则用户打开设置面板可能找不到叮做这一项、只能手动拖进去。
  if (missing.includes('accessibility')) systemPreferences.isTrustedAccessibilityClient(true);
  shell.openExternal(PRIVACY_SETTINGS_PANES[missing[0]]);
}

async function validatePublicHttpUrl(value) {
  let url;
  try {
    url = new URL(value);
  } catch (error) {
    return null;
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) return null;
  const hostname = url.hostname.toLowerCase();
  if (!hostname || hostname === 'localhost' || hostname.endsWith('.local')) return null;
  let addresses;
  try {
    addresses = await dns.promises.lookup(hostname, { all: true, verbatim: true });
  } catch (error) {
    return null;
  }
  if (!addresses.length || addresses.some((item) => isPrivateAddress(item.address))) return null;
  return url;
}

async function readResponseText(response) {
  if (!response.body) return '';
  const reader = response.body.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > LINK_FETCH_MAX_BYTES) {
      await reader.cancel();
      break;
    }
    chunks.push(Buffer.from(value));
  }
  return Buffer.concat(chunks).toString('utf8');
}

async function fetchFaviconDataUrl(pageUrl, html) {
  let candidate;
  try {
    const href = extractFaviconHref(html) || '/favicon.ico';
    candidate = await validatePublicHttpUrl(new URL(href, pageUrl).toString());
  } catch (error) {
    candidate = null;
  }
  if (!candidate) return '';
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 3500);
  try {
    const response = await fetch(candidate, { signal: controller.signal, redirect: 'error' });
    const type = String(response.headers.get('content-type') || '').split(';', 1)[0].toLowerCase();
    if (!response.ok || !type.startsWith('image/')) return '';
    const bytes = Buffer.from(await response.arrayBuffer());
    if (!bytes.length || bytes.length > 160 * 1024) return '';
    return `data:${type};base64,${bytes.toString('base64')}`;
  } catch (error) {
    return '';
  } finally {
    clearTimeout(timeout);
  }
}

async function enrichLinkMetadata(url, title) {
  const config = resolveLlmConfig();
  if (!config.apiKey || !config.model) return { title, category: '' };
  const endpoint = config.baseUrl.endsWith('/chat/completions')
    ? config.baseUrl
    : `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const safeEndpoint = await validatePublicHttpUrl(endpoint);
  if (!safeEndpoint) return { title, category: '' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), LINK_FETCH_TIMEOUT_MS);
  try {
    const response = await fetch(safeEndpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${config.apiKey}`,
        'Content-Type': 'application/json',
        'User-Agent': 'Dingdo/0.3 (+local bookmark organizer)',
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        ...(config.baseUrl.includes('deepseek.com') ? { thinking: { type: 'disabled' } } : {}),
        messages: [
          {
            role: 'system',
            content: '你是网址收藏夹整理器。只返回 JSON：{"title":"简洁中文名称","category":"短分类"}。分类应稳定、可复用，不超过 14 个字。',
          },
          { role: 'user', content: `URL: ${url}\n网页标题: ${title}` },
        ],
      }),
    });
    if (!response.ok) return { title, category: '' };
    const payload = await response.json();
    const content = payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
    const parsed = parseSmartLinkMetadata(content);
    if (!parsed) return { title, category: '' };
    return { title: parsed.title || title, category: parsed.category };
  } catch (error) {
    return { title, category: '' };
  } finally {
    clearTimeout(timeout);
  }
}

async function inspectLink(rawUrl) {
  let current = await validatePublicHttpUrl(rawUrl);
  if (!current) return { ok: false, error: 'invalid_or_private_url' };
  for (let redirectCount = 0; redirectCount <= LINK_FETCH_MAX_REDIRECTS; redirectCount++) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), LINK_FETCH_TIMEOUT_MS);
    let response;
    try {
      response = await fetch(current, {
        redirect: 'manual',
        signal: controller.signal,
        headers: {
          Accept: 'text/html,application/xhtml+xml;q=0.9,*/*;q=0.2',
          'User-Agent': 'Dingdo/0.3 (+local bookmark metadata)',
        },
      });
    } catch (error) {
      clearTimeout(timeout);
      // URL 已经过公网与协议校验；正文不可读不应阻止收藏，仍尝试抓站点根图标。
      const icon = await fetchFaviconDataUrl(current.toString(), '');
      return {
        ok: true,
        url: current.toString(),
        title: '未命名',
        category: '',
        icon,
        warning: error && error.name === 'AbortError' ? 'timeout' : 'fetch_failed',
      };
    }
    clearTimeout(timeout);

    if ([301, 302, 303, 307, 308].includes(response.status)) {
      const location = response.headers.get('location');
      if (!location || redirectCount >= LINK_FETCH_MAX_REDIRECTS) {
        return { ok: false, error: 'too_many_redirects' };
      }
      current = await validatePublicHttpUrl(new URL(location, current).toString());
      if (!current) return { ok: false, error: 'unsafe_redirect' };
      continue;
    }

    const contentType = String(response.headers.get('content-type') || '').toLowerCase();
    const fallback = current.hostname.replace(/^www\./, '');
    if (!response.ok || (!contentType.includes('text/html') && !contentType.includes('xhtml'))) {
      const [smart, icon] = await Promise.all([
        enrichLinkMetadata(current.toString(), fallback),
        fetchFaviconDataUrl(current.toString(), ''),
      ]);
      return { ok: true, url: current.toString(), title: smart.title || '未命名', category: smart.category, icon };
    }
    const html = await readResponseText(response);
    const pageTitle = extractPageTitle(html, fallback);
    const [smart, icon] = await Promise.all([
      enrichLinkMetadata(current.toString(), pageTitle),
      fetchFaviconDataUrl(current.toString(), html),
    ]);
    return { ok: true, url: current.toString(), title: smart.title, category: smart.category, icon };
  }
  return { ok: false, error: 'too_many_redirects' };
}

ipcMain.handle('links:inspect', (event, url) => inspectLink(url));

ipcMain.handle('smart:organize-material', async (event, payload) => {
  const config = resolveLlmConfig();
  const kind = payload && payload.kind === 'note' ? 'note' : 'material';
  const transcript = String(payload && payload.text || '').trim().slice(0, 8000);
  if (!transcript) return { ok: false, error: 'empty_text' };
  if (!config.apiKey || !config.model) return { ok: false, error: 'not_configured' };
  const endpoint = config.baseUrl.endsWith('/chat/completions')
    ? config.baseUrl
    : `${config.baseUrl.replace(/\/$/, '')}/chat/completions`;
  const safeEndpoint = await validatePublicHttpUrl(endpoint);
  if (!safeEndpoint) return { ok: false, error: 'invalid_endpoint' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 9000);
  try {
    const response = await fetch(safeEndpoint, {
      method: 'POST',
      signal: controller.signal,
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.1,
        response_format: { type: 'json_object' },
        ...(config.baseUrl.includes('deepseek.com') ? { thinking: { type: 'disabled' } } : {}),
        messages: [
          {
            role: 'system',
            content: kind === 'note'
              ? '你是中文笔记命名助手。理解整篇笔记后概括主题，禁止把正文首句直接当标题。只返回 JSON：{"title":"8到18字的具体标题","category":"2到8字的稳定分类"}。'
              : '你是中文个人资料库整理器。根据内容概括，不要照抄首句。只返回 JSON：{"title":"8到18字的具体名称","category":"2到8字的稳定分类"}。',
          },
          { role: 'user', content: kind === 'note' ? `请为以下笔记命名：\n\n${transcript}` : transcript },
        ],
      }),
    });
    if (!response.ok) return { ok: false, error: `http_${response.status}` };
    const result = await response.json();
    const content = result && result.choices && result.choices[0] && result.choices[0].message && result.choices[0].message.content;
    const metadata = parseSmartMaterialMetadata(content);
    return metadata && metadata.title ? { ok: true, ...metadata } : { ok: false, error: 'invalid_response' };
  } catch (error) {
    return { ok: false, error: error && error.name === 'AbortError' ? 'timeout' : 'request_failed' };
  } finally {
    clearTimeout(timeout);
  }
});

const WINDOWS_LIST_JXA = `
ObjC.import('AppKit');
ObjC.import('CoreGraphics');
ObjC.import('Foundation');
function run() {
  const rows = [];
  let candidates = 0;
  let titled = 0;
  const options = $.kCGWindowListOptionAll | $.kCGWindowListExcludeDesktopElements;
  const windowList = ObjC.castRefToObject(
    $.CGWindowListCopyWindowInfo(options, $.kCGNullWindowID)
  );
  const appPaths = {};
  for (let index = 0; index < Number(windowList.count); index++) {
    const info = windowList.objectAtIndex(index);
    const get = (key) => ObjC.unwrap(info.objectForKey($(key)));
    const layer = Number(get('kCGWindowLayer'));
    const pid = Number(get('kCGWindowOwnerPID'));
    const appName = String(get('kCGWindowOwnerName') || '').trim();
    const title = String(get('kCGWindowName') || '').replace(/\\s+/g, ' ').trim();
    const windowNumber = Number(get('kCGWindowNumber'));
    // 没有「屏幕录制」权限时 CGWindowList 仍会返回别的应用的窗口，只是 kCGWindowName
    // 一律为空，系统不报任何错。于是下面这句会把所有行丢掉、列表看起来像「真的没窗口」。
    // 统计候选数与其中有标题的条数，好让主进程区分这两种情况。
    if (layer === 0 && pid && appName && windowNumber) {
      candidates += 1;
      if (title) titled += 1;
    }
    if (layer !== 0 || !pid || !appName || !title || !windowNumber) continue;
    if (!Object.prototype.hasOwnProperty.call(appPaths, pid)) {
      const meta = { appPath: '', policy: -1 };
      try {
        const runningApp = $.NSRunningApplication.runningApplicationWithProcessIdentifier(pid);
        if (runningApp && !runningApp.isNil()) {
          meta.policy = Number(runningApp.activationPolicy);
          if (runningApp.bundleURL && !runningApp.bundleURL.isNil()) {
            meta.appPath = String(ObjC.unwrap(runningApp.bundleURL.path) || '');
          }
        }
      } catch (error) {}
      appPaths[pid] = meta;
    }
    const appMeta = appPaths[pid];
    // activationPolicy 2 = NSApplicationActivationPolicyProhibited：XPC 与系统辅助进程
    // （如 AuthenticationServicesHelper，bundle 是 .xpc 不是 .app）。它们在系统层面就
    // 不能被激活，列出来点了也不会有任何反应，属于纯粹的假窗口。
    // 注意不能用 kCGWindowIsOnscreen 过滤：真实窗口在其他 Space 或被遮挡时该字段也是
    // nil，实测微信 / Arc / Chrome / 飞书都会被误删。
    if (appMeta.policy === 2) continue;
    rows.push({ pid, appName, appPath: appMeta.appPath, title, windowIndex: index, windowNumber });
  }
  // candidates 是本可列出的窗口数，titled 是其中拿到标题的数量。
  // candidates > 0 而 titled === 0 时几乎一定是缺「屏幕录制」权限，不是真的没窗口。
  return JSON.stringify({ rows: rows, candidates: candidates, titled: titled });
}`;

const WINDOW_FOCUS_JXA = `
function run(argv) {
  const pid = Number(argv[0]);
  const wantedTitle = String(argv[1] || '');
  const fallbackIndex = Number(argv[2] || 0);
  const se = Application('System Events');
  const matches = se.applicationProcesses.whose({ unixId: pid })();
  if (!matches.length) return 'false';
  const process = matches[0];
  process.frontmost = true;
  delay(0.08);
  const windows = process.windows();
  let target = windows[fallbackIndex];
  for (let i = 0; i < windows.length; i++) {
    try {
      if (String(windows[i].name()) === wantedTitle) { target = windows[i]; break; }
    } catch (error) {}
  }
  if (target) {
    try { target.actions.byName('AXRaise').perform(); } catch (error) {}
  }
  try {
    const menuBarItems = process.menuBars[0].menuBarItems();
    let windowMenu = null;
    for (let i = 0; i < menuBarItems.length; i++) {
      const name = String(menuBarItems[i].name());
      if (name === 'Window' || name === '窗口') { windowMenu = menuBarItems[i]; break; }
    }
    if (windowMenu) {
      const items = windowMenu.menus[0].menuItems();
      for (let i = 0; i < items.length; i++) {
        if (String(items[i].name()) === wantedTitle) {
          items[i].click();
          break;
        }
      }
    }
  } catch (error) {}
  return 'true';
}`;

function runJxa(script, args = []) {
  return new Promise((resolve, reject) => {
    execFile(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', script, '--', ...args.map(String)],
      { timeout: 6000, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout) => error ? reject(error) : resolve(String(stdout || '').trim())
    );
  });
}

function waitForRemindersProcess(timeoutMs = 2500) {
  const startedAt = Date.now();
  return new Promise((resolve) => {
    const poll = () => {
      execFile('/usr/bin/pgrep', ['-x', 'Reminders'], { timeout: 1500 }, (error, stdout) => {
        if (!error && String(stdout || '').trim()) {
          resolve(true);
          return;
        }
        if (Date.now() - startedAt >= timeoutMs) {
          resolve(false);
          return;
        }
        setTimeout(poll, 150);
      });
    };
    poll();
  });
}

async function ensureRemindersRunning() {
  if (process.platform !== 'darwin') return false;
  if (remindersEnsurePromise) return remindersEnsurePromise;
  remindersEnsurePromise = (async () => {
    const alreadyRunning = await new Promise((resolve) => {
      execFile('/usr/bin/pgrep', ['-x', 'Reminders'], { timeout: 1500 }, (error, stdout) => {
        resolve(!error && Boolean(String(stdout || '').trim()));
      });
    });
    if (alreadyRunning) return true;
    const launched = await new Promise((resolve) => {
      execFile('/usr/bin/open', ['-g', '-j', '-a', 'Reminders'], { timeout: 5000 }, (error) => {
        resolve(!error);
      });
    });
    if (!launched) return false;
    return waitForRemindersProcess();
  })();
  try {
    return await remindersEnsurePromise;
  } finally {
    remindersEnsurePromise = null;
  }
}

async function runRemindersJxa(script, args = []) {
  await ensureRemindersRunning();
  try {
    return await runJxa(script, args);
  } catch (error) {
    await new Promise((resolve) => setTimeout(resolve, 400));
    return runJxa(script, args);
  }
}

const REMINDERS_LISTS_JXA = `
function run() {
  const app = Application('Reminders');
  const lists = app.lists();
  return JSON.stringify(lists.map((list) => ({
    id: String(list.id()),
    name: String(list.name()),
  })));
}`;

const REMINDERS_ITEMS_JXA = `
function run(argv) {
  const wanted = String(argv[0] || '');
  const app = Application('Reminders');
  const list = app.lists().find((item) => String(item.id()) === wanted);
  if (!list) return JSON.stringify({ ok: false, error: 'list_not_found' });
  const reminders = list.reminders.whose({ completed: false })();
  const rows = reminders.map((item) => {
    const due = item.dueDate();
    const created = item.creationDate();
    return {
      id: String(item.id()),
      name: String(item.name() || ''),
      body: item.body() == null ? '' : String(item.body()),
      completed: item.completed() === true,
      priority: Number(item.priority() || 0),
      due: due ? due.toISOString() : '',
      createdAt: created ? created.toISOString() : '',
    };
  });
  return JSON.stringify({ ok: true, items: rows });
}`;

function reminderPriorityLabel(value) {
  const priority = Number(value) || 0;
  if (priority >= 1 && priority <= 4) return 'urgent';
  if (priority === 5) return 'high';
  if (priority >= 6 && priority <= 9) return 'medium';
  return 'none';
}

ipcMain.handle('reminders:lists', async () => {
  if (process.platform !== 'darwin') return { ok: false, error: 'unsupported' };
  try {
    const raw = await runRemindersJxa(REMINDERS_LISTS_JXA);
    return { ok: true, lists: JSON.parse(raw || '[]') };
  } catch (error) {
    return { ok: false, error: 'permission_or_access_failed' };
  }
});

ipcMain.handle('reminders:items', async (event, listId) => {
  if (process.platform !== 'darwin') return { ok: false, error: 'unsupported' };
  const id = String(listId || '').trim();
  if (!id) return { ok: false, error: 'invalid_list' };
  try {
    const raw = await runRemindersJxa(REMINDERS_ITEMS_JXA, [id]);
    const parsed = JSON.parse(raw || '{}');
    if (!parsed?.ok) return { ok: false, error: parsed?.error || 'read_failed' };
    return {
      ok: true,
      items: (Array.isArray(parsed.items) ? parsed.items : []).map((item) => ({
        id: String(item.id || ''),
        name: String(item.name || '').slice(0, 200),
        body: String(item.body || '').slice(0, 10000),
        completed: item.completed === true,
        priority: reminderPriorityLabel(item.priority),
        due: String(item.due || ''),
        createdAt: String(item.createdAt || ''),
      })).filter((item) => item.id && item.name),
    };
  } catch (error) {
    return { ok: false, error: 'permission_or_access_failed' };
  }
});

async function scanCurrentWindows() {
  if (process.platform !== 'darwin') return { items: [], error: 'unsupported' };
  try {
    const raw = await runJxa(WINDOWS_LIST_JXA);
    const parsed = JSON.parse(raw || '{}');
    // 兼容旧格式（裸数组），新格式是 { rows, candidates, titled }。
    const payload = Array.isArray(parsed)
      ? { rows: parsed, candidates: parsed.length, titled: parsed.length }
      : parsed;
    const rows = normalizeWindowRows(payload.rows || []).filter((item) => item.pid !== process.pid);
    // 有候选窗口却一个标题都读不到 = 缺「屏幕录制」权限。macOS 10.15 起读取其他应用的
    // 窗口标题需要该权限，系统不会报错也不会弹提示，只是静默返回空标题，
    // 结果界面上只剩一句「没有读取到可切换窗口」，把权限问题伪装成了「真的没窗口」。
    if (rows.length === 0 && Number(payload.candidates) > 0 && Number(payload.titled) === 0) {
      windowScanCache = new Map();
      return { items: [], error: 'screen_recording_permission_required' };
    }
    const appPaths = [...new Set(rows.map((item) => item.appPath).filter(Boolean))];
    await Promise.all(appPaths.map(async (appPath) => {
      if (windowIconCache.has(appPath)) return;
      const icon = await withTimeout(readWindowAppIcon(appPath), 3500, null);
      windowIconCache.set(appPath, icon);
    }));
    rows.forEach((item) => {
      item.icon = item.appPath ? windowIconCache.get(item.appPath) || null : null;
    });
    windowScanCache = new Map(rows.map((item) => [item.id, item]));
    return { items: rows, error: null };
  } catch (error) {
    windowScanCache = new Map();
    return { items: [], error: 'accessibility_permission_required' };
  }
}

ipcMain.handle('windows:list', async () => {
  return scanCurrentWindows();
});

ipcMain.handle('windows:focus', async (event, windowId) => {
  const target = windowScanCache.get(windowId);
  if (!target || process.platform !== 'darwin') return false;
  try {
    return (await runJxa(WINDOW_FOCUS_JXA, [target.pid, target.title, target.windowIndex])) === 'true';
  } catch (error) {
    return false;
  }
});

function taskWindowMatchScore(notification, target) {
  const project = String(notification && notification.project || '').trim().toLocaleLowerCase();
  const title = String(target && target.title || '').trim().toLocaleLowerCase();
  const appName = String(target && target.appName || '').trim().toLocaleLowerCase();
  if (!project || !title) return 0;
  if (title === project) return 100;
  if (title.startsWith(`${project} `) || title.startsWith(`${project} —`) || title.startsWith(`${project} -`)) return 90;
  if (title.includes(project)) return 75;
  if (project.includes(appName) && appName) return 25;
  return 0;
}

async function activateTodoNotification(notification) {
  if (!notification?.taskId || !mainWindow || mainWindow.isDestroyed()) return false;
  hideWhenCollapsed = false;
  repositionWindow(getTargetDisplay());
  if (!mainWindow.isVisible()) mainWindow.show();
  mainWindow.focus();
  mainWindow.webContents.send('app:open-todo');
  mainWindow.webContents.send('todo:open-task', {
    taskId: notification.taskId,
    reminderId: notification.reminderId,
  });
  return true;
}

async function activateActiveTaskNotification(eventId = null) {
  const notification = activeTaskNotification;
  if (!notification || (eventId && notification.eventId !== eventId)) return false;
  if (notification.source === 'todo') {
    if (!await activateTodoNotification(notification)) return false;
    beginTaskNotificationDismiss();
    return true;
  }
  const result = await scanCurrentWindows();
  const target = (result.items || [])
    .map((item) => ({ item, score: taskWindowMatchScore(notification, item) }))
    .filter((candidate) => candidate.score > 0)
    .sort((a, b) => b.score - a.score)[0]?.item;
  if (!target) return false;
  try {
    const focused = (await runJxa(WINDOW_FOCUS_JXA, [target.pid, target.title, target.windowIndex])) === 'true';
    if (focused) beginTaskNotificationDismiss();
    return focused;
  } catch (error) {
    return false;
  }
}

ipcMain.handle('task-notification:activate', async (event, eventId) => {
  if (!notificationWindow || notificationWindow.isDestroyed() || event.sender !== notificationWindow.webContents) return false;
  return activateActiveTaskNotification(eventId);
});

// 当前窗口模块仍需要安全读取本机应用图标。
// 优先直接从 .icns 提取内嵌 PNG；失败时通过独立 JXA 进程向 NSWorkspace 取系统图标。
// 不直接调用 app.getFileIcon：它曾在部分 .app 上触发 Electron 内部 FATAL Check，
// 独立进程即使失败也不会带崩主进程。
const PNG_SIG = Buffer.from([0x89, 0x50, 0x4e, 0x47]);
// icns 内 PNG 块按"贴近 48px 网格展示"优先：128 → 256 → 64@2x …
const ICNS_PREF = ['ic07', 'ic12', 'ic08', 'ic11', 'ic13', 'ic09', 'ic14', 'ic05', 'ic04'];

function extractPngFromIcns(buf) {
  if (buf.length < 8 || buf.toString('ascii', 0, 4) !== 'icns') return null;
  const candidates = [];
  let off = 8;
  while (off + 8 <= buf.length) {
    const type = buf.toString('ascii', off, off + 4);
    const len = buf.readUInt32BE(off + 4);
    if (len < 8 || off + len > buf.length) break;
    const data = buf.subarray(off + 8, off + len);
    if (data.length > 8 && data.subarray(0, 4).equals(PNG_SIG)) {
      candidates.push({ type, data });
    }
    off += len;
  }
  if (!candidates.length) return null; // 老式 RLE 图标 → 交给渲染层首字母兜底
  candidates.sort((a, b) => {
    const ia = ICNS_PREF.indexOf(a.type);
    const ib = ICNS_PREF.indexOf(b.type);
    return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
  });
  return candidates[0].data;
}

async function readEmbeddedAppIcon(appPath) {
  try {
    const resDir = path.join(appPath, 'Contents', 'Resources');
    const files = await fs.promises.readdir(resDir);
    const icns = files.filter((f) => f.toLowerCase().endsWith('.icns'));
    if (!icns.length) return null;
    // 优先 AppIcon.icns，其次名字含 app/icon 的，避免选中文档类型图标
    const score = (n) => {
      const s = n.toLowerCase();
      if (s === 'appicon.icns') return 0;
      if (s.includes('app')) return 1;
      if (s.includes('icon')) return 2;
      return 3;
    };
    icns.sort((a, b) => score(a) - score(b) || a.length - b.length);
    const buf = await fs.promises.readFile(path.join(resDir, icns[0]));
    const png = extractPngFromIcns(buf);
    return png ? `data:image/png;base64,${png.toString('base64')}` : null;
  } catch (e) {
    return null; // 单个应用读不到图标不影响整体
  }
}

const SYSTEM_ICON_JXA = `
ObjC.import('AppKit');
function run(argv) {
  const size = 96;
  const source = $.NSWorkspace.sharedWorkspace.iconForFile(argv[0]);
  const image = $.NSImage.alloc.initWithSize($.NSMakeSize(size, size));
  image.lockFocus;
  source.drawInRectFromRectOperationFraction(
    $.NSMakeRect(0, 0, size, size),
    $.NSZeroRect,
    $.NSCompositingOperationSourceOver,
    1
  );
  image.unlockFocus;
  const rep = $.NSBitmapImageRep.imageRepWithData(image.TIFFRepresentation);
  const data = rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $({}));
  return ObjC.unwrap(data.base64EncodedStringWithOptions(0));
}`;

function readSystemAppIconNow(appPath) {
  return new Promise((resolve) => {
    execFile(
      '/usr/bin/osascript',
      ['-l', 'JavaScript', '-e', SYSTEM_ICON_JXA, appPath],
      { timeout: 4000, maxBuffer: 2 * 1024 * 1024 },
      (error, stdout) => {
        const base64 = typeof stdout === 'string' ? stdout.trim() : '';
        if (error || !base64 || !/^[A-Za-z0-9+/=]+$/.test(base64)) {
          resolve(null);
          return;
        }
        resolve(`data:image/png;base64,${base64}`);
      }
    );
  });
}

const SYSTEM_ICON_CONCURRENCY = 2;
const SYSTEM_ICON_QUEUE_TIMEOUT_MS = 10000;
let systemIconActive = 0;
const systemIconQueue = [];

function pumpSystemIconQueue() {
  while (systemIconActive < SYSTEM_ICON_CONCURRENCY && systemIconQueue.length) {
    const job = systemIconQueue.shift();
    if (job.cancelled) continue;
    systemIconActive++;
    readSystemAppIconNow(job.appPath)
      .then(job.finish, () => job.finish(null))
      .finally(() => {
        systemIconActive--;
        pumpSystemIconQueue();
      });
  }
}

function readSystemAppIcon(appPath) {
  if (process.platform !== 'darwin') return Promise.resolve(null);
  return new Promise((resolve) => {
    const job = {
      appPath,
      cancelled: false,
      settled: false,
      timer: null,
      finish(value) {
        if (job.settled) return;
        job.settled = true;
        if (job.timer) clearTimeout(job.timer);
        resolve(value);
      },
    };
    job.timer = setTimeout(() => {
      job.cancelled = true;
      job.finish(null);
    }, SYSTEM_ICON_QUEUE_TIMEOUT_MS);
    systemIconQueue.push(job);
    pumpSystemIconQueue();
  });
}

async function readWindowAppIcon(appPath) {
  const systemIcon = await withTimeout(readSystemAppIcon(appPath), 2800, null);
  return systemIcon || readEmbeddedAppIcon(appPath);
}

function withTimeout(promise, ms, fallback) {
  return Promise.race([
    promise,
    new Promise((resolve) => setTimeout(() => resolve(fallback), ms)),
  ]);
}

const FRONTMOST_APP_JXA = `
ObjC.import('AppKit');
function run() {
  const app = $.NSWorkspace.sharedWorkspace.frontmostApplication;
  if (!app) return '{}';
  return JSON.stringify({
    name: ObjC.unwrap(app.localizedName) || '',
    bundleId: ObjC.unwrap(app.bundleIdentifier) || '',
    path: app.bundleURL ? (ObjC.unwrap(app.bundleURL.path) || '') : ''
  });
}`;

const PASTE_TO_APP_JXA = `
ObjC.import('AppKit');
function run(argv) {
  const bundleId = String(argv[0] || '');
  if (!bundleId) return 'missing';
  const apps = $.NSRunningApplication.runningApplicationsWithBundleIdentifier(bundleId);
  if (!apps || apps.count === 0) return 'missing';
  apps.objectAtIndex(0).activateWithOptions($.NSApplicationActivateIgnoringOtherApps);
  delay(0.18);
  Application('System Events').keystroke('v', { using: 'command down' });
  return 'ok';
}`;

function readFrontmostApp() {
  if (!PLATFORM_CAPABILITIES.automaticPaste) return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile('/usr/bin/osascript', ['-l', 'JavaScript', '-e', FRONTMOST_APP_JXA], { timeout: 2200 }, (error, stdout) => {
      if (error) return resolve(null);
      try {
        const value = JSON.parse(String(stdout || '').trim());
        resolve(value && value.path ? value : null);
      } catch (parseError) {
        resolve(null);
      }
    });
  });
}

async function rememberPasteTarget() {
  const current = await readFrontmostApp();
  if (current && ![
    'com.github.Electron',
    'com.vibecoding.notch-todo',
    'io.github.zxc19950223.dingdo',
  ].includes(current.bundleId)) {
    previousPasteTarget = current;
  }
  return previousPasteTarget;
}

ipcMain.handle('mirror:get-image', () => mirrorImageDataUrl());
ipcMain.handle('mirror:choose-image', () => chooseMirrorImage());

function getCredentialsVaultPath() {
  return path.join(app.getPath('userData'), CREDENTIALS_VAULT_FILE);
}

function readCredentialsVault() {
  if (!safeStorage.isEncryptionAvailable()) return [];
  try {
    const envelope = JSON.parse(fs.readFileSync(getCredentialsVaultPath(), 'utf8'));
    const decoded = safeStorage.decryptString(Buffer.from(String(envelope.payload || ''), 'base64'));
    const rows = JSON.parse(decoded);
    return Array.isArray(rows) ? rows.map((item) => normalizeCredentialInput(item, item && item.id, item && item.createdAt)).filter(Boolean) : [];
  } catch (error) {
    return [];
  }
}

function writeCredentialsVault(rows) {
  if (!safeStorage.isEncryptionAvailable()) return false;
  const payload = safeStorage.encryptString(JSON.stringify(rows)).toString('base64');
  const vaultPath = getCredentialsVaultPath();
  const temporaryPath = `${vaultPath}.${process.pid}.tmp`;
  try {
    fs.writeFileSync(temporaryPath, JSON.stringify({ version: 1, payload }), { mode: 0o600 });
    fs.renameSync(temporaryPath, vaultPath);
    return true;
  } catch (error) {
    try { fs.unlinkSync(temporaryPath); } catch (unlinkError) {}
    return false;
  }
}

function publicCredential(item) {
  return {
    id: item.id,
    service: item.service,
    account: item.account,
    passwordMask: '**********',
    createdAt: item.createdAt,
  };
}

ipcMain.handle('credentials:list', () => ({
  ok: safeStorage.isEncryptionAvailable(),
  secureStorage: safeStorage.isEncryptionAvailable(),
  items: readCredentialsVault().map(publicCredential),
}));

ipcMain.handle('credentials:get', (event, id) => {
  const item = readCredentialsVault().find((row) => row.id === String(id || ''));
  return item ? { ok: true, item: { ...item } } : { ok: false, error: 'not_found' };
});

ipcMain.handle('credentials:save', (event, payload) => {
  if (!safeStorage.isEncryptionAvailable()) return { ok: false, error: 'secure_storage_unavailable' };
  const rows = readCredentialsVault();
  const existing = payload && payload.id ? rows.find((item) => item.id === payload.id) : null;
  const normalized = normalizeCredentialInput(
    existing && !String(payload && payload.password || '') ? { ...payload, password: existing.password } : payload,
    existing ? existing.id : crypto.randomUUID(),
    existing ? existing.createdAt : Date.now()
  );
  if (!normalized) return { ok: false, error: 'invalid_credential' };
  const next = existing
    ? rows.map((item) => item.id === existing.id ? normalized : item)
    : [normalized, ...rows];
  return writeCredentialsVault(next)
    ? { ok: true, item: publicCredential(normalized) }
    : { ok: false, error: 'save_failed' };
});

ipcMain.handle('credentials:delete-many', (event, ids) => {
  const targets = new Set(Array.isArray(ids) ? ids.map(String) : []);
  if (!targets.size) return { ok: true, deleted: 0 };
  const rows = readCredentialsVault();
  const next = rows.filter((item) => !targets.has(item.id));
  if (!writeCredentialsVault(next)) return { ok: false, error: 'save_failed' };
  return { ok: true, deleted: rows.length - next.length };
});

ipcMain.handle('credentials:copy', async (event, payload) => {
  const id = String(payload && payload.id || '');
  const field = payload && payload.field === 'password' ? 'password' : payload && payload.field === 'account' ? 'account' : '';
  if (!id || !field) return false;
  const item = readCredentialsVault().find((row) => row.id === id);
  if (!item) return false;
  const value = item[field];
  await clipboard.writeText(value);
  if (field === 'password') {
    setTimeout(() => {
      void clipboard.readText()
        .then((currentValue) => {
          if (currentValue === value) return clipboard.clear();
          return undefined;
        })
        .catch(() => {});
    }, 60_000).unref?.();
  }
  return true;
});

function sodaMusicRunning() {
  return new Promise((resolve) => {
    execFile('/usr/bin/pgrep', ['-f', '^/Applications/汽水音乐\\.app/Contents/MacOS/汽水音乐$'], { timeout: 1500 }, (error) => resolve(!error));
  });
}

function launchSodaMusic() {
  return new Promise((resolve) => {
    const cleanEnvironment = { ...process.env };
    delete cleanEnvironment.ELECTRON_RUN_AS_NODE;
    cleanEnvironment.XPC_SERVICE_NAME = '0';
    execFile(
      '/usr/bin/open',
      [SODA_MUSIC_APP],
      { timeout: 4000, env: cleanEnvironment },
      (error) => resolve(!error)
    );
  });
}

const SODA_SHORTCUT_JXA = `
function run(argv) {
  const keyCode = Number(argv[0]);
  const usesCommand = String(argv[1] || '') === '1';
  const dismissOverlays = String(argv[2] || '') === '1';
  const processes = Application('System Events').applicationProcesses.whose({ bundleIdentifier: 'com.soda.music' })();
  if (!processes.length) return 'missing';
  processes[0].frontmost = true;
  delay(0.35);
  const systemEvents = Application('System Events');
  if (!Number.isFinite(keyCode)) return 'invalid';
  if (dismissOverlays) {
    systemEvents.keyCode(53);
    delay(0.15);
  }
  if (usesCommand) systemEvents.keyCode(keyCode, { using: 'command down' });
  else systemEvents.keyCode(keyCode);
  return 'ok';
}`;

async function sendSodaShortcut(action) {
  if (process.platform !== 'darwin') return { ok: false, error: 'unsupported' };
  if (!systemPreferences.isTrustedAccessibilityClient(true)) {
    return { ok: false, error: 'accessibility_permission_required' };
  }
  const shortcut = sodaShortcutSpec(action);
  if (!shortcut) return { ok: false, error: 'invalid_action' };
  try {
    const result = await runJxa(SODA_SHORTCUT_JXA, [
      shortcut.keyCode,
      shortcut.command ? '1' : '0',
      shortcut.dismissOverlays ? '1' : '0',
    ]);
    return result === 'ok' ? { ok: true } : { ok: false, error: 'soda_control_failed' };
  } catch (error) {
    console.warn('[music] failed to send Soda Music shortcut', error && error.message || error);
    return { ok: false, error: 'soda_control_failed' };
  }
}

async function getBrowserMediaStatus(enabled) {
  if (!enabled) return null;
  const now = Date.now();
  if (now - browserMediaCache.checkedAt < 2500) return browserMediaCache.value;
  if (browserMediaPending) return browserMediaPending;
  browserMediaPending = detectBrowserMedia()
    .then((value) => {
      browserMediaCache = { value, checkedAt: Date.now() };
      return value;
    })
    .finally(() => {
      browserMediaPending = null;
    });
  return browserMediaPending;
}

ipcMain.handle('music:status', async (event, options = {}) => {
  let status = await mediaSessionService.getStatus();
  let browserOnly = false;
  if (!status.active && options.browserFallback !== false) {
    const browserMedia = await getBrowserMediaStatus(true);
    if (browserMedia) {
      status = {
        ...status,
        active: true,
        playing: true,
        appName: browserMedia.browser,
        title: browserMedia.title,
        artist: browserMedia.artist || '',
        album: browserMedia.album || '',
        duration: Number(browserMedia.duration) || 0,
        elapsed: Number(browserMedia.elapsed) || 0,
        playbackRate: 1,
        browserRestricted: browserMedia.restricted === true,
      };
      browserOnly = true;
    }
  }
  let icon = null;
  if (status.appPath) {
    if (!mediaIconCache.has(status.appPath)) {
      mediaIconCache.set(status.appPath, await readSystemAppIconNow(status.appPath));
    }
    icon = mediaIconCache.get(status.appPath);
  }
  return {
    installed: mediaSessionService.isAvailable(),
    running: status.active,
    sessionActive: status.active,
    playing: status.playing,
    title: status.title,
    artist: status.artist,
    album: status.album,
    duration: status.duration,
    elapsed: status.elapsed,
    playbackRate: status.playbackRate,
    volume: status.volume,
    source: status.appName,
    bundleId: status.bundleId,
    icon,
    artwork: status.artwork,
    browserOnly,
    browserRestricted: status.browserRestricted === true,
    controllable: !browserOnly,
  };
});

ipcMain.handle('music:activate', async () => {
  return mediaSessionService.activateCurrentPlayer();
});

ipcMain.handle('music:volume', async (event, volume) => {
  return mediaSessionService.setSystemVolume(volume);
});

ipcMain.handle('music:seek', async (event, positionSeconds) => {
  const current = await mediaSessionService.getStatus();
  if (!current.active) return { ok: false, error: 'no_active_session' };
  return mediaSessionService.seek(positionSeconds);
});

ipcMain.handle('music:control', async (event, action) => {
  if (!mediaSessionService.isAvailable()) return { ok: false, error: 'unsupported' };
  const current = await mediaSessionService.getStatus();
  if (!current.active) return { ok: false, error: 'no_active_session' };
  // 部分播放器（实测网易云）忽略独立的 Play/Pause 命令，只响应系统
  // TogglePlayPause。当前界面使用的是播放/暂停二态按钮，因此统一走 toggle。
  const controlAction = action === 'play' || action === 'pause' ? 'toggle' : action;
  const result = await mediaSessionService.control(controlAction);
  if (!result.ok) return result;
  return {
    ok: true,
    playing: result.status.playing,
    status: result.status,
  };
});

// ============ 百炼实时语音转写 ============
function getTranscriptionSettingsPath() {
  return path.join(app.getPath('userData'), TRANSCRIPTION_SETTINGS_FILE);
}

function readStoredTranscriptionSettings() {
  const currentPath = getTranscriptionSettingsPath();
  const legacyPath = path.join(app.getPath('appData'), 'notch-todo', TRANSCRIPTION_SETTINGS_FILE);
  const readSettings = (settingsPath) => {
    try {
      const value = JSON.parse(fs.readFileSync(settingsPath, 'utf8'));
      return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
    } catch (error) {
      return {};
    }
  };
  const current = readSettings(currentPath);
  const legacy = currentPath === legacyPath ? {} : readSettings(legacyPath);
  const selected = selectTranscriptionSettings(current, legacy);
  if (!Object.keys(current).length && Object.keys(selected).length && currentPath !== legacyPath) {
    try {
      fs.mkdirSync(path.dirname(currentPath), { recursive: true });
      fs.writeFileSync(currentPath, JSON.stringify(selected), { mode: 0o600 });
    } catch (error) {
      // 迁移失败时仍从旧目录读取，避免已有密钥突然失效。
    }
  }
  return selected;
}

function decryptStoredApiKey(settings) {
  const environmentKey = String(process.env.DASHSCOPE_API_KEY || '').trim();
  if (environmentKey) return environmentKey;
  return decryptStoredSecret(settings.encryptedApiKey).trim();
}

function decryptStoredSecret(value) {
  if (!value || !safeStorage.isEncryptionAvailable()) return '';
  try {
    return safeStorage.decryptString(Buffer.from(String(value), 'base64'));
  } catch (error) {
    return '';
  }
}

function resolveLlmConfig() {
  const settings = readStoredTranscriptionSettings();
  return {
    apiKey: String(process.env.NOTCH_LLM_API_KEY || decryptStoredSecret(settings.encryptedLlmApiKey)).trim(),
    baseUrl: String(settings.llmBaseUrl || 'https://api.deepseek.com').trim(),
    model: String(settings.llmModel || 'deepseek-v4-flash').trim(),
  };
}

function resolveTranscriptionConfig() {
  const settings = readStoredTranscriptionSettings();
  const environmentWorkspace = String(process.env.DASHSCOPE_WORKSPACE_ID || process.env.DASHSCOPE_WORKSPACE || '').trim();
  const environmentRegion = String(process.env.DASHSCOPE_REGION || '').trim().toLowerCase();
  const region = ['beijing', 'singapore'].includes(environmentRegion)
    ? environmentRegion
    : ['beijing', 'singapore'].includes(settings.region) ? settings.region : 'beijing';
  const workspaceId = (environmentWorkspace || String(settings.workspaceId || '').trim()).slice(0, 128);
  return {
    apiKey: decryptStoredApiKey(settings),
    workspaceId: /^[A-Za-z0-9_-]{0,128}$/.test(workspaceId) ? workspaceId : '',
    region,
  };
}

function publicTranscriptionConfig() {
  const config = resolveTranscriptionConfig();
  const llmConfig = resolveLlmConfig();
  const settings = readStoredTranscriptionSettings();
  return {
    configured: Boolean(config.apiKey),
    asrNeedsReentry: Boolean(settings.encryptedApiKey && !config.apiKey),
    workspaceId: config.workspaceId,
    region: config.region,
    provider: 'qwen3-asr-flash-realtime',
    secureStorage: safeStorage.isEncryptionAvailable(),
    llmConfigured: Boolean(llmConfig.apiKey),
    llmNeedsReentry: Boolean(settings.encryptedLlmApiKey && !llmConfig.apiKey),
    llmBaseUrl: String(settings.llmBaseUrl || 'https://api.deepseek.com'),
    llmModel: String(settings.llmModel || 'deepseek-v4-flash'),
  };
}

function transcriptionUrl(config) {
  const host = config.workspaceId
    ? config.region === 'singapore'
      ? `${config.workspaceId}.ap-southeast-1.maas.aliyuncs.com`
      : `${config.workspaceId}.cn-beijing.maas.aliyuncs.com`
    : config.region === 'singapore'
      ? 'dashscope-intl.aliyuncs.com'
      : 'dashscope.aliyuncs.com';
  return `wss://${host}/api-ws/v1/realtime?model=${TRANSCRIPTION_MODEL}&heartbeat=true`;
}

function transcriptionEventId() {
  return `event_${crypto.randomUUID().replace(/-/g, '')}`;
}

function emitTranscription(session, payload) {
  if (session.sender && !session.sender.isDestroyed()) {
    session.sender.send('transcription:event', payload);
  }
}

function sessionTranscript(session) {
  return [...session.finalSegments, session.interim].filter(Boolean).join(' ').trim();
}

function closeTranscriptionSession(session, result = {}) {
  if (!session || session.closed) return;
  session.closed = true;
  clearTimeout(session.connectTimer);
  clearTimeout(session.finishTimer);
  clearTimeout(session.retryTimer);
  clearTimeout(session.heartbeatTimer);
  if (transcriptionSessions.get(session.senderId) === session) transcriptionSessions.delete(session.senderId);
  session.settleStart?.({ ok: false, error: result.error || 'connection_closed' });
  session.audioQueue = [];
  try { session.socket?.terminate(); } catch (error) {}
  if (session.finishResolve) {
    session.finishResolve({
      ok: result.ok !== false,
      transcript: sessionTranscript(session),
      error: result.error || null,
    });
    session.finishResolve = null;
  }
}

function handleTranscriptionMessage(session, raw) {
  let message;
  try { message = JSON.parse(String(raw)); } catch (error) { return; }
  if (message.type === 'session.updated') {
    session.ready = true;
    session.retryCount = 0;
    session.lastError = '';
    clearTimeout(session.connectTimer);
    session.settleStart({ ok: true });
    emitTranscription(session, { type: 'status', status: 'connected' });
    flushTranscriptionAudio(session);
    return;
  }
  if (message.type === 'conversation.item.input_audio_transcription.text') {
    session.interim = `${String(message.text || '').trim()}${String(message.stash || '').trim()}`;
    emitTranscription(session, {
      type: 'transcript',
      final: session.finalSegments.join(' ').trim(),
      interim: session.interim,
    });
    return;
  }
  if (message.type === 'conversation.item.input_audio_transcription.completed') {
    const transcript = String(message.transcript || '').trim();
    if (transcript && (!message.item_id || !session.completedItems.has(message.item_id))) {
      session.finalSegments.push(transcript);
      if (message.item_id) session.completedItems.add(message.item_id);
    }
    session.interim = '';
    emitTranscription(session, {
      type: 'transcript',
      final: session.finalSegments.join(' ').trim(),
      interim: '',
    });
    return;
  }
  if (message.type === 'error' || message.type === 'conversation.item.input_audio_transcription.failed') {
    const details = message.error && message.error.message || '实时转写服务返回错误';
    reconnectTranscription(session, details);
    return;
  }
  if (message.type === 'session.finished') {
    if (session.finishResolve) closeTranscriptionSession(session, { ok: !session.audioGap, error: session.audioGap ? 'audio_gap' : null });
    else reconnectTranscription(session, 'session_finished');
  }
}

function reconnectTranscription(session, error) {
  if (session.closed || session.retryTimer) return;
  session.lastError = error;
  session.ready = false;
  clearTimeout(session.connectTimer);
  clearTimeout(session.heartbeatTimer);
  const socket = session.socket;
  session.socket = null; // Ignore late close/error/transcript events from the old connection.
  try { socket?.terminate(); } catch (ignored) {}
  if (session.finishResolve) {
    closeTranscriptionSession(session, { ok: false, error });
    return;
  }
  // Preserve the last partial sentence when the server can no longer finalize it.
  if (session.interim) session.finalSegments.push(session.interim);
  session.interim = '';
  emitTranscription(session, { type: 'transcript', final: sessionTranscript(session), interim: '' });
  if (session.retryCount >= 5) {
    emitTranscription(session, { type: 'error', message: error });
    closeTranscriptionSession(session, { ok: false, error });
    return;
  }
  emitTranscription(session, { type: 'status', status: 'reconnecting' });
  const delay = Math.min(1000 * 2 ** session.retryCount++, 15000);
  session.retryTimer = setTimeout(() => {
    session.retryTimer = null;
    connectTranscriptionSocket(session);
  }, delay);
}

function flushTranscriptionAudio(session) {
  while (session.ready && session.socket?.readyState === WebSocket.OPEN && session.audioQueue.length) {
    const buffer = session.audioQueue[0];
    // Bound ws's own outgoing queue as well as our reconnect buffer.
    if (session.socket.bufferedAmount > 16000 * 2 * 30) {
      reconnectTranscription(session, 'audio_backpressure');
      return;
    }
    try {
      session.socket.send(JSON.stringify({
        event_id: transcriptionEventId(), type: 'input_audio_buffer.append', audio: buffer.toString('base64'),
      }));
    } catch (error) {
      reconnectTranscription(session, 'audio_send_failed');
      return;
    }
    session.audioQueue.shift();
    session.queuedBytes -= buffer.length;
  }
}

function connectTranscriptionSocket(session) {
  if (session.closed) return;
  const socket = new WebSocket(transcriptionUrl(session.config), { headers: session.headers });
  session.socket = socket;
  session.completedItems = new Set();
  const active = () => !session.closed && session.socket === socket;
  session.connectTimer = setTimeout(() => {
    if (active()) reconnectTranscription(session, 'connect_timeout');
  }, 8000);
  socket.on('open', () => {
    if (!active()) return;
    try {
      socket.send(JSON.stringify({
        event_id: transcriptionEventId(), type: 'session.update',
        session: {
          input_audio_format: 'pcm', sample_rate: TRANSCRIPTION_SAMPLE_RATE,
          input_audio_transcription: { language: 'zh' },
          turn_detection: { type: 'server_vad', threshold: 0, silence_duration_ms: 400 },
        },
      }));
    } catch (error) { reconnectTranscription(session, 'configuration_send_failed'); return; }
    let awaitingPong = false;
    socket.on('pong', () => { awaitingPong = false; });
    const heartbeat = () => {
      if (!active()) return;
      if (awaitingPong) { reconnectTranscription(session, 'heartbeat_timeout'); return; }
      awaitingPong = true;
      try { socket.ping(); } catch (error) { reconnectTranscription(session, 'heartbeat_failed'); return; }
      session.heartbeatTimer = setTimeout(heartbeat, 15000);
    };
    session.heartbeatTimer = setTimeout(heartbeat, 15000);
  });
  socket.on('message', (data) => { if (active()) handleTranscriptionMessage(session, data); });
  socket.on('error', (error) => {
    if (active()) reconnectTranscription(session, String(error?.message || 'connection_failed'));
  });
  socket.on('close', (code) => {
    if (active()) reconnectTranscription(session, `connection_closed_${code}`);
  });
}

ipcMain.handle('transcription:get-config', () => publicTranscriptionConfig());

ipcMain.handle('transcription:set-config', (event, payload) => {
  const previous = readStoredTranscriptionSettings();
  const region = payload && payload.region === 'singapore' ? 'singapore' : 'beijing';
  const workspaceId = String(payload && payload.workspaceId || '').trim();
  const apiKey = String(payload && payload.apiKey || '').trim();
  const llmApiKey = String(payload && payload.llmApiKey || '').trim();
  const llmBaseUrl = String(payload && payload.llmBaseUrl || previous.llmBaseUrl || 'https://api.deepseek.com').trim();
  const llmModel = String(payload && payload.llmModel || previous.llmModel || 'deepseek-v4-flash').replace(/\s+/g, ' ').trim().slice(0, 120);
  if (workspaceId && !/^[A-Za-z0-9_-]{1,128}$/.test(workspaceId)) {
    return { ok: false, error: 'invalid_workspace' };
  }
  let parsedLlmUrl;
  try { parsedLlmUrl = new URL(llmBaseUrl); } catch (error) { parsedLlmUrl = null; }
  if (!parsedLlmUrl || parsedLlmUrl.protocol !== 'https:' || parsedLlmUrl.username || parsedLlmUrl.password) {
    return { ok: false, error: 'invalid_llm_url' };
  }
  if ((apiKey || llmApiKey) && !safeStorage.isEncryptionAvailable()) {
    return { ok: false, error: 'secure_storage_unavailable' };
  }
  const next = {
    region,
    workspaceId,
    encryptedApiKey: apiKey
      ? safeStorage.encryptString(apiKey).toString('base64')
      : String(previous.encryptedApiKey || ''),
    llmBaseUrl: parsedLlmUrl.toString().replace(/\/$/, ''),
    llmModel,
    encryptedLlmApiKey: llmApiKey
      ? safeStorage.encryptString(llmApiKey).toString('base64')
      : String(previous.encryptedLlmApiKey || ''),
  };
  try {
    fs.writeFileSync(getTranscriptionSettingsPath(), JSON.stringify(next), { mode: 0o600 });
    return { ok: true, ...publicTranscriptionConfig() };
  } catch (error) {
    return { ok: false, error: 'save_failed' };
  }
});

ipcMain.handle('transcription:start', (event) => {
  const config = resolveTranscriptionConfig();
  if (!config.apiKey) return { ok: false, error: 'not_configured' };
  const existing = transcriptionSessions.get(event.sender.id);
  if (existing) closeTranscriptionSession(existing, { ok: false, error: 'replaced' });
  return new Promise((resolve) => {
    const headers = {
      Authorization: `Bearer ${config.apiKey}`,
      'OpenAI-Beta': 'realtime=v1',
      'User-Agent': 'Dingdo/0.3',
    };
    if (config.workspaceId) headers['X-DashScope-WorkSpace'] = config.workspaceId;
    const session = {
      sender: event.sender, senderId: event.sender.id, config, headers,
      socket: null, finalSegments: [], interim: '', ready: false, closed: false,
      startSettled: false, finishResolve: null, connectTimer: null, finishTimer: null,
      retryTimer: null, heartbeatTimer: null, retryCount: 0, lastError: '',
      audioQueue: [], queuedBytes: 0, audioGap: false, completedItems: new Set(),
    };
    transcriptionSessions.set(event.sender.id, session);
    session.settleStart = (result) => {
      if (session.startSettled) return;
      session.startSettled = true;
      resolve(result);
    };
    connectTranscriptionSocket(session);
  });
});

ipcMain.on('transcription:audio', (event, bytes) => {
  const session = transcriptionSessions.get(event.sender.id);
  if (!session || session.closed || session.finishResolve) return;
  const buffer = Buffer.from(bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : bytes || []);
  if (!buffer.length || buffer.length > 512 * 1024) return;
  session.audioQueue.push(buffer);
  session.queuedBytes += buffer.length;
  // 30 seconds of 16 kHz mono PCM16; the full recording still stays on disk.
  while (session.queuedBytes > TRANSCRIPTION_SAMPLE_RATE * 2 * 30) {
    session.queuedBytes -= session.audioQueue.shift().length;
    if (!session.audioGap) {
      session.audioGap = true;
      emitTranscription(session, { type: 'warning', code: 'audio_gap' });
    }
  }
  flushTranscriptionAudio(session);
});

ipcMain.handle('transcription:finish', (event) => {
  const session = transcriptionSessions.get(event.sender.id);
  if (!session || session.closed) return { ok: false, error: 'not_active', transcript: '' };
  if (session.finishResolve) return { ok: false, error: 'already_finishing', transcript: sessionTranscript(session) };
  return new Promise((resolve) => {
    session.finishResolve = resolve;
    session.finishTimer = setTimeout(() => {
      closeTranscriptionSession(session, { ok: false, error: 'finish_timeout' });
    }, TRANSCRIPTION_FINISH_TIMEOUT_MS);
    if (session.ready && session.socket?.readyState === WebSocket.OPEN) {
      try {
        session.socket.send(JSON.stringify({ event_id: transcriptionEventId(), type: 'session.finish' }));
      } catch (error) {
        closeTranscriptionSession(session, { ok: false, error: 'finish_send_failed' });
      }
    } else {
      closeTranscriptionSession(session, { ok: false, error: 'connection_closed' });
    }
  });
});

function closeAllTranscriptionSessions() {
  for (const session of transcriptionSessions.values()) {
    closeTranscriptionSession(session, { ok: false, error: 'app_quit' });
  }
}

// ============ 录音资料库 ============
function getRecordingsDir() {
  return workspacePath(RECORDINGS_DIR_NAME);
}

function ensureRecordingsDir() {
  try {
    fs.mkdirSync(getRecordingsDir(), { recursive: true });
  } catch (error) {
    // 目录不可用时由保存 IPC 返回失败。
  }
}

function getSafeRecordingPath(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  const directory = path.resolve(getRecordingsDir());
  const resolvedPath = path.isAbsolute(value)
    ? path.resolve(value)
    : path.resolve(workspaceRoot(), value);
  if (path.dirname(resolvedPath) !== directory) return null;
  if (!/^recording-[a-z0-9-]+\.(webm|m4a|ogg|wav)$/i.test(path.basename(resolvedPath))) {
    return null;
  }
  try {
    const directoryStat = fs.lstatSync(directory);
    const fileStat = fs.lstatSync(resolvedPath);
    if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) return null;
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) return null;
    return resolvedPath;
  } catch (error) {
    return null;
  }
}

ipcMain.handle('recordings:save', async (event, payload) => {
  if (!payload || !payload.bytes) return { ok: false, error: 'empty_audio' };
  let buffer;
  try {
    buffer = Buffer.from(payload.bytes);
  } catch (error) {
    return { ok: false, error: 'invalid_audio' };
  }
  if (!buffer.length || buffer.length > RECORDING_MAX_BYTES) {
    return { ok: false, error: buffer.length ? 'audio_too_large' : 'empty_audio' };
  }
  ensureRecordingsDir();
  const mimeType = String(payload.mimeType || 'audio/webm').slice(0, 80);
  const extension = recordingExtension(mimeType);
  const id = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
  const audioPath = path.join(getRecordingsDir(), `recording-${id}.${extension}`);
  try {
    await fs.promises.writeFile(audioPath, buffer, { flag: 'wx' });
    return { ok: true, audioPath: platformPolicy.portableMediaPath(RECORDINGS_DIR_NAME, audioPath), mimeType };
  } catch (error) {
    return { ok: false, error: 'write_failed' };
  }
});

ipcMain.handle('recordings:read', async (event, audioPath) => {
  const safePath = getSafeRecordingPath(audioPath);
  if (!safePath) return null;
  try {
    const bytes = await fs.promises.readFile(safePath);
    const extension = path.extname(safePath).slice(1).toLowerCase();
    const mimeType = extension === 'm4a' ? 'audio/mp4' : `audio/${extension || 'webm'}`;
    return { bytes, mimeType };
  } catch (error) {
    return null;
  }
});

ipcMain.handle('recordings:delete', async (event, audioPath) => {
  const safePath = getSafeRecordingPath(audioPath);
  if (!safePath) return false;
  try {
    await fs.promises.unlink(safePath);
    return true;
  } catch (error) {
    return false;
  }
});

ipcMain.handle('recordings:reveal', (event, audioPath) => {
  const safePath = getSafeRecordingPath(audioPath);
  if (!safePath) return false;
  shell.showItemInFolder(safePath);
  return true;
});

// ============ 剪贴板历史 ============

function getClipImagesDir() {
  return workspacePath(CLIP_IMAGES_DIR_NAME);
}

// 图片记录使用扁平目录和固定文件名。拒绝子目录、符号链接和非普通文件，
// 避免 localStorage 被篡改后通过 ../ 或 symlink 读写目录外文件。
function getSafeClipImagePath(p) {
  if (typeof p !== 'string' || !p.trim()) return false;
  const dir = path.resolve(getClipImagesDir());
  const resolvedPath = path.isAbsolute(p)
    ? path.resolve(p)
    : path.resolve(workspaceRoot(), p);
  if (path.dirname(resolvedPath) !== dir) return null;
  if (!/^clip-[a-z0-9]+\.png$/i.test(path.basename(resolvedPath))) return null;
  try {
    const dirStat = fs.lstatSync(dir);
    const fileStat = fs.lstatSync(resolvedPath);
    if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) return null;
    if (fileStat.isSymbolicLink() || !fileStat.isFile()) return null;
    return resolvedPath;
  } catch (e) {
    return null;
  }
}

function ensureClipImagesDir() {
  try {
    fs.mkdirSync(getClipImagesDir(), { recursive: true });
  } catch (e) {
    // 目录已存在或无权限，静默
  }
}

async function readSystemClipboard(includeImage = false) {
  try {
    const items = await clipboard.read();
    const observation = await readClipboardObservation(items, { includeImage });
    let image = null;
    if (observation.image?.buffer) {
      const native = nativeImage.createFromBuffer(observation.image.buffer);
      if (!native.isEmpty()) {
        const size = native.getSize();
        image = prepareClipboardImagePayload(
          observation.image.mimeType,
          observation.image.buffer,
          size
        );
      }
    }
    return { concealed: observation.concealed, text: observation.text, image };
  } catch (error) {
    return { concealed: false, text: '', image: null };
  }
}

async function baselineCurrentClipboard(generation) {
  try {
    const observation = await readSystemClipboard(true);
    if (!clipPollingEnabled || generation !== clipPollingGeneration) return;
    if (observation.concealed) {
      clipObservationState = reduceClipboardObservation(
        {},
        { concealed: true },
        { baseline: true }
      ).state;
      return;
    }
    clipObservationState = reduceClipboardObservation(
      {},
      { text: observation.text, imageFingerprint: observation.image?.fingerprint || null },
      { baseline: true }
    ).state;
    lastClipImageProbeAt = Date.now();
  } catch (error) {
    clipObservationState = { textFingerprint: null, imageFingerprint: null };
  }
}

async function pollClipboard() {
  if (!clipPollingEnabled || !mainWindow) return;
  if (clipPolling) return;
  clipPolling = true;
  try {
    const now = Date.now();
    const includeImage = now - lastClipImageProbeAt >= CLIP_IMAGE_POLL_INTERVAL_MS;
    const observation = await readSystemClipboard(includeImage);
    if (!clipPollingEnabled) return;
    // 密码管理器写入的敏感内容：跳过不记录、不更新指纹
    if (observation.concealed) return;

    // 优先读文字
    const text = observation.text;
    if (text) {
      const decision = reduceClipboardObservation(clipObservationState, { text });
      clipObservationState = decision.state;
      if (decision.record && clipPollingEnabled) {
        const type = /^https?:\/\//i.test(text.trim()) ? 'url' : 'text';
        mainWindow.webContents.send('clipboard:new-entry', { type, text, imagePath: null });
      }
      return;
    }

    // 文字为空再读图片
    if (!text && includeImage) {
      lastClipImageProbeAt = now;
      const result = observation.image;
      const decision = reduceClipboardObservation(clipObservationState, {
        text: '',
        imageFingerprint: result?.fingerprint || null,
      });
      clipObservationState = decision.state;
      if (result && decision.record && clipPollingEnabled) {
        const pngBuf = result.pngBuffer
          || nativeImage.createFromBuffer(result.sourceBuffer).toPNG();
        if (!pngBuf.length) return;
        ensureClipImagesDir();
        const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
        const fileName = 'clip-' + id + '.png';
        const imagePath = path.join(getClipImagesDir(), fileName);
        try {
          await fs.promises.writeFile(imagePath, pngBuf);
        } catch (e) {
          return; // 写盘失败不记录
        }
        if (!clipPollingEnabled) {
          try { await fs.promises.unlink(imagePath); } catch (error) {}
          return;
        }
        mainWindow.webContents.send('clipboard:new-entry', {
          type: 'image',
          text: null,
          imagePath: platformPolicy.portableMediaPath(CLIP_IMAGES_DIR_NAME, imagePath),
        });
      }
    }
  } catch (e) {
    // 轮询任何异常不能崩主进程，静默
  } finally {
    clipPolling = false;
  }
}

function startClipboardPolling() {
  // Electron 没有 NSPasteboard.changeCount，只能内容轮询：靠文本本身与
  // 图片 PNG 内容哈希指纹去重（见 pollClipboard）。
  if (clipPollingEnabled) return;
  clipPollingEnabled = true;
  const generation = ++clipPollingGeneration;
  // 首次开启只建立当前系统剪贴板基线，不把开启前的内容写入历史。
  clipBaselineTimer = setTimeout(() => {
    clipBaselineTimer = null;
    if (!clipPollingEnabled) return;
    void baselineCurrentClipboard(generation).finally(() => {
      if (clipPollingEnabled && generation === clipPollingGeneration && !clipPollTimer) {
        clipPollTimer = setInterval(pollClipboard, CLIP_POLL_INTERVAL_MS);
      }
    });
  }, 0);
}

function stopClipboardPolling() {
  clipPollingEnabled = false;
  clipPollingGeneration += 1;
  if (clipBaselineTimer) {
    clearTimeout(clipBaselineTimer);
    clipBaselineTimer = null;
  }
  if (clipPollTimer) {
    clearInterval(clipPollTimer);
    clipPollTimer = null;
  }
  clipObservationState = { textFingerprint: null, imageFingerprint: null };
  lastClipImageProbeAt = 0;
}

function setHoverSpaceShortcut(enabled) {
  if (enabled === spaceShortcutRegistered) return;
  if (!enabled) {
    if (globalShortcut.isRegistered('Space')) globalShortcut.unregister('Space');
    spaceShortcutRegistered = false;
    return;
  }
  try {
    const ok = globalShortcut.register('Space', async () => {
      if (!mainWindow || mainWindow.isDestroyed()) return;
      // 展开动作后的极短窗口内，全局 Space 还未来得及注销；这时也要把第二次
      // Space 作为收起处理，避免快速连按被吞掉。
      if (currentMode === 'expanded') {
        mainWindow.webContents.send('shortcut:toggle-panel');
        return;
      }
      await rememberPasteTarget();
      hideWhenCollapsed = false;
      if (!mainWindow.isVisible()) mainWindow.show();
      mainWindow.focus();
      mainWindow.webContents.send('shortcut:toggle-panel');
    });
    spaceShortcutRegistered = ok && globalShortcut.isRegistered('Space');
  } catch (error) {
    spaceShortcutRegistered = false;
  }
}

function startHoverSpaceShortcut() {
  const policy = hoverSpacePollingPolicy({
    shortcut: configuredShortcut,
    visible: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()),
    mode: currentMode,
  });
  if (!policy.enabled) return;
  if (spaceShortcutTimer) return;
  spaceShortcutTimer = setInterval(() => {
    const currentPolicy = hoverSpacePollingPolicy({
      shortcut: configuredShortcut,
      visible: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()),
      mode: currentMode,
    });
    if (!currentPolicy.enabled) {
      stopHoverSpaceShortcut();
      return;
    }
    const point = screen.getCursorScreenPoint();
    const bounds = mainWindow.getBounds();
    const hovering = point.x >= bounds.x && point.x < bounds.x + bounds.width
      && point.y >= bounds.y && point.y < bounds.y + bounds.height;
    setHoverSpaceShortcut(hovering);
  }, policy.intervalMs);
}

function stopHoverSpaceShortcut() {
  if (spaceShortcutTimer) clearInterval(spaceShortcutTimer);
  spaceShortcutTimer = null;
  setHoverSpaceShortcut(false);
}

function syncHoverSpacePolling() {
  const policy = hoverSpacePollingPolicy({
    shortcut: configuredShortcut,
    visible: Boolean(mainWindow && !mainWindow.isDestroyed() && mainWindow.isVisible()),
    mode: currentMode,
  });
  if (policy.enabled) startHoverSpaceShortcut();
  else stopHoverSpaceShortcut();
}

ipcMain.handle('shortcut:hover-space-status', () => ({
  registered: spaceShortcutRegistered && globalShortcut.isRegistered('Space'),
  mode: currentMode,
  cursor: screen.getCursorScreenPoint(),
  bounds: mainWindow && !mainWindow.isDestroyed() ? mainWindow.getBounds() : null,
}));

// 渲染层请求把图片文件读成 dataURL 回显（contextIsolation 下 file:// 受限，走 IPC 读盘）
ipcMain.handle('clipboard:readImage', async (event, imagePath) => {
  const safePath = getSafeClipImagePath(imagePath);
  if (!safePath) return null; // 只允许读自己的图片目录
  try {
    const buf = await fs.promises.readFile(safePath);
    return `data:image/png;base64,${buf.toString('base64')}`;
  } catch (e) {
    return null;
  }
});

// FIFO 淘汰 / 删除 / 清空时，连带删除本地图片文件（文件 I/O 归主进程）
ipcMain.handle('clipboard:deleteImages', async (event, paths) => {
  if (!Array.isArray(paths)) return;
  for (const p of paths) {
    const safePath = getSafeClipImagePath(p);
    if (safePath) {
      try {
        await fs.promises.unlink(safePath);
      } catch (e) {
        // 文件已不存在等，静默
      }
    }
  }
});

async function writeClipboardEntry(entry) {
  if (!entry) return false;
  try {
    const safeImagePath =
      entry.type === 'image' ? getSafeClipImagePath(entry.imagePath) : null;
    if (safeImagePath) {
      const buf = fs.readFileSync(safeImagePath);
      const image = nativeImage.createFromBuffer(buf);
      if (image.isEmpty()) return false;
      const pngBuf = image.toPNG();
      await clipboard.write([
        new ClipboardItem({
          'image/png': new Blob([pngBuf], { type: 'image/png' }),
        }),
      ]);
      const size = image.getSize();
      const fingerprint = createClipboardImageFingerprint(size.width, size.height, pngBuf);
      if (fingerprint) {
        clipObservationState = reduceClipboardObservation(
          clipObservationState,
          { imageFingerprint: fingerprint },
          { baseline: true }
        ).state;
      }
    } else if (entry.text) {
      await clipboard.writeText(entry.text);
      clipObservationState = reduceClipboardObservation(
        clipObservationState,
        { text: entry.text },
        { baseline: true }
      ).state;
    } else {
      return false;
    }
    return true;
  } catch (e) {
    return false;
  }
}

function waitForCollapsedPanel(timeoutMs = 950) {
  const deadline = Date.now() + timeoutMs;
  return new Promise((resolve) => {
    const check = () => {
      if (currentMode !== 'expanded' || Date.now() >= deadline) return resolve(currentMode !== 'expanded');
      setTimeout(check, 32);
    };
    check();
  });
}

function pasteToPreviousApp(target) {
  return new Promise((resolve) => {
    const bundleId = String(target?.bundleId || '');
    if (!bundleId) return resolve(false);
    execFile('/usr/bin/osascript', [
      '-l', 'JavaScript', '-e', PASTE_TO_APP_JXA, bundleId,
    ], { timeout: 3000 }, (error, stdout) => {
      resolve(!error && String(stdout || '').trim() === 'ok');
    });
  });
}

ipcMain.handle('clipboard:write', (event, entry) => writeClipboardEntry(entry));

// 点击历史项后先收起灵动岛，再回到打开面板前的应用执行粘贴。
// 若系统尚未授予辅助功能权限，内容仍保留在系统剪贴板作为可靠降级。
ipcMain.handle('clipboard:paste', async (event, entry) => {
  if (!await writeClipboardEntry(entry)) return { ok: false, pasted: false };
  if (!PLATFORM_CAPABILITIES.automaticPaste) return { ok: true, pasted: false };
  if (process.platform === 'darwin' && !systemPreferences.isTrustedAccessibilityClient(true)) {
    return { ok: true, pasted: false, permissionRequired: true };
  }
  const target = previousPasteTarget;
  requestRendererCollapse();
  await waitForCollapsedPanel();
  const pasted = await pasteToPreviousApp(target);
  return { ok: true, pasted };
});

function ensureFirstRunAutoLaunch() {
  // 首次运行时默认开启开机自启；之后尊重用户在托盘菜单的选择
  if (process.platform !== 'darwin') return;
  const marker = path.join(app.getPath('userData'), '.first-run-done');
  if (fs.existsSync(marker)) return;
  try {
    setAutoLaunch(true);
    fs.writeFileSync(marker, String(Date.now()));
  } catch (e) {
    // ignore
  }
}

function watchDisplayChanges() {
  // 接/拔外接屏、改变屏幕排列、改分辨率 → 自动重新定位到当前活跃屏顶部居中
  // 加 100ms 防抖：插拔屏时系统会连续触发多次事件
  let timer = null;
  const reposition = () => {
    clearTimeout(timer);
    timer = setTimeout(() => {
      if (!mainWindow) return;
      repositionWindow();
      if (!mainWindow.webContents.isDestroyed()) {
        mainWindow.webContents.send('window:metrics-changed', getLayoutMetrics());
      }
      if (notificationWindow && !notificationWindow.isDestroyed() && notificationWindow.isVisible()) {
        notificationWindow.setBounds(getTaskNotificationBounds());
      }
      if (strongReminderWindow && !strongReminderWindow.isDestroyed() && strongReminderWindow.isVisible()) {
        strongReminderWindow.setBounds(getStrongReminderBounds());
      }
    }, 100);
  };
  screen.on('display-added', reposition);
  screen.on('display-removed', reposition);
  screen.on('display-metrics-changed', reposition);
}

function todoReminderRecoveryWindowMs() {
  return Math.max(
    TODO_REMINDER_GRACE_MS,
    todoMissedReminderWindowMs(todoMissedReminderPolicy)
  );
}

function recoverTodoRemindersAfterSystemEvent(options = {}) {
  scheduleNextTodoReminder({
    recoveryWindowMs: todoReminderRecoveryWindowMs(),
    forceNative: options.forceNative === true,
  });
  if (!systemLocked && !systemSuspended) showNextStrongReminder();
}

function watchPowerEvents() {
  powerMonitor.on('lock-screen', () => {
    systemLocked = true;
  });
  powerMonitor.on('unlock-screen', () => {
    systemLocked = false;
    recoverTodoRemindersAfterSystemEvent();
  });
  powerMonitor.on('suspend', () => {
    systemSuspended = true;
  });
  powerMonitor.on('resume', () => {
    systemSuspended = false;
    recoverTodoRemindersAfterSystemEvent({ forceNative: true });
  });
}

app.whenReady().then(() => {
  if (process.platform === 'win32') app.setAppUserModelId('io.github.zxc19950223.dingdo');
  if (process.platform === 'darwin' && app.dock) {
    app.dock.hide();
  }

  ensureFirstRunAutoLaunch();
  mediaSessionService.start();
  createWindow();
  createTray();
  watchDisplayChanges();
  watchPowerEvents();
  if (!process.env.TODO_TEST_USER_DATA) void ensureRemindersRunning();
  applyAppSettings();
  startTaskNotificationServer();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

// 常驻菜单栏应用：所有窗口暂时关闭时仍保持后台运行。
app.on('window-all-closed', () => {});

app.on('before-quit', () => {
  isQuitting = true;
  allowStrongReminderClose = true;
  if (strongReminderWindow && !strongReminderWindow.isDestroyed()) {
    strongReminderWindow.destroy();
  }
  hideWhenCollapsed = false;
});

app.on('will-quit', () => {
  cancelCollapseWatchdog();
  clearTodoReminderTimer();
  if (todoReminderWatchdogTimer) clearInterval(todoReminderWatchdogTimer);
  todoReminderWatchdogTimer = null;
  stopHoverSpaceShortcut();
  clearTaskNotificationTimers();
  if (strongReminderWindow && !strongReminderWindow.isDestroyed()) {
    strongReminderWindow.destroy();
  }
  nativeTodoNotifications.clear();
  stopTaskNotificationServer();
  closeAllTranscriptionSessions();
  mediaSessionService.stop();
  globalShortcut.unregisterAll();
  stopClipboardPolling();
});
