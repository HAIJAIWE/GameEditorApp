# 项目文件夹：一个游戏一个文件夹（2026-10-26）

> 一句话：**策划书的存储单位从「一份 JSON」变成「一个目录」**。
> 新项目从第一刻起就是可读、可交付、可进 git 的目录；老文档保持 JSON 形态不动。

## 为什么改

改动前所有策划书都是 `<库>/<id>.json` 一坨。问题不在存不下，而在**没人能看**：

- 一份 24 章 334 字段的 JSON，策划自己都不会打开看；
- 交付给程序/美术时得先「导出」，导出的还是 md/html 这类只读产物，改不回去；
- 用户的心智模型是「这个游戏的文件夹里放着它的设计文档和数值」——JSON 不符合。

所以「文件夹 = 工作单元」不是存储技巧，是**把产品形状对齐到用户心智**。

## 两套存储：设计文档 vs 游戏数据（别搞混）

「游戏数据是 JSON 吗」这个问题的答案是：**不，游戏数据在 SQLite**。这个应用里有两套完全不同的东西：

| | 存哪 | 装什么 | 量级 |
|---|---|---|---|
| **游戏数据表**（数据编辑器） | SQLite `<库>/mb-editor.db`（WAL）<br>`items(id, type, data, created_at, updated_at)` + type 索引 | 道具/装备/消耗品/任务等**运行时条目**，每条的属性包是 JSON（行内 JSON，不是整表 JSON） | 万行级 |
| **策划书**（设计文档） | 项目文件夹 `design/*.md` + `data/<章>.json` | 设计层面的结构化字段：参数表、公式、账本、掉落设计 | 几十~几百行 |

实测（本机，2026-10-26）：

**游戏数据表（SQLite）**
- 逐条插入 10000 条：413 ms（成批导入走事务会更快），db 文件 2.1 MB
- 按类型列出 2000 条：**2.90 ms**
- 按 id 查 1 条：**0.02 ms**
- 全表 1 万条一次读：13.8 ms

**策划书（项目文件夹）**——把 full 档 334 个字段全填满（文本 300 字、列表 20 行、参数表 50 行）：
- 54 个文件 / **387 KB**
- 改一章并保存：**34 ms**（全量读 + 增量写）
- 单文档 load：5.7 ms；list 全部文档：7.1 ms

### 结论与边界

- **设计文档天生小**：它写的是「为什么这么设计」，不是「第一万把剑攻击力多少」。所以用文件夹 + JSON 完全够，还能手改、能进 git。
- **真要放运行时数值表，别塞进策划书**：走数据编辑器（SQLite）或 CSV/Excel 导入。硬塞进去也能跑，但每次保存会全量重写，几千行以上就该换地方。
- **两处优化（都是压测后改的）**：① `saveProject` 改**增量写**——内容没变的文件不重写（54 个文件里绝大多数是没动过的章），顺带让 mtime 稳定，外部编辑器/git 不会误判「刚改过」；② 岗位任务的「按章清单」把字段值**截断到 120 字**——之前把每个字段全文抄一遍，`tasks/*.md` 占了整个文件夹 44%。
- **两边怎么对上（2026-10-26 打通）**：策划书「技术方案」章的「所需数据表」声明 `表名|用途|关键字段|期望条数`，
  「数据·机读」面板的「设计 ↔ 数据表核对」拿数据编辑器的实际状况去比，报
  「未建表 / 条数不够 / 缺字段 / 空表」。这是「设计文档驱动数据」的最后一公里。
  判据只有一向：**设计说了、数据没有**才报；反向（数据里有一堆设计没提的表）不报——那常常是复用类型或历史数据，报出来只会变噪音。
- **按声明补齐结构（2026-10-26）**：核对面板上多一个「按声明补齐结构」，先出计划（建哪张表、加哪些字段、推定类型与理由），确认后才落盘。
  两条硬边界：**只补结构，不造数据行**（「期望 200 条」不等于让系统灌 200 条空记录）；**不造重复表**
  （声明写「装备表」而库里已有「装备」时复用并补字段，而不是新建一张「装备表」）。
  核对与补齐**共用同一份表名归一**（`resolveDataTable`）——两边口径一旦分叉，就会出现
  「核对说没建表 → 补齐补到已有表上 → 核对还说没建表」的死循环。

