import './studio.css';
import { createState } from '../../shared/protocol.js';
import { runDryRun } from '../../sim/dry-run.js';
import { store } from '../core/store';
import { World } from '../world/World';
import { StudioHud } from './StudioHud';
import { canStudioClaim, latestReport, studioModeText, studioModeView, StudioStore, type StudioEvent } from './state';
import { fetchStudioState, postStudioAction, subscribeBridge, useBridge, type StudioActionPayload } from './transport';

export async function bootStudio(app: HTMLElement, stage: HTMLElement) {
  document.title = 'MSOS 工作室 · 状态未知';
  document.documentElement.dataset.theme = 'light';
  app.classList.add('studio-mode');
  stage.classList.add('studio-stage');

  const studio = new StudioStore();
  let hud: StudioHud;
  const world = new World(stage, {
    onPick(agentId) { if (agentId) hud.openAgent(agentId); },
    onHover() { /* Studio tags provide their own hover state. */ },
    onMessage() { /* No real messages are sent in dry-run. */ },
  });

  const sendAction = async (payload: Omit<StudioActionPayload, 'ts'>) => {
    if (payload.action === 'claim_request' && !canStudioClaim(studio.state)) {
      studio.state.notice = studioModeView(studio.state).notice;
      studio.emit();
      return;
    }
    const action = studio.beginAction({ ...payload, ts: Date.now() });
    try {
      await postStudioAction(action);
    } catch {
      studio.state.notice = useBridge ? '桥接未接受请求，请检查连接' : studioModeText(studio.state, '模拟｜本地动作处理器未接受请求，请重试');
      if (useBridge) studio.setBridgeConnection(false);
      studio.state.engineer.claimPending = false;
      if (action.task_id) delete studio.state.reviewPending[action.task_id];
      studio.emit();
    }
  };

  hud = new StudioHud(app, studio, {
    claim: () => { void sendAction({ action: 'claim_request', agent: 'engineer' }); },
    review: (taskId, result, note) => { void sendAction({ action: 'review', task_id: taskId, result, note }); },
  });

  store.replace(createState());
  const syncFloor = () => {
    const kimi = store.state.agents.kimi;
    if (kimi && (kimi.status !== 'idle' || kimi.activity !== '尚未接通')) {
      // Kimi is a fixed, unavailable seat in v2; no event may show it working.
      store.applyLocal({ type: 'status', agent: 'kimi', status: 'idle', activity: '尚未接通' });
      return;
    }
    world.sync(store.state);
  };
  store.subscribe(syncFloor);
  store.applyLocal({ type: 'join', agent: 'coo', name: 'COO', role: 'Lead', source: 'dry-run', team: 'MSOS 工作室', activity: '模拟｜确认任务与验收' });
  store.applyLocal({ type: 'join', agent: 'engineer', name: 'Engineer', role: 'Engineer', source: 'dry-run', team: 'MSOS 工作室', activity: '模拟｜等待领取任务' });
  store.applyLocal({ type: 'join', agent: 'kimi', name: 'Kimi', role: '前端', source: 'dry-run', team: 'MSOS 工作室', activity: '尚未接通' });
  store.setMode('demo');
  world.setTheme('light');
  // Frame the three-person MSOS room, not the surrounding demo amenities.
  world.focusStudio();

  studio.onEvent((ev) => {
    if (ev.type === 'claim_confirmed' && ev.agent === 'engineer') world.walkEngineerToCoo();
  });
  studio.subscribe(() => {
    const current = store.state.agents.engineer;
    const engineer = studio.state.engineer;
    const mode = studioModeView(studio.state);
    const status = !mode.claimable ? 'idle' : engineer.blocked ? 'waiting' : engineer.taskId ? 'working' : 'idle';
    const activity = !mode.claimable
      ? mode.engineerIdle
      : engineer.blocked
        ? `${mode.prefix}举手：${studioModeText(studio.state, engineer.blocked.reason)}`
        : engineer.taskId ? studioModeText(studio.state, engineer.taskTitle) : mode.engineerIdle;
    if (current && (current.status !== status || current.activity !== activity)) {
      store.applyLocal({ type: 'status', agent: 'engineer', status, activity });
    }
    const report = latestReport(studio.state);
    world.setStudioReport(report ? report.status : null);
  });

  world.onFrame = () => hud.frame(world.anchors(), world.deskAnchor('engineer'));
  setInterval(() => hud.tick(), 1000);

  const dispatch = (event: StudioEvent) => studio.apply(event);
  if (!useBridge) setInterval(() => {
    const ts = Date.now();
    // No status field: keep a completed role completed instead of re-joining as idle.
    store.applyLocal({ type: 'status', agent: 'coo', activity: '模拟｜60 秒心跳保活', ts });
    dispatch({ type: 'status', agent: 'coo', activity: '模拟｜60 秒心跳保活', ts });
  }, 60_000);
  const params = new URLSearchParams(location.search);
  const now = Date.now();
  // Real bridge status comes only from the bridge; never fake a connection or confirmation.
  if (!useBridge) dispatch({ type: 'bridge_status', mode: 'dry-run', connected: true, last_update_ts: now, note: '模拟｜本地 dry-run 已就绪' });
  const refreshReal = async () => {
    if (!useBridge || studio.state.bridge.mode === 'dry-run') return;
    try {
      const snapshot = await fetchStudioState();
      if (snapshot.mode) studio.setMode(snapshot.mode);
      studio.setReal(snapshot.real || null);
      if (snapshot.schedule) studio.setSchedule(snapshot.schedule);
    } catch {
      studio.setReal(null);
    }
  };
  studio.onEvent((event) => { if (event.type === 'bridge_status') void refreshReal(); });
  // Static COO-maintained asset only; a missing file or SPA HTML fallback is not a schedule.
  void fetch('/schedule-board.json', { cache: 'no-store', headers: { Accept: 'application/json' } })
    .then((response) => {
      if (!response.ok || !response.headers.get('content-type')?.includes('application/json')) throw new Error('schedule unavailable');
      return response.json();
    })
    .then((board) => studio.setSchedule(board))
    .catch(() => studio.setSchedule(null));

  const capture = params.get('capture');
  if (capture === 'waiting') {
    void sendAction({ action: 'claim_request', agent: 'engineer' });
  } else if (capture === 'report') {
    dispatch({ type: 'claim_confirmed', agent: 'engineer', task_id: 'SIM-001', task_title: '模拟｜制作工作室领任务与验收界面', source: '模拟 COO' });
    dispatch({ type: 'report_ready', agent: 'engineer', task_id: 'SIM-001', report_local: '/sim-reports/SIM-001-report.md', summary: '模拟｜已完成三角色桌面、领取确认、阻塞举手与验收交互；本文件只是本地演示。' });
    hud.openReport();
  } else if (capture === 'notion-read') {
    dispatch({ type: 'bridge_status', mode: 'notion-read', connected: true, last_update_ts: now, note: '只读展示，未读取 Notion' });
    studio.setReal({ ok: true, counts: { total: 2, open: 2, claimable: 1, working: 1, blocked: 0, review: 0 }, working: [{ id: 'SIM-READ-001', title: '只读｜进行中的工单', status: '进行中', deadline: '2026-11-07', url: 'https://app.notion.com/' }], claimable: [{ id: 'SIM-READ-002', title: '只读｜可领取的工单', status: '可领取', deadline: '2026-11-08', url: 'https://app.notion.com/' }] });
  } else if (capture === 'offline') {
    dispatch({ type: 'bridge_status', mode: 'dry-run', connected: false, last_update_ts: now - 65_000, note: '模拟｜桥接断线证据' });
  } else if (capture === 'bridge-offline') {
    studio.setBridgeConnection(false);
  } else if (params.has('simulate')) {
    void runDryRun(dispatch, { delayMs: 1400 });
  } else if (useBridge) {
    subscribeBridge(dispatch, (connected) => studio.setBridgeConnection(connected));
  }

  // Read-only inspection handles for the local dry-run checks and captures.
  Object.assign(window, { __studio: studio, __studioHud: hud, __floor: world });
}
