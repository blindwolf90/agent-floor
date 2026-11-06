import { test } from 'node:test';
import assert from 'node:assert/strict';
import { applyEvent, createState, normalizeEvent } from '../shared/protocol.js';
import { applyStudioEvent, beginStudioAction, bridgeView, createStudioState, latestReport, setStudioSchedule } from '../src/studio/state.js';
import { createDryRunEvents } from '../sim/dry-run.js';

test('studio events stay out of the existing server protocol', () => {
  assert.equal(normalizeEvent({ type: 'claim_confirmed', agent: 'engineer' }), null);
  assert.equal(normalizeEvent({ type: 'review_result', task_id: 'SIM-001' }), null);
});

test('claim click waits; only claim_confirmed assigns the task', () => {
  const s = createStudioState();
  beginStudioAction(s, { action: 'claim_request', agent: 'engineer', ts: 10 });
  assert.equal(s.engineer.claimPending, true);
  assert.equal(s.engineer.taskId, null);
  assert.match(s.notice, /等待确认/);
  applyStudioEvent(s, { type: 'claim_confirmed', agent: 'engineer', task_id: 'SIM-001', task_title: '模拟｜测试任务', source: '模拟 COO' });
  assert.equal(s.engineer.taskId, 'SIM-001');
  assert.equal(s.engineer.claimPending, false);
});

test('claim rejection keeps the reason visible', () => {
  const s = createStudioState();
  beginStudioAction(s, { action: 'claim_request', agent: 'engineer' });
  applyStudioEvent(s, { type: 'claim_rejected', agent: 'engineer', reason: '模拟｜稍后再试' });
  assert.equal(s.engineer.lastRejection, '模拟｜稍后再试');
  assert.equal(s.engineer.taskId, null);
});

test('blocked remains unresolved until a later confirmed claim', () => {
  const s = createStudioState();
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
  assert.match(bridgeView(s, 120_000).text, /已连接/);
  assert.match(bridgeView(s, 161_001).text, /资料过时／断线/);
  applyStudioEvent(s, { type: 'bridge_status', connected: false, last_update_ts: 161_001, note: '模拟' });
  assert.match(bridgeView(s, 161_001).text, /断线/);
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

test('schedule board renders provided fields and has an explicit missing state', () => {
  const s = createStudioState();
  assert.equal(s.schedule.loaded, false);
  setStudioSchedule(s, { updatedAt: '2026-11-06', items: [{ name: '模拟｜排程', owner: '模拟 COO', time: '09:17', source: '模拟来源', lastResult: '模拟｜等待确认', control: '模拟｜仅展示' }] });
  assert.equal(s.schedule.loaded, true);
  assert.equal(s.schedule.updatedAt, '2026-11-06');
  assert.deepEqual(Object.keys(s.schedule.items[0]), ['name', 'owner', 'time', 'source', 'lastResult', 'control']);
  setStudioSchedule(s, null);
  assert.equal(s.schedule.loaded, false);
  assert.deepEqual(s.schedule.items, []);
});
