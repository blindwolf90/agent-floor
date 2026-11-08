# ENG-160-UI v4 — 模式文案、只读领取限制与工单计数

## STATUS

DONE（dry-run／本地 notion-read 验证）。基线：fork `main` 已合并 PR #2，并推送 tag `studio-v3`；分支：`kimi/studio-ui-v4`。未修改 bridge、server、`shared/protocol.js` 或 arthur-os；未连接真实 Notion，未使用真实 token，未开放真实领取。

## CHANGED

- `src/studio/state.js`、`state.d.ts`：notion-read 下固定只读提示并在状态层拦截 claim intent，不记录 action；横幅改为「只读真实工单｜真实领取未开放」。新增五项 counts、`realCountsView()` 与可领取空态文案。排程板显示 updatedAt，并按 JSON `source` 是否严格等于「模拟」决定是否清理各字段的「模拟」字样。
- `src/studio/boot.ts`：发送动作前再次拦截 notion-read claim，保证不会 POST `/actions`；更新合成只读 capture 的计数与无「模拟」文案。
- `src/studio/StudioHud.ts`：notion-read 的 Engineer 名牌与底部提示固定为「等待领取（只读模式，暂不可领）」；领任务按钮和角色菜单 claim 按钮置灰并显示「只读模式，真实领取未开放」。真实工单顶部显示 open／claimable／working／blocked／review 计数；可领取分组置前，空时显示「目前没有可领取的单」；列表仍无动作按钮。
- `src/studio/studio.css`：只读按钮置灰、完整只读名牌、计数单行与手机布局。
- `public/schedule-board.json`：样本增加顶层 `source: "模拟"`，保留现有字段与 updatedAt。
- `test/studio.test.mjs`：新增 3 项测试（notion-read 不发 claim、五项计数含 0、可领取空态）；原排程测试增加非模拟 source 清理文案的断言。
- `scripts/studio-browser.mjs`：新增 v4 双模式检查；通过 CDP 网络记录确认 notion-read 点击后 `/actions` 请求数为 0，同时检查按钮、菜单、计数、分组顺序、空态和完整文案。
- `scripts/studio-v4-fake-notion.mjs`：仅监听 `127.0.0.1:4320` 的合成查询样本，供未修改的 bridge 以 `--notion-read` 验证；不含真实编号、主机或凭证。
- `docs/eng-160/evidence/`：新增 v4 双模式截图并更新浏览器检查 JSON 与回归截图。

## TESTED

- `npm test`：27/27 PASS（原 24 项＋新增 3 项）。
- `npm run build`：TypeScript 与 Vite production build PASS。
- `node scripts/studio-browser.mjs`：390×844 mobile emulation PASS；v1／v2／v3 回归通过，dry-run 领取到验收端到端通过。
- notion-read 使用本地 bridge `--notion-read`＋本机假查询端点，五项计数为 `3／0／1／1／1`，可领取为空且置前；点击底部入口和角色菜单 claim 均未发 `/actions`，`notionReadClaimRequests: 0`。
- 两张最终截图已逐张检查，只读名牌与按钮原因无省略或裁切。

## 截图

- `v4-dry-run.png`：本地 dry-run bridge；保留「模拟｜…」与可用领取入口。
- `v4-notion-read.png`：本地 notion-read bridge＋合成查询样本；只读横幅、五项计数、可领取空态、完整名牌与置灰入口。

## 未接真实的部分

真实 Notion 查询、真实凭证、真实领取、执行与验收均未连接或启用。notion-read 证据来自本机合成数据；Kimi 席位仍固定「尚未接通」；排程仍是静态 JSON；没有 ArthurDay 入口或新增业务动作。
