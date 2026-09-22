'use strict';

const root = document.getElementById('notification-root');
const shell = document.getElementById('notification-shell');
const titleElement = document.getElementById('notification-title');
const sourceElement = document.getElementById('notification-source');
const detailElement = document.getElementById('notification-detail');
const queueElement = document.getElementById('notification-queue');
const snoozeButton = document.getElementById('notification-snooze');
const snoozeSelect = document.getElementById('notification-snooze-select');

const api = window.notchAPI;
if (api?.platform === 'win32') shell.setAttribute('aria-label', '关闭任务提醒');
const HIDE_FALLBACK_MS = 420;
const MAX_QUEUE_COUNT = 99;

let hideFallback = null;
let currentEventId = null;
let isVisible = false;
let isHiding = false;
let isHovering = false;
let notificationAudioContext = null;

async function playNotificationSound(soundId) {
  if (typeof api?.playNotificationSound === 'function') {
    try {
      const result = await api.playNotificationSound(soundId);
      if (result?.ok) return;
    } catch (error) {}
  }
  const preset = {
    soft: [523.25, 659.25],
    bright: [659.25, 880],
    alert: [440, 659.25, 880],
  }[soundId];
  if (!preset) return;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    notificationAudioContext ||= new AudioContext();
    const context = notificationAudioContext;
    const startAt = context.currentTime + 0.01;
    preset.forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = startAt + index * 0.11;
      const noteEnd = noteStart + (soundId === 'alert' ? 0.17 : 0.22);
      oscillator.type = soundId === 'soft' ? 'sine' : 'triangle';
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(soundId === 'alert' ? 0.16 : 0.11, noteStart + 0.018);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.02);
    });
    if (context.state === 'suspended') context.resume().catch(() => {});
  } catch (error) {}
}

function firstText(values, fallback) {
  for (const value of values) {
    if (typeof value === 'string' && value.trim()) return value.trim();
    if (typeof value === 'number' && Number.isFinite(value)) return String(value);
  }
  return fallback;
}

function normalizeNotification(payload) {
  const data = payload && typeof payload === 'object' ? payload : {};
  const stringPayload = typeof payload === 'string' ? payload : '';
  const sourceKey = firstText(
    [data.source, data.provider, data.agent, data.app, data.type],
    'task'
  ).toLowerCase();
  const sourceNames = {
    codex: 'Codex',
    claude: 'Claude',
    gpt: 'GPT',
    chatgpt: 'GPT',
    task: '任务',
    todo: '待办',
  };
  const project = firstText([data.project, data.projectName, data.workspace], '');

  return {
    title: firstText(
      [data.title, data.taskTitle, data.taskName, data.name, stringPayload],
      '任务已完成'
    ),
    source: sourceNames[sourceKey] || '任务',
    detail: firstText(
      [data.detail],
      sourceKey === 'todo'
        ? '将在 1 小时内截止'
        : project
          ? `已完成 · ${project}`
          : '已完成，可以查看了'
    ),
    queueCount: readQueueCount(data.queueCount ?? data.pendingCount ?? data.pending),
    eventId: data.eventId ?? null,
    sourceKey,
    soundId: typeof data.soundId === 'string' ? data.soundId : '',
    taskId: typeof data.taskId === 'string' ? data.taskId : '',
    reminderId: typeof data.reminderId === 'string' ? data.reminderId : '',
  };
}

function readEventId(value) {
  if (value && typeof value === 'object') return value.eventId ?? null;
  return value ?? null;
}

function readQueueCount(value) {
  const raw = Array.isArray(value)
    ? value.length
    : value && typeof value === 'object'
      ? value.queueCount ?? value.pendingCount ?? value.pending ?? value.count
      : value;
  const count = Number(raw);
  if (!Number.isFinite(count) || count <= 0) return 0;
  return Math.min(MAX_QUEUE_COUNT, Math.floor(count));
}

function setQueueCount(value) {
  const count = readQueueCount(value);
  queueElement.textContent = `+${count}`;
  queueElement.hidden = count === 0;
}

