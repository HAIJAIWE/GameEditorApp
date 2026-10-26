/**
 * 条目级属性面板（role/monster 的 attrpanel 字段，对应 旧版 AttributePanelWidget）：
 * - 存储形态与 旧版 一致：[{ name, category, formula }]；formula 为 "=力量*10+体质*20" 或纯数字文本，
 *   结果列不落盘；行内未知键（导入数据可能携带）原样保留
 * - 模板照抄 旧版 ATTR_TEMPLATES（role 7 套 / monster 4 套）；数据缺失或过滤后为空时套用第一套（新手/小怪）
 * - 明确改进 旧版 的两趟行序自算：改为行间依赖拓扑排序求值（前向引用可算）；环依赖/未定义名称/
 *   非法公式/除零给出中文错误（旧版 静默按 0）；重名取最后一行（与 旧版 results 覆盖语义一致）
 * - 公式语义与 旧版 一致：'=' 开头为算术表达式（属性名按原文替换后做 + - * / // % ** 与括号求值），
 *   否则按纯数字解析；每行结果 round 到 1 位小数并参与下游行计算（复刻 旧版 的舍入传播）
 */

/** 编辑行：三个字段均为文本；其余键（导入数据可能携带）原样保留 */
export interface AttrPanelRow {
  name: string
  category: string
  formula: string
  [key: string]: unknown
}

export type AttrPanelTemplateRow = Pick<AttrPanelRow, 'name' | 'category' | 'formula'>

/* ---- 模板（照抄 旧版 AttributePanelWidget.ATTR_TEMPLATES） ---- */

function templateRow(name: string, category: string, formula: string): AttrPanelTemplateRow {
  return { name, category, formula }
}

/**
 * 生成一套 17 行模板：基础 4（入参）+ 派生 7（固定公式）+ 战斗 6（入参，暴击/命中/闪避照抄 旧版 保留 1 位小数）
 * 旧版 源中 11 套模板的派生公式完全一致，仅基础值与战斗值不同，故以参数化生成减少转写误差。
 */
function buildTemplate(
  base: [number, number, number, number],
  combat: [number, number, number, number, number, number]
): AttrPanelTemplateRow[] {
  const [力量, 智力, 敏捷, 体质] = base
  const [暴击率, 暴击伤害, 命中率, 闪避率, 回血, 回蓝] = combat
  return [
    templateRow('力量', '基础', String(力量)),
    templateRow('智力', '基础', String(智力)),
    templateRow('敏捷', '基础', String(敏捷)),
    templateRow('体质', '基础', String(体质)),
    templateRow('HP', '派生', '=力量*10+体质*20+敏捷*5'),
    templateRow('MP', '派生', '=智力*15+体质*5'),
    templateRow('物攻', '派生', '=力量*2+敏捷*1'),
    templateRow('物防', '派生', '=力量*0.5+敏捷*0.5+体质*2'),
    templateRow('魔攻', '派生', '=智力*3'),
    templateRow('魔防', '派生', '=智力*1+体质*1'),
    templateRow('速度', '派生', '=敏捷*2'),
    templateRow('暴击率', '战斗', `=${暴击率.toFixed(1)}`),
    templateRow('暴击伤害', '战斗', `=${暴击伤害.toFixed(1)}`),
    templateRow('命中率', '战斗', `=${命中率.toFixed(1)}`),
    templateRow('闪避率', '战斗', `=${闪避率.toFixed(1)}`),
    templateRow('回血/回合', '战斗', `=${回血}`),
    templateRow('回蓝/回合', '战斗', `=${回蓝}`)
  ]
}

