/**
 * 公式构建器（系数版）纯逻辑 —— 对应 Python `ui/widgets/formula_builder.py` 的公式生成/回填部分。
 *
 * 存储形态不变：仍是 legacy 字符串（如 `=力量*10+体质*20`），与 `shared/attrPanel.ts` 的解析/求值口径一致。
 * 本模块只做「系数 ⇄ 公式字符串」双向换算，**不引入第二套公式模型**。
 *
 * ## 迁移中修正的 Python 缺陷（均经 offscreen 实跑取证，见 `tests/unit/formulaBuilder.test.ts`）
 * 1. **打开编辑器不回填原公式**：Python `__init__` 收了 `current_formula` 只存不用，
 *    `_refresh_coeff_table` 一律用「按派生属性名查默认系数表」当初值 →
 *    实测传 `=智力*5` 时对话框显示 `=力量*2+敏捷*1`，**点确定即覆盖用户原公式**。
 *    本模块 `initialEntries` 负责回填；无法回填时明确给出警告，而非静默用默认值顶替。
 * 2. **新增属性的系数被静默丢弃**：Python `_update_formula_from_coeffs`/`get_formula` 迭代的是
 *    类常量 `BASE_ATTRS`（字典序恒为硬编码四项），而表格行来自实例列表 `base_attrs` →
 *    实测「幸运」系数设 7 后 `get_formula()` 仍返回 `=力量*2+敏捷*1`。
 *    本模块 `buildFormulaFromCoeffs` 完全按传入 `entries` 的顺序输出，属性集合由调用方决定。
 * 3. **调用方传入的属性列表从未被使用**：Python `available_attrs` 只赋值，表格恒显示硬编码四项。
 *    本模块 `resolveBuilderAttrs` 以调用方传入列表为权威（仅空列表时回落 `DEFAULT_BASE_ATTRS`）。
 *
 * ## 有意不迁（Python 侧为死代码，已 grep 实证无消费者）
 * - **「+ 添加属性」按钮**：属性集合应由数据面板的行提供（单一真源）。在编辑器里凭空造属性名，
 *   产出的公式必然被 `attrPanel` 求值器判为「未定义的属性名」——那是陷阱而非功能。
 * - `desc_label`：Python 里建了空 QLabel 却从未 `setText`，是死 UI。
 * - `_STYLE_TEMPLATE_BTN`/`_STYLE_OP_BTN`/`_STYLE_NUM_BTN`/`_STYLE_TREE`：四个样式常量均只定义未使用
 *   （即 Python 并没有模板按钮/运算符按钮/数字按钮）。
 *
 * ## 一个必须知道的行为（已实证，与 Python 一致）
 * 重建后的**项顺序按属性列表顺序归一**，不是原公式的书写顺序。例如打开 `=体质*20+力量*10` 后直接确定，
 * 会得到 `=力量*10+体质*20`。数值完全等价，但**不保证原文逐字一致**——与 Python 行为相同
 * （其 `get_formula` 迭代属性列表，实测 HP → `=力量*10+敏捷*5+体质*20`）。
 */

/** 无任何可用属性时的兜底基础属性（对齐 Python `BASE_ATTRS`；仅兜底用，不作权威） */
export const DEFAULT_BASE_ATTRS: readonly string[] = ['力量', '智力', '敏捷', '体质']

/** 派生属性 → 各基础属性的默认影响系数（照抄 Python `BASE_ATTR_EFFECTS`，16 项，键名逐字一致） */
export const BASE_ATTR_EFFECTS: Readonly<Record<string, Readonly<Record<string, number>>>> = {
  HP: { 力量: 10, 体质: 20, 敏捷: 5 },
  MP: { 智力: 15, 体质: 5 },
  物攻: { 力量: 2, 敏捷: 1 },
  物防: { 力量: 0.5, 敏捷: 0.5, 体质: 2 },
  魔攻: { 智力: 3 },
  魔防: { 智力: 1, 体质: 1 },
  速度: { 敏捷: 2 },
  暴击率: { 敏捷: 0.4 },
  暴击伤害: { 敏捷: 0.5 },
  命中率: { 敏捷: 0.3 },
  闪避率: { 敏捷: 0.4 },
  '回血/回合': {},
  '回蓝/回合': {},
  经验值: {},
  金钱倍率: {},
  掉落稀有倍率: {}
}

