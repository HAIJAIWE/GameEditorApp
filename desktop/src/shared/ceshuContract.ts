import { CHAPTER_LABELS, type CeshuDocument } from './ceshuConstants'
import { fieldColumns } from './ceshuFields'
import { checkLedger, checkPrototypeAcceptanceResults, checkTestCaseList } from './ceshuEvidence'
import { deriveRulesetId, getGddScope } from './ceshuModel'
import {
  evaluateAssertions,
  evaluateExpression,
  parseNumericParameters,
  parseParameterNames,
  type AssertionResult
} from './ceshuNumericAssert'
import { splitRow, toRowStrings } from './ceshuPipeRows'
import { readText } from './util/readText'

/**
 * 设计契约（design contract）——把「散落在 24 章里的可验证承诺」抽成一份机读契约。
 *
 * ## 为什么需要它
 * 文档里已经有：数值参数表、数值断言、设计主张、原型验收、验收旅程、测试用例、经济账本。
 * 但这些证据**各住各的章**，没有一处能回答「这套设计整体是否自洽」。契约把同一份内容
 * 投影成一个结构，让「规则集标识 + 参数 + 断言 + 原型门禁 + 旅程覆盖」可以被一次性检查，
 * 并与原型 Demo 的 `ruleset_id` 对上——**证明多方引用的是同一套规则**。
 *
 * ## 关键设计决定
 * - **不引入第二份事实**：契约是**投影**，不是新数据源。改了文档，契约自动跟随；
 *   不落一份会漂的 JSON 当第二事实源（要外发时按需导出）。
 * - **不新增表达式引擎**：断言求值复用 `ceshuNumericAssert.evaluateExpression`
 *   （白名单词法 + 递归下降，**不用 eval**）——表达式来自 AI 生成的文档内容，属不可信输入。
 * - **沿用既有判据**：账本 / 用例 / 原型验收的对账规则直接在 `ceshuEvidence` 里，
 *   契约层只是把它们的结果归集起来，不重写一套判定。
 *
 * ## 与「校验」的分工
 * `validateCeshu` 是**逐条报错**（给编辑中的作者看）；契约是**一次体检**（给交付前的
 * 把关看）：` 是否 PASS, 规则集标识, 各类 findings }`，可序列化、可外发、可与 Demo 比对。
 */

/** 单条 finding：级别 + 分类 + 可读说明（分类便于 UI 分组与机器筛选） */
export interface ContractFinding {
  level: 'error' | 'warning'
  code: string
  message: string
}

/** 参数条目（从参数表投影） */
export interface ContractParameter {
  key: string
  value: number | null
  /** 当前值非数值（如「待确认」）时为 true —— 不参与复算，但要如实列出 */
  pending: boolean
}

/** 断言条目（从断言表投影 + 复算结论） */
export interface ContractAssertion {
  id: string
  statement: string
  expression: string
  expected: string
  tolerance: string
  accept: string
  /** 复算结论（pass/fail/skip/error，口径同 `evaluateAssertions`） */
  status: AssertionResult['status']
  /** 复算得到的值（未复算则为 null） */
  computed: number | null
}

/** 原型检查项（从 QA 原型验收记录投影） */
export interface ContractPrototypeCheck {
  check: string
  result: string
  evidence: string
  passed: boolean
}

/** 契约本体（可 JSON 序列化；外发时直接 `JSON.stringify`） */
export interface DesignContract {
  schemaVersion: '1.0'
  rulesetId: string
  gameName: string
  scope: string
  parameters: ContractParameter[]
  assertions: ContractAssertion[]
  prototype: {
    checks: ContractPrototypeCheck[]
    /** 全部通过（无检查项时视为未验证） */
    allPassed: boolean
  }
  journeys: Array<{ journey: string; steps: string; expected: string }>
  testCases: Array<{ name: string; type: string; status: string }>
  /** 账本对账等「证据层」检查产出的原始消息（已分类） */
  evidence: string[]
}

