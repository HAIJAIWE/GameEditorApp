import type { DataTableCheckResult } from '../data'
import { isFilledValue } from '../model'
import type { CeshuDocument, ChapterKey } from '../reference'
import type { ContractAssertion, DesignContract } from '../validation'
import { readPath } from './ceshuHandoffPaths'
import {
  acceptanceCheck,
  acceptanceText,
  type HandoffAcceptance,
  type HandoffAcceptanceCheck
} from './ceshuHandoffTypes'

/**
 * **交接包验收的机器判定**。
 *
 * ## 为什么要有这一层
 * 2026-11-09 实测：38 份交接文档、99 条验收，其中 94 条是纯自然语言（manual）——
 * 编码智能体只能「觉得自己做完了」。只挂判定方式还不够，判定方式必须**真的跑**，
 * 否则标签只是装饰。这个模块就是那个「真的跑」：把一条验收翻成一个结论。
 *
 * ## 四种判定方式
 * - `assertion`：拿 `contract.json` 的断言复算（pass/fail/skip/error）映射成结论；
 * - `data`：拿「设计 ↔ 数据表核对」的现状比设计里声明的表（表在不在、条数够不够、字段全不全）；
 * - `field`：拿策划书字段本身核对「这条设计到底写没写」（文档级判定，不等于实现完成）；
 * - `test`：必须真跑自动化测试；本模块**不**替它盖章（结论恒为 `unverified`）；
 * - `manual`：人工判定，同样恒为 `unverified`。
 *
 * 纯函数、零 I/O、零 LLM：现状由调用方注入（`contract` / `dataTables` / `doc`），
 * 本模块只负责「按规则给结论」——这样单测不用起 Electron，主进程也能直接算。
 *
 * ### 为什么 `field` 不算「实现完成」
 * 「文档写了伤害公式」和「代码里真的按这个公式结算」是两件事。文档级判定只能回答前者，
 * 所以它给的是 `pass` 但**语义标注为文档级**（evidence 写明「文档已填」），
 * 派工单拿到后仍需由 test/manual 收尾——不要把它当成实现验收的替代品。
 */

/** 一条验收的机器结论 */
export type HandoffAcceptanceVerdict = 'pass' | 'fail' | 'skip' | 'unverified'

/** `pass`/`fail`/`skip` 是机器给的结论；`unverified` 是「机器不替它下结论」（test / manual） */
export interface HandoffAcceptanceResult {
  /** 稳定 id（`<文档 id>-a<序号>`，与 index.json 同源） */
  id: string
  text: string
  check: HandoffAcceptanceCheck
  verdict: HandoffAcceptanceVerdict
  /** 一句话依据：复算了几条、哪条没过、缺哪张表…… */
  evidence: string
}

/** 判定现状（全部来自既有能力，不在这里重算业务） */
export interface HandoffAcceptanceContext {
  /** 策划书（`field` 判定要读它的字段；缺省则这类验收只给 skip） */
  doc?: CeshuDocument
  /** `contract.json` 的契约本体（`buildContract(doc)`；缺省则 `assertion` 给 skip） */
  contract?: DesignContract
  /** 数据表核对结果（`checkDataTablePlan(...)`；缺省则 `data` 给 skip） */
  dataTables?: DataTableCheckResult
}

export interface HandoffAcceptanceSummary {
  total: number
  pass: number
  fail: number
  skip: number
  /** test / manual：机器不给结论 */
  unverified: number
  /** 机器真给了结论的条数（pass + fail + skip） */
  machine: number
}

/**
 * 断言匹配：缺省（空串）= 全部断言；给了关键词 = 命中语句/表达式/期望/接受条件的那些。
 *
 * 为什么用关键词而不是断言 id：断言 id（`A1`/`A2`）是**按行序算出来的**，
 * 策划书里插一行断言就会整体错位——把 id 写进文档会让交接包一改就失效。
 */
function matchAssertions(assertions: readonly ContractAssertion[], match: string): ContractAssertion[] {
  const keyword = match.trim().toLowerCase()
  if (keyword === '') return [...assertions]
  return assertions.filter((assertion) =>
    [assertion.statement, assertion.expression, assertion.expected, assertion.accept]
      .join(' ')
      .toLowerCase()
      .includes(keyword)
  )
}

interface Verdict {
  verdict: HandoffAcceptanceVerdict
  evidence: string
}

function evaluateAssertion(match: string, context: HandoffAcceptanceContext): Verdict {
  const assertions = context.contract?.assertions
  if (assertions === undefined) {
    return { verdict: 'skip', evidence: '没拿到 contract.json（导出交接包后才有）' }
  }
  const hit = matchAssertions(assertions, match)
  if (hit.length === 0) {
    return {
      verdict: 'fail',
      evidence:
        match === ''
          ? 'contract.json 里一条断言都没有（先在「数值设计·断言表」写可复算的断言）'
          : 'contract.json 里没有匹配「' + match.trim() + '」的断言'
    }
  }
  const passed = hit.filter((assertion) => assertion.status === 'pass')
  if (passed.length === hit.length) {
    return { verdict: 'pass', evidence: String(hit.length) + ' 条断言复算通过：' + hit.map((item) => item.id).join('、') }
  }
  const failed = hit.filter((assertion) => assertion.status === 'fail' || assertion.status === 'error')
  if (failed.length === 0) {
    return {
      verdict: 'skip',
      evidence: String(hit.length) + ' 条断言依赖的参数没有数值（待确认），未复算'
    }
  }
  const first = failed[0] as ContractAssertion
  const detail =
    first.status === 'error'
      ? '表达式无法复算（引用未登记参数或写法错：' + first.expression + '）'
      : '复算值 ' + String(first.computed ?? '—') + ' 与期望「' + first.expected + '」不符'
  return {
    verdict: 'fail',
    evidence:
      '断言 ' + first.id + '「' + first.statement + '」未过：' + detail +
      '（共 ' + String(failed.length) + '/' + String(hit.length) + ' 条未过）'
  }
}