### 选 SQLite 还是 JSON？一条判据

| 问题 | 选 SQLite | 选 JSON / 文件夹 |
|---|---|---|
| 一条条记录、要增删改查、上万条 | ✅ | |
| 要按字段查询/排序/统计 | ✅ | |
| 并发写、要事务 | ✅ | |
| 一份文档、要人读、要 git diff | | ✅ |
| 结构经常变、字段随手加 | | ✅ |
| 要能直接用编辑器打开改 | | ✅ |

一句话：**「一堆记录」用 SQLite，「一份文档」用 JSON**。本项目两者都有，且各司其职。

### Excel / CSV 往返（数值策划的主战场）

数值策划的日常工具就是 Excel，所以 `xlsx` 导入导出是一等公民（`exceljs`，按 sheet 名映射数据类型、按业务 id upsert）。

实测「导出 → 改数值 → 加一行 → 导入」：`更新 2 条，新增 1 条`，数值正确落地。

**一条硬规则：`id` 列必须在首列。**
`data.id` 是往返主键，但它创建时是**最后**写进 `data` 的，按 data 键序导出会落到最右列。
放最后 → 策划滚动时看不见 → 容易整列删掉 → 导入时每行都当新条目 ⇒ **整表翻倍**（实测 2 条变 4 条）。
现在导出统一把 `id` 提到首列（`shared/util/recordHeaders.ts`），并且**当某张表完全没有 id 列时，
导入摘要会明确告警**「已全部按新增导入，若本想修改已有数据会变成重复项」——不阻断（从零建表批量新增是合法用法），但绝不静默。

### 导入 = 预览 + 确认（2026-10-26）

导入是**不可撤销的批量写**（撤销栈只记单条），所以不再「选完文件就写库」：

1. `data:previewImport` 解析文件、与库内按 `类型 + data.id` 比对，**不落库**；
2. 面板列出「新增 N / 修改 M / 未变 X / 跳过 Y」与逐条字段级差异（中文标签 + `10 → 35`）；
3. 点「确认导入」才 `data:applyImport` 落库。

解析结果暂存在主进程（`ImportSessionStore`，TTL 10 分钟、一次性消费），
确认时直接用那份结果——不重读文件，避免「预览看到 A、导入写入 B」。
连点两次确认不会写两遍（会话已消费），过期则明确报错让用户重来。

## 目录结构

```
<库>/<ceshu_id>/
  config.json          # 项目配置 + 身份 + 版本链（人可读，可手改）
  design/<章>.md        # 文字设计：text / textarea / combo —— 人读、可手改
  data/<章>.json        # 数值与表格 + 所有 schema 外的扩展字段 —— 结构化不丢
  data/tasks.json       # AI 生成的岗位任务计划（原始结构，往返用）
  tasks/<岗位>.md       # 岗位任务（programmer / artist / …），有 AI 计划就用它，否则回落按章清单
  prototype/demo.html   # 可玩原型（单文件 HTML，AI 生成，双击就能玩）
```

**为什么 design 与 data 分开**：Markdown 存不了 `[{列: 值}]` 这种 pipeList 结构，
硬塞进 md 会丢列名。所以按字段 `kind` 一刀切——文字进 md，其余进 json。

`config.json` 里放的不只是「配置」，还有**身份与版本链**：

```json
{
  "ceshu_id": "a1b2c3d4",
  "version_label": "v1.3",
  "parent_id": "",
  "is_active": true,
  "version_note": "加了经济系统",
  "created_at": "2026-01-02 03:04:05",
  "updated_at": "2026-02-03 04:05:06",
  "game_name": "星海计划",
  "game_type": "SLG",
  "platform": ["PC"],
  "positioning": "…",
  "business_model": "…",
  "gdd_scope": "full",
  "enabled_modules": ["combat"],
  "roles": [{ "key": "programmer", "label": "程序" }]
}
```

