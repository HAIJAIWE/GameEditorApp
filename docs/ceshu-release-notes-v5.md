# 策划书 v5.0 发布说明

> 📌 **这是什么**：策划书模块 v5.0 工业级 GDD 系统的完整发布说明，记录版本亮点、7 轮迭代功能、技术改进、升级指南与已知限制。
> **什么时候用**：从 v4 升级到 v5 时查阅，或了解 v5.0 全部新功能时阅读。

> 版本: v5.0 | 发布日期: 2026-07-05 | 上一版本: v4.0（九章结构）

---

## 一、版本亮点

v5.0 是策划书模块有史以来最大的一次升级，从「九章基础 GDD」跨越到「工业级 18 章 GDD」，覆盖从立项到制作落地的完整链路。

### 核心数据

| 指标 | v4.0 | v5.0 | 增量 |
|------|------|------|------|
| 章节数 | 9 | 18 | +9 |
| 游戏系统配置 | 6 | 13 | +7 |
| 导出格式 | 2（docx/markdown） | 6（docx/pdf/pptx/md/html/xlsx） | +4 |
| AI 动作 | 4 | 9 | +5 |
| 校验规则 | 5 | 16 | +11 |
| 完备性检查项 | 0 | 50 | +50 |
| 混合玩法预设 | 0 | 18 | +18 |
| 模块推荐类型 | 0 | 12 | +12 |
| 字段依赖条目 | 0 | ≥15 | +15 |
| 核心模块文件 | 12 | 18 | +6 |
| UI 模块文件 | 18 | 28 | +10 |

### 三大跨越

1. **结构工业级**：补齐市场分析、角色、战斗、经济、商业化、MVP、风险、音频、可达性 9 大工业必备章节
2. **流程闭环化**：评分→完备性检查→字段依赖→版本对比→变更日志，形成可交付的完整生产链
3. **AI 深度嵌入**：从「字段级补全」升级到「5 维评审 + 一键完整生成 + 章节级专业审查」

---

## 二、7 轮迭代功能清单

### 第 1 轮：工业级框架重构（基础）

| 编号 | 功能 | 简要说明 |
|------|------|----------|
| — | 18 章新结构 | 在原 9 章基础上新增 9 章（`market_analysis`/`characters`/`combat`/`economy`/`monetization`/`mvp`/`risk_handling`/`audio`/`accessibility`），全部录入 [CHAPTER_KEYS](../src/core/ceshu/ceshu_model.py) 与 [CHAPTER_LABELS](../src/core/ceshu/ceshu_model.py) |
| — | 13 游戏系统配置 | 新增 7 个系统配置 Schema（`equipment`/`quest`/`social`/`economy`/`growth`/`gacha`/`competitive`），见 [SYSTEM_CONFIG_SCHEMA](../src/core/ceshu/ceshu_constants.py) |
| — | 系统硬依赖 | `SYSTEM_DEPENDENCIES` 定义依赖关系（如 `battle` 依赖 `character` + `skill`），缺失时自动告警 |
| — | 18 混合玩法预设 | `HYBRID_GAMEPLAY_PRESETS` 覆盖仙侠 RPG、武侠 SLG、科幻 FPS 等主流组合，支持风格/模块双向匹配 |
| — | 12 模块推荐 | `MODULE_SYSTEM_RECOMMENDATIONS` 按 `module_type` 推荐 core_systems + optional_systems |
| — | v4→v5 自动迁移 | `CeshuModel.from_dict()` 检测 `version=="4.0"` 并触发 `_migrate_v4_to_v5()`，旧字段映射到新章节 |

### 第 2 轮：评分与高级导出

| 编号 | 功能 | 简要说明 |
|------|------|----------|
| **N4** | 评分引擎 | [ceshu_scorer.py](../src/core/ceshu/ceshu_scorer.py) 提供 3 维评分（结构 30 + 质量 40 + 市场 30 = 100），S/A/B/C/D 五级评级，含行业基准对比与改进建议 |
| **N3** | PPT 导出 | [ceshu_pptx_exporter.py](../src/core/ceshu/ceshu_pptx_exporter.py) 一键生成 18 章演示稿，含封面、目录、章节页 |
| **F5** | PDF 导出 | [ceshu_pdf_exporter.py](../src/core/ceshu/ceshu_pdf_exporter.py) 输出可打印的策划书 PDF |

### 第 3 轮：AI 深度集成

| 编号 | 功能 | 简要说明 |
|------|------|----------|
| **N6** | AI 5 维评审 | [ai_review_dialog.py](../src/ui/ceshu/ai_review_dialog.py) 从完备性/一致性/市场/技术/创意 5 维度生成评审报告，QThread 异步调用避免 UI 阻塞 |
| **N10** | AI 一键完整生成 | [ai_full_generate_dialog.py](../src/ui/ceshu/ai_full_generate_dialog.py) 输入游戏概念即可批量生成全部 18 章，支持风格/模块参数化 |

