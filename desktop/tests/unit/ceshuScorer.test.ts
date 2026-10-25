import { describe, expect, it } from 'vitest'

import { CHAPTER_KEYS, type CeshuDocument, type ChapterKey } from '../../src/shared/ceshuConstants'
import { CESHU_CHAPTER_FIELDS } from '../../src/shared/ceshuFields'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'
import {
  CHAPTER_WORD_BENCHMARK,
  INDUSTRY_BENCHMARKS,
  MARKET_SCORE_RULES,
  PASS_THRESHOLDS,
  countWordsInChapter,
  gradeLabel,
  scoreCeshu
} from '../../src/shared/ceshuScorer'

/**
 * 空文档：以 createDefaultCeshu 为骨架，将 18 章全部清空。
 * （仓库默认档在 meta/systems 中含 version/date/系统名等初始文案，按“完全未填写”口径清空后评分。）
 */
function emptyDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full' })
  const target = doc as unknown as Record<string, unknown>
  for (const key of CHAPTER_KEYS) {
    target[key] = {}
  }
  return doc
}

describe('N4 评分引擎：三维度（匹平 Python ceshu_scorer）', () => {
  it('空文档：结构/质量/市场均为 0，等级 D，24 章明细，全部不及格（P2 后 17→24）', () => {
    const report = scoreCeshu(emptyDoc())
    expect(report.structure_score).toBe(0)
    expect(report.content_quality_score).toBe(0)
    expect(report.market_potential_score).toBe(0)
    expect(report.total_score).toBe(0)
    expect(report.grade).toBe('D')
    expect(report.chapter_scores).toHaveLength(24)
    expect(report.pass_status).toEqual({ structure: false, quality: false, market: false, total: false })
    expect(report.suggestions.some((s) => s.includes('有 24 章完全未填写'))).toBe(true)
  })

  it('仅填 meta 四必填：meta 章 79、结构/总分 1.7、systems 章 20（P2 后 24 章 47 必填，完成度与覆盖率双摊薄）', () => {
    const doc = emptyDoc()
    doc.meta = { game_name: '测试游戏', game_type: 'RPG', positioning: '一句话定位', tags: ['标签'] }
    const report = scoreCeshu(doc)

    const meta = report.chapter_scores.find((c) => c.chapter_key === 'meta')
    const systems = report.chapter_scores.find((c) => c.chapter_key === 'systems')
    // 0.5*100 + 0.3*30（12 字 < 50 最低标准）+ 0.2*100
    expect(meta?.score).toBe(79)
    expect(meta?.word_count).toBe(12)
    expect(meta?.has_required).toBe(true)
    expect(systems?.score).toBe(20) // 无必填字段 → 必填分 100；完成度与字数 0

    expect(report.structure_score).toBe(1.7)
    expect(report.total_score).toBe(1.7)
  })

  it('市场潜力：市场分析 7（kpi_forecast 未填）+ 商业模式 10 + MVP 10 + 差异化 1 = 28', () => {
    const doc = emptyDoc()
    doc.meta = { game_name: '测试游戏', game_type: 'RPG', positioning: '一句话定位', tags: ['标签'] }
    doc.market_analysis = { target_market: '国内', market_size: '百亿', competitors: [{ name: 'A' }, { name: 'B' }] }
    doc.monetization = { payment_model: 'f2p', pricing_tiers: ['6', '30', '68'], iap_design: [{ item: '礼包' }], arpu_target: '100' }
    doc.mvp = { mvp_scope: '核心循环', mvp_timeline: '3 个月', milestones: [{ name: 'M1' }, { name: 'M2' }], success_criteria: '留存 40%' }
    doc.vision = { differentiation: '差异化' }

    const report = scoreCeshu(doc)
    expect(report.market_potential_score).toBe(28)
  })

  /*
   * 2026-10-26 回归：`kpi_forecast` 曾被默认值 / 模板 / 评分规则三处引用却没有字段定义，
   * 市场分析章的满分因此只有 7（其它两章各 10）。补回字段后应能打满 10。
   */
  it('补齐 kpi_forecast 后市场分析可拿满 10 分', () => {
    const doc = emptyDoc()
    doc.market_analysis = {
      target_market: '国内',
      market_size: '百亿',
      competitors: [{ name: 'A' }, { name: 'B' }],
      kpi_forecast: ['DAU|20 万|上线 3 个月']
    }
    const report = scoreCeshu(doc)
    // 市场分析四项齐活 = 10 分（未设差异化，故无 +1）
    expect(report.market_potential_score).toBe(10)
  })

  it('评分规则引用的字段必须真实存在（防「规则指向不存在字段」再发生）', () => {
    const missing: string[] = []
    for (const [chapter, rules] of Object.entries(MARKET_SCORE_RULES)) {
      const known = new Set((CESHU_CHAPTER_FIELDS[chapter as ChapterKey] ?? []).map((field) => field.key))
      for (const [field] of rules) {
        if (!known.has(field)) missing.push(`${chapter}.${field}`)
      }
    }
    expect(missing, 'MARKET_SCORE_RULES 指向了不存在的字段').toEqual([])
  })
})

