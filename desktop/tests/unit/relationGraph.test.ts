import { describe, expect, it } from 'vitest'

import { UNKNOWN_TYPE_COLOR, buildRelationRows, buildSubjectDetailLine, itemDisplayName } from '../../src/shared/relationGraph'
import { BUILTIN_DATA_TYPES } from '../../src/shared/typeSchema'
import type { DataTypeDef, ItemRecord } from '../../src/shared/types'

function record(type: string, id: string, data: Record<string, unknown>): ItemRecord {
  return { id, type, data: { id, name: `${type}-${id}`, ...data }, createdAt: '', updatedAt: '' }
}

const items: ItemRecord[] = [
  record('skill', 'SKILL000', { name: '火球术', desc: '造成火焰伤害' }),
  record('skill', 'SKILL001', { name: '冰霜箭', description: '减速目标' }),
  record('skill', 'SKILL002', { name: '闪电链', effect: '连锁 3 个目标' }),
  record('skill', 'SKILL003', { name: '无描述技能' }),
  record('role', 'ROLE001', {
    name: '艾尔文',
    job: '战士',
    level: 12,
    skills: ['SKILL000'],
    talents: 'SKILL002、SKILL999',
    buffs: [{ id: 'SKILL001' }, { id: 'SKILL003' }]
  }),
  record('role', 'ROLE002', { name: '希尔瓦', skills: [], buffs: [] })
]

const types: DataTypeDef[] = BUILTIN_DATA_TYPES
const role = items.find((item) => item.id === 'ROLE001')!
const roleEmpty = items.find((item) => item.id === 'ROLE002')!

describe('关系图行构建（对齐 Python relation_graph._show_subject）', () => {
  it('按引用字段展开，逐 token 一行，解析出名称/类型/ID/描述/类型色', () => {
    const rows = buildRelationRows(types, items, role)
    expect(rows.map((row) => [row.field, row.name, row.typeLabel, row.targetId, row.detail])).toEqual([
      ['skills', '火球术', '技能', 'SKILL000', '造成火焰伤害'],
      ['talents', '闪电链', '技能', 'SKILL002', '连锁 3 个目标'],
      ['talents', 'SKILL999', null, null, ''],
      ['buffs', '冰霜箭', '技能', 'SKILL001', '减速目标'],
      ['buffs', '无描述技能', '技能', 'SKILL003', '']
    ])
  })

  it('描述列回退链 desc → description → effect，皆无则为空串', () => {
    const rows = buildRelationRows(types, items, role)
    expect(rows.find((row) => row.targetId === 'SKILL000')?.detail).toBe('造成火焰伤害')
    expect(rows.find((row) => row.targetId === 'SKILL001')?.detail).toBe('减速目标')
    expect(rows.find((row) => row.targetId === 'SKILL002')?.detail).toBe('连锁 3 个目标')
    expect(rows.find((row) => row.targetId === 'SKILL003')?.detail).toBe('')
  })

  it('未解析 token 仍出一行：名称=原文，类型/ID 为 null，色为兜底灰（供渲染层补「-」）', () => {
    const rows = buildRelationRows(types, items, role)
    const dangling = rows.find((row) => row.targetId === null)!
    expect(dangling.name).toBe('SKILL999')
    expect(dangling.typeLabel).toBeNull()
    expect(dangling.typeId).toBeNull()
    expect(dangling.color).toBe(UNKNOWN_TYPE_COLOR)
  })

  it('已解析行的 typeId 用于双击跳转；类型色取自 schema 的 DataTypeDef.color', () => {
    const rows = buildRelationRows(types, items, role)
    const resolved = rows.find((row) => row.targetId === 'SKILL000')!
    expect(resolved.typeId).toBe('skill')
    expect(resolved.color).toBe(types.find((def) => def.id === 'skill')!.color)
  })

  it('空字段 / 空数组不产出任何行（对齐 `if not val: continue`）', () => {
    expect(buildRelationRows(types, items, roleEmpty)).toEqual([])
  })

  it('类型不在 schema 里时类型名回落到原始 id', () => {
    const custom: ItemRecord[] = [...items, record('weapon', 'W1', { name: '铁剑' })]
    const holder = record('role', 'ROLE003', { skills: ['W1'] })
    const rows = buildRelationRows(types, [...custom, holder], holder)
    expect(rows).toHaveLength(1)
    expect(rows[0].typeLabel).toBe('weapon')
    expect(rows[0].color).toBe(UNKNOWN_TYPE_COLOR)
  })
})

describe('主体信息摘要行（对齐 Python `" | ".join(details[:8])`）', () => {
  it('跳过 id / name，列表展开为 `a, b(id)`，字符串与数字直出', () => {
    expect(buildSubjectDetailLine(role)).toBe(
      'job: 战士 | level: 12 | skills: SKILL000 | talents: SKILL002、SKILL999 | buffs: SKILL001(SKILL001), SKILL003(SKILL003)'
    )
  })

  it('跳过空数组（有意差异：Python 会追加一条 `字段: ` 空壳）', () => {
    expect(buildSubjectDetailLine(roleEmpty)).toBe('')
  })

  it('最多只取前 8 段', () => {
    const many = record('role', 'ROLE009', {
      a: 1,
      b: 2,
      c: 3,
      d: 4,
      e: 5,
      f: 6,
      g: 7,
      h: 8,
      i: 9
    })
    expect(buildSubjectDetailLine(many).split(' | ')).toHaveLength(8)
    expect(buildSubjectDetailLine(many)).toBe('a: 1 | b: 2 | c: 3 | d: 4 | e: 5 | f: 6 | g: 7 | h: 8')
  })

  it('列表含非对象元素时直接用其字符串（对象取 id 展示）', () => {
    const mixed = record('role', 'ROLE010', { tags: ['勇者', { id: 'T1' }, { id: 'T2', name: '光环' }] })
    expect(buildSubjectDetailLine(mixed)).toBe('tags: 勇者, T1(T1), 光环(T2)')
  })

  it('空字符串字段被跳过', () => {
    const blank = record('role', 'ROLE011', { note: '', level: 3 })
    expect(buildSubjectDetailLine(blank)).toBe('level: 3')
  })
})

describe('条目展示名', () => {
  it('name 非空取 name，否则回落 id', () => {
    expect(itemDisplayName(record('role', 'R1', { name: '甲' }))).toBe('甲')
    expect(itemDisplayName(record('role', 'R2', { name: '' }))).toBe('R2')
    // 无 name 键（不经过会补 name 的 record 助手）
    expect(itemDisplayName({ id: 'R3', type: 'role', data: {}, createdAt: '', updatedAt: '' })).toBe('R3')
  })
})
