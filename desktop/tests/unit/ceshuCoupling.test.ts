import { describe, expect, it } from 'vitest'

import { COUPLING_RULES, couplingMessages, findCouplingGaps } from '../../src/shared/ceshuCoupling'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'

/**
 * 字段联动：填了 A 却没填 B —— 完备度是绿的，但开不了工。
 *
 * 规则是**声明式**的（谁都能读、能改），不解析散文、不做语义猜测，
 * 所以不会因为措辞变化误报。
 */

function makeDoc(scope: 'full' | 'lite' = 'full') {
  return createDefaultCeshu({ scope, name: '联动样本' })
}

describe('字段联动：可开发性缺口', () => {
  it('触发字段填了、依赖字段空着 → 报缺口并说明为什么', () => {
    const doc = makeDoc()
    doc.combat.damage_formula = '伤害 = 攻击 - 防御'
    const gaps = findCouplingGaps(doc)
    expect(gaps.some((gap) => gap.field === 'hit_detection')).toBe(true)

    const message = couplingMessages(doc).find((item) => item.includes('命中判定'))
    expect(message).toContain('可开发性缺口')
    expect(message).toContain('伤害公式')
  })

  it('依赖字段也填了 → 不报', () => {
    const doc = makeDoc()
    doc.combat.damage_formula = '伤害 = 攻击 - 防御'
    doc.combat.hit_detection = [{ attack: '普攻', shape: '胶囊 0.6m', iframe: '无', super_armor: '无' }]
    expect(findCouplingGaps(doc).some((gap) => gap.field === 'hit_detection')).toBe(false)
  })

  it('触发字段空着 → 不报（不催还没开始写的章）', () => {
    expect(findCouplingGaps(makeDoc())).toEqual([])
  })

  it('联机形态 none 时不要求协议表与同步模型', () => {
    const doc = makeDoc()
    doc.tech.online_mode = 'none'
    const fields = findCouplingGaps(doc).map((gap) => gap.field)
    expect(fields).not.toContain('net_protocol')
    expect(fields).not.toContain('sync_model')
  })

  it('联机形态 co_op 时要求协议表与同步模型', () => {
    const doc = makeDoc()
    doc.tech.online_mode = 'co_op'
    const fields = findCouplingGaps(doc).map((gap) => gap.field)
    expect(fields).toContain('net_protocol')
    expect(fields).toContain('sync_model')
  })

  it('轻量档不催没显示的章（performance 在 lite 档不可见）', () => {
    const doc = makeDoc('lite')
    doc.performance.performance_budget = [{ metric: '帧率', target: '60', method: '实测' }]
    expect(findCouplingGaps(doc).some((gap) => gap.field === 'quality_tiers')).toBe(false)
  })

  it('规则表本身可评审：每条都有依赖与理由', () => {
    expect(COUPLING_RULES.length).toBeGreaterThan(0)
    for (const rule of COUPLING_RULES) {
      expect(rule.require.length).toBeGreaterThan(0)
      for (const need of rule.require) expect(need.why.length).toBeGreaterThan(0)
    }
  })
})
