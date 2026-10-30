import { describe, expect, it } from 'vitest'

import {
  DROP_COUNT_MAX,
  DROP_COUNT_MIN,
  DROP_RATE_MAX,
  DROP_RATE_MIN,
  canParseAsDropTable,
  clampDropCount,
  clampDropRate,
  dropSourceLabel,
  dropSourceTypeId,
  normalizeDropEntries,
  normalizeDropRange,
  serializeDropEntries
} from '../../src/shared/util/data/dropTable'
import type { DropEntry } from '../../src/shared/util/data/dropTable'

describe('dropTable：常量', () => {
  it('夹紧边界与源码一致', () => {
    expect(DROP_RATE_MIN).toBe(0)
    expect(DROP_RATE_MAX).toBe(100)
    expect(DROP_COUNT_MIN).toBe(1)
    expect(DROP_COUNT_MAX).toBe(999)
  })
})

describe('dropTable：clampDropRate', () => {
  it('边界值原样保留', () => {
    expect(clampDropRate(0)).toBe(0)
    expect(clampDropRate(100)).toBe(100)
  })

  it('负值 → 0', () => {
    expect(clampDropRate(-1)).toBe(0)
    expect(clampDropRate(-999)).toBe(0)
  })

  it('超界 → 100', () => {
    expect(clampDropRate(101)).toBe(100)
    expect(clampDropRate(9999)).toBe(100)
  })

  it('小数截断（向零取整）', () => {
    expect(clampDropRate(10.9)).toBe(10)
    expect(clampDropRate(0.4)).toBe(0)
  })

  it('NaN / Infinity / -Infinity → 0', () => {
    expect(clampDropRate(Number.NaN)).toBe(0)
    expect(clampDropRate(Number.POSITIVE_INFINITY)).toBe(0)
    expect(clampDropRate(Number.NEGATIVE_INFINITY)).toBe(0)
  })
})

describe('dropTable：clampDropCount', () => {
  it('边界值原样保留', () => {
    expect(clampDropCount(1)).toBe(1)
    expect(clampDropCount(999)).toBe(999)
  })

  it('0 / 负值 → 1', () => {
    expect(clampDropCount(0)).toBe(1)
    expect(clampDropCount(-5)).toBe(1)
  })

  it('超界 → 999', () => {
    expect(clampDropCount(1000)).toBe(999)
    expect(clampDropCount(5000)).toBe(999)
  })

  it('小数截断（向零取整）', () => {
    expect(clampDropCount(5.9)).toBe(5)
    expect(clampDropCount(1.9)).toBe(1)
  })

  it('NaN / Infinity / -Infinity → 1', () => {
    expect(clampDropCount(Number.NaN)).toBe(1)
    expect(clampDropCount(Number.POSITIVE_INFINITY)).toBe(1)
    expect(clampDropCount(Number.NEGATIVE_INFINITY)).toBe(1)
  })
})

describe('dropTable：normalizeDropRange', () => {
  it('正常区间原样返回', () => {
    expect(normalizeDropRange(1, 5)).toEqual({ min: 1, max: 5 })
    expect(normalizeDropRange(10, 10)).toEqual({ min: 10, max: 10 })
  })

  it('min > max 时把 max 抬到 min', () => {
    expect(normalizeDropRange(10, 3)).toEqual({ min: 10, max: 10 })
  })

  it('各自夹紧到 [1,999]', () => {
    expect(normalizeDropRange(0, 2000)).toEqual({ min: 1, max: 999 })
    expect(normalizeDropRange(-5, -1)).toEqual({ min: 1, max: 1 })
  })

  it('小数截断后再比较', () => {
    expect(normalizeDropRange(2.9, 5.9)).toEqual({ min: 2, max: 5 })
    // 截断后 min=5 > max=3 → max 抬到 5
    expect(normalizeDropRange(5.1, 3.9)).toEqual({ min: 5, max: 5 })
  })

  it('NaN 兜底为 1', () => {
    expect(normalizeDropRange(Number.NaN, Number.NaN)).toEqual({ min: 1, max: 1 })
    expect(normalizeDropRange(7, Number.NaN)).toEqual({ min: 7, max: 7 })
  })
})

describe('dropTable：dropSourceTypeId / dropSourceLabel', () => {
  it('equip_drops → equip / 装备', () => {
    expect(dropSourceTypeId('equip_drops')).toBe('equip')
    expect(dropSourceLabel('equip_drops')).toBe('装备')
  })

  it('item_drops → item / 道具', () => {
    expect(dropSourceTypeId('item_drops')).toBe('item')
    expect(dropSourceLabel('item_drops')).toBe('道具')
  })

  it('title_drops 落到 item / 道具', () => {
    expect(dropSourceTypeId('title_drops')).toBe('item')
    expect(dropSourceLabel('title_drops')).toBe('道具')
  })

  it('未知字段名 → item / 道具', () => {
    expect(dropSourceTypeId('whatever')).toBe('item')
    expect(dropSourceLabel('')).toBe('道具')
  })
})

