# 应用开发：口径、现状与后续规划（2026-11-06）

> **一句话口径**：**一个游戏就是一个应用**。策划书 = 这个应用的开发文档，
> 平台（电脑软件 / 手机软件）是文档的一个属性，而不是另一套系统。
>
> 本文回答三件事：① 已落地的「应用开发」能力是什么；② 为什么这样切；
> ③ 还差什么（真正的规划部分）。
>
> **诚实的边界**：目前「应用」是策划书的**一个档位**（`doc_kind`），不是独立的
> 文档类型。它复用 24 章 / 字段 / AI 生成 / 导出 / 项目文件夹全套骨架——
> 因此**应用档仍带着游戏向的章节**（战斗 / 经济 / 数值…），见第五节开放项。

---

## 一、需求与决策

| 问题 | 决策 | 理由 |
|---|---|---|
| 应用和游戏是什么关系 | **一个游戏 = 一个应用**，不并列、不新建文档类型 | 复用既有骨架，改动最小；用户原话「一个游戏一个应用吧」 |
| 怎么表达「电脑软件 / 手机软件」 | `meta.platform` 多选（`PC` / `移动端` / `主机`），双端可同时勾 | 字段**早已存在**（`ceshuSchema/production/meta.ts`），之前只是没在界面显性化 |
| 应用要不要游戏数据编辑 | **不要** | 角色/怪物/技能/属性对纯工具类应用没有意义；用户原话「应用开发应该不用游戏数据编辑吧」 |
| 怎么区分「游戏」和「应用」 | `meta.doc_kind` 单选 `game` / `application`，缺省 `game` | 老文档零迁移；只有显式 `application` 才降级为应用档 |
| 首页要不要加「新建应用」胶囊 | **不加** | dsh 引导屏 `MAX_DESCRIBED_ENTRIES = 4`，加第 5 枚会收起所有描述、破坏既有视觉契约。档位在编辑器「文档信息」章里选即可 |

---

## 二、已落地（2026-11-06）

### 2.1 平台显性化

- `CeshuSummary` / `CeshuManager.toSummary` 透传 `meta.platform`。
- `ceshuPlatformLabel()`：多平台用 ` · ` 连接（如 `PC · 移动端`），空数组返回空串。
- 首页卡片新增 `home-card-platform` 徽标，与类型/状态徽标并列；未填平台时不显示。
- 样式走令牌（`--border-card` / `--text-secondary` / 0.5px 发丝线），`styleRatchet` 15 项仍恒 0。

### 2.2 文档档位（应用档）

- `meta.doc_kind`：`combo`，`game` / `application`，`aiDraftable: false`，
  `optionLabels` 中文（守卫要求 combo 必带），默认 `game`。
- `getDocKind()` / `needsGameDataEditor()`（`shared/ceshu/model`）：只有显式
  `application` 才降级，脏值 / 缺省一律按游戏档，**避免误伤老文档**。
- `withChapter(doc, 'meta', data)` 保护档位：AI 整章生成会把它列进字段清单，
  漏写或写非法值时保留旧档位；只有用户显式传 `game` / `application` 才允许改。
  （与既有 `gdd_scope` 保护同构。）

### 2.3 应用档不启用游戏数据编辑

**这是需求的核心**。三个消费方共享同一份规则，避免"藏了页签但命令面板还能点"的假入口：

```
hiddenMainViewIdsForDocKind(kind)      ← 规则单点（plugins/context/mainViewVisibility.ts）
  ├─ MainViewMount        从 MainViewContext 直接算 → 页签条过滤 data.mainView
  ├─ App.tsx              写进模块级可见性通道
  └─ CommandPalette       uSES 订阅通道 → ⌘K 枚举里过滤掉 data.mainView
```

- 只在「当前打开的是应用档文档」时隐藏；首页 / 游戏档零变化。
- `docs/window-map.md` P1-2 记过「平衡性分析」假入口的教训，此处按同一标准收干净。

### 2.4 导出 / 导入往返

`config.json` 原本已带 `platform`，本次补 `doc_kind` 并回填。
**老导出的文件夹没有该字段 ⇒ 回填 `game`**，向后兼容；非法值不回填。

