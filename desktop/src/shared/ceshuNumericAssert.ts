import { CHAPTER_LABELS, type CeshuDocument } from './ceshuConstants'

/**
 * 数值断言执行器 —— 把 `numeric.numeric_assertions` 从「文档字段」升级为「可复算检查」。
 *
 * ## 解决什么问题（2026-10-24 对标豆包《微光之塔》后的改造）
 * 此前数值章只有公式与原则的**自由文本**：「首转生恰得 3 星光」写归写，算错没人知道。
 * 标杆的做法是把设计目标写成契约里的 `numerical_assertions`（表达式 + 期望值 + 容差 +
 * 接受条件），并由 `numerical_validation.py` **真的复算**。本模块补上这一环：
 * 校验时逐条代入参数表求值，与文中声明值比对、按接受条件判定，不符即报错。
 *
 * ## 安全边界（为什么不能用 eval）
 * 表达式来自 **AI 生成的文档内容**，是不可信输入。因此这里是一个**白名单式的
 * 小型求值器**（词法分析 + 递归下降解析），只认：数字、参数名、`+ - * / ^ ( ) ,`
 * 与 10 个数学函数；成员访问、字符串、调用其它标识符在词法层就不存在。
 * 另设表达式长度与括号嵌套深度上限，防病态输入。
 *
 * ## 严重度口径（与校验面板同一套分类，见 ceshuValidationGroups）
 * - `一致性冲突`（error）：复算值与文中声明不符 / 未通过验收条件——文档自身矛盾；
 * - `格式异常`（error）：表达式无法解析、引用了未登记的参数——契约被破坏；
 * - `复算跳过`（warning）：依赖的参数当前值非数值（如「待确认」）——如实告知但不惩罚。
 */

/** 表达式长度上限（防病态输入；正常断言表达式 < 100 字符） */
const MAX_EXPRESSION_LENGTH = 200

/** 括号/函数嵌套深度上限（递归下降的栈保护） */
const MAX_PARSE_DEPTH = 64

/** 白名单数学函数（对齐数值复算的常用需求；多一个都不行） */
const ALLOWED_FUNCTIONS: ReadonlyMap<string, { arity: number | 'variadic'; fn: (...args: number[]) => number }> = new Map([
  ['floor', { arity: 1, fn: Math.floor }],
  ['ceil', { arity: 1, fn: Math.ceil }],
  ['round', { arity: 1, fn: Math.round }],
  ['abs', { arity: 1, fn: Math.abs }],
  ['sqrt', { arity: 1, fn: Math.sqrt }],
  ['exp', { arity: 1, fn: Math.exp }],
  ['log', { arity: 1, fn: Math.log }],
  ['min', { arity: 'variadic', fn: Math.min }],
  ['max', { arity: 'variadic', fn: Math.max }],
  ['pow', { arity: 2, fn: Math.pow }]
])

/** 有限数比较的 epsilon（浮点误差容差，如 0.1+0.2） */
const EPSILON = 1e-9

// ---------- 参数表解析 ----------

/**
 * 从参数行的「当前值」格取数：`10` / `4次/秒` / `×1.2` / `约0.5` → 数值；`待确认` → null。
 * 只取**首个数字**（当前值格本就是单值；`1.55→1.65` 这类调参范围在别的列）。
 */
export function parseParameterValue(raw: string): number | null {
  const stripped = raw.trim().replace(/^[×x~≈约\s]+/, '')
  const match = /^(-?\d+(?:\.\d+)?)/.exec(stripped)
  if (match === null) return null
  const value = Number(match[1])
  return Number.isFinite(value) ? value : null
}

/** 参数表行 → 参数名 → 数值（无数值的行跳过，调用方需要「有名无数」集合时用 extractParameterRefs + 原表） */
export function parseNumericParameters(rows: readonly unknown[]): Map<string, number> {
  const params = new Map<string, number>()
  for (const row of rows) {
    if (typeof row !== 'string') continue
    const columns = row.split('|').map((column) => column.trim())
    const name = columns[0] ?? ''
    if (name === '') continue
    const value = parseParameterValue(columns[1] ?? '')
    if (value !== null) params.set(name, value)
  }
  return params
}