describe('dropTable：canParseAsDropTable', () => {
  it('null / undefined → true（视为空数据）', () => {
    expect(canParseAsDropTable(null)).toBe(true)
    expect(canParseAsDropTable(undefined)).toBe(true)
  })

  it('空数组 → true', () => {
    expect(canParseAsDropTable([])).toBe(true)
  })

  it('合法数组 → true', () => {
    expect(
      canParseAsDropTable([{ name: '铁剑', rate: 10, count_min: 1, count_max: 1 }])
    ).toBe(true)
    // 仅 name 也合法（其余键运行时兜底）
    expect(canParseAsDropTable([{ name: '铁剑' }])).toBe(true)
  })

  it('字符串 / 数字 / 普通对象 → false', () => {
    expect(canParseAsDropTable('drop')).toBe(false)
    expect(canParseAsDropTable(123)).toBe(false)
    expect(canParseAsDropTable({ name: '铁剑' })).toBe(false)
  })

  it('含数字元素 → false', () => {
    expect(canParseAsDropTable([{ name: '铁剑' }, 42])).toBe(false)
  })

  it('含 null 元素 → false', () => {
    expect(canParseAsDropTable([{ name: '铁剑' }, null])).toBe(false)
  })

  it('元素 name 为空串 / 非字符串 → false', () => {
    expect(canParseAsDropTable([{ name: '' }])).toBe(false)
    expect(canParseAsDropTable([{ name: 123 }])).toBe(false)
    expect(canParseAsDropTable([{ rate: 10 }])).toBe(false)
  })

  it('元素为数组 → false', () => {
    expect(canParseAsDropTable([[]])).toBe(false)
  })
})

describe('dropTable：normalizeDropEntries', () => {
  it('非数组 → []', () => {
    expect(normalizeDropEntries(null)).toEqual([])
    expect(normalizeDropEntries(undefined)).toEqual([])
    expect(normalizeDropEntries({ name: '铁剑' })).toEqual([])
    expect(normalizeDropEntries('x')).toEqual([])
  })

  it('缺省兜底：仅 name → rate 0、min/max 1', () => {
    expect(normalizeDropEntries([{ name: '铁剑' }])).toEqual([
      { name: '铁剑', rate: 0, count_min: 1, count_max: 1 }
    ])
  })

  it('夹紧 rate 与数量', () => {
    expect(
      normalizeDropEntries([{ name: '铁剑', rate: 200, count_min: 0, count_max: 5000 }])
    ).toEqual([{ name: '铁剑', rate: 100, count_min: 1, count_max: 999 }])
  })

  it('min > max 时抬升 max', () => {
    expect(normalizeDropEntries([{ name: '铁剑', count_min: 8, count_max: 2 }])).toEqual([
      { name: '铁剑', rate: 0, count_min: 8, count_max: 8 }
    ])
  })

  it('非 name 项被丢弃（null / 数字 / 缺 name / 空 name / 数组）', () => {
    expect(
      normalizeDropEntries([{ name: '铁剑' }, null, 5, { rate: 1 }, { name: '' }, []])
    ).toEqual([{ name: '铁剑', rate: 0, count_min: 1, count_max: 1 }])
  })

  it('丢弃多余键，只保留四键', () => {
    expect(
      normalizeDropEntries([{ name: '铁剑', rate: 10, count_min: 1, count_max: 3, id: 'x', junk: true }])
    ).toEqual([{ name: '铁剑', rate: 10, count_min: 1, count_max: 3 }])
  })

  it('非数值字符串 / NaN 走兜底', () => {
    expect(
      normalizeDropEntries([{ name: '铁剑', rate: 'abc', count_min: 'x', count_max: 'y' }])
    ).toEqual([{ name: '铁剑', rate: 0, count_min: 1, count_max: 1 }])
  })

  it('数字字符串可被解析', () => {
    expect(
      normalizeDropEntries([{ name: '铁剑', rate: '25', count_min: '2', count_max: '4' }])
    ).toEqual([{ name: '铁剑', rate: 25, count_min: 2, count_max: 4 }])
  })
})

describe('dropTable：serializeDropEntries', () => {
  it('保持输入顺序', () => {
    const entries: DropEntry[] = [
      { name: 'A', rate: 1, count_min: 1, count_max: 1 },
      { name: 'B', rate: 2, count_min: 2, count_max: 3 },
      { name: 'C', rate: 3, count_min: 1, count_max: 9 }
    ]
    expect(serializeDropEntries(entries).map((e) => e.name)).toEqual(['A', 'B', 'C'])
  })

  it('丢弃空 name 项，保留其余', () => {
    const entries = [
      { name: 'A', rate: 1, count_min: 1, count_max: 1 },
      { name: '', rate: 2, count_min: 1, count_max: 1 }
    ] as DropEntry[]
    expect(serializeDropEntries(entries)).toEqual([
      { name: 'A', rate: 1, count_min: 1, count_max: 1 }
    ])
  })

  it('输出形状与 normalize 一致（四键、已夹紧）', () => {
    const entries = [
      { name: '铁剑', rate: 999, count_min: 5, count_max: 1, id: 'x' }
    ] as unknown as DropEntry[]
    expect(serializeDropEntries(entries)).toEqual([
      { name: '铁剑', rate: 100, count_min: 5, count_max: 5 }
    ])
  })

  it('空数组 → []', () => {
    expect(serializeDropEntries([])).toEqual([])
  })
})
