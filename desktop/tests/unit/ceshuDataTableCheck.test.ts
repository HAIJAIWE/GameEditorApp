import { describe, expect, it } from 'vitest'

import { createDefaultCeshu } from '../../src/shared/ceshu/model'
import {
  checkDataTablePlan,
  parseDataTableRequirements,
  parseExpectedCount,
  readDataTableRows,
  type DataTableActual
} from '../../src/shared/ceshu/data'

/**
 * 设计 ↔ 数据表核对。
 *
 * 这是「设计文档驱动数据」的最后一公里：策划书写了「要 200 把武器，字段有攻击力/稀有度」，
 * 数据编辑器里却只有 3 条、字段还叫 atk——以前两边谁也发现不了。
 */

function table(overrides: Partial<DataTableActual> = {}): DataTableActual {
  return {
    typeId: 'equip',
    typeName: '装备',
    count: 200,
    fieldNames: ['id', 'name', 'value', 'atk', 'rare'],
    fieldLabels: ['ID:', '装备名称:', '数值:', '攻击力:', '稀有度:'],
    ...overrides
  }
}

describe('parseExpectedCount', () => {
  it('解析数字与下限写法', () => {
    expect(parseExpectedCount('200')).toEqual({ value: 200, isMinimum: false })
    expect(parseExpectedCount('≥50')).toEqual({ value: 50, isMinimum: true })
    expect(parseExpectedCount('>=50')).toEqual({ value: 50, isMinimum: true })
    expect(parseExpectedCount('50+')).toEqual({ value: 50, isMinimum: true })
    expect(parseExpectedCount('约 200 条')).toEqual({ value: 200, isMinimum: false })
  })

  it('没写或写不清 → null（不核对条数，而不是当 0 报错）', () => {
    expect(parseExpectedCount('').value).toBeNull()
    expect(parseExpectedCount('待定').value).toBeNull()
  })
})

describe('parseDataTableRequirements', () => {
  it('解析四段行；第 4 段可缺', () => {
    const rows = ['装备|武器与防具|攻击力,稀有度|200', '道具|消耗品|名称、效果']
    const [first, second] = parseDataTableRequirements(rows)

    expect(first?.tableName).toBe('装备')
    expect(first?.keyFields).toEqual(['攻击力', '稀有度'])
    expect(first?.expectedCount).toBe(200)
    expect(second?.keyFields).toEqual(['名称', '效果'])
    expect(second?.expectedCount).toBeNull()
  })

  it('空行与无表名的行直接跳过', () => {
    expect(parseDataTableRequirements(['', '   ', '|只有用途|字段|10'])).toHaveLength(0)
  })
})

describe('checkDataTablePlan', () => {
  it('全部对上时 ok', () => {
    const result = checkDataTablePlan(parseDataTableRequirements(['装备|武器|攻击力,稀有度|200']), [table()])
    expect(result.ok).toBe(true)
    expect(result.issues).toHaveLength(0)
  })

  it('没建表 → 明确说「数据编辑器里没有这个类型」', () => {
    const result = checkDataTablePlan(parseDataTableRequirements(['怪物|敌人|血量|50']), [table()])
    expect(result.ok).toBe(false)
    expect(result.issues[0]?.kind).toBe('missing_table')
    expect(result.issues[0]?.message).toContain('怪物')
  })

  it('条数不够 → error；超出 → warn（可能是漏改设计）', () => {
    const short = checkDataTablePlan(parseDataTableRequirements(['装备|x|攻击力|200']), [table({ count: 37 })])
    expect(short.issues[0]?.kind).toBe('count_short')
    expect(short.issues[0]?.level).toBe('error')
    expect(short.issues[0]?.message).toContain('37')

    const over = checkDataTablePlan(parseDataTableRequirements(['装备|x|攻击力|200']), [table({ count: 260 })])
    expect(over.issues[0]?.kind).toBe('count_over')
    expect(over.issues[0]?.level).toBe('warn')
  })

  it('下限写法：多于下限不报，少于下限才报', () => {
    const ok = checkDataTablePlan(parseDataTableRequirements(['装备|x|攻击力|≥50']), [table({ count: 300 })])
    expect(ok.ok).toBe(true)

    const bad = checkDataTablePlan(parseDataTableRequirements(['装备|x|攻击力|≥50']), [table({ count: 10 })])
    expect(bad.issues[0]?.kind).toBe('count_short')
  })

  it('缺字段 → 只列真缺的（已声明的中文标签算对上）', () => {
    const result = checkDataTablePlan(parseDataTableRequirements(['装备|x|攻击力,暴击率|200']), [table()])
    const issue = result.issues.find((item) => item.kind === 'missing_field')
    expect(issue?.message).toContain('暴击率')
    expect(issue?.message).not.toContain('攻击力')
  })

  it('字段用键名写也能对上（value / 数值 都认）', () => {
    expect(checkDataTablePlan(parseDataTableRequirements(['装备|x|value|200']), [table()]).ok).toBe(true)
    expect(checkDataTablePlan(parseDataTableRequirements(['装备|x|数值|200']), [table()]).ok).toBe(true)
  })

  it('表名用类型 id 也能匹配', () => {
    const result = checkDataTablePlan(parseDataTableRequirements(['equip|x|数值|200']), [table()])
    expect(result.ok).toBe(true)
  })

  it('建了但一条数据都没有 → warn（空表比没建更可疑）', () => {
    const result = checkDataTablePlan(parseDataTableRequirements(['装备|x|数值|200']), [table({ count: 0 })])
    expect(result.issues.some((item) => item.kind === 'empty_table')).toBe(true)
  })

  it('没声明任何表 → ok 且 requirements 为空（「没写」不是「不符」）', () => {
    const result = checkDataTablePlan([], [table()])
    expect(result.ok).toBe(true)
    expect(result.requirements).toHaveLength(0)
  })
})