/** 参数表里登记过的全部参数名（含当前值非数值的，如「待确认」）——用于区分「未登记」与「无数值」 */
export function parseParameterNames(rows: readonly unknown[]): Set<string> {
  const names = new Set<string>()
  for (const row of rows) {
    if (typeof row !== 'string') continue
    const name = (row.split('|')[0] ?? '').trim()
    if (name !== '') names.add(name)
  }
  return names
}

// ---------- 安全求值器（词法 + 递归下降） ----------

type Token =
  | { kind: 'number'; value: number }
  | { kind: 'identifier'; value: string }
  | { kind: 'operator'; value: string }

const OPERATOR_CHARS = '+-*/^(),'

function tokenize(expression: string): Token[] | string {
  const tokens: Token[] = []
  let index = 0
  while (index < expression.length) {
    const char = expression[index] as string
    if (char === ' ' || char === '\t') {
      index += 1
      continue
    }
    if (/[0-9.]/.test(char)) {
      const match = /^[0-9]+(?:\.[0-9]+)?/.exec(expression.slice(index))
      if (match === null) return `无法识别的数字 '${char}'`
      tokens.push({ kind: 'number', value: Number(match[0]) })
      index += match[0].length
      continue
    }
    if (/[\u4e00-\u9fa5A-Za-z_]/.test(char)) {
      const match = /^[\u4e00-\u9fa5A-Za-z_][\u4e00-\u9fa5A-Za-z0-9_]*/.exec(expression.slice(index))
      if (match === null) return `无法识别的字符 '${char}'`
      tokens.push({ kind: 'identifier', value: match[0] })
      index += match[0].length
      continue
    }
    if (OPERATOR_CHARS.includes(char)) {
      tokens.push({ kind: 'operator', value: char })
      index += 1
      continue
    }
    return `无法识别的字符 '${char}'`
  }
  return tokens
}

/** 提取表达式引用的标识符（剔除白名单函数名）——供「有名无数」预检用 */
export function extractIdentifiers(expression: string): string[] {
  const tokens = tokenize(expression)
  if (typeof tokens === 'string') return []
  const names: string[] = []
  for (const token of tokens) {
    if (token.kind !== 'identifier') continue
    if (ALLOWED_FUNCTIONS.has(token.value)) continue
    if (!names.includes(token.value)) names.push(token.value)
  }
  return names
}

/**
 * 递归下降求值。语法：
 * ```
 * expr    := term (('+' | '-') term)*
 * term    := unary (('*' | '/') unary)*
 * unary   := '-' unary | power
 * power   := primary ('^' unary)?          // 右结合，且允许负指数
 * primary := number | identifier | identifier '(' args ')' | '(' expr ')'
 * ```
 */
class ExpressionParser {
  private index = 0
  private depth = 0

  constructor(
    private readonly tokens: readonly Token[],
    private readonly params: ReadonlyMap<string, number>
  ) {}

  parse(): number | string {
    if (this.tokens.length === 0) return '表达式为空'
    const value = this.parseExpression()
    if (typeof value === 'string') return value
    const leftover = this.tokens[this.index]
    if (leftover !== undefined) return `多余的内容 '${this.describe(leftover)}'`
    return value
  }

  private parseExpression(): number | string {
    let left = this.parseTerm()
    if (typeof left === 'string') return left
    for (;;) {
      const token = this.peek()
      if (token?.kind !== 'operator' || (token.value !== '+' && token.value !== '-')) break
      this.index += 1
      const right = this.parseTerm()
      if (typeof right === 'string') return right
      left = token.value === '+' ? left + right : left - right
    }
    return left
  }

  private parseTerm(): number | string {
    let left = this.parseUnary()
    if (typeof left === 'string') return left
    for (;;) {
      const token = this.peek()
      if (token?.kind !== 'operator' || (token.value !== '*' && token.value !== '/')) break
      this.index += 1
      const right = this.parseUnary()
      if (typeof right === 'string') return right
      if (token.value === '/' && Math.abs(right) < EPSILON) return '除零'
      left = token.value === '*' ? left * right : left / right
    }
    return left
  }