少了 `ceshu_id`，同一个文件夹导入两次会变成**两份文档**；少了 `parent_id`/`version_label`，
版本链在往返中静默断掉。这两条是实测踩出来的，不是设计洁癖。

## 三种形态怎么路由

`CeshuStorage.save()` 按「这个 id 现在是什么」决定写哪儿：

| 现状 | 写哪儿 | 说明 |
|---|---|---|
| 已有 `<id>/` 文件夹 | 文件夹，并删掉同 id 的老 `<id>.json` | 文件夹权威；留着 JSON 会分叉，且文件夹被手删后旧内容会「诈尸」 |
| 已有 `<id>.json` | 继续写 JSON | **老文档不强迁**：不静默改写用户文件，JSON 保留全部键；要统一成文件夹用 `scripts/ceshuMigrateFolders.ts` 显式迁移 |
| 两者都没有 | 写文件夹 | 新建 / 复制 / 派生 / 导入——「一个游戏一个文件夹」的落点 |

这条规则让**存量文档零迁移**，同时让**新项目默认就是文件夹**。

## 无损往返

`buildProjectFolder(doc)` / `projectFilesToDoc(files)` 是纯函数对，往返必须无损，否则文件夹
不能当权威存储。两处细节保证这一点：

1. **`data/<章>.json` 收的是「除文字字段之外的全部键」**，不是「已知的结构化字段」。
   schema 之外的扩展字段（早期版本遗留、插件写入）因此有地方落，不会静默消失。
2. **`design/<章>.md` 用 `## 字段标签` 分节**，解析靠「标签 → 字段键」反查，
   多行内容原样保留。

已知边界：md 里以 `## ` 开头的正文行会被当成新分节。正文出现这种行属于罕见情况，
真碰上就是「设计文档里自己写了二级标题」，可接受。

## 导出与打开

- **导出项目文件夹**（`更多 → 导出项目文件夹`）：落点是 `<所选目录>/<游戏名>/`，
  自动建子目录——直接摊在用户选的目录里会和已有文件混在一起。目录名走
  `projectFolderName()`，剔掉 `/ \ : * ? " < > |` 与控制字符，空名回落 `ceshu-<id>`。
- **打开项目文件夹**（首页 `打开项目文件夹…`）：选目录 → 校验 `config.json` 存在 →
  还原文档 → 在本库落地为同 id 文件夹 → 打开。不是项目文件夹就明确报错，
  绝不静默导入一份空文档。

两条路闭环：导出的目录可以原样打开回来，内容不丢。

## 岗位任务：从「按章清单」到「可执行动作」

`tasks/<岗位>.md` 有两种内容，**优先 AI 生成的**：

| 状态 | 内容 | 它是什么 |
|---|---|---|
| 没生成过 | 按 `ROLE_CHAPTERS` 搬运字段 | 「文档里这章写了什么」的索引，**不是任务** |
| 生成过 | `doc.task_plan[岗位]` | 动作：实现/搭建/绘制/配置，带 P0/P1/P2 与依据章 |

旧版只有前者——把「核心循环：探索→战斗→养成」这一行当待办发给程序，他并不知道要写什么代码。

生成走 `ceshu:aiGenerateTasks`：

- **输入**：整份文档的摘要（`buildTaskDigest`）。摘要只喂「和默认值不同」的字段，
  跳过机读数据（账本/断言/用例），单条截断 180 字，总量封顶 8000 字。
  这样空文档不会因为「版本号 0.1.0 / 日期 / 音效数量 0」显得有内容。
- **提示词**（`buildRoleTaskPrompt`）硬约束：动词开头、不许发明文档里没有的系统、
  `source` 只能是给定章 key、每岗 3-8 条、P0/P1/P2 定义写死。
- **解析**（`parseRoleTaskPlan`）只做结构校验：丢掉未知岗位、空标题、非法章（回落到首个可见章）、
  非法优先级（回落 P1）、每岗超 10 条截断。**不用关键词封杀空话**——那会误杀「实现存档系统」。
