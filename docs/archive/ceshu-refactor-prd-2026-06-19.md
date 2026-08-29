# 策划书重构 PRD（已归档）

> ⚠️ **归档说明**：本文档为 v4 重构阶段的 PRD，记录了从「策划方案」升级为 GDD 策划书的原始需求。
> v5.0 工业级 18 章 GDD 系统已上线，请改阅：
> - [ceshu-release-notes-v5.md](../ceshu-release-notes-v5.md) — v5.0 发布说明
> - [ceshu-user-guide.md](../ceshu-user-guide.md) — 用户指南
> - [ceshu-developer-guide.md](../ceshu-developer-guide.md) — 开发者指南
>
> 归档时间: 2026-07-05 | 原始日期: 2026-06-19

---

> 📌 **这是什么**：2026年6月策划书模块重构的产品需求文档，记录了从旧版"策划方案"升级为29章 GDD 策划书的完整需求。
> **什么时候用**：想了解策划书系统为什么这样设计、每个章节的原始意图。`

> 版本: 1.0 | 日期: 2026-06-19 | 作者: Alice (产品经理)

---

## 一、项目信息

| 项目 | 值 |
|------|-----|
| 语言 | 中文 |
| 技术栈 | Python 3 + PyQt6 |
| 项目名称 | `ceshu_refactor` |
| 原始需求 | 将"策划方案"模块升级为专业九章 GDD 的"策划书"系统 |

---

## 二、产品目标（Product Goals）

1. **专业化升级**：从当前的"字段式策划方案"升级为遵循行业标准的"九章 GDD 策划书"，覆盖从游戏概念到开发落地的完整链路
2. **编辑器联动闭环**：策划书写完后，自动根据 `enabled_editors` 配置创建对应的编辑器面板，实现"设计→开发"无缝衔接
3. **AI 深度嵌入**：将 AI 面板从"可选的辅助工具"变为"策划书编辑的常驻伙伴"，感知章节上下文并调度对应专业智能体

---

## 三、用户故事（User Stories）

### P0（必须完成——核心闭环）

| # | 用户故事 | 验收标准 |
|---|---------|---------|
| US1 | 作为游戏策划，我希望在应用启动后看到"策划书首页"，展示所有已有策划书的卡片列表，并能一键新建策划书 | 启动后默认进入策划书首页；卡片显示策划书名、游戏类型、最后修改时间；有醒目的"+ 新建策划书"按钮 |
| US2 | 作为游戏策划，我希望在新建/编辑策划书时，看到一个**左侧九章表单 + 右上编辑器预览 + 右下 AI 面板**的一体化视图 | 三栏布局正确渲染；九章可折叠展开；编辑器预览根据 enabled_editors 实时刷新 |
| US3 | 作为游戏策划，我希望写完全部九章后，系统自动根据第五章各子系统的 `enabled` 标记创建对应的编辑器面板 | 保存策划书后，对应编辑器自动创建（如"角色编辑器""技能编辑器"等），不需要手动逐个创建 |
| US4 | 作为系统管理员，我希望能将现有的 `planning_docs_v3.json` 数据一键迁移到新 `ceshu.json` 格式，不丢失任何已有内容 | 迁移脚本执行后，旧字段映射到新九章结构的对应章节，version 字段记录迁移信息 |

### P1（应该完成——体验增强）

| # | 用户故事 | 验收标准 |
|---|---------|---------|
| US5 | 作为游戏策划，我希望 AI 面板自动感知我当前正在编辑的章节（如"第三章 世界观"），并给出针对性的建议 | 切换编辑章节时，AI 面板自动加载该章节上下文并切换对应的智能体角色 |
| US6 | 作为游戏策划，我希望在字段旁有"AI 帮我填"按钮，点击后 AI 自动补全当前字段内容 | 按钮出现在每个文本段落字段旁；点击后弹窗确认，AI 生成内容直接填入 |
| US7 | 作为游戏策划，我希望从模板创建策划书时，模板已经预填了对应游戏类型的九章内容 | 38种游戏类型模板全部升级为新九章结构；"从模板创建"弹窗展示模板预览 |
| US8 | 作为游戏策划，我希望九章编辑表单支持分章节折叠/展开，方便聚焦当前编辑内容 | 每章标题栏为可折叠 toggle；默认展开第一章（meta），其余折叠 |

### P2（可以完成——锦上添花）

| # | 用户故事 | 验收标准 |
|---|---------|---------|
| US9 | 作为游戏策划，我希望在第四章 gameplay 中能可视化编辑核心循环图 | 提供一个简易的流程图/循环图绘制区域 |
| US10 | 作为游戏策划，我希望编辑 `editor_configs` 时能预览编辑器效果 | 编辑器配置修改后，右上预览区实时刷新 |
| US11 | 作为游戏策划，我希望策划书支持版本对比（diff）功能 | 选择两个版本，高亮显示差异 |

---

## 四、需求池（Requirements Pool）

### 4.1 改名（P0）

| ID | 需求 | 优先级 | 依赖 |
|----|------|--------|------|
| R1.1 | 用户可见文案："策划方案" → "策划书"、"方案" → "策划书" | P0 | - |
| R1.2 | 数据文件：`planning_docs_v3.json` → `ceshu.json` | P0 | R1.1 |
| R1.3 | 目录：`data/libraries/*/planning/` → `data/libraries/*/ceshu/` | P0 | R1.1 |
| R1.4 | 代码目录：`src/ui/planning/` → `src/ui/ceshu/` | P0 | R1.1 |
| R1.5 | 类名：`PlanningSkill` → `CeshuSkill`，`PlanningDocument` → `CeshuDocument`，`PlanningEditorTab` → `CeshuEditorTab` | P0 | R1.4 |
| R1.6 | Skill 注册名：`system.planning` → `system.ceshu` | P0 | R1.5 |
| R1.7 | 所有内部方法/变量名中的 `planning`/`plan` → `ceshu`/`book` 前缀 | P0 | R1.5 |

### 4.2 数据结构升级（P0）

| ID | 需求 | 优先级 | 依赖 |
|----|------|--------|------|
| R2.1 | 定义九章数据结构：`meta`、`vision`、`worldview`、`gameplay`、`systems`、`numeric`、`art`、`tech`、`resources` | P0 | - |
| R2.2 | `ceshu.json` 新增 `enabled_editors` 字段（`string[]`），标记该策划书启用哪些编辑器 | P0 | R2.1 |
| R2.3 | `systems`（第五章）的每个子系统含 `enabled` (bool) 和 `editor_config` (object) 字段 | P0 | R2.1 |
| R2.4 | `meta`（第一章）包含：游戏名称、类型、平台、一句话定位、核心特色标签、作者、版本号、日期、保密级别、文档状态 | P0 | R2.1 |
| R2.5 | `vision`（第二章）包含：设计愿景与哲学、目标用户画像(主/次/潜在)、竞品分析(3-5款)、差异化优势、商业模式、市场规模预估 | P0 | R2.1 |
| R2.6 | `tech`（第八章）包含：引擎/框架选型、核心技术架构、第三方依赖、性能目标(FPS/内存/包体)、开发里程碑、团队编制、质量保障计划 | P0 | R2.1 |
| R2.7 | `resources`（第九章）包含：美术/音频/本地化/外包资产清单、预算概算、风险评估矩阵(概率×影响)、应急预案、知识产权说明、附录 | P0 | R2.1 |

### 4.3 编辑器联动（P0-P1）

| ID | 需求 | 优先级 | 依赖 |
|----|------|--------|------|
| R3.1 | 策划书保存时，解析 `enabled_editors` + 各子系统 `enabled` 标记，自动创建对应编辑器面板 | P0 | R2.2, R2.3 |
| R3.2 | `editor_configs` 字段存储可选的自定义编辑器配置（如列数、默认排序等） | P1 | R2.3 |
| R3.3 | 编辑器创建前弹窗确认（列出将要创建的编辑器列表） | P1 | R3.1 |

### 4.4 UI 重构（P0-P1）

| ID | 需求 | 优先级 | 依赖 |
|----|------|--------|------|
| R4.1 | 策划书首页（`CeshuHomePage`）：卡片列表 + 搜索/筛选 + "+ 新建"按钮 | P0 | R1.4 |
| R4.2 | 新建弹窗：支持"从模板创建"（显示38种模板）和"空白开始"两个选项 | P0 | R4.1 |
| R4.3 | 一体化编辑视图（`CeshuEditorView`）：左侧九章表单 + 右上编辑器预览 + 右下 AI 面板 | P0 | R1.4, R2.1 |
| R4.4 | 九章表单支持折叠/展开，点击章节标题 toggle | P0 | R4.3 |
| R4.5 | 右上编辑器预览区：根据 `enabled_editors` 动态渲染对应编辑器的缩略预览 | P1 | R4.3, R3.1 |
| R4.6 | 应用启动默认展示策划书首页（替代当前布局的默认 Tab） | P0 | R4.1 |
| R4.7 | 删除旧的 `PlanningEditorTab` 中冗余的列表/选择逻辑，简化为纯编辑视图 | P0 | R4.3 |

### 4.5 AI 智能体升级（P0-P1）

| ID | 需求 | 优先级 | 依赖 |
|----|------|--------|------|
| R5.1 | AI 面板在策划书编辑界面始终可见（常驻右下角） | P0 | R4.3 |
| R5.2 | AI 自动加载当前策划书全文作为对话上下文 | P0 | R5.1 |
| R5.3 | 根据当前编辑章节切换专业智能体：第三章→文案写手、第五章→策划专家、第六章→数据分析师、第八章→代码助手 | P1 | R5.1, R5.2 |
| R5.4 | 字段级"AI 帮我填"：每个多行文本字段旁增加此按钮 | P0 | R5.1, R5.2 |
| R5.5 | AI 面板支持历史对话记录（与当前策划书绑定） | P2 | R5.1 |

### 4.6 模板体系升级（P0-P1）

| ID | 需求 | 优先级 | 依赖 |
|----|------|--------|------|
| R6.1 | 现有 `planning_templates.json`（1.7MB, 38种类型）全部升级为新九章结构 | P0 | R2.1 |
| R6.2 | 每种模板预填对应游戏类型的九章参考内容 | P0 | R6.1 |
| R6.3 | 新模板文件保存为 `ceshu_templates.json`，旧文件保留用于迁移参考 | P0 | R6.1 |
| R6.4 | 模板预览：在"从模板创建"弹窗中显示模板的游戏类型、预填章节数、标签 | P1 | R6.1, R4.2 |

### 4.7 数据兼容与迁移（P0）

| ID | 需求 | 优先级 | 依赖 |
|----|------|--------|------|
| R7.1 | 提供数据迁移脚本 `migrate_planning_to_ceshu.py`，放在 `scripts/` 目录下 | P0 | R2.1 |
| R7.2 | 迁移映射：`game_concept` → `meta.游戏概述` + `vision`、`worldview` → `worldview`、`gameplay` → `gameplay`、`systems` → `systems`、`numeric` → `numeric`、`art_style` → `art`、`story` → `worldview.主线剧情`、`notes` → `resources.附录` | P0 | R7.1 |
| R7.3 | 迁移时新增字段置默认值，version 记录 `"migrated_from_v3"` | P0 | R7.1 |
| R7.4 | 迁移完成后输出报告（成功/跳过/失败的策划书数量） | P0 | R7.1 |
| R7.5 | 提供回滚脚本（将 ceshu.json 恢复为 planning_docs_v3.json） | P2 | R7.1 |

---

## 五、九章数据结构定义

```json
{
  "id": "ceshu_001",
  "name": "策划书名",
  "version": "4.0.0",
  "migrated_from": null,

  "meta": {
    "game_name": "",
    "game_type": "",
    "platforms": [],
    "one_liner": "",
    "tags": [],
    "author": "",
    "version": "0.1",
    "date": "",
    "confidentiality": "内部",
    "doc_status": "草稿"
  },

  "vision": {
    "design_philosophy": "",
    "target_users": { "primary": "", "secondary": "", "potential": "" },
    "competitive_analysis": [],
    "differentiation": "",
    "business_model": "",
    "market_estimate": ""
  },

  "worldview": {
    "world_framework": "",
    "history_eras": [],
    "factions": [],
    "geography": "",
    "main_story_outline": "",
    "branches_and_endings": "",
    "character_relationship_map": "",
    "narrative_style": ""
  },

  "gameplay": {
    "core_loop_diagram": "",
    "controls": { "pc": "", "console": "", "mobile": "" },
    "first_30_minutes": "",
    "game_modes": [],
    "win_loss_conditions": "",
    "tutorial_design": ""
  },

  "systems": {
    "combat": { "enabled": true, "editor_config": {}, "details": "" },
    "character": { "enabled": true, "editor_config": {}, "details": "" },
    "skill": { "enabled": true, "editor_config": {}, "details": "" },
    "equipment": { "enabled": true, "editor_config": {}, "details": "" },
    "item": { "enabled": true, "editor_config": {}, "details": "" },
    "quest": { "enabled": true, "editor_config": {}, "details": "" },
    "social": { "enabled": false, "editor_config": {}, "details": "" },
    "economy": { "enabled": false, "editor_config": {}, "details": "" },
    "growth": { "enabled": true, "editor_config": {}, "details": "" },
    "custom": []
  },

  "numeric": {
    "core_formulas": "",
    "level_curve": "",
    "attribute_growth": "",
    "drop_tables": "",
    "economy_cycle": "",
    "balance_principles": ""
  },

  "art": {
    "style_positioning": "",
    "character_design": "",
    "scene_design": "",
    "ui_design_language": "",
    "color_system": "",
    "typography": "",
    "vfx_style": "",
    "ui_animation_spec": "",
    "multi_resolution": ""
  },

  "tech": {
    "engine_framework": "",
    "core_architecture": "",
    "third_party_deps": [],
    "performance_targets": { "fps": 60, "memory_mb": 0, "package_size_mb": 0 },
    "milestones": [],
    "team_structure": "",
    "qa_plan": ""
  },

  "resources": {
    "art_assets": [],
    "audio_assets": [],
    "localization": [],
    "outsourcing": [],
    "budget_estimate": "",
    "risk_matrix": [],
    "contingency_plan": "",
    "ip_statement": "",
    "appendix": ""
  },

  "enabled_editors": [],
  "created_at": "",
  "updated_at": ""
}
```

---

## 六、UI 布局草案

### 6.1 策划书首页

```
┌──────────────────────────────────────────────┐
│  策划书                        [+ 新建策划书]  │
│  🔍 搜索...          [游戏类型▼] [排序▼]       │
├──────────────────────────────────────────────┤
│  ┌──────────┐  ┌──────────┐  ┌──────────┐    │
│  │ 策划书1   │  │ 策划书2   │  │ 策划书3   │    │
│  │ RPG      │  │ 卡牌     │  │ MOBA     │    │
│  │ 修改: ... │  │ 修改: ... │  │ 修改: ... │    │
│  └──────────┘  └──────────┘  └──────────┘    │
│  ┌──────────┐  ┌──────────┐                  │
│  │ 策划书4   │  │ 策划书5   │                  │
│  └──────────┘  └──────────┘                  │
└──────────────────────────────────────────────┘
```

### 6.2 一体化编辑视图

```
┌──────────────┬───────────────────────────────┐
│ 左侧: 九章表单 │ 右上: 编辑器实时预览              │
│              │  ┌───────────────────────────┐│
│ ▼ 第一章 meta │  │ [角色编辑器预览]             ││
│   游戏名称...  │  │ [技能编辑器预览]             ││
│   游戏类型...  │  │                            ││
│              │  └───────────────────────────┘│
│ ▶ 第二章 vision├───────────────────────────────┤
│ ▶ 第三章 world │ 右下: AI 智能体面板              │
│ ▼ 第四章 play  │  ┌───────────────────────────┐│
│   ...         │  │ 🎯 策划专家 (第五章)         ││
│              │  │                            ││
│ ▶ 第五章 sys  │  │ 你正在编辑第五章战斗系统，     ││
│ ▶ 第六章 num  │  │ 需要我帮忙设计伤害公式吗？     ││
│ ▶ 第七章 art  │  │                            ││
│ ▶ 第八章 tech │  │ [输入框________________] [发送]│
│ ▶ 第九章 res  │  └───────────────────────────┘│
└──────────────┴───────────────────────────────┘
```

---

## 七、迁移映射表

| 旧字段 (`planning_docs_v3.json`) | 新字段 (`ceshu.json`) |
|----------------------------------|----------------------|
| `id` | `id` |
| `name` | `name` |
| `game_concept` | `meta.game_name` + `meta.one_liner` + `vision.design_philosophy` |
| `worldview` | `worldview.world_framework` |
| `gameplay` | `gameplay.core_loop_diagram` |
| `systems` | `systems.combat.details` / `systems.character.details` ... |
| `numeric` (dict) | `numeric` (展开到对应子字段) |
| `art_style` | `art.style_positioning` |
| `story` | `worldview.main_story_outline` |
| `notes` | `resources.appendix` |
| `versions` | `version` 字段记录 |
| `created_at` | `created_at` |
| `updated_at` | `updated_at` |
| (无) | `enabled_editors` — 根据 `game_concept` 关键词推断默认值 |
| (无) | `systems.*.enabled` — 默认全部 `true` |
| (无) | 其余九章字段 — 默认空字符串 |

---

## 八、依赖关系总览

```
R1.1(改名文案)
 └─ R1.2(文件改名) → R1.3(目录改名) → R1.4(代码目录) → R1.5(类名) → R1.6(skill名) → R1.7(内部变量)

