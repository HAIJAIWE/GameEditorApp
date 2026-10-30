import { describe, expect, test } from 'vitest'
import { createDefaultCeshu } from '../../src/shared/ceshu/ceshuModel'
import { validateCeshu } from '../../src/shared/ceshu/ceshuValidation'
import { evaluateAssertions } from '../../src/shared/ceshu/ceshuNumericAssert'
import { checkLedger } from '../../src/shared/ceshu/ceshuEvidence'
import type { CeshuDocument } from '../../src/shared/ceshu/ceshuConstants'

/**
 * 防御回归：校验链路是「纯读取」——历史上踩过 ceshuDefaults 的浅拷贝污染
 * （测试互相污染），这里锁死「校验不修改入参」，避免有人为方便就地改 doc，
 * 把脏数据泄漏到后续 AI 生成 / 导出流水线。
 */

function makeDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full' })
  // 注入内容，确保数值断言 / 账本 / 用例 / 验收 等更深分支也被执行到
  doc.numeric.numeric_parameters = ['主基地等级|30', '成长系数|1.45']
  doc.numeric.numeric_assertions = ['主基地产出|30*1.45|43.5']
  doc.economy.ledger = ['新手资源流|100|10,10,-5|115']
  doc.qa.test_case_list = ['登录|正常|已安装|启动|进入主界面|通过']
  doc.qa.prototype_acceptance = ['战斗结算|通过']
  doc.qa.acceptance_journeys = ['首战|完成教学战斗|占领首个资源点']
  return doc
}

describe('ceshu 校验不修改入参', () => {
  test('validateCeshu 不修改入参文档', () => {
    const doc = makeDoc()
    const snapshot = structuredClone(doc)
    validateCeshu(doc)
    expect(doc).toEqual(snapshot)
  })

  test('evaluateAssertions 不修改入参', () => {
    const doc = makeDoc()
    const snapshot = structuredClone(doc)
    evaluateAssertions(doc)
    expect(doc).toEqual(snapshot)
  })

  test('checkLedger 不修改入参', () => {
    const doc = makeDoc()
    const snapshot = structuredClone(doc)
    checkLedger(doc)
    expect(doc).toEqual(snapshot)
  })

  test('validateCeshu 幂等：同入参两次输出一致', () => {
    const first = validateCeshu(makeDoc())
    const second = validateCeshu(makeDoc())
    expect(second).toEqual(first)
  })
})