```
<所选目录>/<应用名>/
  config.json          # 含 doc_kind / platform / 身份与版本链 / 风格 / 模块…
  design/<章>.md       # 文字设计（人读、可手改）
  data/<章>.json       # 数值 / 表格（保结构）
  tasks/<岗位>.md
  prototype/demo.html  # 可玩原型（单文件 HTML）
```

---

## 三、怎么用

1. 首页「新建空白」创建策划书 → 进入编辑器。
2. 「文档信息」章 → **文档类型**选「应用」；**平台**勾 `PC` / `移动端` / `主机`（可多选）。
3. 保存后：首页卡片显示平台徽标；主区「数据编辑」页签消失，⌘K 里也不再列出。
4. 切回「游戏」即恢复数据编辑。

> 数据落盘位置：`<userData>/libraries/<库名>/ceshu/`（`userData` 默认 Windows
> `%APPDATA%/<应用名>`，可用 `MB_USER_DATA_DIR` 覆盖）。

---

## 四、验收

| 项 | 状态 |
|---|---|
| tsc ×3（web / node / test-dom） | ✅ |
| eslint 全量 | ✅ |
| `styleRatchet` 15 项 / `i18nCoverage` 2 项 | ✅ 恒 0 / 全绿 |
| `ceshuSchema.guard` 字段总数 351 → **352**、`meta` 13 → **14** | ✅ 基线已同步并注明原因 |
| 全量单测 | ✅（见提交记录） |
| 新增测试 | `ceshuDocKind` / `mainViewVisibility` / `ceshuProjectFolder` 往返 / `ceshuModel.withChapter` 保护 / `mainViewMount` 页签 / `commandPaletteView` 假入口 / `ceshuHome` 平台 / `ceshuHomePanel` DOM 徽标 |

---

## 五、开放项（真正的后续规划）

按收益/风险排序，**均未在本次实现**：

| # | 事项 | 说明 | 量级 |
|---|---|---|---|
| 1 | **应用档的章节裁剪** | 24 章里 `combat` / `economy` / `numeric` / `level_design` 等是游戏专属；纯应用档应有一套可见章规则（复用 `visibleChapterKeys` 的档位 × 品类 × 模块三层过滤，再加一维 `docKind`）。目前应用档仍会看到这些章，是最大的口径缺口 | 中 |
| 2 | **AI 提示词按档位分支** | 整章/全量生成的 agent 提示语写死了「游戏策划书」；应用档应换成「应用设计文档」措辞，并跳过不适用章的生成要求 | 中 |
| 3 | **导出模板差异化** | 设计文档 / 交接包 / 岗位任务的标题与角色清单仍是游戏向（如「战斗策划」「数值策划」） | 中 |
| 4 | **首页档位筛选** | 应用和游戏混在「全部策划书」里；可按 `docKind` 加一个筛选开关（参考「只看待审」） | 小 |
| 5 | **新建时直接选档位** | 现在要先建空白再进文档信息章改；可在新建表单加一个「游戏 / 应用」下拉（不动胶囊数量，不破坏 dsh 约束） | 小 |
| 6 | **`platform` 值域语义** | 当前 `PC` / `移动端` / `主机` 是游戏发行口径；「电脑软件 / 手机软件」若需更细（Windows / macOS / iOS / Android / Web）应另立字段，别原地塞值 | 待产品决策 |

> **不建议**：为「应用」新建一套独立文档类型与存储。会同时分裂 schema、导出、
> AI、e2e 四套契约，收益只是命名对齐——与 `docs/ux-simplification-plan.md` 里
> 「开始屏不搬运到右侧栏」是同一类判断。

---

## 六、相关文档

- `docs/ceshu-project-folder.md` —— 项目文件夹规范（设计稿与数值分开存）
- `docs/window-map.md` —— 窗口职责与入口矩阵（假入口判据）
- `docs/ceshu-user-guide.md` —— 策划书使用指南
- `docs/ui-polish-plan.md` —— 前端窗口 UI 打磨计划