  private parseUnary(): number | string {
    const token = this.peek()
    if (token?.kind === 'operator' && token.value === '-') {
      this.index += 1
      const value = this.parseUnary()
      if (typeof value === 'string') return value
      return -value
    }
    return this.parsePower()
  }

  private parsePower(): number | string {
    const base = this.parsePrimary()
    if (typeof base === 'string') return base
    const token = this.peek()
    if (token?.kind === 'operator' && token.value === '^') {
      this.index += 1
      const exponent = this.parseUnary() // 右结合：2^3^2 = 2^(3^2)
      if (typeof exponent === 'string') return exponent
      return base ** exponent
    }
    return base
  }

  private parsePrimary(): number | string {
    const token = this.peek()
    if (token === undefined) return '表达式意外结束'
    this.depth += 1
    if (this.depth > MAX_PARSE_DEPTH) {
      this.depth -= 1
      return '嵌套层级过深'
    }
    try {
      if (token.kind === 'number') {
        this.index += 1
        return token.value
      }
      if (token.kind === 'operator' && token.value === '(') {
        this.index += 1
        const inner = this.parseExpression()
        if (typeof inner === 'string') return inner
        const closing = this.peek()
        if (closing?.kind !== 'operator' || closing.value !== ')') return '缺少右括号'
        this.index += 1
        return inner
      }
      if (token.kind === 'identifier') {
        this.index += 1
        const next = this.peek()
        if (next?.kind === 'operator' && next.value === '(') return this.parseCall(token.value)
        const value = this.params.get(token.value)
        if (value === undefined) return `未登记的参数 '${token.value}'`
        return value
      }
      return `意外内容 '${this.describe(token)}'`
    } finally {
      this.depth -= 1
    }
  }

  private parseCall(name: string): number | string {
    const entry = ALLOWED_FUNCTIONS.get(name)
    if (entry === undefined) return `不允许的函数 '${name}'`
    this.index += 1 // 吃掉 '('
    const args: number[] = []
    for (;;) {
      const closing = this.peek()
      if (closing?.kind === 'operator' && closing.value === ')') {
        this.index += 1
        break
      }
      if (args.length > 0) {
        const comma = this.peek()
        if (comma?.kind !== 'operator' || comma.value !== ',') return `函数 '${name}' 参数分隔符缺失`
        this.index += 1
      }
      const value = this.parseExpression()
      if (typeof value === 'string') return value
      args.push(value)
      if (args.length > 16) return `函数 '${name}' 参数过多`
    }
    if (entry.arity !== 'variadic' && args.length !== entry.arity) {
      return `函数 '${name}' 需要 ${entry.arity} 个参数，收到 ${args.length} 个`
    }
    return entry.fn(...args)
  }

  private peek(): Token | undefined {
    return this.tokens[this.index]
  }

  private describe(token: Token): string {
    return token.kind === 'number' ? String(token.value) : token.value
  }
}

/** 安全求值：表达式 + 参数表 → 数值；任何失败都返回可读原因（不抛异常） */
export function evaluateExpression(
  expression: string,
  params: ReadonlyMap<string, number>
): { ok: true; value: number } | { ok: false; error: string } {
  const trimmed = expression.trim()
  if (trimmed === '') return { ok: false, error: '表达式为空' }
  if (trimmed.length > MAX_EXPRESSION_LENGTH) return { ok: false, error: '表达式过长' }
  const tokens = tokenize(trimmed)
  if (typeof tokens === 'string') return { ok: false, error: tokens }
  const result = new ExpressionParser(tokens, params).parse()
  if (typeof result === 'string') return { ok: false, error: result }
  if (!Number.isFinite(result)) return { ok: false, error: '计算结果不是有限数' }
  return { ok: true, value: result }
}

// ---------- 验收条件 ----------

type Acceptance =
  | { op: '==' | '!=' | '>=' | '<=' | '>' | '<'; value: number }
  | { op: 'between'; min: number; max: number }

