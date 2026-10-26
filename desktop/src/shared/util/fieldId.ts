import { GAME_TERMS } from '../glossaryTerms'

/**
 * 字段 ID 建议（中文显示名 → 英文字段 ID）。
 *
 * ## 这是什么问题
 * 类型编辑器有两条硬规则（对齐 旧版）：**显示名可以中文**，**字段 ID 必须英文/下划线**。
 * 而 ID 是**契约**——它会被导出到 Lua、被存档引用，**一旦落盘不可变**。
 * 所以本模块只做「把中文显示名转成候选 ID」，不做任何自动写入；选哪个由人决定。
 *
 * ## 修掉的 旧版 缺陷（均经实跑取证，见 `tests/unit/fieldId.test.ts`）
 * 旧版 实测 `FieldEditorWidget._translate_game_terms` 的输出：
 *
 * | 输入 | 旧版 实际输出 | 本模块输出 |
 * |---|---|---|
 * | `HP上限` | `h_p_max` | `hp_max` |
 * | `HP` | `h_p` | `hp` |
 * | `hp_max`（本就是合法 ID） | `h_p_m_a_x` | `hp_max` |
 * | `ATK加成` | `a_t_k_canada_surname` | `atk_bonus` |
 * | `斗能` | `abbr_surname` | 明确报「未收录」 |
 *
 * 1. **ASCII 被逐字打碎**：旧版 的 ASCII 分支每读一个字符就 `append` 一次，最后用 `_` 拼接，
 *    于是 `HP` → `h_p`、连 `hp_max` 这种**已经合法的 ID** 都被打成 `h_p_m_a_x`。
 *    本模块把**连续**字母数字累积成**一个** token。
 * 2. **未收录的中文段被交给词典，产出垃圾**：`斗能 → abbr_surname`（正是 旧版 文档自己举的示例词）、
 *    `ATK加成 → ...canada_surname`。本模块**不接词典**，未收录的段落原样记进 `skipped` 并如实告知，
 *    **绝不产出看起来像答案的垃圾**。
 *
 * ## 有意不迁
 * - **CEDICT 词典**（`core/cedict`）：实测 3.8MB 下载 / 11MB 落盘、同步阻塞 UI 线程、失败静默；
 *   且它唯一能答的「通用词」早已被术语表覆盖，唯一会落到它的「自造词」它又查不到，
 *   更糟的是会产出 `abbr_surname` 这类垃圾。→ 不迁。术语表未收录时如实提示，未来可接 AI 候选。
 * - **`pypinyin` 拼音兜底**：**已迁**（E58）。TS 侧由 `shared/pinyinFieldId.ts`（依赖 `pinyin-pro`）承接，
 *   `攻击力 → gong_ji_li`、支持任意汉字。与本模块**正交**：本模块走术语表（语义优先，`攻击力 → atk`），
 *   拼音模块走音节（兜底），UI 上两个按钮各自独立给候选，互不自动覆盖。
 * - **Lua 保留字黑名单**：曾计划加，查证后**判断为不需要**——导出器 `main/engineExport/luaLiteral.ts::toLuaKey`
 *   已对保留字自动降级为 `["key"]`，而 JS 侧字段名只作对象键使用，两处都安全；
 *   强行加一张黑名单会与之**不一致**，更会误伤 `class`/`level`/`order` 这类常用游戏字段名。
 *
 * ## 已知缺口（故意不补）
 * `物防`/`物攻`/`魔防` 不在术语表内（旧版 同样缺），本模块会如实报「未收录」。
 * 补的前提是**先定命名**（`phys_def`? `pdef`? `physical_def`?）——代码库里没有先例，凭空补就是发明。
 */

/**
 * TS 侧补充术语：旧版 `GAME_TERMS_CN` 缺失、但**代码库自身已确立**的命名。
 * 每一条都必须有据可依，不得凭个人偏好添加。
 * - `加成 → bonus`：依据 `src/shared/typeSchema.ts:62-65` 自身的字段名
 *   `hp_bonus` / `mp_bonus` / `atk_bonus` / `def_bonus`（标签为「生命加成%」等），
 *   即代码库已用 `bonus` 表示「加成」。
 */
export const GAME_TERMS_SUPPLEMENT: Readonly<Record<string, string>> = {
  加成: 'bonus'
}

/** 生效术语表：旧版 提取（`glossaryTerms.ts`）+ TS 补充 */
const TERMS: Readonly<Record<string, string>> = { ...GAME_TERMS, ...GAME_TERMS_SUPPLEMENT }

/** 术语键按长度降序（最长优先匹配，与 旧版 `_term_keys` 同序） */
const TERM_KEYS: readonly string[] = Object.keys(TERMS).sort((a, b) => b.length - a.length)

const CJK = /[\u4e00-\u9fff]/
const ASCII_ALNUM = /[a-zA-Z0-9]/
/** 合法字段 ID：字母或下划线开头，其后仅字母/数字/下划线（对齐 旧版 `_validate_field_id`） */
const VALID_ID = /^[a-zA-Z_][a-zA-Z0-9_]*$/

export type SuggestionSource = 'term' | 'literal' | 'ai' | 'pinyin'

