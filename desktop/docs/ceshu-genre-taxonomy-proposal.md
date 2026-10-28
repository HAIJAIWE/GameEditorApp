# 品类枚举 + 条件必填 —— 方案（已实施）

> 起因：真实 GDD 三份并排走查（`docs/ceshu-import-walkthrough.md`）发现，无战斗品类（休闲合成）立项完成度只有 **68%**，
> 而含战斗品类是 **82%**。根因：`combat.combat_mode` / `combat.damage_formula` 在**立项阶段必填**，但合成/模拟/叙事类根本无战斗。
>
> **2026-10-26 已实施**（按用户拍板：细类枚举 / 隐藏无战斗章 / 老文档默认有战斗）。修复后喵岛邮差立项 68% → **79%**。

## 实施记录（与原方案的唯一偏离）

原方案 §3/§4 拟「新增 `meta.game_genre` 字段」。实施时发现 **`meta.game_type` 的 22 个取值本身就是品类枚举**
（RPG/SLG/模拟经营/视觉小说/休闲益智…），再加 `game_genre` 会造成同义字段双维护——这正是项目记忆里「判字段重复前
必查」的教训。故改为**复用既有 `game_type` 派生**，不新增字段：

- `ceshuConstants.ts`：`NON_COMBAT_GAME_TYPES`（模拟经营/视觉小说/派对/休闲益智）+ `gameTypeHasCombat()` +
  `chapterApplicableToGenre()`；`visibleChapterKeys(scope, gameType?)` 增加可选品类过滤（不传 ⇒ 零行为变化）。
- `ceshuModel.getGameType(doc)` + `computeChapterProgress` 传入品类 ⇒ 无战斗品类 combat 章退出 `visible` 与分母。
- 校验（2 处）/ 机读包 / 导出（docx/html/markdown/pptx）/ 章导航 全部走 `visibleChapterKeys`，自动一致。
- `ceshuScorer`：`scoreChapters` 跳过不适用章、`calcStructureScore` 分母改用 `chapterScores.length`（默认等价旧行为）。
- 守卫测试 `tests/unit/ceshuGenre.test.ts`（6 项）；walkthrough 脚本回归 merge 68%→79%。
- **未新增字段 ⇒ 字段总数仍 337、schema 基线不变、无需迁移。**

以下为原始方案正文（保留备查）。

## 1. 为什么不能"顺手修"

现状核对（`src/shared/ceshuConstants.ts` / `ceshuModel.ts`）：

- `CHAPTER_REQUIRED_FIELDS.combat = ['combat_mode','damage_formula']` 是**静态常量**，不看品类；
- `computeChapterProgress` 的 `total = sum / visible.length`（`visible = visibleChapterKeys(scope)`）；
- `visibleChapterKeys` 只按 `gdd_scope`（lite/full）过滤，**不看品类**；且 `lite = NUMBERED_CHAPTER_KEYS.slice(0,9)`，combat 是第 5 章，**两个档位都含 combat**。

**关键坑**：只把 combat 的 `required` 置空**没用**——该章仍留在 `visible` 里，`progress[combat]` 走"无必填=0"分支，
0 照样进分母，total 依旧被拉低。**正解必须让"不适用的章"退出 `visible`**，不只是清必填。

再往上，`GameStyleDef` 只有**题材**（仙侠/科幻/奇幻/武侠/现代/像素），没有**品类**枚举，也没有 `hasCombat` 标志；
`meta.game_type` 是自由文本（"写实军事 SLG"）。所以要先立一套**品类**概念，才能谈"按品类条件必填"。

## 2. 目标

1. 无战斗品类立项稿也能到 **82%**（combat 章不参与完成度）；
2. **不破坏**现有文档语义：老文档没选品类 ⇒ 行为与今天**完全一致**（2604 测试全绿）；
3. 改动面最小、可回退。

## 3. 两个设计选项

### 方案 A（推荐，最小可落地）：二元 `hasCombat` + 新增 `meta.game_genre`

- 新增 `meta.game_genre`（combo，人定 `aiDraftable:false`）：`slg / card / merge / sim / narrative / action / other`
- 每个品类带一个 `hasCombat: boolean`（只有 `merge/sim/narrative` 为 false，其余 true）
- **只解决 combat 一个伪必填**，其余章不动
- 优点：改动集中、易测、可回退；缺点：将来若发现别的章也"品类相关"（如 economy），要再扩

### 方案 B（演进方向，暂不做）：品类 → 章适用性矩阵

- 每个品类定义 `Record<ChapterKey, 'required'|'optional'|'hidden'>`
- 通用，但改 `visibleChapterKeys` / 校验 / 评分 / UI 全链路，风险大，适合 A 跑顺后再升级

**结论：先做 A，给 B 留接口。**

## 4. 方案 A 的技术落点（精确到函数）