/** 解析接受条件：`==2` / `>=0` / `<10` / `between 1.5-2.5`；无法识别返回 null（跳过该项判定） */
export function parseAcceptance(raw: string): Acceptance | null {
  const trimmed = raw.trim()
  if (trimmed === '') return null
  const between = /^between\s+(-?[0-9]+(?:\.[0-9]+)?)\s*[-~]\s*(-?[0-9]+(?:\.[0-9]+)?)$/i.exec(trimmed)
  if (between !== null) {
    return { op: 'between', min: Number(between[1]), max: Number(between[2]) }
  }
  const comparison = /^(==|=|>=|<=|!=|>|<)\s*(-?[0-9]+(?:\.[0-9]+)?)$/.exec(trimmed)
  if (comparison === null) return null
  const operator = (comparison[1] === '=' ? '==' : comparison[1]) as '==' | '>=' | '<=' | '!=' | '>' | '<'
  return { op: operator, value: Number(comparison[2]) }
}

function acceptanceHolds(acceptance: Acceptance, value: number): boolean {
  switch (acceptance.op) {
    case '==':
      return Math.abs(value - acceptance.value) < EPSILON
    case '!=':
      return Math.abs(value - acceptance.value) >= EPSILON
    case '>=':
      return value >= acceptance.value
    case '<=':
      return value <= acceptance.value
    case '>':
      return value > acceptance.value
    case '<':
      return value < acceptance.value
    case 'between':
      return value >= acceptance.min && value <= acceptance.max
  }
}

// ---------- 主检查 ----------

function toRows(value: unknown): unknown[] {
  return Array.isArray(value) ? value : []
}

/** 数值展示：抹掉浮点尾差（4.499999999 → 4.5），保留可读精度 */
function formatNumber(value: number): string {
  return String(Math.round(value * 1e6) / 1e6)
}

/**
 * 校验 `numeric.numeric_assertions`：逐条代入参数表复算。
 *
 * 行格式（pipeList）：`断言|表达式|期望值|容差|接受条件`，后两列可缺省。
 * 参数表行格式：`参数|当前值|合法范围|调高影响|调低影响`。
 */
export function checkNumericAssertions(doc: CeshuDocument): string[] {
  const messages: string[] = []
  const parameterRows = toRows(doc.numeric.numeric_parameters)
  const assertionRows = toRows(doc.numeric.numeric_assertions)
  if (assertionRows.length === 0) return messages

  const label = CHAPTER_LABELS.numeric
  const params = parseNumericParameters(parameterRows)
  const knownNames = parseParameterNames(parameterRows)

  for (const row of assertionRows) {
    if (typeof row !== 'string' || row.trim() === '') continue
    const columns = row.split('|').map((column) => column.trim())
    const statement = columns[0] ?? ''
    const expression = columns[1] ?? ''
    const tag = statement === '' ? expression : statement
    if (expression === '') continue

    // 预检：依赖的参数「有名无数」（如当前值是「待确认」）→ 跳过并如实告知（warning 级）
    const valueless = extractIdentifiers(expression).filter((name) => knownNames.has(name) && !params.has(name))
    if (valueless.length > 0) {
      messages.push(`复算跳过：${label} 数值断言「${tag}」依赖的参数 ${valueless.join('、')} 无数值（待确认），跳过复算`)
      continue
    }

    const evaluated = evaluateExpression(expression, params)
    if (!evaluated.ok) {
      messages.push(`格式异常：${label} 数值断言「${tag}」无法复算（${evaluated.error}）：${expression}`)
      continue
    }
    const value = evaluated.value

    // 与文中声明值比对（尊重容差）
    const declared = parseParameterValue(columns[2] ?? '')
    const tolerance = parseParameterValue(columns[3] ?? '') ?? 0
    if (declared !== null && Math.abs(value - declared) > tolerance + EPSILON) {
      messages.push(
        `一致性冲突：${label} 数值断言「${tag}」复算不符：表达式「${expression}」计算得 ${formatNumber(value)}，文中声明 ${declared}（容差 ${formatNumber(tolerance)}）`
      )
    }

    // 按接受条件判定设计目标是否成立
    const acceptanceRaw = columns[4] ?? ''
    const acceptance = parseAcceptance(acceptanceRaw)
    if (acceptance !== null && !acceptanceHolds(acceptance, value)) {
      messages.push(
        `一致性冲突：${label} 数值断言「${tag}」未通过验收条件：计算得 ${formatNumber(value)}，要求 ${acceptanceRaw}`
      )
    }
  }

  return messages
}