export interface FieldIdSuggestion {
  /** 建议的字段 ID（已合法、已避开重名） */
  id: string
  /** `term`=术语表命中；`literal`=从标签里的英文/数字提取；`ai`=AI 候选；`pinyin`=拼音兜底 */
  source: SuggestionSource
  /** 术语表未收录、被跳过的中文片段（**UI 必须展示**，不静默丢弃） */
  skipped: string[]
  /** 因与现有字段重名而加后缀时，记录原始 ID；未改动为 null */
  renamedFrom: string | null
}

export interface SuggestFieldIdResult {
  suggestions: FieldIdSuggestion[]
  /** 无可给候选时的中文原因；成功时为 null */
  error: string | null
}

/** 判断 `text` 从 `index` 起是否命中术语表（最长优先） */
function matchesTermAt(text: string, index: number): boolean {
  return TERM_KEYS.some((key) => text.startsWith(key, index))
}

/** 中文/英文混合标签 → token 序列 + 未收录片段 + 是否用过术语表 */
function tokenize(label: string): { tokens: string[]; skipped: string[]; usedTerm: boolean } {
  const tokens: string[] = []
  const skipped: string[] = []
  let usedTerm = false
  let remaining = label.trim()

  while (remaining.length > 0) {
    // 1) 术语表最长优先匹配
    const hit = TERM_KEYS.find((key) => remaining.startsWith(key))
    if (hit !== undefined) {
      tokens.push(TERMS[hit])
      usedTerm = true
      remaining = remaining.slice(hit.length)
      continue
    }

    const head = remaining[0] as string

    // 2) 连续 ASCII 字母数字累积为【一个】token（修 旧版 逐字打碎的缺陷）
    if (ASCII_ALNUM.test(head)) {
      let end = 0
      while (end < remaining.length && ASCII_ALNUM.test(remaining[end] as string)) end += 1
      tokens.push(remaining.slice(0, end).toLowerCase())
      remaining = remaining.slice(end)
      continue
    }

    // 3) 未收录的中文段：向后扫到「术语表能命中的位置」或「非中文」为止，整段记为 skipped
    if (CJK.test(head)) {
      let end = 1
      while (end < remaining.length && CJK.test(remaining[end] as string)) {
        if (matchesTermAt(remaining, end)) break
        end += 1
      }
      skipped.push(remaining.slice(0, end))
      remaining = remaining.slice(end)
      continue
    }

    // 4) 其它字符（%、空格、括号等）直接丢弃（与 旧版 一致：`生命值%` → `hp`）
    remaining = remaining.slice(1)
  }

  return { tokens, skipped, usedTerm }
}

/**
 * 字段 ID 合法性校验。
 * 注意：**不检查保留字**——Lua 保留字由导出器 `toLuaKey` 自动降级为 `["key"]`，
 * JS 侧字段名只作对象键，两侧都安全（见文件头说明）。
 */
export function validateFieldId(id: unknown): { ok: boolean; reason: string | null } {
  const text = String(id ?? '').trim()
  if (text === '') return { ok: false, reason: '字段 ID 不能为空' }
  if (!VALID_ID.test(text)) {
    return { ok: false, reason: `字段 ID「${text}」只能由字母/数字/下划线组成，且不能以数字开头` }
  }
  return { ok: true, reason: null }
}

/**
 * 避开重名：与现有字段名（**精确比较**，大小写敏感）冲突时追加 `_2`、`_3`…
 *
 * 为何用精确比较：ID 作为对象键是大小写敏感的，`HP` 与 `hp` 技术上是两个键。
 * 这里只处理完全相同的名字，避免「莫名被改名」的困惑。
 */
export function uniquifyFieldId(
  baseId: string,
  existingNames: readonly string[]
): { id: string; renamedFrom: string | null } {
  const taken = new Set(existingNames.map((name) => String(name ?? '').trim()))
  if (!taken.has(baseId)) return { id: baseId, renamedFrom: null }
  let suffix = 2
  while (taken.has(`${baseId}_${suffix}`)) suffix += 1
  return { id: `${baseId}_${suffix}`, renamedFrom: baseId }
}

/**
 * 由中文显示名给出字段 ID 候选。
 *
 * 当前只产出**确定性**候选（术语表命中 + 标签内英文数字提取），故通常只有 1 个；
 * 这是刻意的：AI 候选（可给多个）是后续独立一步，接入位置就是本函数返回的列表。
 *
 * `existingNames` 用于避开重名；调用方应**排除被编辑字段自身**，否则会把「保持原名」判为重名。
 */
export function suggestFieldIds(
  label: unknown,
  existingNames: readonly string[] = []
): SuggestFieldIdResult {
  const text = String(label ?? '').trim()
  if (text === '') {
    return { suggestions: [], error: '显示名为空，无法生成字段 ID' }
  }

  const { tokens, skipped, usedTerm } = tokenize(text)
  const baseId = tokens.join('_').replace(/_+/g, '_').replace(/^_+|_+$/g, '').toLowerCase()

  if (baseId === '') {
    const notCovered = skipped.length > 0 ? `术语表未收录「${skipped.join('、')}」` : '未包含可转换为标识符的内容'
    return {
      suggestions: [],
      error: `无法生成字段 ID：${notCovered}。请手动填写英文 ID。`
    }
  }

  const { id, renamedFrom } = uniquifyFieldId(baseId, existingNames)
  return {
    suggestions: [
      {
        id,
        source: usedTerm ? 'term' : 'literal',
        skipped,
        renamedFrom
      }
    ],
    error: null
  }
}
