import { describe, expect, it } from 'vitest'

import {
  REF_LEVEL_MAX,
  REF_LEVEL_MIN,
  REF_TYPE_LABELS,
  canParseAsRefTable,
  clampRefLevel,
  normalizeRefEntries,
  refTypeDisplayName,
  resolveRefTypeId,
  serializeRefEntries
} from '@mobai/shared/util/search'
import type { DataTypeDef } from '@mobai/shared/types'

/** 最小 schema 夹具：id 单数、pluralKey 复数，口径与 types.ts 一致 */
const TYPES: readonly DataTypeDef[] = [
  { id: 'skill', name: '技能', pluralKey: 'skills', color: '#000', formFields: [] },
  { id: 'role', name: '角色', pluralKey: 'roles', color: '#000', formFields: [] }
]

describe('refTable：常量与 REF_TYPE_LABELS', () => {
  it('等级上下界为 0 / 999', () => {
    expect(REF_LEVEL_MIN).toBe(0)
    expect(REF_LEVEL_MAX).toBe(999)
  })

  it('REF_TYPE_LABELS 对齐 旧版 的 7 项复数键映射', () => {
    expect(REF_TYPE_LABELS).toEqual({
      skills: '技能',
      talents: '天赋',
      equips: '装备',
      items: '道具',
      monsters: '怪物',
      roles: '角色',
      achievements: '成就'
    })
  })
})

describe('refTable：clampRefLevel', () => {
  it('负数归 0', () => {
    expect(clampRefLevel(-1)).toBe(0)
    expect(clampRefLevel(-999)).toBe(0)
  })

  it('超过上界归 999', () => {
    expect(clampRefLevel(1000)).toBe(999)
    expect(clampRefLevel(999)).toBe(999)
  })

  it('小数向下截断', () => {
    expect(clampRefLevel(5.9)).toBe(5)
    expect(clampRefLevel(0.99)).toBe(0)
  })

  it('NaN → 0', () => {
    expect(clampRefLevel(Number.NaN)).toBe(0)
  })

  it('Infinity / -Infinity → 0', () => {
    expect(clampRefLevel(Number.POSITIVE_INFINITY)).toBe(0)
    expect(clampRefLevel(Number.NEGATIVE_INFINITY)).toBe(0)
  })
})

describe('refTable：resolveRefTypeId', () => {
  it('复数 pluralKey 命中 → 返回单数 id', () => {
    expect(resolveRefTypeId('skills', TYPES)).toBe('skill')
    expect(resolveRefTypeId('roles', TYPES)).toBe('role')
  })

  it('单数 id 命中 → 返回自身', () => {
    expect(resolveRefTypeId('skill', TYPES)).toBe('skill')
  })

  it('未知 refType → null', () => {
    expect(resolveRefTypeId('weapons', TYPES)).toBeNull()
    expect(resolveRefTypeId('', TYPES)).toBeNull()
  })
})

describe('refTable：refTypeDisplayName', () => {
  it('types 解析到 → 返回 def.name', () => {
    expect(refTypeDisplayName('skills', TYPES)).toBe('技能')
    expect(refTypeDisplayName('skill', TYPES)).toBe('技能')
  })

  it('types 解析不到 → 走 REF_TYPE_LABELS 兜底（复数键）', () => {
    expect(refTypeDisplayName('talents', [])).toBe('天赋')
    expect(refTypeDisplayName('monsters', [])).toBe('怪物')
  })

  it('REF_TYPE_LABELS 单数形式也能兜底（键单数化后匹配）', () => {
    expect(refTypeDisplayName('talent', [])).toBe('天赋')
  })

  it('彻底未知 → 回退 refType 原值', () => {
    expect(refTypeDisplayName('weapons', [])).toBe('weapons')
    expect(refTypeDisplayName('unknown_type', TYPES)).toBe('unknown_type')
  })
})

describe('refTable：canParseAsRefTable', () => {
  it('null / undefined / 空数组 → true', () => {
    expect(canParseAsRefTable(null)).toBe(true)
    expect(canParseAsRefTable(undefined)).toBe(true)
    expect(canParseAsRefTable([])).toBe(true)
  })

  it('字符串数组 → true', () => {
    expect(canParseAsRefTable(['skills_1', 'skills_2'])).toBe(true)
  })

  it('{ id, level } 数组 → true', () => {
    expect(canParseAsRefTable([{ id: 'skills_1', level: 5 }])).toBe(true)
  })

  it('{ name, level } 数组 → true', () => {
    expect(canParseAsRefTable([{ name: '斩击', level: 1 }])).toBe(true)
  })

  it('含数字元素 → false', () => {
    expect(canParseAsRefTable([{ id: 'a', level: 1 }, 42])).toBe(false)
  })

  it('含数组元素 → false', () => {
    expect(canParseAsRefTable([['a']])).toBe(false)
  })

  it('元素 id 为空串 → false', () => {
    expect(canParseAsRefTable([{ id: '' }])).toBe(false)
  })

  it('非数组对象 → false', () => {
    expect(canParseAsRefTable({ id: 'a' })).toBe(false)
  })

  it('字符串 → false', () => {
    expect(canParseAsRefTable('skills_1')).toBe(false)
  })
})

