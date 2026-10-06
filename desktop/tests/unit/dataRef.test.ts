import { describe, expect, it } from 'vitest'

import {
  buildRefOverview,
  extractAllRefs,
  formatRefValue,
  parseDataRefs,
  REF_NOT_FOUND_TEXT,
  resolveRefValue
} from '../../src/shared/dataRef'
import { CHAPTER_KEYS, type CeshuChapters } from '../../src/shared/ceshuConstants'
import type { DataTypeDef, ItemRecord } from '../../src/shared/types'

/**
 * 造一个合法的 `CeshuChapters`。
 *
 * ## 为什么需要这个 helper（而不是直接写 `{ meta: {...} }`）
 * `CeshuChapters` 是 `Record<ChapterKey, ChapterData>` 的**映射类型**，
 * 要求 18 个章节键**全部在场**（TS2345: 传部分章节对象不合法）。
 * 而 `extractAllRefs` 只需要「有值的那些章」⇒ 用空对象占位其余章。
 */
const chaptersOf = (partial: Partial<Record<string, unknown>>): CeshuChapters => {
  const out: Record<string, unknown> = {}
  for (const key of CHAPTER_KEYS) out[key] = {}
  return { ...out, ...partial } as CeshuChapters
}

const TYPES: DataTypeDef[] = [
  { id: 'role', name: '角色', pluralKey: 'roles', color: '#111', formFields: [], listFields: ['name'] },
  { id: 'skill', name: '技能', pluralKey: 'skills', color: '#222', formFields: [], listFields: ['name'] }
] as unknown as DataTypeDef[]

/** 造条目（业务字段在 .data 下，与真实 ItemRecord 一致） */
const item = (id: string, type: string, data: Record<string, unknown>): ItemRecord =>
  ({ id, type, data, createdAt: '', updatedAt: '' }) as ItemRecord

const ITEMS: ItemRecord[] = [
  item('hero_01', 'role', { name: '勇者', atk: 100, crit_rate: 0.25 }),
  item('hero_02', 'role', { name: '法师', atk: 80 }),
  item('fireball', 'skill', { name: '火球术', damage: 50 })
]

describe('parseDataRefs：语法解析', () => {
  it('解析两段式 @data[role.atk]', () => {
    const refs = parseDataRefs('角色基础攻击力为 @data[role.atk]，暴击率 25%')
    expect(refs).toHaveLength(1)
    expect(refs[0]).toMatchObject({ typeKey: 'role', itemId: '', field: 'atk', fullPath: 'role.atk' })
  })

  it('解析三段式 @data[role.hero_01.atk]', () => {
    const refs = parseDataRefs('@data[role.hero_01.atk]')
    expect(refs[0]).toMatchObject({ typeKey: 'role', itemId: 'hero_01', field: 'atk', fullPath: 'role.hero_01.atk' })
  })

  it('一段式 @data[role] 不匹配（对齐 Python 末尾的 + 量词）', () => {
    expect(parseDataRefs('@data[role]')).toHaveLength(0)
  })

  it('四段及以上跳过（对齐 Python else: continue）', () => {
    expect(parseDataRefs('@data[a.b.c.d]')).toHaveLength(0)
  })

  it('一段文本里多个引用按出现顺序返回', () => {
    const refs = parseDataRefs('@data[role.atk] 与 @data[skill.fireball.damage] 和 @data[role.crit_rate]')
    expect(refs.map((r) => r.fullPath)).toEqual(['role.atk', 'skill.fireball.damage', 'role.crit_rate'])
  })

  it('无引用返回空数组', () => {
    expect(parseDataRefs('普通文本没有引用')).toEqual([])
  })

  it('非法字符不匹配（下划线/数字开头的段、缺右括号）', () => {
    expect(parseDataRefs('@data[1abc.x]')).toHaveLength(0)
    expect(parseDataRefs('@data[role.atk')).toHaveLength(0)
    expect(parseDataRefs('@data[].x]')).toHaveLength(0)
  })

  it('⚠️ 连续两次调用不串味（全局正则 lastIndex 回归防护）', () => {
    const text = '@data[role.atk] @data[role.hp]'
    expect(parseDataRefs(text)).toHaveLength(2)
    // 第二次调用必须得到同样结果（若共享 lastIndex 会返回 0 条）
    expect(parseDataRefs(text)).toHaveLength(2)
  })

  it('⚠️ 中文标识符不被支持（对齐 Python 正则 [a-zA-Z_]，非 TS 缺陷）', () => {
    // Python REF_PATTERN 同样只认 ASCII；字段名若用中文则该引用**整体不匹配**（不会被当坏引用显示）
    expect(parseDataRefs('@data[role.不存在.atk]')).toHaveLength(0)
    expect(parseDataRefs('@data[角色.攻击]')).toHaveLength(0)
    // 混合：ASCII 段能解析的部分照常
    expect(parseDataRefs('@data[role.atk]').map((r) => r.field)).toEqual(['atk'])
  })

  it('raw 字段保留原始文本，供替换用', () => {
    expect(parseDataRefs('x @data[role.atk] y')[0]?.raw).toBe('@data[role.atk]')
  })
})

