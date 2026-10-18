# 重构整理项目 — 范围提案（待主理人确认）

> 状态：**提案，未执行**。主理人 2026-10-11 表态要「重构整理一下我的项目」，scope 未定。
> 按铁律「涉及结构改动必先确认 scope」「先锁再动」，本文只列**发现 + 建议动作 + 需确认的决策点**，
> 不擅自改动任何结构。

## 护栏（已裁定，不可破）
- 架构范式 = **模式二 分层架构型**（agent 子系统已达标，**只加固不重建**）。
- 两条不变量（重构后须复验）：① `skills/**` 零 import 编排层；② `shared/agent/**` 零 import `main/` 与 `electron`。
- 整理只针对**真实痛点**（模块过大 / 重复逻辑 / 命名不一致），把已合规结构按模板重排属过度开发。
- 「看着像策略、实际零守卫」类缺陷不在本任务范围（已在静默缺陷扫描中另立专项处理）。

## 结构现状（实测）
- `src/` 共 **299 个 .ts/.tsx，约 21.2k 行**（main 89 / shared 136 / renderer 74）。
- 最大文件：`shared/ceshuChecklistItems.ts`(927) / `renderer/CeshuView.tsx`(926) / `renderer/App.tsx`(838) /
  `shared/schemasData.ts`(772) / `renderer/digital/DigitalPanel.tsx`(735) / `renderer/TypeEditorPanel.tsx`(712)。
- 跨文件重复符号扫描（导出名在 ≥2 文件定义）：46 处，绝大多数是下面 P1 的标签模块重复。

## 已发现的真实痛点（按价值/风险排序）

### P1【低风险·高价值】`shared/domain/ceshu/ceshuOptionLabels.ts` 是死代码重复模块
- 证据：`shared/ceshuOptionLabels.ts` 与 `shared/domain/ceshu/ceshuOptionLabels.ts` 定义了**同一批约 38 个 `*_LABELS` 常量**；
  后者**全局 0 引用**（无 import、无 barrel 再导出），前者被 4 个真实调用点使用
  （`shared/ceshuFields.ts`、`shared/systemConfigSchema.ts` 等，均 `import * as OPT from './ceshuOptionLabels'`）。
- 建议动作：**直接删除 `shared/domain/ceshu/ceshuOptionLabels.ts`**（删前再 grep 确认无 `domain/ceshu/ceshuOptionLabels` 引用；该目录无 index barrel，安全）。
- 复验：`tsc` 0 错 + `vitest` 全绿（标签消费测试 `ceshuOptionLabels.test.ts` 不受影响）。
- 注：同名 `ENGINE_LABELS` 在 `main/engineExport/engines.ts` 是**另一份、类型不同**（`Record<EngineKind,string>`），属导出功能自用，**非重复**，勿动。

### P2【低风险】`STATUS_WARNING` / `STATUS_META` 两常量跨文件重复
- 证据：同时定义于 `shared/ceshuChecklistItems.ts` 与 `shared/ceshuFieldDepsData.ts`。
- 建议动作：归并到其中一处（或既有 `ceshuOptionLabels.ts` 风格的标签归集文件），另一处改为再导出。
- 复验：同上，且确认两个常量语义一致（若语义已漂移，先统一再合并）。

### P3【高风险·需确认】`renderer/App.tsx`(838) 与 `renderer/CeshuView.tsx`(926) 拆分
- 风险：根编排器 / 大视图组件，改动面极广，容易在拆分中无声腐化分层方向。
- 建议：列为 **wave 2**，先与主理人确认拆法（如 App 拆「路由壳 + 全局状态 + 通知」；CeshuView 拆「章节导航 + 字段编辑 + AI 区」），再动手。
- 复验：除 tsc/vitest 外，必须跑 e2e 整包（尤其 `ceshu-*.spec.ts`、`agent-*.spec.ts`）确保交互无回归。

### P4【低价值】`shared/ceshuChecklistItems.ts`(927) 大概率纯数据
- 疑似巨型常量/数据表，非逻辑重复。拆分收益低，**建议不动**，除非主理人认为需要按域切分。

## 建议的 wave 划分
- **Wave 1（立即可做，低风险）**：P1 删死模块 + P2 合并 2 常量。预期净删 ~1 文件 / 收敛重复定义。
- **Wave 2（需确认拆法）**：P3 大组件拆分。
- **Wave 3（按需）**：P4 及主理人补充的其他痛点。

## 需要主理人确认
1. **是否同意 Wave 1（P1+P2）现在执行？**（我评估为低风险、纯收敛，可直接做。）
2. **P3 是否纳入本次整理？** 若纳入，希望拆到什么粒度（仅 App/CeshuView，还是连同其他 >600 行组件一并理）？
3. **范围边界**：本次是否只做「重复/死代码收敛 + 大组件拆分」，还是主理人心里还有别的痛点（如某个具体的难维护模块）要加进来？
4. **是否保留 `shared/domain/ceshu/` 这个子目录**？删除 P1 后该目录仍有 `ceshuCompetitiveChart/ceshuReports/ceshuTimeline/dataRef/gameDataPreview` 等，若整体要重新归置请指明方向。
