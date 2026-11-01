import { describe, expect, it } from 'vitest'

import { baseAttrNames, computeLivePreview, derivedAndCombatNames } from '@mobai/shared/domain/attr/attrPreview'
import { createDefaultAttrSystem, type AttrDefinition, type AttrSystem } from '@mobai/shared/attrSystem'

const system = createDefaultAttrSystem()

function attr(name: string, coefficients: Record<string, number>): AttrDefinition {
  return {
    name,
    type: 'derived',
    category: '派生属性',
    displayName: name,
    minValue: 0,
    maxValue: null,
    defaultValue: 0,
    formula: { coefficients, baseValue: 0 }
  }
}

describe('实时预览计算', () => {
  it('缺省基础值使用属性默认值；默认集 HP = 350，过程文本含基础段与公式', () => {
    const preview = computeLivePreview(system, { baseValues: {}, equipBonuses: {}, buffBonuses: {} })
    expect(preview.cycle).toBeNull()
    expect(preview.baseValues['力量']).toBe(10)
    expect(preview.values['HP']).toBe(350)
    expect(preview.processLines[0]).toBe('─── 基础属性 ───')
    expect(preview.processLines).toContain('  力量 = 10')
    expect(preview.processLines).toContain('  HP = 力量*10 + 体质*20 + 敏捷*5')
    expect(preview.processLines).toContain('    → 350.0')
  })

  it('装备固定加成先于 Buff 百分比：(20 + 5) × 1.2 = 30，HP = 550', () => {
    const preview = computeLivePreview(system, {
      baseValues: { 力量: 20 },
      equipBonuses: { 力量: 5 },
      buffBonuses: { 力量: 20 }
    })
    expect(preview.baseValues['力量']).toBeCloseTo(30)
    expect(preview.values['HP']).toBeCloseTo(550)
    expect(preview.processLines).toContain('  力量 = 30')
    expect(preview.processLines).toContain('─── 装备加成 ───')
    expect(preview.processLines).toContain('  力量 +5')
    expect(preview.processLines).toContain('─── Buff加成 ───')
    expect(preview.processLines).toContain('  力量 +20%')
  })

  it('无加成时不输出装备/Buff 段', () => {
    const preview = computeLivePreview(system, { baseValues: {}, equipBonuses: { 力量: 0 }, buffBonuses: {} })
    expect(preview.processLines).not.toContain('─── 装备加成 ───')
    expect(preview.processLines).not.toContain('─── Buff加成 ───')
  })

  it('非整数基础值精确展示', () => {
    const preview = computeLivePreview(system, { baseValues: {}, equipBonuses: {}, buffBonuses: { 力量: 25 } })
    expect(preview.baseValues['力量']).toBeCloseTo(12.5)
    expect(preview.processLines).toContain('  力量 = 12.5')
  })

  it('环依赖：cycle 报告成员，值仅含基础输入', () => {
    const cyclic: AttrSystem = { attributes: { A: attr('A', { B: 1 }), B: attr('B', { A: 1 }) } }
    const preview = computeLivePreview(cyclic, { baseValues: {}, equipBonuses: {}, buffBonuses: {} })
    expect(preview.cycle).toEqual(['A', 'B'])
    expect(preview.values).toEqual({})
  })

  it('属性分组：基础 4 与派生/战斗 13（定义顺序）', () => {
    expect(baseAttrNames(system)).toEqual(['力量', '智力', '敏捷', '体质'])
    expect(derivedAndCombatNames(system)).toHaveLength(13)
    expect(derivedAndCombatNames(system)[0]).toBe('HP')
  })
})