import { describe, expect, it } from 'vitest'

import { analyzeFieldImpact, renderFieldImpactMarkdown } from '../../src/shared/ceshuImpact'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'

/**
 * 字段变更影响面：改一个字段时，哪些交接文档 / 断言 / 拆分字段 / 数据侧会跟着动。
 *
 * 这条能力服务的是「路线清晰」里的**可回退性**：开发中改设计是常态，
 * 怕的不是改，是「改了一处、漏了三处」导致返工。
 */

function makeDoc() {
  const doc = createDefaultCeshu({ scope: 'full', name: '影响面样本' })
  doc.meta.game_type = 'RPG'
  return doc
}

describe('字段变更影响面', () => {
  it('伤害公式：列出直接引用它的交接文档与验收条目', () => {
    const impact = analyzeFieldImpact(makeDoc(), 'combat', 'damage_formula')
    expect(impact.label).toBe('伤害公式')
    const directIds = impact.docs.filter((item) => item.relation === 'direct').map((item) => item.id)
    expect(directIds).toContain('core-combat')
    expect(impact.acceptance.some((item) => item.text.includes('伤害计算与公式逐项一致'))).toBe(true)
  })

  it('同源拆分字段：改主字段要一起看 _points / _notes，反向也能查', () => {
    const forward = analyzeFieldImpact(makeDoc(), 'economy', 'production_chain')
    expect(forward.splitFields).toContain('production_chain_points')
    expect(forward.splitFields).toContain('production_chain_notes')

    const reverse = analyzeFieldImpact(makeDoc(), 'economy', 'production_chain_points')
    expect(reverse.splitFields).toContain('production_chain')
  })

  it('数据表声明牵动数据侧', () => {
    const impact = analyzeFieldImpact(makeDoc(), 'tech', 'data_tables')
    expect(impact.affectsData).toBe(true)
    expect(impact.docs.map((item) => item.id)).toContain('arch-data')
  })

  it('数值断言：只按关键词命中，不做语义猜测', () => {
    const doc = makeDoc()
    doc.numeric.numeric_assertions = [
      { claim: '攻击成长线性', expr: 'floor(攻击 * 1.2)', expected: '==12', tolerance: '0', accept: '==' }
    ]

    const hit = analyzeFieldImpact(doc, 'numeric', 'numeric_parameters', { rowKey: '攻击' })
    expect(hit.assertions).toHaveLength(1)
    expect(hit.assertions[0]?.hit).toBe('攻击')

    // 没出现在断言里的参数名，不报
    const miss = analyzeFieldImpact(doc, 'numeric', 'numeric_parameters', { rowKey: '防御' })
    expect(miss.assertions).toHaveLength(0)
  })

  it('没人引用的字段：空结果，不抛错', () => {
    const impact = analyzeFieldImpact(makeDoc(), 'meta', 'confidentiality')
    expect(impact.docs).toEqual([])
    expect(impact.assertions).toEqual([])
    expect(impact.acceptance).toEqual([])
    expect(impact.affectsData).toBe(false)
  })

  it('渲染成 Markdown：分节齐全，无引用时有明确说法', () => {
    const md = renderFieldImpactMarkdown(analyzeFieldImpact(makeDoc(), 'combat', 'damage_formula'))
    expect(md).toContain('### 改「伤害公式」会影响什么')
    expect(md).toContain('**必须改（直接引用）**')
    expect(md).toContain('**会重新判定的验收条目**')

    const empty = renderFieldImpactMarkdown(analyzeFieldImpact(makeDoc(), 'meta', 'confidentiality'))
    expect(empty).toContain('没有交接文档直接引用这个字段')
  })

  it('下游文档单独标 downstream，不和直接引用混在一起', () => {
    const impact = analyzeFieldImpact(makeDoc(), 'combat', 'damage_formula')
    const directIds = new Set(
      impact.docs.filter((item) => item.relation === 'direct').map((item) => item.id)
    )
    for (const item of impact.docs.filter((doc) => doc.relation === 'downstream')) {
      expect(directIds.has(item.id)).toBe(false)
      expect(item.path).not.toBe('')
    }
  })
})
