// ENG-160 dry-run studio state. Deliberately separate from shared/protocol.js:
// no new event is accepted by, or changes the behaviour of, the existing server.

const MODE_COPY = {
  'dry-run': { subtitle: 'Agent Floor · 模拟', banner: '模拟模式', engineerIdle: '模拟｜等待领取任务', coo: '模拟派单与验收', kimi: '尚未接通｜模拟', launcher: '工作室｜领任务（模拟）', claim: '向 COO 领任务（模拟）', notice: '模拟｜点击 Engineer，选择「向 COO 领任务」', reason: '', prefix: '模拟｜' },
  'notion-read': { subtitle: 'Agent Floor · 只读真实工单', banner: '只读真实工单｜不可领取', engineerIdle: '等待领取（只读模式，不可领取）', coo: '只读工单与验收', kimi: '尚未接通｜只读', launcher: '只读模式，不可领取', claim: '只读模式，不可领取', notice: '等待领取（只读模式，不可领取）', reason: '只读模式，不可领取', prefix: '' },
  'claim-test': { subtitle: 'Agent Floor · 领取测试（隔离库）', banner: '领取测试（隔离库）', engineerIdle: '等待领取（写入隔离测试库）', coo: '隔离测试派单与验收', kimi: '尚未接通｜隔离测试', launcher: '领任务｜写入隔离测试库', claim: '向 COO 领任务｜写入隔离测试库', notice: '隔离测试｜点击 Engineer，选择「向 COO 领任务」', reason: '写入隔离测试库', prefix: '隔离测试｜' },
  live: { subtitle: 'Agent Floor · 正式', banner: '正式模式', engineerIdle: '等待领取任务', coo: '正式派单与验收', kimi: '尚未接通｜正式', launcher: '工作室｜领任务', claim: '向 COO 领任务', notice: '点击 Engineer，选择「向 COO 领任务」', reason: '', prefix: '' },
};

export function createStudioState() {
  return {
    bridge: { received: false, connection: 'unknown', mode: '', connected: null, lastUpdateTs: null, note: '尚未收到桥接状态' },
    engineer: { taskId: null, taskTitle: '模拟｜等待领取任务', blocked: null, claimPending: false, lastRejection: null },
    kimi: { status: '尚未接通' },
    schedule: { loaded: false, updatedAt: null, simulated: true, items: [] },
    real: { ok: null, working: [], claimable: [], counts: { total: null, open: null, claimable: null, working: null, blocked: null, review: null }, error: null },
    reports: {},
    reportOrder: [],
    reviewPending: {},
    notice: '点击 Engineer，选择「向 COO 领任务」',
    actions: [],
  };
}

export function studioModeView(state) {
  const b = state.bridge;
  const unavailable = b.connection === 'disconnected' || b.connected === false
    ? { subtitle: 'Agent Floor', engineerIdle: '桥接未连接', coo: '桥接未连接', kimi: '尚未接通', launcher: '桥接未连接', claim: '桥接未连接', notice: '桥接未连接', reason: '桥接未连接', prefix: '' }
    : !b.received
      ? { subtitle: 'Agent Floor', engineerIdle: '状态未知', coo: '状态未知', kimi: '尚未接通', launcher: '状态未知', claim: '状态未知', notice: '状态未知', reason: '状态未知', prefix: '' }
      : null;
  const copy = unavailable || MODE_COPY[b.mode];
  if (!copy) return { mode: null, subtitle: 'Agent Floor', engineerIdle: '状态未知', coo: '状态未知', kimi: '尚未接通', launcher: '状态未知', claim: '状态未知', notice: '状态未知', reason: '状态未知', prefix: '', claimable: false };
  return { mode: unavailable ? null : b.mode, ...copy, claimable: !unavailable && b.connection === 'connected' && b.connected === true && b.mode !== 'notion-read' };
}

export function studioModeText(state, value) {
  const view = studioModeView(state);
  if (view.mode === 'dry-run') return String(value);
  return String(value).replace(/模拟[｜|]?/g, view.prefix).trim();
}


