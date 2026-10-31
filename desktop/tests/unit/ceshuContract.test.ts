import { describe, expect, it } from 'vitest'

import { buildContract, checkContract, compareDemoRuleset, validateContract } from '../../src/shared/ceshu/validation'
import { createDefaultCeshu, deriveRulesetId } from '../../src/shared/ceshu/model'

/**
 * 设计契约（`ceshuContract`）守卫。
 *
 * 契约是**投影**不是第二份事实：文档改了契约自动跟随。这里守住三件事：
 * ①投影准确（两种 pipeList 存储形态都能读）；②判据正确（PASS/FAIL 的边界）；
 * ③与原型 Demo 的规则集比对能认出漂移。
 */

function docWithRules(): ReturnType<typeof createDefaultCeshu> {
  const doc = createDefaultCeshu({ scope: 'full', name: '深潮灯塔' })
  doc.numeric.numeric_parameters = [
    { param: 'hp_base', value: '10', range: '5-20', up: '更肉', down: '更脆' },
    { param: '层', value: '60', range: '1-100', up: '—', down: '—' }
  ]
  doc.numeric.numeric_assertions = [
    { claim: '60 层血量达标', expr: 'hp_base * 层', expected: '600', tolerance: '0', accept: '==600' }
  ]
  doc.qa.prototype_acceptance = [
    { check: '首载无错误', result: '通过', evidence: '真机运行 3 次无 pageerror' }
  ]
  doc.qa.acceptance_journeys = [
    { journey: '首次进入', steps: '开局 > 建塔', expected: '能建塔' }
  ]
  return doc
}

describe('buildContract：投影（不改动入参）', () => {
  it('参数表 / 断言表两种存储形态都能读出来', () => {
    const doc = docWithRules()
    const contract = buildContract(doc)
    expect(contract.parameters.map((item) => item.key)).toEqual(['hp_base', '层'])
    expect(contract.parameters[0]).toMatchObject({ value: 10, pending: false })
    expect(contract.assertions).toHaveLength(1)
    expect(contract.assertions[0]).toMatchObject({
      id: 'A1',
      expression: 'hp_base * 层',
      status: 'pass',
      computed: 600
    })
  })

  it('老文档（字符串行）同样能读', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '老文档' })
    doc.numeric.numeric_parameters = ['hp_base|10']
    doc.numeric.numeric_assertions = ['断言一|hp_base|10|0|==10']
    const contract = buildContract(doc)
    expect(contract.parameters).toEqual([{ key: 'hp_base', value: 10, pending: false }])
    expect(contract.assertions[0]).toMatchObject({ statement: '断言一', status: 'pass', computed: 10 })
  })

  it('参数「有名无数」（待确认）标 pending，不参与复算也不报错', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '待确认' })
    doc.numeric.numeric_parameters = [{ param: 'hp_base', value: '待确认', range: '', up: '', down: '' }]
    doc.numeric.numeric_assertions = [{ claim: 'A', expr: 'hp_base', expected: '10', tolerance: '0', accept: '==10' }]
    const contract = buildContract(doc)
    expect(contract.parameters[0]).toMatchObject({ key: 'hp_base', value: null, pending: true })
    expect(contract.assertions[0].status).toBe('skip')
  })

  it('规则集标识缺省由文档 id 派生（同文档恒定）', () => {
    const doc = docWithRules()
    expect(buildContract(doc).rulesetId).toBe(`ceshu-${doc.ceshu_id}`)
    expect(buildContract(doc).rulesetId).toBe(deriveRulesetId(doc))
  })

  it('显式 ruleset_id 优先于派生值', () => {
    const doc = docWithRules()
    doc.ruleset_id = 'abyssal-beacon-v1'
    expect(buildContract(doc).rulesetId).toBe('abyssal-beacon-v1')
  })

  it('纯投影：不修改入参（数组与对象同一引用）', () => {
    const doc = docWithRules()
    const before = JSON.stringify(doc)
    buildContract(doc)
    checkContract(doc)
    expect(JSON.stringify(doc)).toBe(before)
  })
})

