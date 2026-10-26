import { CHAPTER_LABELS, type CeshuDocument } from './ceshuConstants'
import { normalizeAcceptanceResult } from './ceshuEvidence'
import { EPSILON, column, splitRow, toRows } from './ceshuPipeRows'

/**
 * 数值断言执行器 —— 把 `numeric.numeric_assertions` 从「文档字段」升级为「可复算检查」。
 *
 * ## 解决什么问题（2026-10-24 对标豆包《微光之塔》后的改造）
 * 此前数值章只有公式与原则的**自由文本**：「首转生恰得 3 星光」写归写，算错没人知道。
 * 标杆的做法是把设计目标写成契约里的 `numerical_assertions`（表达式 + 期望值 + 容差 +
 * 接受条件），并由 `numerical_validation` **真的复算**。本模块补上这一环：
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
    const columns = splitRow(row)
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
    const name = column(row, 0)
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
  return evaluateAssertions(doc).flatMap((result) => result.messages)
}

/** 单条断言的复算结论（claim→证据 核对要用「是否通过」，不能只看消息列表） */
export interface AssertionResult {
  statement: string
  /**
   * pass = 复算值与声明一致且通过接受条件；
   * fail = 复算不符或验收不通过；
   * skip = 依赖的参数无数值（待确认），未复算；
   * error = 表达式无法解析（含引用未登记参数）。
   */
  status: 'pass' | 'fail' | 'skip' | 'error'
  messages: string[]
}

/** 逐条复算断言，返回结构化结论（checkNumericAssertions 与 checkDesignClaims 共用） */
export function evaluateAssertions(doc: CeshuDocument): AssertionResult[] {
  const parameterRows = toRows(doc.numeric.numeric_parameters)
  const assertionRows = toRows(doc.numeric.numeric_assertions)
  if (assertionRows.length === 0) return []

  const label = CHAPTER_LABELS.numeric
  const params = parseNumericParameters(parameterRows)
  const knownNames = parseParameterNames(parameterRows)
  const results: AssertionResult[] = []

  for (const row of assertionRows) {
    const columns = splitRow(row)
    const statement = columns[0] ?? ''
    const expression = columns[1] ?? ''
    const tag = statement === '' ? expression : statement
    if (expression === '') continue

    // 预检：依赖的参数「有名无数」（如当前值是「待确认」）→ 跳过并如实告知（warning 级）
    const valueless = extractIdentifiers(expression).filter((name) => knownNames.has(name) && !params.has(name))
    if (valueless.length > 0) {
      results.push({
        statement,
        status: 'skip',
        messages: [`复算跳过：${label} 数值断言「${tag}」依赖的参数 ${valueless.join('、')} 无数值（待确认），跳过复算`]
      })
      continue
    }

    const evaluated = evaluateExpression(expression, params)
    if (!evaluated.ok) {
      results.push({
        statement,
        status: 'error',
        messages: [`格式异常：${label} 数值断言「${tag}」无法复算（${evaluated.error}）：${expression}`]
      })
      continue
    }
    const value = evaluated.value
    const messages: string[] = []

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

    results.push({ statement, status: messages.length === 0 ? 'pass' : 'fail', messages })
  }

  return results
}

/**
 * 设计主张的证据核对（`numeric.design_claims`）依赖两样预计算产物：数值断言
 * 复算结论（`evaluateAssertions`）与 QA 原型验收映射。为避免校验链路重复复算，
 * 二者都收口到校验上下文——本函数抽取其中的原型验收映射，供主张核对复用。
 * 判定规则见 `checkDesignClaims`。
 */
/** QA 章「原型验收记录」（检查项 → 结果）映射，供实测类主张核对（也供校验上下文复用，避免重复构建） */
export function buildPrototypeResults(doc: CeshuDocument): Map<string, string> {
  const prototypeResults = new Map<string, string>()
  for (const row of toRows(doc.qa.prototype_acceptance)) {
    const columns = splitRow(row)
    const check = columns[0] ?? ''
    if (check !== '') prototypeResults.set(check, columns[1] ?? '')
  }
  return prototypeResults
}

/**
 * 设计主张证据核对（`numeric.design_claims`，行格式 `主张|强度|证据`）。
 * 基于**预计算**的断言结论与原型验收映射，避免校验链路重复复算 evaluateAssertions。
 * 判定规则见下方 checkDesignClaims 注释。
 */
