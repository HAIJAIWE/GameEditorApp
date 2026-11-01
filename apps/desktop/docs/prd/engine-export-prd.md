# 引擎代码导出 · 精简增量 PRD

> 切片：把编辑器里编辑好的游戏数据表（角色/技能/怪物/装备等，存 SQLite，带类型 schema）导出为**游戏引擎可直接使用的代码或配置文件**。
> 形态：**增量**（新增为主，不改现有存储路径与业务路径）。规模：**≤10 个源文件**的一刀。
> 事实依据：`src/ui/dialogs/engine_export`（旧版参考）、`desktop/src/main/ceshu/export/{exporter,excel}.ts`、`desktop/src/main/data/legacyExport.ts`、`desktop/src/shared/types.ts`、`desktop/src/main/schema/store.ts`。

---

## 1. 产品目标

让数值策划在编辑器里编完数据后，能**一键把它导出成目标引擎可直接加载的产物**，把「编辑器里的数据」变成「游戏里能跑的数据」。本切片先把**主路径打通**：面向策划实际的 **Lua + Maker** 技术栈，导出一个 Lua 数据模块并成功落盘；管道按「纯函数渲染 + 原子写 + IPC 契约」设计，后续引擎（Unity/Unreal/Cocos）只追加渲染器即可扩展。

---

## 2. 用户故事

1. 作为 **ARPG 数值策划**，我希望把当前库里全部角色/技能/怪物/装备导成一个 **Lua 数据模块**，以便直接被我的 Lua + Maker 项目 `require` 后使用。
2. 作为 **数值策划**，我希望导出时**保持字段名与数据原样**（id/name/数值/引用列表），以便引擎侧逻辑引用不因导出而错位。
3. 作为 **数值策划**，我希望导出是**原子落盘**（要么生成完整文件、要么不动），以便不会因为中途失败留下半截的脏数据文件。
4. 作为 **数值策划**，我希望导出的字符串/Schema 与库里完全一致，以便我用 git diff 就能看出这次改了什么数值。
5. 作为 **工具开发者**，我希望导出能力是**纯函数**（渲染器输入数据、输出字符串），以便在无 Electron 环境下用 vitest 直接断言产物。

---

## 3. 范围与分档（需求池）

| 优先级 | 需求描述 | 目标引擎 | 产物形态 | 验收方式 |
|---|---|---|---|---|
| **P0** | 全量数据 → Lua 数据模块，落盘成功 | **Lua（Maker）** | 单个 `.lua` 文件，`return` 一个以复数键分组的数据表 | vitest 纯函数断言（见 §5） |
| **P0** | 值 → Lua 字面量安全序列化（转义/类型映射） | Lua | 字符串/数字/布尔/数组/嵌套对象的 Lua 字面量 | vitest 逐类型断言 |
| **P0** | 导出落盘（原子写 temp→rename，缺扩展名补 `.lua`） | Lua | `.lua` 文件 + `{ filePath, engine, bytes }` 结果 | vitest 写临时目录断言文件内容与返回值 |
| **P0** | IPC 契约 + 主进程 handler + 输入校验（zod） | 通用 | 新通道 `engine:exportData` | tsc 通过 + schema 单测（非法输入返回中文错误） |
| **P1** | 字段按键序稳定输出（先 schema 字段序、后额外键） | Lua | — | vitest 断言两次渲染结果完全一致 |
| **P1** | Unity 类型骨架导出（`ScriptableObject` + `[Serializable]` 类） | Unity | 单个 `.cs` 文件（仅类定义，与 旧版 同构） | vitest 断言含类名/字段 |
| **P1** | Unreal 类型骨架导出（`USTRUCT` + `UPROPERTY`） | Unreal | 单个 `.h` 头文件 | vitest 断言含 `USTRUCT`/字段 |
| **P1** | 渲染层导出入口（菜单/按钮接到新 IPC） | 通用 | UI 触发文件对话框 + 导出 | 手工/集成（本机无 E2E） |
| **P2** | 导出选项：是否含注释、命名空间/模块名 | Lua | 同上，内容可裁剪/包裹 | vitest 开关断言 |
| **P2** | Unity 数据填充（JSON 数据文件 + `.cs` 兼容） | Unity | `.json` 数据 | vitest 断言数据映射 |
| **P2** | Godot `.gd`/`.tres`、Cocos `.json` 导出 | Godot/Cocos | 数据/资源文件 | vitest 断言（复用 P0 序列化） |

