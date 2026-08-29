# API 参考文档

> 📌 **这是什么**：核心模块的 import 路径和调用示例，方便二次开发或写插件时快速查找。
> **什么时候用**：写代码时忘了某个类怎么 import、参数是什么。`

本文档描述 GameEditorApp 的核心 API，供插件开发和二次开发参考。

## 核心 API

### CeshuModel（策划书数据模型 v5.0）

> v5.0 工业级 18 章 GDD 数据模型。完整字段定义与扩展指南见 [ceshu-developer-guide.md](./ceshu-developer-guide.md)。

```python
from core.ceshu.ceshu_model import CeshuModel, CHAPTER_KEYS, CHAPTER_LABELS

# 创建新策划书（v5.0 推荐：用 meta 字典而非构造参数）
model = CeshuModel()
model.meta["game_name"] = "游戏名称"
model.meta["game_type"] = "RPG"
model.style = "xianxia"        # v5 风格（可选）
model.module_type = "rpg"      # v5 模块类型（可选）

# 章节操作（18 章：meta/vision/worldview/gameplay/systems/numeric/art/tech/
#          resources/market_analysis/characters/combat/economy/monetization/
#          mvp/risk_handling/audio/accessibility）
model.set_chapter("combat", {"combat_mode": "turn_based", "damage_formula": "atk - def"})
chapter_data = model.get_chapter("combat")

# 游戏系统管理（13 系统）
model.set_system("battle", enabled=True, config={"turn_mode": "turn_based"})
model.add_system("custom_sys", config={"key": "value"})
model.remove_system("custom_sys")
editors = model.compute_enabled_editors()  # 自动计算启用编辑器

# 进度计算（覆盖全部 18 章）
progress = model.chapter_progress()  # {"meta": 1.0, "vision": 0.5, ..., "total": 0.42}

# 校验（16 项一致性检查 + 必填字段 + 系统依赖）
errors = model.validate()

# 自动填充空必填字段（不调用 LLM）
filled_count = model.auto_fill_required()

# 版本管理辅助
model.is_main_version      # True 表示主策划
model.version_display      # "v1.0 (主)★"

# 序列化（自动检测 v4.0 并迁移到 v5.0）
data = model.to_dict()
model = CeshuModel.from_dict(data)
model = CeshuModel.from_json_file("/path/to/ceshu.json")
```

### CeshuManager（策划书管理器 v5.0）

```python
from core.ceshu.ceshu_manager import CeshuManager

mgr = CeshuManager(library_root="data/libraries")

# CRUD
model = mgr.create_ceshu(library="default", template_name="RPG模板",
                         meta={"game_name": "新游戏"})
model = mgr.get_ceshu(ceshu_id="abc123", library="default")
mgr.save_ceshu(model, library="default")
mgr.delete_ceshu(ceshu_id="abc123", library="default")
mgr.rename_ceshu(library="default", ceshu_id="abc123", new_name="新名称")
new_model = mgr.duplicate_ceshu(library="default", ceshu_id="abc123")

# 列表（带 mtime 缓存）
ceshu_list = mgr.list_ceshu(library="default", keyword="RPG")
recent = mgr.get_recent_ceshus(library="default", count=5)

# 版本管理
new_version = mgr.derive_version(library="default", parent_ceshu_id="abc123",
                                  version_label="v1.1", version_note="数值调整")
versions = mgr.list_versions(library="default", root_ceshu_id="abc123")
mgr.set_active_version(library="default", ceshu_id="def456")

# 6 种导出格式
mgr.export_ceshu_docx(ceshu_id="abc123", library="default", output="out.docx")
mgr.export_ceshu_pdf(ceshu_id="abc123", library="default", output="out.pdf")
mgr.export_ceshu_pptx(ceshu_id="abc123", library="default", output="out.pptx")
mgr.export_ceshu_markdown(ceshu_id="abc123", library="default", output="out.md")
mgr.export_ceshu_html(ceshu_id="abc123", library="default", output="out.html")
mgr.export_ceshu_excel(ceshu_id="abc123", library="default", output="out.xlsx")

# 导入/导出 .ceshu 文件（含可选版本链）
mgr.export_ceshu(ceshu_id="abc123", library="default",
                output="backup.ceshu", include_version_chain=True)