describe('validateContract：判据', () => {
  it('完整体检 → 无 error（warning 允许）', () => {
    const report = checkContract(docWithRules())
    expect(report.passed).toBe(true)
    expect(report.errorCount).toBe(0)
  })

  it('断言复算不符 → error（一致性冲突）', () => {
    const doc = docWithRules()
    doc.numeric.numeric_assertions = [
      { claim: '算错的断言', expr: 'hp_base * 层', expected: '999', tolerance: '0', accept: '==999' }
    ]
    const report = checkContract(doc)
    expect(report.passed).toBe(false)
    expect(report.findings.some((item) => item.code === 'assertion-fail')).toBe(true)
  })

  it('有断言但没参数表 → error（无从复算）', () => {
    const doc = docWithRules()
    doc.numeric.numeric_parameters = []
    expect(checkContract(doc).findings.some((item) => item.code === 'no-parameters')).toBe(true)
  })

  it('断言引用未登记参数 → error（表达式被破坏）', () => {
    const doc = docWithRules()
    doc.numeric.numeric_assertions = [
      { claim: '野参数', expr: '不存在的参数 * 2', expected: '10', tolerance: '0', accept: '==10' }
    ]
    expect(checkContract(doc).findings.some((item) => item.code === 'assertion-error')).toBe(true)
  })

  it('原型检查未全通过 → error（交付门禁）', () => {
    const doc = docWithRules()
    doc.qa.prototype_acceptance = [
      { check: '首载无错误', result: '通过', evidence: 'ok' },
      { check: '平均 28 秒完成首单', result: '未通过', evidence: '实测 45 秒' }
    ]
    const report = checkContract(doc)
    expect(report.passed).toBe(false)
    expect(report.findings.find((item) => item.code === 'prototype-gate')?.message).toContain('平均 28 秒完成首单')
  })

  it('完全没有原型验收记录 → warning 而非 error（早期文档正常，交付前补）', () => {
    const doc = docWithRules()
    doc.qa.prototype_acceptance = []
    const report = checkContract(doc)
    expect(report.passed).toBe(true)
    expect(report.findings.some((item) => item.code === 'no-prototype-evidence')).toBe(true)
  })

  it('旅程为空 → warning；账本对不上 → error 且原文透出', () => {
    const doc = docWithRules()
    doc.qa.acceptance_journeys = []
    // 期末期望故意写错（4 + 4 - 5 = 3，写成 99）→ 账本对不上
    doc.economy.ledger = [{ action: '首局', income: '4', expense: '4,-5', balance: '99', ok: '否' }]
    const report = checkContract(doc)
    expect(report.findings.some((item) => item.code === 'no-journeys')).toBe(true)
    const evidenceError = report.findings.find((item) => item.code === 'evidence' && item.level === 'error')
    expect(evidenceError?.message).toContain('对不上')
  })

  it('validateContract 是纯函数：同输入同输出', () => {
    const contract = buildContract(docWithRules())
    expect(JSON.stringify(validateContract(contract))).toBe(JSON.stringify(validateContract(contract)))
  })
})

describe('compareDemoRuleset：与原型 Demo 的规则集比对', () => {
  it('一致 / 漂移 / 读不到三种情形', () => {
    const doc = docWithRules()
    const id = deriveRulesetId(doc)
    expect(compareDemoRuleset(doc, `const RULESET = '${id}'`)).toBe(true)
    expect(compareDemoRuleset(doc, `const RULESET = '${id}'`)).toBe(true)
    expect(compareDemoRuleset(doc, 'const RULESET = "old-rules-v1"')).toBe(false)
    expect(compareDemoRuleset(doc, '<html>没有规则集常量</html>')).toBeNull()
    expect(compareDemoRuleset(doc, undefined)).toBeNull()
  })
})
