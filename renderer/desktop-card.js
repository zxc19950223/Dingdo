'use strict';

const card = document.getElementById('desktop-card');
const title = document.getElementById('desktop-card-title');
const status = document.getElementById('desktop-card-status');
const due = document.getElementById('desktop-card-due');
const priority = document.getElementById('desktop-card-priority');
const reason = document.getElementById('desktop-card-reason');
const next = document.getElementById('desktop-card-next');
const toggle = document.getElementById('desktop-card-toggle');
const toggleLabel = document.getElementById('desktop-card-toggle-label');
const open = document.getElementById('desktop-card-open');
const close = document.getElementById('desktop-card-close');
const pin = document.getElementById('desktop-card-pin');
const progress = document.getElementById('desktop-card-progress');
const editor = document.getElementById('desktop-card-editor');
const statusSelect = document.getElementById('desktop-card-status-select');
const reasonInput = document.getElementById('desktop-card-reason-input');
const nextInput = document.getElementById('desktop-card-next-input');
const editorError = document.getElementById('desktop-card-editor-error');
const editToggle = document.getElementById('desktop-card-edit-toggle');
const editCancel = document.getElementById('desktop-card-edit-cancel');
const editSave = document.getElementById('desktop-card-edit-save');
const deadlinePresets = document.querySelector('.desktop-card-deadline-presets');

let current = null;
let deadlineDraft = null;
let resizeTimer = null;

function render(state) {
  current = state && typeof state === 'object' ? state : {};
  const statusId = ['todo', 'in_progress', 'blocked', 'done'].includes(current.status)
    ? current.status
    : current.done === true ? 'done' : 'todo';
  card.dataset.status = statusId;
  if (document.activeElement !== title) title.textContent = String(current.text || '待办');
  status.textContent = String(current.statusLabel || '待办');
  due.textContent = String(current.dueText || '无日期');
  due.classList.toggle('overdue', current.overdue === true);
  priority.textContent = current.priorityLabel ? `优先级 ${current.priorityLabel}` : '';
  reason.textContent = current.blockReason
    ? `${current.blockReasonType || '受阻'}：${current.blockReason}`
    : '';
  reason.hidden = !reason.textContent;
  next.textContent = current.nextAction ? `下一步：${current.nextAction}` : '';
  next.hidden = !next.textContent;
  toggleLabel.textContent = statusId === 'done' ? '恢复待办' : '标记完成';
  progress.textContent = current.subtaskTotal > 0
    ? `子任务 ${current.subtaskDone}/${current.subtaskTotal}`
    : '';
  pin.classList.toggle('active', current.alwaysOnTop === true);
  pin.title = current.alwaysOnTop ? '取消置顶' : '置顶卡片';
  pin.setAttribute('aria-label', pin.title);
  statusSelect.value = statusId;
  if (editor.hidden) {
    reasonInput.value = current.blockReason || '';
    nextInput.value = current.nextAction || '';
    deadlineDraft = null;
    deadlinePresets?.querySelectorAll('[data-desktop-deadline]').forEach((button) => {
      button.classList.remove('active');
    });
  }
  scheduleResize();
}

function scheduleResize() {
  if (resizeTimer) cancelAnimationFrame(resizeTimer);
  resizeTimer = requestAnimationFrame(() => {
    resizeTimer = null;
    const height = Math.max(168, Math.ceil(card.scrollHeight + 2));
    window.desktopCardAPI?.resizeContent(height);
  });
}

function showEditorError(message) {
  editorError.textContent = message || '';
  editorError.hidden = !message;
}

function openEditor() {
  editor.hidden = false;
  editToggle.textContent = '收起';
  statusSelect.value = card.dataset.status || 'todo';
  reasonInput.value = current?.blockReason || '';
  nextInput.value = current?.nextAction || '';
  showEditorError('');
  scheduleResize();
  reasonInput.focus({ preventScroll: true });
}

function closeEditor() {
  editor.hidden = true;
  editToggle.textContent = '编辑';
  showEditorError('');
  deadlineDraft = null;
  deadlinePresets?.querySelectorAll('[data-desktop-deadline]').forEach((button) => {
    button.classList.remove('active');
  });
  scheduleResize();
}

async function saveEditor() {
  const nextStatus = statusSelect.value;
  const blockReason = reasonInput.value.trim();
  if (nextStatus === 'blocked' && !blockReason) {
    showEditorError('受阻状态需要填写具体原因。');
    reasonInput.focus({ preventScroll: true });
    return;
  }
  const patch = {
    status: nextStatus,
    blockReason: nextStatus === 'blocked' ? blockReason : '',
    nextAction: nextStatus === 'blocked' ? nextInput.value.trim() : '',
  };
  if (deadlineDraft) {
    if (deadlineDraft === 'tomorrow') patch.deadlinePreset = 'tomorrow';
    else patch.snoozeMinutes = Number(deadlineDraft);
  }
  const result = await window.desktopCardAPI?.updateTask(patch).catch(() => null);
  if (!result?.ok) {
    showEditorError('保存失败，请稍后重试。');
    return;
  }
  closeEditor();
}

async function commitTitle() {
  const text = title.textContent.replace(/\s+/g, ' ').trim();
  if (!text) {
    title.textContent = current?.text || '待办';
    return;
  }
  if (text === current?.text) return;
  const result = await window.desktopCardAPI?.updateTask({ text }).catch(() => null);
  if (!result?.ok) title.textContent = current?.text || '待办';
}

window.desktopCardAPI?.onState(render);
window.desktopCardAPI?.getState().then(render).catch(() => {});

toggle.addEventListener('click', () => window.desktopCardAPI?.toggleTask());
open.addEventListener('click', () => window.desktopCardAPI?.openTask());
close.addEventListener('click', () => window.desktopCardAPI?.closeCard());
pin.addEventListener('click', async () => {
  const nextValue = !(current?.alwaysOnTop === true);
  const result = await window.desktopCardAPI?.setAlwaysOnTop(nextValue).catch(() => null);
  if (result?.ok) render({ ...current, alwaysOnTop: nextValue });
});
editToggle.addEventListener('click', () => {
  if (editor.hidden) openEditor();
  else closeEditor();
});
editCancel.addEventListener('click', closeEditor);
editSave.addEventListener('click', saveEditor);
deadlinePresets?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-desktop-deadline]');
  if (!button) return;
  deadlineDraft = button.dataset.desktopDeadline;
  deadlinePresets.querySelectorAll('[data-desktop-deadline]').forEach((item) => {
    item.classList.toggle('active', item === button);
  });
});
title.addEventListener('keydown', (event) => {
  if (event.key === 'Enter' && !event.isComposing) {
    event.preventDefault();
    title.blur();
  }
  if (event.key === 'Escape') {
    title.textContent = current?.text || '待办';
    title.blur();
  }
});
title.addEventListener('blur', commitTitle);
card.addEventListener('dblclick', (event) => {
  if (event.target.closest('button, input, textarea, select, [contenteditable="true"]')) return;
  window.desktopCardAPI?.openTask();
});