/** 公式的一项系数（属性名 + 每点增量） */
export interface FormulaCoeffEntry {
  name: string
  coeff: number
}

export type ParseFormulaResult =
  | { ok: true; entries: FormulaCoeffEntry[] }
  | { ok: false; reason: string }

/** 纯常量公式：`0` / `100` / `-2.5` */
const CONSTANT_ONLY = /^[+-]?(\d+(\.\d+)?|\.\d+)$/

/**
 * 系数格式化，对齐 Python `str(int(v)) if v == int(v) else str(v)`。
 *
 * Python 侧的输入源是 `setDecimals(1)` 的 QDoubleSpinBox（值天然只有 1 位小数），
 * 故这里先按 1 位小数规范化，避免 JS 浮点残渣（如 0.1+0.2）产出 Python 侧不可能出现的串。
 * 系数有效范围 ±999（与 Python `setRange(-999, 999)` 一致），不会进入指数记数法区间。
 */
export function formatCoeff(coeff: number): string {
  if (!Number.isFinite(coeff)) return '0'
  return String(Math.round(coeff * 10) / 10)
}

/**
 * 系数 → 公式字符串。
 * - 按 `entries` 顺序输出（**不是**固定属性表顺序），跳过 0 系数项
 * - 全部为 0 时返回 `=0`（对齐 Python）
 * - 负系数产出 `属性*-1`，与 Python 一致；该写法可被 `attrPanel` 的算术求值器正确解析
 */
export function buildFormulaFromCoeffs(entries: readonly FormulaCoeffEntry[]): string {
  const parts = entries
    .filter((entry) => Number.isFinite(entry.coeff) && entry.coeff !== 0)
    .map((entry) => `${entry.name}*${formatCoeff(entry.coeff)}`)
  return parts.length > 0 ? `=${parts.join('+')}` : '=0'
}

/**
 * 解析公式为系数项，用于打开编辑器时回填。
 *
 * 只接受本编辑器**能无损表示**的形态：「属性*系数」以 `+` 连接的线性式（允许 `系数*属性` 的等价写法与空白）。
 * 其余形态（括号、除法、常量项、函数调用等）一律 `ok:false` 并给出中文原因 ——
 * **不猜、不降级**：静默把系数清零正是 Python 那个「点确定即覆盖」的缺陷成因。
 *
 * 已知限制：属性名本身含 `*` 或 `+` 时无法回填（Python 侧同样表示不了，其输出会是坏式子），
 * 此处按「无法识别的项」明确拒绝。
 */
export function parseFormulaToCoeffs(
  formula: unknown,
  attrNames: readonly string[]
): ParseFormulaResult {
  const raw = String(formula ?? '').trim()
  if (raw === '') return { ok: false, reason: '公式为空' }
  const body = (raw.startsWith('=') ? raw.slice(1) : raw).trim()
  if (body === '') return { ok: false, reason: '公式为空' }

  // 纯常量没有系数项：本编辑器无「常量项」输入位，重建会丢掉它 → 明确拒绝而非静默归零
  if (CONSTANT_ONLY.test(body)) {
    return { ok: false, reason: '公式是纯常量，没有可配置的系数' }
  }

  const vocabulary = new Set(attrNames)
  const found = new Map<string, number>()

  for (const rawTerm of body.split('+')) {
    const term = rawTerm.trim()
    if (term === '') return { ok: false, reason: '公式含空的加项' }

    const parts = term.split('*').map((part) => part.trim())
    if (parts.length !== 2) {
      return {
        ok: false,
        reason: `无法识别的项「${term}」（本编辑器只支持「属性*系数」相加的线性公式）`
      }
    }

    // 允许 `系数*属性` 的等价写法；两侧都像常量时按「系数在左」解释并交由词表校验属性名
    const left = CONSTANT_ONLY.test(parts[0])
    const name = left ? parts[1] : parts[0]
    const coeffText = left ? parts[0] : parts[1]

    if (!CONSTANT_ONLY.test(coeffText)) {
      return { ok: false, reason: `项「${term}」的系数不是数字` }
    }
    if (!vocabulary.has(name)) {
      return { ok: false, reason: `公式引用了未知属性「${name}」` }
    }
    if (found.has(name)) {
      return { ok: false, reason: `属性「${name}」在公式中出现多次，无法回填为单一系数` }
    }
    found.set(name, Number(coeffText))
  }

  return {
    ok: true,
    entries: attrNames.map((name) => ({ name, coeff: found.get(name) ?? 0 }))
  }
}