function clearHideFallback() {
  if (!hideFallback) return;
  clearTimeout(hideFallback);
  hideFallback = null;
}

function reportHover(hovering) {
  if (isHovering === hovering) return;
  isHovering = hovering;
  if (api && typeof api.taskNotificationHover === 'function') {
    api.taskNotificationHover(hovering);
  }
}

function showNotification(payload) {
  const notification = normalizeNotification(payload);

  clearHideFallback();
  currentEventId = notification.eventId;
  isVisible = true;
  isHiding = false;

  titleElement.textContent = notification.title;
  sourceElement.textContent = notification.source;
  detailElement.textContent = notification.detail;
  shell.dataset.source = notification.sourceKey;
  setQueueCount(notification.queueCount);
  playNotificationSound(notification.soundId);
  currentNotification = notification;
  if (snoozeButton) {
    if (snoozeSelect) {
      snoozeSelect.disabled = false;
      snoozeSelect.value = '10';
    }
    snoozeButton.hidden = notification.sourceKey !== 'todo'
      || !notification.taskId
      || typeof api?.snoozeTodoReminder !== 'function';
  }

  root.hidden = false;
  shell.classList.remove('is-visible', 'is-hiding');
  void shell.offsetWidth;

  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      if (!isVisible || isHiding) return;
      shell.classList.add('is-visible');
    });
  });
}

let currentNotification = null;

function finishHide() {
  if (!isHiding) return;
  clearHideFallback();
  reportHover(false);

  isVisible = false;
  isHiding = false;
  shell.classList.remove('is-visible', 'is-hiding');
  root.hidden = true;

  if (api && typeof api.taskNotificationDismissed === 'function') {
    api.taskNotificationDismissed(currentEventId);
  }
}

function hideNotification(eventId) {
  if (!isVisible || isHiding) return;

  const requestedEventId = readEventId(eventId);
  if (requestedEventId !== null) currentEventId = requestedEventId;
  isHiding = true;
  reportHover(false);

  shell.classList.remove('is-visible');
  shell.classList.add('is-hiding');
  hideFallback = setTimeout(finishHide, HIDE_FALLBACK_MS);
}

function subscribe(method, callback) {
  if (!api || typeof api[method] !== 'function') return;
  api[method](callback);
}

shell.addEventListener('pointerenter', () => reportHover(true));
shell.addEventListener('pointerleave', () => reportHover(false));
shell.addEventListener('click', async () => {
  api?.markTaskNotificationHandled?.(currentEventId);
  if (api?.platform !== 'win32' && api && typeof api.activateTaskNotification === 'function') {
    try { await api.activateTaskNotification(currentEventId); } catch (error) {}
  }
  hideNotification(currentEventId);
});
snoozeSelect?.addEventListener('change', async (event) => {
  event.stopPropagation();
  if (!currentNotification?.taskId || typeof api?.snoozeTodoReminder !== 'function') return;
  snoozeSelect.disabled = true;
  try {
    await api.snoozeTodoReminder({
      taskId: currentNotification.taskId,
      reminderId: currentNotification.reminderId,
      soundId: currentNotification.soundId,
      minutes: Number(snoozeSelect.value) || 10,
    });
    api?.markTaskNotificationHandled?.(currentEventId);
    snoozeSelect.value = '10';
    hideNotification(currentEventId);
  } catch (error) {
    snoozeSelect.disabled = false;
  }
});
shell.addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    api?.markTaskNotificationHandled?.(currentEventId);
    hideNotification(currentEventId);
  }
});
shell.addEventListener('transitionend', (event) => {
  if (event.target !== shell || event.propertyName !== 'clip-path') return;
  if (isHiding) finishHide();
});

window.addEventListener('blur', () => reportHover(false));
window.addEventListener('beforeunload', () => reportHover(false));

subscribe('onTaskNotification', showNotification);
subscribe('onTaskNotificationQueue', setQueueCount);
subscribe('onTaskNotificationHide', hideNotification);
