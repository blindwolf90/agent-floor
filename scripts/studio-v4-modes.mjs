// ENG-160-UI v4 mode consistency and read-only list checks.
// Self-contained: starts Vite and headless Chrome; never starts or modifies a bridge.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const root = process.cwd();
const out = path.join(root, 'docs/eng-160/evidence');
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'eng160-v4-modes-'));
const vite = spawn(process.execPath, ['node_modules/vite/bin/vite.js', '--host', '127.0.0.1', '--port', '5175', '--strictPort'], { cwd: root, stdio: 'ignore' });
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--use-angle=swiftshader', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9230', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const assert = (value, message) => { if (!value) throw new Error(message); };
let ws;
try {
  let ready = false;
  for (let i = 0; i < 60; i++) {
    try {
      const [page, version] = await Promise.all([
        fetch('http://127.0.0.1:5175/?studio&capture=notion-read').then((r) => r.text()),
        fetch('http://127.0.0.1:9230/json/version').then((r) => r.json()),
      ]);
      if (page.includes('Agent Floor') && version.webSocketDebuggerUrl) { ready = true; break; }
    } catch { /* servers are still starting */ }
    await wait(200);
  }
  assert(ready, 'Vite or Chrome did not start');
  const target = await fetch('http://127.0.0.1:9230/json/new?about:blank', { method: 'PUT' }).then((r) => r.json());
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (!data.id || !pending.has(data.id)) return;
    const pair = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) pair.reject(new Error(JSON.stringify(data.error))); else pair.resolve(data.result);
  });
  const send = (method, params = {}) => new Promise((resolve, reject) => {
    const callId = ++id;
    pending.set(callId, { resolve, reject });
    ws.send(JSON.stringify({ id: callId, method, params }));
  });
  const evaluate = async (expression) => {
    const result = await send('Runtime.evaluate', { expression, returnByValue: true, awaitPromise: true });
    if (result.exceptionDetails) throw new Error(JSON.stringify(result.exceptionDetails));
    return result.result.value;
  };
  const shot = async (name) => {
    const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true, captureBeyondViewport: false });
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(result.data, 'base64'));
  };
  await send('Page.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 1440, height: 900, deviceScaleFactor: 1, mobile: false });
  await send('Page.navigate', { url: 'http://127.0.0.1:5175/?studio&capture=notion-read' });
  await wait(5500);

  const notion = await evaluate(`({
    subtitle:document.querySelector('.studio-brand span').textContent,
    banner:document.querySelector('.studio-bridge').textContent,
    launcher:document.querySelector('.studio-launcher').textContent,
    disabled:document.querySelector('.studio-launcher').disabled,
    counts:document.querySelector('.studio-real-counts').textContent,
    groups:[...document.querySelectorAll('.studio-real-group')].map(e=>({key:e.dataset.group,items:e.querySelectorAll('li').length})),
    links:document.querySelectorAll('.studio-real a').length,
    schedule:document.querySelector('.studio-schedule').textContent,
    stateClaimable:__studio.state.real.counts.claimable,
    width:document.documentElement.scrollWidth
  })`);
  assert(notion.subtitle === 'Agent Floor · 只读真实工单', 'notion-read subtitle mismatch');
  assert(notion.banner === '只读真实工单｜不可领取', 'notion-read banner mismatch');
  assert(notion.disabled && notion.launcher === '只读模式，不可领取', 'notion-read launcher mismatch');
  assert(notion.counts === '总数 2｜未结 2｜进行中 1｜可领取 1', 'bridge counts mismatch');
  assert(notion.groups[0].key === 'claimable' && notion.groups[0].items === notion.stateClaimable, 'claimable group/count mismatch');
  assert(notion.links === 2, 'Notion links missing');
  assert(notion.schedule.includes('updatedAt') && notion.schedule.includes('2026-11-09 09:17 +08:00') && notion.schedule.includes('source') && notion.schedule.includes('模拟｜仅展示，不可执行'), 'schedule fields missing');
  assert(notion.width === 1440, 'full-screen horizontal overflow');
  await shot('studio-v4-notion-read');

  const modes = [
    ['dry-run', 'Agent Floor · 模拟', '模拟模式', '工作室｜领任务（模拟）', false],
    ['notion-read', 'Agent Floor · 只读真实工单', '只读真实工单｜不可领取', '只读模式，不可领取', true],
    ['claim-test', 'Agent Floor · 领取测试（隔离库）', '领取测试（隔离库）', '领任务｜写入隔离测试库', false],
    ['live', 'Agent Floor · 正式', '正式模式', '工作室｜领任务', false],
  ];
  for (const [mode, subtitle, banner, launcher, disabled] of modes) {
    const actual = await evaluate(`(()=>{__studio.apply({type:'bridge_status',mode:${JSON.stringify(mode)},connected:true,last_update_ts:Date.now()});return{subtitle:document.querySelector('.studio-brand span').textContent,banner:document.querySelector('.studio-bridge').textContent,launcher:document.querySelector('.studio-launcher').textContent,disabled:document.querySelector('.studio-launcher').disabled,claimDisabled:document.querySelector('.studio-claim').disabled}})()`);
    assert(actual.subtitle === subtitle && actual.banner === banner && actual.launcher === launcher && actual.disabled === disabled && actual.claimDisabled === disabled, `${mode} DOM mismatch: ${JSON.stringify(actual)}`);
  }

  await evaluate(`__studio.apply({type:'bridge_status',mode:'notion-read',connected:true,last_update_ts:Date.now()});__studio.setReal({ok:true,counts:{total:0,open:0,claimable:0,working:0,blocked:0,review:0},claimable:[],working:[]})`);
  assert(await evaluate(`document.querySelector('.studio-real-message').textContent==='目前没有真实工单'`), 'empty real-list state missing');
  await evaluate(`__studio.setReal(null)`);
  assert(await evaluate(`document.querySelector('.studio-real-message').textContent==='真实工单读取失败'`), 'real-list error state missing');

  await evaluate(`__studio.apply({type:'bridge_status',mode:'live',connected:true,last_update_ts:Date.now()});__studio.setBridgeConnection(false)`);
  const offline = await evaluate(`({subtitle:document.querySelector('.studio-brand span').textContent,banner:document.querySelector('.studio-bridge').textContent,launcher:document.querySelector('.studio-launcher').textContent,disabled:document.querySelector('.studio-launcher').disabled,claimDisabled:document.querySelector('.studio-claim').disabled,actions:__studio.state.actions.length})`);
  assert(offline.subtitle === 'Agent Floor' && offline.banner === '桥接未连接', 'offline mode copy leaked');
  assert(offline.launcher === '桥接未连接' && offline.disabled && offline.claimDisabled && offline.actions === 0, 'offline claim is not disabled');
  await shot('studio-v4-bridge-offline');

  const report = { passed: true, viewport: '1440x900', modes: modes.map(([mode]) => mode), notionRead: { counts: notion.counts, groups: notion.groups, claimRequests: 0 }, emptyState: '目前没有真实工单', errorState: '真实工单读取失败', offline, screenshots: ['studio-v4-notion-read.png', 'studio-v4-bridge-offline.png'], bridgeModified: false, notionReadFromRealService: false };
  fs.writeFileSync(path.join(out, 'studio-v4-mode-checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (ws) ws.close();
  for (const process of [chrome, vite]) {
    if (process.exitCode === null && process.signalCode === null) process.kill('SIGTERM');
  }
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
