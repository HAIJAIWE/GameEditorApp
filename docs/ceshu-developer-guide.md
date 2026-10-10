> ⚠️ **本文档描述的是已移除的 Python 版（PyQt6），该版本已于 2026-10-10 整体退场。**
> 现役产品是 [`desktop/`](../desktop) 下的 TypeScript + Electron 版，设计文档在 [`desktop/docs/`](../desktop/docs)。
> 本文档仅作历史/考古参考：其中所有代码路径、类名、命令均指向已被删除的 Python 源码，**请勿据此开发**。
> Python 全量源码可从 git tag **`python-final`** 取回。

# 策划书（Ceshu）开发者指南

> 📌 **这是什么**：面向开发者的技术文档，描述策划书模块的架构、核心数据结构、关键 API 与扩展方法。
> **什么时候用**：二次开发、添加新章节/导出格式/AI 功能/校验规则，或阅读源码时查阅。

> 版本: v5.1 | 核心模块: `src/core/ceshu/` (21 文件) | UI 模块: `src/ui/ceshu/` (35 文件)

---

## 一、架构概览

策划书模块采用三层架构，核心层与 UI 层解耦，核心层不依赖 PyQt6。

```
┌─────────────────────────────────────────────────────────────┐
│                    UI 层 (src/ui/ceshu/)                     │
│  CeshuHomeView / CeshuEditorView / ChapterEditPanel         │
│  SystemsEditor / AIChatPanel / 16 个 Dialog                  │
├─────────────────────────────────────────────────────────────┤
│                   核心 层 (src/core/ceshu/)                  │
│  CeshuModel (18章数据) / CeshuManager (CRUD)                │
│  CeshuTemplate / CeshuDataSync / CeshuScorer                │
│  6 个 Exporter / Checklist / Changelog / FieldDependencies  │
├─────────────────────────────────────────────────────────────┤
│                   数据 层 (data/)                            │
│  libraries/<lib>/ceshu/<id>.json (策划书文件)                │
│  templates/ceshu_templates.json (内置模板)                   │
│  custom_templates/<category>.json (自定义模板)               │
│  libraries/<lib>/ceshu_notes/<id>.json (章节笔记)            │
└─────────────────────────────────────────────────────────────┘
```

### 设计原则

1. **核心层零 PyQt6 依赖**：`ceshu_model.py` / `ceshu_scorer.py` / `ceshu_checklist.py` / `ceshu_changelog.py` / `field_dependencies.py` / `custom_template_manager.py` 均为纯 Python，可独立单元测试
2. **单一事实来源**：[CeshuModel](../src/core/ceshu/ceshu_model.py) 是 18 章数据的唯一来源，所有模块通过 `model.get_chapter(key)` 读取
3. **事件驱动同步**：[CeshuDataSync](../src/core/ceshu/ceshu_data_sync.py) 通过 EventBus 订阅 `ceshu_changed` / `data_changed` / `library_switched` 事件，实现策划书↔游戏数据双向同步
4. **原子写入**：所有持久化操作使用 `temp + os.replace` 防止崩溃损坏
5. **向后兼容**：`from_dict` 自动检测 v4.0 旧数据并迁移到 v5.0

---

## 二、模块依赖图

```
                    ┌──────────────┐
                    │  ceshu_model  │ ◄── 单一事实来源
                    └──────┬───────┘
        ┌─────────┬────────┼────────┬──────────┐
        ▼         ▼        ▼        ▼          ▼
  ceshu_manager  scorer  checklist  changelog  field_dependencies
        │         │        │           │            │
        │         └────────┴───────────┴────────────┘
        │              (都依赖 ceshu_model)
        ▼
  ceshu_template  ceshu_data_sync
        │                │
        │                ▼
        │           EventBus (common.event_bus)
        │
        ▼
  6 个 Exporter (docx/pdf/pptx/markdown/html/excel)
        │
        └── 都依赖 ceshu_export_common（公用工具）
```

### 核心模块清单（21 个文件）

