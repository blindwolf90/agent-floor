# ENG-160-UI v2 — 三席、status 心跳、排程台与手机入口

## STATUS

DONE（dry-run 前端）。基线：fork `blindwolf90/agent-floor` 的 `main@493bd7f`（已合入 v1）；分支 `kimi/studio-ui-v2`。未接真实系统，未修改 server、`shared/protocol.js`、bridge 或 arthur-os。

## CHANGED

- `src/studio/boot.ts`：加入第三席 Kimi；任何事件试图改变其状态或活动时立即还原为灰色闲置「尚未接通」。每 60 秒用不带 `status` 字段的 `status` 事件保活，不用 `join`。仅读取静态 `/schedule-board.json`。
- `src/studio/state.js`、`state.d.ts`：固定 `kimi.status = 尚未接通`；Kimi 的 `status／claim_confirmed／report_ready` 等事件不产生工作状态或报告。增加排程加载及缺失状态，消费 `status` 心跳刷新桥接时间。
- `src/studio/StudioHud.ts`：第三席灰色名牌与单句提示「执行入口待 Engineer 核实」；右侧排程台；底部「工作室｜领任务」按钮；Kimi 名牌与 Engineer 错层，避免走位后互压。
- `src/studio/studio.css`：Kimi 灰色、排程台、390×844 底部入口与弹窗层级。
- `src/world/World.ts`：三席中点取景；未加动画。
- `public/schedule-board.json`：一份全部标为「模拟」的样本，更新日期 `2026-11-06`，字段为 `name／owner／time／source／lastResult／control`。
- `sim/dry-run.js`：新增 `ts = now + 60_000` 的 `status` 心跳样本；不使用 `join`。
- `test/studio.test.mjs`：新增 Kimi 固定不可用、status 保留 done、排程字段与缺失状态三项测试。
- `scripts/studio-browser.mjs`：新增三席、Kimi 提示、排程、底部入口、名牌不重叠与报告弹窗不遮挡按钮的坐标验收。
- `docs/eng-160/evidence/`：新增三张 v2 截图并更新浏览器 JSON 与模拟器输出。

## 排程缺失口径

静态文件不存在、非 JSON、非 2xx 或内容不含 `items` 数组时，排程台显示「排程清单未载入」。本轮不连接 API，不执行 `control`，不根据排程触发任务。

## TESTED

- `npm test`：20/20 PASS（原 17 项＋新增 3 项）。
- `npm run build`：TypeScript 与 Vite production build PASS。
- `node scripts/studio-browser.mjs`：390×844 mobile emulation PASS；Kimi 固定提示、手机入口、Engineer 菜单、领取、报告、验收、退回、阻塞与断线均用真实坐标点击。检查三名牌完整且不互压、按钮至少 44px、底部入口在提示条上方、报告弹窗不遮挡入口、无外部资源来源。
- `node sim/dry-run.js`：顺序包含 `bridge_status → status(60 秒) → claim_rejected → claim_confirmed → blocked → report_ready → review_result`；输出保存于 `simulator-output.txt`。

## 截图

- `v2-default.png`：三席默认与灰色 Kimi「尚未接通」。
- `v2-schedule.png`：右侧排程台与模拟字段。
- `v2-mobile-launcher.png`：报告弹窗打开时，手机底部「工作室｜领任务」仍完整可见。

## 仍是画面、未接真实

Kimi 只有固定席位与提示，没有执行入口；排程只是本地静态 JSON；60 秒心跳是本地 dry-run 样本与计时器；没有 Notion、真实 API、bridge、真实编号、token 或真实任务执行。后续 Engineer 需要自行核实执行入口与真实桥接映射。
