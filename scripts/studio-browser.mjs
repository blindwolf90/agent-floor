// ENG-160 Chrome mobile-mode interaction checks + v1 regression and v2 evidence screenshots.
// Requires only the Vite server: npm exec vite -- --host 127.0.0.1 --port 5175
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const base = process.env.STUDIO_URL || 'http://127.0.0.1:5175';
const out = path.resolve('docs/eng-160/evidence');
fs.mkdirSync(out, { recursive: true });
const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'eng160-chrome-'));
const chrome = spawn('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', [
  '--headless=new', '--use-angle=swiftshader', '--no-first-run', '--no-default-browser-check',
  '--remote-debugging-port=9223', `--user-data-dir=${profile}`, 'about:blank',
], { stdio: 'ignore' });
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let ws;
try {
  let version;
  for (let i = 0; i < 40; i++) {
    try { version = await fetch('http://127.0.0.1:9223/json/version').then((r) => r.json()); break; } catch { await wait(150); }
  }
  if (!version) throw new Error('Chrome DevTools did not start');
  const target = await fetch('http://127.0.0.1:9223/json/new?about:blank', { method: 'PUT' }).then((r) => r.json());
  ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((resolve, reject) => { ws.addEventListener('open', resolve, { once: true }); ws.addEventListener('error', reject, { once: true }); });
  let id = 0;
  const pending = new Map();
  const actionRequests = [];
  ws.addEventListener('message', (event) => {
    const data = JSON.parse(event.data);
    if (data.method === 'Network.requestWillBeSent' && new URL(data.params.request.url).pathname === '/actions') actionRequests.push(data.params.request.url);
    if (!data.id || !pending.has(data.id)) return;
    const { resolve, reject } = pending.get(data.id);
    pending.delete(data.id);
    if (data.error) reject(new Error(JSON.stringify(data.error))); else resolve(data.result);
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
  const navigate = async (query) => {
    const suffix = query.includes('=') ? query : `capture=${query}`;
    await send('Page.navigate', { url: `${base}/?studio&${suffix}` });
    await wait(5500);
  };
  const click = async (selector) => {
    const point = await evaluate(`(()=>{const e=document.querySelector(${JSON.stringify(selector)});if(!e)throw new Error('missing ${selector}');const r=e.getBoundingClientRect();return{x:r.left+r.width/2,y:r.top+r.height/2}})()`);
    await send('Input.dispatchMouseEvent', { type: 'mousePressed', ...point, button: 'left', clickCount: 1 });
    await send('Input.dispatchMouseEvent', { type: 'mouseReleased', ...point, button: 'left', clickCount: 1 });
    await wait(150);
  };
  const shot = async (name) => {
    const result = await send('Page.captureScreenshot', { format: 'png', fromSurface: true });
    fs.writeFileSync(path.join(out, `${name}.png`), Buffer.from(result.data, 'base64'));
    console.log(`[模拟截图] ${name}.png`);
  };
  const assert = (value, message) => { if (!value) throw new Error(message); };
  const waitFor = async (expression, message, timeout = 10_000) => {
    const started = Date.now();
    while (Date.now() - started < timeout) {
      if (await evaluate(expression)) return;
      await wait(150);
    }
    throw new Error(message);
  };

  await send('Page.enable');
  await send('Network.enable');
  await send('Emulation.setDeviceMetricsOverride', { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await send('Emulation.setTouchEmulationEnabled', { enabled: true, maxTouchPoints: 5 });

  await navigate('default');
  assert(await evaluate(`Object.keys(__studio.state.reports).length===0 && document.querySelectorAll('.studio-tag').length===3`), 'default must have three roles and no report');
  const defaultLayout = await evaluate(`({width:document.documentElement.scrollWidth,banner:document.querySelector('.studio-banner').getBoundingClientRect().toJSON(),notice:document.querySelector('.studio-notice').getBoundingClientRect().toJSON(),launcher:document.querySelector('.studio-launcher').getBoundingClientRect().toJSON(),tags:[...document.querySelectorAll('.studio-tag')].map(e=>({id:e.dataset.agent,visibility:getComputedStyle(e).visibility,...e.getBoundingClientRect().toJSON()}))})`);
  assert(defaultLayout.width === 390 && defaultLayout.banner.right <= 390, 'default horizontal overflow');
  assert(defaultLayout.tags.every((tag) => tag.visibility === 'visible' && tag.left >= 0 && tag.right <= 390 && tag.height >= 44), 'role tag clipped or below 44px');
  assert(defaultLayout.tags.every((a, i) => defaultLayout.tags.slice(i + 1).every((b) => a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top)), `role tags overlap: ${JSON.stringify(defaultLayout.tags)}`);
  assert(defaultLayout.launcher.height >= 44 && defaultLayout.launcher.bottom <= defaultLayout.notice.top, 'launcher overlaps bottom notice');
  assert(await evaluate(`__studio.state.schedule.loaded && document.querySelector('.studio-schedule h2').textContent.includes('更新于 2026-11-06') && document.querySelector('.studio-schedule').textContent.includes('模拟｜晨间领任务检查')`), 'static schedule missing');
  assert(await evaluate(`__studio.state.kimi.status==='尚未接通' && document.querySelector('[data-agent="kimi"]').textContent.includes('尚未接通')`), 'Kimi seat is not fixed unavailable');
  await shot('default');
  await shot('v2-default');
  await shot('v2-schedule');

  await evaluate(`__studio.apply({type:'status',agent:'kimi',status:'working',activity:'工作中',ts:Date.now()})`);
  assert(await evaluate(`__studio.state.kimi.status==='尚未接通' && !document.body.innerText.includes('工作中')`), 'Kimi accepted a working event');
  await click('[data-agent="kimi"]');
  assert(await evaluate(`document.querySelector('.studio-kimi-message')?.textContent==='执行入口待 Engineer 核实'`), 'Kimi fixed message missing');
  await click('.studio-modal .studio-close');
  await click('.studio-launcher');
  assert(await evaluate(`document.querySelector('.studio-menu-wrap').classList.contains('show')`), 'bottom launcher did not open claim menu');
  await click('.studio-menu-close');
  await click('[data-agent="engineer"]');
  assert(await evaluate(`document.querySelector('.studio-menu-wrap').classList.contains('show')`), 'Engineer menu did not open');
  assert(await evaluate(`document.querySelector('.studio-claim').getBoundingClientRect().height >= 44`), 'claim button below 44px');
  await click('.studio-claim');
  assert(await evaluate(`__studio.state.engineer.claimPending && __studio.state.engineer.taskId===null`), 'claim click must wait for confirmation');
  await shot('waiting');

  await evaluate(`__studio.apply({type:'claim_confirmed',agent:'engineer',task_id:'SIM-001',task_title:'模拟｜手机交互验收',source:'模拟 COO'});__studio.apply({type:'report_ready',agent:'engineer',task_id:'SIM-001',report_local:'/sim-reports/SIM-001-report.md',summary:'模拟｜手机模式坐标点击与验收状态检查。'})`);
  await wait(300);
  assert(await evaluate(`(()=>{const r=document.querySelector('.studio-file').getBoundingClientRect();return getComputedStyle(document.querySelector('.studio-file')).visibility==='visible'&&r.left>=0&&r.right<=390&&r.height>=44})()`), 'report file clipped or below 44px');
  await click('.studio-file');
  assert(await evaluate(`document.querySelector('.studio-modal-wrap').classList.contains('show')`), 'report did not open');
  await shot('report');
  await shot('v2-mobile-launcher');
  const reportLayout = await evaluate(`(()=>{const launcher=document.querySelector('.studio-launcher');const lr=launcher.getBoundingClientRect();return{width:document.documentElement.scrollWidth,modal:document.querySelector('.studio-modal').getBoundingClientRect().toJSON(),launcher:lr.toJSON(),launcherHit:document.elementFromPoint(lr.left+lr.width/2,lr.top+lr.height/2)===launcher,buttons:[...document.querySelectorAll('.studio-modal button')].filter(e=>!e.classList.contains('studio-scrim')).map(e=>({c:e.className,w:e.getBoundingClientRect().width,h:e.getBoundingClientRect().height}))}})()`);
  assert(reportLayout.width === 390 && reportLayout.modal.right <= 390, 'report modal overflow');
  assert(reportLayout.buttons.every((b) => b.w >= 44 && b.h >= 44), 'report button below 44px');
  assert(reportLayout.launcherHit && reportLayout.modal.bottom <= reportLayout.launcher.top, 'report modal obscures mobile launcher');
  await click('.studio-approve');
  assert(await evaluate(`__studio.state.reports['SIM-001'].status==='ready' && !!__studio.state.reviewPending['SIM-001']`), 'approval click changed report before confirmation');
  await evaluate(`__studio.apply({type:'review_result',task_id:'SIM-001',result:'approved',note:'模拟｜通过'})`);
  assert(await evaluate(`!__studio.state.reports['SIM-001']`), 'approved review_result should remove file');

  await evaluate(`__studio.apply({type:'report_ready',agent:'engineer',task_id:'SIM-001',summary:'模拟｜退回路径',report_local:'/sim-reports/SIM-001-report.md'});__studioHud.openReport()`);
  await click('.studio-return');
  assert(await evaluate(`__studio.state.reports['SIM-001'].status==='ready'`), 'return click changed report before confirmation');
  await evaluate(`__studio.apply({type:'review_result',task_id:'SIM-001',result:'returned',note:'模拟｜退回'});__studioHud.closeModal();__studio.apply({type:'blocked',agent:'engineer',task_id:'SIM-001',reason:'模拟｜阻塞原因检查'})`);
  assert(await evaluate(`__studio.state.reports['SIM-001'].status==='rejected'`), 'returned result should make file red');
  await click('[data-agent="engineer"]');
  assert(await evaluate(`document.querySelector('.studio-reason')?.textContent.includes('阻塞原因检查')`), 'blocked reason did not open');

  await evaluate(`__studioHud.closeModal();__studio.apply({type:'bridge_status',mode:'dry-run',connected:false,last_update_ts:Date.now()-65000,note:'模拟｜断线检查'})`);
  await wait(200);
  assert(await evaluate(`document.querySelector('.studio-bridge').textContent.includes('资料过时／断线')`), 'offline banner missing');
  await shot('offline');

  const origins = await evaluate(`[...new Set(performance.getEntriesByType('resource').map(e=>new URL(e.name).origin))]`);
  assert(origins.every((origin) => origin === new URL(base).origin), 'unexpected external resource');

  // v3 synthetic display evidence only: this capture never reads Notion.
  await navigate('capture=notion-read');
  assert(await evaluate(`document.querySelector('.studio-bridge').textContent==='只读真实工单｜真实领取未开放' && document.title==='MSOS 工作室 · 只读真实工单｜真实领取未开放'`), 'notion-read banner or title missing');
  assert(await evaluate(`document.querySelectorAll('.studio-real-group').length===2 && document.querySelector('.studio-real').textContent.includes('SIM-READ-001') && document.querySelector('.studio-real').textContent.includes('SIM-READ-002') && document.querySelectorAll('.studio-real a[href^="https://app.notion.com/"]').length===2 && document.querySelectorAll('.studio-real button').length===0`), 'read-only real work list is incomplete or has an action');
  await evaluate(`document.querySelector('.studio-schedule').scrollTop=document.querySelector('.studio-schedule').scrollHeight`);
  await shot('v3-notion-read');

  // Real local transport, simulated business data: SSE confirmation drives every state change.
  await navigate('bridge=http://127.0.0.1:4318');
  assert(await evaluate(`__studio.state.bridge.mode==='dry-run' && __studio.state.bridge.connection==='connected' && document.querySelector('.studio-real-message').textContent==='仅 notion-read 模式提供'`), 'local bridge dry-run state missing');
  assert(await evaluate(`!document.querySelector('.studio-launcher').disabled && document.querySelector('[data-agent="engineer"]').textContent.includes('模拟｜')`), 'dry-run claim entry or simulated nameplate missing');
  await shot('v4-dry-run');
  await click('[data-agent="engineer"]');
  await click('.studio-claim');
  await waitFor(`__studio.state.engineer.taskId!==null`, 'bridge did not confirm claim');
  await waitFor(`Object.keys(__studio.state.reports).length===1`, 'bridge did not deliver report');
  await click('.studio-file');
  await click('.studio-approve');
  await waitFor(`__studio.state.engineer.taskId===null && Object.keys(__studio.state.reports).length===0`, 'approved review did not clear task and report');
  assert(await evaluate(`document.querySelector('[data-agent="engineer"]').textContent.includes('等待领取任务') && !document.querySelector('.studio-file').classList.contains('show')`), 'approved nameplate or file did not reset');
  await shot('v3-approved');

  // A refused bridge connection must not fall back to local confirmations.
  await navigate('bridge=http://127.0.0.1:4999');
  assert(await evaluate(`document.querySelector('.studio-bridge').textContent==='桥接未连接' && document.title==='MSOS 工作室 · 桥接未连接'`), 'disconnected bridge banner missing');
  await click('[data-agent="engineer"]');
  await click('.studio-claim');
  await waitFor(`__studio.state.notice.includes('桥接未接受请求')`, 'offline action failure was not shown');
  assert(await evaluate(`__studio.state.engineer.taskId===null && Object.keys(__studio.state.reports).length===0`), 'offline bridge produced a fake confirmation');
  await shot('v3-disconnected');

  // v4 notion-read uses the unchanged local bridge with a local fake query endpoint only.
  await navigate('bridge=http://127.0.0.1:4319');
  assert(await evaluate(`__studio.state.bridge.mode==='notion-read' && __studio.state.real.ok===true`), 'notion-read local bridge state missing');
  assert(await evaluate(`document.querySelector('.studio-real-counts').textContent==='开放3｜可领取0｜进行中1｜被挡住1｜待验收1'`), 'real work counts missing or wrong');
  assert(await evaluate(`JSON.stringify([...document.querySelectorAll('.studio-real-group')].map(e=>e.dataset.group))==='["claimable","working"]' && document.querySelector('[data-group="claimable"]').textContent.includes('目前没有可领取的单')`), 'claimable order or empty state wrong');
  assert(await evaluate(`document.querySelectorAll('.studio-real button').length===0`), 'read-only list contains a button');
  assert(await evaluate(`document.querySelector('.studio-launcher').disabled && document.querySelector('.studio-launcher').textContent==='只读模式，真实领取未开放'`), 'read-only launcher is not disabled with reason');
  assert(await evaluate(`document.querySelector('[data-agent="engineer"]').querySelector('.studio-task').textContent==='等待领取（只读模式，暂不可领）' && document.querySelector('.studio-notice').textContent==='等待领取（只读模式，暂不可领）'`), 'notion-read nameplate or notice wrong');
  assert(await evaluate(`(()=>{const t=document.querySelector('[data-agent="engineer"]').querySelector('.studio-task');const l=document.querySelector('.studio-launcher');return t.scrollWidth<=t.clientWidth+1&&l.scrollWidth<=l.clientWidth+1})()`), 'read-only nameplate or launcher copy is clipped');
  assert(await evaluate(`!document.querySelector('.studio-banner').textContent.includes('模拟') && ![...document.querySelectorAll('.studio-tag')].some(e=>e.textContent.includes('模拟')) && !document.querySelector('.studio-notice').textContent.includes('模拟')`), 'notion-read chrome still contains simulated copy');
  const notionActionsBefore = actionRequests.length;
  await click('.studio-launcher');
  assert(await evaluate(`!document.querySelector('.studio-menu-wrap').classList.contains('show')`), 'disabled launcher opened claim menu');
  await click('[data-agent="engineer"]');
  assert(await evaluate(`document.querySelector('.studio-claim').disabled && document.querySelector('.studio-menu-reason').textContent==='只读模式，真实领取未开放'`), 'read-only role menu is not disabled with reason');
  await click('.studio-claim');
  await wait(300);
  assert(actionRequests.length === notionActionsBefore && await evaluate(`__studio.state.actions.length===0`), 'notion-read click sent a claim action');
  await evaluate(`document.querySelector('.studio-menu-wrap').classList.remove('show');document.querySelector('.studio-schedule').scrollTop=document.querySelector('.studio-real').offsetTop-8`);
  await shot('v4-notion-read');

  const report = { passed: true, viewport: '390x844', mobileEmulation: true, coordinateClicks: ['Kimi fixed message', 'mobile launcher', 'Engineer menu', 'claim_request', 'report file', 'approve', 'return', 'blocked reason', 'local bridge end-to-end', 'offline claim refusal', 'notion-read disabled claim'], externalOrigins: origins, bridgeEndToEnd: 'dry-run plus local-only notion-read', notionReadCapture: 'synthetic; no Notion read', notionReadBridge: 'local fake query endpoint; no real Notion', notionReadClaimRequests: actionRequests.length - notionActionsBefore, offlineFakeConfirmation: false, screenshots: ['default.png', 'waiting.png', 'report.png', 'offline.png', 'v2-default.png', 'v2-schedule.png', 'v2-mobile-launcher.png', 'v3-notion-read.png', 'v3-approved.png', 'v3-disconnected.png', 'v4-dry-run.png', 'v4-notion-read.png'] };
  fs.writeFileSync(path.join(out, 'browser-checks.json'), JSON.stringify(report, null, 2) + '\n');
  console.log(JSON.stringify(report, null, 2));
} finally {
  if (ws) ws.close();
  if (chrome.exitCode === null && chrome.signalCode === null) {
    await new Promise((resolve) => { chrome.once('exit', resolve); chrome.kill('SIGTERM'); setTimeout(resolve, 2000); });
  }
  fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
}