| 文件 | 职责 | 主要类/函数 |
|------|------|-------------|
| [__init__.py](../src/core/ceshu/__init__.py) | 模块导出 | （包初始化） |
| [ceshu_model.py](../src/core/ceshu/ceshu_model.py) | 18 章数据模型 | `CeshuModel` / `CHAPTER_KEYS` / `CHAPTER_LABELS` / `CHAPTER_REQUIRED_FIELDS` / `gdd_scope` / `visible_chapter_keys` |
| [ceshu_constants.py](../src/core/ceshu/ceshu_constants.py) | 常量定义 | `GDD_SCOPE_LITE` / `GDD_SCOPE_FULL` / `BASE_CHAPTER_KEYS` / `INDUSTRIAL_CHAPTER_KEYS`（档位章节分组） / `SYSTEM_LABELS` / `SYSTEM_CONFIG_SCHEMA` / `SYSTEM_DEPENDENCIES` / `MODULE_SYSTEM_RECOMMENDATIONS` / `HYBRID_GAMEPLAY_PRESETS` |
| [ceshu_validation.py](../src/core/ceshu/ceshu_validation.py) | 校验规则（v5.1 独立抽离） | `validate_ceshu` |
| [ceshu_fill.py](../src/core/ceshu/ceshu_fill.py) | 空必填字段自动填充 | `auto_fill_required_fields` |
| [ceshu_migration.py](../src/core/ceshu/ceshu_migration.py) | v4→v5 迁移逻辑 | `migrate_v4_to_v5` |
| [ceshu_manager.py](../src/core/ceshu/ceshu_manager.py) | CRUD 管理 | `CeshuManager` |
| [ceshu_template.py](../src/core/ceshu/ceshu_template.py) | 模板加载 | `CeshuTemplate` |
| [ceshu_data_sync.py](../src/core/ceshu/ceshu_data_sync.py) | 双向同步 | `CeshuDataSync` |
| [ceshu_scorer.py](../src/core/ceshu/ceshu_scorer.py) | 评分引擎（N4） | `score_ceshu` / `ScoreReport` / `ChapterScore` |
| [ceshu_checklist.py](../src/core/ceshu/ceshu_checklist.py) | 完备性检查（N11） | `run_checklist` / `ChecklistReport` / 36 个 `check_*` 函数 |
| [ceshu_changelog.py](../src/core/ceshu/ceshu_changelog.py) | 变更日志（N15） | `generate_changelog` / `generate_changelog_between` / `Changelog` |
| [field_dependencies.py](../src/core/ceshu/field_dependencies.py) | 字段依赖图（N14） | `FIELD_DEPENDENCIES` / `check_field_dependencies` / `build_dependency_graph` |
| [custom_template_manager.py](../src/core/ceshu/custom_template_manager.py) | 自定义模板（N13） | `CustomTemplateManager` |
| [ceshu_export_common.py](../src/core/ceshu/ceshu_export_common.py) | 导出公用工具 | `format_field_value` / `classify_systems` / `is_empty_value` |
| [ceshu_docx_exporter.py](../src/core/ceshu/ceshu_docx_exporter.py) | Word 导出 | `export_ceshu_to_docx` |
| [ceshu_pdf_exporter.py](../src/core/ceshu/ceshu_pdf_exporter.py) | PDF 导出（F5） | `export_ceshu_to_pdf` |
| [ceshu_pptx_exporter.py](../src/core/ceshu/ceshu_pptx_exporter.py) | PPT 导出（N3） | `export_ceshu_to_pptx` |
| [ceshu_markdown_exporter.py](../src/core/ceshu/ceshu_markdown_exporter.py) | Markdown 导出（N9） | `export_ceshu_to_markdown` |
| [ceshu_html_exporter.py](../src/core/ceshu/ceshu_html_exporter.py) | HTML 导出（N12） | `export_ceshu_to_html` |
| [ceshu_excel_exporter.py](../src/core/ceshu/ceshu_excel_exporter.py) | Excel 导出（N16） | `export_ceshu_to_excel` |

### UI 模块清单（35 个文件）

按功能分组：

- **首页与编辑视图**：`home_view.py` / `home_card.py` / `editor_view.py` / `editor_view_mixins.py` / `editor_view_workers.py` / `chapter_panel.py` / `preview_panel.py` / `ceshu_theme.py`
- **章节表单**：`chapter_forms/`（`_base.py` / `_common.py` / `_industrial.py`，聚合各章节表单类）
- **游戏系统**：`systems_editor.py` / `system_confirm_dialog.py` / `system_dependency_graph.py`
- **AI 面板**：`ai_panel.py` / `ai_field_button.py` / `ai_full_generate_dialog.py` / `ai_data_generate_dialog.py`（N20） / `ai_review_dialog.py`
- **版本管理**：`version_diff_dialog.py` / `version_timeline_dialog.py` / `changelog_dialog.py`
- **校验与评分**：`validation_dialog.py` / `score_report_dialog.py` / `word_stats_dialog.py` / `checklist_dialog.py`
- **模板**：`template_picker_dialog.py` / `template_editor_dialog.py` / `chapter_templates.py` / `preset_market_dialog.py`
- **其他**：`field_dependency_graph.py` / `chapter_notes.py` / `competitive_chart.py`

> **渲染健壮性**：章节表单的列表字段（`tags` / `game_modes` / `platform` 等）统一走 `chapter_forms/_base.py` 的 `_join_items()` 转换文本——dict 元素取 `name`/`label`/`title`，其余兜底 JSON/字符串序列化，防止 AI 数据或历史数据混入 dict 元素导致 `"\n".join` 崩溃。

---

## 三、核心数据结构

### 3.1 CeshuModel 18 章字段定义

完整定义见 [ceshu_model.py](../src/core/ceshu/ceshu_model.py)。下面列出关键章节的字段结构。