R2.1(九章数据结构) ─────────────────────────────────────────────────────┐
 ├─ R2.2(enabled_editors) ── R3.1(自动创建编辑器) ── R3.2(editor_configs)
 ├─ R2.3(systems.enabled) ── R3.1                                        │
 ├─ R2.4~R2.7(各章详细字段)                                              │
 ├─ R6.1(模板升级) → R6.2(预填内容) → R6.3(新模板文件) → R4.2(从模板创建)  │
 └─ R7.1(迁移脚本) → R7.2(映射) → R7.3(默认值) → R7.4(报告)             │

R4.1(首页) → R4.2(新建弹窗) → R4.3(编辑视图) → R4.4(折叠) → R4.5(预览)
R5.1(AI常驻) → R5.2(上下文加载) → R5.3(智能体切换) → R5.4(AI帮我填)
```

---

## 九、待确认问题（Open Questions）

1. **竞品分析数据**：第二章 vision 中的竞品分析象限图，是否需要在编辑器内嵌一个可视化图表组件，还是仅以 Markdown 表格 + 文字描述即可？
2. **核心循环图编辑**：第四章 gameplay 的"核心循环图"是使用内置流程图编辑器还是以上传图片+文字描述替代？
3. **编辑器预览粒度**：右上角编辑器预览是只展示"已启用编辑器列表 + 字段概要"，还是加载真实数据做完整预览？
4. **AI 对话历史**：AI 面板的对话历史是否需要持久化（与策划书绑定存储到 ceshu.json），还是仅保留会话期内？
5. **旧 UI 组件**：`src/ui/planning/` 目录下的 `dialogs.py`、`widgets.py`、`templates.py` 中哪些功能需要保留并迁移到新 ceshu UI？还是全部重写？
6. **模板迁移策略**：38 种模板的九章内容如何生成——人工逐项填写、AI 批量生成、还是复用现有模板数据做智能映射？
7. **多库支持**：现有代码支持多库（`data/libraries/<库名>/planning/`），改名后这个多库结构是否保持？
