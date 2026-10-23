import { CHAPTER_LABELS, type CeshuDocument } from './ceshuConstants'
import { EPSILON, splitRow, toRows } from './ceshuPipeRows'

/**
 * 证据层检查（用例清单 + 经济账本）——2026-10-24 对标豆包 tests / ledgers 两键。
 *
 * ## 为什么单独成模块
 * 这两项与「数值断言」同属**可机器验证**的证据，但数据源与算法不同（账本是逐笔
 * 求和对账，用例是枚举合法性 + 失败告警），混进 ceshuNumericAssert 会让那个
 * 模块从「表达式求值」膨胀成「什么都管」。保持一个模块一个判据。
 *
 * ## 严重度口径（与校验面板同一套分类）
 * - 一致性冲突（error）：账本对不上（求和 ≠ 期末期望）——经济闭环不成立；
 * - 格式异常（error）：账本/用例行无法解析（数字缺失、列数不足）；
 * - 一致性警告（warning）：类型/状态非法、失败用例被无视、用例缺关键列。
 */

/** 用例类型白名单（对齐豆包 normal/boundary/recovery/abuse） */
const CASE_TYPES = new Map<string, string>([
  ['正常', '正常'],
  ['边界', '边界'],
  ['恢复', '恢复'],
  ['滥用', '滥用'],
  ['normal', '正常'],
  ['boundary', '边界'],
  ['recovery', '恢复'],
  ['abuse', '滥用']
])

/** 用例状态白名单 */
const CASE_STATUS = new Map<string, string>([
  ['待执行', '待执行'],
  ['通过', '通过'],
  ['失败', '失败'],
  ['planned', '待执行'],
  ['passed', '通过'],
  ['failed', '失败']
])

/**
 * 用例清单检查（`qa.test_case_list`，行格式：用例|类型|前置|操作|期望|状态）。
 *
 * 判据：
 * - 类型不在白名单 → 一致性警告（提示用 正常/边界/恢复/滥用）；
 * - 状态不在白名单 → 一致性警告；
 * - 状态=失败 → 一致性警告（有用例失败，文档不该当完成态）；
 * - 前置/操作/期望 任一为空 → 一致性警告（不可执行的用例没有价值）。
 */
export function checkTestCaseList(doc: CeshuDocument): string[] {
  const rows = toRows(doc.qa.test_case_list)
  if (rows.length === 0) return []
  const label = CHAPTER_LABELS.qa
  const messages: string[] = []

  for (const row of rows) {
    if (row.trim() === '') continue
    const columns = splitRow(row)
    const name = columns[0] ?? ''
    if (name === '') continue
    const typeRaw = columns[1] ?? ''
    const precondition = columns[2] ?? ''
    const action = columns[3] ?? ''
    const expected = columns[4] ?? ''
    const statusRaw = columns[5] ?? ''

    if (!CASE_TYPES.has(typeRaw)) {
      messages.push(`一致性警告：${label} 用例「${name}」的类型「${typeRaw}」无法识别（应为 正常/边界/恢复/滥用）`)
    }
    const status = CASE_STATUS.get(statusRaw)
    if (status === undefined) {
      messages.push(`一致性警告：${label} 用例「${name}」的状态「${statusRaw}」无法识别（应为 待执行/通过/失败）`)
    } else if (status === '失败') {
      messages.push(`一致性警告：${label} 用例「${name}」状态为失败——有用例未通过时，本文档不应标记为可交付`)
    }
    const missing: string[] = []
    if (precondition === '') missing.push('前置')
    if (action === '') missing.push('操作')
    if (expected === '') missing.push('期望')
    if (missing.length > 0) {
      messages.push(`一致性警告：${label} 用例「${name}」缺少 ${missing.join('、')}，无法执行`)
    }
  }
  return messages
}

/**
 * 经济账本对账（`economy.ledger`，行格式：账本|初始|交易|期末期望|允许为负）。
 *
 * 交易列用逗号分隔的有符号数（如 `4,4,-5`），机器逐笔求和与期末期望比对：
 * - 求和 ≠ 期末期望（超容差）→ 一致性冲突（经济闭环不成立）；
 * - 中间余额出现负数且「允许为负」不是「是」→ 一致性警告（玩家会卡死）；
 * - 数字无法解析/列数不足 → 格式异常。
 */
export function checkLedger(doc: CeshuDocument): string[] {
  const rows = toRows(doc.economy.ledger)
  if (rows.length === 0) return []
  const label = CHAPTER_LABELS.economy
  const messages: string[] = []

  for (const row of rows) {
    if (row.trim() === '') continue
    const columns = splitRow(row)
    const name = columns[0] ?? ''
    if (name === '') continue
    if (columns.length < 4) {
      messages.push(`格式异常：${label} 账本「${name}」列数不足（需要 账本|初始|交易|期末期望[|允许为负]）`)
      continue
    }
    const starting = Number(columns[1])
    const expected = Number(columns[3])
    if (!Number.isFinite(starting) || !Number.isFinite(expected)) {
      messages.push(`格式异常：${label} 账本「${name}」的初始值或期末期望不是数字（${columns[1]} / ${columns[3]}）`)
      continue
    }
    const transactions: number[] = []
    let parseError = false
    for (const part of (columns[2] ?? '').split(/[,，]/)) {
      const trimmed = part.trim()
      if (trimmed === '') continue
      const value = Number(trimmed)
      if (!Number.isFinite(value)) {
        parseError = true
        break
      }
      transactions.push(value)
    }
    if (parseError) {
      messages.push(`格式异常：${label} 账本「${name}」的交易列含非数字（应为逗号分隔的有符号数，如 4,4,-5）`)
      continue
    }

    const computed = transactions.reduce((sum, value) => sum + value, starting)
    if (Math.abs(computed - expected) > EPSILON) {
      messages.push(
        `一致性冲突：${label} 账本「${name}」对不上：初始 ${starting} + 交易 ${transactions.length} 笔（${transactions.join('+').replace(/\+-/g, '-')}）= ${computed}，期末期望 ${expected}`
      )
    }

    const allowNegative = /^(是|允许|yes|true)$/i.test(columns[4] ?? '')
    if (!allowNegative) {
      let balance = starting
      for (const value of transactions) {
        balance += value
        if (balance < 0) {
          messages.push(`一致性警告：${label} 账本「${name}」在交易过程中余额变为 ${balance}（不允许为负，玩家会卡死）`)
          break
        }
      }
    }
  }
  return messages
}