describe('checkDataTablePlan：AI 生成缺失数据的定位信息', () => {
  it('count_short 带上 typeId 与缺口（期望 - 实际）', () => {
    const result = checkDataTablePlan(parseDataTableRequirements(['装备|x|数值|200']), [table({ count: 37 })])
    const issue = result.issues.find((item) => item.kind === 'count_short')
    expect(issue?.typeId).toBe('equip')
    expect(issue?.gap).toBe(163)
  })

  it('empty_table 带上 typeId 与缺口（= 期望数）', () => {
    const result = checkDataTablePlan(parseDataTableRequirements(['装备|x|数值|200']), [table({ count: 0 })])
    const issue = result.issues.find((item) => item.kind === 'empty_table')
    expect(issue?.typeId).toBe('equip')
    expect(issue?.gap).toBe(200)
  })

  it('missing_table 没有 typeId（先补齐结构，不能灌数据）', () => {
    const result = checkDataTablePlan(parseDataTableRequirements(['怪物|x|数值|50']), [table()])
    const issue = result.issues.find((item) => item.kind === 'missing_table')
    expect(issue?.typeId).toBeUndefined()
    expect(issue?.gap).toBeUndefined()
  })
})

describe('readDataTableRows', () => {
  it('从文档 tech.data_tables 读行；章不可见时视为没有声明', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: 'X' })
    ;(doc.tech as Record<string, unknown>).data_tables = ['装备|武器|攻击力|200']
    expect(readDataTableRows(doc)).toEqual(['装备|武器|攻击力|200'])

    // lite 档看不到 tech 章 ⇒ 声明无从谈起
    const lite = createDefaultCeshu({ scope: 'lite', name: 'X' })
    expect(readDataTableRows(lite)).toEqual([])
  })
})

/**
 * 字段匹配要「容错」：类型里的标签是「道具名称:」「效果类型:」，
 * 而策划在设计里只会写「名称」「效果」。精确匹配会制造一堆假警报。
 */
describe('checkDataTablePlan：字段名容错', () => {
  const item: DataTableActual = {
    typeId: 'item',
    typeName: '道具',
    count: 10,
    fieldNames: ['id', 'name', 'type', 'rare', 'effect', 'value'],
    fieldLabels: ['ID:', '道具名称:', '类型:', '稀有度:', '效果类型:', '数值:']
  }

  it('写「名称」能对上标签「道具名称:」', () => {
    const result = checkDataTablePlan(parseDataTableRequirements(['道具|x|名称,效果|10']), [item])
    expect(result.issues.filter((entry) => entry.kind === 'missing_field')).toHaveLength(0)
  })

  it('单字声明不算命中（避免「血」把一堆字段都认成匹配）', () => {
    const result = checkDataTablePlan(parseDataTableRequirements(['道具|x|血|10']), [item])
    expect(result.issues.some((entry) => entry.kind === 'missing_field')).toBe(true)
  })

  it('确实不存在的字段仍然报出来（真缺就是真缺）', () => {
    const result = checkDataTablePlan(parseDataTableRequirements(['道具|x|冷却时间|10']), [item])
    const issue = result.issues.find((entry) => entry.kind === 'missing_field')
    expect(issue?.message).toContain('冷却时间')
  })
})

/**
 * 表名归一必须与「补齐」共用同一份解析。
 * 否则会出现最糟的循环：核对说「没建表」→ 用户点补齐 → 补齐补到「装备」上 →
 * 核对还说「没建表」（因为「装备表」对不上「装备」）→ 用户再点一次…
 */
describe('checkDataTablePlan：表名归一', () => {
  it('「装备表」按「装备」处理，不再误报「没建表」', () => {
    const result = checkDataTablePlan(parseDataTableRequirements(['装备表|x|数值|200']), [table()])
    expect(result.issues.some((issue) => issue.kind === 'missing_table')).toBe(false)
  })

  it('名称相近也归一（「装备与武器」→ 装备）', () => {
    const result = checkDataTablePlan(parseDataTableRequirements(['装备与武器|x|数值|200']), [table()])
    expect(result.issues.some((issue) => issue.kind === 'missing_table')).toBe(false)
  })

  it('真的没有才报未建表（单字/无交集不归一）', () => {
    const result = checkDataTablePlan(parseDataTableRequirements(['世界事件|x|权重|40']), [table()])
    expect(result.issues.some((issue) => issue.kind === 'missing_table')).toBe(true)
  })
})