describe('refTable：normalizeRefEntries', () => {
  it('非数组 → []', () => {
    expect(normalizeRefEntries(null)).toEqual([])
    expect(normalizeRefEntries(undefined)).toEqual([])
    expect(normalizeRefEntries({})).toEqual([])
    expect(normalizeRefEntries('x')).toEqual([])
  })

  it('字符串 → { id, level: 0 }', () => {
    expect(normalizeRefEntries(['skills_1', 'skills_2'])).toEqual([
      { id: 'skills_1', level: 0 },
      { id: 'skills_2', level: 0 }
    ])
  })

  it('{ id, level } 原样保留（忽略其它键）', () => {
    expect(normalizeRefEntries([{ id: 'skills_1', level: 5, extra: 'x' }])).toEqual([
      { id: 'skills_1', level: 5 }
    ])
  })

  it('{ name, level } → 无 id 的降级', () => {
    expect(normalizeRefEntries([{ name: '斩击', level: 3 }])).toEqual([
      { name: '斩击', level: 3 }
    ])
  })

  it('{ id, name, level } → 同时保留 name（id 为准）', () => {
    expect(normalizeRefEntries([{ id: 'skills_1', name: '斩击', level: 7 }])).toEqual([
      { id: 'skills_1', name: '斩击', level: 7 }
    ])
  })

  it('level 缺失 / 非法 → 0，越界则夹紧', () => {
    expect(normalizeRefEntries([{ id: 'a' }, { id: 'b', level: 1000 }, { id: 'c', level: -5 }, { id: 'd', level: 3.9 }])).toEqual([
      { id: 'a', level: 0 },
      { id: 'b', level: 999 },
      { id: 'c', level: 0 },
      { id: 'd', level: 3 }
    ])
  })

  it('脏元素跳过（数字 / null / 数组 / 空串 / 无 id 无 name 对象）', () => {
    expect(
      normalizeRefEntries([42, null, ['a'], '', {}, { id: '' }, { name: '' }, { id: 'ok', level: 1 }])
    ).toEqual([{ id: 'ok', level: 1 }])
  })
})

describe('refTable：serializeRefEntries', () => {
  it('保持输入顺序', () => {
    const input = [
      { id: 'b', level: 1 },
      { id: 'a', level: 2 },
      { id: 'c', level: 3 }
    ]
    expect(serializeRefEntries(input).map((e) => e.id)).toEqual(['b', 'a', 'c'])
  })

  it('丢弃无 id 且无 name 的条目（含空串）', () => {
    expect(
      serializeRefEntries([
        { level: 5 },
        { id: '', level: 1 },
        { name: '', level: 2 },
        { id: 'keep', level: 3 }
      ])
    ).toEqual([{ id: 'keep', level: 3 }])
  })

  it('缺省的键不输出（仅 name 时无 id 键，仅 id 时无 name 键）', () => {
    const onlyName = serializeRefEntries([{ name: '斩击', level: 1 }])[0]
    expect(onlyName).toEqual({ name: '斩击', level: 1 })
    expect(Object.prototype.hasOwnProperty.call(onlyName, 'id')).toBe(false)

    const onlyId = serializeRefEntries([{ id: 'skills_1', level: 1 }])[0]
    expect(onlyId).toEqual({ id: 'skills_1', level: 1 })
    expect(Object.prototype.hasOwnProperty.call(onlyId, 'name')).toBe(false)
  })

  it('level 经 clamp，输出为新对象（不改动输入）', () => {
    const input = [{ id: 'a', level: 5000 }]
    const out = serializeRefEntries(input)
    expect(out).toEqual([{ id: 'a', level: 999 }])
    expect(out).not.toBe(input)
    expect(out[0]).not.toBe(input[0])
  })

  it('与 normalize 往返一致', () => {
    const raw: unknown = [
      'skills_1',
      { id: 'skills_2', level: 1200 },
      { name: '旧数据', level: -3 },
      { id: 'skills_3', name: '带名', level: 8.7 },
      42,
      null
    ]
    const normalized = normalizeRefEntries(raw)
    const serialized = serializeRefEntries(normalized)
    expect(serialized).toEqual([
      { id: 'skills_1', level: 0 },
      { id: 'skills_2', level: 999 },
      { name: '旧数据', level: 0 },
      { id: 'skills_3', name: '带名', level: 8 }
    ])
    // 再规范化一次应幂等
    expect(normalizeRefEntries(serialized)).toEqual(serialized)
  })
})