/** 属性面板模板：类型 id → 模板名 → 行列表（模板名与数值均照抄 旧版） */
export const ATTR_PANEL_TEMPLATES: Record<string, Record<string, AttrPanelTemplateRow[]>> = {
  role: {
    新手: buildTemplate([5, 5, 5, 5], [8.0, 154.0, 88.0, 6.0, 6, 3]),
    战士: buildTemplate([12, 3, 5, 10], [12.0, 161.0, 89.5, 4.8, 8, 2]),
    法师: buildTemplate([3, 14, 4, 4], [6.4, 154.0, 87.4, 4.8, 4, 8]),
    刺客: buildTemplate([6, 4, 14, 5], [17.6, 161.0, 91.6, 13.2, 4, 4]),
    射手: buildTemplate([5, 4, 12, 6], [14.4, 159.0, 90.4, 10.8, 5, 4]),
    牧师: buildTemplate([3, 12, 4, 8], [6.4, 154.0, 87.4, 4.8, 7, 7]),
    坦克: buildTemplate([8, 3, 3, 14], [4.8, 153.0, 86.8, 3.6, 12, 2])
  },
  monster: {
    小怪: buildTemplate([3, 2, 3, 4], [4.0, 152.0, 86.5, 3.0, 4, 1]),
    普通怪: buildTemplate([6, 4, 6, 8], [8.0, 157.0, 88.0, 6.0, 9, 3]),
    精英怪: buildTemplate([10, 8, 8, 14], [11.2, 161.0, 89.2, 8.4, 17, 6]),
    Boss: buildTemplate([20, 16, 12, 24], [16.0, 168.0, 90.8, 12.0, 40, 12])
  }
}

/** 该类型的默认模板行（第一套：role=新手 / monster=小怪）；无模板返回空数组（返回副本，避免共享引用） */
export function defaultAttrPanelRows(typeId: string): AttrPanelRow[] {
  const templates = ATTR_PANEL_TEMPLATES[typeId]
  const first = templates ? Object.values(templates)[0] : undefined
  return first ? first.map((row) => ({ ...row })) : []
}

/* ---- 快速添加与类别建议（对应 旧版 ALL_ATTR_NAMES + _on_quick_add 预置） ---- */

export const ATTR_PANEL_CATEGORY_SUGGESTIONS = ['基础', '派生', '战斗', '奖励', '自定义']

const BASE_ATTR_NAMES = ['力量', '智力', '敏捷', '体质']
const DERIVED_ATTR_NAMES = ['HP', 'MP', '物攻', '物防', '魔攻', '魔防', '速度']
const COMBAT_ATTR_NAMES = ['暴击率', '暴击伤害', '命中率', '闪避率', '回血/回合', '回蓝/回合']
const REWARD_ATTR_NAMES = ['经验值', '金钱倍率', '掉落稀有倍率']

/** 快速添加候选：名称 + 类别 + 公式（基础属性公式为 "0"，其余为 "=0"，与 旧版 一致） */
export const ATTR_PANEL_QUICK_ADD: AttrPanelTemplateRow[] = [
  ...BASE_ATTR_NAMES.map((name) => templateRow(name, '基础', '0')),
  ...DERIVED_ATTR_NAMES.map((name) => templateRow(name, '派生', '=0')),
  ...COMBAT_ATTR_NAMES.map((name) => templateRow(name, '战斗', '=0')),
  ...REWARD_ATTR_NAMES.map((name) => templateRow(name, '奖励', '=0'))
]

/* ---- 编辑行 ↔ 存储转换 ---- */

/** 存储值 → 编辑行（对应 旧版 load_data：非对象与空名称行过滤、缺省类别/公式补齐） */
export function attrPanelToRows(value: unknown): AttrPanelRow[] {
  if (!Array.isArray(value)) return []
  const rows: AttrPanelRow[] = []
  for (const entry of value) {
    if (entry === null || typeof entry !== 'object' || Array.isArray(entry)) continue
    const record = entry as Record<string, unknown>
    const name = String(record['name'] ?? '').trim()
    if (name === '') continue
    const category = String(record['category'] ?? '').trim()
    const formula = String(record['formula'] ?? '').trim()
    rows.push({ ...record, name, category: category === '' ? '自定义' : category, formula: formula === '' ? '0' : formula })
  }
  return rows
}

/**
 * 编辑行 → 存储数组（对应 旧版 get_data/_on_cell_changed）：
 * 空名称行忽略、名称/类别/公式去空白、类别空 → "自定义"、公式空 → "0"；行内未知键保留。
 */
