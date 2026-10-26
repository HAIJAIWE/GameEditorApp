import { describe, expect, it } from 'vitest'

import {
  barPercent,
  buildAttributeChart,
  CHART_NAME_MAX,
  CHART_TOP_N,
  formatChartValue,
  truncateName,
  type ChartDatum
} from '../../src/shared/domain/attr/attributeChart'

/** 造一条带 id/name/字段值的条目 */
const row = (id: string, name: unknown, extra: Record<string, unknown> = {}): Record<string, unknown> => ({
  id,
  name,
  ...extra
})

describe('buildAttributeChart：抽字段 + 降序 + 统计', () => {
  it('按数值降序排列，并算出精确统计量', () => {
    const chart = buildAttributeChart(
      [row('1', '甲', { atk: 10 }), row('2', '乙', { atk: 30 }), row('3', '丙', { atk: 20 })],
      'atk'
    )
    expect(chart.data.map((d) => d.name)).toEqual(['乙', '丙', '甲'])
    expect(chart.stats).toEqual({ count: 3, min: 10, max: 30, avg: 20, sum: 60 })
    expect(chart.shown).toBe(3)
    expect(chart.truncated).toBe(0)
  })

  it('小数也参与统计（旧版 用 float() 解析）', () => {
    const chart = buildAttributeChart(
      [row('1', '甲', { hp: 10.5 }), row('2', '乙', { hp: 20.5 })],
      'hp'
    )
    expect(chart.stats.sum).toBeCloseTo(31, 10)
    expect(chart.stats.avg).toBeCloseTo(15.5, 10)
  })

  it('字符串数字被解析为数值（对齐 旧版 的 float(value)）', () => {
    const chart = buildAttributeChart([row('1', '甲', { level: '7' })], 'level')
    expect(chart.data[0]?.value).toBe(7)
  })

  it('非数值/空串/缺字段一律跳过，不进数据点（对齐 旧版 的 try/except continue）', () => {
    const chart = buildAttributeChart(
      [
        row('1', '甲', { atk: 10 }),
        row('2', '乙', { atk: '不是数字' }),
        row('3', '丙', { atk: '' }),
        row('4', '丁', { atk: null }),
        row('5', '戊', {}),
        row('6', '己', { atk: NaN }),
        row('7', '庚', { atk: Infinity })
      ],
      'atk'
    )
    expect(chart.data).toHaveLength(1)
    expect(chart.data[0]?.name).toBe('甲')
    expect(chart.stats.count).toBe(1)
  })

  it('空列表返回零值统计，不抛异常（避免 UI 出现 NaN）', () => {
    const chart = buildAttributeChart([], 'atk')
    expect(chart.data).toEqual([])
    expect(chart.stats).toEqual({ count: 0, min: 0, max: 0, avg: 0, sum: 0 })
    expect(chart.shown).toBe(0)
    expect(chart.truncated).toBe(0)
  })

  it('全部无效时统计为 0 而不是 NaN', () => {
    const chart = buildAttributeChart([row('1', '甲', { atk: 'x' })], 'atk')
    expect(chart.stats.avg).toBe(0)
    expect(Number.isNaN(chart.stats.avg)).toBe(false)
  })

  it('超过 20 条只画前 20，truncated 记明剩余数（对齐 旧版 data_points[:20]）', () => {
    const rows = Array.from({ length: 25 }, (_, i) => row(String(i), `条目${i}`, { atk: i }))
    const chart = buildAttributeChart(rows, 'atk')
    expect(chart.data).toHaveLength(25)
    expect(chart.shown).toBe(CHART_TOP_N)
    expect(chart.truncated).toBe(5)
    // 降序 ⇒ 前 20 是 atk 24..5
    expect(chart.data.slice(0, 3).map((d) => d.value)).toEqual([24, 23, 22])
  })

  it('负值也能正常排序与归一化（不假设数据非负）', () => {
    const chart = buildAttributeChart(
      [row('1', '甲', { atk: -5 }), row('2', '乙', { atk: 10 }), row('3', '丙', { atk: -1 })],
      'atk'
    )
    expect(chart.data.map((d) => d.value)).toEqual([10, -1, -5])
    expect(chart.stats.min).toBe(-5)
  })

  it('同值时按名称稳定排序，顺序确定不抖动（zh-CN 拼音序：丙bing < 甲jia < 乙yi）', () => {
    const chart = buildAttributeChart(
      [row('1', '丙', { atk: 5 }), row('2', '甲', { atk: 5 }), row('3', '乙', { atk: 5 })],
      'atk'
    )
    expect(chart.data.map((d) => d.name)).toEqual(['丙', '甲', '乙'])
  })

  it('缺 name 时用 id 兜底，都没有则「未命名」（对齐 旧版 的 name/id/未命名口径）', () => {
    const rows: Record<string, unknown>[] = [
      { id: 'a1', atk: 1 },
      { id: '', atk: 2 },
      { atk: 3 }
    ]
    const chart = buildAttributeChart(rows, 'atk')
    const names = chart.data.map((d) => d.name)
    expect(names).toContain('a1')
    expect(names).toContain('未命名')
  })

  it('name 是数字时也能显示（不渲染成 [object Object]）', () => {
    const chart = buildAttributeChart([{ id: 'x', name: 42, atk: 1 }], 'atk')
    expect(chart.data[0]?.name).toBe('42')
  })

  it('字段名不存在时返回空图，不抛异常', () => {
    const chart = buildAttributeChart([row('1', '甲', { atk: 1 })], '不存在的字段')
    expect(chart.data).toEqual([])
  })
})