export function applyStudioEvent(state, ev) {
  if (!ev || typeof ev !== 'object') return state;
  switch (ev.type) {
    case 'status': {
      if (ev.agent === 'kimi') break;
      state.bridge = {
        received: true,
        connection: 'connected',
        mode: state.bridge.mode,
        connected: true,
        lastUpdateTs: Number.isFinite(ev.ts) ? ev.ts : Date.now(),
        note: String(ev.activity || '模拟｜status 心跳保活'),
      };
      break;
    }
    case 'bridge_status': {
      const previousMode = state.bridge.mode;
      state.bridge = {
        received: true,
        connection: 'connected',
        mode: String(ev.mode || 'dry-run'),
        connected: ev.connected === true,
        lastUpdateTs: Number.isFinite(ev.last_update_ts) ? ev.last_update_ts : null,
        note: String(ev.note || '桥接状态已更新'),
      };
      if (previousMode !== state.bridge.mode || state.bridge.mode === 'notion-read') {
        const view = studioModeView(state);
        if (!view.claimable) state.engineer.claimPending = false;
        state.notice = view.notice;
        if (!state.engineer.taskId) state.engineer.taskTitle = view.engineerIdle;
      }
      break;
    }
    case 'claim_confirmed':
      if (ev.agent !== 'engineer') break;
      state.engineer.taskId = String(ev.task_id || 'SIM-001');
      state.engineer.taskTitle = String(ev.task_title || '模拟｜未命名工单');
      state.engineer.claimPending = false;
      state.engineer.lastRejection = null;
      state.engineer.blocked = null;
      state.notice = `模拟｜已领取 ${state.engineer.taskId} · ${state.engineer.taskTitle} · 来源 ${String(ev.source || '模拟 COO')}`;
      break;
    case 'claim_rejected':
      if (ev.agent !== 'engineer') break;
      state.engineer.claimPending = false;
      state.engineer.lastRejection = String(ev.reason || '模拟｜未提供原因');
      state.notice = `模拟｜领取被退回：${state.engineer.lastRejection}`;
      break;
    case 'blocked':
      if (ev.agent !== 'engineer') break;
      state.engineer.blocked = {
        taskId: String(ev.task_id || state.engineer.taskId || 'SIM-001'),
        reason: String(ev.reason || '模拟｜未提供阻塞原因'),
      };
      state.notice = `模拟｜Engineer 举手：${state.engineer.blocked.reason}`;
      break;
    case 'report_ready': {
      if (ev.agent !== 'engineer') break;
      const taskId = String(ev.task_id || state.engineer.taskId || 'SIM-001');
      if (!state.reports[taskId]) state.reportOrder.push(taskId);
      state.reports[taskId] = {
        taskId,
        status: 'ready',
        summary: String(ev.summary || '模拟｜没有摘要'),
        reportUrl: ev.report_url ? String(ev.report_url) : null,
        reportLocal: ev.report_local ? String(ev.report_local) : null,
        note: '',
      };
      delete state.reviewPending[taskId];
      state.notice = `模拟｜${taskId} 报告已放到 Engineer 桌上，待验收`;
      break;
    }
    case 'review_result': {
      const taskId = String(ev.task_id || '');
      const report = state.reports[taskId];
      if (!report) break;
      const approved = ['approved', 'accepted', 'pass', 'passed'].includes(String(ev.result).toLowerCase());
      delete state.reviewPending[taskId];
      report.note = String(ev.note || '模拟｜没有验收备注');
      if (approved) {
        delete state.reports[taskId];
        state.reportOrder = state.reportOrder.filter((id) => id !== taskId);
        if (state.engineer.taskId === taskId) {
          state.engineer.taskId = null;
          state.engineer.taskTitle = '模拟｜等待领取任务';
          state.engineer.blocked = null;
          state.engineer.claimPending = false;
        }
        state.notice = `模拟｜${taskId} 验收通过，文件已收回`;
      } else {
        report.status = 'rejected';
        if (state.engineer.taskId === taskId) {
          const title = state.engineer.taskTitle.replace(/^退回修改｜/, '');
          state.engineer.taskTitle = `退回修改｜${title}`;
        }
        state.notice = `模拟｜${taskId} 退回修改：${report.note}`;
      }
      break;
    }
  }
  return state;
}

export function setStudioSchedule(state, board) {
  if (!board || !Array.isArray(board.items)) {
    state.schedule = { loaded: false, updatedAt: null, simulated: true, items: [] };
    return state;
  }
  const source = board.source ?? board.items.find((item) => item && typeof item === 'object' && item.source)?.source;
  const simulated = String(source || '') === '模拟';
  const clean = (value, fallback = '未提供') => {
    const text = String(value || fallback);
    return simulated ? text : text.replace(/模拟[｜|]?/g, '').trim();
  };
  state.schedule = {
    loaded: true,
    updatedAt: board.updatedAt ? String(board.updatedAt) : '未提供',
    simulated,
    items: board.items.filter((item) => item && typeof item === 'object').map((item) => ({
      name: clean(item.name, simulated ? '模拟｜未命名排程' : '未命名排程'),
      owner: clean(item.owner),
      time: clean(item.time),
      updatedAt: clean(item.updatedAt),
      source: clean(item.source),
      lastResult: clean(item.lastResult),
      control: '模拟｜仅展示，不可执行',
    })),
  };
  return state;
}

export function setStudioBridgeConnection(state, connected) {
  state.bridge.connection = connected ? 'connected' : 'disconnected';
  if (!connected) state.engineer.claimPending = false;
  return state;
}

export function setStudioMode(state, mode) {
  if (!Object.hasOwn(MODE_COPY, mode)) return state;
  state.bridge.mode = String(mode);
  const view = studioModeView(state);
  if (!view.claimable) state.engineer.claimPending = false;
  if (!state.engineer.taskId) state.engineer.taskTitle = view.engineerIdle;
  return state;
}

