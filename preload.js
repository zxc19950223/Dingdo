const { contextBridge, ipcRenderer } = require('electron');

// 所有 on* 订阅统一经此注册，并回传退订函数：渲染层若重新初始化，
// 不退订就会叠加监听器，同一条通知被回调多次。
function subscribe(channel, handler) {
  ipcRenderer.on(channel, handler);
  return () => ipcRenderer.removeListener(channel, handler);
}

contextBridge.exposeInMainWorld('notchAPI', {
  platform: process.platform,
  setMode: (mode) => ipcRenderer.invoke('window:set-mode', mode),
  beginCollapse: () => ipcRenderer.invoke('window:begin-collapse'),
  setTab: (tab) => ipcRenderer.invoke('window:set-tab', tab),
  ensureCamera: () => ipcRenderer.invoke('media:camera'),
  ensureMicrophone: () => ipcRenderer.invoke('media:microphone'),
  openExternal: (url) => ipcRenderer.invoke('shell:openExternal', url),
  openPath: (p) => ipcRenderer.invoke('shell:openPath', p),
  openPrivacySettings: (pane) => ipcRenderer.invoke('shell:open-privacy-settings', pane),
  getMusicStatus: (options) => ipcRenderer.invoke('music:status', options),
  controlMusic: (action) => ipcRenderer.invoke('music:control', action),
  activateMusicPlayer: () => ipcRenderer.invoke('music:activate'),
  setMusicVolume: (volume) => ipcRenderer.invoke('music:volume', volume),
  seekMusic: (positionSeconds) => ipcRenderer.invoke('music:seek', positionSeconds),
  inspectLink: (url) => ipcRenderer.invoke('links:inspect', url),
  listWindows: () => ipcRenderer.invoke('windows:list'),
  focusWindow: (windowId) => ipcRenderer.invoke('windows:focus', windowId),
  saveRecording: (payload) => ipcRenderer.invoke('recordings:save', payload),
  readRecording: (audioPath) => ipcRenderer.invoke('recordings:read', audioPath),
  deleteRecording: (audioPath) => ipcRenderer.invoke('recordings:delete', audioPath),
  revealRecording: (audioPath) => ipcRenderer.invoke('recordings:reveal', audioPath),
  organizeMaterial: (payload) => ipcRenderer.invoke('smart:organize-material', payload),
  listCredentials: () => ipcRenderer.invoke('credentials:list'),
  getCredential: (id) => ipcRenderer.invoke('credentials:get', id),
  saveCredential: (payload) => ipcRenderer.invoke('credentials:save', payload),
  deleteCredentials: (ids) => ipcRenderer.invoke('credentials:delete-many', ids),
  copyCredential: (id, field) => ipcRenderer.invoke('credentials:copy', { id, field }),
  getTranscriptionConfig: () => ipcRenderer.invoke('transcription:get-config'),
  setTranscriptionConfig: (config) => ipcRenderer.invoke('transcription:set-config', config),
  startTranscription: () => ipcRenderer.invoke('transcription:start'),
  sendTranscriptionAudio: (bytes) => ipcRenderer.send('transcription:audio', bytes),
  finishTranscription: () => ipcRenderer.invoke('transcription:finish'),
  onTranscriptionEvent: (cb) => subscribe('transcription:event', (event, payload) => cb(payload)),
  listTaskCompletions: () => ipcRenderer.invoke('tasks:recent'),
  scheduleTodoReminders: (items, options) => ipcRenderer.invoke('todos:schedule-reminders', items, options),
  resolveStrongReminder: (payload) => ipcRenderer.invoke('strong-reminder:resolve', payload),
  abortStrongReminder: (payload) => ipcRenderer.invoke('strong-reminder:abort', payload),
  snoozeTodoReminder: (payload) => ipcRenderer.invoke('todos:snooze', payload),
  backupTodoData: (data, force) => ipcRenderer.invoke('todos:backup', data, force === true),
  exportTodoData: (data) => ipcRenderer.invoke('todos:export', data),
  exportTodoReport: (payload) => ipcRenderer.invoke('todos:export-report', payload),
  importTodoData: () => ipcRenderer.invoke('todos:import'),
  listReminderLists: () => ipcRenderer.invoke('reminders:lists'),
  listReminderItems: (listId) => ipcRenderer.invoke('reminders:items', listId),
  listDesktopCards: () => ipcRenderer.invoke('desktop-cards:list'),
  setDesktopCardEnabled: (taskId, enabled) =>
    ipcRenderer.invoke('desktop-cards:set-enabled', taskId, enabled === true),
  addDesktopCardFromDrop: (taskId) =>
    ipcRenderer.invoke('desktop-cards:add-from-drop', taskId),
  syncDesktopCards: (items) => ipcRenderer.invoke('desktop-cards:sync', items),
  onDesktopCardRemoved: (cb) => subscribe('desktop-card:removed', (event, taskId) => cb(taskId)),
  onTodoToggleFromCard: (cb) => subscribe('todo:toggle-from-card', (event, payload) => cb(payload)),
  onTodoUpdateFromCard: (cb) => subscribe('todo:update-from-card', (event, payload) => cb(payload)),
  notifyPomodoro: (minutes) => ipcRenderer.invoke('pomodoro:notify', minutes),
  onTodoReminder: (cb) => subscribe('todo:reminded', (event, payload) => cb(payload)),
  onStrongReminder: (cb) => subscribe('strong-reminder:show', (event, payload) => cb(payload)),
  onStrongReminderResolved: (cb) => subscribe('todo:strong-resolved', (event, payload) => cb(payload)),
  onStrongReminderAborted: (cb) => subscribe('todo:strong-aborted', (event, payload) => cb(payload)),
  onTodoSnoozed: (cb) => subscribe('todo:snoozed', (event, payload) => cb(payload)),
  onTodoReminderHandled: (cb) => subscribe('todo:reminder-handled', (event, payload) => cb(payload)),
  onOpenTodoTask: (cb) => subscribe('todo:open-task', (event, payload) => cb(payload)),
  onEscape: (cb) => subscribe('key:escape', () => cb()),
  onToggleShortcut: (cb) => subscribe('shortcut:toggle-panel', () => cb()),
  getHoverSpaceStatus: () => ipcRenderer.invoke('shortcut:hover-space-status'),
  getAppSettings: () => ipcRenderer.invoke('settings:get'),
  setFeature: (featureId, enabled) => ipcRenderer.invoke('settings:set-feature', { featureId, enabled }),
  setDefaultTab: (tab) => ipcRenderer.invoke('settings:set-default-tab', tab),
  setTodoNotificationDuration: (seconds) =>
    ipcRenderer.invoke('settings:set-todo-notification-duration', seconds),
  setAutoLaunch: (enabled) => ipcRenderer.invoke('settings:set-auto-launch', enabled === true),
  setPanelShortcut: (accelerator) => ipcRenderer.invoke('settings:set-shortcut', accelerator),
  onAppSettingsChanged: (cb) => subscribe('settings:changed', (event, settings) => cb(settings)),
  onRecordShortcut: (cb) => subscribe('app:record-shortcut', () => cb()),
  getWorkspace: () => ipcRenderer.invoke('workspace:get'),
  loadWorkspaceData: () => ipcRenderer.invoke('workspace:load-data'),
  saveWorkspaceData: (storage) => ipcRenderer.invoke('workspace:save-data', storage),
  openWorkspace: () => ipcRenderer.invoke('workspace:open'),
  chooseWorkspace: () => ipcRenderer.invoke('workspace:choose'),
  onWorkspaceChanged: (cb) => subscribe('workspace:changed', (event, info) => cb(info)),
  onCollapseRequest: (cb) => subscribe('window:request-collapse', () => cb()),
  getMetrics: () => ipcRenderer.invoke('window:metrics'),
  onMetricsChanged: (cb) =>
    subscribe('window:metrics-changed', (event, metrics) => cb(metrics)),
  writeClipboard: (entry) => ipcRenderer.invoke('clipboard:write', entry),
  pasteClipboard: (entry) => ipcRenderer.invoke('clipboard:paste', entry),
  readClipImage: (imagePath) => ipcRenderer.invoke('clipboard:readImage', imagePath),
  deleteClipImages: (paths) => ipcRenderer.invoke('clipboard:deleteImages', paths),
  onNewClipEntry: (cb) => subscribe('clipboard:new-entry', (evt, entry) => cb(entry)),
  onOpenClip: (cb) => subscribe('app:open-clip', () => cb()),
  onOpenTodo: (cb) => subscribe('app:open-todo', () => cb()),
  onOpenApiSettings: (cb) => subscribe('app:open-api-settings', () => cb()),
  getMirrorImage: () => ipcRenderer.invoke('mirror:get-image'),
  chooseMirrorImage: () => ipcRenderer.invoke('mirror:choose-image'),
  onMirrorImageChanged: (cb) => subscribe('mirror:image-changed', (event, dataUrl) => cb(dataUrl)),
  onTaskNotification: (cb) =>
    subscribe('task-notification:show', (event, notification) => cb(notification)),
  onTaskNotificationQueue: (cb) =>
    subscribe('task-notification:queue', (event, count) => cb(count)),
  onTaskNotificationHide: (cb) =>
    subscribe('task-notification:hide', (event, eventId) => cb(eventId)),
  onTaskCompletion: (cb) =>
    subscribe('task-completion:new', (event, notification) => cb(notification)),
  taskNotificationDismissed: (eventId) =>
    ipcRenderer.send('task-notification:dismissed', eventId),
  markTaskNotificationHandled: (eventId) =>
    ipcRenderer.send('task-notification:handled', eventId),
  activateTaskNotification: (eventId) =>
    ipcRenderer.invoke('task-notification:activate', eventId),
  taskNotificationHover: (paused) =>
    ipcRenderer.send('task-notification:hover', paused === true),
  playNotificationSound: (soundId) =>
    ipcRenderer.invoke('notification:play-sound', soundId),
});