export function checkDesignClaimsWith(
  doc: CeshuDocument,
  assertionResults: AssertionResult[],
  prototypeResults: Map<string, string>
): string[] {
  const claimRows = toRows(doc.numeric.design_claims)
  if (claimRows.length === 0) return []

  const label = CHAPTER_LABELS.numeric
  const byStatement = new Map(assertionResults.map((result) => [result.statement, result]))
  const messages: string[] = []

  for (const row of claimRows) {
    const columns = splitRow(row)
    const claim = columns[0] ?? ''
    if (claim === '') continue
    const strengthRaw = columns[1] ?? ''
    const strength = strengthRaw.toLowerCase()
    const evidence = columns[2] ?? ''

    if (evidence === '') {
      messages.push(`一致性警告：${label} 设计主张「${claim}」没有证据，请补证据或标注为假设`)
      continue
    }

    if (strength === '计算' || strength === 'calculated' || strength === '复算') {
      const hit = byStatement.get(evidence)
      if (hit === undefined) {
        messages.push(
          `一致性冲突：${label} 设计主张「${claim}」标注为计算，但证据「${evidence}」不在数值断言表中（无法复算）`
        )
        continue
      }
      if (hit.status === 'fail') {
        messages.push(`一致性冲突：${label} 设计主张「${claim}」的证据断言「${evidence}」未通过复算，主张不成立`)
      } else if (hit.status === 'error') {
        messages.push(`格式异常：${label} 设计主张「${claim}」的证据断言「${evidence}」无法解析，主张无法验证`)
      } else if (hit.status === 'skip') {
        messages.push(`复算跳过：${label} 设计主张「${claim}」的证据断言「${evidence}」依赖无数值参数，主张未验证`)
      }
      continue
    }

    if (strength === '实测' || strength === 'tested') {
      /*
       * 实测类：证据必须对上「原型验收记录」里**结果为通过**的检查项——
       * 否则「实测」两个字只是空口。结果列是受控枚举（通过/未通过/部分通过），
       * 归一判定见 ceshuEvidence.normalizeAcceptanceResult（2026-10-24 起取代
       * 此处的否定词正则启发式——旧启发式会把「部分通过」误当通过放过）。
       * 未登记/未通过/部分通过/尚未执行都按一致性警告处理（不是冲突）：
       * 原型尚未执行的文档是合法状态，警告只提醒「别把计划写成实测」。
       */
      const result = prototypeResults.get(evidence)
      if (result === undefined) {
        messages.push(
          `一致性警告：${label} 设计主张「${claim}」标注为实测，但证据「${evidence}」未在原型验收记录中登记`
        )
        continue
      }
      const status = normalizeAcceptanceResult(result)
      if (status === 'pass') continue
      if (status === 'fail') {
        messages.push(
          `一致性警告：${label} 设计主张「${claim}」标注为实测，但原型验收「${evidence}」结果为「${result}」，未通过`
        )
      } else if (status === 'partial') {
        messages.push(
          `一致性警告：${label} 设计主张「${claim}」标注为实测，但原型验收「${evidence}」结果为「${result}」，仅部分成立，主张未完全验证`
        )
      } else if (status === 'pending') {
        messages.push(
          `一致性警告：${label} 设计主张「${claim}」标注为实测，但原型验收「${evidence}」尚未执行（结果：${result}），主张未验证`
        )
      } else {
        messages.push(
          `一致性警告：${label} 设计主张「${claim}」标注为实测，但原型验收「${evidence}」结果为「${result}」，无法识别（结果列应为：通过/未通过/部分通过）`
        )
      }
      continue
    }

    if (strength === '假设' || strength === 'assumed') {
      // 假设类：无法机器验证，证据非空即通过（上面已判空）
      continue
    }

    messages.push(`一致性警告：${label} 设计主张「${claim}」的强度「${strengthRaw}」无法识别（应为 计算/实测/假设）`)
  }

  return messages
}

/**
 * 设计主张证据核对（文档直接产出时的公共入口；内部复算一次 evaluateAssertions）。
 *
 * ## 判定规则
 * - 强度=计算：证据必须是**数值断言表中存在的断言名**，且该断言复算通过；
 *   断言不存在 → 一致性冲突（无法复算）；断言未通过 → 一致性冲突（主张不成立）；
 *   断言无法解析/跳过 → 格式异常/复算跳过；
 * - 强度=实测/假设：无法机器验证，证据非空即通过（空 → 一致性警告）；
 * - 强度缺失或无法识别 → 一致性警告（提醒规范写法）。
 */
export function checkDesignClaims(doc: CeshuDocument): string[] {
  return checkDesignClaimsWith(doc, evaluateAssertions(doc), buildPrototypeResults(doc))
}
