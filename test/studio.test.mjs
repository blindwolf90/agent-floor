import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, createState, normalizeEvent } from '../shared/protocol.js';
import { applyStudioEvent, beginStudioAction, bridgeView, canStudioClaim, createStudioState, latestReport, realCountsView, realGroupEmptyText, realWorkGroups, realWorkView, setStudioBridgeConnection, setStudioMode, setStudioReal, setStudioSchedule, studioModeText, studioModeView } from '../src/studio/state.js';
import { createDryRunEvents } from '../sim/dry-run.js';

function connectedState(mode = 'dry-run') {
  const state = createStudioState();
  applyStudioEvent(state, { type: 'bridge_status', mode, connected: true, last_update_ts: 1000 });
  return state;
}

test('studio events stay out of the existing server protocol', () => {
  assert.equal(normalizeEvent({ type: 'claim_confirmed', agent: 'engineer' }), null);
  assert.equal(normalizeEvent({ type: 'review_result', task_id: 'SIM-001' }), null);
});

test('claim click waits; only claim_confirmed assigns the task', () => {
  const s = connectedState();
  beginStudioAction(s, { action: 'claim_request', agent: 'engineer', ts: 10 });
  assert.equal(s.engineer.claimPending, true);
  assert.equal(s.engineer.taskId, null);
  assert.match(s.notice, /等待确认/);
  applyStudioEvent(s, { type: 'claim_confirmed', agent: 'engineer', task_id: 'SIM-001', task_title: '模拟｜测试任务', source: '模拟 COO' });
  assert.equal(s.engineer.taskId, 'SIM-001');
  assert.equal(s.engineer.claimPending, false);
});

test('claim rejection keeps the reason visible', () => {
  const s = connectedState();
  beginStudioAction(s, { action: 'claim_request', agent: 'engineer' });
  applyStudioEvent(s, { type: 'claim_rejected', agent: 'engineer', reason: '模拟｜稍后再试' });
  assert.equal(s.engineer.lastRejection, '模拟｜稍后再试');
  assert.equal(s.engineer.taskId, null);
});

test('blocked remains unresolved until a later confirmed claim', () => {
  const s = connectedState();
  applyStudioEvent(s, { type: 'blocked', agent: 'engineer', task_id: 'SIM-001', reason: '模拟｜缺少字段' });
  assert.equal(s.engineer.blocked.reason, '模拟｜缺少字段');
  beginStudioAction(s, { action: 'claim_request', agent: 'engineer' });
  assert.ok(s.engineer.blocked, 'click must not clear the marker');
});

test('review click cannot clear or recolour a report before review_result', () => {
  const s = createStudioState();
  applyStudioEvent(s, { type: 'report_ready', agent: 'engineer', task_id: 'SIM-001', summary: '模拟｜摘要', report_local: '/sim-reports/SIM-001-report.md' });
  beginStudioAction(s, { action: 'review', task_id: 'SIM-001', result: 'approved', note: '模拟｜通过' });
  assert.equal(latestReport(s).status, 'ready');
  assert.ok(s.reviewPending['SIM-001']);
  applyStudioEvent(s, { type: 'review_result', task_id: 'SIM-001', result: 'returned', note: '模拟｜退回' });
  assert.equal(latestReport(s).status, 'rejected');
  applyStudioEvent(s, { type: 'review_result', task_id: 'SIM-001', result: 'approved', note: '模拟｜通过' });
  assert.equal(latestReport(s), null);
});

test('bridge banner covers unknown, fresh, stale and disconnected states', () => {
  const s = createStudioState();
  assert.match(bridgeView(s, 100_000).text, /状态未知/);
  applyStudioEvent(s, { type: 'bridge_status', mode: 'dry-run', connected: true, last_update_ts: 100_000, note: '模拟' });
  assert.match(bridgeView(s, 120_000).text, /模拟模式/);
  assert.match(bridgeView(s, 161_001).text, /资料过时／断线/);
  applyStudioEvent(s, { type: 'bridge_status', connected: false, last_update_ts: 161_001, note: '模拟' });
  assert.equal(bridgeView(s, 161_001).text, '桥接未连接');
});

test('simulator includes every dry-run event in a deterministic order', () => {
  const events = createDryRunEvents(1000);
  assert.deepEqual(events.map((e) => e.type), ['bridge_status', 'status', 'claim_rejected', 'claim_confirmed', 'blocked', 'report_ready', 'review_result']);
  assert.equal(events.filter((e) => e.type === 'claim_rejected').length, 1);
  assert.equal(events.filter((e) => e.type === 'blocked').length, 1);
  const heartbeat = events.find((e) => e.type === 'status');
  assert.equal(heartbeat.ts, 61_000);
  assert.equal('status' in heartbeat, false, 'heartbeat must not assign a replacement status');
  assert.ok(events.every((e) => e.type !== 'join'));
  assert.ok(events.every((e) => !e.task_id || e.task_id.startsWith('SIM-')));
});

