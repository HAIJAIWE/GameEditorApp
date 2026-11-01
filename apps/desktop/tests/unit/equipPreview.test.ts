import { describe, expect, it } from 'vitest'

import {
  buffRecordToItem,
  computeEquipComparison,
  EQUIP_SLOTS,
  equipRecordToItem,
  formatPreviewNumber
} from '@mobai/shared/domain/attr/equipPreview'
import { createDefaultAttrSystem, defaultBaseValues, type AttrDefinition, type AttrSystem } from '@mobai/shared/attrSystem'

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

describe('装备/Buff 记录映射', () => {
  it('装备：base_attrs + extra_attrs 平铺为固定加成；part 与 rarity||rare 映射；零值剔除', () => {
    const item = equipRecordToItem({
      id: 'E1',
      name: '测试剑',
      part: '武器',
      rare: '传说',
      base_attrs: { 力量: 10, 敏捷: '5' },
      extra_attrs: { 体质: 3, 智力: 0 }
    })
    expect(item).toMatchObject({ itemId: 'E1', name: '测试剑', slot: '武器', rarity: '传说' })
    expect(item.bonuses).toEqual({ 力量: 10, 敏捷: 5, 体质: 3 })
    expect(item.percentageBonuses).toEqual({})
  })

  it('装备：无 attrs 时按 effect + value 推导（TS 扩展）；未知效果不加成', () => {
    expect(equipRecordToItem({ id: 'E2', name: '弓', part: '武器', effect: '攻击加成', value: 12 }).bonuses).toEqual({
      物攻: 12
    })
    expect(equipRecordToItem({ id: 'E3', name: 'x', part: '武器', effect: '未知效果', value: 5 }).bonuses).toEqual({})
    // 有 attrs 时不再叠加 effect 推导
    expect(
      equipRecordToItem({ id: 'E4', name: 'x', part: '武器', effect: '攻击加成', value: 12, base_attrs: { 力量: 2 } })
        .bonuses
    ).toEqual({ 力量: 2 })
  })

  it('装备：percentage_bonuses 导入扩展保留', () => {
    const item = equipRecordToItem({
      id: 'E5',
      name: 'x',
      part: '武器',
      base_attrs: { 力量: 2 },
      percentage_bonuses: { 物攻: 15 }
    })
    expect(item.percentageBonuses).toEqual({ 物攻: 15 })
  })

  it('Buff：value + effect_type 映射单项；未知类别不加成', () => {
    expect(buffRecordToItem({ id: 'B1', name: '祝福', type: '增益', effect_type: '属性提升', value: 20 }).bonuses).toEqual({
      力量: 20
    })
    expect(buffRecordToItem({ id: 'B2', name: '加速', type: '正面增益', effect_type: '加速', value: 5 }).bonuses).toEqual({
      敏捷: 5
    })
    expect(buffRecordToItem({ id: 'B3', name: '眩晕', type: '负面减益', effect_type: '眩晕', value: 99 }).bonuses).toEqual(
      {}
    )
  })

  it('槽位常量与装备 schema 部位一致', () => {
    expect(EQUIP_SLOTS).toEqual(['武器', '头盔', '胸甲', '护腿', '靴子', '手套', '戒指', '项链', '披风'])
  })
})

describe('装备对比计算（基础 → 装备 + Buff → 最终）', () => {
  it('固定加成先加、百分比后乘；Buff 参与计算', () => {
    const equip = equipRecordToItem({ id: 'E1', name: '剑', part: '武器', base_attrs: { 力量: 10 } })
    const buff = buffRecordToItem({ id: 'B1', name: '祝福', effect_type: '属性提升', value: 20 })
    const { rows } = computeEquipComparison(system, defaultBaseValues(system), [equip], [buff])
    const byName = new Map(rows.map((row) => [row.name, row]))
    // 力量 = 10 + 10 + 20 = 40 → HP = 400 + 200 + 50 = 650
    expect(byName.get('力量')).toMatchObject({ base: 10, final: 40, diff: 30 })
    expect(byName.get('HP')).toMatchObject({ base: 350, final: 650, diff: 300 })
  })

  it('百分比加成在固定加成之后生效', () => {
    const equip = equipRecordToItem({
      id: 'E1',
      name: '剑',
      part: '武器',
      base_attrs: { 力量: 10 },
      percentage_bonuses: { 力量: 50 }
    })
    const { rows } = computeEquipComparison(system, defaultBaseValues(system), [equip], [])
    // (10 + 10) × 1.5 = 30
    expect(rows.find((row) => row.name === '力量')?.final).toBe(30)
  })

  it('无装备与 Buff：最终等于基础（diff 全 0，17 行全属性）', () => {
    const { rows } = computeEquipComparison(system, defaultBaseValues(system), [], [])
    expect(rows).toHaveLength(17)
    expect(rows.every((row) => row.diff === 0)).toBe(true)
  })

  it('环依赖：cycle 报告成员且无对比行', () => {
    const cyclic: AttrSystem = { attributes: { A: attr('A', { B: 1 }), B: attr('B', { A: 1 }) } }
    const result = computeEquipComparison(cyclic, {}, [], [])
    expect(result.cycle).toEqual(['A', 'B'])
    expect(result.rows).toEqual([])
  })

  it('数值展示：整数省略小数，否则 1 位', () => {
    expect(formatPreviewNumber(350)).toBe('350')
    expect(formatPreviewNumber(12.5)).toBe('12.5')
    expect(formatPreviewNumber(-3)).toBe('-3')
  })
})