/** 派生属性的默认系数表（无该属性则空表，对齐 Python `BASE_ATTR_EFFECTS.get(name, {})`） */
export function defaultCoeffsFor(derivedName: string): Readonly<Record<string, number>> {
  return BASE_ATTR_EFFECTS[derivedName.trim()] ?? {}
}

/**
 * 解析编辑器要展示的属性列表（修正 Python 缺陷 3：调用方传入的列表从未被使用）。
 * 去空白、去空串、**同名保留首次出现**（Python 的 `coeff_spins` 是 dict，同名会互相覆盖）；
 * 结果为空时回落 `DEFAULT_BASE_ATTRS`，保证编辑器永远有可操作的行。
 */
export function resolveBuilderAttrs(availableAttrs: readonly string[] | null | undefined): string[] {
  const seen = new Set<string>()
  const result: string[] = []
  for (const raw of availableAttrs ?? []) {
    const name = String(raw ?? '').trim()
    if (name === '' || seen.has(name)) continue
    seen.add(name)
    result.push(name)
  }
  return result.length > 0 ? result : [...DEFAULT_BASE_ATTRS]
}

/** 打开编辑器时的初始状态 */
export interface FormulaBuilderInitial {
  entries: FormulaCoeffEntry[]
  /** 非空表示「原公式无法回填」，此时 entries 全为 0；调用方必须把它显示给用户 */
  warning: string | null
}

/**
 * 计算编辑器初始系数（修正 Python 缺陷 1：打开即回填原公式）。
 *
 * - 空公式（`''` / `0` / `=0`）→ 用默认系数表起手（保留 Python 的「新公式给贴心默认值」行为）
 * - 可回填 → 用**原公式的真实系数**，未出现的属性补 0
 * - 不可回填 → 全 0 + 警告（**不静默用默认值顶替**，因为那会让用户点确定时丢掉原公式）
 *
 * `derivedName` 仅用于默认系数查表；`availableAttrs` 同时作为属性词表（决定哪些名称算「已知」）。
 */
export function initialEntries(
  availableAttrs: readonly string[] | null | undefined,
  currentFormula: unknown,
  derivedName: string
): FormulaBuilderInitial {
  const attrs = resolveBuilderAttrs(availableAttrs)
  const text = String(currentFormula ?? '').trim()

  const zeros = (): FormulaCoeffEntry[] => attrs.map((name) => ({ name, coeff: 0 }))
  const fromDefaults = (): FormulaBuilderInitial => {
    const defaults = defaultCoeffsFor(derivedName)
    return {
      entries: attrs.map((name) => ({ name, coeff: defaults[name] ?? 0 })),
      warning: null
    }
  }

  // 空公式：无 original 内容可丢，用默认系数起手
  if (text === '' || text === '=0' || text === '0') return fromDefaults()

  const parsed = parseFormulaToCoeffs(text, attrs)
  if (parsed.ok) return { entries: parsed.entries, warning: null }

  return {
    entries: zeros(),
    warning: `当前公式「${text}」无法用系数编辑器表示（${parsed.reason}）。继续将替换为新的系数公式。`
  }
}