describe('resolveRefValue：🔧 修正了 PyQt 的单复数 bug', () => {
  it('单数写法 @data[role.atk] 能解析出值（Python 这里恒为 None）', () => {
    const ref = parseDataRefs('@data[role.atk]')[0]!
    // Python: raw.get('role') 但 data 的键是复数 'roles' ⇒ 永远拿不到
    // TS 修正后：按单数 id 归一 ⇒ 101 之外的真实值
    expect(resolveRefValue(ITEMS, TYPES, ref)).toBe(100)
  })

  it('复数写法 @data[roles.atk] 也认（兼容复数键）', () => {
    const ref = parseDataRefs('@data[roles.atk]')[0]!
    expect(resolveRefValue(ITEMS, TYPES, ref)).toBe(100)
  })

  it('itemId 为空 ⇒ 取该类型第一条（对齐 Python items[0]）', () => {
    const ref = parseDataRefs('@data[role.name]')[0]!
    expect(resolveRefValue(ITEMS, TYPES, ref)).toBe('勇者')
  })

  it('itemId 指定 ⇒ 精确匹配那条', () => {
    const ref = parseDataRefs('@data[role.hero_02.atk]')[0]!
    expect(resolveRefValue(ITEMS, TYPES, ref)).toBe(80)
  })

  it('itemId 不存在 ⇒ null（不静默回退到第一条，那会显示错值）', () => {
    const ref = parseDataRefs('@data[role.no_such_id.atk]')[0]!
    expect(resolveRefValue(ITEMS, TYPES, ref)).toBeNull()
  })

  it('类型不存在 ⇒ null', () => {
    const ref = parseDataRefs('@data[notexist.atk]')[0]!
    expect(resolveRefValue(ITEMS, TYPES, ref)).toBeNull()
  })

  it('字段不存在于该条目 ⇒ null', () => {
    const ref = parseDataRefs('@data[role.no_such_field]')[0]!
    expect(resolveRefValue(ITEMS, TYPES, ref)).toBeNull()
  })

  it('条目列表为空 ⇒ null（不抛）', () => {
    const ref = parseDataRefs('@data[role.atk]')[0]!
    expect(resolveRefValue([], TYPES, ref)).toBeNull()
  })

  it('⚠️ 类型定义缺 pluralKey 时不崩（浏览器实测崩过一次，整个面板白屏）', () => {
    // 运行时数据不一定完整：桩/用户手改 schema 都可能出现只有 id 没有 pluralKey 的类型
    const dirty = [{ id: 'skill', name: '技能' }] as unknown as DataTypeDef[]
    const ref = parseDataRefs('@data[role.atk]')[0]!
    // 归一函数要先按 id 找、找不到再按 pluralKey 找；缺字段时必须安全返回 null 而不是抛
    expect(() => resolveRefValue(ITEMS, dirty, ref)).not.toThrow()
    expect(resolveRefValue(ITEMS, dirty, ref)).toBe(100)
  })

  it('⚠️ id 与 pluralKey 都缺/类型异常时不崩', () => {
    const broken = [
      {},
      { id: null, pluralKey: undefined },
      { id: 123, pluralKey: 456 }
    ] as unknown as DataTypeDef[]
    const ref = parseDataRefs('@data[role.atk]')[0]!
    expect(() => resolveRefValue(ITEMS, broken, ref)).not.toThrow()
  })

  it('schema 为空时仍能按条目 type 直查（不因缺 types 就全废）', () => {
    const ref = parseDataRefs('@data[role.atk]')[0]!
    expect(resolveRefValue(ITEMS, [], ref)).toBe(100)
  })

  it('数值 0 与空串是「有值」，不是未找到', () => {
    const items = [item('z', 'role', { atk: 0, name: '' })]
    const atk = parseDataRefs('@data[role.atk]')[0]!
    const name = parseDataRefs('@data[role.name]')[0]!
    expect(resolveRefValue(items, TYPES, atk)).toBe(0)
    expect(resolveRefValue(items, TYPES, name)).toBe('')
  })
})