#### 档位（gdd_scope）

`gdd_scope` 以 **property** 形式实现（`CeshuModel.gdd_scope`），持久化于 `meta["gdd_scope"]`，兼容旧策划书文件（缺失时默认 `full`）：

- 取值：`GDD_SCOPE_LITE`（`"lite"`，轻量 GDD，仅基础 9 章）/ `GDD_SCOPE_FULL`（`"full"`，工业级，全部 18 章）
- 章节分组常量：`BASE_CHAPTER_KEYS`（`CHAPTER_KEYS[:9]` 基础章）与 `INDUSTRIAL_CHAPTER_KEYS`（`CHAPTER_KEYS[9:]` 工业补充章）
- `visible_chapter_keys()` 按档位返回可见章节：lite 只含 `BASE_CHAPTER_KEYS`，full 返回全部 `CHAPTER_KEYS`
- `set_chapter("meta", ...)` 整体替换 meta 时会保留既有 `gdd_scope` 标记

#### meta（第一章·项目元信息）

```python
{
    "game_name": "",          # 游戏名称
    "game_type": "",          # 游戏类型（RPG/ARPG/MOBA...）
    "platform": [],           # 目标平台列表
    "positioning": "",        # 项目定位
    "tags": [],               # 核心特色标签
    "version": "0.1.0",       # 文档版本
    "date": "2026-07-05",     # 创建日期
    "confidentiality": "internal",  # 保密级别
    "status": "draft",        # 文档状态
}
```

#### systems（第五章·游戏系统设计）

每个系统结构：

```python
{
    "battle": {
        "enabled": True,                    # 是否启用
        "name": "战斗",                     # 中文显示名
        "config": {                         # 配置字段（按 SYSTEM_CONFIG_SCHEMA）
            "turn_mode": "turn_based",
            "pvp_type": "none",
            "team_size": 4,
            # ... 共 15 个字段
        },
        "data_type": "battle",              # 数据类型 key（用于联动编辑器）
    },
    # ... 共 13 个系统
}
```

#### market_analysis（第十章·市场分析，v5.0 新增）

```python
{
    "target_market": "",          # 目标市场
    "market_size": "",            # 市场容量
    "user_demographics": "",      # 用户画像
    "competitors": [              # 竞品列表
        {"name": "", "type": "", "strengths": "", "weaknesses": "", "market_share": ""}
    ],
    "market_positioning": "",     # 市场定位
    "entry_barriers": "",         # 进入壁垒
    "market_trends": [],          # 市场趋势
    "kpi_forecast": {             # KPI 预测
        "dau": 0, "mau": 0, "retention_d1": 0, "retention_d7": 0, "arpu": 0, "ltv": 0
    },
}
```

#### combat（第十二章·战斗系统设计，v5.0 新增）

```python
{
    "combat_mode": "",            # 战斗模式（回合/即时/半即时）
    "damage_formula": "",         # 伤害公式
    "skill_system": "",           # 技能系统
    "buff_debuff": "",            # Buff/Debuff
    "element_system": "",         # 元素系统
    "combat_pace": "",            # 战斗节奏
    "team_formation": "",         # 队伍编排
    "pvp_design": "",             # PVP 设计
    "pve_design": "",             # PVE 设计
    "boss_mechanics": "",         # Boss 战机制
    "combat_progression": "",     # 难度递进
    "balance_strategy": "",       # 平衡策略
}
```

#### monetization（第十四章·商业化设计，v5.0 新增）

```python
{
    "payment_model": "",          # 付费模式（f2p/p2p/b2p/订阅）
    "pricing_tiers": [],          # 定价档位
    "iap_design": [               # 内购设计
        {"item": "", "price": 0, "value": "", "target": ""}
    ],
    "ad_strategy": "",            # 广告策略
    "subscription_design": "",    # 订阅制
    "season_pass": "",            # 赛季通行证
    "vip_system": "",             # VIP 系统
    "limited_offers": "",         # 限时活动
    "whale_strategy": "",         # 大 R 策略
    "f2p_experience": "",         # 免费玩家体验
    "revenue_forecast": {},       # 收入预测
    "arpu_target": "",            # ARPU 目标
}
```

### 3.2 完整 JSON 结构（节选）

```json
{
  "version": "5.0",
  "ceshu_id": "abc12345",
  "created_at": "2026-07-05 10:00:00",
  "updated_at": "2026-07-05 11:30:00",
  "parent_id": "",
  "version_label": "v1.0",
  "is_active": true,
  "version_note": "",
  "style": "xianxia",
  "module_type": "rpg",
  "meta": { /* ... */ },
  "vision": { /* ... */ },
  "worldview": { /* ... */ },
  "gameplay": { /* ... */ },
  "systems": { /* 13 个游戏系统 */ },
  "numeric": { /* ... */ },
  "art": { /* ... */ },
  "tech": { /* ... */ },
  "resources": { /* ... */ },
  "market_analysis": { /* v5.0 新增 */ },
  "characters": { /* v5.0 新增 */ },
  "combat": { /* v5.0 新增 */ },
  "economy": { /* v5.0 新增 */ },
  "monetization": { /* v5.0 新增 */ },
  "mvp": { /* v5.0 新增 */ },
  "risk_handling": { /* v5.0 新增 */ },
  "audio": { /* v5.0 新增 */ },
  "accessibility": { /* v5.0 新增 */ },
  "enabled_editors": [ /* 自动从 systems 计算 */ ],
  "editor_configs": {}
}
```