test('Kimi seat stays unavailable for every work-like event', () => {
  const s = createStudioState();
  applyStudioEvent(s, { type: 'status', agent: 'kimi', status: 'working', activity: '工作中', ts: 10 });
  applyStudioEvent(s, { type: 'claim_confirmed', agent: 'kimi', task_id: 'SIM-002', task_title: '模拟｜不应领取' });
  applyStudioEvent(s, { type: 'report_ready', agent: 'kimi', task_id: 'SIM-002', summary: '模拟｜不应出现' });
  assert.equal(s.kimi.status, '尚未接通');
  assert.equal(s.bridge.received, false);
  assert.deepEqual(s.reports, {});
});

test('60-second status heartbeat preserves a completed role', () => {
  const world = createState();
  applyEvent(world, normalizeEvent({ type: 'join', agent: 'coo', team: 'MSOS 工作室', ts: 1 }));
  applyEvent(world, normalizeEvent({ type: 'status', agent: 'coo', status: 'done', ts: 2 }));
  applyEvent(world, normalizeEvent({ type: 'status', agent: 'coo', activity: '模拟｜60 秒心跳保活', ts: 60_002 }));
  assert.equal(world.agents.coo.status, 'done');
  assert.equal(world.agents.coo.lastSeen, 60_002);
});

test('schedule board renders updatedAt, source and a fixed non-executable label', () => {
  const s = createStudioState();
  assert.equal(s.schedule.loaded, false);
  setStudioSchedule(s, { updatedAt: '2026-11-06', items: [{ name: '模拟｜排程', owner: '模拟 COO', time: '09:17', source: '模拟来源', lastResult: '模拟｜等待确认', control: '模拟｜仅展示' }] });
  assert.equal(s.schedule.loaded, true);
  assert.equal(s.schedule.updatedAt, '2026-11-06');
  assert.deepEqual(Object.keys(s.schedule.items[0]), ['name', 'owner', 'time', 'updatedAt', 'source', 'lastResult', 'control']);
  assert.equal(s.schedule.items[0].updatedAt, '未提供');
  assert.equal(s.schedule.items[0].control, '模拟｜仅展示，不可执行');
  setStudioSchedule(s, { source: 'COO', updatedAt: '2026-11-08', items: [{ name: '模拟｜晨间检查', owner: '模拟 COO', time: '09:17', updatedAt: '2026-11-09 09:17 +08:00', source: 'COO', lastResult: '模拟｜完成', control: '忽略输入' }] });
  assert.equal(s.schedule.updatedAt, '2026-11-08');
  assert.equal(s.schedule.simulated, false);
  assert.equal(s.schedule.items[0].updatedAt, '2026-11-09 09:17 +08:00');
  assert.equal(s.schedule.items[0].source, 'COO');
  assert.equal(s.schedule.items[0].control, '模拟｜仅展示，不可执行');
  assert.ok(Object.entries(s.schedule.items[0]).filter(([key]) => key !== 'control').every(([, value]) => !value.includes('模拟')));
  setStudioSchedule(s, null);
  assert.equal(s.schedule.loaded, false);
  assert.deepEqual(s.schedule.items, []);
});

test('disconnected bridge hides mode copy and blocks claim before transport', () => {
  const s = connectedState('live');
  setStudioBridgeConnection(s, false);
  beginStudioAction(s, { action: 'claim_request', agent: 'engineer', ts: 10 });
  const view = studioModeView(s);
  assert.equal(s.engineer.taskId, null);
  assert.equal(s.engineer.claimPending, false);
  assert.deepEqual(s.actions, []);
  assert.deepEqual(s.reports, {});
  assert.equal(bridgeView(s, 20).text, '桥接未连接');
  assert.equal(view.subtitle, 'Agent Floor');
  assert.equal(view.mode, null);
  assert.equal(view.launcher, '桥接未连接');
  assert.equal(canStudioClaim(s), false);
});

