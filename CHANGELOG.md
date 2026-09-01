# 更新日志

## [Unreleased] - 2026-09-01

### 修复

- **工作区删除后残留空库目录**：`WorkspaceManager.delete_workspace()` 只移除「库目录/.workspace/」，把空的库目录壳永久留在 `data/libraries/` 下（反复出现的 `test_project` 空目录即由此产生）。删除后若库目录已空则一并回收；仍含业务数据（如 `ceshu/`）的库不受影响
- **集成测试从不清理测试库**：`TestLibrarySwitch` 把 `_test_lib` / `_original_active` 等状态存在 `self` 上，而 unittest 为每个测试方法新建实例，导致 `test_03`（切回原库）永远被 skip、`test_04`（清理测试库）永远提前 return 空跑，`界面测试_*` 库永久残留。改为类属性共享状态，并新增磁盘残留断言
- **`test_workspace.py` 从未被执行**：该文件是脚本（模块级代码、无 `test_` 函数），pytest 收集结果为 0 tests，其中的断言一直未纳入 CI。已改写为 16 个正式用例，并通过 monkeypatch 把操作隔离到 tmp_path，不再污染 `data/libraries/`

### 测试

- `tests/unit/test_workspace.py`：0 → 16 个用例，覆盖工作区创建/切换/列表/统计/删除、空壳回收、含数据保留，以及 Memory 提炼与偏好推断
- `tests/integration/test_frontend_critical.py`：修 lint 15 处（无占位符 f-string、歧义变量名 `l`）

## [Unreleased] - 2026-08-29

### 代码库重构（可读性与可维护性）

仅内部结构调整，外部行为不变。每处改动均通过等价验证（AST 快照比对 / 多场景冒烟对比）与全量回归（单测 667 + 集成 97）。

**数据外置**（逻辑与数据分离）
- `core/library_manager.py`：1840 → 737 行，初始样本数据外置到 `src/data/sample_data.py`
- `ui/ceshu/chapter_templates.py`：965 → 170 行，18 章模板数据外置到 `src/data/chapter_templates_data.py`

**巨型方法拆分**
- `core/defaults/rpg_schema.py`：748 行单函数 → 12 个类型构建函数
- `core/ceshu/ceshu_checklist.py`：235 行单方法 → 6 个分类构建函数
- `features/_ai_dialog.py`：`generate_content` 376 → 85 行（拆 6 个纯构造方法）
- `core/agent/skills/ceshu_skill.py`：`_ai_generate` 253 → 178 行（三批生成循环去重）
- `ui/dialogs/type_editor_dialog.py`：`setup_ui` 161 → 20 行（拆 4 个面板构建方法）
- `ui/ai_assistant_tab.py`：`_do_show_question` 139 → 62 行
- `core/agent/brain.py`：`_build_system_prompt` 117 → 28 行

**其他**
- Python 版本要求统一为 3.14（pyproject / Dockerfile / 文档）
- 全量 ruff 清理：908 处 + `--unsafe-fixes` 284 处（lint 509 → 225）
- `.gitignore` 补充根目录临时文件与备份目录排除规则

### 修复

- **策划书章节表单防崩溃**：AI 生成的章节字段可能返回 dict/list（如 `characters.protagonist={}`），直接渲染会 TypeError 崩溃；新增 `_safe_text()` 并加固 67 处 UI 赋值（`chapter_forms/_base.py` 20 + `_industrial.py` 47），脏数据不再崩溃而是以 JSON 形式显示
- **活跃库回退**：`.active_library` 指向已删除的库时应用启动后无活跃库，现在自动回退到初始库并告警
- **导入索引修复**：`features/export.py` 四种导入统一走 `_finalize_import()`，修复 CSV / Excel 导入漏重建索引导致数据入库但查不到的问题

## [v5.0.0] - 2026-07-05

### 策划书系统工业级升级

从「九章基础 GDD」升级为「工业级 18 章 GDD」，覆盖立项定义→核心设计→数值与系统→制作规范→商业与项目→验证与运营完整链路。完整说明见 [策划书 v5.0 发布说明](docs/ceshu-release-notes-v5.md)。

#### 结构
- **18 章 GDD 结构**：9 基础章（meta/vision/worldview/gameplay/systems/numeric/art/tech/resources）+ 9 工业级章（market_analysis/characters/combat/economy/monetization/mvp/risk_handling/audio/accessibility）
- **13 种游戏系统配置** + 系统硬依赖检查（`SYSTEM_DEPENDENCIES`）
- **18 个混合玩法预设** + 12 模块系统推荐
- **v4→v5 自动迁移**：`CeshuModel.from_dict()` 检测 `version=="4.0"` 自动映射旧字段到新章节