### 3.3 常量定义

| 常量 | 位置 | 用途 |
|------|------|------|
| `CHAPTER_KEYS` | ceshu_model.py | 18 章键名列表（顺序敏感） |
| `CHAPTER_LABELS` | ceshu_model.py | 章节键→中文名映射 |
| `CHAPTER_REQUIRED_FIELDS` | ceshu_model.py | 每章必填字段（用于进度与校验） |
| `SYSTEM_LABELS` | ceshu_constants.py | 13 个游戏中文名映射 |
| `SYSTEM_CONFIG_SCHEMA` | ceshu_constants.py | 各系统配置字段定义（含控件类型） |
| `SYSTEM_DEPENDENCIES` | ceshu_constants.py | 系统间硬依赖关系 |
| `MODULE_SYSTEM_RECOMMENDATIONS` | ceshu_constants.py | 12 种模块类型的推荐系统组合 |
| `HYBRID_GAMEPLAY_PRESETS` | ceshu_constants.py | 18 个混合玩法预设 |
| `FIELD_DEPENDENCIES` | field_dependencies.py | 跨章节字段依赖表（≥15 条） |
| `CHAPTER_WORD_BENCHMARK` | ceshu_scorer.py | 18 章字数基准（min/max/mid） |
| `INDUSTRY_BENCHMARKS` | ceshu_scorer.py | 同行业评分基准（按 game_type） |

---

## 四、关键类与方法 API

### 4.1 CeshuModel

```python
from core.ceshu.ceshu_model import CeshuModel, CHAPTER_KEYS, CHAPTER_LABELS

# 创建新策划书
model = CeshuModel(title="游戏名称", game_type="RPG")

# 章节操作
model.set_chapter("combat", {"combat_mode": "turn_based", "damage_formula": "atk - def"})
chapter_data = model.get_chapter("combat")

# 游戏系统管理
model.set_system("battle", enabled=True, config={"turn_mode": "turn_based"})
model.add_system("custom_sys", config={"key": "value"})  # 自定义系统
model.remove_system("custom_sys")

# 自动计算 enabled_editors
editors = model.compute_enabled_editors()  # [{"key":"battle","name":"战斗","data_type":"battle"}, ...]

# 档位（property，持久化于 meta.gdd_scope）
model.gdd_scope = "lite"      # lite=轻量 9 章 / full=工业级 18 章
print(model.gdd_scope)        # "lite"

# 按档位返回可见章节：lite → 基础 9 章；full → 全部 18 章
visible_keys = model.visible_chapter_keys()

# 进度计算（按档位可见章节计算）
progress = model.chapter_progress()
# {"meta": 1.0, "vision": 0.5, ..., "total": 0.42}

# 校验（11 项一致性检查 + 必填字段 + 系统依赖）
errors = model.validate()  # ["第一章·项目元信息：字段 'game_name' 为必填项", ...]

# 一键自动填充空必填字段（v5.0 优化C，不调用 LLM）
filled_count = model.auto_fill_required()  # 返回填充字段数

# 版本管理辅助
model.is_main_version  # True 表示主策划
model.version_display  # "v1.0 (主)★"

# 序列化
data = model.to_dict()
model = CeshuModel.from_dict(data)  # 自动检测并迁移 v4.0
model = CeshuModel.from_json_file("/path/to/ceshu.json")
```

### 4.2 CeshuManager

```python
from core.ceshu.ceshu_manager import CeshuManager

mgr = CeshuManager(library_root="data/libraries")

# CRUD
model = mgr.create_ceshu(library="default", template_name="RPG模板", meta={"game_name": "新游戏"})
model = mgr.get_ceshu(ceshu_id="abc123", library="default")
mgr.save_ceshu(model, library="default")
mgr.delete_ceshu(ceshu_id="abc123", library="default")
mgr.rename_ceshu(library="default", ceshu_id="abc123", new_name="新名称")
new_model = mgr.duplicate_ceshu(library="default", ceshu_id="abc123")

# 列表（带 mtime 缓存）
ceshu_list = mgr.list_ceshu(library="default", keyword="RPG")
recent = mgr.get_recent_ceshus(library="default", count=5)

# 版本管理（P8）
new_version = mgr.derive_version(library="default", parent_ceshu_id="abc123",
                                  version_label="v1.1", version_note="数值调整")
versions = mgr.list_versions(library="default", root_ceshu_id="abc123")
mgr.set_active_version(library="default", ceshu_id="def456")

# 导出
mgr.export_ceshu_docx(ceshu_id="abc123", library="default", output="out.docx")
mgr.export_ceshu_pdf(ceshu_id="abc123", library="default", output="out.pdf")
mgr.export_ceshu_pptx(ceshu_id="abc123", library="default", output="out.pptx")
mgr.export_ceshu_markdown(ceshu_id="abc123", library="default", output="out.md")
mgr.export_ceshu_html(ceshu_id="abc123", library="default", output="out.html")
mgr.export_ceshu_excel(ceshu_id="abc123", library="default", output="out.xlsx")

# 导出 .ceshu 文件（含可选版本链）
mgr.export_ceshu(ceshu_id="abc123", library="default",
                output="backup.ceshu", include_version_chain=True)

# 导入
model = mgr.import_ceshu(filepath="backup.ceshu", library="default")
```

