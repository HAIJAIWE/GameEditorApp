# `src/shared/` 分层契约

> 本文件是 **`src/shared/` 的放置规范**。新增或移动 shared 文件前先读这里。
> 边界规则由 `eslint.config.mjs` 机器校验（`npm run lint`），本文与 lint 规则一一对应。

---

## 0. 为什么 shared 要分层

`src/shared/` 是 main / preload / renderer **三方共享**的唯一区域（受 `tsconfig.node.json` 与
`tsconfig.web.json` 双向 include 约束，物理位置被锁定，**不能**上移到 `src/main/` 或下移到
`src/renderer/`）。正因为三方共享，**放错位置的成本是全仓的**：一个业务域的工具函数被另一个
业务域 import，会同时污染 main 与 renderer 的构建产物。

分层的唯一目的：**让依赖方向可读、且可被 lint 自动校验**。

---

## 1. 五个分区

| 分区 | 位置 | 职责 | 代表文件 |
|---|---|---|---|
| **contract** | `src/shared/` 根目录 | 跨进程契约：类型、zod 校验、IPC 通道 | `types.ts`、`schemas.ts`、`ipc.ts` |
| **domain/*** | `src/shared/domain/<域>/` | 业务域逻辑，**域间禁止互相 import** | `domain/ceshu/ceshuDefaults.ts` |
| **config** | `src/shared/config/` | 设置项 / 偏好持久化 | `settingsStore.ts`、`visibleTypes.ts`、`imageGenConfig.ts` |
| **service** | `src/shared/service/` | 主进程对外服务契约（preload↔renderer 门面） | `service/api.ts` |
| **util** | `src/shared/util/` | 零业务语义的纯工具 | `util/guards.ts`、`util/datetime.ts` |

### 1.1 依赖方向（允许 → 禁止）

```
             ┌──────────────┐
             │   contract   │  留根，不 import 任何 shared 内部模块
             └──────┬───────┘
     ┌──────────────┼──────────────┬─────────────┐
     ▼              ▼              ▼             ▼
┌─────────┐   ┌──────────┐   ┌──────────┐  ┌──────────┐
│ config  │   │  util    │   │  service │  │ domain/* │
└─────────┘   └──────────┘   └──────────┘  └──────────┘
                    ▲              │             │
                    └──────────────┴─────────────┘
                              允许

  ✗ domain/a  →  domain/b      （跨业务域，禁止）
  ✗ util       →  domain/**     （纯工具层不得依赖业务，禁止）
  ✗ config     →  domain/**     （设置持久化不认业务，禁止）
  ✗ main       →  domain/**     （主进程走 api.ts 契约门面，禁止）
```

| 起点 | 允许 import | 禁止 import |
|---|---|---|
| `contract`（根） | 外部包（`zod` 等） | 任何 `shared/**` 的运行时值 |
| `domain/<域>` | `contract`、`config`、`util`、`service`、**本域内** | **其它 `domain/<其它域>`** |
| `config` | `contract`、同层 | **任何 `domain/**`** |
| `util` | `contract`、同层 | **任何 `domain/**`** |
| `service` | `contract`、`config`、`util`、`domain/*` | — |
| `main` / `preload` / `renderer` | `shared/**` 任意（但 main 不直接碰 `domain/**`） | — |

---

## 2. 放置决策树（新增文件时照此走）

**Q1. 这个文件只声明类型 / zod schema / IPC 通道名，不含业务计算？**
→ 放 **`src/shared/` 根目录**，文件名用 `types.ts` / `schemas.ts` / `ipc.ts` 或加业务前缀（`ceshuTypes.ts`）。

**Q2. 它是「跟某个业务域走」的吗？（策划书 / 属性 / 类型系统 / Agent）**
→ 放 **`src/shared/domain/<域>/`**。
　├ 同一域的文件之间随便 import ✅
　└ 需要别的域的东西？**不能直接 import**，先问：
　　　├ 对方只是数据形状？→ 在 contract 层（根目录 `types.ts`）加类型，双方各引 contract。
　　　├ 对方是一段通用计算？→ 考虑下沉到 `util/`（如 `isPlainObject` → `util/guards.ts`）。
　　　└ 实在解不开 → **先汇报**，不要硬加 import 让 lint 兜底。

**Q3. 它读写的是「用户设置 / 偏好」？（gameStyle、visibleTypes、imageGenConfig、settingsStore）**
→ 放 **`src/shared/config/`**。它**不允许**知道任何业务域。

**Q4. 它是主进程对外暴露的能力契约，供 preload 暴露给渲染层？（`MbApi` 门面）**
→ 放 **`src/shared/service/`**。

**Q5. 它不含任何业务语义？（日期、类型守卫、diff、公式、查找表）**
→ 放 **`src/shared/util/`**。判据：**把业务名词删掉后函数名仍然成立**。
　反例：`formatCeshuTimestamp` → 含业务名词 → 不属于 util，应下沉到 domain 或改名为 `formatLocalTimestamp`。

---

## 3. lint 规则对照（`eslint.config.mjs`）

| # | 规则 | 作用范围（`files`） | 禁止的 import | 当前是否有文件被约束 |
|---|---|---|---|---|
| 1 | 域间隔离（4 个域各一条） | `src/shared/domain/<域>/**/*.ts` | `**/domain/<其它域>/**` 及相对上跳形式 | ⚠️ 仅 `domain/ceshu/` 有文件；`attr`/`type`/`agent` **尚无目录** |
| 2 | util 纯净 | `src/shared/util/**/*.ts` | `**/domain/**` | ✅ `guards.ts` `datetime.ts` |
| 3 | config 纯净 | `src/shared/config/**/*.ts` | `**/domain/**` | ⚠️ **`config/` 目录尚不存在** |
| 4 | main 走契约 | `src/main/**` | `**/shared/domain/**` | ✅ 全部 `src/main/**` |

### 3.1 关于「预挂规则」的重要说明（避免假守卫）

**规则 1 的 3 条（attr/type/agent）与规则 3 挂在当前尚不存在的目录上。**
新建 `src/shared/domain/attr/` 或 `src/shared/config/` 的那一刻，对应规则**自动生效，无需改配置**。

这不是「死规则 / 假守卫」，已实测确认：

```bash
# 用 ESLint Node API 对不存在的目录做无文件探针（filePath 指向 domain/attr/x.ts）
# → ARMED domain/attr / ARMED domain/type / ARMED domain/agent / ARMED config
```

原理：ESLint flat config 的 `files` 是**对被 lint 文件的路径做 glob 匹配**，
**不检查目录是否存在于磁盘**。所以规则是「已上膛、等待目标」，而非「永不报警」。

> ⚠️ **但请注意一个真实盲区**：规则只约束**已归区**的文件。
> `src/shared/` 根目录下**尚未归区的历史平铺文件**（`ceshuModel.ts`、`attrSystem.ts`、
> `agent/*.ts` 等 50 余个）**当前完全不受任何规则约束**——
> 它们在 `domain/` 目录之外，不会匹配任何 `files` 范围。
> 这意味着「attr 域不能 import ceshu 域」在 `attrSystem.ts` 归区前是**靠 code review 而非 lint 保证**的。
> 迁入 `domain/attr/` 后该约束才自动升级为机器校验。

### 3.2 复算命令（改规则后请用来自证规则真的生效）

```bash
cd D:/GameEditorApp/desktop

# 无文件探针：不落盘、不污染仓库，4 条规则一次验完
node -e "
const {ESLint}=require('eslint'),path=require('path');
(async()=>{const e=new ESLint({overrideConfigFile:path.resolve('eslint.config.mjs'),cwd:process.cwd()});
for(const [n,fp,code] of [
 ['rule1 ceshu->attr','src/shared/domain/ceshu/p.ts',\"import{SYSTEM_LABELS}from '../attr/attrSystem'\"],
 ['rule2 util->domain','src/shared/util/p.ts',\"import{SYSTEM_LABELS}from '../domain/ceshu/ceshuConstants'\"],
 ['rule3 config->domain','src/shared/config/p.ts',\"import{SYSTEM_LABELS}from '../domain/ceshu/ceshuConstants'\"],
 ['rule4 main->domain','src/main/p.ts',\"import{SYSTEM_LABELS}from '../shared/domain/ceshu/ceshuConstants'\"]]){
 const r=await e.lintText(code+'\nexport const p=1\n',{filePath:fp});
 const m=r[0].messages.filter(x=>x.ruleId==='no-restricted-imports');
 console.log((m.length?'FIRES  ':'DEAD   ')+n);}})()
"
```

> **`DEAD` = 规则失效，必须修**（这才是真正的死规则）。
> 注意探针里的**相对层级要与 `filePath` 深度一致**：`config/p.ts` 在 `src/shared/` 下
> 一层，导 `domain/` 要写 `'../domain/…'`（只写一层会误报 DEAD，是探针写错、不是规则坏）。

> **规则 4 的粒度说明**：`src/main/**` 对 shared 的引用一律是 `../../shared/<name>` 形态的相对路径，
> 所以规则锚定 `shared/domain/**` 字面前缀。**尚未归区的历史平铺文件**不在本规则约束范围内。

> **`no-restricted-imports` 匹配的是 import 语句里的原始字符串，不做路径解析。**
> 因此 shared 内部的相对路径（`'../ceshu/x'`）不含 `shared/` 字样，
> 规则 1 用 `**/domain/<peer>/**` + `../<peer>/**` + `../../<peer>/**` + `../../../<peer>/**` 四个前缀共同锚定。

**豁免**：当前 **0 条**（`npm run lint` 零 error，无 `eslint-disable`）。

---

## 4. 现状与迁移状态

分区目录是**渐进建立**的。当前状态：

| 分区 | 已归入 | 仍在根目录平铺（待迁移存量） |
|---|---|---|
| `domain/ceshu/` | `ceshuDefaults` `ceshuFields` `ceshuTemplateData` | `ceshuModel` `ceshuConstants` `ceshuChecklist` `ceshuAi` 等 20 个 |
| `domain/attr/` | —（暂无） | `attrSystem` `attrPanel` `attrList` `attrPreview` `equipPreview` |
| `domain/type/` | —（暂无） | `typeSchema` `typeSchemaFile` `typeTemplates` |
| `agent/` | —（**有意保持平铺，见 §5**） | `brain` `protocol` `session` `prompts` 等 8 个 |
| `config/` | —（暂无） | `settingsStore` `visibleTypes` `gameStyle` `imageGenConfig` |
| `service/` | `api`（`MbApi` 契约门面） | `logger` `backup` `imageGen` `secretNames` `secretMigration` |
| `util/` | `guards` `datetime` | `itemDiff` `dropTable` `formulaBuilder` `quickCreate` 等 |

**新增文件请直接放进对应分区目录**（规则 1–4 只对已归区文件生效，新文件放根目录不受约束）。
存量迁移优先级：先迁「被其它域 import 的」——它们才是分层收益的来源。

---

## 5. 为什么 `agent/` 不改成 `domain/agent/`

`src/shared/agent/` 8 个文件是一个**自闭环子域**（内部仅 4 条边，3 条 type-only）：

- 已有唯一命名空间前缀 `agent/`，自解释，不靠目录位置表达「这是个域」；
- 消费者与 `src/main/agent/` **一一对应**（`brainService` / `dispatcher` / `memoryStore` / …），
  两边同名目录形成清晰对照；
- 改名要改 16 处 import（含 13 个测试文件），**收益仅是目录名对齐**。

故**保留 `agent/` 原样**。规则 1 对 `domain/agent/` 生效；`agent/` 内部的跨域 import
靠 code review 把关（当前实测 0 条）。

---

## 6. 常见反例

```ts
// ✗ attr 域直接 import ceshu 域 —— 为一个类型守卫破坏分层
import { isPlainObject } from './ceshuModel'        // ✅ 已改为 './util/guards'

// ✗ agent 域直接 import ceshu 域 —— 为一个格式化函数破坏分层
import { formatLocalTimestamp } from '../ceshuModel' // ✅ 已改为 '../util/datetime'

// ✗ util 反向依赖业务
import { SYSTEM_LABELS } from '../domain/ceshu/ceshuConstants' // lint 规则 2 会拦

// ✓ 正确：通用能力下沉 util，各域共用
import { isPlainObject } from './util/guards'

// ✓ 正确：共享数据形状放 contract
import type { ChapterKey } from '../types'
```

**重构存量跨域依赖的标准动作**：把那个函数/常量搬到 `util/`（或下沉到真正拥有它的域），
在原模块 `re-export` 保持兼容，然后让**新代码**直接引新位置。
这样只需改 1–2 处调用方，而不是全仓 60 处。
