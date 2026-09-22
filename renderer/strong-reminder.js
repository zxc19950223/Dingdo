'use strict';

const api = window.notchAPI;
const root = document.getElementById('strong-root');
const taskTitle = document.getElementById('strong-task-title');
const taskMeta = document.getElementById('strong-task-meta');
const stepLabel = document.getElementById('strong-step-label');
const questionText = document.getElementById('strong-question-text');
const optionsElement = document.getElementById('strong-options');
const deadlineEditor = document.getElementById('strong-deadline-editor');
const deadlineLabel = document.getElementById('strong-deadline-label');
const deadlineInput = document.getElementById('strong-deadline');
const deadlineToggle = document.getElementById('strong-deadline-toggle');
const deadlinePicker = document.getElementById('strong-date-picker');
const deadlinePickerMonth = document.getElementById('strong-picker-month');
const deadlinePickerPrevious = document.getElementById('strong-picker-previous');
const deadlinePickerNext = document.getElementById('strong-picker-next');
const deadlinePickerGrid = document.getElementById('strong-picker-grid');
const deadlinePickerHour = document.getElementById('strong-picker-hour');
const deadlinePickerMinute = document.getElementById('strong-picker-minute');
const deadlinePickerToday = document.getElementById('strong-picker-today');
const deadlinePickerDone = document.getElementById('strong-picker-done');
const errorElement = document.getElementById('strong-error');
const backButton = document.getElementById('strong-back');
const nextButton = document.getElementById('strong-next');
const emergencyExit = document.getElementById('strong-emergency-exit');
const completeConfirm = document.getElementById('strong-complete-confirm');
const completeConfirmCancel = document.getElementById('strong-complete-cancel');
const completeConfirmButton = document.getElementById('strong-complete-confirm-button');
const progressItems = [...document.querySelectorAll('.strong-progress i')];

const ANSWER_OPTIONS = [
  [
    ['completed', '已完成'],
    ['not_completed', '未完成'],
  ],
  [
    ['deadline', '到任务截止时间再提醒'],
    ['custom', '自定义下一次强提醒时间'],
    ['stop', '不再强提醒'],
  ],
];

function customReminderExceedsDeadline() {
  const strongAt = Date.parse(String(deadlineInput?.value || ''));
  const deadlineAt = Date.parse(String(currentReminder?.deadline || ''));
  return Number.isFinite(strongAt)
    && Number.isFinite(deadlineAt)
    && strongAt > deadlineAt;
}

function answerOptionsForStep() {
  if (step === 0) return ANSWER_OPTIONS[0];
  const linked = currentReminder?.linked === true;
  const options = [
    ['deadline', '到任务截止时间再提醒'],
    [
      'custom',
      linked
        ? '自定义下一次强提醒时间（同时顺延截止时间）'
        : '自定义下一次强提醒时间',
    ],
  ];
  if (
    !linked
    && (
      answers[1] === 'custom_extend'
      || (answers[1] === 'custom' && customReminderExceedsDeadline())
    )
  ) {
    options.push(['custom_extend', '自定义并同时顺延截止时间']);
  }
  options.push(['stop', '不再强提醒']);
  return options;
}

let currentReminder = null;
let step = 0;
let answers = ['', ''];
let submitting = false;
let audioContext = null;
let completeConfirmTimer = null;
let deadlinePickerDate = null;