function evaluateData(match: string, context: HandoffAcceptanceContext): Verdict {
  const result = context.dataTables
  if (result === undefined) {
    return { verdict: 'skip', evidence: '没拿到数据表现状（要在客户端的「数据·机读」里核对）' }
  }
  if (result.requirements.length === 0) {
    return { verdict: 'skip', evidence: '策划书还没声明要建哪些数据表（「技术方案·所需数据表」）' }
  }
  const keyword = match.trim().toLowerCase()
  const issues =
    keyword === ''
      ? result.issues
      : result.issues.filter((issue) => issue.table.toLowerCase().includes(keyword))
  if (issues.length === 0) {
    return {
      verdict: 'pass',
      evidence: String(result.requirements.length) + ' 张声明的数据表都已建齐、条数与字段达标'
    }
  }
  const errors = issues.filter((issue) => issue.level === 'error')
  if (errors.length > 0) {
    return {
      verdict: 'fail',
      evidence:
        String(errors.length) + ' 处不符：' +
        errors.slice(0, 3).map((issue) => issue.message).join('；')
    }
  }
  return {
    verdict: 'skip',
    evidence: '只有警告：' + issues.slice(0, 3).map((issue) => issue.message).join('；')
  }
}

function evaluateField(
  fields: readonly { chapter: ChapterKey; field: string }[],
  context: HandoffAcceptanceContext
): Verdict {
  const doc = context.doc
  if (doc === undefined) return { verdict: 'skip', evidence: '没拿到策划书（文档级判定无从核对）' }
  if (fields.length === 0) return { verdict: 'skip', evidence: '这条验收没指定要核对哪个字段' }
  const missing: string[] = []
  for (const item of fields) {
    const value = readPath((doc as unknown as Record<string, unknown>)[item.chapter], item.field)
    if (!isFilledValue(value)) missing.push(item.chapter + '.' + item.field)
  }
  const named = fields.map((item) => item.chapter + '.' + item.field).join('、')
  if (missing.length === 0) {
    return { verdict: 'pass', evidence: '文档已写：' + named + '（文档级，不等于实现完成）' }
  }
  return { verdict: 'fail', evidence: '文档还没写：' + missing.join('、') }
}

/**
 * 判一条验收。
 *
 * `id` 由调用方给（与 index.json / 派工单同一套编号），这里不做排序与去重。
 */
export function evaluateHandoffAcceptance(
  id: string,
  item: HandoffAcceptance,
  context: HandoffAcceptanceContext = {}
): HandoffAcceptanceResult {
  const text = acceptanceText(item)
  const check = acceptanceCheck(item)
  const spec = typeof item === 'string' ? undefined : item
  const base = { id, text, check }

  if (check === 'test') {
    return {
      ...base,
      verdict: 'unverified',
      evidence: '必须真跑自动化测试（脚本 / 单测 / 引擎内实测）；AI 自述不算过'
    }
  }
  if (check === 'manual') {
    return {
      ...base,
      verdict: 'unverified',
      evidence:
        spec?.how !== undefined && spec.how.trim() !== '' ? '人工判定：' + spec.how.trim() : '人工判定'
    }
  }
  if (check === 'assertion') {
    return { ...base, ...evaluateAssertion(spec?.match ?? '', context) }
  }
  if (check === 'data') {
    return { ...base, ...evaluateData(spec?.match ?? '', context) }
  }
  return { ...base, ...evaluateField(spec?.fields ?? [], context) }
}

/** 判一批验收（id 形如 `<docId>-a<n>`，与 index.json 同源） */
export function evaluateHandoffAcceptances(
  docId: string,
  items: readonly HandoffAcceptance[],
  context: HandoffAcceptanceContext = {}
): HandoffAcceptanceResult[] {
  return items.map((item, index) =>
    evaluateHandoffAcceptance(docId + '-a' + String(index + 1), item, context)
  )
}

/** 汇总（派工单与「这一份做完了没有」共用一套口径） */
export function summarizeHandoffAcceptances(
  results: readonly HandoffAcceptanceResult[]
): HandoffAcceptanceSummary {
  const summary: HandoffAcceptanceSummary = {
    total: results.length,
    pass: 0,
    fail: 0,
    skip: 0,
    unverified: 0,
    machine: 0
  }
  for (const result of results) {
    summary[result.verdict] += 1
    if (result.verdict !== 'unverified') summary.machine += 1
  }
  return summary
}