/** 契约体检结果 */
export interface ContractReport {
  contract: DesignContract
  findings: ContractFinding[]
  /** 无 error 即通过（warning 不阻断，但要看得见） */
  passed: boolean
  errorCount: number
  warningCount: number
}

/** 构建设计契约（纯投影，不改动入参） */
export function buildContract(doc: CeshuDocument): DesignContract {
  const assertionResults = evaluateAssertions(doc)
  const parameterRows = toRowStrings(doc.numeric.numeric_parameters, fieldColumns('numeric', 'numeric_parameters'))
  const assertionRows = toRowStrings(doc.numeric.numeric_assertions, fieldColumns('numeric', 'numeric_assertions'))
  const parsedParams = parseNumericParameters(parameterRows)
  const knownNames = parseParameterNames(parameterRows)
  const resultsByStatement = new Map(assertionResults.map((result) => [result.statement, result]))

  const parameters: ContractParameter[] = parameterRows.map((row) => {
    const key = splitRow(row)[0] ?? ''
    const value = parsedParams.get(key)
    return { key, value: value ?? null, pending: knownNames.has(key) && value === undefined }
  })

  const assertions: ContractAssertion[] = assertionRows.map((row, index) => {
    const cells = splitRow(row)
    const statement = cells[0] ?? ''
    const hit = resultsByStatement.get(statement)
    return {
      id: `A${index + 1}`,
      statement,
      expression: cells[1] ?? '',
      expected: cells[2] ?? '',
      tolerance: cells[3] ?? '',
      accept: cells[4] ?? '',
      status: hit?.status ?? 'skip',
      computed: computedValue(cells[1] ?? '', parsedParams)
    }
  })

  const checks: ContractPrototypeCheck[] = toRowStrings(
    doc.qa.prototype_acceptance,
    fieldColumns('qa', 'prototype_acceptance')
  ).map((row) => {
    const cells = splitRow(row)
    const result = cells[1] ?? ''
    return {
      check: cells[0] ?? '',
      result,
      evidence: cells[2] ?? '',
      passed: /^(通过|passed|pass)$/i.test(result)
    }
  })

  const journeys = toRowStrings(doc.qa.acceptance_journeys, fieldColumns('qa', 'acceptance_journeys')).map((row) => {
    const cells = splitRow(row)
    return { journey: cells[0] ?? '', steps: cells[1] ?? '', expected: cells[2] ?? '' }
  })

  const testCases = toRowStrings(doc.qa.test_case_list, fieldColumns('qa', 'test_case_list')).map((row) => {
    const cells = splitRow(row)
    return { name: cells[0] ?? '', type: cells[1] ?? '', status: cells[5] ?? '' }
  })

  return {
    schemaVersion: '1.0',
    rulesetId: deriveRulesetId(doc),
    gameName: readText(doc.meta.game_name),
    scope: getGddScope(doc),
    parameters,
    assertions,
    prototype: { checks, allPassed: checks.length > 0 && checks.every((check) => check.passed) },
    journeys,
    testCases,
    evidence: [...checkLedger(doc), ...checkTestCaseList(doc), ...checkPrototypeAcceptanceResults(doc)]
  }
}

/** 复算单条表达式的值（失败返回 null；不改文档、不抛异常） */
function computedValue(expression: string, params: ReadonlyMap<string, number>): number | null {
  if (expression.trim() === '') return null
  const result = evaluateExpression(expression, params)
  return result.ok ? result.value : null
}

/**
 * 契约体检：把契约里的结构性问题归集成 findings。
 *
 * 判据（与文档校验**互补而非重复**：这里关注「契约作为整体是否成立」）：
 * 1. 有断言表却没有参数表 → 断言无从复算（error）；
 * 2. 断言状态 fail / error → 逐条报出（error）；
 * 3. 原型**完全没验收记录** → 未验证（warning：早期文档正常，交付前必须补）；
 * 4. 原型有检查项但未全部通过 → 交付门禁不满足（error）；
 * 5. 验收旅程为空 → 缺玩家路径覆盖（warning）；
 * 6. 规则集标识为空 → 无法与 Demo / 配置证明同一套规则（error）；
 * 7. 证据层（账本/用例/原型）产出的消息 → 原文透出并分级（与校验面板同口径）。
 */