**P0 最小可用定义**：能对当前库的全量数据，导出**一种引擎（Lua）的一种产物（数据模块）并落盘成功**，且该过程可被 vitest 完全闭环验收。

---

## 4. 导出产物规格（P0：Lua）

### 4.1 产物示例

文件 `GameData.lua`：

```lua
-- 墨白可视化编辑 · 引擎数据导出
-- engine: lua  schema: 2.4
-- generated: 2026-06-26 10:00:00
-- count: role 2 / skill 1 / monster 0

local GameData = {}

GameData.roles = {
  ["role_1"] = {
    id = "role_1",
    name = "主角艾拉",
    job = "法师",
    race = "精灵",
    hp = 320,
    skills = { "skill_1", "skill_2" },
    attr_list = { atk = 120, def = 40 },
  },
  ["role_2"] = {
    id = "role_2",
    name = "波比",
    job = "战士",
    hp = 500,
  },
}

GameData.skills = {
  ["skill_1"] = {
    id = "skill_1",
    name = "火球术",
    value = 150,
    cd = 3,
  },
}

return GameData
```

### 4.2 字段映射（`ItemRecord` → 产物）

数据源 = `DataService.listAllItems()` 返回的 `ItemRecord[]`（`{ id, type, data, createdAt, updatedAt }`）+ 当前 `DataTypeDef[]`。

| 产物位置 | 来源 |
|---|---|
| 外层表键 `GameData.<plural>` | `DataTypeDef.plural_key`（`role`→`roles`）；**未收录类型**用 `ItemRecord.type` 原文并排序追加（对齐 `legacyExport` 无损策略） |
| 内层键 `["<id>"]` | `ItemRecord.id` |
| 字段键 | `data` 的属性名（与 schema `formFields[].name` 同名，如 `name/job/hp/skills`） |
| 字段值 | `data[field]` 原样映射，**不做业务换算**（数值策划要 git diff 可读） |

### 4.3 值 → Lua 字面量映射

| data 值类型 | Lua 字面量 |
|---|---|
| `string` | `"..."`，转义 `\` `"` 换行 `\n` 等控制字符 |
| `number` | 数字字面量（`320`、`1.5`、`-2`） |
| `boolean` | `true` / `false` |
| `null` / `undefined` | `nil` |
| 数组 | `{ v1, v2, ... }` |
| 嵌套对象 | `{ k = v, ... }` |
| 空对象 `{}` | `{}` |
| 空数组 `[]` | `{}` |

### 4.4 文件头与结构约定

- `local GameData = {}` … `return GameData`（模块化，`require` 可用）。
- 顶部注释：来源、引擎、schema 版本、生成时间、各类型条目数。
- 单文件承载全部类型（P0）；如后续确认 Maker 需要「每类型一文件」再在 P2 拆。

---

## 5. 验收标准（每条可被 vitest 判定）

> 渲染器与序列化器均为**纯函数**，落盘函数写临时目录；全部无需 Electron。

