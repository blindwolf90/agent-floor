# ENG-160-UI v3 — 本地桥接传输、三模式与真实工单只读列表

## STATUS

DONE（本地 dry-run 桥接已端到端验证）。基线：`kimi/studio-ui-v2@c80809d`；分支：`kimi/studio-ui-v3`。未修改 server、`shared/protocol.js`、bridge 目录或 arthur-os；未连接 Notion、真实 API 或任何 token。

## CHANGED

- `src/studio/transport.ts`：默认 `?studio` 使用 `127.0.0.1:4318`，可用 `?bridge=` 覆盖；POST `/actions` 只发送领取／验收意图，GET `/studio/events` 以 SSE 接收确认事件；新增 GET `/studio/state` 只读快照。只有 `?simulate` 与 `?capture` 使用本地 dry-run handler。
- `src/studio/boot.ts`：接入桥接订阅与只读状态刷新；桥接模式不再发本地假 `bridge_status` 或本地心跳；请求失败显示「桥接未接受请求，请检查连接」。新增 notion-read 与断线展示 capture。
- `src/studio/state.js`、`state.d.ts`：新增桥接连接状态、真实工单只读状态；三种模式文案为「模拟模式」「只读真实工单｜领取仍为模拟」「真实模式」，未收到为「状态未知」，传输断开为「桥接未连接」。`review_result=approved` 清除 Engineer 旧单并恢复「等待领取任务」；退回保留任务并标「退回修改」。
- `src/studio/StudioHud.ts`：页面标题同步桥接模式；排程台下方新增「真实工单（只读）」，分列 working／claimable 的 id、title、status、deadline 与安全 http(s) Notion 链接，无领取按钮；失败与 dry-run 有各自明确文案。
- `src/studio/studio.css`：真实工单只读列表与手机排程台滚动区域样式。
- `test/studio.test.mjs`：新增 4 项测试，覆盖断线不假确认、三种模式与未知文案、验收后清名牌／退回保留、real.ok=false 文案。
- `scripts/studio-browser.mjs`：保留 v1／v2 坐标点击回归；新增 notion-read 只读列表、本地桥接完整领取到验收、断线后点击不产生假确认的检查与截图。
- `docs/eng-160/evidence/`：新增 3 张 v3 截图，更新浏览器检查 JSON 与回归截图。

## TESTED

- `npm test`：24/24 PASS（原 20 项＋新增 4 项）。
- `npm run build`：TypeScript 与 Vite production build PASS。
- `node scripts/studio-browser.mjs`：390×844 mobile emulation PASS；v1／v2 回归通过。使用本地 `bridge.mjs --dry-run` 完成真实传输的 `claim_request → claim_confirmed → report_ready → review → review_result(approved)`，验收后 taskId 为 null、桌上文件消失、名牌恢复等待领取。随后切换到未监听端口，确认横幅「桥接未连接」且点击没有产生 taskId 或报告。
- 桥接运行数据写入独立临时目录 `.eng160/bridge-v3-state`，未写 bridge 默认 `state/`；浏览器断言记录见 `evidence/browser-checks.json`。

## 截图

- `v3-notion-read.png`：notion-read 横幅、页面标题与两组只读工单列表；这是合成 UI 展示，未读取 Notion。
- `v3-approved.png`：本地 dry-run 桥接验收后的 Engineer 名牌与空桌面。
- `v3-disconnected.png`：桥接断线横幅与请求失败提示，没有假确认。

## 未接真实的部分

仅传输与本地 dry-run 业务事件已接通；真实 Notion 读取、真实领取、真实执行与真实验收均未测试或启用。notion-read 截图使用 `SIM-READ-*` 合成数据；Kimi 席位仍固定「尚未接通」；排程仍是静态 JSON；没有 ArthurDay 入口、token 或新增动作。
