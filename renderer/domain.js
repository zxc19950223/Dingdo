(function exposeNotchDomain(root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.NotchDomain = api;
})(typeof window !== 'undefined' ? window : globalThis, function createNotchDomain() {
  const CATEGORY_RULES = [
    ['开发', /github|gitlab|gitee|stackoverflow|developer|docs\.|npmjs|vercel|cloudflare|code|openai|anthropic/i],
    ['工作', /feishu|larksuite|notion|slack|trello|asana|figma|miro|office|docs\.google/i],
    ['学习', /wikipedia|coursera|udemy|edx|medium|juejin|zhihu|yuque|book|learn/i],
    ['影音', /bilibili|youtube|youku|iqiyi|netflix|spotify|music|video/i],
    ['社交', /weibo|twitter|x\.com|facebook|instagram|reddit|discord|wechat/i],
    ['购物', /taobao|tmall|jd\.com|amazon|shop|mall/i],
  ];
  const NESTED_PUBLIC_SUFFIXES = new Set([
    'co.uk', 'org.uk', 'ac.uk', 'com.cn', 'net.cn', 'org.cn', 'com.au', 'net.au',
    'co.jp', 'co.kr', 'co.nz', 'github.io', 'gitlab.io', 'vercel.app', 'pages.dev',
    'netlify.app', 'notion.site',
  ]);
  const DEFAULT_STRONG_REMINDER_QUESTIONS = [
    '这个待办完成了吗？',
    '下一次强提醒怎么处理？',
  ];

  function isLocalHostname(hostname) {
    const host = String(hostname || '').toLowerCase().replace(/^\[|\]$/g, '');
    if (!host || host === 'localhost' || host.endsWith('.localhost') || host.endsWith('.local')) {
      return true;
    }
    if (host === '::1' || host === '0:0:0:0:0:0:0:1') return true;
    const octets = host.split('.').map(Number);
    if (octets.length !== 4 || octets.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) {
      return false;
    }
    return (
      octets[0] === 10 ||
      octets[0] === 127 ||
      octets[0] === 0 ||
      (octets[0] === 169 && octets[1] === 254) ||
      (octets[0] === 172 && octets[1] >= 16 && octets[1] <= 31) ||
      (octets[0] === 192 && octets[1] === 168)
    );
  }

  function normalizeHttpUrl(value) {
    const input = String(value || '').trim();
    if (!input) return null;
    const candidate = /^[a-z][a-z\d+.-]*:/i.test(input) ? input : `https://${input}`;
    try {
      const url = new URL(candidate);
      if (!['http:', 'https:'].includes(url.protocol) || isLocalHostname(url.hostname)) return null;
      url.username = '';
      url.password = '';
      return url.toString();
    } catch (error) {
      return null;
    }
  }

  function classifyLink(url, title) {
    const haystack = `${url || ''} ${title || ''}`;
    const matched = CATEGORY_RULES.find(([, pattern]) => pattern.test(haystack));
    return matched ? matched[0] : '其他';
  }

  function addLinkToGroups(groups, link, category) {
    const source = Array.isArray(groups) ? groups : [];
    const groupName = String(category || '').trim() || '其他';
    const index = source.findIndex((group) => group && group.name === groupName);
    if (index >= 0) {
      return source.map((group, groupIndex) => groupIndex === index
        ? { ...group, links: [...(Array.isArray(group.links) ? group.links : []), link] }
        : group);
    }
    return [...source, {
      id: `group-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: groupName,
      collapsed: false,
      links: [link],
    }];
  }

  function linkHostname(value) {
    try {
      return new URL(String(value || '')).hostname.toLowerCase().replace(/^www\./, '');
    } catch (error) {
      return '';
    }
  }

  function relatedHostnames(left, right) {
    const siteRoot = (hostname) => {
      const parts = String(hostname || '').split('.').filter(Boolean);
      if (parts.length < 2) return parts[0] || '';
      const suffix = parts.slice(-2).join('.');
      return NESTED_PUBLIC_SUFFIXES.has(suffix) && parts.length > 2
        ? parts.slice(-3).join('.')
        : suffix;
    };
    return Boolean(left && right && (
      left === right || left.endsWith(`.${right}`) || right.endsWith(`.${left}`)
      || siteRoot(left) === siteRoot(right)
    ));
  }

  function preferredLinkGroupId(groups, url) {
    const hostname = linkHostname(url);
    if (!hostname) return '';
    const group = (Array.isArray(groups) ? groups : []).find((item) => (
      item && Array.isArray(item.links) && item.links.some((link) => (
        relatedHostnames(hostname, linkHostname(link && link.url))
      ))
    ));
    return group ? String(group.id || '') : '';
  }

  function cloneLinkGroups(groups) {
    return (Array.isArray(groups) ? groups : []).map((group) => ({
      ...group,
      links: [...(Array.isArray(group.links) ? group.links : [])],
    }));
  }

  // 把链接放到目标分组的指定位置。targetIndex 为 null 时追加到末尾。
  // 组内调顺序和跨组搬运走的是同一条路径，区别只在 targetGroupId 是否等于原分组。
  // targetIndex 按「移动前」目标分组的下标来算，调用方直接用界面上看到的行序即可。
  function moveLinkToPosition(groups, linkId, targetGroupId, targetIndex = null) {
    const source = Array.isArray(groups) ? groups : [];
    const id = String(linkId || '');
    const targetId = String(targetGroupId || '');
    let sourceGroupId = '';
    source.some((group) => {
      const found = group && Array.isArray(group.links)
        ? group.links.find((link) => link && String(link.id) === id)
        : null;
      if (!found) return false;
      sourceGroupId = String(group.id || '');
      return true;
    });
    if (!sourceGroupId || !targetId
      || !source.some((group) => group && String(group.id) === targetId)) {
      return cloneLinkGroups(source);
    }

    const next = cloneLinkGroups(source);
    const from = next.find((group) => String(group.id) === sourceGroupId);
    const fromIndex = from.links.findIndex((link) => String(link && link.id) === id);
    const [movingLink] = from.links.splice(fromIndex, 1);
    const target = next.find((group) => String(group.id) === targetId);

    let insertAt = target.links.length;
    if (targetIndex !== null && Number.isFinite(Number(targetIndex))) {
      insertAt = Number(targetIndex);
      // 同组内先摘后插，落点在原位置之后时下标要减一，否则会多跳一格。
      if (sourceGroupId === targetId && insertAt > fromIndex) insertAt -= 1;
      insertAt = Math.max(0, Math.min(target.links.length, insertAt));
    }
    target.links.splice(insertAt, 0, movingLink);
    return next;
  }

  // 只负责「整条丢到目标分组末尾」，同组视为无操作（拖到折叠分组的标题上就是这个语义）。
  function moveLinkToGroup(groups, linkId, targetGroupId) {
    const source = Array.isArray(groups) ? groups : [];
    const id = String(linkId || '');
    const sourceGroup = source.find((group) => group && Array.isArray(group.links)
      && group.links.some((link) => link && String(link.id) === id));
    if (sourceGroup && String(sourceGroup.id) === String(targetGroupId || '')) {
      return cloneLinkGroups(source);
    }
    return moveLinkToPosition(groups, linkId, targetGroupId, null);
  }

  function renameGroup(groups, groupId, name) {
    const nextName = String(name || '').trim();
    return (Array.isArray(groups) ? groups : []).map((group) => (
      group && group.id === groupId && nextName ? { ...group, name: nextName } : group
    ));
  }

  function prependClipboardHistory(history, entry, maxEntries = 100) {
    const limit = Math.max(1, Math.floor(Number(maxEntries) || 100));
    const next = [entry, ...(Array.isArray(history) ? history : [])];
    return {
      history: next.slice(0, limit),
      evicted: next.slice(limit),
    };
  }

  function createCommand(text, id, createdAt) {
    const normalized = String(text || '').trim();
    if (!normalized) return null;
    return {
      id: String(id || `command-${Date.now().toString(36)}`),
      text: normalized,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
    };
  }

  function createExclusiveAsyncTask(onPendingChange) {
    const notify = typeof onPendingChange === 'function' ? onPendingChange : () => {};
    let pending = null;
    return {
      run(task) {
        if (pending) return pending;
        if (typeof task !== 'function') return Promise.reject(new TypeError('task must be a function'));
        let resolveWork;
        let rejectWork;
        const work = new Promise((resolve, reject) => {
          resolveWork = resolve;
          rejectWork = reject;
        });
        const tracked = work.finally(() => {
          if (pending !== tracked) return;
          pending = null;
          notify(false);
        });
        pending = tracked;
        notify(true);
        try {
          Promise.resolve(task()).then(resolveWork, rejectWork);
        } catch (error) {
          rejectWork(error);
        }
        return tracked;
      },
      isPending() {
        return pending !== null;
      },
    };
  }

  function createRecording(value) {
    if (!value || typeof value !== 'object') return null;
    const transcript = String(value.transcript || '').trim();
    const createdAt = Number.isFinite(value.createdAt) ? value.createdAt : Date.now();
    const fallbackTitle = new Date(createdAt).toLocaleString('zh-CN', {
      month: 'numeric',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
    return {
      id: String(value.id || `recording-${Date.now().toString(36)}`),
      createdAt,
      durationMs: Math.max(0, Math.round(Number(value.durationMs) || 0)),
      transcript,
      audioPath: typeof value.audioPath === 'string' ? value.audioPath : '',
      mimeType: typeof value.mimeType === 'string' ? value.mimeType : 'audio/webm',
      title: String(value.title || fallbackTitle).trim(),
      category: String(value.category || '未分类').replace(/\s+/g, ' ').trim().slice(0, 24),
    };
  }

  function removeRecordingState(recordings, recordingId, selection, selectedId) {
    const rows = Array.isArray(recordings) ? recordings : [];
    const id = String(recordingId || '');
    const index = rows.findIndex((recording) => recording && String(recording.id) === id);
    if (index < 0) {
      return {
        recordings: rows.slice(),
        selection: Array.isArray(selection) ? selection.slice() : [],
        selectedId: String(selectedId || ''),
      };
    }
    const nextRows = rows.filter((recording) => String(recording && recording.id) !== id);
    const currentSelectedId = String(selectedId || '');
    const nextSelectedId = currentSelectedId !== id && nextRows.some((recording) => String(recording.id) === currentSelectedId)
      ? currentSelectedId
      : String(nextRows[Math.min(index, nextRows.length - 1)]?.id || '');
    return {
      recordings: nextRows,
      selection: (Array.isArray(selection) ? selection : []).filter((selected) => String(selected) !== id),
      selectedId: nextSelectedId,
    };
  }

  function calculateRecordingDuration(value) {
    const startedAt = Number(value && value.startedAt) || 0;
    if (!startedAt) return 0;
    const pausedAt = Number(value && value.pausedAt) || 0;
    const now = Number(value && value.now) || Date.now();
    const end = value && value.status === 'paused' && pausedAt ? pausedAt : now;
    const pausedTotalMs = Math.max(0, Number(value && value.pausedTotalMs) || 0);
    return Math.max(0, Math.round(end - startedAt - pausedTotalMs));
  }

  function completionMatchesWindow(completion, windowInfo) {
    const project = String(completion && completion.project || '').trim().toLocaleLowerCase();
    const title = String(windowInfo && windowInfo.title || '').trim().toLocaleLowerCase();
    if (!project || !title) return false;
    return title.includes(project);
  }

  function deriveWindowDisplayName(item) {
    const appName = String(item && item.appName || '').replace(/\s+/g, ' ').trim() || '应用';
    const title = String(item && item.title || '').replace(/\s+/g, ' ').trim();
    if (!title) return appName;

    const editorPattern = /(?:visual studio code|\bcode\b|cursor|vscodium|windsurf)/i;
    const titleLooksLikeEditor = /(?:—|-|\|)\s*(?:visual studio code|cursor|vscodium|windsurf)\s*$/i.test(title);
    const pieces = title
      .split(/\s+(?:—|–|\|)\s+/)
      .map((piece) => piece.trim())
      .filter(Boolean);

    if (editorPattern.test(appName) || titleLooksLikeEditor) {
      const editorPieces = pieces.filter((piece) => !/^(?:visual studio code|cursor|vscodium|windsurf)$/i.test(piece));
      if (!editorPieces.length) return appName;
      if (editorPieces.length === 1) return editorPieces[0].slice(0, 44);
      return editorPieces[editorPieces.length - 1].slice(0, 44);
    }

    const appKey = appName.toLocaleLowerCase();
    if (pieces.length > 1 && pieces[pieces.length - 1].toLocaleLowerCase() === appKey) {
      return pieces.slice(0, -1).join(' — ').slice(0, 44) || appName;
    }
    return title.toLocaleLowerCase() === appKey ? appName : title.slice(0, 44);
  }

  function numberWindowLabels(items) {
    const rows = Array.isArray(items) ? items.filter(Boolean) : [];
    const totals = new Map();
    rows.forEach((item) => {
      const key = deriveWindowDisplayName(item).toLocaleLowerCase();
      if (key) totals.set(key, (totals.get(key) || 0) + 1);
    });
    const indexes = new Map();
    return rows.map((item) => {
      const label = deriveWindowDisplayName(item);
      const key = label.toLocaleLowerCase();
      const index = (indexes.get(key) || 0) + 1;
      indexes.set(key, index);
      return {
        ...item,
        displayName: (totals.get(key) || 0) > 1 ? `${label} · ${index}` : label,
      };
    });
  }

  function createTodo(text, deadline, id, createdAt) {
    const normalizedText = String(text || '').trim();
    const deadlineMs = Date.parse(String(deadline || '').trim());
    if (!normalizedText || !Number.isFinite(deadlineMs)) return null;
    return {
      id: String(id || `todo-${Date.now().toString(36)}`),
      text: normalizedText,
      done: false,
      createdAt: Number.isFinite(createdAt) ? createdAt : Date.now(),
      deadline: new Date(deadlineMs).toISOString(),
      remindedAt: 0,
    };
  }

  function updateTodo(todo, text, deadline) {
    if (!todo || typeof todo !== 'object') return null;
    const normalized = createTodo(text, deadline, todo.id, todo.createdAt);
    if (!normalized) return null;
    return {
      ...todo,
      ...normalized,
      done: todo.done === true,
      remindedAt: Date.parse(String(todo.deadline || '')) === Date.parse(normalized.deadline)
        ? Math.max(0, Number(todo.remindedAt) || 0)
        : 0,
    };
  }

  function sortTodosForDisplay(items) {
    return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
      const doneDifference = Number(left && left.done === true) - Number(right && right.done === true);
      if (doneDifference) return doneDifference;
      const leftDeadline = Date.parse(String(left && left.deadline || ''));
      const rightDeadline = Date.parse(String(right && right.deadline || ''));
      const safeLeftDeadline = Number.isFinite(leftDeadline) ? leftDeadline : Number.POSITIVE_INFINITY;
      const safeRightDeadline = Number.isFinite(rightDeadline) ? rightDeadline : Number.POSITIVE_INFINITY;
      if (safeLeftDeadline !== safeRightDeadline) return safeLeftDeadline - safeRightDeadline;
      const leftCreatedAt = Number(left && left.createdAt);
      const rightCreatedAt = Number(right && right.createdAt);
      const safeLeftCreatedAt = Number.isFinite(leftCreatedAt) ? leftCreatedAt : Number.POSITIVE_INFINITY;
      const safeRightCreatedAt = Number.isFinite(rightCreatedAt) ? rightCreatedAt : Number.POSITIVE_INFINITY;
      if (safeLeftCreatedAt !== safeRightCreatedAt) return safeLeftCreatedAt - safeRightCreatedAt;
      return String(left && left.id || '').localeCompare(String(right && right.id || ''));
    });
  }

  const TODO_PRIORITIES = ['none', 'low', 'medium', 'high', 'urgent'];
  const TODO_STATUSES = ['todo', 'in_progress', 'blocked', 'done'];
  const TODO_STATUS_LABELS = {
    todo: '待办',
    in_progress: '进行中',
    blocked: '受阻',
    done: '已完成',
  };
  const TODO_BLOCK_REASON_TYPES = [
    'waiting',
    'materials',
    'time',
    'conditions',
    'changed',
    'personal',
    'other',
  ];
  const TODO_BLOCK_REASON_LABELS = {
    waiting: '等待别人',
    materials: '资料不足',
    time: '时间不够',
    conditions: '条件未满足',
    changed: '计划变化',
    personal: '个人原因',
    other: '其他',
  };
  const TODO_PRIORITY_RANK = {
    none: 0,
    low: 1,
    medium: 2,
    high: 3,
    urgent: 4,
  };
  const TODO_INBOX_ID = 'inbox';

  function normalizeTodoText(value, maxLength = 120) {
    return Array.from(String(value || '').replace(/\s+/g, ' ').trim())
      .slice(0, maxLength)
      .join('');
  }

  function normalizeTodoNotes(value) {
    return String(value == null ? '' : value)
      .replace(/\r\n?/g, '\n')
      .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '')
      .slice(0, 12000);
  }

  function normalizeTodoDate(value) {
    const timestamp = Date.parse(String(value || '').trim());
    return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : '';
  }

  function sameTodoMinute(left, right) {
    const leftTime = Date.parse(String(left || ''));
    const rightTime = Date.parse(String(right || ''));
    if (!Number.isFinite(leftTime) || !Number.isFinite(rightTime)) return false;
    return Math.floor(leftTime / 60000) === Math.floor(rightTime / 60000);
  }

  function normalizeTodoPriority(value) {
    const priority = String(value || '').trim().toLowerCase();
    return TODO_PRIORITIES.includes(priority) ? priority : 'none';
  }

  function normalizeTodoStatus(value, done = false) {
    if (done) return 'done';
    const status = String(value || '').trim().toLowerCase();
    return TODO_STATUSES.includes(status) && status !== 'done' ? status : 'todo';
  }

  function normalizeTodoBlockReasonType(value) {
    const type = String(value || '').trim().toLowerCase();
    return TODO_BLOCK_REASON_TYPES.includes(type) ? type : '';
  }

  function normalizeTodoLongText(value, maxLength) {
    return normalizeTodoNotes(value).slice(0, maxLength).trim();
  }

  function normalizeTodoSubtasks(value) {
    return (Array.isArray(value) ? value : [])
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const text = normalizeTodoText(item.text || item.title, 160);
        if (!text) return null;
        return {
          id: String(item.id || `subtask-${index}-${Math.random().toString(36).slice(2, 8)}`),
          text,
          done: item.done === true,
          order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
          createdAt: Math.max(0, Number(item.createdAt) || Date.now()),
          completedAt: Math.max(0, Number(item.completedAt) || 0),
        };
      })
      .filter(Boolean)
      .sort((left, right) => left.order - right.order)
      .map((item, index) => ({ ...item, order: index }));
  }

  function normalizeTodoReminders(value, deadline, fallbackOffsetMinutes = null) {
    const deadlineMs = Date.parse(String(deadline || ''));
    const source = Array.isArray(value) ? value : [];
    const normalized = source
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const explicitAt = normalizeTodoDate(item.at);
        const offsetCandidate = item.offsetMinutes === null || item.offsetMinutes === ''
          ? NaN
          : Number(item.offsetMinutes);
        const offsetMinutes = Number.isFinite(offsetCandidate)
          ? Math.max(0, Math.min(525600, Math.round(offsetCandidate)))
          : null;
        const at = explicitAt || (
          Number.isFinite(deadlineMs) && offsetMinutes !== null
            ? new Date(deadlineMs - offsetMinutes * 60 * 1000).toISOString()
            : ''
        );
        if (!at) return null;
        return {
          id: String(item.id || `reminder-${index}-${Math.random().toString(36).slice(2, 8)}`),
          offsetMinutes,
          at,
          firedAt: Math.max(0, Number(item.firedAt || item.remindedAt) || 0),
          soundId: ['none', 'soft', 'bright', 'alert'].includes(item.soundId)
            ? item.soundId
            : 'bright',
          strong: item.strong === true,
        };
      })
      .filter(Boolean);
    if (normalized.length || !Number.isFinite(deadlineMs) || !Number.isFinite(fallbackOffsetMinutes)) {
      return normalized;
    }
    return [{
      id: `reminder-${fallbackOffsetMinutes}`,
      offsetMinutes: fallbackOffsetMinutes,
      at: new Date(deadlineMs - fallbackOffsetMinutes * 60 * 1000).toISOString(),
      firedAt: 0,
      soundId: 'bright',
    }];
  }

  function normalizeTodoReminderOffsets(value, fallback = [60]) {
    const source = Array.isArray(value) ? value : fallback;
    return [...new Set(source
      .map((item) => Math.round(Number(item)))
      .filter((item) => Number.isFinite(item) && item > 0 && item <= 525600))]
      .sort((left, right) => left - right);
  }

  function normalizeTodoRecurrence(value) {
    if (!value || typeof value !== 'object') return null;
    const unit = ['day', 'weekday', 'week', 'month'].includes(value.unit) ? value.unit : '';
    if (!unit) return null;
    return {
      unit,
      interval: Math.max(1, Math.min(365, Math.round(Number(value.interval) || 1))),
    };
  }

  function nextTodoDeadline(recurrence, fromValue, now = Date.now()) {
    const normalized = normalizeTodoRecurrence(recurrence);
    const from = new Date(String(fromValue || ''));
    const base = Number.isFinite(from.getTime()) ? from : new Date(now);
    const next = new Date(base.getTime());
    const interval = normalized?.interval || 1;
    if (!normalized) return '';
    if (normalized.unit === 'day') {
      next.setDate(next.getDate() + interval);
    } else if (normalized.unit === 'week') {
      next.setDate(next.getDate() + interval * 7);
    } else if (normalized.unit === 'month') {
      const day = next.getDate();
      next.setDate(1);
      next.setMonth(next.getMonth() + interval);
      next.setDate(Math.min(day, new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate()));
    } else if (normalized.unit === 'weekday') {
      let remaining = interval;
      while (remaining > 0) {
        next.setDate(next.getDate() + 1);
        if (next.getDay() !== 0 && next.getDay() !== 6) remaining -= 1;
      }
    }
    return next.toISOString();
  }

  function normalizeTodoTemplate(value, lists, index = 0) {
    if (!value || typeof value !== 'object') return null;
    const text = normalizeTodoText(value.text || value.title, 120);
    if (!text) return null;
    const listIds = new Set((Array.isArray(lists) ? lists : []).map((list) => list.id));
    const listId = listIds.has(String(value.listId || '')) ? String(value.listId) : TODO_INBOX_ID;
    const deadlineOffsetMinutes = Number(value.deadlineOffsetMinutes);
    return {
      id: String(value.id || `template-${index}-${Math.random().toString(36).slice(2, 8)}`),
      name: normalizeTodoText(value.name || text, 48) || text,
      text,
      listId,
      notes: normalizeTodoNotes(value.notes),
      priority: normalizeTodoPriority(value.priority),
      deadlineOffsetMinutes: Number.isFinite(deadlineOffsetMinutes)
        ? Math.max(0, Math.min(525600, Math.round(deadlineOffsetMinutes)))
        : null,
      reminderOffsets: normalizeTodoReminderOffsets(value.reminderOffsets, []),
      soundId: ['none', 'soft', 'bright', 'alert'].includes(value.soundId)
        ? value.soundId
        : 'bright',
      subtasks: (Array.isArray(value.subtasks) ? value.subtasks : [])
        .map((item, subtaskIndex) => normalizeTodoText(item?.text || item, 160))
        .filter(Boolean)
        .map((subtaskText, subtaskIndex) => ({ id: `template-subtask-${subtaskIndex}`, text: subtaskText, done: false, order: subtaskIndex })),
    };
  }

  function normalizeSavedTodoFilter(value, index = 0) {
    if (!value || typeof value !== 'object') return null;
    const name = normalizeTodoText(value.name, 40);
    const view = String(value.view || '').trim();
    if (!name || (!['inbox', 'today', 'upcoming', 'overdue', 'all', 'completed', 'calendar', 'history', 'trash'].includes(view)
      && !view.startsWith('list:'))) return null;
    return {
      id: String(value.id || `filter-${index}-${Math.random().toString(36).slice(2, 8)}`),
      name,
      view,
      query: String(value.query || '').slice(0, 200),
      priority: TODO_PRIORITIES.includes(value.priority) ? value.priority : 'none',
    };
  }

  function normalizeStrongReminderQuestions(value) {
    const source = Array.isArray(value) ? value : [];
    return DEFAULT_STRONG_REMINDER_QUESTIONS.map((fallback, index) => (
      normalizeTodoText(source[index], 120) || fallback
    ));
  }

  function normalizeDailyReviewSettings(value) {
    const source = value && typeof value === 'object' ? value : {};
    const time = String(source.time || '').trim();
    return {
      enabled: source.enabled === true,
      time: /^([01]\d|2[0-3]):[0-5]\d$/.test(time) ? time : '18:00',
    };
  }

  function normalizeSiriImportSettings(value, lists) {
    const source = value && typeof value === 'object' ? value : {};
    const listIds = new Set((Array.isArray(lists) ? lists : []).map((list) => list.id));
    const targetListId = listIds.has(String(source.targetListId || ''))
      ? String(source.targetListId)
      : TODO_INBOX_ID;
    return {
      enabled: source.enabled === true,
      reminderListId: String(source.reminderListId || '').trim().slice(0, 200),
      targetListId,
      importedIds: [...new Set(
        (Array.isArray(source.importedIds) ? source.importedIds : [])
          .map((id) => String(id || '').trim())
          .filter(Boolean)
      )].slice(-2000),
    };
  }

  function normalizeTodoActivity(value) {
    return (Array.isArray(value) ? value : [])
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const message = normalizeTodoText(item.message || item.text, 320);
        if (!message) return null;
        return {
          id: String(item.id || `activity-${index}-${Math.random().toString(36).slice(2, 8)}`),
          type: normalizeTodoText(item.type || 'general', 40) || 'general',
          at: normalizeTodoDate(item.at) || new Date().toISOString(),
          message,
        };
      })
      .filter(Boolean)
      .sort((left, right) => Date.parse(left.at) - Date.parse(right.at))
      .slice(-800);
  }

  function normalizeTodoSettings(value, lists) {
    const source = value && typeof value === 'object' ? value : {};
    const missedReminderPolicy = ['none', '1h', '24h', '3d'].includes(source.missedReminderPolicy)
      ? source.missedReminderPolicy
      : '24h';
    return {
      missedReminderPolicy,
      strongReminderQuestions: normalizeStrongReminderQuestions(source.strongReminderQuestions),
      dailyReview: normalizeDailyReviewSettings(source.dailyReview),
      siriImport: normalizeSiriImportSettings(source.siriImport, lists),
      templates: (Array.isArray(source.templates) ? source.templates : [])
        .map((item, index) => normalizeTodoTemplate(item, lists, index))
        .filter(Boolean)
        .slice(0, 50),
      savedFilters: (Array.isArray(source.savedFilters) ? source.savedFilters : [])
        .map((item, index) => normalizeSavedTodoFilter(item, index))
        .filter(Boolean)
        .slice(0, 50),
    };
  }

  function normalizeReminderHistory(value) {
    return (Array.isArray(value) ? value : [])
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const taskId = String(item.taskId || '').trim();
        const title = normalizeTodoText(item.title, 160);
        if (!taskId || !title) return null;
        return {
          id: String(item.id || `history-${index}-${Math.random().toString(36).slice(2, 8)}`),
          taskId,
          title,
          reminderId: String(item.reminderId || ''),
          status: ['fired', 'snoozed', 'missed', 'dismissed'].includes(item.status)
            ? item.status
            : 'fired',
          at: normalizeTodoDate(item.at),
          firedAt: Math.max(0, Number(item.firedAt) || 0),
          soundId: ['none', 'soft', 'bright', 'alert'].includes(item.soundId)
            ? item.soundId
            : 'bright',
        };
      })
      .filter(Boolean)
      .sort((left, right) => right.firedAt - left.firedAt)
      .slice(0, 500);
  }

  function createTodoList(lists, name, parentId, id, createdAt, options = {}) {
    const rows = Array.isArray(lists) ? lists : [];
    const normalizedName = normalizeTodoText(name, 24);
    const requestedParentId = String(parentId || '').trim();
    const parent = requestedParentId
      ? rows.find((item) => item && item.id === requestedParentId)
      : null;
    if (!normalizedName || (requestedParentId && (!parent || parent.parentId))) return null;
    const duplicate = rows.some((item) => (
      item
      && item.name === normalizedName
      && String(item.parentId || '') === String(parent && parent.id || '')
    ));
    if (duplicate) return null;
    return {
      id: String(id || `list-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`),
      name: normalizedName,
      parentId: parent ? parent.id : '',
      order: rows.length,
      createdAt: Math.max(0, Number(createdAt) || Date.now()),
      defaultReminderOffsets: normalizeTodoReminderOffsets(options.defaultReminderOffsets),
      defaultSoundId: ['none', 'soft', 'bright', 'alert'].includes(options.defaultSoundId)
        ? options.defaultSoundId
        : 'bright',
      sortMode: options.sortMode === 'manual' ? 'manual' : 'auto',
    };
  }

  function createDetailedTodo(input, lists, id, now) {
    const source = input && typeof input === 'object' ? input : {};
    const text = normalizeTodoText(source.text || source.title, 120);
    if (!text) return null;
    const listRows = Array.isArray(lists) ? lists : [];
    const requestedListId = String(source.listId || '').trim();
    const listId = requestedListId === TODO_INBOX_ID
      || listRows.some((item) => item && item.id === requestedListId)
      ? requestedListId
      : TODO_INBOX_ID;
    const createdAt = Math.max(0, Number(source.createdAt) || Number(now) || Date.now());
    const updatedAt = Math.max(createdAt, Number(source.updatedAt) || createdAt);
    const deadline = normalizeTodoDate(source.deadline);
    const normalizedReminders = normalizeTodoReminders(source.reminders, deadline);
    const requestedStrongReminderAt = normalizeTodoDate(source.strongReminderAt)
      || normalizeTodoDate((Array.isArray(source.reminders) ? source.reminders : [])
        .find((reminder) => reminder?.strong === true)?.at)
      || (source.strongReminder === true ? deadline : '');
    const strongReminderLinked = source.strongReminder === true
      && Boolean(requestedStrongReminderAt)
      && (
        typeof source.strongReminderLinked === 'boolean'
          ? source.strongReminderLinked
          : sameTodoMinute(requestedStrongReminderAt, deadline)
      );
    const strongReminderAt = strongReminderLinked && deadline
      ? deadline
      : requestedStrongReminderAt;
    const reminders = normalizedReminders.map((reminder) => (
      reminder.strong === true && strongReminderAt
        ? { ...reminder, at: strongReminderAt }
        : reminder
    ));
    const done = source.done === true;
    const status = normalizeTodoStatus(source.status, done);
    const blocked = status === 'blocked';
    const unhandledReminderAt = done ? '' : normalizeTodoDate(source.unhandledReminderAt);
    return {
      id: String(source.id || id || `todo-${Date.now().toString(36)}`),
      text,
      listId,
      notes: normalizeTodoNotes(source.notes),
      externalSource: source.externalSource === 'apple-reminders' ? 'apple-reminders' : '',
      externalId: source.externalSource === 'apple-reminders'
        ? normalizeTodoText(source.externalId, 300)
        : '',
      unhandledReminderAt,
      unhandledReminderId: unhandledReminderAt
        ? normalizeTodoText(source.unhandledReminderId, 300)
        : '',
      done,
      status,
      blockedAt: blocked ? Math.max(0, Number(source.blockedAt) || updatedAt) : 0,
      blockReasonType: blocked ? normalizeTodoBlockReasonType(source.blockReasonType) : '',
      blockReason: blocked ? normalizeTodoLongText(source.blockReason, 2000) : '',
      nextAction: blocked ? normalizeTodoLongText(source.nextAction, 1200) : '',
      priority: normalizeTodoPriority(source.priority),
      startAt: normalizeTodoDate(source.startAt),
      deadline,
      createdAt,
      updatedAt,
      completedAt: done ? Math.max(0, Number(source.completedAt) || updatedAt) : 0,
      reminders,
      remindersInitialized: source.remindersInitialized === true,
      strongReminder: source.strongReminder === true && Boolean(strongReminderAt),
      strongReminderAt,
      strongReminderLinked,
      activity: normalizeTodoActivity(source.activity),
      subtasks: normalizeTodoSubtasks(source.subtasks),
      tags: (Array.isArray(source.tags) ? source.tags : [])
        .map((tag) => normalizeTodoText(tag, 24))
        .filter(Boolean)
        .slice(0, 12),
      pinned: source.pinned === true,
      recurrence: normalizeTodoRecurrence(source.recurrence),
      order: Number.isFinite(Number(source.order)) ? Number(source.order) : 0,
    };
  }

  function updateDetailedTodo(todo, updates, lists, now = Date.now()) {
    if (!todo || typeof todo !== 'object') return null;
    const next = createDetailedTodo({
      ...todo,
      ...(updates && typeof updates === 'object' ? updates : {}),
      id: todo.id,
      createdAt: todo.createdAt,
      updatedAt: now,
    }, lists, todo.id, now);
    if (!next) return null;
    return next;
  }

  function normalizeTodoWorkspace(value, options = {}) {
    const source = value && typeof value === 'object' ? value : {};
    const defaults = options.categoryNames && typeof options.categoryNames === 'object'
      ? options.categoryNames
      : {
        P0: '课程',
        P1: '自媒体&写作',
        P2: 'Vibe coding',
        P3: '日常',
      };
    const isV2 = Number(source.version) >= 2 && Array.isArray(source.lists) && Array.isArray(source.tasks);
    const rawLists = isV2 ? source.lists : [];
    const lists = [];
    const seen = new Set();
    const addList = (candidate) => {
      if (!candidate || typeof candidate !== 'object') return;
      const id = String(candidate.id || '').trim();
      const name = normalizeTodoText(candidate.name, 24);
      if (!id || !name || seen.has(id)) return;
      const requestedParentId = String(candidate.parentId || '').trim();
      const parent = requestedParentId && requestedParentId !== id
        ? lists.find((item) => item.id === requestedParentId && !item.parentId)
        : null;
      seen.add(id);
      lists.push({
        id,
        name,
        parentId: parent ? parent.id : '',
        order: Number.isFinite(Number(candidate.order)) ? Number(candidate.order) : lists.length,
        createdAt: Math.max(0, Number(candidate.createdAt) || Date.now()),
        defaultReminderOffsets: normalizeTodoReminderOffsets(candidate.defaultReminderOffsets),
        defaultSoundId: ['none', 'soft', 'bright', 'alert'].includes(candidate.defaultSoundId)
          ? candidate.defaultSoundId
          : 'bright',
        sortMode: candidate.sortMode === 'manual' ? 'manual' : 'auto',
      });
    };
    addList({ id: TODO_INBOX_ID, name: '收集箱', order: -1, createdAt: 0 });
    if (isV2) {
      rawLists
        .filter((item) => item && item.id !== TODO_INBOX_ID)
        .sort((left, right) => (Number(left.order) || 0) - (Number(right.order) || 0))
        .forEach(addList);
    } else {
      ['P0', 'P1', 'P2', 'P3'].forEach((categoryId, index) => {
        addList({
          id: categoryId,
          name: defaults[categoryId],
          order: index,
          createdAt: 0,
        });
      });
    }
    const listIds = new Set(lists.map((item) => item.id));
    const rawTasks = isV2
      ? source.tasks
      : ['P0', 'P1', 'P2', 'P3'].flatMap((categoryId) => (
        Array.isArray(source[categoryId])
          ? source[categoryId].map((item) => ({ ...item, listId: categoryId }))
          : []
      ));
    const tasks = rawTasks
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const createdAt = Math.max(0, Number(item.createdAt) || Date.now());
        const deadline = normalizeTodoDate(item.deadline);
        const legacyRemindedAt = Math.max(0, Number(item.remindedAt) || 0);
        const listConfig = lists.find((list) => list.id === String(item.listId || ''));
        const explicitReminders = Array.isArray(item.reminders);
        let sourceReminders = explicitReminders
          ? item.reminders
          : legacyRemindedAt
            ? [{
              id: 'legacy-deadline-1h',
              offsetMinutes: 60,
              at: deadline ? new Date(Date.parse(deadline) - 60 * 60 * 1000).toISOString() : '',
              firedAt: legacyRemindedAt,
              soundId: 'bright',
            }]
            : [];
        let remindersInitialized = item.remindersInitialized === true
          || (explicitReminders && item.reminders.length > 0)
          || legacyRemindedAt > 0;
        if (
          !remindersInitialized
          && deadline
          && listConfig?.defaultReminderOffsets?.length
        ) {
          sourceReminders = listConfig.defaultReminderOffsets.map((offsetMinutes, reminderIndex) => ({
            id: `inherited-${listConfig.id}-${reminderIndex}`,
            offsetMinutes,
            at: new Date(Date.parse(deadline) - offsetMinutes * 60 * 1000).toISOString(),
            firedAt: 0,
            soundId: listConfig.defaultSoundId || 'bright',
          }));
          remindersInitialized = true;
        }
        return createDetailedTodo({
          ...item,
          id: String(item.id || `todo-${index}-${Math.random().toString(36).slice(2, 8)}`),
          listId: listIds.has(String(item.listId || '')) ? item.listId : TODO_INBOX_ID,
          done: item.done === true,
          createdAt,
          updatedAt: Math.max(createdAt, Number(item.updatedAt) || createdAt),
          completedAt: item.done === true
            ? Math.max(0, Number(item.completedAt) || Number(item.updatedAt) || createdAt)
            : 0,
          reminders: sourceReminders,
          remindersInitialized,
          order: Number.isFinite(Number(item.order)) ? Number(item.order) : index,
        }, lists, item.id, createdAt);
      })
      .filter(Boolean);
    const trash = (Array.isArray(source.trash) ? source.trash : [])
      .map((item, index) => {
        if (!item || typeof item !== 'object') return null;
        const task = createDetailedTodo(
          { ...item, done: item.done === true },
          lists,
          item.id || `trash-${index}`,
          item.createdAt
        );
        if (!task) return null;
        return {
          ...task,
          deletedAt: Math.max(0, Number(item.deletedAt) || Date.now()),
        };
      })
      .filter(Boolean)
      .slice(0, 500);
    return {
      version: 3,
      lists: lists.map((item, index) => ({ ...item, order: index })),
      tasks,
      settings: normalizeTodoSettings(source.settings, lists),
      reminderHistory: normalizeReminderHistory(source.reminderHistory),
      trash,
    };
  }

  function createNextTodoOccurrence(task, lists, id, now = Date.now()) {
    if (!task || !normalizeTodoRecurrence(task.recurrence)) return null;
    const nextDeadline = nextTodoDeadline(task.recurrence, task.deadline, now);
    const currentDeadlineAt = Date.parse(String(task.deadline || ''));
    const nextDeadlineAt = Date.parse(String(nextDeadline || ''));
    const currentStrongAt = Date.parse(String(task.strongReminderAt || ''));
    const strongReminderLinked = task.strongReminder === true
      && task.strongReminderLinked === true;
    const nextStrongReminderAt = task.strongReminder === true
      ? strongReminderLinked
        ? nextDeadline
        : Number.isFinite(currentDeadlineAt)
          && Number.isFinite(nextDeadlineAt)
          && Number.isFinite(currentStrongAt)
          ? new Date(nextDeadlineAt + (currentStrongAt - currentDeadlineAt)).toISOString()
          : ''
      : '';
    return createDetailedTodo({
      ...task,
      id,
      done: false,
      status: 'todo',
      blockedAt: 0,
      blockReasonType: '',
      blockReason: '',
      nextAction: '',
      externalSource: '',
      externalId: '',
      unhandledReminderAt: '',
      unhandledReminderId: '',
      completedAt: 0,
      deadline: nextDeadline,
      strongReminderAt: nextStrongReminderAt,
      strongReminderLinked,
      reminders: [
        ...(task.reminders || [])
          .filter((reminder) => reminder.strong !== true)
          .map((reminder, index) => ({
            ...reminder,
            id: `next-${index}-${Math.random().toString(36).slice(2, 8)}`,
            at: '',
            firedAt: 0,
            strong: false,
          })),
        ...(task.strongReminder === true
          ? [{
            id: `next-strong-${Math.random().toString(36).slice(2, 8)}`,
            offsetMinutes: null,
            at: nextStrongReminderAt,
            firedAt: 0,
            soundId: 'alert',
            strong: true,
          }]
          : []),
      ],
      remindersInitialized: true,
      subtasks: (task.subtasks || []).map((subtask, index) => ({
        ...subtask,
        id: `next-subtask-${index}-${Math.random().toString(36).slice(2, 8)}`,
        done: false,
        completedAt: 0,
        order: index,
      })),
      createdAt: now,
      updatedAt: now,
    }, lists, id, now);
  }

  function todoListDescendantIds(lists, listId) {
    const id = String(listId || '');
    if (!id) return [];
    const rows = Array.isArray(lists) ? lists : [];
    const result = [id];
    rows.forEach((item) => {
      if (item && String(item.parentId || '') === id) result.push(item.id);
    });
    return [...new Set(result)];
  }

  function sortDetailedTodos(items) {
    return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
      const doneDifference = Number(left && left.done === true) - Number(right && right.done === true);
      if (doneDifference) return doneDifference;
      const pinnedDifference = Number(right && right.pinned === true) - Number(left && left.pinned === true);
      if (pinnedDifference) return pinnedDifference;
      const priorityDifference =
        (TODO_PRIORITY_RANK[right && right.priority] || 0)
        - (TODO_PRIORITY_RANK[left && left.priority] || 0);
      if (priorityDifference) return priorityDifference;
      const leftDeadline = Date.parse(String(left && left.deadline || ''));
      const rightDeadline = Date.parse(String(right && right.deadline || ''));
      const deadlineDifference =
        (Number.isFinite(leftDeadline) ? leftDeadline : Number.POSITIVE_INFINITY)
        - (Number.isFinite(rightDeadline) ? rightDeadline : Number.POSITIVE_INFINITY);
      if (deadlineDifference) return deadlineDifference;
      const orderDifference = (Number(left && left.order) || 0) - (Number(right && right.order) || 0);
      if (orderDifference) return orderDifference;
      return (Number(left && left.createdAt) || 0) - (Number(right && right.createdAt) || 0);
    });
  }

  function sortTodoTasksForList(items, list) {
    if (!list || list.sortMode !== 'manual') return sortDetailedTodos(items);
    return [...(Array.isArray(items) ? items : [])].sort((left, right) => {
      const doneDifference = Number(left && left.done === true) - Number(right && right.done === true);
      if (doneDifference) return doneDifference;
      const pinnedDifference = Number(right && right.pinned === true) - Number(left && left.pinned === true);
      if (pinnedDifference) return pinnedDifference;
      const orderDifference = (Number(left && left.order) || 0) - (Number(right && right.order) || 0);
      if (orderDifference) return orderDifference;
      return (Number(left && left.createdAt) || 0) - (Number(right && right.createdAt) || 0);
    });
  }

  function reorderTodoTasks(tasks, orderedIds) {
    const rows = Array.isArray(tasks) ? tasks : [];
    const ids = (Array.isArray(orderedIds) ? orderedIds : []).map(String);
    const orderById = new Map(ids.map((id, index) => [id, index]));
    let fallbackOrder = ids.length;
    return rows.map((task) => {
      const order = orderById.has(String(task && task.id))
        ? orderById.get(String(task.id))
        : fallbackOrder++;
      return task && task.order === order ? task : { ...task, order };
    });
  }

  function filterTodoTasks(tasks, lists, view = 'inbox', query = '', now = Date.now()) {
    const rows = Array.isArray(tasks) ? tasks : [];
    const current = Number(now);
    const keyword = String(query || '').trim().toLocaleLowerCase();
    const startOfToday = new Date(current);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const upcomingEnd = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
    const selectedListId = String(view || '').startsWith('list:') ? String(view).slice(5) : '';
    const selectedListIds = new Set(todoListDescendantIds(lists, selectedListId));
    const filtered = rows.filter((task) => {
      if (!task) return false;
      const deadline = Date.parse(String(task.deadline || ''));
      const startAt = Date.parse(String(task.startAt || ''));
      const done = task.done === true;
      if (view === 'completed' && !done) return false;
      if (view !== 'completed' && view !== 'all' && done) return false;
      if (view === 'inbox' && task.listId !== TODO_INBOX_ID) return false;
      if (selectedListId && !selectedListIds.has(String(task.listId || ''))) return false;
      if (view === 'blocked' && task.status !== 'blocked') return false;
      if (view === 'overdue' && (!Number.isFinite(deadline) || deadline >= current)) return false;
      if (view === 'today') {
        const inToday = (value) => value >= startOfToday.getTime() && value < endOfToday.getTime();
        if (Number.isFinite(deadline) && deadline < current && !inToday(startAt)) return false;
        if (!inToday(deadline) && !inToday(startAt)) return false;
      }
      if (view === 'upcoming') {
        if (!Number.isFinite(deadline) || deadline < endOfToday.getTime() || deadline >= upcomingEnd.getTime()) {
          return false;
        }
      }
      if (!keyword) return true;
      const subtaskText = (Array.isArray(task.subtasks) ? task.subtasks : [])
        .map((item) => item && item.text || '')
        .join(' ');
      return `${task.text || ''}\n${task.notes || ''}\n${task.blockReason || ''}\n${task.nextAction || ''}\n${subtaskText}`
        .toLocaleLowerCase()
        .includes(keyword);
    });
    const selectedList = selectedListId ? lists.find((item) => item.id === selectedListId) : null;
    return sortTodoTasksForList(filtered, selectedList);
  }

  function parseTodoQuickInput(value, now, lists) {
    let text = String(value || '').trim();
    if (!text) return null;
    const current = now instanceof Date ? new Date(now.getTime()) : new Date(now);
    if (!Number.isFinite(current.getTime())) return null;
    const sourceLists = Array.isArray(lists) ? lists : [];
    const result = {
      text: '',
      listId: '',
      priority: 'none',
      deadline: '',
      reminderOffsets: [],
      matched: [],
    };
    const remove = (match) => {
      if (!match) return;
      text = `${text.slice(0, match.index)} ${text.slice(match.index + match[0].length)}`;
      result.matched.push(match[0].trim());
    };

    const priorityMap = {
      紧急: 'urgent',
      高: 'high',
      中: 'medium',
      低: 'low',
      无: 'none',
    };
    const priorityMatch = text.match(/!(紧急|高|中|低|无)(?=\s|$)/);
    if (priorityMatch) {
      result.priority = priorityMap[priorityMatch[1]];
      remove(priorityMatch);
    }

    const listMatch = text.match(/#([^\s#]+)/);
    if (listMatch) {
      const token = listMatch[1].toLowerCase();
      const matchedList = sourceLists.find((list) => {
        if (!list) return false;
        const parent = list.parentId ? sourceLists.find((item) => item.id === list.parentId) : null;
        const names = [
          list.name,
          parent ? `${parent.name}/${list.name}` : '',
        ].filter(Boolean).map((name) => name.toLowerCase());
        return names.includes(token);
      });
      if (matchedList) {
        result.listId = matchedList.id;
        remove(listMatch);
      }
    }

    let reminderMatch;
    const reminderPattern = /(?:提醒|提前)\s*(\d+(?:\.\d+)?)\s*(分钟|小时|天)(?:前)?/g;
    while ((reminderMatch = reminderPattern.exec(text))) {
      const amount = Number(reminderMatch[1]);
      const unit = reminderMatch[2];
      const minutes = unit === '天' ? amount * 1440 : unit === '小时' ? amount * 60 : amount;
      result.reminderOffsets.push(Math.max(1, Math.round(minutes)));
      remove(reminderMatch);
      reminderPattern.lastIndex = Math.max(0, reminderPattern.lastIndex - reminderMatch[0].length);
    }
    result.reminderOffsets = normalizeTodoReminderOffsets(result.reminderOffsets, []);

    const date = new Date(current.getTime());
    let hasDate = false;
    let hasTime = false;
    const weekdayMap = { 一: 1, 二: 2, 三: 3, 四: 4, 五: 5, 六: 6, 日: 0, 天: 0 };
    const explicitDate = text.match(/(?:(\d{4})年)?(\d{1,2})月(\d{1,2})[日号]/);
    if (explicitDate) {
      date.setFullYear(
        explicitDate[1] ? Number(explicitDate[1]) : current.getFullYear(),
        Number(explicitDate[2]) - 1,
        Number(explicitDate[3])
      );
      hasDate = true;
      remove(explicitDate);
    } else {
      const relativeDate = text.match(/今天|明天|后天/);
      if (relativeDate) {
        const offset = relativeDate[0] === '今天' ? 0 : relativeDate[0] === '明天' ? 1 : 2;
        date.setDate(current.getDate() + offset);
        hasDate = true;
        remove(relativeDate);
      } else {
        const weekDate = text.match(/(下周|周|星期|礼拜)([一二三四五六日天])/);
        if (weekDate) {
          const targetDay = weekdayMap[weekDate[2]];
          const delta = weekDate[1] === '下周'
            ? 7 - current.getDay() + targetDay
            : (targetDay - current.getDay() + 7) % 7;
          date.setDate(current.getDate() + delta);
          hasDate = true;
          remove(weekDate);
        }
      }
    }

    const timeMatch = text.match(/(上午|中午|下午|晚上)?\s*(\d{1,2})(?:点|时)(?:(\d{1,2})分?)?|(上午|中午|下午|晚上)?\s*(\d{1,2}):(\d{2})/);
    if (timeMatch) {
      const meridiem = timeMatch[1] || timeMatch[4] || '';
      let hour = Number(timeMatch[2] ?? timeMatch[5]);
      const minute = Number(timeMatch[3] ?? timeMatch[6] ?? 0);
      if (['下午', '晚上'].includes(meridiem) && hour < 12) hour += 12;
      if (meridiem === '中午' && hour < 11) hour += 12;
      date.setHours(Math.max(0, Math.min(23, hour)), Math.max(0, Math.min(59, minute)), 0, 0);
      hasTime = true;
      remove(timeMatch);
    }

    if (hasDate || hasTime) {
      if (hasDate && !hasTime) date.setHours(23, 30, 0, 0);
      if (!hasDate && date.getTime() <= current.getTime()) date.setDate(date.getDate() + 1);
      result.deadline = date.toISOString();
    }
    result.text = text.replace(/\s+/g, ' ').trim();
    return result;
  }

  function summarizeTodoViewCounts(tasks, lists, now = Date.now()) {
    const rows = Array.isArray(tasks) ? tasks : [];
    const listRows = Array.isArray(lists) ? lists : [];
    const current = Number(now);
    const startOfToday = new Date(current);
    startOfToday.setHours(0, 0, 0, 0);
    const endOfToday = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
    const upcomingEnd = new Date(startOfToday.getTime() + 7 * 24 * 60 * 60 * 1000);
    const inToday = (value) => value >= startOfToday.getTime() && value < endOfToday.getTime();
    const views = {
      inbox: 0,
      today: 0,
      upcoming: 0,
      overdue: 0,
      all: rows.length,
      completed: 0,
      blocked: 0,
    };
    const listCounts = Object.fromEntries(listRows.map((list) => [list.id, 0]));
    const listById = new Map(listRows.map((list) => [list.id, list]));

    rows.forEach((task) => {
      if (!task) return;
      const done = task.done === true;
      const deadline = Date.parse(String(task.deadline || ''));
      const startAt = Date.parse(String(task.startAt || ''));
      if (done) {
        views.completed += 1;
        return;
      }
      if (task.status === 'blocked') views.blocked += 1;
      if (task.listId === TODO_INBOX_ID) views.inbox += 1;
      if (Number.isFinite(deadline) && deadline < current) views.overdue += 1;
      const includedInToday = (inToday(deadline) || inToday(startAt))
        && (!(Number.isFinite(deadline) && deadline < current) || inToday(startAt));
      if (includedInToday) views.today += 1;
      if (Number.isFinite(deadline) && deadline >= endOfToday.getTime() && deadline < upcomingEnd.getTime()) {
        views.upcoming += 1;
      }
      const list = listById.get(String(task.listId || ''));
      if (list) {
        listCounts[list.id] = (listCounts[list.id] || 0) + 1;
        if (list.parentId && Object.prototype.hasOwnProperty.call(listCounts, list.parentId)) {
          listCounts[list.parentId] += 1;
        }
      }
    });
    return { views, lists: listCounts };
  }

  function todoChecklistProgress(task) {
    const subtasks = Array.isArray(task && task.subtasks) ? task.subtasks : [];
    const done = subtasks.filter((item) => item && item.done === true).length;
    return {
      done,
      total: subtasks.length,
      percent: subtasks.length ? Math.round(done / subtasks.length * 100) : 0,
    };
  }

  function filterCredentials(items, query) {
    const rows = Array.isArray(items) ? items : [];
    const keyword = String(query || '').trim().toLocaleLowerCase();
    if (!keyword) return [...rows];
    return rows.filter((item) => (
      `${String(item && item.service || '')}\n${String(item && item.account || '')}`
        .toLocaleLowerCase()
        .includes(keyword)
    ));
  }

  function credentialRowAction(options = {}) {
    if (options.requestedAction === 'delete') {
      return { type: 'delete', label: '删除', ariaLabel: '删除密钥' };
    }
    if (options.copyField === 'account' || options.copyField === 'password') {
      return { type: 'copy', field: options.copyField };
    }
    if (options.rowBody && !options.shiftKey && !options.selected) return { type: 'edit' };
    return { type: 'select' };
  }

  function visiblePanelTabs(allTabs, features) {
    const tabs = Array.isArray(allTabs) ? allTabs : [];
    const state = features && typeof features === 'object' && !Array.isArray(features) ? features : {};
    const visible = tabs.filter((name) => (
      name !== 'settings' && (name === 'home' || state[name] !== false)
    ));
    if (tabs.includes('settings')) visible.push('settings');
    return visible;
  }

  function resolveDefaultPanelTab(preferredTab, visibleTabs) {
    const tabs = Array.isArray(visibleTabs) ? visibleTabs : [];
    if (typeof preferredTab === 'string' && tabs.includes(preferredTab)) return preferredTab;
    if (tabs.includes('home')) return 'home';
    return tabs[0] || 'home';
  }

  function normalizeNoteArchive(value) {
    if (!Array.isArray(value)) return [];
    return value
      .map((item) => {
        if (!item || typeof item !== 'object') return null;
        const id = String(item.id || '').trim();
        const content = item.content == null ? '' : String(item.content);
        if (!id) return null;
        const title = Array.from(String(item.title || '').replace(/\s+/g, ' ').trim()).slice(0, 80).join('');
        const titleSource = ['model', 'user'].includes(item.titleSource) ? item.titleSource : '';
        const createdAt = Math.max(0, Number(item.createdAt) || Date.now());
        const updatedAt = Math.max(createdAt, Number(item.updatedAt) || createdAt);
        return { id, title, titleSource, content, createdAt, updatedAt };
      })
      .filter(Boolean)
      .sort((left, right) => right.updatedAt - left.updatedAt);
  }

  function updateNoteInArchive(notes, noteId, content, updatedAt = Date.now()) {
    const id = String(noteId || '').trim();
    const timestamp = Math.max(0, Number(updatedAt) || Date.now());
    let found = false;
    const next = normalizeNoteArchive(notes).map((note) => {
      if (note.id !== id) return note;
      found = true;
      return {
        ...note,
        content: content == null ? '' : String(content),
        updatedAt: Math.max(note.createdAt, timestamp),
      };
    });
    return found ? normalizeNoteArchive(next) : next;
  }

  function filterNotes(notes, query) {
    const rows = Array.isArray(notes) ? notes : [];
    const keyword = String(query || '').trim().toLocaleLowerCase();
    if (!keyword) return rows.slice();
    return rows.filter((note) => (
      `${String(note && note.title || '')}\n${String(note && note.content || '')}`
        .toLocaleLowerCase()
        .includes(keyword)
    ));
  }

  function updateNoteTitle(notes, noteId, title, updatedAt = Date.now()) {
    const id = String(noteId || '').trim();
    const nextTitle = Array.from(String(title || '').replace(/\s+/g, ' ').trim()).slice(0, 80).join('');
    const timestamp = Math.max(0, Number(updatedAt) || Date.now());
    let found = false;
    const next = normalizeNoteArchive(notes).map((note) => {
      if (note.id !== id) return note;
      found = true;
      return {
        ...note,
        title: nextTitle,
        titleSource: 'user',
        updatedAt: Math.max(note.createdAt, timestamp),
      };
    });
    return found ? normalizeNoteArchive(next) : next;
  }

  function applyGeneratedNoteTitle(notes, noteId, title, expectedContent) {
    const id = String(noteId || '').trim();
    const nextTitle = Array.from(String(title || '').replace(/\s+/g, ' ').trim()).slice(0, 80).join('');
    if (!id || !nextTitle) return normalizeNoteArchive(notes);
    return normalizeNoteArchive(notes).map((note) => {
      if (
        note.id !== id
        || note.titleSource === 'user'
        || note.title
        || note.content !== String(expectedContent == null ? '' : expectedContent)
      ) return note;
      return { ...note, title: nextTitle, titleSource: 'model' };
    });
  }

  function apiCredentialStatuses(config) {
    const value = config && typeof config === 'object' ? config : {};
    const status = (configured, needsReentry) => {
      if (configured) return { label: '已安全保存', state: 'saved' };
      if (needsReentry) return { label: '需重新输入', state: 'warning' };
      return { label: '未配置', state: 'empty' };
    };
    return {
      transcription: status(Boolean(value.configured), Boolean(value.asrNeedsReentry)),
      llm: status(Boolean(value.llmConfigured), Boolean(value.llmNeedsReentry)),
    };
  }

  function settingsSummary(input = {}) {
    const appSettings = input.appSettings && typeof input.appSettings === 'object' ? input.appSettings : {};
    const workspace = input.workspace && typeof input.workspace === 'object' ? input.workspace : {};
    const statuses = apiCredentialStatuses(input.transcription);
    return {
      shortcut: String(appSettings.shortcut || 'Space'),
      defaultTab: String(appSettings.defaultTab || 'home'),
      autoLaunch: appSettings.autoLaunch === true,
      workspacePath: String(workspace.path || ''),
      workspaceLabel: workspace.portable ? '自定义文件夹' : '默认文件夹',
      transcription: statuses.transcription,
      llm: statuses.llm,
    };
  }

  function calendarDeadline(parts) {
    const year = Math.round(Number(parts && parts.year));
    const month = Math.round(Number(parts && parts.month));
    const day = Math.round(Number(parts && parts.day));
    const hour = Math.round(Number(parts && parts.hour));
    const minute = Math.round(Number(parts && parts.minute));
    if (!Number.isInteger(year) || year < 1 || year > 9999 || month < 0 || month > 11
      || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
    const deadline = new Date(year, month, day, hour, minute, 0, 0);
    if (deadline.getFullYear() !== year || deadline.getMonth() !== month || deadline.getDate() !== day) return null;
    return deadline.toISOString();
  }

  function shiftCalendarMonth(value, offset) {
    const year = Math.round(Number(value && value.year));
    const month = Math.round(Number(value && value.month));
    const step = Math.round(Number(offset));
    if (!Number.isInteger(year) || !Number.isInteger(month) || month < 0 || month > 11 || !Number.isInteger(step)) return null;
    const shifted = new Date(year, month + step, 1, 12, 0, 0, 0);
    return { year: shifted.getFullYear(), month: shifted.getMonth() };
  }

  function currentMonthDeadline(parts, now = new Date()) {
    const base = now instanceof Date ? now : new Date(now);
    if (!Number.isFinite(base.getTime())) return null;
    return calendarDeadline({
      ...parts,
      year: base.getFullYear(),
      month: base.getMonth(),
    });
  }

  function defaultTodoDeadline(now = new Date()) {
    const base = now instanceof Date ? new Date(now.getTime()) : new Date(now);
    if (!Number.isFinite(base.getTime())) return null;
    const deadline = new Date(base.getFullYear(), base.getMonth(), base.getDate(), 23, 30, 0, 0);
    return deadline.toISOString();
  }

  function todoTimeBattery(todo, now = Date.now()) {
    if (!todo || todo.done === true) return null;
    const createdAt = Number(todo.createdAt);
    const deadline = Date.parse(String(todo.deadline || ''));
    const current = Number(now);
    const total = deadline - createdAt;
    if (!Number.isFinite(current)) return null;
    if (!Number.isFinite(deadline) || !Number.isFinite(createdAt) || total <= 0) {
      return { percent: 0, tone: 'red', overdue: false, label: '待补充有效截止时间' };
    }
    // 逾期必须与「剩余 0%」分开：后者只是取整落到 0，前者已经欠账。
    // 逾期项的电量条改为整条填满 + 白色感叹号，不能再显示成一条空槽。
    const overdue = current >= deadline;
    const percent = Math.round(Math.max(0, Math.min(1, (deadline - current) / total)) * 100);
    const tone = percent >= 80 ? 'green' : percent >= 50 ? 'yellow' : percent > 30 ? 'orange' : 'red';
    return {
      percent,
      tone,
      overdue,
      label: overdue ? '已逾期' : `剩余 ${percent}%`,
    };
  }

  function updateRangeSelection(ids, selectedIds, clickedId, anchorId, shiftKey, toggleSelected = false) {
    const ordered = Array.isArray(ids) ? ids.map(String) : [];
    const clicked = String(clickedId || '');
    const anchor = String(anchorId || '');
    if (!clicked || !ordered.includes(clicked)) {
      return { selected: [...new Set((selectedIds || []).map(String))], anchor: anchor || null };
    }
    const existing = new Set((selectedIds || []).map(String));
    if (!shiftKey || !anchor || !ordered.includes(anchor)) {
      if (toggleSelected && existing.size === 1 && existing.has(clicked)) {
        return { selected: [], anchor: null };
      }
      return { selected: [clicked], anchor: clicked };
    }
    const start = ordered.indexOf(anchor);
    const end = ordered.indexOf(clicked);
    const range = ordered.slice(Math.min(start, end), Math.max(start, end) + 1);
    range.forEach((id) => existing.add(id));
    return { selected: ordered.filter((id) => existing.has(id)), anchor };
  }

  function normalizeHomeLayout(layout, defaults) {
    const fallback = defaults && typeof defaults === 'object' ? { ...defaults } : {};
    const keys = Object.keys(fallback);
    if (!layout || typeof layout !== 'object') return fallback;
    const slots = keys.map((key) => layout[key]);
    const validSlots = new Set(Object.values(fallback));
    if (
      slots.length !== validSlots.size ||
      new Set(slots).size !== validSlots.size ||
      slots.some((slot) => !validSlots.has(slot))
    ) {
      return fallback;
    }
    return Object.fromEntries(keys.map((key) => [key, layout[key]]));
  }

  function swapHomeLayoutSlots(layout, sourceId, targetId) {
    if (!layout || typeof layout !== 'object' || sourceId === targetId) return { ...(layout || {}) };
    if (!Object.prototype.hasOwnProperty.call(layout, sourceId) || !Object.prototype.hasOwnProperty.call(layout, targetId)) {
      return { ...layout };
    }
    return {
      ...layout,
      [sourceId]: layout[targetId],
      [targetId]: layout[sourceId],
    };
  }

  function normalizeTodoCategoryNames(value, defaults) {
    const fallback = defaults && typeof defaults === 'object' ? { ...defaults } : {};
    const source = value && typeof value === 'object' ? value : {};
    return Object.fromEntries(Object.entries(fallback).map(([key, defaultName]) => {
      const candidate = String(source[key] || '').replace(/\s+/g, ' ').trim();
      return [key, candidate ? candidate.slice(0, 24) : defaultName];
    }));
  }

  function normalizeHomeWidgetSizes(value, defaults, preferredId, capacity = Infinity) {
    const fallback = defaults && typeof defaults === 'object' ? { ...defaults } : {};
    const allowed = new Set(['mini', 'small', 'medium', 'large']);
    const source = value && typeof value === 'object' ? value : {};
    if (Object.keys(source).some((key) => key in fallback && !allowed.has(source[key]))) {
      return fallback;
    }
    const sizes = Object.fromEntries(Object.entries(fallback).map(([key, defaultSize]) => (
      [key, allowed.has(source[key]) ? source[key] : defaultSize]
    )));
    const area = { mini: 2, small: 4, medium: 8, large: 16 };
    const totalArea = () => Object.values(sizes).reduce((total, size) => total + area[size], 0);
    const siblings = Object.keys(sizes).filter((key) => key !== preferredId);

    while (totalArea() > capacity) {
      const excess = totalArea() - capacity;
      const candidate = siblings
        .map((key) => ({ key, reduction: sizes[key] === 'large' ? 8 : sizes[key] === 'medium' ? 4 : sizes[key] === 'small' ? 2 : 0 }))
        .filter((item) => item.reduction > 0 && item.reduction <= excess)
        .sort((a, b) => b.reduction - a.reduction)[0];
      if (!candidate) break;
      sizes[candidate.key] = sizes[candidate.key] === 'large' ? 'medium' : sizes[candidate.key] === 'medium' ? 'small' : 'mini';
    }

    while (Number.isFinite(capacity) && totalArea() < capacity) {
      const remaining = capacity - totalArea();
      const candidate = siblings
        .map((key) => ({ key, increase: sizes[key] === 'mini' ? 2 : sizes[key] === 'small' ? 4 : sizes[key] === 'medium' ? 8 : 0 }))
        .filter((item) => item.increase > 0 && item.increase <= remaining)
        .sort((a, b) => b.increase - a.increase)[0];
      if (!candidate) break;
      sizes[candidate.key] = sizes[candidate.key] === 'mini' ? 'small' : sizes[candidate.key] === 'small' ? 'medium' : 'large';
    }
    return sizes;
  }

  function packHomeWidgetLayout(order, sizes, columns = 12, rows = 4) {
    const ids = Array.isArray(order) ? order.filter((id) => Object.prototype.hasOwnProperty.call(sizes || {}, id)) : [];
    if (!ids.length || columns < 1 || rows < 1) return null;
    const dimensions = {
      mini: { width: 2, height: 1 },
      small: { width: 2, height: 2 },
      medium: { width: 4, height: 2 },
      large: { width: 4, height: 4 },
    };
    const occupied = Array.from({ length: rows }, () => Array(columns).fill(false));
    const placements = {};

    function fits(column, row, width, height) {
      if (column + width > columns || row + height > rows) return false;
      for (let y = row; y < row + height; y += 1) {
        for (let x = column; x < column + width; x += 1) {
          if (occupied[y][x]) return false;
        }
      }
      return true;
    }

    function mark(column, row, width, height, value) {
      for (let y = row; y < row + height; y += 1) {
        for (let x = column; x < column + width; x += 1) occupied[y][x] = value;
      }
    }

    function place(index) {
      if (index >= ids.length) return occupied.every((row) => row.every(Boolean));
      const id = ids[index];
      const dimension = dimensions[sizes[id]] || dimensions.small;
      for (let row = 0; row <= rows - dimension.height; row += 1) {
        for (let column = 0; column <= columns - dimension.width; column += 1) {
          if (!fits(column, row, dimension.width, dimension.height)) continue;
          mark(column, row, dimension.width, dimension.height, true);
          placements[id] = { column, row, ...dimension };
          if (place(index + 1)) return true;
          delete placements[id];
          mark(column, row, dimension.width, dimension.height, false);
        }
      }
      return false;
    }

    return place(0) ? placements : null;
  }

  const HOME_GAPLESS_TEMPLATES = {
    1: [{ column: 0, row: 0, width: 12, height: 4 }],
    2: [
      { column: 0, row: 0, width: 6, height: 4 },
      { column: 6, row: 0, width: 6, height: 4 },
    ],
    3: [
      { column: 0, row: 0, width: 4, height: 4 },
      { column: 4, row: 0, width: 4, height: 4 },
      { column: 8, row: 0, width: 4, height: 4 },
    ],
    4: [
      { column: 0, row: 0, width: 6, height: 2 },
      { column: 6, row: 0, width: 6, height: 2 },
      { column: 0, row: 2, width: 6, height: 2 },
      { column: 6, row: 2, width: 6, height: 2 },
    ],
    5: [
      { column: 0, row: 0, width: 4, height: 4 },
      { column: 4, row: 0, width: 4, height: 2 },
      { column: 8, row: 0, width: 4, height: 2 },
      { column: 4, row: 2, width: 4, height: 2 },
      { column: 8, row: 2, width: 4, height: 2 },
    ],
    6: [
      { column: 0, row: 0, width: 4, height: 2 },
      { column: 4, row: 0, width: 4, height: 2 },
      { column: 8, row: 0, width: 4, height: 2 },
      { column: 0, row: 2, width: 4, height: 2 },
      { column: 4, row: 2, width: 4, height: 2 },
      { column: 8, row: 2, width: 4, height: 2 },
    ],
  };

  function normalizeHiddenHomeModules(value, moduleIds) {
    const ids = Array.isArray(moduleIds)
      ? [...new Set(moduleIds.map((id) => String(id)))]
      : [];
    if (!ids.length || !Array.isArray(value)) return [];
    const requested = new Set(value.map((id) => String(id)));
    const hiddenIds = ids.filter((id) => requested.has(id));
    return hiddenIds.length === ids.length ? [] : hiddenIds;
  }

  function updateHomeModuleVisibility(hiddenIds, moduleIds, moduleId, visible) {
    const ids = Array.isArray(moduleIds)
      ? [...new Set(moduleIds.map((id) => String(id)))]
      : [];
    const current = normalizeHiddenHomeModules(hiddenIds, ids);
    const id = String(moduleId || '');
    if (!ids.includes(id) || typeof visible !== 'boolean') {
      return { ok: false, error: 'invalid_module', hiddenIds: current };
    }
    const next = new Set(current);
    if (visible) next.delete(id);
    else next.add(id);
    if (next.size >= ids.length) {
      return { ok: false, error: 'at_least_one_required', hiddenIds: current };
    }
    return { ok: true, hiddenIds: ids.filter((candidate) => next.has(candidate)) };
  }

  function layoutVariantForPlacement(placement) {
    const width = Number(placement?.width) || 0;
    const height = Number(placement?.height) || 0;
    if (width <= 2 && height <= 1) return 'mini';
    if (width <= 2 && height <= 2) return 'compact';
    if (height <= 2) return 'wide';
    if (width >= 6 && height >= 4) return 'full';
    return 'tall';
  }

  function validateHomeWidgetLayout(layout, visibleIds, columns = 12, rows = 4) {
    if (!layout || !layout.placements || columns < 1 || rows < 1) return false;
    const expected = [...new Set(Array.isArray(visibleIds) ? visibleIds.map(String) : [])].sort();
    const entries = Object.entries(layout.placements);
    if (!expected.length || entries.length !== expected.length) return false;
    if (JSON.stringify(entries.map(([id]) => id).sort()) !== JSON.stringify(expected)) return false;
    const cells = Array(columns * rows).fill(0);
    for (const [, item] of entries) {
      const values = [item?.column, item?.row, item?.width, item?.height];
      if (!values.every(Number.isInteger) || item.width < 1 || item.height < 1) return false;
      if (item.column < 0 || item.row < 0
        || item.column + item.width > columns || item.row + item.height > rows) return false;
      for (let row = item.row; row < item.row + item.height; row += 1) {
        for (let column = item.column; column < item.column + item.width; column += 1) {
          const index = row * columns + column;
          cells[index] += 1;
          if (cells[index] > 1) return false;
        }
      }
    }
    return cells.every((count) => count === 1);
  }

  function resolveHomeWidgetLayout(order, sizes, hiddenIds, columns = 12, rows = 4) {
    if (columns !== 12 || rows !== 4 || !sizes || typeof sizes !== 'object') return null;
    const ids = Array.isArray(order)
      ? [...new Set(order.map(String))].filter((id) => Object.prototype.hasOwnProperty.call(sizes, id))
      : [];
    if (!ids.length) return null;
    const hidden = new Set(normalizeHiddenHomeModules(hiddenIds, ids));
    const visibleOrder = ids.filter((id) => !hidden.has(id));
    if (!visibleOrder.length) return null;

    let placements;
    if (visibleOrder.length === 7) {
      placements = packHomeWidgetLayout(visibleOrder, sizes, columns, rows);
    } else {
      const template = HOME_GAPLESS_TEMPLATES[visibleOrder.length];
      if (!template) return null;
      let slotOrder = [...visibleOrder];
      if (visibleOrder.length === 5) {
        const rank = { mini: 0, small: 1, medium: 2, large: 3 };
        const primary = [...visibleOrder].sort((left, right) => (
          (rank[sizes[right]] ?? 0) - (rank[sizes[left]] ?? 0)
          || visibleOrder.indexOf(left) - visibleOrder.indexOf(right)
        ))[0];
        slotOrder = [primary, ...visibleOrder.filter((id) => id !== primary)];
      }
      placements = Object.fromEntries(slotOrder.map((id, index) => [id, { ...template[index] }]));
    }
    if (!placements) return null;
    const result = {
      visibleOrder: [...visibleOrder],
      placements: Object.fromEntries(Object.entries(placements).map(([id, item]) => [id, { ...item }])),
      variants: Object.fromEntries(Object.entries(placements).map(([id, item]) => (
        [id, layoutVariantForPlacement(item)]
      ))),
    };
    return validateHomeWidgetLayout(result, visibleOrder, columns, rows) ? result : null;
  }

  function calculateAudioLevel(samples) {
    const values = samples instanceof Float32Array ? samples : new Float32Array(samples || []);
    if (!values.length) return 0;
    let sumSquares = 0;
    for (const sample of values) {
      const clamped = Math.max(-1, Math.min(1, Number(sample) || 0));
      sumSquares += clamped * clamped;
    }
    return Math.round(Math.sqrt(sumSquares / values.length) * 1000) / 1000;
  }

  function resampleFloat32ToPcm16(samples, inputRate, outputRate = 16000) {
    const source = samples instanceof Float32Array ? samples : new Float32Array(samples || []);
    const fromRate = Math.max(1, Number(inputRate) || outputRate);
    const toRate = Math.max(1, Number(outputRate) || 16000);
    if (!source.length) return new Int16Array();
    const ratio = fromRate / toRate;
    const outputLength = Math.max(1, Math.round(source.length / ratio));
    const output = new Int16Array(outputLength);
    for (let outputIndex = 0; outputIndex < outputLength; outputIndex++) {
      const start = Math.floor(outputIndex * ratio);
      const end = Math.max(start + 1, Math.min(source.length, Math.floor((outputIndex + 1) * ratio)));
      let sum = 0;
      for (let sourceIndex = start; sourceIndex < end; sourceIndex++) sum += source[sourceIndex];
      const sample = Math.max(-1, Math.min(1, sum / (end - start)));
      output[outputIndex] = sample < 0 ? Math.round(sample * 0x8000) : Math.round(sample * 0x7fff);
    }
    return output;
  }

  function shouldTogglePanelForSpace(event) {
    if (!event || (event.key !== ' ' && event.key !== 'Spacebar' && event.code !== 'Space')) return false;
    return !event.repeat
      && !event.isComposing
      && !event.editable
      && !event.metaKey
      && !event.ctrlKey
      && !event.altKey;
  }

  function shouldHandleMirrorPinch(event) {
    return Boolean(event && event.live === true && event.ctrlKey === true);
  }

  function adjustMirrorZoom(currentZoom, deltaY, minZoom = 1, maxZoom = 2.6) {
    const min = Number.isFinite(minZoom) ? minZoom : 1;
    const max = Number.isFinite(maxZoom) && maxZoom >= min ? maxZoom : 2.6;
    const current = Number.isFinite(currentZoom) ? currentZoom : min;
    const delta = Number.isFinite(deltaY) ? deltaY : 0;
    const next = Math.max(min, Math.min(max, current - delta * 0.002));
    return Math.round(next * 100) / 100;
  }

  return {
    normalizeHttpUrl,
    classifyLink,
    addLinkToGroups,
    preferredLinkGroupId,
    moveLinkToGroup,
    moveLinkToPosition,
    renameGroup,
    prependClipboardHistory,
    createExclusiveAsyncTask,
    createCommand,
    createRecording,
    removeRecordingState,
    calculateRecordingDuration,
    completionMatchesWindow,
    deriveWindowDisplayName,
    numberWindowLabels,
    createTodo,
    updateTodo,
    sortTodosForDisplay,
    TODO_STATUS_LABELS,
    TODO_BLOCK_REASON_LABELS,
    createTodoList,
    createDetailedTodo,
    updateDetailedTodo,
    normalizeTodoWorkspace,
    normalizeTodoReminders,
    normalizeTodoReminderOffsets,
    normalizeTodoRecurrence,
    DEFAULT_STRONG_REMINDER_QUESTIONS,
    normalizeStrongReminderQuestions,
    normalizeDailyReviewSettings,
    normalizeSiriImportSettings,
    normalizeTodoActivity,
    nextTodoDeadline,
    normalizeTodoSettings,
    normalizeReminderHistory,
    createNextTodoOccurrence,
    todoListDescendantIds,
    sortDetailedTodos,
    sortTodoTasksForList,
    reorderTodoTasks,
    filterTodoTasks,
    summarizeTodoViewCounts,
    parseTodoQuickInput,
    todoChecklistProgress,
    filterCredentials,
    credentialRowAction,
    visiblePanelTabs,
    resolveDefaultPanelTab,
    normalizeNoteArchive,
    filterNotes,
    updateNoteInArchive,
    updateNoteTitle,
    applyGeneratedNoteTitle,
    apiCredentialStatuses,
    settingsSummary,
    currentMonthDeadline,
    calendarDeadline,
    shiftCalendarMonth,
    defaultTodoDeadline,
    todoTimeBattery,
    updateRangeSelection,
    normalizeHomeLayout,
    swapHomeLayoutSlots,
    normalizeTodoCategoryNames,
    normalizeHomeWidgetSizes,
    packHomeWidgetLayout,
    normalizeHiddenHomeModules,
    updateHomeModuleVisibility,
    resolveHomeWidgetLayout,
    validateHomeWidgetLayout,
    layoutVariantForPlacement,
    calculateAudioLevel,
    resampleFloat32ToPcm16,
    shouldTogglePanelForSpace,
    shouldHandleMirrorPinch,
    adjustMirrorZoom,
  };
});
