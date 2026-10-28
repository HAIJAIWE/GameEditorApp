# 复刻单线实施方案：游戏名 → 立项一页 → 可玩 demo

> 目标竖切（最小闭环）：用户输入一个参考游戏名 → AI 拆解成「立项一页」patch → 套到新文档 → 生成 demo → 用户看到能玩。
> 下面**所有复用件都已核对过真实文件**，不是画饼。

## 一、复用现有（已核实）

| 环节 | 现成件（文件 / 接口） |
|---|---|
| 补丁解析 | `src/shared/ceshuImportPatch.ts` → `parseCeshuPatch(raw, doc)` |
| 补丁套用 | 同文件 → `applyCeshuPatch(doc, items)` → `ApplyPatchResult` |
| AI 通道 | `ceshu:aiGenerateChapter`（handler 在 `src/main/ipc/ceshuIpc.ts`） |
| 文档 → demo | `scripts/generateDemo.ts`（`--app-cdp <ws> --doc-id <id> --out <html>`）+ `src/shared/ceshuDemoPrompt.ts` |
| 契约回归 | `scripts/ceshuRehearsal.ts`（`apply --patch <json>`，不配模型也能验全链路） |
| 问用户 | `src/main/agent/skills/askUserSkill.ts`（已有的对话能力） |
| 提示词单源 | `src/shared/ceshuAiData.ts`（改文案只改这里） |

## 二、要新增的模块

1. **`src/shared/ceshuClonePrompt.ts`**（或并入 `ceshuAiData.ts` 的登记表）
   复刻拆解提示词：输入「参考游戏名 + 品类」，输出**合法 patch 文本**（只填立项 7 章：定位/核心循环/战斗/经济/数值/MVP），
   并在每个字段旁标注「复刻自 XX / 改为 XX」。**输出必须是 patch 格式**，才能直接喂 `parseCeshuPatch`。

2. **`src/shared/ceshuIntake.ts`**（P1）
   3–5 个关键问题的定义（给谁玩？单局多长？核心动作？…）+ 把答案合并成 patch。纯逻辑，可单测。

3. **`src/renderer/src/components/CeshuIdeaStart.tsx`**
   普通用户入口：一个输入框（游戏名/点子）+「生成一页 + demo」按钮 + 进度 + demo 预览。**完全隐藏 24 章**。

4. **编排（`src/main/` 一个流程函数）**
   `cloneDecompose`：clone 提示词 → 调 AI → `parseCeshuPatch` → `applyCeshuPatch` 到新 doc → 保存 → 触发 `generateDemo`。

## 三、要改的现有文件

- `src/shared/ipc.ts` + `src/shared/service/api.ts` + `src/preload/index.ts` + `src/main/ipc/ceshuIpc.ts`：
  加一条 `ceshu:cloneDecompose` 通道（或复用 `aiGenerateChapter`，只换提示词，改动更小）。
- `src/shared/ceshuAiData.ts`：登记 clone 提示词（遵守"提示词单源"约定）。
- `src/renderer/src/components/CeshuView.tsx`：加「从想法 / 复刻开始」入口。
- `src/main/agent/skills/ceshuSkill.ts`：加一个 `clone` 动作（让外部 agent 也能调）。
- `scripts/generateDemo.ts`：基本可直接复用（已支持 `--doc-id`）；如需"新建文档后立刻跑"，加一步即可。

## 四、分阶段（建议顺序）

- **MVP（先跑通竖切，不做对话）**
  输入游戏名 → `cloneDecompose`（AI 出 patch）→ 新文档 → `generateDemo`。
  复用 `parseCeshuPatch` / `applyCeshuPatch` / `generateDemo`，只新增一个提示词 + 一个入口。**改动最小、最快见效。**
- **P1**：加 3–5 问的 intake（用 `askUserSkill`），让用户不输入游戏名也能从"点子"开始。
- **P2**：加「复刻点 / 改动点」标注 + 合规提示（只复刻机制，不抄美术/文案/数值）。
- **P3**：普通用户视图（隐藏 schema，只给「一页 + 问题 + demo」）。

## 五、风险与注意

- **版权**：复刻只复刻"机制/循环"，**不抄美术、文案、具体数值**；输出必须标「复刻自 XX / 改为 XX」。
- **AI 输出稳定性**：拆解必须是**合法 patch**；用 `ceshuRehearsal` 做契约级回归，防止 AI 输出跑偏。
- **demo 生成依赖**：`generateDemo` 走 CDP + LLM 配置，普通用户环境要打包好（或改成服务端生成）。
- **别让普通用户看到 334 字段**：schema 是内部引擎，用户只看到一页 + demo。

## 六、一句话

先做 MVP 竖切：**游戏名 → clone 提示词 → patch → 新文档 → demo**。
复用「补丁 + demo + 契约回归」三块现成件，只新增一个提示词 + 一个入口；对话（intake）和普通用户视图后置。

## 七、实施记录（MVP 核心已落地，2026-10-26）

已实现（**纯逻辑 + 可跑脚本**，暂未接 IPC/UI）：
- `src/shared/ceshuClonePrompt.ts`
  - `buildCloneDecomposePrompt(input)`：组提示词，JSON 骨架**按真实字段键生成**（不会出现不存在的键）；
  - `parseCloneDecompose(raw)`：只保留**立项章 + 已知字段**，丢弃未知（容忍 markdown 代码块）；
  - `applyCloneDecompose(base, fields)`：只覆盖立项章，其余章原样不动。
- `scripts/cloneGame.ts`（不依赖模型 / app）：
  - `--game "吸血鬼幸存者" [--type Roguelike]` → 打印 SYSTEM / PROMPT；
  - `--apply result.json --out doc.json [--name 名字]` → 生成策划书 JSON。
- 守卫 `tests/unit/ceshuClonePrompt.test.ts`（4 项：提示词含 7 章+真实键 / 解析只留已知 / 容忍代码块 / 套用不动其它章）。
- **实测**：取提示词正常；套用后 `positioning / core_loop / game_name` 正确写入。

**P1 后端已接（2026-10-26）**：
- `main/ai/tasks/ceshu.ts` 新增 `cloneDecomposeTask`（复用 `runAiTask` + `parseCloneDecompose`）；
- 新增 `ceshu:cloneDecompose` 通道：`ipc.ts`（契约）/ `schemasData.ts`（zod）/ `service/api.ts`（方法）/ `preload/index.ts`（绑定）/ `main/ipc/ceshuIpc.ts`（handler：新建文档 + 逐章落盘）；
- 三套 `tsc` 0、`eslint` 0、全量 2637 过、`build` 0。

**UI 入口已加（2026-10-26）**：首页 `CeshuHomePanel` 新增「✨ 从想法/复刻…」按钮 + 表单（游戏名 + 可选品类）
→ 调 `cloneDecompose` → 用返回的新文档 id 打开编辑器。守卫 `tests/unit/dom/ceshuHomePanel.clone.test.tsx`（2 项）。

**仍缺**：末尾接 `generateDemo`（文档 → 可玩 HTML），让用户"输入名字 → 看到能玩的"。
