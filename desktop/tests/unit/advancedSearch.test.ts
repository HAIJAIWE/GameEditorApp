import { describe, expect, it } from 'vitest'

import {
  SEARCH_ALL_FIELDS,
  SEARCH_ALL_TYPES,
  SEARCH_FIELD_OPTIONS,
  resolveSearchValue,
  searchItems,
  truncateMatch
} from '../../src/shared/util/advancedSearch'
import type { ItemRecord } from '../../src/shared/types'

function item(type: string, id: string, data: Record<string, unknown>): ItemRecord {
  return { id, type, data: { ...data, id }, createdAt: '', updatedAt: '' }
}

const SKILLS = [
  item('skill', 's1', { name: '斩击', type: '攻击', desc: '向单体敌人造成物理伤害' }),
  item('skill', 's2', { name: '烈焰风暴', type: '攻击', desc: '群体法术伤害，附带燃烧' }),
  item('skill', 's3', { name: '圣光术', type: '治疗', desc: '恢复友方生命' })
]
const ROLES = [item('role', 'r1', { name: '战士', job: '战士', desc: '近战物理输出' })]

const ALL = [...SKILLS, ...ROLES]

describe('advancedSearch：字段口径', () => {
  it('SEARCH_FIELD_OPTIONS 对齐 Python 的 4 项', () => {
    expect(SEARCH_FIELD_OPTIONS.map((option) => option.value)).toEqual(['name', 'id', 'type', 'desc'])
  })

  it('resolveSearchValue：id 取记录 id（权威），其余取 data', () => {
    expect(resolveSearchValue(SKILLS[0], 'id')).toBe('s1')
    expect(resolveSearchValue(SKILLS[0], 'name')).toBe('斩击')
    // Python 的 item['type']（技能自身的攻击/治疗）→ TS 的 data['type']，不是 item.type
    expect(resolveSearchValue(SKILLS[0], 'type')).toBe('攻击')
    expect(resolveSearchValue(SKILLS[0], 'missing')).toBe('')
  })

  it('数字字段转字符串（可被搜到）', () => {
    const withNum = item('monster', 'm1', { name: '野猪', level: 5 })
    expect(resolveSearchValue(withNum, 'level')).toBe('5')
  })
})

describe('advancedSearch：searchItems', () => {
  it('关键词为空 → 空数组（Python 是弹窗提示，不返回全量）', () => {
    expect(searchItems(ALL, { keyword: '', type: SEARCH_ALL_TYPES, field: 'name' })).toEqual([])
    expect(searchItems(ALL, { keyword: '   ', type: SEARCH_ALL_TYPES, field: 'name' })).toEqual([])
  })

  it('按名称搜索，大小写不敏感', () => {
    expect(searchItems(SKILLS, { keyword: '斩击', type: SEARCH_ALL_TYPES, field: 'name' })).toHaveLength(1)
  })

  it('限定类型：只在该类型内搜（Python 的单类型行为）', () => {
    const hit = searchItems(ALL, { keyword: '战士', type: 'role', field: SEARCH_ALL_FIELDS })
    expect(hit.map((row) => row.id)).toEqual(['r1'])
    // 同样的词限定到 skill → 无结果
    expect(searchItems(ALL, { keyword: '战士', type: 'skill', field: SEARCH_ALL_FIELDS })).toHaveLength(0)
  })

  it('全部类型（哨兵）→ 跨类型命中（TS 增强）', () => {
    const hit = searchItems(ALL, { keyword: '战士', type: SEARCH_ALL_TYPES, field: SEARCH_ALL_FIELDS })
    expect(hit.map((row) => row.id)).toEqual(['r1'])
  })

  it('按描述字段搜（Python 的 desc 选项）', () => {
    expect(searchItems(SKILLS, { keyword: '燃烧', type: SEARCH_ALL_TYPES, field: 'desc' })).toHaveLength(1)
    // desc 里没有「燃烧」的字段是 name → 限定 name 搜不到
    expect(searchItems(SKILLS, { keyword: '燃烧', type: SEARCH_ALL_TYPES, field: 'name' })).toHaveLength(0)
  })

  it('全部字段（哨兵）→ 任意字段命中即算', () => {
    expect(searchItems(SKILLS, { keyword: '燃烧', type: SEARCH_ALL_TYPES, field: SEARCH_ALL_FIELDS })).toHaveLength(1)
  })

  it('空格拆分多词，全部命中（AND，与列表过滤同约定）', () => {
    expect(searchItems(SKILLS, { keyword: '攻击 物理', type: SEARCH_ALL_TYPES, field: SEARCH_ALL_FIELDS })).toHaveLength(1)
    expect(searchItems(SKILLS, { keyword: '攻击 不存在', type: SEARCH_ALL_TYPES, field: SEARCH_ALL_FIELDS })).toHaveLength(0)
  })

  it('搜不到返回空数组（不抛）', () => {
    expect(searchItems(ALL, { keyword: 'zzzz', type: SEARCH_ALL_TYPES, field: SEARCH_ALL_FIELDS })).toEqual([])
  })
})

describe('advancedSearch：truncateMatch', () => {
  it('短文本原样，长文本截断加省略号，并压平空白', () => {
    expect(truncateMatch('短')).toBe('短')
    expect(truncateMatch('a\nb   c')).toBe('a b c')
    const long = truncateMatch('x'.repeat(100), 10)
    expect(long).toHaveLength(11)
    expect(long.endsWith('…')).toBe(true)
  })
})
