import { describe, expect, it } from 'vitest'

import { applyBatchOp, filterItemRecords, withRenamedName } from '@mobai/shared/util/data'
import type { ItemRecord } from '@mobai/shared/types'

function record(id: string, data: Record<string, unknown>): ItemRecord {
  return { id, type: 'role', data: { id, ...data }, createdAt: '', updatedAt: '' }
}

describe('列表搜索过滤', () => {
  const items = [
    record('R1', { name: '艾尔文', desc: '圣骑士团长' }),
    record('R2', { name: '希尔瓦', desc: 'dark ranger' }),
    record('R3', { name: '兽人战士', desc: '斧头帮' })
  ]

  it('空查询返回全部；大小写不敏感', () => {
    expect(filterItemRecords(items, '')).toHaveLength(3)
    expect(filterItemRecords(items, '   ')).toHaveLength(3)
    expect(filterItemRecords(items, 'DARK')).toHaveLength(1)
  })

  it('空格分词为多关键词 AND；id 字段参与匹配', () => {
    expect(filterItemRecords(items, '艾尔文 团长')).toHaveLength(1)
    expect(filterItemRecords(items, '艾尔文 兽人')).toHaveLength(0)
    expect(filterItemRecords(items, 'r2')).toHaveLength(1)
  })

  it('仅 name/desc/id 的字符串值参与匹配；无匹配返回空数组', () => {
    const withNumber = [record('R4', { name: '数字条目', value: 123 })]
    expect(filterItemRecords(withNumber, '123')).toHaveLength(0)
    expect(filterItemRecords(items, '不存在')).toEqual([])
  })
})

describe('批量操作纯函数', () => {
  const base = { id: 'X1', name: '旧名', value: 100, tags: 'a' }

  it('设置字段值：可为空串；不修改入参', () => {
    const next = applyBatchOp(base, { kind: 'set_value', field: 'name', value: '' })
    expect(next).toEqual({ ...base, name: '' })
    expect(base.name).toBe('旧名')
  })

  it('追加文本：空值不加分隔符，非空按分隔符拼接', () => {
    expect(applyBatchOp({ id: 'X', name: '' }, { kind: 'append_value', field: 'name', value: '新', separator: ',' })).toEqual({
      id: 'X',
      name: '新'
    })
    expect(applyBatchOp({ id: 'X', name: '旧' }, { kind: 'append_value', field: 'name', value: '新', separator: '-' })).toEqual({
      id: 'X',
      name: '旧-新'
    })
    expect(applyBatchOp({ id: 'X' }, { kind: 'append_value', field: 'name', value: '新', separator: ',' })).toEqual({
      id: 'X',
      name: '新'
    })
  })

  it('添加标签：固定使用逗号分隔', () => {
    expect(applyBatchOp({ id: 'X', tags: '' }, { kind: 'add_tag', field: 'tags', value: '稀有' })).toEqual({
      id: 'X',
      tags: '稀有'
    })
    expect(applyBatchOp({ id: 'X', tags: 'a' }, { kind: 'add_tag', field: 'tags', value: '稀有' })).toEqual({
      id: 'X',
      tags: 'a,稀有'
    })
  })

  it('数值增减：加/乘/设、百分比与缺字段容错、非数值返回 null（跳过）', () => {
    expect(applyBatchOp({ v: 100 }, { kind: 'adjust_number', field: 'v', mode: 'add', adjust: 5 })).toEqual({ v: '105' })
    expect(applyBatchOp({ v: '50%' }, { kind: 'adjust_number', field: 'v', mode: 'add', adjust: 5 })).toEqual({ v: '55' })
    expect(applyBatchOp({}, { kind: 'adjust_number', field: 'v', mode: 'add', adjust: 5 })).toEqual({ v: '5' })
    expect(applyBatchOp({ v: 10 }, { kind: 'adjust_number', field: 'v', mode: 'multiply', adjust: 3 })).toEqual({ v: '30' })
    // 乘 0 视为无效，保留原值
    expect(applyBatchOp({ v: 10 }, { kind: 'adjust_number', field: 'v', mode: 'multiply', adjust: 0 })).toEqual({ v: '10' })
    expect(applyBatchOp({ v: 10 }, { kind: 'adjust_number', field: 'v', mode: 'set', adjust: 7 })).toEqual({ v: '7' })
    expect(applyBatchOp({ v: 3.5 }, { kind: 'adjust_number', field: 'v', mode: 'add', adjust: 1 })).toEqual({ v: '4.5' })
    expect(applyBatchOp({ v: 'abc' }, { kind: 'adjust_number', field: 'v', mode: 'add', adjust: 1 })).toBeNull()
    expect(applyBatchOp({ v: '' }, { kind: 'adjust_number', field: 'v', mode: 'add', adjust: 1 })).toBeNull()
    expect(applyBatchOp({ v: true }, { kind: 'adjust_number', field: 'v', mode: 'add', adjust: 1 })).toBeNull()
  })
})
describe('条目重命名', () => {
  it('新名称去首尾空白后写入 name，其余字段原样保留、不修改入参', () => {
    const source = { id: 'R1', name: '旧名', desc: '描述' }
    const next = withRenamedName(source, '  新名  ')
    expect(next).toEqual({ id: 'R1', name: '新名', desc: '描述' })
    // 不修改入参
    expect(source.name).toBe('旧名')
    expect(next).not.toBe(source)
  })

  it('空白/仅空格名称视为取消→ null', () => {
    expect(withRenamedName({ name: '旧名' }, '')).toBeNull()
    expect(withRenamedName({ name: '旧名' }, '   ')).toBeNull()
    expect(withRenamedName({ name: '旧名' }, '\t\n')).toBeNull()
  })

  it('原无 name 字段时也能补上', () => {
    expect(withRenamedName({ id: 'R2' }, '新条目')).toEqual({ id: 'R2', name: '新条目' })
  })
})