describe('buildAttributeChart：ItemRecord 真实形状（业务字段在 data 下）', () => {
  /** 真实 ItemRecord：{ id, type, data: { name, hp, ... }, createdAt, updatedAt } */
  const record = (id: string, name: string, data: Record<string, unknown>): Record<string, unknown> => ({
    id,
    type: 'monster',
    data: { name, ...data },
    createdAt: '',
    updatedAt: ''
  })

  it('从 data 里读数值（不是顶层）—— 防止再次写成 row[field]', () => {
    const chart = buildAttributeChart([record('m1', '哥布林', { hp: 45 }), record('m2', '巨龙', { hp: 4200 })], 'hp')
    expect(chart.data.map((d) => d.value)).toEqual([4200, 45])
    expect(chart.data.map((d) => d.name)).toEqual(['巨龙', '哥布林'])
  })

  it('从 data 里读 name', () => {
    const chart = buildAttributeChart([record('m1', '亡灵法师', { atk: 71 })], 'atk')
    expect(chart.data[0]?.name).toBe('亡灵法师')
  })

  it('data 缺失时回退读顶层，且不抛异常', () => {
    const chart = buildAttributeChart([{ id: 'x', name: '扁平', atk: 9 }], 'atk')
    expect(chart.data[0]?.value).toBe(9)
    expect(chart.data[0]?.name).toBe('扁平')
  })

  it('data 不是对象时安全跳过', () => {
    const chart = buildAttributeChart([{ id: 'x', data: '坏数据', atk: 5 }], 'atk')
    // 顶层有 atk 仍能取到；data 非对象不应抛异常
    expect(chart.data[0]?.value).toBe(5)
  })

  it('统计量基于 data 内的真实数值', () => {
    const chart = buildAttributeChart(
      [record('m1', 'A', { hp: 10 }), record('m2', 'B', { hp: 20 }), record('m3', 'C', { hp: 30 })],
      'hp'
    )
    expect(chart.stats).toEqual({ count: 3, min: 10, max: 30, avg: 20, sum: 60 })
  })

  it('data 里该字段缺失 ⇒ 不进数据点', () => {
    const chart = buildAttributeChart([record('m1', 'A', { mp: 5 })], 'hp')
    expect(chart.data).toEqual([])
  })
})

describe('barPercent：柱条宽度归一化', () => {
  it('按最大值归一化到 0–100', () => {
    expect(barPercent(50, 100)).toBe(50)
    expect(barPercent(100, 100)).toBe(100)
    expect(barPercent(0, 100)).toBe(0)
  })

  it('max<=0 时返回 0，不产生 Infinity/NaN 宽度', () => {
    expect(barPercent(10, 0)).toBe(0)
    expect(barPercent(10, -1)).toBe(0)
  })

  it('负值条目不会算出负宽度', () => {
    expect(barPercent(-5, 10)).toBe(0)
  })

  it('超过最大值时钳到 100', () => {
    expect(barPercent(150, 100)).toBe(100)
  })
})

describe('formatChartValue / truncateName：展示格式', () => {
  it('整数不带小数，小数保留 1 位', () => {
    expect(formatChartValue(10)).toBe('10')
    expect(formatChartValue(10.46)).toBe('10.5')
  })

  it('超长名截断并加省略号，短名原样返回', () => {
    const long = 'a'.repeat(CHART_NAME_MAX + 5)
    expect(truncateName(long)).toBe(`${'a'.repeat(CHART_NAME_MAX)}…`)
    expect(truncateName('短名')).toBe('短名')
    expect(truncateName('a'.repeat(CHART_NAME_MAX))).toBe('a'.repeat(CHART_NAME_MAX))
  })
})

describe('类型契约：ChartDatum 形状稳定', () => {
  it('数据点只含 id/name/value 三个字段', () => {
    const chart = buildAttributeChart([row('1', '甲', { atk: 5 })], 'atk')
    const keys = Object.keys(chart.data[0] as ChartDatum).sort()
    expect(keys).toEqual(['id', 'name', 'value'])
  })
})