#### 新功能（7 轮迭代）
- **N1 版本对比** / **N7 版本时间线** / **N15 变更日志**：版本管理闭环
- **N3 PPT 导出** / **F5 PDF 导出** / **N9 Markdown 导出** / **N12 HTML 导出** / **N16 Excel 导出**：共 6 种导出格式
- **N4 评分引擎**：3 维评分（结构 30 + 质量 40 + 市场 30 = 100），S/A/B/C/D 五级评级
- **N11 完备性清单**：6 大类 50 项生产就绪检查
- **N14 字段依赖图**：跨章节字段依赖（≥15 条），UI 节点着色显示违规
- **N6 AI 5 维评审** / **N10 AI 一键完整生成**：AI 动作扩展至 9 个
- **N13 自定义模板** / **N8 章节笔记** / 预设市场 / 依赖可视化 / 校验报告 / 章节进度条
- **双向同步**：CeshuDataSync 通过 EventBus 实现策划书↔游戏数据双向同步

#### 技术
- 核心层零 PyQt6 依赖，可独立单元测试
- 原子文件写入（temp + os.replace）、路径校验、模板隔离
- mtime 缓存、QThread 异步 AI 调用、惰性校验

#### 测试
- 新增 tests/test_ceshu_v5.py（109 用例）：18 章结构、v4→v5 迁移、系统依赖（含反向）、混合玩法预设、章节一致性校验

## [v4.0.0] - 2026-06-23

### 工业级改进

#### 新增
- **18 章工业级 GDD 框架**：覆盖 6 个 Phase（立项定义→核心设计→数值与系统→制作规范→商业与项目→验证与运营），每章含字段定义、依赖关系和填写引导
- **AI 一句话生成策划书**：输入一句话想法，自动生成完整 GDD
- **填写路线图**：6 Phase 可视化路线图，显示每章状态和依赖关系
- **章节依赖关系**（depends_on）：标注每章前置依赖，指导正确填写顺序
- **新手引导横幅**：动态引导提示，告诉用户下一步该做什么
- **AI 帮我填按钮**：字段级 AI 辅助，点击即可让 LLM 填充当前字段
- **工业级章节**：market_analysis（市场分析）、characters（角色）、combat（战斗）、economy（经济）、monetization（商业化）、mvp（最小可行产品）、risk_handling（风险）、audio（音频）、accessibility（无障碍）

#### 安全
- ACL 默认风险级别从 SYSTEM 降为 FILE_SYSTEM
- SSRF 防护新增云元数据地址检查
- Shell 白名单收紧，移除 30+ 危险命令，git 改白名单模式
- subprocess 改为列表参数防注入
- 重建 security 模块（encryption/guard/rate_limiter/sandbox）
- 清理 178 处 except pass 异常静默吞噬

#### 测试
- 新增 type_schema/buff_system/equipment_system/security 单元测试（182 个）
- 新增策划书/数据 E2E 工作流测试（40 个）
- CI 新增 e2e job 和覆盖率阈值 40%

#### 部署
- 新增 PyInstaller 打包配置（build.spec + build.py）
- 新增 GitHub Release 工作流（release.yml）
- 新增 Dockerfile

#### 性能
- async_runner: time.sleep → threading.Event + TTL 清理
- rate_limiter: time.sleep → threading.Event
- image_loader: QThread 泄漏 → ThreadPoolExecutor

#### 国际化
- 新增 76 个 i18n 翻译键（中/英）
- main_window/home_view/data_tab 硬编码中文 → i18n.t()

#### 文档
- 新增 API 参考文档（docs/api-reference.md）
- 新增架构文档（docs/architecture.md）
- 更新 README（章节/技能数量说明）

#### 代码清理
- 中文标识符重命名（启动模式对话框 → StartupModeDialog）
- 根目录杂乱文件移到 scripts/ 和 docs/
- 3 个 UI 文件添加无障碍支持

### 修复
- 策划书章节结构不一致（24 错误章节名 → 22 正确）
- template_engine.py 章节数描述和预填字段错误
- PRD 文档数据结构与实际 CHAPTER_KEYS 不一致
- 新建对话框概念混乱（移除无效文档模式、添加解释文案）
- PyInstaller 打包脚本路径错误

## [v3.0.0] - 2026-05-xx

### 核心功能
- GDD 策划书系统（基础框架）
- Agent 技能系统
- 配置表系统（内置 RPG 数据类型）
- PyQt6 桌面应用框架