- **AC1 分组与条目**：给定 `types`=[role→roles, skill→skills] 与 `records`=[2 条 role、1 条 skill]，`renderLuaGameData(records, types)` 输出**包含** `GameData.roles = {`、两个角色键 `["role_1"]`/`["role_2"]`、`GameData.skills = {` 与 `["skill_1"]`。
- **AC2 字符串转义**：输入字段值 `a"b` + 换行，输出包含 `"a\"b\n…"`（转义后），且**不含未转义的裸 `"`**。
- **AC3 类型映射**：数字 `320` → `320`（无引号）；`true` → `true`；`null` → `nil`；数组 `["skill_1"]` → `{ "skill_1" }`；嵌套对象 `{atk:120}` → `{ atk = 120 }`。
- **AC4 空数据合法**：`records=[]` 时输出仍为合法 Lua 模块（含 `local GameData = {}` 与 `return GameData`），**不抛错**。
- **AC5 落盘**：`exportEngineData(records, types, { engine:'lua', targetPath: '<tmp>/gamedata' })` 成功后：文件存在于 `<tmp>/gamedata.lua`（自动补扩展名），文件内容 === `renderLuaGameData(...)` 的输出，返回 `{ filePath, engine:'lua', bytes }` 且 `bytes === Buffer.byteLength(content)`。
- **AC6 原子写**：写入过程中不存在残留 `.tmp` 文件（导出后可断言目录内无 `*.tmp`）。
- **AC7 非法输入中文错误**：`engine` 非 `'lua'` → 抛含「目标引擎不支持」的中文错误；`types` 为空数组 → 抛含「数据类型定义」的中文错误。
- **AC8 幂等/稳定**：同一输入连续调用两次 `renderLuaGameData`，结果**字符串完全相等**（键序稳定，先 schema 字段序、后额外键）。
- **AC9 IPC 输入校验**：`engineExportInputSchema` 对缺失 `path`、非法 `engine` 的输入返回校验失败（zod），合法输入通过。

---

## 6. 待确认问题（≤4）

1. **「Maker 平台」具体是哪个？**（RPG Maker / TapTap Maker(UrhoX) / 自研？）其 Lua 侧的数据加载约定（`require` 返回 table / 全局表 / 指定路径）决定外层结构与文件命名规则。
2. **产物粒度**：Lua 是「全量单文件 `GameData.lua`」还是「每类型一个文件」？（P0 先按单文件实现）
3. **数值字段强转**：schema 中以字符串存的数字（如技能 `multiplier = "1.5"`）应输出为 Lua **number** 还是**原样字符串**？（P0 默认原样，避免精度/语义丢失）
4. **是否需要引擎资源资产**（如 Unity `.asset`）而非纯代码/数据文件？（影响 P1/P2 形态）

---

## 7. 明确不做（本刀）

- **不做** Godot / Cocos 导出（P2，先验证 Lua 主路径，避免多引擎半成品）。理由：一刀内深度不足，主路径优先。
- **不做** Unity / Unreal 的**数据填充**（早期版本仅生成类型骨架、不填数据；本刀不复制这种「看似可用实则空壳」的产物，留待 P1 明确形态）。理由：避免误导策划把空骨架当交付。
- **不修改** `main/library/**`、数据表增删改逻辑、`type_schema.json` 存储（仅**读取** `DataService.listAllItems()` 与 `TypeSchemaStore.getTypes()`）。理由：本切片为增量，禁止触碰现有存储/业务路径。
- **不做** 画面级 UI 打磨与 E2E（本机沙箱无法启动 Electron）。理由：验收靠纯函数 vitest 闭环；UI 入口在 P1 接既有导出位置。
- **不做** 引擎侧运行时验证（不在游戏里实跑）。理由：超出编辑器边界。

---

## 附：P0 建议文件清单（≤10，供架构师参考）

**新增**
1. `src/main/engineExport/luaLiteral.ts` — 值 → Lua 字面量（纯函数）
2. `src/main/engineExport/lua.ts` — `renderLuaGameData(records, types)` → string（纯函数）
3. `src/main/engineExport/exporter.ts` — `exportEngineData(...)` 渲染 + 原子写 temp→rename
4. `tests/unit/engineExportLua.test.ts` — P0 全部验收断言

**追加（仅接线，不改既有逻辑）**
5. `src/shared/ipc.ts` — 新增通道 `engine:exportData`
6. `src/shared/schemas.ts` — 新增 `engineExportInputSchema`
7. `src/shared/api.ts` — 暴露 `engine.exportData`
8. `src/preload/index.ts` — `invoke('engine:exportData', req)`
9. `src/main/ipc.ts` — 注册 handler（读 `dataService.listAllItems()` + `typeSchemaStore.getTypes()`）

**复用既有约定**：`exporter.ts` 的 temp→rename 原子写与 `ensureExtension`；`excel.ts` 的「纯函数先构建、便于单测」；`legacyExport.ts` 的「按复数键分组 + 未收录类型无损追加」；`attrGameConfigExport.ts` 的「校验失败抛中文错误」。