### 4.3 CeshuScorer（N4 评分引擎）

```python
from core.ceshu.ceshu_scorer import score_ceshu, grade_label

report = score_ceshu(model)
# report.total_score            # 总分 0-100
# report.structure_score        # 结构分 0-30
# report.content_quality_score  # 质量分 0-40
# report.market_potential_score # 市场分 0-30
# report.grade                  # S/A/B/C/D
# report.chapter_scores         # 各章节评分明细
# report.suggestions            # 改进建议清单
# report.industry_benchmark     # 同行业基准对比
# report.pass_status            # {"structure": True, "quality": False, ...}

print(grade_label(report.grade))  # "S 卓越 — 工业级标杆"
```

### 4.4 ChecklistReport（N11 完备性检查）

```python
from core.ceshu.ceshu_checklist import run_checklist, get_checklist_items, get_items_by_category

report = run_checklist(model)
# report.total_items              # 总检查项（50）
# report.passed                   # 通过数
# report.failed                   # 失败数
# report.warnings                 # 警告数
# report.manual                   # 人工核查数
# report.readiness_score          # 就绪度 0-100
# report.is_production_ready      # 制作就绪（所有 required 项通过）
# report.results                  # 各项详细结果
print(report.summary())  # 文本摘要

# 查询检查项定义
items = get_checklist_items()
project_items = get_items_by_category("项目基础")
```

### 4.5 CeshuDataSync（双向同步）

```python
from core.ceshu.ceshu_data_sync import CeshuDataSync

sync = CeshuDataSync(ceshu_manager=mgr, data_manager=data_mgr,
                    library_manager=lib_mgr, config=config)
sync.set_current_ceshu(ceshu_id="abc123", library="default")

# 方向 1：策划书 systems → 游戏数据结构（动态注册 type_schema）
result = sync.sync_systems_to_data(model, library="default")
# {"added_types": [...], "ensured_keys": [...], "errors": [...]}

# 方向 2：游戏数据条目数 → 策划书 systems[key].config.actual_count
sync.sync_data_to_systems(model, library="default")
```

### 4.6 Changelog（N15 变更日志）

```python
from core.ceshu.ceshu_changelog import generate_changelog, generate_changelog_between

# 两个版本之间的变更条目
entry = generate_changelog_between(old_model, new_model,
                                    version_label="v1.1", author="张三")
print(entry.summary)        # "新增 5 / 删除 2 / 修改 3（共 10 处）"
print(entry.changes)        # 变更明细列表

# 完整版本链的变更日志
versions = mgr.list_versions(library="default", root_ceshu_id="abc123")
changelog = generate_changelog(versions, mgr, library="default")
print(changelog.to_markdown())  # Markdown 格式
print(changelog.to_html())      # HTML 格式
```

### 4.7 FieldDependencies（N14 字段依赖）

```python
from core.ceshu.field_dependencies import (
    FIELD_DEPENDENCIES, check_field_dependencies,
    build_dependency_graph, get_chapter_violation_summary,
)

# 检查所有字段依赖
results = check_field_dependencies(model)
# [{"dependency": FieldDependency, "status": "ok"/"violation"/"warning", "message": "..."}]

# 构建依赖图（邻接表）
graph = build_dependency_graph()  # {"combat": ["systems"], ...}

# 章节级违规汇总（用于 UI 节点着色）
summary = get_chapter_violation_summary(model)  # {"combat": "violation", "systems": "ok"}
```

### 4.8 CustomTemplateManager（N13 自定义模板）

```python
from core.ceshu.custom_template_manager import CustomTemplateManager

tm = CustomTemplateManager(data_root="data")

# 保存当前章节为模板
template_id = tm.save_template(
    category="meta",  # 章节键或 "global"
    name="仙侠 RPG 元信息模板",
    data={"game_name": "","game_type": "RPG", "tags": ["xianxia"]},
    description="适用于仙侠 RPG 项目的元信息模板",
    tags=["xianxia", "rpg"],
    source_game="测试项目",
)

# 列出某分类的模板
templates = tm.list_templates(category="meta")

# 应用模板到章节
tm.apply_template(template_id, model, chapter_key="meta")

# 删除模板
tm.delete_template(template_id)
```