### 第 4 轮：版本管理

| 编号 | 功能 | 简要说明 |
|------|------|----------|
| **N1** | 版本对比 | [version_diff_dialog.py](../src/ui/ceshu/version_diff_dialog.py) 选择两个版本高亮显示章节级差异 |
| **N7** | 版本时间线 | [version_timeline_dialog.py](../src/ui/ceshu/version_timeline_dialog.py) 可视化展示版本链路，点击节点查看版本说明与进度 |
| **N15** | 变更日志 | [ceshu_changelog.py](../src/core/ceshu/ceshu_changelog.py) 自动生成两版本之间的变更条目，支持 Markdown/HTML 输出 |

### 第 5 轮：完备性与依赖

| 编号 | 功能 | 简要说明 |
|------|------|----------|
| **N11** | 50 项完备性清单 | [ceshu_checklist.py](../src/core/ceshu/ceshu_checklist.py) 6 大类共 50 项检查（项目基础/章节完备/系统配置/数值/美术音效/商业化），输出就绪度评分 |
| **N14** | 字段依赖图 | [field_dependencies.py](../src/core/ceshu/field_dependencies.py) 跨章节字段依赖表（≥15 条），支持一致性/派生/引用三种依赖类型，UI 节点着色显示违规 |

### 第 6 轮：模板与笔记

| 编号 | 功能 | 简要说明 |
|------|------|----------|
| **N13** | 自定义模板 | [custom_template_manager.py](../src/core/ceshu/custom_template_manager.py) 保存当前章节为可复用模板，按章节分类管理 |
| **N8** | 章节笔记 | [chapter_notes.py](../src/ui/ceshu/chapter_notes.py) 为每章附加独立笔记，支持多笔记、时间戳、按章查看 |

### 第 7 轮：导出扩展

| 编号 | 功能 | 简要说明 |
|------|------|----------|
| **N9** | Markdown 导出 | [ceshu_markdown_exporter.py](../src/core/ceshu/ceshu_markdown_exporter.py) 输出含目录锚点、表格化 systems、校验报告附录的 .md 文件，适合 Git 版本控制 |
| **N12** | HTML 导出 | [ceshu_html_exporter.py](../src/core/ceshu/ceshu_html_exporter.py) 输出带样式的单文件 HTML，支持折叠章节 |
| **N16** | Excel 导出 | [ceshu_excel_exporter.py](../src/core/ceshu/ceshu_excel_exporter.py) 把 18 章字段平铺为多 sheet 表格，便于协作审阅 |

---

## 三、技术改进

### 3.1 代码质量

- **核心层零 PyQt6 依赖**：`ceshu_model.py` / `ceshu_scorer.py` / `ceshu_checklist.py` / `ceshu_changelog.py` / `field_dependencies.py` / `custom_template_manager.py` 全部为纯 Python，可独立单元测试
- **单一事实来源**：[CeshuModel](../src/core/ceshu/ceshu_model.py) 是 18 章数据唯一来源，所有模块通过 `model.get_chapter(key)` 读取
- **事件驱动同步**：[CeshuDataSync](../src/core/ceshu/ceshu_data_sync.py) 通过 EventBus 订阅 `ceshu_changed` / `data_changed` / `library_switched`，实现策划书↔游戏数据双向同步
- **原子写入**：所有持久化操作使用 `temp + os.replace` 防止崩溃损坏
- **类型注解**：新增模块全部使用 `from __future__ import annotations` 与 `dict | None` 现代 Python 语法

### 3.2 性能

- **mtime 缓存**：`CeshuManager.list_ceshu()` 使用文件 mtime 缓存，避免重复扫描
- **QThread 异步**：所有 AI 调用（N6/N10）走 QThread，UI 不卡顿
- **惰性校验**：`validate()` 仅在保存或显式调用时执行，编辑过程不阻塞
- **字段依赖图缓存**：`build_dependency_graph()` 结果可缓存，不每次重建

### 3.3 测试覆盖

新增测试文件 [tests/test_ceshu_v5.py](../tests/test_ceshu_v5.py)，覆盖：

- 18 章结构 & v4→v5 自动迁移
- 系统依赖检查（含反向依赖）
- 18 个混合玩法预设结构 & 匹配
- 12 模块系统推荐
- 章节间一致性校验（combat↔battle、monetization↔economy）
- CeshuDataSync 双向同步
- docx 导出（含全 18 章验证）

### 3.4 安全

- **原子文件写入**：所有 `.json` / `.docx` / `.pdf` 写入均通过临时文件 + `os.replace`
- **路径校验**：所有用户输入路径经过 `Path.resolve()` 校验，防止目录穿越
- **模板隔离**：自定义模板存储于独立目录，与系统模板分离

---

## 四、升级指南（v4 → v5 迁移）

### 4.1 自动迁移（推荐）

