# 前端窗口 UI 打磨计划（2026-11-05）

> **口径**：不重画、不换框架。在既有插件化骨架（`mainView` / `panel` / `view` / `slot`）上做
> **「窗口职责收敛 + 显示状态齐全 + 跨窗口一致」**，而不是再来一轮"视觉换皮"。
>
> **硬约束沿用 `docs/dsh-ui-comparison.md` §5**：
> ① 不 import dsh；② 不复制 dsh CSS / 图标包；③ `data-testid` 是回归契约（改名必须同步 e2e）；
> ④ 数据层不动（`shared/agent/*` 归约与 `toolDetail` 判据单源）；⑤ 四道闸 + e2e 全绿。
> 新增文案必须走 `t()` 并同时补 zh/en（`i18nCoverage` 棘轮 `BASELINE=0`）；
> 新增样式必须走令牌（`styleRatchet` 15 项恒 0，禁止字面颜色 / px 圆角 / 裸 px 字号）。
>
> **本计划解决的是「窗口多了之后的一致性债」，不是缺功能。**

---

## 一、现状盘点：我们到底有哪些「窗口」

### 1.1 主区页签（`mainView`，中栏）

| id | 显示什么 | 现状问题 |
|---|---|---|
| `editor.mainView` | 策划书首页（罗盘 + 单列胶囊）↔ `CeshuView` 编辑器 | 首页已对齐 dsh guide；编辑器工具栏/章节导航/保存态分散 |
| `data.mainView` | `DataEditorPanel`（数据表列表 + 表单 + 条目） | 列宽/表头/空态/批量选择待统一 |
| `techDoc.mainView` | `TechDocPanel` 技术设计文档 | 与编辑器阅读节奏不一致 |
| `code.mainView` | `CodePanel` 文件树 + 代码 | 工具栏与空态待统一 |
| `browser.mainView` | `BrowserPanel` 内嵌浏览器 | 与 `ImageGenPanel` 边界待明确 |
| `session.mainView` | 会话看板（子智能体 / 轨迹 / 定时 / 任务 / 历史） | 五段信息密度与折叠不一致 |

### 1.2 右栏停靠（`rightbar`，对话常驻）

| 段 | 显示什么 | 现状问题 |
|---|---|---|
| 对话（`app.rightPanel`） | `DigitalPanel` 全量对话流 | 已 7 轮打磨，基本成熟 |
| 会话看板 | 子智能体 / 轨迹 / 定时提醒 / 后台任务 / 历史 | 与 `session.mainView` 重复入口 |

### 1.3 浮层面板（`panel`，互斥 + Esc）

约 **27 个**，按职责分五组：

- **录入/编辑**：`typeEditor` / `quickCreate` / `batch` / `importPreview`
- **浏览/分析**：`advancedSearch` / `relationGraph` / `attributeChart` / `statistics` / `gameDataPreview` / `dataDiff` / `references` / `attrSystem`
- **工具**：`settings` / `cleanupImages` / `keywordTemplates` / `agentEditor` / `imageGen` / `mcpConfig` / `backup` / `clearAll`
- **外壳**：`about` / `plugins` / `pluginMarket` / `onboarding` / `shortcuts` / `sessionHistory` / `autoReview` / `recentChanges`
- **覆盖层**：命令面板（`app.overlay` slot）、权限菜单、模型菜单

### 1.4 策划书内嵌视图（`view`，四个 mount）

`ceshu.toolbar` / `ceshu.chapternav` / `ceshu.artifact` / `ceshu.content` 上共 **25 个** view：
路线图 / 健康检查 / 字段影响 / 迁移预览 / AI 消费提示词 / 全局审阅队列 / 导入 AI 结果 /
派生版本 / 系统模块选择 / 原型预览 / 机器可读数据 / 角色任务 / 版本 diff / 时间线 / 变更日志 /
校验 / 完备度 / 笔记 / 数据引用 / AI 审阅 / AI 全文生成 / AI 数据生成 / 预设市场 / 系统确认 / 模板编辑。

> 这一层不是"窗口"，而是**编辑器的面板化分区**；它的打磨重点是「同一挂载点内多个 view 的切换与状态保持」。

---

## 二、真正的问题（不是"不好看"）

1. **外壳三套并存**：`SettingsPanel` 用 `.editor` + `.editor-header`，`SessionHistoryPanel` 用 `.panel` + `.panel-header`，
   还有一批面板自带布局。→ 滚动容器、头部高度、关闭按钮位置、底部操作条位置各不相同。
2. **空/载/错三态缺失且不统一**：`sessionHistory` 的 `catch {}` 静默；多数面板空态是裸 `<p>`；
   加载态各写各的。→ 用户无法区分"没有数据"与"读失败了"。
