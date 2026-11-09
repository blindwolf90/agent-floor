# ENG-160-UI v4｜模式一致性、真实列表分组与排程来源

## STATUS

DONE。基线为 fork `main`／`studio-v3` 的 `25b773f`；沿用未合并分支 `kimi/studio-ui-v4` 与 PR #3。未修改 bridge、server、`shared/protocol.js`、Notion 或 ArthurDay。

## TASK

让左上副标题、顶部横幅、座位名牌、底部提示与领取入口统一跟随 `dry-run`／`notion-read`／`claim-test`／`live`；真实工单使用桥接 counts 并按状态分组；排程逐行显示 `updatedAt` 与 `source`。

## FINDINGS

- 旧界面只有 dry-run 与 notion-read 两套硬编码文案，unknown／disconnected 仍可能落入 dry-run 领取路径。
- 旧 counts 展示五项旧字段，不符合本轮「总数／未结／进行中／可领取」契约。
- `working[]` 内可能包含不同状态，不能只渲染一个固定「进行中」组。
- 排程项缺少逐行 `updatedAt`，非模拟来源的清理逻辑还会移除固定的「模拟｜仅展示，不可执行」标注。

## ROOT CAUSE

模式文案与按钮状态分散在 HUD、boot 和事件中，没有单一模式映射；列表与排程渲染也依赖旧字段形状，导致新增 mode 或 counts 后各区域不一致。

## CHANGED

- `src/studio/state.js`：新增四模式统一映射、显示文案转换、真实工单状态分组、四项 counts、断线领取拦截与 schedule 字段解析。
- `src/studio/state.d.ts`：补齐 mode、counts、schedule 与分组函数类型。
- `src/studio/StudioHud.ts`：副标题、横幅、三席名牌、通知、领取按钮、菜单和报告文案统一使用模式映射；真实列表可领取置顶、按状态分组，并有独立空态／错误态。
- `src/studio/boot.ts`：接收 `GET /studio/state` 的 `mode` 与可选 `schedule`，世界内 Engineer 状态同步跟随模式；离线阻止动作。
- `src/studio/transport.ts`：扩展只读快照类型，不改变传输地址、事件或动作协议。
- `public/schedule-board.json`：模拟样本增加逐行 `updatedAt`。
- `test/studio.test.mjs`：覆盖四模式、counts／分组一致性、断线无模式文案且不记录动作，以及排程新字段。
- `scripts/studio-v4-modes.mjs`：自启动 Vite／Chrome 的 DOM 回归与截图脚本，不启动或修改桥接。
- `docs/eng-160/evidence/`：新增两张截图与 `studio-v4-mode-checks.json`。

## TESTED

- `npx tsc --noEmit`：PASS。
- `npm test`：27/27 PASS。
- `npx vite build`：PASS，62 modules transformed。
- `node scripts/studio-v4-modes.mjs`：PASS；四种 mode 的副标题／横幅／按钮状态均通过真实 DOM 断言。
- counts 使用桥接值；可领取组 1 张单＝`counts.claimable: 1`；空列表与读取错误分别显示「目前没有真实工单」与「真实工单读取失败」。
- 断线时副标题仅为 `Agent Floor`，横幅为「桥接未连接」， launcher 与菜单均禁用，记录动作数为 0。

## EVIDENCE

- `docs/eng-160/evidence/studio-v4-notion-read.png`：1440×900 全屏，只读文案、四项 counts、可领取置顶、状态分组、Notion 链接与排程新字段。
- `docs/eng-160/evidence/studio-v4-bridge-offline.png`：1440×900 全屏，无模式文案，桥接未连接且领取禁用。
- `docs/eng-160/evidence/studio-v4-mode-checks.json`：机器可读 DOM 检查结果。

## RISKS

- 截图使用本地合成只读数据，没有读取真实 Notion，也没有真实领取或写入。
- `claim-test` 与 `live` 本轮只验证前端模式状态，不代表桥接已经支持真实动作。
- 排程仍可使用静态 JSON；桥接提供 `schedule` 时才采用桥接快照。所有排程保留「模拟｜仅展示，不可执行」。

## NEXT

等待 **ENG-160-M6 v3** 桥接提供并验证 `claim-test` 隔离测试库后，再做真实领取端到端验证；本轮不开放或声称完成该验证。