describe('N4 评分引擎：字数统计与文案', () => {
  it('中文字符 + 英文词；递归 str/dict/list，其余类型 0', () => {
    expect(countWordsInChapter('中文abc中文123')).toBe(6) // 4 个中文字 + 2 个英文词
    expect(countWordsInChapter({ a: ['中文'], b: { c: 'abc' } })).toBe(3) // 2 中文字 + 1 英文词
    expect(countWordsInChapter(123)).toBe(0)
    expect(countWordsInChapter(true)).toBe(0)
  })

  it('等级文案：S 含“卓越”、D 含“不足”', () => {
    expect(gradeLabel('S')).toContain('卓越')
    expect(gradeLabel('D')).toContain('不足')
  })

  it('行业基准：RPG → label/top_games/vs_total', () => {
    const doc = emptyDoc()
    doc.meta = { game_type: 'RPG' }
    const report = scoreCeshu(doc)
    expect(report.industry_benchmark.game_type).toBe('RPG')
    expect(report.industry_benchmark.label).toBe('RPG / ARPG')
    expect(report.industry_benchmark.top_games).toContain('原神')
    expect(report.industry_benchmark.vs_total).toBe(Math.round((report.total_score - 77) * 10) / 10)

    // 未命中的 game_type 回退 default
    const other = emptyDoc()
    other.meta = { game_type: '未知类型' }
    expect(scoreCeshu(other).industry_benchmark.label).toBe(INDUSTRY_BENCHMARKS.default.label)
  })
})

describe('N4 评分引擎：导出常量锁定', () => {
  it('字数基准 / 及格阈值 / 行业基准 default', () => {
    expect(CHAPTER_WORD_BENCHMARK.meta).toEqual([50, 300, 150])
    expect(PASS_THRESHOLDS).toEqual({ structure: 18, quality: 24, market: 18, total: 60 })
    expect(INDUSTRY_BENCHMARKS.default.top_games).toEqual([])
  })

  /*
   * 回归守卫：2026-10-23 体检发现 worldview/characters 合并为 story 后，
   * 基准表留死条目、没有 story —— 评分对最大的章按 [0,0,0] 算「字数达标」。
   * 基准表现已按 ChapterKey 收口（漏配编译期报错），再用本测试兜底防人为删条目。
   */
  it('每个章节都有字数基准（story 不再是 [0,0,0]）', () => {
    for (const key of CHAPTER_KEYS) {
      const benchmark = CHAPTER_WORD_BENCHMARK[key]
      expect(benchmark, `章节 ${key} 缺少字数基准`).toBeDefined()
      expect(benchmark[0]).toBeGreaterThan(0)
      expect(benchmark[1]).toBeGreaterThan(benchmark[0])
    }
    expect(CHAPTER_WORD_BENCHMARK.story).toEqual([500, 1500, 800])
    // 死条目已清除（合并前的章名不应再作为键出现）
    expect(Object.keys(CHAPTER_WORD_BENCHMARK)).not.toContain('worldview')
    expect(Object.keys(CHAPTER_WORD_BENCHMARK)).not.toContain('characters')
    expect(Object.keys(CHAPTER_WORD_BENCHMARK)).toHaveLength(CHAPTER_KEYS.length)
  })

  it('story 章字数落在基准内时拿到字数分（不再因 [0,0,0] 白丢）', () => {
    const doc = emptyDoc()
    doc.story = { architecture: '世'.repeat(600), main_plot: '剧'.repeat(400) }
    const chapter = scoreCeshu(doc).chapter_scores.find((item) => item.chapter_key === 'story')
    expect(chapter?.benchmark_word).toEqual([500, 1500, 800])
    expect(chapter?.word_count).toBeGreaterThanOrEqual(500)
    // 字数达标这一项不再恒为 0：明细里不应出现「字数不足」类备注
    expect(chapter?.notes.join(' ')).not.toContain('字数')
  })

  /*
   * P0-3 根治（2026-10-26）：字数达标不再等于质量达标。
   * 改造前两章同分——只要字数进基准区间就拿满 30 分，等于奖励「写满」。
   */
  it('同样字数下，「写满但空」的章得分低于具体内容', () => {
    const hollow = emptyDoc()
    hollow.story = { architecture: '体验丰富多样。深度融合玩法。带来极致体验。'.repeat(40) }
    const solid = emptyDoc()
    solid.story = { architecture: '首关 90 秒，平均死亡 2.3 次。Boss 血量 1200。'.repeat(40) }

    const hollowChapter = scoreCeshu(hollow).chapter_scores.find((item) => item.chapter_key === 'story')
    const solidChapter = scoreCeshu(solid).chapter_scores.find((item) => item.chapter_key === 'story')

    // 前提：两章字数都过基准线，差距只来自内容质量，不是字数
    expect(hollowChapter?.word_count).toBeGreaterThanOrEqual(500)
    expect(solidChapter?.word_count).toBeGreaterThanOrEqual(500)
    expect(hollowChapter!.score).toBeLessThan(solidChapter!.score)
    expect(hollowChapter?.notes.join(' ')).toContain('内容质量系数')
    expect(solidChapter?.notes.join(' ')).not.toContain('内容质量系数')
  })

  it('报告建议点名「内容偏空」的章（字数够了但分低要能解释）', () => {
    const doc = emptyDoc()
    doc.story = { architecture: '体验丰富多样。深度融合玩法。带来极致体验。'.repeat(30) }
    const report = scoreCeshu(doc)
    expect(report.suggestions.some((s) => s.includes('内容偏空'))).toBe(true)
  })
})