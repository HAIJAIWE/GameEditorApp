# 策划书（Ceshu）使用指南

> 📌 **这是什么**：面向最终用户的使用指南，教你如何用工业级 GDD 系统创建、编辑、导出游戏策划书。
> **什么时候用**：第一次使用策划书模块，或想了解某个功能怎么操作时查阅。

> 版本: v5.0 | 适用模块: `src/core/ceshu/` + `src/ui/ceshu/`

---

## 一、概述

### 1.1 什么是工业级 GDD 系统

工业级 GDD（Game Design Document）系统是 GameEditorApp 的核心模块，提供一套结构化的游戏策划书编辑环境。它把游戏策划过程拆解为 **18 个独立章节**，覆盖从项目定义到风险控制的完整链路，并配套评分、校验、模板、AI 辅助、版本管理等专业能力。

**核心特征：**

- **18 章标准结构**：合并旧版 9 章 / 22 章 / 29 章三套结构，统一为工业级 18 章标准
- **13 个游戏系统配置**：战斗 / 角色 / 技能 / 装备 / 物品 / 任务 / 社交 / 经济 / 成长 / 外观 / 关卡 / 抽卡 / 竞技
- **18 个混合玩法预设**：仙侠 RPG、武侠 SLG、科幻 FPS、赛博朋克 MOBA 等
- **6 种导出格式**：docx / pdf / pptx / markdown / html / excel
- **AI 深度嵌入**：字段填充 / 整章生成 / 完整生成 / 智能审阅
- **版本管理**：派生版本、版本对比、时间线、变更日志
- **完备性检查**：50 项预制作就绪检查清单

### 1.2 模块入口

启动 GameEditorApp 后，默认进入**策划书首页**（[CeshuHomeView](../src/ui/ceshu/home_view.py)），展示当前库下所有策划书卡片。点击「+ 新建策划书」即可开始创建。

---

## 二、快速开始：创建第一本策划书

### 2.1 新建：选定档位与创建方式

点击 **「+ 新建策划书」** 后弹出「新建策划书」对话框，首先选择**档位**：

- **轻量 GDD（9 章，推荐）**：只包含基础 9 章（元信息/愿景/世界观/玩法/系统/数值/美术/技术/资源），适合快速起稿与个人项目
- **工业级 GDD（18 章）**：在基础 9 章之外追加市场分析/角色/战斗/经济/商业化/MVP/风险/音频/可访问性，适合完整立项

> 档位随时可改：进入编辑器后通过「更多 ▸ → 档位切换」在 9 章与 18 章之间切换；轻量档只显示、校验与评分 9 章。

然后选择创建方式：

- **✨ AI 生成**：AI 一键生成完整策划书（见 4.6.3），生成后按所选档位建书
- **📝 手动创建（空白）**：从空白开始逐章填写
- **从模板创建**：浏览 38 种游戏类型模板，套用并修改
- **从已有策划书复制**：复制现有策划书为独立副本

### 2.2 从空白开始

1. 在新建对话框选择 **「📝 手动创建（空白）」**
2. 填写游戏名称、游戏类型，点击「确定」
3. 系统会自动打开一体化编辑视图

### 2.3 编辑你的第一章

进入编辑视图后，左侧默认展开「第一章·项目元信息」表单。填写以下必填字段：

- **游戏名称**（`game_name`）
- **游戏类型**（`game_type`，如 RPG / ARPG / MOBA）
- **项目定位**（`positioning`，一句话说清项目目标）
- **核心特色标签**（`tags`，便于检索）

填写过程中可随时按 `Ctrl+S` 保存。

### 2.4 启用游戏系统

切换到「第五章·游戏系统设计」，勾选需要启用的系统（如战斗、角色、技能）。启用某系统时，如果其依赖系统未启用，会自动提示。