### 4.1 数据层

1. `ceshuConstants.ts` 新增：
   ```ts
   export type GameGenre = 'slg'|'card'|'merge'|'sim'|'narrative'|'action'|'other'
   export const GAME_GENRE_LABELS: Record<GameGenre, string> = { ... }
   export const GENRE_HAS_COMBAT: Record<GameGenre, boolean> = {
     slg:true, card:true, merge:false, sim:false, narrative:false, action:true, other:true
   }
   /** 缺省（未选品类）按「有战斗」保守处理 ⇒ 行为不变 */
   export function genreHasCombat(genre?: string): boolean {
     return genre ? (GENRE_HAS_COMBAT[genre as GameGenre] ?? true) : true
   }
   /** 该章在给定品类下是否适用（目前只有 combat 条件化） */
   export function chapterApplicableToGenre(chapter: ChapterKey, genre?: string): boolean {
     return chapter !== 'combat' || genreHasCombat(genre)
   }
   ```
2. `visibleChapterKeys` 增加可选 `genre` 参数，过滤不适用章：
   ```ts
   export function visibleChapterKeys(scope: GddScope, genre?: string): readonly ChapterKey[] {
     const base = scope === GDD_SCOPE_LITE ? [META_CHAPTER_KEY, ...LITE_CHAPTER_KEYS] : CHAPTER_KEYS
     return base.filter((ch) => chapterApplicableToGenre(ch, genre))
   }
   ```
3. `meta` schema（`ceshuSchema/meta.ts`）加 `game_genre` 字段；`CHAPTER_REQUIRED_FIELDS.meta` **不加**它（选填，不强制）。
4. `ceshuMigration`：老文档 `game_genre` 缺省 → 不写（undefined 走"有战斗"兜底），无需强制迁移。

### 4.2 进度（核心）

`ceshuModel.ts computeChapterProgress`：
```ts
const genre = isPlainObject(doc.meta) ? (doc.meta.game_genre as string|undefined) : undefined
const visible = visibleChapterKeys(getGddScope(doc), genre)
// 其余不变：required 仍取 CHAPTER_REQUIRED_FIELDS[key]，
// 但 combat 已不在 visible 里 ⇒ 不进 sum、不进分母 ⇒ merge 品类自然到 ~82%
```
> 注意：`required` 无需改成"条件必填函数"——**章不在 visible 里就够了**。这比改必填表更小、更稳。

### 4.3 校验 / 评分 / UI

- `ceshuValidation.ts`：`combat` 章校验前先 `chapterApplicableToGenre('combat', genre)`，不适用则跳过（不报"必填缺失"）。
- `ceshuScorer.ts`：核对是否有 combat 章评分规则；有则同样按品类跳过。
- UI：`CeshuView` 章导航 + `ChapterForm` 对不适用章隐藏（叠加现有阶段筛选，互不冲突）；选品类后即时生效。

### 4.4 测试（必须）

1. **行为不变守卫**：`game_genre` 缺省 ⇒ `visibleChapterKeys` 与今天**逐项相等**、total 不变（现有 2604 全绿即证明）。
2. **新守卫**：`game_genre='merge'` ⇒ `visibleChapterKeys` 不含 combat；`computeChapterProgress` 的 total 与"把 combat 章删掉"的结果一致。
3. **walkthrough 回归**：脚本里给喵岛邮差设 `doc.meta.game_genre='merge'`，断言立项阶段从 68% → **82%**。
4. `ceshuSchema.guard` 基线字段数 +1（新增 `game_genre`）。

## 5. 风险与对策

| 风险 | 对策 |
|---|---|
| total 分母变化 ⇒ 已选非战斗品类的文档进度跳变 | 跳变是**变高**（combat 0 被剔除），且用户主动选了品类才触发；UI 提示"已按品类隐藏 combat 章" |
| 品类枚举粒度争议 | 先二元 `hasCombat` 起步，枚举值留扩展位；不确定的品类归 `other`（=有战斗，保守） |
| 老文档兜底 | 缺省 `game_genre` ⇒ `hasCombat=true` ⇒ **零行为变化** |
| 将来别的章也要条件化 | 方案 B 的矩阵接口已在 `chapterApplicableToGenre` 预留 |

## 6. 决策清单（请你拍板）

1. **品类粒度**：二元（战斗/非战斗）够用，还是要 6~8 个细类？（推荐：细类枚举，但只 `hasCombat` 一个 flag 生效）
2. **无战斗品类的 combat 章**：**隐藏**（推荐，分母才正确）还是"保留但标可选"？
3. **老文档兜底**：默认"有战斗"（推荐，零跳变）还是从 `game_type` 关键词推断？

三项定了，我按 §4 落地（含守卫测试 + walkthrough 回归，merge 应到 82%）。