export function validateContract(contract: DesignContract): ContractFinding[] {
  const findings: ContractFinding[] = []
  const numericLabel = CHAPTER_LABELS.numeric

  if (contract.assertions.length > 0 && contract.parameters.length === 0) {
    findings.push({
      level: 'error',
      code: 'no-parameters',
      message: `${numericLabel} 有 ${contract.assertions.length} 条断言但没有参数表——表达式引用的参数无从取值，无法复算`
    })
  }

  for (const assertion of contract.assertions) {
    if (assertion.status === 'fail') {
      findings.push({
        level: 'error',
        code: 'assertion-fail',
        message: `${numericLabel} 断言「${assertion.statement || assertion.expression}」未通过复算（期望 ${assertion.expected || '—'}，容差 ${assertion.tolerance || '—'}）`
      })
    } else if (assertion.status === 'error') {
      findings.push({
        level: 'error',
        code: 'assertion-error',
        message: `${numericLabel} 断言「${assertion.statement || assertion.expression}」无法复算：表达式 ${assertion.expression}`
      })
    }
  }

  if (contract.prototype.checks.length === 0) {
    findings.push({
      level: 'warning',
      code: 'no-prototype-evidence',
      message: '原型验收记录为空：契约中「实测」类主张缺少机器可核对的证据'
    })
  } else if (!contract.prototype.allPassed) {
    const failed = contract.prototype.checks.filter((check) => !check.passed).map((check) => check.check)
    findings.push({
      level: 'error',
      code: 'prototype-gate',
      message: `原型检查未全部通过：${failed.join('、')}`
    })
  }

  if (contract.journeys.length === 0) {
    findings.push({
      level: 'warning',
      code: 'no-journeys',
      message: '验收旅程为空：建议至少覆盖「首次进入 / 核心循环 / 失败路径」各一条'
    })
  }

  if (contract.rulesetId.trim() === '') {
    findings.push({
      level: 'error',
      code: 'no-ruleset',
      message: '缺少规则集标识（ruleset_id）：无法证明文档、契约、原型 Demo 引用的是同一套规则'
    })
  }

  for (const message of contract.evidence) {
    findings.push({
      level: /：.*冲突|^一致性冲突/.test(message) || message.startsWith('格式异常') ? 'error' : 'warning',
      code: 'evidence',
      message
    })
  }

  return findings
}

/** 契约体检（构建 + 校验一步到位） */
export function checkContract(doc: CeshuDocument): ContractReport {
  const contract = buildContract(doc)
  const findings = validateContract(contract)
  const errorCount = findings.filter((finding) => finding.level === 'error').length
  return {
    contract,
    findings,
    passed: errorCount === 0,
    errorCount,
    warningCount: findings.length - errorCount
  }
}

/**
 * 契约与原型 Demo 的规则集比对。
 *
 * 为什么要显式比对：文档改了数值、原型还是旧的，两边「看起来都合理」，
 * 但已经不是同一套规则——这正是设计交付里最难发现的一类漂移。
 * 返回 null 表示 Demo 里读不到 `RULESET` 常量（不报错，只是无法比对）。
 */
export function compareDemoRuleset(doc: CeshuDocument, demoHtml: string | undefined): boolean | null {
  if (demoHtml === undefined || demoHtml.trim() === '') return null
  // Demo 生成约定：`const RULESET = 'xxx'`（单引号或双引号）
  const match = /RULESET\s*=\s*['"]([^'"]+)['"]/.exec(demoHtml)
  if (match === null) return null
  return match[1] === deriveRulesetId(doc)
}
