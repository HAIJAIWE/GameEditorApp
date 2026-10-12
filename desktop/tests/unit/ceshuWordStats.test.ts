import { describe, expect, it } from 'vitest'

import type { CeshuDocument, ChapterKey } from '../../src/shared/ceshuConstants'
import { CHAPTER_KEYS } from '../../src/shared/ceshuConstants'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'
import { WORD_STATS_BENCHMARK, buildWordStatsReport, type CeshuWordStatRow } from '../../src/shared/ceshuWordStats'

function makeDoc(name = '字数测试'): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', name })
}

function rowOf(doc: CeshuDocument, key: ChapterKey): CeshuWordStatRow {
  const report = buildWordStatsReport(doc)
  const row = report.rows.find((r) => r.chapter_key === key)
  if (!row) throw new Error(`未找到章节 ${key}`)
  return row
}

/** 覆盖若干章节数据（其余保持默认），用于构造阈值场景 */
function docWith(chapters: Partial<Record<ChapterKey, Record<string, unknown>>>): CeshuDocument {
  const doc = makeDoc()
  for (const [key, value] of Object.entries(chapters)) {
    ;(doc as unknown as Record<string, unknown>)[key] = value
  }
  return doc
}

describe('字数统计：基准表（匹平 Python CHAPTER_WORD_BENCHMARK）', () => {
  it('17 章基准 (min, max, mid) 精确锁定', () => {
    expect(WORD_STATS_BENCHMARK).toEqual({
      meta: [50, 300, 150],
      vision: [200, 800, 400],
      story: [1000, 3000, 1600],
      gameplay: [300, 1000, 500],
      systems: [200, 800, 400],
      numeric: [300, 1000, 500],
      art: [300, 800, 500],
      tech: [300, 1000, 500],
      resources: [200, 800, 400],
      market_analysis: [400, 1200, 700],
      combat: [400, 1200, 700],
      economy: [400, 1200, 700],
      monetization: [300, 1000, 600],
      mvp: [200, 800, 400],
      risk_handling: [300, 1000, 500],
      audio: [200, 800, 400],
      accessibility: [100, 500, 250]
    })
    expect(Object.keys(WORD_STATS_BENCHMARK)).toHaveLength(17)
  })

  it('行序为 CHAPTER_KEYS 全 17 章，标签取自 CHAPTER_LABELS', () => {
    const report = buildWordStatsReport(makeDoc())
    expect(report.rows).toHaveLength(17)
    expect(report.rows.map((r) => r.chapter_key)).toEqual([...CHAPTER_KEYS])
    expect(report.rows[0].chapter_label).toBe('文档信息')
    expect(report.rows[16].chapter_label).toBe('第十六章·可访问性与本地化')
  })
})

describe('字数统计：默认文档结果（精确数字）', () => {
  it('代表章节 words / percent / advice / percent_level', () => {
    const doc = makeDoc()
    expect(rowOf(doc, 'meta')).toMatchObject({
      words: 13,
      percent: 8,
      percent_level: 'low',
      advice: '🟠 字数偏少（建议至少 50 字）',
      advice_color: '#ffb74d'
    })
    expect(rowOf(doc, 'vision')).toMatchObject({
      words: 0,
      percent: 0,
      percent_level: 'low',
      advice: '🔴 章节为空，建议尽快填写',
      advice_color: '#e57373'
    })
    expect(rowOf(doc, 'story')).toMatchObject({ words: 0, percent: 0, advice: '🔴 章节为空，建议尽快填写' })
    expect(rowOf(doc, 'systems')).toMatchObject({
      words: 35,
      percent: 8,
      percent_level: 'low',
      advice: '🟠 字数偏少（建议至少 200 字）'
    })
  })

  it('汇总 total_words / total_target / overall_percent / overall_level', () => {
    const report = buildWordStatsReport(makeDoc())
    expect(report.total_words).toBe(48)
    expect(report.total_target).toBe(9200)
    expect(report.overall_percent).toBe(0)
    expect(report.overall_level).toBe('low')
  })
})

describe('字数统计：建议阈值四分支与完成度上限', () => {
  it('0 字 → 🔴 章节为空', () => {
    const doc = docWith({ vision: {} })
    expect(rowOf(doc, 'vision')).toMatchObject({ words: 0, advice: '🔴 章节为空，建议尽快填写', advice_color: '#e57373' })
  })

  it('低于 min → 🟠 字数偏少（含建议字数）', () => {
    const doc = docWith({ meta: { x: '文'.repeat(20) } })
    expect(rowOf(doc, 'meta')).toMatchObject({
      words: 20,
      advice: '🟠 字数偏少（建议至少 50 字）',
      advice_color: '#ffb74d'
    })
  })

  it('达到 min 边界 → 🟢 字数合理', () => {
    const doc = docWith({ meta: { x: '文'.repeat(50) } })
    expect(rowOf(doc, 'meta')).toMatchObject({ words: 50, advice: '🟢 字数合理', advice_color: '#81c784' })
  })

  it('超过 max*1.5 需严格大于：450 🟢 / 451 🟡', () => {
    const at = docWith({ meta: { x: '文'.repeat(450) } })
    expect(rowOf(at, 'meta').advice).toBe('🟢 字数合理')
    const over = docWith({ meta: { x: '文'.repeat(451) } })
    expect(rowOf(over, 'meta')).toMatchObject({
      percent: 120,
      advice: '🟡 字数过多（建议精简到 300 字以内）',
      advice_color: '#fff176'
    })
  })

  it('percent 向零截断与上限 120', () => {
    // 10/150*100 = 6.67 → trunc 6（四舍五入会是 7）
    expect(rowOf(docWith({ meta: { x: '文'.repeat(10) } }), 'meta').percent).toBe(6)
    // 1000/150*100 = 666 → min(120, 666) = 120
    expect(rowOf(docWith({ meta: { x: '文'.repeat(1000) } }), 'meta').percent).toBe(120)
  })

  it('percent 分档：>=100 hi / >=50 mid / 其余 low', () => {
    expect(rowOf(docWith({ meta: { x: '文'.repeat(150) } }), 'meta').percent_level).toBe('hi') // 100
    expect(rowOf(docWith({ meta: { x: '文'.repeat(75) } }), 'meta').percent_level).toBe('mid') // 50
    expect(rowOf(docWith({ meta: { x: '文'.repeat(74) } }), 'meta').percent_level).toBe('low') // 49
  })
})

describe('字数统计：整体完成度上限与分级', () => {
  it('overall_percent 上限 100，且 >=80 为 hi', () => {
    const doc = docWith({ story: { x: '文'.repeat(10000) } })
    const report = buildWordStatsReport(doc)
    expect(report.total_words).toBe(10048)
    expect(report.overall_percent).toBe(100)
    expect(report.overall_level).toBe('hi')
  })

  it('50~79 为 mid', () => {
    const doc = docWith({ meta: { x: '文'.repeat(6000) } })
    const report = buildWordStatsReport(doc)
    expect(report.total_words).toBe(6035)
    expect(report.overall_percent).toBe(65)
    expect(report.overall_level).toBe('mid')
  })

  it('低于 50 为 low（空文档 0%）', () => {
    const report = buildWordStatsReport(makeDoc())
    expect(report.overall_percent).toBe(0)
    expect(report.overall_level).toBe('low')
  })
})