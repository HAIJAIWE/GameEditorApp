import { describe, expect, it } from 'vitest'

import { attrListToRows, buildAttrPreview, rowsToAttrList } from '@mobai/shared/domain/attr/attrList'
import { createDefaultAttrSystem, type AttrDefinition, type AttrSystem } from '@mobai/shared/attrSystem'

describe('属性列表编辑行 ↔ 存储转换', () => {
  it('非数组/缺失值按空列表处理', () => {
    expect(attrListToRows(undefined)).toEqual([])
    expect(attrListToRows(null)).toEqual([])
    expect(attrListToRows('力量')).toEqual([])
  })

  it('对象行映射为编辑行（数值转字符串），未知键保留', () => {
    expect(attrListToRows([{ name: '力量', value: 10, note: '备注' }])).toEqual([
      { name: '力量', value: '10', note: '备注' }
    ])
  })

  it('非对象元素按名称处理，null 数值转空字符串', () => {
    expect(attrListToRows(['幸运', { name: '体质', value: null }])).toEqual([
      { name: '幸运', value: '' },
      { name: '体质', value: '' }
    ])
  })

  it('保存：空名称行忽略、名称去空白、空数值按 0、未知键保留', () => {
    const rows = [
      { name: '  ', value: '5' },
      { name: ' 力量 ', value: '20', note: 'x' },
      { name: '幸运', value: '' }
    ]
    expect(rowsToAttrList(rows, '属性列表')).toEqual([
      { name: '力量', value: 20, note: 'x' },
      { name: '幸运', value: 0 }
    ])
  })

  it('保存：非数字数值抛错并带字段名与行号', () => {
    expect(() => rowsToAttrList([{ name: '力量', value: 'abc' }], '属性列表')).toThrow(
      '字段「属性列表」第 1 行的数值不是数字'
    )
  })
})

describe('属性列表计算预览', () => {
  const system = createDefaultAttrSystem()

  it('列表行作为输入，其余属性按 0 输入计算', () => {
    const rows = attrListToRows([
      { name: '力量', value: 20 },
      { name: '体质', value: 10 }
    ])
    const preview = buildAttrPreview(system, rows)
    expect(preview.cycle).toBeNull()
    expect(preview.unknownNames).toEqual([])

    const byName = new Map(preview.entries.map((entry) => [entry.name, entry]))
    // HP = 力量*10 + 体质*20 + 敏捷*5（敏捷未提供按 0）
    expect(byName.get('HP')).toMatchObject({ value: 400, source: 'computed' })
    expect(byName.get('力量')).toMatchObject({ value: 20, source: 'input' })
    expect(byName.get('敏捷')).toMatchObject({ value: 0, source: 'computed' })
    // 暴击率 = 敏捷*0.4 + 5 = 5（上限 100 不触发）
    expect(byName.get('暴击率')).toMatchObject({ value: 5 })
  })

  it('未被属性系统收录的名称单独提示且不参与计算', () => {
    const preview = buildAttrPreview(system, attrListToRows([{ name: '幸运', value: 5 }]))
    expect(preview.unknownNames).toEqual(['幸运'])
    expect(preview.entries.some((entry) => entry.name === '幸运')).toBe(false)
  })

  it('重复名称后者覆盖前者', () => {
    const rows = attrListToRows([
      { name: '力量', value: 10 },
      { name: '力量', value: 30 }
    ])
    const preview = buildAttrPreview(system, rows)
    expect(preview.entries.find((entry) => entry.name === '力量')?.value).toBe(30)
  })

  it('非法数值行不参与预览（保存时另行拦截）', () => {
    const rows = [
      { name: '力量', value: 'abc' },
      { name: '体质', value: '10' }
    ]
    const byName = new Map(buildAttrPreview(system, rows).entries.map((entry) => [entry.name, entry]))
    expect(byName.get('力量')).toMatchObject({ value: 0, source: 'computed' })
    expect(byName.get('HP')).toMatchObject({ value: 200 })
  })

  it('环依赖：报告成员且不产出条目', () => {
    const cyclic: AttrSystem = { attributes: { A: attr('A', { B: 1 }), B: attr('B', { A: 1 }) } }
    const preview = buildAttrPreview(cyclic, attrListToRows([{ name: 'A', value: 1 }]))
    expect(preview.cycle).toEqual(['A', 'B'])
    expect(preview.entries).toEqual([])
  })
})

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