打开 v4.0 的 `ceshu.json` 时，`CeshuModel.from_dict()` 会自动检测 `version=="4.0"` 并执行 `_migrate_v4_to_v5()`，无需手动干预。

字段映射规则：

| v4 旧字段 | v5 新位置 | 说明 |
|-----------|-----------|------|
| `vision.competitive_analysis` | `market_analysis.competitors` | 竞品分析独立成章 |
| `vision.business_model` | `monetization.payment_model` | 商业模式独立成章 |
| `worldview.character_network` | `characters.npc_list` | 角色网络独立成章 |
| `systems.battle` | `combat`（同时保留在 systems） | 战斗设计独立成章 |
| `tech.milestones` | `mvp.milestones` | MVP 独立成章 |
| `resources.risk_matrix` | `risk_handling.risks` | 风险管理独立成章 |
| `resources.localization` | `accessibility.localization` | 可达性独立成章 |
| `audio`（v4 无） | `audio`（v5 默认创建） | 音频章节默认空 |

迁移完成后 `version` 自动设为 `"5.0"`，保存即生效。

### 4.2 手动迁移

如需手动控制迁移过程：

```python
from core.ceshu.ceshu_model import CeshuModel

# 读取 v4 数据
v4_data = json.load(open("old_ceshu.json", encoding="utf-8"))

# 自动迁移
model = CeshuModel.from_dict(v4_data)
assert model.version == "5.0"

# 自动补齐空必填字段（不调用 LLM）
filled = model.auto_fill_required()
print(f"已自动填充 {filled} 个必填字段")

# 保存
model.to_json_file("new_ceshu_v5.json")
```

### 4.3 代码层迁移

如果你的代码引用了 v4 的旧 API：

| v4 旧 API | v5 新 API |
|-----------|-----------|
| `CeshuModel(title=, game_type=)` | 保留兼容，但建议改为 `CeshuModel()` 后 `m.meta["game_name"]=` |
| `model.set_chapter("overview", ...)` | 改为 `model.set_chapter("meta", ...)` |
| `get_chapter_dependencies("combat")` | 使用 [field_dependencies.py](../src/core/ceshu/field_dependencies.py) 的 `FIELD_DEPENDENCIES` |
| `export_markdown_chapters()` | 改为 `mgr.export_ceshu_markdown(...)` |

### 4.4 升级检查清单

升级后建议执行：

1. 打开所有 v4 策划书，确认 `version` 自动变为 `"5.0"`
2. 检查 `market_analysis` / `monetization` / `characters` / `combat` 等新章节是否已填充迁移数据
3. 运行 `model.validate()` 确认无错误
4. 运行 `run_checklist(model)` 检查就绪度
5. 运行 `score_ceshu(model)` 查看新评分

---

## 五、已知限制

### 5.1 功能限制

| 限制 | 说明 | 规避方案 |
|------|------|----------|
| AI 评审依赖外部 LLM | N6/N10 需配置可用的 LLM 后端，否则无法使用 | 在 `config.yaml` 配置 `llm.api_key` |
| PDF 导出依赖 reportlab | 未安装 reportlab 时 PDF 导出失败 | `pip install reportlab` |
| Excel 导出依赖 openpyxl | 未安装 openpyxl 时 Excel 导出失败 | `pip install openpyxl` |
| 版本对比仅支持章节级 | N1 当前高亮到章节级别，不支持字段级 diff | 后续 v5.1 计划支持 |
| 字段依赖表为静态 | N14 的依赖关系硬编码在源码中，不支持动态配置 | 后续 v5.1 计划改为 JSON 配置 |
| 评分基准按 game_type | INDUSTRY_BENCHMARKS 仅覆盖主流类型，小众类型退化为通用基准 | 在 [ceshu_scorer.py](../src/core/ceshu/ceshu_scorer.py) 手动添加 |

### 5.2 兼容性限制

- **不支持 v3 及更早版本直接迁移**：v3 数据需先升级到 v4，再升级到 v5
- **不支持 v5 回退到 v4**：迁移是单向的，v5 数据无法降级
- **自定义模板格式变化**：v4 自定义模板需重新保存为 v5 格式

### 5.3 性能限制

- **大型策划书（>500KB）校验较慢**：`validate()` 在含大量 systems 配置时可能耗时 1-2 秒
- **AI 一键生成耗时较长**：N10 生成 18 章预计 3-8 分钟，取决于 LLM 响应速度

---

## 六、相关文档

- [策划书用户指南](./ceshu-user-guide.md) — 面向用户的功能说明与操作指引
- [策划书开发者指南](./ceshu-developer-guide.md) — 面向开发者的架构与 API 文档
- [策划书写作指南](./game-design-writing-guide.md) — 章节写作规范与示例
- [总体架构](./architecture.md) — 项目整体架构概览
- [API 参考文档](./api-reference.md) — 核心 API 速查
