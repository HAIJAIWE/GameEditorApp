# 一页式总览（2026 对齐改造）

> 依据 `gdd-2026-state-of-practice.md`：2026 主流是「**一页讲清 → 分层展开**」。此前我们只有逐章编辑，
> 打开就是 24 章。本次补一个**只读「一页总览」**，把当前阶段压成一页。

## 怎么用

- 章节导航里点 **「一页总览」** → 中间栏显示当前阶段的一页摘要；
- 点 **「返回编辑」** 或点任意章节 → 回到逐章编辑（点章节会自动切回编辑并定位到该章）；
- 总览**跟随阶段筛选**：选「全部」= 立项 7 章；选「研发」= 立项 + 研发；选「发行」= 全部；
- 无战斗品类（模拟经营/视觉小说/派对/休闲益智）自动不显示 combat 章。

## 一页里显示什么

- 每章一张卡：**章名 + 完成度**；
- **必填字段一律显示**（有值显示值，空显示「（待填）」并带 `*`）；**非必填只显示已填**——一页既看全貌也看缺口；
- **机读数据**（账本/断言/用例/验收旅程…）不进正文，只在章尾给一句「另有 N 项机读数据（不计入完成度）」；
- 顶部汇总：**必填已填 X/Y（%）· 还差 N 项必填**。

## 实现（只读，零数据写入）

- 新组件 `src/renderer/src/components/CeshuOverview.tsx`：纯展示，值格式化复用 pipeList 双形态规则；
- `CeshuView.tsx`：新增 `viewMode: 'edit' | 'overview'` 状态 + 切换按钮；`.chapter-body` 按模式渲染 `CeshuOverview` 或 `ChapterForm`；
- `styles.css`：`.ceshu-overview` 等样式，全部用主题变量（浅/深/暖/紫四套主题自动适配）。

## 验证

- 新增 DOM 测试 `tests/unit/dom/ceshuOverview.test.tsx`（4 项：7 章齐全 / 必填待填 / 机读不进正文 / 无战斗品类隐藏 combat）；
- 全量 **2614 过 / 5 跳**（+4）；三套 `tsc` 0；`eslint` 0；`npm run build` 0。

## 与既有改动的衔接

阶段分层（`ceshuStages`）+ 品类条件必填（`game_type`）+ 机读分区 + **一页总览**，共同构成
「打开先看一页 → 逐章展开 → 机读数据单独放」的现代 GDD 工作流，与 2026 行业方向一致。

## 导出（2026-10-26 新增，三个 Markdown 格式）

- **`onepage`（一页摘要）**：只一页 `.md`，把「立项阶段」压成一页；机读数据只给计数。
- **`deliverable`（交付版）**：**封面 + 一页摘要 + 目录 + 详细章节**，并**去掉**「审核进度 / 数据校验报告」
  这类内部附录——这是给外部（老板 / 程序 / 发行）看的版本，内部过程信息不混进去。
- **`tasks`（岗位任务清单）**：把策划书按**岗位**拆成 checklist（程序 / 美术 / 测试 / 数值 / 音频），
  每项是「必填或已填」的字段——已填的写清设计要求，空的标「（待补）」，程序拿到就能开工。
  章级岗位映射见 `tasks.ts` 的 `ROLE_CHAPTERS`（先粗后细，字段级后续再补）。
- 三者都与 UI「一页总览」**同口径**，按档位 × 品类 × 系统模块裁剪。
- 实现：`onepage.ts`（`renderOnePageSummary`）+ `markdown.ts`（`renderCeshuDeliverableMarkdown`）+ `tasks.ts`
  （`renderCeshuRoleTasksMarkdown` / `renderCeshuTasksMarkdown`）；字段值显示在 `src/shared/ceshuFieldDisplay.ts`。
- 守卫 `tests/unit/ceshuOnePageExport.test.ts`（8 项）。