- **落盘**：`doc.task_plan` → `data/tasks.json`（重新生成要花 token，必须跟着项目走）。
- **成本**：`budget: null`。输入有硬上界、输出是「每岗 3-8 条」，而通道没有 `confirmed`、
  界面也没有确认回路 ⇒ 挂确认门只会抛一个用户无法确认的错误。

离线看提示词（不调模型）：

```bash
cd desktop
npx tsx scripts/ceshuTasks.ts                      # 内置示例文档
npx tsx scripts/ceshuTasks.ts --doc <策划书.json>    # 真实文档
npx tsx scripts/ceshuTasks.ts --apply <ai返回.json>  # 验证解析 + 看 md 产物
```

## 原型：生成完必须落盘

`prototype/demo.html` 是「按设计文档生成的可玩单文件 HTML」。它有两个身份：
**验证工具**（看核心循环跑不跑得通）和**交付物**（发给别人双击就能玩）。

所以生成完立刻 `ceshu:saveDemo` 落盘，而不是只放在界面内存里：

- 面板打开时若 `doc.demo_html` 有值，**直接渲染**，不需要再花钱生成一次；
- 生成后保存失败会**明说**（原型仍显示，但错误要可见）——不能假装成功；
- 空串 = 删掉原型，同时 `prototype/demo.html` 也从磁盘消失（见下面的清理逻辑）。

安全：HTML 放进 `sandbox="allow-scripts"` 的 iframe（**不加 allow-same-origin**），
隔离到唯一源，拿不到宿主 cookie/DOM。

## 写盘时会清掉「不该再存在」的旧产物

`saveProject` 不只是写，还会清 `design/ data/ tasks/ prototype/` 四个目录里
**这次不该再存在**的 `.md/.json/.html`：

- 删掉原型后 `prototype/demo.html` 不能留着，否则下次 `load` 又把它读回来（诈尸）；
- 关掉某个模块后 `design/<章>.md` 不能留着，否则看着像那章还有内容。

**安全边界**：只在这四个子目录里动手，只删这三种扩展名——用户往项目里塞的图片、
脚本、笔记一概不碰（有测试守着）。

## `config.json` 的一个约定

`enabled_modules` 为 `null` 表示「没勾过 = 全部模块启用」，而不是把缺省值物化成 20 项清单。
不这么写的话，一个 lite 项目的 config 会列着 20 个模块，人一看就懵。

## 涉及文件

| 文件 | 职责 |
|---|---|
| `src/shared/ceshuProjectFolder.ts` | `buildProjectFolder` / `projectFilesToDoc` / `parseChapterProse` / `projectFolderName`（纯函数，唯一单源） |
| `src/main/ceshu/storage.ts` | 双形态路由：`load` / `save` / `saveProject` / `importProjectFolder` / `remove` / `listIds` |
| `src/main/ceshu/manager.ts` | `openProjectFolder(sourceDir)`（走写队列） |
| `src/main/ceshu/export/projectFolder.ts` | 落盘到 `<目标>/<游戏名>/` |
| `src/main/ipc/ceshuIpc.ts` | `ceshu:exportProjectFolder` / `ceshu:openProjectFolder` / `ceshu:aiGenerateTasks` / `ceshu:saveDemo` |
| `src/shared/ceshuTaskPrompt.ts` | 摘要 / 提示词 / 解析（纯逻辑） |
| `src/shared/ceshuTasks.ts` | 岗位常量、按章清单、AI 任务渲染（唯一单源） |
| `src/main/ai/tasks/ceshu.ts` | `generateRoleTasksTask` 编排 |
| `scripts/ceshuTasks.ts` | 离线打印提示词 / 验证解析 |
| `src/main/ipc/dialogIpc.ts` | `dialog:chooseProjectDir` |
| `src/renderer/src/components/CeshuHomePanel.tsx` | 首页「打开项目文件夹…」入口 |
| `src/renderer/src/components/CeshuTasksPanel.tsx` | 岗位任务面板（AI 生成 + 按章清单回落） |
| `src/renderer/src/components/CeshuPrototypePanel.tsx` | 原型预览（生成 + 落盘 + 已保存的直读） |