---

## 五、扩展指南

### 5.1 如何添加新章节

以添加「第十九章·运营计划」为例：

#### 步骤 1：定义章节 key 与默认值

在 [ceshu_model.py](../src/core/ceshu/ceshu_model.py) 中：

```python
# 1. 添加到 CHAPTER_KEYS
CHAPTER_KEYS = [
    "meta", "vision", "worldview", "gameplay",
    "systems", "numeric", "art", "tech", "resources",
    "market_analysis", "characters", "combat", "economy",
    "monetization", "mvp", "risk_handling", "audio", "accessibility",
    "liveops",  # ← 新增
]

# 2. 添加中文标签
CHAPTER_LABELS["liveops"] = "第十九章·运营计划"

# 3. 定义必填字段
CHAPTER_REQUIRED_FIELDS["liveops"] = ["season_plan", "activity_plan"]

# 4. 定义默认值函数
def _default_liveops() -> dict:
    return {
        "season_plan": "",       # 赛季规划
        "activity_plan": "",     # 活动规划
        "content_roadmap": [],   # 内容路线图
    }

# 5. 在 CeshuModel dataclass 添加字段
@dataclass
class CeshuModel:
    # ... 既有字段
    liveops: dict = field(default_factory=_default_liveops)

# 6. 在 to_dict / from_dict 中添加序列化
# 7. 在 _migrate_v4_to_v5 中添加迁移逻辑（如需要）
```

#### 步骤 2：添加 UI 表单

在 [chapter_forms.py](../src/ui/ceshu/chapter_forms.py) 中新增 `ChapterLiveopsForm` 类，参照既有表单实现。

#### 步骤 3：注册到章节面板

在 [chapter_panel.py](../src/ui/ceshu/chapter_panel.py) 中注册新表单类。

#### 步骤 4：更新评分与检查清单

- 在 [ceshu_scorer.py](../src/core/ceshu/ceshu_scorer.py) 的 `CHAPTER_WORD_BENCHMARK` 添加字数基准
- 在 [ceshu_checklist.py](../src/core/ceshu/ceshu_checklist.py) 添加检查项

#### 步骤 5：更新导出器

6 个导出器都基于 `CHAPTER_KEYS` 自动渲染，无需修改（除非需要特殊格式）。

### 5.2 如何添加新导出格式

以添加 JSON 导出为例：

#### 步骤 1：创建导出器文件

```python
# src/core/ceshu/ceshu_json_exporter.py
from pathlib import Path
import json
from .ceshu_model import CeshuModel

def export_ceshu_to_json(model: CeshuModel, output_path: str) -> str:
    """导出策划书为 JSON 文件"""
    out = Path(output_path).with_suffix(".json")
    out.parent.mkdir(parents=True, exist_ok=True)
    with open(out, "w", encoding="utf-8") as f:
        json.dump(model.to_dict(), f, ensure_ascii=False, indent=2)
    return str(out)
```

#### 步骤 2：在 CeshuManager 添加导出方法

```python
# src/core/ceshu/ceshu_manager.py
def export_ceshu_json(self, ceshu_id: str, library: str, output: str) -> str:
    from .ceshu_json_exporter import export_ceshu_to_json
    model = self.get_ceshu(ceshu_id, library)
    out_path = export_ceshu_to_json(model, output)
    self._logger.info(f"策划书已导出为 JSON: {out_path}")
    return out_path
```

#### 步骤 3：在 UI 添加导出按钮

在 [editor_view.py](../src/ui/ceshu/editor_view.py) 的导出菜单中添加新格式选项，调用 `mgr.export_ceshu_json(...)`。

### 5.3 如何添加新 AI 功能

AI 功能通过 [CeshuSkill](../src/core/agent/skills/ceshu_skill.py) 的 `action` 参数路由。
CeshuSkill 的方法按职责拆分在四个 mixin 中（`ceshu_skill_data` / `_generate` / `_prompt` / `_review`，
共享状态与签名见 `ceshu_skill_state.py`），`ceshu_skill.py` 只保留类属性、`PARAMS_SCHEMA` 与 `execute` 入口，
新增功能时按归属写到对应 mixin。

#### 步骤 1：在 CeshuSkill 注册新 action

```python
# src/core/agent/skills/ceshu_skill.py（类属性 PARAMS_SCHEMA 的 action 枚举）
ACTIONS = (
    "list", "get", "create", "update", "delete",
    "export", "import",
    "ai_fill_field", "ai_fill_chapter",
    "ai_review_full", "ai_review",
    "ai_generate", "ai_generate_full",
    "ai_translate",  # ← 新增：AI 翻译
)

def execute(self, params, context, logger):
    action = params.get("action", "")
    # ...
    elif action == "ai_translate":
        return self._ai_translate(params, context, logger)

def _ai_translate(self, params, context, logger):
    """AI 翻译策划书到目标语言"""
    ceshu_id = params["ceshu_id"]
    target_lang = params["target_language"]
    # 调用 LLM 实现...
    return {"success": True, "data": {"translated_content": "..."}}
```