3. **入口重叠**：`gameDataPreview` / `data.mainView` / `dataDiff` / `statistics` / `attributeChart` / `relationGraph`
   都能"看数据"，但用户不知道差异；`session.mainView` 与右栏会话看板是两份入口。
4. **长任务不可见**：导入、AI 全文生成、批量、导出、子智能体——只有部分有进度；跨窗口切走后不知道还在不在跑。
5. **数据密度不统一**：表格列宽/表头吸顶/斑马纹/行高/数字对齐各处不同。
6. **键盘与焦点**：浮层 Esc 已做，但 Tab 顺序、焦点归还、`aria-*`、焦点环在部分面板缺失。
7. **i18n 残留**：`shared/config/llm` 的 `llmSetupGuide()` 仍返回中文（设置面板已标注）。
8. **响应式**：窄窗下侧栏折叠已有，但面板内两栏（列表 + 详情）没有统一的折叠策略。

---

## 三、分阶段计划

### Phase A — 统一窗口外壳与状态原语（P0，先做，收益最大）

**目标**：所有 `panel` / `mainView` 共享同一套外壳与三态组件；改一处，全局一致。

- **A1 `PanelShell`**：统一
  - 头部（标题 + 可选副标题 + 关闭/返回）
  - 可滚动 body（`overflow: auto` + `min-height: 0`，修 flex 溢出）
  - sticky footer（主操作按钮常驻，不被长内容顶走）
  - 可选宽度档（`sm` / `md` / `lg` / `full`）
  - 保留各面板既有 `data-testid`，只替换容器结构
- **A2 `StateView`**：`EmptyState` / `LoadingState` / `ErrorState` / `NoPermissionState`
  - 统一图标 + 标题 + 说明 + 可选动作
  - 约定：`catch` 不得静默（至少 `ErrorState` 或 toast），杜绝"读失败显示成空"
- **A3 迁移清单**：按 1.3 的五组逐组替换外壳；每替换一组补 DOM 测试断言"标题/关闭/主操作"存在。
- **A4 全局提示层级**：`notice`（成功）/ `error`（失败）/ `toast`（瞬时）三者的位置与时长统一，
  避免同一事件在两个地方出现。

**验收**：所有 panel 头部结构与关闭行为一致；新增 `PanelShell` / `StateView` 单测；四道闸绿。

---

### Phase B — 窗口职责收敛（P0，决定"用户去哪找"）

**目标**：每个窗口只回答一个问题；重叠入口合并或明确分工。

- **B1 窗口职责表**（本文件 §一 升级为"谁负责什么"）：
  - 数据**编辑** → `data.mainView`
  - 数据**全局浏览/检索** → `advancedSearch`
  - 数据**关系结构** → `relationGraph`
  - 数据**数值分布** → `statistics` / `attributeChart`（二选一或合并）
  - 数据**变更对比** → `dataDiff`
  - 数据**只读预览** → `gameDataPreview`（或收编进 data.mainView 的只读模式）
- **B2 入口矩阵**：同一能力在菜单 / 侧栏 / 命令面板三处的命名与分组一致；命令面板 group 已符号化，补中文映射。
- **B3 重复入口去重**：`session.mainView` 与右栏会话看板——保留一个主入口，另一个做"跳转"而非并行维护。
- **B4 空态引导**：无类型 / 无数据 / 未配置 LLM 时，空态给出**下一步动作**，而不是死胡同。

**验收**：入口矩阵文档 + 命令面板可见项与菜单一致；不存在"两个窗口显示同一份数据却无差异说明"。

---

### Phase C — 主视图体验（P1）

- **C1 数据编辑器**：表头吸顶、列宽可调/最小宽、行高两档、斑马纹、数字右对齐、
  空态/加载/错误、批量选择的可见计数与批量动作条。
- **C2 策划书编辑器**：保存状态（已保存/保存中/未保存）、字段完备度、AI 按钮可用性（`aiDraftable`）、
  章节导航的当前章节高亮、四个 view 挂载点的切换不丢状态。
- **C3 代码 / 浏览器 / 技术设计**：统一工具栏（打开/刷新/复制路径）、统一空态。
- **C4 会话页签**：子智能体 / 轨迹 / 定时 / 任务 / 历史五段的折叠规则与"运行中"标记统一。

**验收**：每个主视图补 DOM 测试（空态/加载/错误/主操作）；e2e 既有锚点不变。

---

### Phase D — 对话与工具卡打磨（P1，增量）

- **D1 工具卡**：摘要长度、失败行取错误行、diff 计数、折叠默认值。
- **D2 审批 / 提问卡**：风险档配色、参数折叠、拒绝回灌说明。
- **D3 运行计划 / 进度**：分段进度条与当前步高亮。
- **D4 交付 / 改动卡**：文件行、扩展名、折叠行数。