function formatDeadline(value) {
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return '未设置截止时间';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'numeric',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

function localInputValue(value) {
  const date = value ? new Date(value) : new Date(Date.now() + 60 * 60 * 1000);
  const safe = Number.isFinite(date.getTime()) ? date : new Date(Date.now() + 60 * 60 * 1000);
  const parts = [
    safe.getFullYear(),
    String(safe.getMonth() + 1).padStart(2, '0'),
    String(safe.getDate()).padStart(2, '0'),
  ];
  const time = [
    String(safe.getHours()).padStart(2, '0'),
    String(safe.getMinutes()).padStart(2, '0'),
  ];
  return `${parts.join('/')} ${time.join(':')}`;
}

function parseDeadlineInput(value = deadlineInput?.value) {
  const text = String(value || '').trim();
  const normalized = text.includes('T')
    ? text
    : text.replace(/\//g, '-').replace(' ', 'T');
  const parsed = new Date(normalized);
  if (Number.isFinite(parsed.getTime())) return parsed;
  const fallback = new Date(String(currentReminder?.deadline || ''));
  return Number.isFinite(fallback.getTime())
    ? fallback
    : new Date(Date.now() + 60 * 60 * 1000);
}

function ensureDeadlinePickerOptions() {
  if (deadlinePickerHour && !deadlinePickerHour.options.length) {
    for (let hour = 0; hour < 24; hour += 1) {
      deadlinePickerHour.add(new Option(String(hour).padStart(2, '0'), String(hour)));
    }
  }
  if (deadlinePickerMinute && !deadlinePickerMinute.options.length) {
    for (let minute = 0; minute < 60; minute += 1) {
      deadlinePickerMinute.add(new Option(String(minute).padStart(2, '0'), String(minute)));
    }
  }
}

function closeDeadlinePicker() {
  if (deadlinePicker) deadlinePicker.hidden = true;
  deadlineToggle?.classList.remove('active');
}

function positionDeadlinePicker() {
  if (!deadlinePicker || deadlinePicker.hidden) return;
  deadlinePicker.classList.add('opens-up');
}

function renderDeadlinePicker() {
  if (!deadlinePicker || !deadlinePickerDate) return;
  const selected = deadlinePickerDate;
  const year = selected.getFullYear();
  const month = selected.getMonth();
  const firstWeekday = (new Date(year, month, 1).getDay() + 6) % 7;
  const days = new Date(year, month + 1, 0).getDate();
  const today = new Date();
  if (deadlinePickerMonth) deadlinePickerMonth.textContent = `${year}年 ${month + 1}月`;
  deadlinePickerGrid?.replaceChildren();
  for (let index = 0; index < firstWeekday; index += 1) {
    deadlinePickerGrid.append(document.createElement('span'));
  }
  for (let day = 1; day <= days; day += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.textContent = String(day);
    button.dataset.strongPickerDay = String(day);
    button.classList.toggle('selected', day === selected.getDate());
    button.classList.toggle(
      'today',
      year === today.getFullYear() && month === today.getMonth() && day === today.getDate()
    );
    deadlinePickerGrid.append(button);
  }
  ensureDeadlinePickerOptions();
  if (deadlinePickerHour) deadlinePickerHour.value = String(selected.getHours());
  if (deadlinePickerMinute) deadlinePickerMinute.value = String(selected.getMinutes());
}

function setDeadlinePickerValue(date) {
  const safe = date instanceof Date && Number.isFinite(date.getTime())
    ? date
    : parseDeadlineInput();
  deadlinePickerDate = new Date(safe.getTime());
  deadlineInput.value = localInputValue(deadlinePickerDate.toISOString());
  handleDeadlineInputChanged();
  renderDeadlinePicker();
}

function openDeadlinePicker() {
  deadlinePickerDate = parseDeadlineInput();
  ensureDeadlinePickerOptions();
  renderDeadlinePicker();
  if (deadlinePicker) {
    deadlinePicker.classList.add('opens-up');
    deadlinePicker.hidden = false;
  }
  deadlineToggle?.classList.add('active');
}

function moveDeadlinePickerMonth(offset) {
  if (!deadlinePickerDate) return;
  const day = deadlinePickerDate.getDate();
  deadlinePickerDate.setDate(1);
  deadlinePickerDate.setMonth(deadlinePickerDate.getMonth() + offset);
  deadlinePickerDate.setDate(Math.min(
    day,
    new Date(
      deadlinePickerDate.getFullYear(),
      deadlinePickerDate.getMonth() + 1,
      0
    ).getDate()
  ));
  renderDeadlinePicker();
}

function playStrongSound() {
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) return;
  try {
    audioContext ||= new AudioContext();
    const context = audioContext;
    const startAt = context.currentTime + 0.02;
    [440, 659.25, 880].forEach((frequency, index) => {
      const oscillator = context.createOscillator();
      const gain = context.createGain();
      const noteStart = startAt + index * 0.12;
      const noteEnd = noteStart + 0.2;
      oscillator.type = 'triangle';
      oscillator.frequency.setValueAtTime(frequency, noteStart);
      gain.gain.setValueAtTime(0.0001, noteStart);
      gain.gain.exponentialRampToValueAtTime(0.18, noteStart + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteEnd);
      oscillator.connect(gain);
      gain.connect(context.destination);
      oscillator.start(noteStart);
      oscillator.stop(noteEnd + 0.02);
    });
    if (context.state === 'suspended') context.resume().catch(() => {});
  } catch (error) {}
}

function showError(message) {
  errorElement.textContent = message || '';
  errorElement.hidden = !message;
}

function renderStep() {
  stepLabel.textContent = `问题 ${step + 1} / 2`;
  questionText.textContent = currentReminder.questions[step] || `问题 ${step + 1}`;
  progressItems.forEach((item, index) => {
    item.classList.toggle('active', index === step);
    item.classList.toggle('done', index < step);
  });
  optionsElement.replaceChildren();
  answerOptionsForStep().forEach(([value, label]) => {
    const button = document.createElement('button');
    button.type = 'button';
    button.dataset.answer = value;
    button.textContent = label;
    button.classList.toggle('selected', answers[step] === value);
    button.addEventListener('click', () => {
      answers[step] = value;
      if (step === 0 && value === 'completed') {
        openCompletionConfirmation();
        return;
      }
      showError('');
      renderStep();
    });
    optionsElement.appendChild(button);
  });
  const changingDeadline = step === 1
    && ['custom', 'custom_extend'].includes(answers[1]);
  deadlineEditor.hidden = !changingDeadline;
  if (!changingDeadline) closeDeadlinePicker();
  if (deadlineLabel) {
    deadlineLabel.textContent = '选择下一次强提醒时间';
  }
  if (changingDeadline && !deadlineInput.value) {
    deadlineInput.value = localInputValue(currentReminder.deadline);
  }
  backButton.hidden = step === 0;
  nextButton.textContent = step === 1 ? '完成回答' : '下一步';
  nextButton.disabled = submitting || !answers[step];
}

function openCompletionConfirmation() {
  if (!completeConfirm) return;
  completeConfirm.hidden = false;
  completeConfirmButton.disabled = true;
  if (completeConfirmTimer) clearTimeout(completeConfirmTimer);
  completeConfirmTimer = setTimeout(() => {
    completeConfirmTimer = null;
    completeConfirmButton.disabled = false;
  }, 500);
  completeConfirmCancel.focus({ preventScroll: true });
}

function closeCompletionConfirmation(resetSelection = true) {
  if (completeConfirmTimer) clearTimeout(completeConfirmTimer);
  completeConfirmTimer = null;
  if (completeConfirm) completeConfirm.hidden = true;
  if (completeConfirmButton) completeConfirmButton.disabled = true;
  if (resetSelection) answers[0] = '';
  showError('');
  renderStep();
  requestAnimationFrame(() => {
    optionsElement.querySelector('[data-answer="not_completed"]')?.focus({ preventScroll: true });
  });
}

async function submitAnswers(completionConfirmed = false, submittedAnswers = answers) {
  if (submitting) return;
  submitting = true;
  nextButton.disabled = true;
  completeConfirmButton.disabled = true;
  try {
    const result = await api?.resolveStrongReminder?.({
      eventId: currentReminder.eventId,
      answers: submittedAnswers,
      completionConfirmed,
      strongReminderAt: ['custom', 'custom_extend'].includes(submittedAnswers[1])
        ? parseDeadlineInput().toISOString()
        : '',
    });
    if (!result?.ok) throw new Error(result?.error || 'resolve_failed');
    root.hidden = true;
  } catch (error) {
    submitting = false;
    nextButton.disabled = false;
    completeConfirmButton.disabled = false;
    if (emergencyExit) emergencyExit.hidden = false;
    showError('回答没有保存，请检查后重试。');
  }
}

function resetReminder(payload) {
  currentReminder = payload && typeof payload === 'object' ? payload : null;
  if (!currentReminder) return;
  step = 0;
  answers = ['', ''];
  submitting = false;
  if (completeConfirm) completeConfirm.hidden = true;
  if (completeConfirmButton) completeConfirmButton.disabled = true;
  if (emergencyExit) emergencyExit.hidden = true;
  deadlineInput.value = localInputValue(currentReminder.deadline);
  deadlinePickerDate = parseDeadlineInput(deadlineInput.value);
  closeDeadlinePicker();
  taskTitle.textContent = currentReminder.title || '待办';
  taskMeta.textContent = [
    currentReminder.detail,
    currentReminder.deadline ? `截止 ${formatDeadline(currentReminder.deadline)}` : '',
  ].filter(Boolean).join(' · ');
  showError('');
  nextButton.disabled = true;
  renderStep();
  root.hidden = false;
  playStrongSound();
}

backButton.addEventListener('click', () => {
  if (step === 0) return;
  closeDeadlinePicker();
  step -= 1;
  showError('');
  renderStep();
});

nextButton.addEventListener('click', async () => {
  if (submitting || !answers[step]) return;
  if (step === 1 && ['custom', 'custom_extend'].includes(answers[1]) && !deadlineInput.value) {
    showError('请选择下一次强提醒时间。');
    return;
  }
  if (step < 1) {
    step += 1;
    showError('');
    renderStep();
    return;
  }
  const submittedAnswers = [...answers];
  if (['custom', 'custom_extend'].includes(submittedAnswers[1])) {
    const exceedsDeadline = customReminderExceedsDeadline();
    if (submittedAnswers[1] === 'custom' && exceedsDeadline) {
      if (currentReminder.linked === true) {
        submittedAnswers[1] = 'custom_extend';
      } else {
        renderStep();
        showError('该时间晚于任务截止时间，请先选择“自定义并同时顺延截止时间”。');
        return;
      }
    }
    if (submittedAnswers[1] === 'custom_extend' && !exceedsDeadline) {
      submittedAnswers[1] = 'custom';
    }
  }
  await submitAnswers(false, submittedAnswers);
});

function handleDeadlineInputChanged() {
  let shouldRender = false;
  if (
    answers[1] === 'custom_extend'
    && !customReminderExceedsDeadline()
  ) {
    answers[1] = 'custom';
    shouldRender = true;
  }
  if (
    currentReminder?.linked !== true
    && (
      (answers[1] === 'custom' && customReminderExceedsDeadline())
      || answers[1] === 'custom_extend'
    )
  ) {
    shouldRender = true;
  }
  if (shouldRender) renderStep();
}

deadlineInput.addEventListener('input', () => {
  deadlinePickerDate = parseDeadlineInput();
  deadlineInput.value = localInputValue(deadlinePickerDate.toISOString());
  handleDeadlineInputChanged();
  if (deadlinePicker && !deadlinePicker.hidden) renderDeadlinePicker();
});

deadlineInput.addEventListener('click', () => {
  openDeadlinePicker();
});

deadlineToggle?.addEventListener('click', () => {
  if (deadlinePicker?.hidden === false) {
    closeDeadlinePicker();
    return;
  }
  openDeadlinePicker();
});

deadlinePickerPrevious?.addEventListener('click', () => {
  moveDeadlinePickerMonth(-1);
});

deadlinePickerNext?.addEventListener('click', () => {
  moveDeadlinePickerMonth(1);
});

deadlinePickerGrid?.addEventListener('click', (event) => {
  const button = event.target.closest('[data-strong-picker-day]');
  if (!button || !deadlinePickerDate) return;
  deadlinePickerDate.setDate(Number(button.dataset.strongPickerDay));
  setDeadlinePickerValue(deadlinePickerDate);
});

deadlinePickerHour?.addEventListener('change', () => {
  if (!deadlinePickerDate) return;
  deadlinePickerDate.setHours(Number(deadlinePickerHour.value));
  setDeadlinePickerValue(deadlinePickerDate);
});

deadlinePickerMinute?.addEventListener('change', () => {
  if (!deadlinePickerDate) return;
  deadlinePickerDate.setMinutes(Number(deadlinePickerMinute.value));
  setDeadlinePickerValue(deadlinePickerDate);
});

deadlinePickerToday?.addEventListener('click', () => {
  const now = new Date();
  const next = deadlinePickerDate || parseDeadlineInput();
  next.setFullYear(now.getFullYear(), now.getMonth(), now.getDate());
  setDeadlinePickerValue(next);
});

deadlinePickerDone?.addEventListener('click', () => {
  closeDeadlinePicker();
});

completeConfirmCancel?.addEventListener('click', () => {
  closeCompletionConfirmation(true);
});

completeConfirmButton?.addEventListener('click', async () => {
  if (completeConfirmButton.disabled || submitting) return;
  answers = ['completed', 'stop'];
  if (completeConfirm) completeConfirm.hidden = true;
  await submitAnswers(true);
});

emergencyExit?.addEventListener('click', async () => {
  if (!currentReminder) return;
  emergencyExit.disabled = true;
  try {
    const result = await api?.abortStrongReminder?.({
      eventId: currentReminder.eventId,
    });
    if (!result?.ok) throw new Error(result?.error || 'abort_failed');
    root.hidden = true;
  } catch (error) {
    emergencyExit.disabled = false;
    showError('应急退出失败，请使用系统强制退出应用。');
  }
});

root.addEventListener('click', (event) => {
  if (deadlinePicker?.hidden !== false) return;
  const clickedInsideEditor = event.composedPath().some((node) => (
    node === deadlineEditor || deadlineEditor?.contains(node)
  ));
  if (clickedInsideEditor) return;
  closeDeadlinePicker();
});

window.addEventListener('resize', positionDeadlinePicker);

window.addEventListener('keydown', (event) => {
  if (event.key !== 'Escape') return;
  event.preventDefault();
  if (!deadlinePicker?.hidden) {
    closeDeadlinePicker();
    return;
  }
  if (!completeConfirm?.hidden) closeCompletionConfirmation(true);
});

api?.onStrongReminder?.(resetReminder);