#### 步骤 2：添加 UI 入口

参照 [ai_review_dialog.py](../src/ui/ceshu/ai_review_dialog.py) 创建 `_AITranslateWorker(QThread)` 与对话框，使用后台线程避免阻塞 UI。

#### 步骤 3：注册快捷键（可选）

在 [editor_view.py](../src/ui/ceshu/editor_view.py) 的 `_setup_shortcuts` 中添加：

```python
self._shortcut_translate = QShortcut(QKeySequence("Ctrl+Shift+T"), self)
self._shortcut_translate.activated.connect(self._on_ai_translate)
```

#### AI 数据生成（ai_generate_data）实现要点

“AI 数据生成”（N20，策划书数值/系统章 → 候选数据 → 预览勾选 → 人工导入）在 [ceshu_skill.py](../src/core/agent/skills/ceshu_skill.py) 的 `execute` 分支注册（action 枚举含 `ai_generate_data`），实现位于 [ceshu_skill_generate.py](../src/core/agent/skills/ceshu_skill_generate.py) 的 `_ai_generate_data`：

- **上下文**：prompt 携带 `meta`（游戏名/类型/定位）、`numeric`（核心公式/平衡原则/经济模型）、`systems`（启用的游戏系统名）作为生成设定背景。
- **入参**：`data_types`（数据类型键名列表，单复数均可）、`count`（每类条数，默认 5，上限 20）、`instruction`（补充要求）。
- **输出**：`{"success": True, "data": {"candidates": {复数键: [items]}, "generated_counts": {...}}}`——`candidates` 以复数数据类键为 key，`generated_counts` 记录每类实际生成条数。
- 返回的候选数据仅回传给 UI（[ai_data_generate_dialog.py](../src/ui/ceshu/ai_data_generate_dialog.py)）预览勾选，经人工确认后写入 DataManager，不做自动导入。

### 5.4 如何添加新校验规则

#### 步骤 1：在 CeshuModel.validate() 添加规则

```python
# src/core/ceshu/ceshu_model.py
def validate(self) -> list:
    errors = []
    # ... 既有规则

    # 新增规则：检查 art.animation 与 tech.engine 协同
    animation = self.art.get("animation", "")
    engine = self.tech.get("engine", "")
    if animation and engine:
        if "骨骼" in animation and "Unity" not in engine:
            errors.append(
                f"一致性警告：第七章 art.animation='{animation}' "
                f"建议使用 Unity 引擎，当前 engine='{engine}'"
            )
    return errors
```

#### 步骤 2：（可选）添加字段依赖

如果新规则涉及跨章节字段依赖，在 [field_dependencies.py](../src/core/ceshu/field_dependencies.py) 的 `FIELD_DEPENDENCIES` 列表添加：

```python
FieldDependency(
    source_chapter="art",
    source_field="animation",
    target_chapter="tech",
    target_field="engine",
    dependency_type=DEP_TYPE_REFERENCE,
    description="美术动画方案应与引擎选型匹配",
    check_rule=None,  # 在 validate() 中已实现
),
```

#### 步骤 3：（可选）添加完备性检查项

在 [ceshu_checklist.py](../src/core/ceshu/ceshu_checklist.py) 的 `_build_checklist_items()` 添加：

```python
ChecklistItem(
    id="GD-13",
    category=CATEGORY_DESIGN,
    title="动画方案与引擎匹配",
    description="骨骼动画建议使用 Unity/Unreal",
    required=False,
    auto_check="check_art_animation_engine",  # 自动检查函数名
    chapter_key="art",
),
```

并实现对应的 `check_art_animation_engine` 函数，注册到 `_AUTO_CHECK_REGISTRY`。

#### 步骤 4：编写单元测试

```python
# tests/test_ceshu_v5.py
def test_art_animation_engine_consistency():
    """新规则：骨骼动画应使用 Unity"""
    from core.ceshu import CeshuModel
    m = CeshuModel()
    m.art["animation"] = "骨骼动画"
    m.tech["engine"] = "Unreal"
    errors = m.validate()
    assert any("animation" in e for e in errors)
```

---

## 六、测试指南

### 6.1 测试组织

```
tests/
├── test_ceshu_model.py          # CeshuModel 单元测试
├── test_ceshu_v5.py             # v5.0 工业级升级测试
├── test_ceshu_integration.py    # 集成测试
└── e2e/
    └── test_ceshu_workflow.py   # 端到端工作流
```

### 6.2 单元测试

**核心层测试（不依赖 PyQt6）：**