## 测试

- `tests/unit/ceshuProjectFolder.test.ts`（15）：目录结构、无损往返、扩展字段不丢、身份/版本链/style 往返、任务计划往返、原型往返、`enabled_modules` 约定、目录名清洗
- `tests/unit/ceshuTaskPrompt.test.ts`（11）：摘要过滤（默认值噪声/机读字段/预算截断）、提示词硬约束、解析校验（未知岗位/非法章/优先级/条数封顶）
- `tests/unit/ceshuStorage.test.ts`（12）：新建即文件夹、老文档保持 JSON、双形态冲突时文件夹权威、导入同 id 不重复、原型落盘/清空、旧产物清理（不动用户文件）、删除清两种形态
- `tests/unit/ceshuExportProjectFolder.test.ts`（2）：导出建子目录、导出→读取闭环
- `tests/unit/dom/ceshuTasksPanel.test.tsx`（4）：按章清单/生成/失败/切岗位回落
- `tests/unit/dom/ceshuPrototypePanel.test.tsx`（5）：生成/落盘/落盘失败仍显示/无完整 HTML 不落盘/已保存直读
- `tests/unit/dom/ceshuHomePanel.openProject.test.tsx`（3）：打开成功 / 取消不刷新 / 非项目文件夹报错
- `tests/unit/ceshuManagerCrud.test.ts`：删除断言改为目录形态
- `tests/unit/importSession.test.ts`（11）：导入差异分类（新增/修改/未变）、字段级前→后、对象按 JSON 比对、无 id 一律新增、类型+id 才是命中键、明细截断、会话一次性消费
- `tests/unit/ceshuDataTableCheck.test.ts`（17）：期望条数解析（含 `≥N`/`N+`）、四段行解析、未建表/条数不足/超出/缺字段/空表、字段名容错（「名称」对上「道具名称:」）、单字不误命中
- `tests/unit/dom/importPreviewPanel.test.tsx`（7）：统计与字段级差异、缺 id 列红条、无变化说明、截断提示、确认/失败/取消
- `tests/unit/dom/ceshuMachineDataPanel.check.test.tsx`（9）：逐条不符、全部通过、未声明引导、核对失败、补齐入口只在「缺表/缺字段」时出现、出计划、确认执行后回传新类型、取消不写
- `tests/unit/ceshuDataTableScaffold.test.ts`（19）：字段类型推定、键名词典与后缀命中、表名归一不造重复表、已存在字段跳过、新表自动带 name、生成的 schema 能过 `validateTypeSchema`、重复执行幂等

## 还没做的

- **老 JSON → 文件夹的一次性迁移命令**（现在只能靠「导出再打开」绕）。
  要不要做，取决于是否真有人拿老库；JSON 形态能一直读，所以不急。
- **`design/*.md` 手改回灌的冲突处理**：`saveChapter` 会先 `load` 再合并单章，
  所以**改别的章不会被覆盖**；只有「正在编辑的那一章」的 md 手改会被表单数据盖掉。
  真要「md 即真相」得加 mtime 比对 + 冲突提示，是另一个话题。
- **原型与设计文档的联动**：现在改完文档要手动点「重新生成」；没做「文档变了就提示原型可能过期」。
- **数据表补齐只管结构**：它能建表、加字段（含推定的字段类型与键名），但**不生成任何数据行**，
  也不改已有条目的数据。「期望 200 条」这件事仍然要人/AI 去填，核对会继续报条数不足。
- **字段类型是猜的**：按名字推（含「血量/攻击/冷却」→ 数字，含「图片」→ 图片，含「描述」→ 长文本），
  计划里逐条写出理由，落盘后可在「字段结构编辑器」里改。键名走小词典（攻击力→atk），
  未收录的用 `f1/f2` 占位——不猜拼音，猜错比占位名更难排查。