describe('formatRefValue：展示格式', () => {
  it('null/undefined ⇒ 空串', () => {
    expect(formatRefValue(null)).toBe('')
    expect(formatRefValue(undefined)).toBe('')
  })

  it('超长值截断到 60 并加省略号（对齐 Python [:60]）', () => {
    const long = 'x'.repeat(100)
    const out = formatRefValue(long)
    expect(out).toHaveLength(61)
    expect(out.endsWith('…')).toBe(true)
  })

  it('短值原样', () => {
    expect(formatRefValue(100)).toBe('100')
  })
})

describe('extractAllRefs：从整本策划书提取 + 去重', () => {
  it('遍历章节里的字符串字段', () => {
    const chapters = chaptersOf({ meta: { title: '战力 @data[role.atk]' } })
    expect(extractAllRefs(chapters).map((r) => r.fullPath)).toEqual(['role.atk'])
  })

  it('下探一层嵌套字典（对齐 Python 的 dict 分支）', () => {
    const chapters = chaptersOf({ meta: { nested: { a: '@data[role.atk]' } } })
    expect(extractAllRefs(chapters).map((r) => r.fullPath)).toEqual(['role.atk'])
  })

  it('列表里的字符串元素会被提取', () => {
    const chapters = chaptersOf({ meta: { list: ['@data[role.atk]', 123, '@data[role.hp]'] } })
    expect(extractAllRefs(chapters).map((r) => r.fullPath)).toEqual(['role.atk', 'role.hp'])
  })

  it('不递归第三层（对齐 Python 只下探一层的 else-if）', () => {
    const chapters = chaptersOf({ meta: { deep: { deeper: { x: '@data[role.atk]' } } } })
    expect(extractAllRefs(chapters)).toHaveLength(0)
  })

  it('同一 fullPath 去重，只保留首次', () => {
    const chapters = chaptersOf({
      meta: { a: '@data[role.atk]' },
      vision: { b: '@data[role.atk]' }
    })
    expect(extractAllRefs(chapters)).toHaveLength(1)
  })

  it('chapters 为 null ⇒ 空数组不抛', () => {
    expect(extractAllRefs(null)).toEqual([])
  })

  it('未知章节键被忽略（只认 CHAPTER_KEYS）', () => {
    expect(extractAllRefs(chaptersOf({ 不存在的章节: { a: '@data[role.atk]' } }))).toHaveLength(0)
  })
})

describe('buildRefOverview：概览 + 分组 + 有效计数', () => {
  const chapters = chaptersOf({
    meta: { a: '主角 @data[role.hero_01.atk] 很强' },
    vision: { b: '技能 @data[skill.fireball.damage]' },
    combat: { c: '缺失的 @data[role.hero_09.atk] 和 @data[nope.x]' }
  })

  it('总数与有效数分开统计', () => {
    const ov = buildRefOverview(chapters, ITEMS, TYPES)
    expect(ov.total).toBe(4)
    // hero_01.atk=100 ✓、fireball.damage=50 ✓、hero_09(条目不存在) ✗、nope(类型不存在) ✗
    expect(ov.resolved).toBe(2)
  })

  it('按 typeKey 分组（P7 便于阅读）', () => {
    const ov = buildRefOverview(chapters, ITEMS, TYPES)
    const keys = ov.groups.map((g) => g.typeKey)
    expect(keys).toEqual(['role', 'skill', 'nope'])
    expect(ov.groups[0]?.refs).toHaveLength(2) // role.hero_01.atk + role.hero_09.atk
  })

  it('found 标记区分「值本身是 0」与「没找到」', () => {
    const ov = buildRefOverview(chaptersOf({ meta: { a: '@data[role.hero_01.crit_rate]' } }), ITEMS, TYPES)
    expect(ov.resolved).toBe(1)
    const withZero = buildRefOverview(
      chaptersOf({ meta: { a: '@data[role.hero_01.atk]' } }),
      [item('hero_01', 'role', { atk: 0 })],
      TYPES
    )
    expect(withZero.resolved).toBe(1)
    expect(withZero.groups[0]?.refs[0]?.found).toBe(true)
  })

  it('没有引用时 total/resolved 都是 0，groups 为空', () => {
    const ov = buildRefOverview(chaptersOf({ meta: { a: '无引用文本' } }), ITEMS, TYPES)
    expect(ov).toEqual({ groups: [], total: 0, resolved: 0 })
  })

  it('未找到的占位常量存在（供 UI 展示）', () => {
    expect(REF_NOT_FOUND_TEXT).toBe('未找到')
  })
})