model = mgr.import_ceshu(filepath="backup.ceshu", library="default")
```

### 评分与检查（v5.0 新增）

```python
# N4 评分引擎：3 维（结构 30 + 质量 40 + 市场 30 = 100），S/A/B/C/D 五级
from core.ceshu.ceshu_scorer import score_ceshu, grade_label
report = score_ceshu(model)
print(report.total_score, report.grade, report.suggestions)

# N11 50 项完备性检查
from core.ceshu.ceshu_checklist import run_checklist
report = run_checklist(model)
print(report.readiness_score, report.is_production_ready)

# N14 字段依赖检查
from core.ceshu.field_dependencies import check_field_dependencies, build_dependency_graph
results = check_field_dependencies(model)
graph = build_dependency_graph()

# N15 变更日志
from core.ceshu.ceshu_changelog import generate_changelog_between
entry = generate_changelog_between(old_model, new_model, version_label="v1.1")
```

### 常量与预设（v5.0 新增）

```python
from core.ceshu import (
    CHAPTER_KEYS, CHAPTER_LABELS,                    # 18 章
    SYSTEM_LABELS, SYSTEM_CONFIG_SCHEMA,             # 13 系统
    SYSTEM_DEPENDENCIES, MODULE_SYSTEM_RECOMMENDATIONS,
    HYBRID_GAMEPLAY_PRESETS,                         # 18 预设 / 12 模块
    find_preset, get_preset_by_key, get_recommended_systems,
    check_system_dependencies, get_reverse_dependencies,
)

# 18 个混合玩法预设匹配
preset = find_preset("xianxia", "rpg")  # 仙侠 RPG
core, optional = get_recommended_systems("mmorpg")
missing = check_system_dependencies(["battle"])  # 检测缺失依赖
```

### CeshuDataSync（双向同步 v5.0）

```python
from core.ceshu.ceshu_data_sync import CeshuDataSync

sync = CeshuDataSync(ceshu_manager=mgr, data_manager=data_mgr,
                    library_manager=lib_mgr, config=config)
sync.set_current_ceshu(ceshu_id="abc123", library="default")

# 方向 1：策划书 systems → 游戏数据结构
result = sync.sync_systems_to_data(model, library="default")

# 方向 2：游戏数据条目数 → 策划书 systems[key].config.actual_count
sync.sync_data_to_systems(model, library="default")
```

### TypeSchema（类型 Schema）

```python
from core.type_schema import TypeSchema, TypeDef, TypeField

schema = TypeSchema.load("/path/to/schema.json")
type_def = schema.get_type("role")
fields = type_def.get_user_fields()
```

### DataManager（数据管理器）

```python
from core.data_manager import DataManager

mgr = DataManager(root_dir="/path/to/data")
record_id = mgr.add_item("roles", {"name": "角色1", "level": 1})
record = mgr.get_item("roles", record_id)
mgr.update_item("roles", record_id, {"level": 5})
mgr.delete_item("roles", record_id)
results = mgr.search_items("roles", "搜索词")
```

## Agent Skill API

### BaseSkill（技能基类）

```python
from core.agent.skill_protocol import BaseSkill

class MySkill(BaseSkill):
    NAME = "my_skill"
    DESCRIPTION = "我的技能描述"
    
    def execute(self, params: dict, context: dict, logger) -> dict:
        # 实现技能逻辑
        return {"status": "success", "data": result}
```

### ToolDispatcher（工具调度器）

```python
from core.agent.dispatcher import ToolDispatcher

dispatcher = ToolDispatcher()
dispatcher.discover_skills()  # 自动发现技能
result = dispatcher.dispatch("my_skill", {"param": "value"}, context)
```

## UI API

### 主题系统

```python
from ui.themes import theme_color, apply_theme

color = theme_color("accent")  # 获取主题颜色
apply_theme("dark")  # 应用主题
```

### EventBus（事件总线）

```python
from common.event_bus import EventBus

EventBus.emit("chapter_changed", {"chapter": "overview"})
EventBus.on("chapter_changed", handler)
```

## 安全 API

### Sandbox（代码沙箱）

```python
from security.sandbox import get_sandbox

sandbox = get_sandbox()
result = sandbox.execute("python", "print('hello')", timeout=10)
```

### ACL（访问控制）

```python
from security.acl import ACL, RiskLevel

acl = ACL()
acl.set_max_risk(RiskLevel.FILE_SYSTEM)
if acl.check("file.read", "/path/to/file"):
    # 允许操作
```