```bash
# 运行所有 ceshu 单元测试
pytest tests/test_ceshu_model.py tests/test_ceshu_v5.py -v

# 运行特定测试
pytest tests/test_ceshu_v5.py::test_v4_to_v5_migration -v
```

**测试覆盖范围：**

- 18 章结构与字段定义
- v4→v5 数据迁移
- to_dict / from_dict 往返一致性
- 系统依赖检查（`check_system_dependencies`）
- 混合玩法预设（`find_preset` / `get_recommended_systems`）
- 章节间一致性校验（11 项规则）
- CeshuDataSync 双向同步
- 评分引擎（`score_ceshu`）
- 完备性检查（`run_checklist`）
- 字段依赖（`check_field_dependencies`）
- 变更日志生成
- 6 种导出格式

### 6.3 集成测试

```bash
pytest tests/test_ceshu_integration.py -v
```

覆盖：

- CeshuManager CRUD 全流程
- 版本管理（派生 / 激活 / 对比）
- 模板加载与应用
- CeshuDataSync 事件驱动同步
- AI 调用（mock LLM）

### 6.4 端到端测试

```bash
pytest tests/e2e/test_ceshu_workflow.py -v
```

模拟用户完整工作流：

1. 新建策划书
2. 编辑章节
3. 启用系统
4. 校验
5. 评分
6. 派生版本
7. 导出

### 6.5 编写测试的规范

```python
"""测试文件头部：模块 docstring 说明覆盖范围"""
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).resolve().parent.parent / "src"))

def test_xxx():
    """测试说明：用一句话描述被测行为"""
    # Given: 准备测试数据
    from core.ceshu import CeshuModel
    m = CeshuModel()
    m.meta["game_name"] = "测试游戏"

    # When: 执行被测操作
    progress = m.chapter_progress()

    # Then: 断言结果
    assert 0 <= progress["total"] <= 1
    assert "meta" in progress
```

---

## 七、代码质量标准

### 7.1 文件规范

- **核心层零 PyQt6 依赖**：`ceshu_model.py` / `ceshu_scorer.py` / `ceshu_checklist.py` / `ceshu_changelog.py` / `field_dependencies.py` / `custom_template_manager.py` 必须纯 Python
- **UI 层文件单文件不超过 800 行**：超过应拆分（参考 `chapter_forms.py` 的多类聚合模式）
- **类型注解**：所有公共方法必须带类型注解，使用 `from __future__ import annotations`
- **docstring**：模块级 docstring 描述职责与设计原则；公共类/函数必须有 docstring

### 7.2 命名规范

| 类型 | 规范 | 示例 |
|------|------|------|
| 模块文件 | `ceshu_<功能>.py` 蛇形 | `ceshu_docx_exporter.py` |
| 类 | `PascalCase` | `CeshuModel` / `ChapterScore` |
| 函数 | `蛇形` | `score_ceshu` / `run_checklist` |
| 常量 | `UPPER_SNAKE` | `CHAPTER_KEYS` / `SYSTEM_LABELS` |
| 私有 | `_前缀` | `_default_meta` / `_load_compute_diff` |
| 字段名 | `蛇形` | `game_name` / `combat_mode` |

### 7.3 性能要求

- **list_ceshu 缓存**：使用目录签名（mtime + 文件数）缓存扫描结果，避免 O(N²) 重复读盘
- **惰性加载**：模块导入时不立即加载文件（如 `CeshuTemplate` 的 `load_templates(force=False)`）
- **后台线程**：所有 AI 调用必须使用 `QThread`，避免阻塞 UI
- **原子写入**：所有持久化使用 `temp + os.replace` 防止崩溃损坏
- **防循环标志**：`CeshuDataSync._syncing` 避免双向同步死循环

### 7.4 错误处理

- **核心层**：抛出异常，让上层决定如何处理（如 `FileNotFoundError` / `JSONDecodeError`）
- **同步层**：失败不抛异常，仅记录日志（同步是辅助功能，不应阻塞主流程）
- **导出器**：异常向上传播，让 UI 显示错误对话框
- **事件订阅**：`try/except` 包裹，避免事件处理失败影响发布者

### 7.5 提交规范

提交信息遵循 Conventional Commits：

```
feat(ceshu): 新增 N17 章节复制功能
fix(ceshu): 修复 v4→v5 迁移时 characters 章节丢失问题
refactor(ceshu): 抽取导出公用工具到 ceshu_export_common
docs(ceshu): 补充 v5.0 开发者指南
test(ceshu): 添加字段依赖检查的单元测试
```

---

## 八、相关文档

- [策划书使用指南](./ceshu-user-guide.md) — 面向最终用户
- [v5.0 发布说明](./ceshu-release-notes-v5.md) — 功能清单与升级指南
- [总体架构](./architecture.md) — 项目代码结构总览
- [API 参考文档](./api-reference.md) — 核心 API 速查
- [游戏策划书写作指南](./game-design-writing-guide.md) — 写作规范