详细配置见 [§3.2 游戏系统配置](#32-游戏系统配置)。

### 2.5 校验与导出

- 按 `Ctrl+Shift+V` 运行一致性校验
- 按 `Ctrl+Shift+S` 查看评分报告
- 点击工具栏「导出」按钮，选择导出格式（推荐 Markdown 或 docx）

---

## 三、18 章结构说明

每章职责单一、可独立编辑。下表列出全部 18 章及其必填字段。

### 基础 9 章（v4 保留）

| # | 章节 key | 章节名 | 必填字段 | 用途 |
|---|----------|--------|----------|------|
| 1 | `meta` | 项目元信息 | `game_name`, `game_type`, `positioning`, `tags` | 项目基本信息（名称/类型/平台/标签/版本） |
| 2 | `vision` | 产品愿景 | `design_vision`, `differentiation` | 设计愿景、用户画像、竞品、差异化 |
| 3 | `worldview` | 世界观 | `architecture`, `main_plot` | 世界架构、历史、势力、主线剧情 |
| 4 | `gameplay` | 核心玩法 | `core_loop`, `game_modes` | 核心循环、操作方案、游戏模式 |
| 5 | `systems` | 游戏系统设计 | （按 enabled 数量算进度） | 13 个游戏系统的启用与配置 |
| 6 | `numeric` | 数值设计 | `core_formulas`, `balance_principles` | 核心公式、成长曲线、掉落表 |
| 7 | `art` | 美术设计 | `art_style`, `color_system` | 美术风格、色彩系统、角色/场景设计 |
| 8 | `tech` | 技术规格 | `engine`, `milestones` | 引擎选型、性能目标、里程碑 |
| 9 | `resources` | 资源规划 | `budget`, `risk_matrix` | 美术/音频资产、预算、风险矩阵 |

### 工业级补充 9 章（v5.0 新增）

| # | 章节 key | 章节名 | 必填字段 | 用途 |
|---|----------|--------|----------|------|
| 10 | `market_analysis` | 市场分析 | `target_market`, `competitors` | 目标市场、竞品、用户画像、KPI 预测 |
| 11 | `characters` | 角色设计 | `protagonist`, `main_npc_count` | 主角、NPC、反派、Boss、关系网 |
| 12 | `combat` | 战斗系统设计 | `combat_mode`, `damage_formula` | 战斗模式、伤害公式、技能、平衡 |
| 13 | `economy` | 经济系统设计 | `currency_types`, `source_sink` | 货币、产出回收、通胀控制 |
| 14 | `monetization` | 商业化设计 | `payment_model`, `pricing_tiers` | 付费模式、定价、内购、VIP |
| 15 | `mvp` | MVP 规划 | `mvp_scope`, `mvp_timeline` | MVP 范围、里程碑、成功标准 |
| 16 | `risk_handling` | 风险控制 | `risk_matrix`, `contingency_plan` | 风险矩阵、应急预案、监控机制 |
| 17 | `audio` | 音频设计 | `music_style`, `sfx_count` | 音乐风格、音效、配音、音频引擎 |
| 18 | `accessibility` | 可访问性与本地化 | `language_list`, `accessibility_features` | 多语言、无障碍、文化适配、分级 |

> 💡 **必填字段**用于进度计算与校验。空字段会在校验时高亮，建议优先补全。

---

## 四、核心功能使用

### 4.1 章节编辑与表单

**操作流程：**

1. 在左侧章节列表中点击章节标题展开/折叠
2. 按字段类型填写内容：
   - **单行文本**（entry）：标题、名称等短文本
   - **多行文本**（textarea）：描述、公式、剧情等长文本
   - **下拉选择**（combobox）：枚举值（如战斗模式）
   - **数字输入**（spinbox）：数量、上限等数值
   - **开关**（checkbox）：功能开关（是/否）
3. 每个多行文本字段旁有 **「AI 帮我填」按钮**（[AIFieldButton](../src/ui/ceshu/ai_field_button.py)），点击调用 AI 生成内容
4. 修改自动暂存到内存，按 `Ctrl+S` 写入磁盘

**字段依赖提示：** 跨章节字段有依赖关系（如 `combat.combat_mode` 依赖 `systems.battle.config.turn_mode`），不一致时校验会报警。

### 4.2 游戏系统配置

**入口：** 第五章·游戏系统设计 → 点击「配置系统」按钮

**支持的 13 个系统：**

| 系统 key | 中文名 | 配置字段数 | 主要依赖 |
|----------|--------|-----------|----------|
| `battle` | 战斗 | 15 | character, skill |
| `character` | 角色 | 15 | （无） |
| `skill` | 技能 | 12 | character |
| `equipment` | 装备 | 12 | character, item |
| `item` | 物品 | 12 | （无） |
| `quest` | 任务 | 11 | character, item |
| `social` | 社交 | 14 | character |
| `economy` | 经济 | 16 | item |
| `growth` | 成长 | 10 | character |
| `customization` | 自定义外观 | 11 | character |
| `content` | 关卡内容 | 12 | character, battle |
| `gacha` | 抽卡系统 | 10 | item, economy |
| `competitive` | 排位竞技 | 10 | battle, character |

**依赖检查：** 启用某系统时，若其依赖系统未启用，会弹出依赖缺失警告。详见 [§4.10 字段依赖关系图](#_410-字段依赖关系图)。

### 4.3 校验与一键修复

**校验入口：** 工具栏「校验」按钮 或 `Ctrl+Shift+V`

校验范围：

1. **必填字段非空检查**：18 章所有必填字段
2. **章节间一致性检查**（11 项）：
   - `combat.combat_mode` ↔ `systems.battle.config.turn_mode`
   - `monetization.payment_model` ↔ `systems.economy.config.payment_system`
   - `risk_handling.risk_matrix` ↔ `resources.risk_matrix`
   - `mvp.milestones` ↔ `tech.milestones`
   - `accessibility.language_list` ↔ `resources.localization`
   - 其他 6 项跨章节字段协同检查
3. **系统依赖检查**：已启用系统的依赖系统必须启用

**一键修复：** 工具栏「自动填充」按钮调用 [CeshuModel.auto_fill_required()](../src/core/ceshu/ceshu_model.py)，基于已有上下文（如 `game_name` / `game_type`）为空必填字段生成合理占位值。本方法不调用 LLM，仅用规则推导。

### 4.4 评分系统

**入口：** 工具栏「评分」按钮 或 `Ctrl+Shift+S`

评分维度（总分 100）：

| 维度 | 满分 | 评分依据 |
|------|------|----------|
| 结构完整度 | 30 | 18 章完成率（60%）+ 必填字段覆盖率（40%） |
| 内容质量 | 40 | 平均章节分 - 一致性扣分（每错扣 2 分，上限 15 分） |
| 市场潜力 | 30 | 市场分析（10）+ 商业模式（10）+ MVP 可行性（10） |

**等级划分：**

- **S 卓越**（≥90）：工业级标杆
- **A 优秀**（≥80）：接近工业级
- **B 良好**（≥70）：基本达标
- **C 合格**（≥60）：待优化
- **D 不足**（<60）：需重做

**行业基准对比：** 评分报告会对照同行业基准（按 `game_type` 匹配），显示与行业平均分的差距。覆盖 RPG / MMORPG / ARPG / MOBA / FPS / SLG / 休闲 / 放置 等 8 个游戏类型。

### 4.5 模板库与自定义模板

#### 4.5.1 内置模板库

**入口：** 新建策划书时选择「从模板创建」 或 `Ctrl+Shift+T`

- 38 种游戏类型模板（位于 `data/templates/ceshu_templates.json`）
- 每种模板预填对应游戏类型的 18 章参考内容
- 模板预览显示：游戏类型、简介、已启用系统数 / 总系统数

#### 4.5.2 自定义模板（N13）

**入口：** 工具栏「模板编辑器」按钮 或 `Ctrl+Shift+E`

- **保存当前章节为模板**：把当前章节的字段值保存为可复用模板
- **模板分类**：按章节键分类存储（如 `meta.json` / `vision.json`）
- **全局模板**：跨章节通用模板存储在 `global.json`
- **存储位置**：`data/custom_templates/{category}.json`

每个自定义模板包含：`id` / `name` / `description` / `tags` / `chapter_key` / `data` / `created_at` / `updated_at` / `source_game`。

### 4.6 AI 辅助

#### 4.6.1 字段级 AI 填充（F1）

每个多行文本字段旁有「AI 帮我填」按钮：

1. 点击按钮，弹出确认对话框
2. AI 根据当前章节上下文 + 已有内容生成字段内容
3. 生成完成后内容直接填入字段，可继续编辑

#### 4.6.2 整章 AI 生成（F7）

**入口：** 章节标题栏「AI 生成本章」按钮

- AI 根据已填章节（如 `meta` / `vision`）派生当前章节内容
- 生成过程在后台 QThread 中执行，不阻塞 UI
- 生成完成后整章字段一次性填入

#### 4.6.3 完整策划书生成（N10）

**入口：** 工具栏「AI 生成」按钮 或 `Ctrl+Shift+G`（新建流程中也可从「✨ AI 生成」进入）

输入参数：

- 游戏名称、游戏类型（RPG / MOBA / FPS 等 12 种）
- 风格（仙侠 / 武侠 / 科幻 等 10 种）
- 简要描述、参考游戏、目标平台、商业模式
- **生成范围**：轻量（基础 9 章）/ 工业级（全部 18 章）

执行流程：

1. AI 生成各章的生成计划（章节顺序 + 提示词）
2. 按章节顺序逐章调用 `ai_fill_chapter`，已生成章节作为下一章上下文
3. 实时展示每章状态（待生成 / 生成中 / 已完成 / 失败）
4. 全部完成后一次性应用所有章节数据；**失败的章节可单独「重试失败章节」补齐**，无需整本重跑

#### 4.6.4 AI 智能审阅（N6）

**入口：** 「更多 ▸ → AI 审阅」或 `Ctrl+Shift+R`

5 维度结构化评分（每维度 1-10 分）：

| 维度 | 评估内容 |
|------|----------|
| 内容完整性 | 各章必填字段覆盖度 |
| 逻辑一致性 | 跨章节字段协同、系统依赖 |
| 市场可行性 | 竞品分析、商业模式、KPI |
| 技术可行性 | 引擎选型、性能目标、里程碑 |
| 创意度 | 差异化、玩法创新 |

输出：维度评分 + 详细反馈 + 总体评价 + Top 3 改进建议。支持导出为 Markdown 报告。

#### 4.6.5 AI 补全空白字段

**入口：** 「更多 ▸ → AI 补全空白字段」

针对当前章节，只生成**空白字段**的内容，已填字段保持不变（区别于「AI 整章」整体覆盖）。适合在人工填写了部分字段后补齐剩余章节。

#### 4.6.6 AI 数据生成（N20 · 数据共同开发）

**入口：** 工具栏「AI 数据」按钮

把策划书的**数值/系统章设定**作为上下文，让 AI 生成候选游戏数据（角色/技能/怪物/道具/装备等），支持人工审批：

1. 选择要生成的数据类型（勾选）→ 设置每类数量（1-20）与补充要求
2. 点击「生成候选」→ AI 依据策划书数值设定生成候选条目
3. 在分类型预览中**勾选要导入的条目**（可全选/取消）
4. 点击「导入勾选」→ 写入游戏数据表（ID 由系统自动生成），导入后数据 Tab 自动刷新

核心原则：**AI 只生产候选，人工勾选审批后才会写入数据**——实现"数据由 AI 与人工共同开发"。

### 4.7 版本管理

#### 4.7.1 派生版本

**入口：** 「更多 ▸ → 派生新版本」

- 基于当前策划书复制全部内容生成新版本
- `parent_id` 指向父策划书
- 默认非激活（父策划书仍是激活版本）
- 版本号自动递增（如父 `v1.0` → 子 `v1.1`）

#### 4.7.2 版本对比（N1）

**入口：** 「更多 ▸ → 版本对比」或 `Ctrl+Shift+D`

- 选择同版本链下的两个版本进行 Diff
- 章节级 Diff：新增 / 删除 / 修改 / 未变
- 字段级高亮：绿色（新增）/ 红色（删除）/ 黄色（修改）
- 统计变更字段数与总变更率
- 支持导出 Diff 报告为 Markdown

#### 4.7.3 版本时间线（N7）

**入口：** 「更多 ▸ → 版本时间线」

- 横向时间线展示同版本链下的所有版本
- 每个节点显示：版本号 + 创建时间 + 激活状态（绿色高亮）
- 节点间用箭头连接（parent → child）
- 点击节点查看该版本的 `version_note` 和章节进度
- 支持切换到选中版本

#### 4.7.4 变更日志（N15）

**入口：** 工具栏「变更日志」按钮 或 `Ctrl+Shift+H`

- 自动从版本对比生成 changelog
- 按版本时间排序，逐对计算 Diff
- 变更描述规则：
  - 新增：`新增字段 {field}：{new_value}`
  - 删除：`删除字段 {field}（原值：{old_value}）`
  - 修改：`修改字段 {field}：{old_value} → {new_value}`
  - 系统章节：`启用/禁用/修改系统 {sys_id}`
- 支持导出为 Markdown / 纯文本 / HTML 三种格式

### 4.8 完备性检查清单（N11）

**入口：** 工具栏「检查清单」按钮 或 `Ctrl+Shift+L`

50 项检查清单，分 6 大类：

| 类别 | 项数 | 关键检查项 |
|------|------|-----------|
| 项目基础 | 8 | 游戏名称、类型、平台、定位、核心循环 |
| 游戏设计 | 12 | 世界观、角色、战斗、经济、系统依赖、数值、美术 |
| 技术方案 | 8 | 引擎、技术栈、性能目标、MVP 范围/时间线/里程碑 |
| 商业与市场 | 8 | 目标市场、竞品、规模、付费模式、定价、KPI |
| 团队与流程 | 6 | 团队规模、角色分工、开发流程、版本控制（人工核查） |
| 风险与合规 | 8 | 风险矩阵、应急预案、本地化、版权、隐私、分级 |

**就绪判定：** 所有 `required=True` 的检查项通过 → 制作就绪（✅）。就绪度评分 = 通过项 / (通过+失败+警告) × 100。

### 4.9 字数统计（F6）

**入口：** 工具栏「字数统计」按钮

- 递归统计每章字数（中文按字符 + 英文按词）
- 对照工业级 GDD 字数基准（每章 min/期望/max 三档）
- 字数低于最低标准时给出写作建议
- 字数基准详见 [ceshu_scorer.py](../src/core/ceshu/ceshu_scorer.py) 的 `CHAPTER_WORD_BENCHMARK`

### 4.10 字段依赖关系图（N14）

**入口：** 工具栏「字段依赖图」按钮 或 `Ctrl+Shift+F`

- 可视化展示 18 章跨字段依赖关系（≥15 条）
- 三种依赖类型：
  - **一致性**（consistency）：两字段值应保持一致
  - **派生**（derived）：一字段值应由另一字段派生
  - **引用**（reference）：一字段引用另一字段内容
- 节点着色：绿色（OK）/ 黄色（警告）/ 红色（违规）
- 点击节点查看依赖详情

### 4.11 章节笔记（N8）

**入口：** 工具栏「章节笔记」按钮 或 `Ctrl+Shift+N`

- 为每章添加多条笔记（设计思路、待办、参考链接）
- 笔记存储位置：`data/libraries/<lib>/ceshu_notes/<ceshu_id>.json`
- 每条笔记字段：`id` / `chapter_key` / `content` / `created_at` / `updated_at` / `author`
- 双栏 UI：左侧列表 + 右侧编辑器

---

## 五、导出格式

支持 6 种导出格式，覆盖不同使用场景：

| 格式 | 后缀 | 入口函数 | 适用场景 |
|------|------|----------|----------|
| **Word 文档** | `.docx` | `export_ceshu_to_docx` | 正式文档、印刷、团队评审 |
| **PDF** | `.pdf` | `export_ceshu_to_pdf` | 终稿分发、归档、打印（带书签大纲） |
| **PowerPoint** | `.pptx` | `export_ceshu_to_pptx` | 立项汇报、投资人路演（16:9 宽屏） |
| **Markdown** | `.md` | `export_ceshu_to_markdown` | Git 版本控制、Wiki 发布、开发者协作 |
| **HTML** | `.html` | `export_ceshu_to_html` | 在线浏览、交互式导航、主题切换 |
| **Excel** | `.xlsx` | `export_ceshu_to_excel` | 数据分析、字段筛选、多 Sheet 视图 |

**通用特性：**

- 18 章完整结构
- 字段值统一格式化（空值显示 `—`）
- systems 章节按启用/未启用分类展示
- 可选附加校验报告附录

**调用方式：**

```python
from core.ceshu.ceshu_manager import CeshuManager

mgr = CeshuManager(library_root="data/libraries")
mgr.export_ceshu_docx(ceshu_id="abc123", library="default",
                     output="exports/my_gdd.docx")
```

---

## 六、混合玩法预设

**入口：** 工具栏「预设市场」按钮

18 个混合玩法预设覆盖主流品类组合，每个预设包含：风格 + 主模块 + 副模块 + 推荐系统 + 特色说明。

### 预设清单

| 预设 key | 标签 | 风格 | 模块 | 特色 |
|----------|------|------|------|------|
| `xianxia_rpg` | 仙侠 RPG | 仙侠 | rpg | 境界划分、宗门门派、法宝丹药 |
| `xianxia_mmorpg` | 仙侠 MMORPG | 仙侠 | mmorpg | 万人宗门战、跨服斗法 |
| `wuxia_slg` | 武侠 SLG | 武侠 | slg | 江湖门派经营、武林盟主争夺 |
| `scifi_fps` | 科幻 FPS | sci-fi | fps | 机甲装备、能量护盾、外星战场 |
| `scifi_survival` | 末日生存 | post_apoc | survival | 资源搜刮、庇护所建造、变异生物 |
| `fantasy_arpg` | 奇幻 ARPG | fantasy | arpg | 龙与魔法、地牢探险、装备词缀 |
| `modern_card` | 现代卡牌 | realistic | card | 卡组构筑、抽卡保底、天梯竞技 |
| `fantasy_moba` | 奇幻 MOBA | fantasy | moba | 英雄设计、B/P 系统、匹配算法 |
| `steampunk_strategy` | 蒸汽朋克策略 | steampunk | strategy | 机械兵团、蒸汽科技树、资源争夺 |
| `cyberpunk_rpg` | 赛博朋克 RPG | cyberpunk | rpg | 义体改造、黑客技能、企业阵营 |
| `dark_fantasy_roguelike` | 暗黑奇幻 Roguelike | dark | roguelike | 永久死亡、随机地牢、装备词缀 |
| `modern_military_fps` | 现代军事 FPS | realistic | fps | 真实武器、战术小队、排位赛 |
| `anime_openworld` | 二次元开放世界 | anime | open_world | 大世界探索、角色抽卡、元素反应 |
| `xianxia_card` | 修仙卡牌 | xianxia | card | 仙人卡组、境界突破、宗门卡池 |
| `post_apoc_tower_defense` | 末日塔防 | post_apoc | tower_defense | 废土防御塔、丧尸波次、幸存者招募 |
| `wuxia_arpg` | 武侠 ARPG | wuxia | arpg | 武功连招、轻功攀爬、神兵利器 |
| `fantasy_slg` | 奇幻 SLG | fantasy | slg | 种族阵营、领地建设、王座争霸 |
| `cyberpunk_moba` | 赛博 MOBA | cyberpunk | moba | 义体英雄、企业战队、霓虹地图 |

**应用方式：** 在预设市场卡片上点击「应用」按钮，预设的 `recommended_systems` 会写入策划书 `systems` 字段。应用前会弹窗确认将启用的系统列表。

---

## 七、键盘快捷键参考

| 快捷键 | 功能 |
|--------|------|
| `Ctrl+S` | 保存策划书 |
| `Ctrl+Shift+V` | 运行一致性校验 |
| `Ctrl+Shift+T` | 打开模板选择器 |
| `Ctrl+Shift+S` | 查看评分报告 |
| `Ctrl+Shift+D` | 版本对比（Diff） |
| `Ctrl+Shift+R` | AI 智能审阅 |
| `Ctrl+Shift+N` | 章节笔记 |
| `Ctrl+Shift+L` | 完备性检查清单 |
| `Ctrl+Shift+G` | AI 一键生成完整策划书 |
| `Ctrl+Shift+E` | 自定义模板编辑器 |
| `Ctrl+Shift+H` | 变更日志 |
| `Ctrl+Shift+F` | 字段依赖关系图 |

---

## 八、FAQ

### Q1：v4 旧数据能直接打开吗？

可以。[CeshuModel.from_dict()](../src/core/ceshu/ceshu_model.py) 会自动检测 `version="4.0"` 或缺失新增章节的情况，调用 `_migrate_v4_to_v5()` 把旧 9 章数据迁移到 v5.0 18 章结构。迁移规则：

- 旧字段保留原始数据不变（向后兼容）
- 从 `vision.competitive_analysis` 派生 `market_analysis.competitors`
- 从 `vision.business_model` 派生 `monetization.payment_model`
- 从 `worldview.character_network` 派生 `characters.npc_list`
- 从 `systems.battle.config` 派生 `combat` 章节
- 从 `systems.economy.config` 派生 `economy` 与 `monetization` 章节
- 从 `resources` 派生 `audio` / `risk_handling` / `accessibility`
- 从 `tech.milestones` 派生 `mvp.milestones`
- 版本号升级为 `5.0`

### Q2：评分等级 D 怎么改善？

1. 按 `Ctrl+Shift+L` 运行完备性检查清单，先补全所有 `required` 项
2. 按 `Ctrl+Shift+V` 运行校验，修复一致性冲突
3. 按 `Ctrl+Shift+S` 查看评分报告，定位低分章节
4. 点击「字数统计」查看每章字数是否达标
5. 必要时按 `Ctrl+Shift+R` 调用 AI 智能审阅，按 Top 3 建议改进

### Q3：AI 生成的内容质量不行怎么办？

- **字段级填充**：先填好上下文字段（如 `game_name` / `game_type` / `style`），AI 会基于上下文生成
- **整章生成**：确保前置章节已填好（如生成 `combat` 前先填好 `meta` / `gameplay` / `characters`）
- **完整生成**：在输入框中提供尽可能详细的描述、参考游戏、风格
- 生成后可手动编辑修正，AI 不会覆盖已有非空字段

### Q4：版本管理怎么用？

1. **主版本**：第一本创建的策划书默认是主版本（`parent_id=""`）
2. **派生子版本**：基于主版本派生，自动获得新版本号（如 `v1.0` → `v1.1`）
3. **激活版本**：同一版本链下只能有一个激活版本，切换激活会自动取消其他版本的激活状态
4. **版本对比**：选两个版本 Diff，查看字段级变更
5. **变更日志**：自动从版本序列生成 changelog

### Q5：导出 PDF 失败怎么办？

PDF 导出依赖 `reportlab` 等第三方库。如果失败：

1. 检查 `requirements.txt` 是否安装完整：`pip install reportlab`
2. 临时改用 docx 或 Markdown 导出
3. 查看日志（`logs/app.log`）确认具体错误

### Q6：自定义模板存在哪里？

- 存储目录：`data/custom_templates/`
- 按章节分类：`<chapter_key>.json`（如 `meta.json` / `vision.json`）
- 全局模板：`global.json`
- 不会覆盖内置模板（`data/templates/ceshu_templates.json`）

### Q7：混合玩法预设能自定义吗？

目前 18 个预设是内置的（位于 [ceshu_constants.py](../src/core/ceshu/ceshu_constants.py) 的 `HYBRID_GAMEPLAY_PRESETS`）。如需添加自定义预设，需要修改源码常量并重启应用。

### Q8：多个库怎么切换？

通过 EventBus 的 `library_switched` 事件触发切换。CeshuDataSync 会自动响应，重新加载新库的策划书列表与游戏数据。

---

## 九、相关文档

- [策划书开发者指南](./ceshu-developer-guide.md) — 技术架构与扩展指南
- [v5.0 发布说明](./ceshu-release-notes-v5.md) — 7 轮迭代功能清单
- [总体架构](./architecture.md) — 项目代码结构总览
- [API 参考文档](./api-reference.md) — 核心 API 速查
- [游戏策划书写作指南](./game-design-writing-guide.md) — LLM 与真人的写作规范