> 这一块已做过 7 轮，本次只做**一致性回归**与缺失态补齐，不推翻既有交互。

**验收**：既有 `digital-*` testid 全绿；新增态有 DOM 测试。

---

### Phase E — 跨窗口一致性与可达性（P2）

- **E1 设计令牌审计**：颜色/圆角/发丝线/阴影/字号全部走令牌；`styleRatchet` 可视情况扩守卫（新增项必须恒 0）。
- **E2 键盘与焦点**：浮层 Esc / 焦点归还 / Tab 顺序 / `aria-label`；命令面板与菜单键盘可达。
- **E3 响应式**：面板内两栏在窄窗折叠为单栏；表格横向滚动而非挤压。
- **E4 i18n 残留清零**：`llmSetupGuide()` 改为返回键；扫描 shared 里剩余的界面中文常量。

**验收**：`styleRatchet` 全绿；i18n 棘轮仍 `BASELINE=0`；窄窗 e2e（或 DOM 断言）通过。

---

## 四、验收与基线

每个 Phase 完成即：

```bash
cd apps/desktop && npm run test        # 单测（基线 3985 / 6 skip）
npm run typecheck                      # tsc ×3
cd ../.. && npm run lint               # eslint
env -u NODE_OPTIONS npm run build      # 构建（e2e 跑 out/）
cd apps/desktop && env -u ELECTRON_RUN_AS_NODE node node_modules/@playwright/test/cli.js test
```

- **testid 契约**：任何外壳替换必须保留既有 `data-testid`；新增锚点同步补 e2e 或 DOM 测试。
- **视觉回归**：不引入截图基线（成本高、易 flaky）；用 DOM 断言"元素存在 + 文案 + 状态属性"。
- **i18n / 样式守卫**：新增文案与样式必须在同一提交补齐 zh/en 与令牌，否则守卫红。

---

## 五、不做 / 风险

- **不重画**：不换组件库、不引入 CSS-in-JS、不引入动画库。
- **不动数据层**：`shared/agent/*` 归约、`toolDetail` diff 判据保持单源。
- **不复制 dsh CSS/图标**：继续内联 SVG + 自有令牌。
- **风险**：外壳统一会触碰大量面板 → 分批迁移，每组单独提交，随时可回滚；
  迁移期间 e2e 必须全绿，不能"先红后修"。

---

## 六、建议顺序（按收益/风险）

1. **A1 + A2**（外壳与三态原语）——一次投入，全局受益。
2. **A3 分批迁移**（先设置/关于/插件中心这类简单面板，再数据/分析类）。
3. **B1/B2 职责表与入口矩阵**——先定规则，再改 UI。
4. **C1 数据编辑器**（最高频）。
5. **C2 策划书编辑器**。
6. **D 对话增量** + **E 一致性与可达性**。

> 每完成一个 Phase 更新本文件与 `docs/dsh-alignment-status.md` 的基线数字。

---

## 七、进度

| 项 | 状态 | 说明 |
|---|---|---|
| A1 `PanelShell` | ✅ 完成（`35366671`） | 工具条 + 可滚动正文 + 固定底栏；不画标题/关闭 |
| A2 `StateView` | ✅ 完成（`35366671`） | empty / loading / error；错误 `role=alert` |
| A3 分批迁移 | 🔄 进行中（25/27） | 已迁移：About / SessionHistory / Settings / Backup / CleanupImages / Statistics / AttributeChart / RelationGraph / AdvancedSearch / GameDataPreview / DataDiff / References / KeywordTemplate / McpConfig / ImageGen / AgentEditor / Shortcuts / Plugins / Onboarding / PluginMarket / AutoReview / RecentChanges / QuickCreate / BatchEdit / ImportPreview；剩余：TypeEditorPanel（双栏布局）、AttrSystemPanel（11 键动作栏）——均需单独设计 |
| B 窗口职责收敛 | 🔄 初版完成（`3d304caf`） | `docs/window-map.md`：职责表 + 入口矩阵；P1-2 假入口已修；P1-1/P2-1/P2-2 待产品决策 |
| C 主视图体验 | 🔄 C1 完成（`54f7c7bc`） | 数据编辑器：加载态 + ↑↓ 导航 + 滚动条稳定；C2 策划书编辑器待做 |
| D 对话工具卡 | ⬜ 未开始 | 一致性回归 |
| E 一致性与可达性 | ⬜ 未开始 | 令牌 / 键盘 / 窄窗 / i18n 残留 |

**当前基线**：单测 3992 通过 / 6 跳过（362 文件 + 1 skip）；`styleRatchet` 15 项恒 0；`i18nCoverage` 2 项绿。