export function rowsToAttrPanel(rows: AttrPanelRow[]): Record<string, unknown>[] {
  const result: Record<string, unknown>[] = []
  for (const row of rows) {
    const name = String(row.name ?? '').trim()
    if (name === '') continue
    const category = String(row.category ?? '').trim() || '自定义'
    const formula = String(row.formula ?? '').trim() || '0'
    result.push({ ...row, name, category, formula })
  }
  return result
}

/* ---- 公式求值（属性名替换 + 纯算术递归下降） ---- */

export interface AttrPanelEvaluation {
  /** 每行计算结果（与入参等长；错误行为 0） */
  values: number[]
  /** 每行错误信息（null 表示正常） */
  errors: Array<string | null>
}

/** 标识符字符（ASCII 字母数字下划线 + CJK）：属性名替换的边界判断，与 旧版 \b 语义对齐 */
const IDENTIFIER_CHAR = /[0-9A-Za-z_\u3400-\u9fff]/
const LEFTOVER_IDENTIFIER = /[A-Za-z_\u3400-\u9fff][0-9A-Za-z_\u3400-\u9fff]*/
const NUMBER_LITERAL = /^(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?/

export function evaluateAttrPanel(rows: AttrPanelRow[]): AttrPanelEvaluation {
  const errors: Array<string | null> = rows.map(() => null)
  const values: number[] = rows.map(() => 0)

  // 规范行：名称 → 行号（重名取最后一行，与 旧版 results 覆盖语义一致）
  const canonical = new Map<string, number>()
  rows.forEach((row, index) => {
    const name = String(row.name ?? '').trim()
    if (name !== '') canonical.set(name, index)
  })
  const knownNames = [...canonical.keys()].sort((a, b) => b.length - a.length)

  const analyzed = new Map<number, AnalyzedFormula>()
  for (const index of canonical.values()) {
    analyzed.set(index, analyzeFormula(rows[index].formula, knownNames))
  }
  for (const index of canonical.values()) {
    const formula = analyzed.get(index)
    if (formula?.error) errors[index] = formula.error
  }

  const depsOf = (index: number): number[] => {
    const refs = analyzed.get(index)?.refs ?? []
    return refs.map((ref) => canonical.get(ref)).filter((dep): dep is number => dep !== undefined)
  }

  // 拓扑排序（Kahn）：未入序的即环或依赖环
  const { order, leftover } = topoOrder([...canonical.values()], depsOf)
  const cyclic = classifyCycleNodes(leftover, depsOf)
  const cyclicNames = [...cyclic].map((index) => String(rows[index]?.name ?? '').trim()).filter(Boolean)
  for (const index of leftover) {
    if (errors[index] !== null) continue
    errors[index] = cyclic.has(index)
      ? `循环依赖：${cyclicNames.join('、')}`
      : '依赖的属性存在循环依赖，无法计算'
  }

  // 求值：先规范行（拓扑序），再无名行（行序追加，不注册为变量）
  const context = new Map<string, number>()
  const unnamed = rows.map((_, index) => index).filter((index) => String(rows[index]?.name ?? '').trim() === '')
  for (const index of [...order, ...unnamed]) {
    if (errors[index] !== null) continue
    const formula = analyzed.get(index) ?? analyzeFormula(rows[index]?.formula, knownNames)
    const missing = formula.refs.find((ref) => !context.has(ref))
    if (missing !== undefined) {
      errors[index] = `依赖的属性「${missing}」无法计算`
      continue
    }
    let value: number
    if (formula.constant !== null) {
      value = roundTo1(formula.constant)
    } else {
      const substituted = substituteNames(formula.body, knownNames, (name) => context.get(name) ?? 0)
      const result = evaluateArithmeticExpression(substituted.text)
      if (result.error !== null) {
        errors[index] = result.error
        continue
      }
      value = roundTo1(result.value)
    }
    values[index] = value
    const name = String(rows[index]?.name ?? '').trim()
    if (name !== '' && canonical.get(name) === index) context.set(name, value)
  }

  // 重名行（非规范行）：展示规范行结果（含错误）
  rows.forEach((row, index) => {
    const name = String(row.name ?? '').trim()
    if (name === '') return
    const canonicalIndex = canonical.get(name)
    if (canonicalIndex !== undefined && canonicalIndex !== index) {
      values[index] = values[canonicalIndex]
      errors[index] = errors[canonicalIndex]
    }
  })

  return { values, errors }
}

interface AnalyzedFormula {
  /** 公式体（'=' 后文本；纯数字公式为数字文本） */
  body: string
  /** 数值常量（空公式/纯数字公式），否则 null */
  constant: number | null
  /** 引用到的属性名（按名称长度降序的匹配结果） */
  refs: string[]
  error: string | null
}

/** 静态解析：形式归类、引用收集（占位替换）与未定义名称诊断 */
function analyzeFormula(formula: unknown, names: string[]): AnalyzedFormula {
  const text = String(formula ?? '').trim()
  if (text === '') return { body: '0', constant: 0, refs: [], error: null }
  if (!text.startsWith('=')) {
    const numeric = Number(text)
    return Number.isFinite(numeric)
      ? { body: String(numeric), constant: numeric, refs: [], error: null }
      : { body: '0', constant: null, refs: [], error: `公式「${text}」不是数字` }
  }
  const body = text.slice(1)
  const substituted = substituteNames(body, names, () => 0)
  const leftover = substituted.text.match(LEFTOVER_IDENTIFIER)
  if (leftover) {
    return { body, constant: null, refs: substituted.matched, error: `公式包含未定义的属性名：${leftover[0]}` }
  }
  return { body, constant: null, refs: substituted.matched, error: null }
}

/** 属性名替换（按长度降序尝试；边界=前后不得为标识符字符）；返回替换文本与命中的名称 */
function substituteNames(
  expr: string,
  names: string[],
  valueOf: (name: string) => number
): { text: string; matched: string[] } {
  const matched: string[] = []
  let text = ''
  let index = 0
  while (index < expr.length) {
    let hit: string | null = null
    for (const name of names) {
      if (!expr.startsWith(name, index)) continue
      const before = index === 0 ? '' : expr[index - 1]
      const after = expr[index + name.length] ?? ''
      if ((before === '' || !IDENTIFIER_CHAR.test(before)) && (after === '' || !IDENTIFIER_CHAR.test(after))) {
        hit = name
        break
      }
    }
    if (hit !== null) {
      const value = valueOf(hit)
      text += value < 0 ? `(${value})` : String(value)
      index += hit.length
      if (!matched.includes(hit)) matched.push(hit)
    } else {
      text += expr[index]
      index += 1
    }
  }
  return { text, matched }
}

/** 结果舍入到 1 位小数（复刻 旧版 round(x, 1)；银行家舍入差异可忽略） */
function roundTo1(value: number): number {
  return Math.round(value * 10) / 10
}

/** 纯算术表达式求值（递归下降；仅数字、属性值、+ - * / // % ** 与括号） */
function evaluateArithmeticExpression(expr: string): { value: number; error: string | null } {
  try {
    return { value: new ArithmeticParser(expr).parse(), error: null }
  } catch (error) {
    return { value: 0, error: error instanceof Error ? error.message : String(error) }
  }
}

class ArithmeticParser {
  private position = 0

  constructor(private readonly text: string) {}

  parse(): number {
    const value = this.parseExpression()
    this.skipSpaces()
    if (this.position < this.text.length) {
      throw new Error(`无法解析的符号「${this.text[this.position]}」`)
    }
    if (!Number.isFinite(value)) throw new Error('计算结果不是有效数字')
    return value
  }

  /** expression := term (('+' | '-') term)* */
  private parseExpression(): number {
    let value = this.parseTerm()
    for (;;) {
      this.skipSpaces()
      if (this.consume('+')) value += this.parseTerm()
      else if (this.consume('-')) value -= this.parseTerm()
      else return value
    }
  }

  /** term := factor (('*' | '/' | '//' | '%') factor)* */
  private parseTerm(): number {
    let value = this.parseFactor()
    for (;;) {
      this.skipSpaces()
      if (this.consume('//')) value = this.floorDivide(value, this.parseFactor())
      else if (this.consume('%')) value = this.modulo(value, this.parseFactor())
      else if (this.consume('/')) value = this.divide(value, this.parseFactor())
      else if (this.consume('*')) value *= this.parseFactor()
      else return value
    }
  }

  /** factor := ('+' | '-') factor | power */
  private parseFactor(): number {
    this.skipSpaces()
    if (this.consume('+')) return this.parseFactor()
    if (this.consume('-')) return -this.parseFactor()
    return this.parsePower()
  }

  /** power := atom ('**' factor)*（右结合，指数可为一元表达式，与 旧版 优先级一致） */
  private parsePower(): number {
    const base = this.parseAtom()
    this.skipSpaces()
    if (this.consume('**')) {
      const value = base ** this.parseFactor()
      if (!Number.isFinite(value)) throw new Error('计算结果不是有效数字')
      return value
    }
    return base
  }

  /** atom := number | '(' expression ')' */
  private parseAtom(): number {
    this.skipSpaces()
    if (this.consume('(')) {
      const value = this.parseExpression()
      this.skipSpaces()
      if (!this.consume(')')) throw new Error('括号不匹配')
      return value
    }
    const match = NUMBER_LITERAL.exec(this.text.slice(this.position))
    if (!match) {
      const symbol = this.text[this.position]
      throw new Error(symbol === undefined ? '公式不完整' : `无法解析的符号「${symbol}」`)
    }
    this.position += match[0].length
    return Number(match[0])
  }

  private divide(left: number, right: number): number {
    if (right === 0) throw new Error('除数为 0')
    return left / right
  }

  private floorDivide(left: number, right: number): number {
    if (right === 0) throw new Error('除数为 0')
    return Math.floor(left / right)
  }

  private modulo(left: number, right: number): number {
    if (right === 0) throw new Error('除数为 0')
    return left % right
  }

  private consume(token: string): boolean {
    if (this.text.startsWith(token, this.position)) {
      this.position += token.length
      return true
    }
    return false
  }

  private skipSpaces(): void {
    while (this.position < this.text.length && /\s/.test(this.text[this.position])) this.position += 1
  }
}

/** Kahn 拓扑排序：order 为可求值序，leftover 为环及依赖环的成员 */
function topoOrder(indices: number[], depsOf: (index: number) => number[]): { order: number[]; leftover: number[] } {
  const indexSet = new Set(indices)
  const inDegree = new Map<number, number>()
  const dependents = new Map<number, number[]>()
  for (const index of indices) {
    inDegree.set(index, 0)
    dependents.set(index, [])
  }
  for (const index of indices) {
    for (const dep of depsOf(index)) {
      if (!indexSet.has(dep)) continue
      inDegree.set(index, (inDegree.get(index) ?? 0) + 1)
      dependents.get(dep)?.push(index)
    }
  }
  const queue = indices.filter((index) => inDegree.get(index) === 0)
  const order: number[] = []
  while (queue.length > 0) {
    const index = queue.shift() as number
    order.push(index)
    for (const dependent of dependents.get(index) ?? []) {
      const remaining = (inDegree.get(dependent) ?? 0) - 1
      inDegree.set(dependent, remaining)
      if (remaining === 0) queue.push(dependent)
    }
  }
  const ordered = new Set(order)
  return { order, leftover: indices.filter((index) => !ordered.has(index)) }
}

/** 在 leftover 集合内沿依赖边搜索自环，标记真正处于环上的节点 */
function classifyCycleNodes(leftover: number[], depsOf: (index: number) => number[]): Set<number> {
  const leftoverSet = new Set(leftover)
  const cyclic = new Set<number>()
  for (const start of leftover) {
    const seen = new Set<number>([start])
    const stack = depsOf(start).filter((dep) => leftoverSet.has(dep))
    while (stack.length > 0) {
      const current = stack.pop() as number
      if (current === start) {
        cyclic.add(start)
        break
      }
      if (seen.has(current)) continue
      seen.add(current)
      for (const dep of depsOf(current)) {
        if (leftoverSet.has(dep)) stack.push(dep)
      }
    }
  }
  return cyclic
}