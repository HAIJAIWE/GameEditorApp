import { describe, expect, it } from 'vitest'

import {
  BALANCE_STD_RATIO,
  assessBalance,
  countByType,
  mean,
  numericFieldNames,
  stdev,
  summarizeNumeric
} from '../../src/shared/util/dataStats'
import type { DataTypeDef, ItemRecord } from '../../src/shared/types'

function item(type: string, data: Record<string, unknown>): ItemRecord {
  return { id: `${type}-${Math.random()}`, type, data, createdAt: '', updatedAt: '' }
}

function typeDef(id: string, name: string, fields: DataTypeDef['formFields']): DataTypeDef {
  return { id, name, pluralKey: `${id}s`, color: '#000000', formFields: fields }
}

function spin(name: string, label: string): DataTypeDef['formFields'][number] {
  return { name, label, type: 'spinbox', editable: true, from: 0, to: 100 }
}

describe('dataStats：均值与样本标准差', () => {
  it('mean 空数组返回 0（不抛、不 NaN）', () => {
    expect(mean([])).toBe(0)
    expect(mean([3])).toBe(3)
    expect(mean([1, 2, 3, 4])).toBe(2.5)
  })

  it('stdev 是样本标准差', () => {
    // 旧版 statistics.stdev([2,4,4,4,5,5,7,9]) ≈ 2.13809
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).toBeCloseTo(2.13809, 4)
    // 与总体标准差（分母 n）区分开：同样数据的 pstdev ≈ 2.0
    expect(stdev([2, 4, 4, 4, 5, 5, 7, 9])).not.toBeCloseTo(2.0, 2)
  })

  it('stdev 样本数 < 2 返回 0', () => {
    expect(stdev([])).toBe(0)
    expect(stdev([5])).toBe(0)
  })

  it('全部相同值 → stdev 0', () => {
    expect(stdev([7, 7, 7, 7])).toBe(0)
  })
})

describe('dataStats：平衡性判定', () => {
  it('标准差 < 均值×0.3 → good', () => {
    expect(assessBalance(1, 10)).toBe('good') // 1 < 3
    expect(BALANCE_STD_RATIO).toBe(0.3)
  })

  it('标准差 ≥ 均值×0.3 → needs_adjust', () => {
    expect(assessBalance(3, 10)).toBe('needs_adjust') // 3 不小于 3
    expect(assessBalance(9, 10)).toBe('needs_adjust')
  })

  it('均值 ≤0 时不谎报「良好」（退回 needs_adjust）', () => {
    expect(assessBalance(0, 0)).toBe('needs_adjust')
    expect(assessBalance(1, -5)).toBe('needs_adjust')
  })
})

describe('dataStats：按类型计数', () => {
  const types = [typeDef('role', '角色', [spin('level', '等级:')]), typeDef('skill', '技能', [spin('value', '基础数值:')])]

  it('统计个数与占比', () => {
    const rows = countByType([item('role', {}), item('role', {}), item('skill', {})], types)
    expect(rows).toHaveLength(2)
    expect(rows[0]).toMatchObject({ type: 'role', name: '角色', count: 2 })
    expect(rows[0].percent).toBeCloseTo(66.67, 1)
    expect(rows[1]).toMatchObject({ type: 'skill', count: 1 })
    expect(rows[1].percent).toBeCloseTo(33.33, 1)
  })

  it('只统计 schema 里存在的类型（孤儿条目不计入，避免污染占比）', () => {
    const rows = countByType([item('role', {}), item('ghost', {})], types)
    expect(rows.map((row) => row.type)).toEqual(['role', 'skill'])
    // 孤儿条目仍算进总量（percent 分母是全部条目），但不会多出一列
    expect(rows[0].percent).toBeCloseTo(50, 5)
  })

  it('无数据时占比为 0（不是 NaN）', () => {
    const rows = countByType([], types)
    expect(rows.every((row) => row.percent === 0)).toBe(true)
  })
})

describe('dataStats：数值字段发现与统计', () => {
  const skillDef = typeDef('skill', '技能', [
    { name: 'id', label: 'ID:', type: 'entry', editable: false },
    { name: 'name', label: '技能名称:', type: 'entry', editable: true },
    spin('value', '基础数值:'),
    spin('cd', '冷却:')
  ])

  it('numericFieldNames 取 spinbox 且排除 id', () => {
    expect(numericFieldNames(skillDef)).toEqual(['value', 'cd'])
    expect(numericFieldNames(null)).toEqual([])
  })

  it('summarizeNumeric 汇总均值/最小/最大/标准差', () => {
    const summary = summarizeNumeric(
      [item('skill', { value: 10 }), item('skill', { value: 20 }), item('skill', { value: 30 })],
      'value',
      '基础数值'
    )
    expect(summary).not.toBeNull()
    expect(summary?.count).toBe(3)
    expect(summary?.avg).toBe(20)
    expect(summary?.min).toBe(10)
    expect(summary?.max).toBe(30)
    expect(summary?.std).toBeCloseTo(10, 5)
  })

  it('字符串数字也认（表单可能存字符串）；空串/非数字跳过', () => {
    const summary = summarizeNumeric(
      [item('skill', { value: '10' }), item('skill', { value: '' }), item('skill', { value: 'abc' }), item('skill', {})],
      'value'
    )
    expect(summary?.count).toBe(1)
    expect(summary?.avg).toBe(10)
  })

  it('完全没有有效数值 → null（调用方显示「无有效数值数据」）', () => {
    expect(summarizeNumeric([item('skill', { value: 'abc' })], 'value')).toBeNull()
    expect(summarizeNumeric([], 'value')).toBeNull()
  })

  it('label 缺省为字段名', () => {
    expect(summarizeNumeric([item('skill', { value: 5 })], 'value')?.label).toBe('value')
  })
})