export function setStudioReal(state, real) {
  const read = (items) => Array.isArray(items) ? items.filter((item) => item && typeof item === 'object').map((item) => ({
    id: String(item.id || '未提供'),
    title: String(item.title || '未提供'),
    status: String(item.status || '未提供'),
    deadline: item.deadline ? String(item.deadline) : '未提供',
    url: item.url ? String(item.url) : null,
  })) : [];
  const count = (key) => Number.isFinite(real?.counts?.[key]) ? real.counts[key] : null;
  state.real = {
    ok: Boolean(real && real.ok === true),
    working: read(real?.working),
    claimable: read(real?.claimable),
    counts: { total: count('total'), open: count('open'), claimable: count('claimable'), working: count('working'), blocked: count('blocked'), review: count('review') },
    error: real?.error ? String(real.error) : null,
  };
  return state;
}

export function realWorkView(state) {
  if (state.bridge.connection === 'disconnected' || state.bridge.connected === false) return { kind: 'error', text: '桥接未连接' };
  if (state.bridge.mode === 'dry-run') return { kind: 'mode', text: '仅 notion-read 模式提供' };
  if (state.real.ok === false) return { kind: 'error', text: '真实工单读取失败' };
  if (state.real.ok === null) return { kind: 'loading', text: '真实工单读取中' };
  return { kind: 'ready', text: '' };
}

export function realCountsView(counts) {
  const value = (count) => Number.isFinite(count) ? String(count) : '未提供';
  return `总数 ${value(counts.total)}｜未结 ${value(counts.open)}｜进行中 ${value(counts.working)}｜可领取 ${value(counts.claimable)}`;
}

export function realWorkGroups(state) {
  const groups = [{ key: 'claimable', label: '可领取', items: state.real.claimable }];
  const byStatus = new Map();
  for (const item of state.real.working) {
    const label = item.status || '未提供';
    if (!byStatus.has(label)) byStatus.set(label, []);
    byStatus.get(label).push(item);
  }
  let index = 0;
  for (const [label, items] of byStatus) {
    groups.push({ key: index === 0 ? 'working' : `working-${index}`, label, items });
    index += 1;
  }
  return groups;
}

export function realGroupEmptyText(group, items) {
  if (items.length) return '';
  return group === 'claimable' ? '目前没有可领取的单' : '目前没有工单';
}

export function canStudioClaim(state) {
  return studioModeView(state).claimable;
}

/** Record the intent only. Confirmation events, never clicks, complete the work. */
export function beginStudioAction(state, payload) {
  const action = { ...payload, ts: Number.isFinite(payload.ts) ? payload.ts : Date.now() };
  if (action.action === 'claim_request' && !canStudioClaim(state)) {
    state.engineer.claimPending = false;
    state.notice = studioModeView(state).notice;
    return action;
  }
  const prefix = studioModeView(state).prefix;
  state.actions.push(action);
  if (action.action === 'claim_request' && action.agent === 'engineer') {
    state.engineer.claimPending = true;
    state.notice = `${prefix}已送出领取请求，等待确认`;
  }
  if (action.action === 'review' && action.task_id) {
    const taskId = String(action.task_id);
    state.reviewPending[taskId] = { result: String(action.result || ''), note: String(action.note || '') };
    state.notice = `${prefix}${taskId} 已送出，等待桥接确认`;
  }
  return action;
}

export function latestReport(state) {
  const id = state.reportOrder.at(-1);
  return id ? state.reports[id] : null;
}

export function bridgeView(state, now = Date.now()) {
  const b = state.bridge;
  if (b.connection === 'disconnected' || b.connected === false) return { text: '桥接未连接', title: '桥接未连接', stale: true, note: b.note };
  if (!b.received) return { text: '状态未知', title: '状态未知', stale: true, note: b.note };
  const title = MODE_COPY[b.mode]?.banner || '状态未知';
  const stale = !b.lastUpdateTs || now - b.lastUpdateTs > 60_000;
  if (stale) {
    const time = b.lastUpdateTs
      ? new Date(b.lastUpdateTs).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })
      : '未知';
    return { text: `资料过时／断线，最后更新 ${time}`, title: '资料过时／断线', stale: true, note: b.note };
  }
  return { text: title, title, stale: false, note: b.note };
}

export class StudioStore {
  constructor() {
    this.state = createStudioState();
    this.listeners = new Set();
    this.eventListeners = new Set();
  }
  subscribe(fn) { this.listeners.add(fn); return () => this.listeners.delete(fn); }
  onEvent(fn) { this.eventListeners.add(fn); return () => this.eventListeners.delete(fn); }
  emit() { for (const fn of this.listeners) fn(); }
  apply(ev) {
    applyStudioEvent(this.state, ev);
    for (const fn of this.eventListeners) fn(ev);
    this.emit();
  }
  beginAction(payload) {
    const action = beginStudioAction(this.state, payload);
    this.emit();
    return action;
  }
  setSchedule(board) {
    setStudioSchedule(this.state, board);
    this.emit();
  }
  setReal(real) {
    setStudioReal(this.state, real);
    this.emit();
  }
  setMode(mode) {
    setStudioMode(this.state, mode);
    this.emit();
  }
  setBridgeConnection(connected) {
    setStudioBridgeConnection(this.state, connected);
    this.emit();
  }
}