test('subtitle, banner, nameplates and claim state follow all four modes', () => {
  const s = createStudioState();
  assert.equal(bridgeView(s, 1000).title, '状态未知');
  assert.equal(canStudioClaim(s), false);
  const cases = [
    ['dry-run', 'Agent Floor · 模拟', '模拟模式', '工作室｜领任务（模拟）', true],
    ['notion-read', 'Agent Floor · 只读真实工单', '只读真实工单｜不可领取', '只读模式，不可领取', false],
    ['claim-test', 'Agent Floor · 领取测试（隔离库）', '领取测试（隔离库）', '领任务｜写入隔离测试库', true],
    ['live', 'Agent Floor · 正式', '正式模式', '工作室｜领任务', true],
  ];
  for (const [mode, subtitle, title, launcher, claimable] of cases) {
    applyStudioEvent(s, { type: 'bridge_status', mode, connected: true, last_update_ts: 1000 });
    const view = studioModeView(s);
    assert.equal(view.subtitle, subtitle);
    assert.equal(view.launcher, launcher);
    assert.equal(view.claimable, claimable);
    assert.equal(canStudioClaim(s), claimable);
    assert.equal(bridgeView(s, 2000).text, title);
    assert.equal(bridgeView(s, 2000).title, title);
    assert.ok(view.engineerIdle && view.coo && view.kimi);
  }
  assert.equal(studioModeText(s, '模拟｜等待领取任务'), '等待领取任务');
  setStudioMode(s, 'claim-test');
  assert.equal(studioModeText(s, '模拟｜等待领取任务'), '隔离测试｜等待领取任务');
});

test('approved review clears the nameplate while returned keeps the task marked', () => {
  const approved = createStudioState();
  applyStudioEvent(approved, { type: 'claim_confirmed', agent: 'engineer', task_id: 'SIM-003', task_title: '模拟｜验收后清理' });
  applyStudioEvent(approved, { type: 'report_ready', agent: 'engineer', task_id: 'SIM-003', summary: '模拟｜报告' });
  applyStudioEvent(approved, { type: 'review_result', task_id: 'SIM-003', result: 'approved' });
  assert.equal(approved.engineer.taskId, null);
  assert.equal(approved.engineer.taskTitle, '模拟｜等待领取任务');
  assert.equal(latestReport(approved), null);

  const returned = createStudioState();
  applyStudioEvent(returned, { type: 'claim_confirmed', agent: 'engineer', task_id: 'SIM-004', task_title: '模拟｜退回后保留' });
  applyStudioEvent(returned, { type: 'report_ready', agent: 'engineer', task_id: 'SIM-004', summary: '模拟｜报告' });
  applyStudioEvent(returned, { type: 'review_result', task_id: 'SIM-004', result: 'returned' });
  assert.equal(returned.engineer.taskId, 'SIM-004');
  assert.equal(returned.engineer.taskTitle, '退回修改｜模拟｜退回后保留');
  assert.equal(latestReport(returned).status, 'rejected');
});

test('notion-read real work failure has explicit read-error copy', () => {
  const s = createStudioState();
  applyStudioEvent(s, { type: 'bridge_status', mode: 'notion-read', connected: true, last_update_ts: 1000 });
  setStudioReal(s, null);
  assert.equal(realWorkView(s).text, '真实工单读取失败');
});

test('notion-read claim intent is blocked before recording or transport', () => {
  const s = createStudioState();
  applyStudioEvent(s, { type: 'bridge_status', mode: 'notion-read', connected: true, last_update_ts: 1000 });
  assert.equal(canStudioClaim(s), false);
  beginStudioAction(s, { action: 'claim_request', agent: 'engineer', ts: 2000 });
  assert.deepEqual(s.actions, []);
  assert.equal(s.engineer.claimPending, false);
  assert.equal(s.engineer.taskId, null);
  assert.equal(s.notice, '等待领取（只读模式，不可领取）');
});

test('real counts come from the bridge and claimable group size matches counts.claimable', () => {
  const s = connectedState('notion-read');
  setStudioReal(s, {
    ok: true,
    counts: { total: 7, open: 5, claimable: 2, working: 2, blocked: 0, review: 2 },
    claimable: [
      { id: 'READ-001', title: '可领取一', status: '可领取', deadline: '2026-11-10', url: null },
      { id: 'READ-002', title: '可领取二', status: '可领取', deadline: '2026-11-11', url: null },
    ],
    working: [
      { id: 'READ-003', title: '进行中', status: '进行中', deadline: '2026-11-12', url: null },
      { id: 'READ-004', title: '被挡住', status: '被挡住', deadline: '2026-11-13', url: null },
    ],
  });
  assert.equal(realCountsView(s.real.counts), '总数 7｜未结 5｜进行中 2｜可领取 2');
  const groups = realWorkGroups(s);
  assert.equal(groups[0].label, '可领取');
  assert.equal(groups[0].items.length, s.real.counts.claimable);
  assert.deepEqual(groups.slice(1).map((group) => group.label), ['进行中', '被挡住']);
});

test('claimable group has a specific empty state', () => {
  const s = createStudioState();
  setStudioReal(s, { ok: true, claimable: [], working: [] });
  assert.equal(realGroupEmptyText('claimable', s.real.claimable), '目前没有可领取的单');
  assert.equal(realGroupEmptyText('working', s.real.working), '目前没有工单');
});
