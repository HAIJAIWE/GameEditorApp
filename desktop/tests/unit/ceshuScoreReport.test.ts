import { describe, expect, it } from 'vitest'

import { buildScoreReportMarkdown, type CeshuScoreReport } from '../../src/shared/ceshu/ceshuScorer'

/**
 * `buildScoreReportMarkdown` 单测：逐节对齐 Python `score_report_dialog._build_markdown`。
 *
 * ⚠️ 夹具必须是**真实的 `CeshuScoreReport` 形状**（嵌套 chapter_scores / industry_benchmark /
 * pass_status），不能喂展平对象 —— 类型断言在编译期就会拦截，但这里显式标注类型以锁死契约。
 */
function makeReport(overrides: Partial<CeshuScoreReport> = {}): CeshuScoreReport {
  return {
    total_score: 82.5,
    structure_score: 26,
    content_quality_score: 33.5,
    market_potential_score: 23,
    grade: 'A',
    chapter_scores: [
      {
        chapter_key: 'meta',
        chapter_label: '项目元信息',
        score: 79,
        completion: 1,
        word_count: 120,
        benchmark_word: [50, 300, 150],
        has_required: true,
        missing_required: [],
        notes: []
      },
      {
        chapter_key: 'vision',
        chapter_label: '设计愿景',
        score: 42.5,
        completion: 0.5,
        word_count: 30,
        benchmark_word: [200, 800, 400],
        has_required: false,
        missing_required: ['design_vision'],
        notes: ['完成度仅 50%，需补充内容', '字数 30 < 最低标准 200']
      }
    ],
    suggestions: ['📋 有 2 章完全未填写，请优先补全核心章节', '🏗️ 结构完整度偏低，建议优先补全必填字段'],
    industry_benchmark: {
      game_type: 'RPG',
      label: 'RPG / ARPG',
      structure_avg: 25,
      quality_avg: 30,
      market_avg: 22,
      total_avg: 77,
      top_games: ['原神', '古剑奇谭'],
      vs_structure: 1,
      vs_quality: 3.5,
      vs_market: 1,
      vs_total: 5.5
    },
    pass_status: { structure: true, quality: true, market: true, total: true },
    ...overrides
  }
}

describe('评分报告 Markdown（匹平 Python score_report_dialog._build_markdown）', () => {
  it('标题 + meta + 总评 + 章节表 + 建议 + 行业对比逐行对齐', () => {
    const md = buildScoreReportMarkdown('测试游戏', 'RPG', makeReport(), '2026-10-07 12:00:00')

    // 标题与 meta
    expect(md).toContain('# 工业级 GDD 评分报告')
    expect(md).toContain('**游戏名称**: 测试游戏')
    expect(md).toContain('**游戏类型**: RPG')
    expect(md).toContain('**评分时间**: 2026-10-07 12:00:00')

    // 总评
    expect(md).toContain('## 总评')
    expect(md).toContain('- **总分**: 82.5 / 100')
    expect(md).toContain('- **等级**: A (A 优秀 — 接近工业级)')
    expect(md).toContain('- **结构完整度**: 26.0 / 30')
    expect(md).toContain('- **内容质量**: 33.5 / 40')
    expect(md).toContain('- **市场潜力**: 23.0 / 30')

    // 章节明细表格：表头 + 完成度 int(...)% + 齐全/缺 N + 备注 join('; ')
    expect(md).toContain('## 章节明细')
    expect(md).toContain('| 章节 | 评分 | 完成度 | 字数 | 必填字段 | 备注 |')
    expect(md).toContain('|------|------|--------|------|----------|------|')
    expect(md).toContain('| 项目元信息 | 79.0 | 100% | 120 | 齐全 | — |')
    expect(md).toContain('| 设计愿景 | 42.5 | 50% | 30 | 缺 1 | 完成度仅 50%，需补充内容; 字数 30 < 最低标准 200 |')

    // 改进建议
    expect(md).toContain('## 改进建议')
    expect(md).toContain('- 📋 有 2 章完全未填写，请优先补全核心章节')
    expect(md).toContain('- 🏗️ 结构完整度偏低，建议优先补全必填字段')

    // 同行业对比（差距带符号）
    expect(md).toContain('## 同行业对比')
    expect(md).toContain('- **行业**: RPG / ARPG')
    expect(md).toContain('- **行业平均总分**: 77.0')
    expect(md).toContain('- **你的总分**: 82.5')
    expect(md).toContain('- **差距**: +5.5')
    expect(md).toContain('- **行业代表**: 原神, 古剑奇谭')

    // 首行是标题、章节表与行业段顺序正确
    expect(md.startsWith('# 工业级 GDD 评分报告\n')).toBe(true)
    expect(md.indexOf('## 章节明细')).toBeLessThan(md.indexOf('## 改进建议'))
    expect(md.indexOf('## 改进建议')).toBeLessThan(md.indexOf('## 同行业对比'))
  })

  it('负向差距显示 -、行业代表为空则不输出该行、无游戏名/类型时回退默认', () => {
    const md = buildScoreReportMarkdown(
      '',
      '',
      makeReport({
        grade: 'C',
        total_score: 60,
        industry_benchmark: {
          game_type: 'default',
          label: '通用基准',
          structure_avg: 23,
          quality_avg: 28,
          market_avg: 20,
          total_avg: 63,
          top_games: [],
          vs_structure: 0,
          vs_quality: 0,
          vs_market: 0,
          vs_total: -3
        }
      }),
      '2026-10-07 12:00:00'
    )

    expect(md).toContain('**游戏名称**: 未命名')
    expect(md).toContain('**游戏类型**: 未知')
    expect(md).toContain('- **等级**: C (C 合格 — 待优化)')
    expect(md).toContain('- **差距**: -3.0')
    expect(md).not.toContain('行业代表')
  })

  it('备注/章节名中的竖线被转义，避免破坏表格', () => {
    const md = buildScoreReportMarkdown(
      '测试游戏',
      'RPG',
      makeReport({
        chapter_scores: [
          {
            chapter_key: 'meta',
            chapter_label: '项目 | 元信息',
            score: 79,
            completion: 0.99,
            word_count: 120,
            benchmark_word: [50, 300, 150],
            has_required: true,
            missing_required: [],
            notes: ['a|b']
          }
        ]
      }),
      '2026-10-07 12:00:00'
    )
    // 完成度 0.99 → int(99.0) = 99
    expect(md).toContain('| 项目 \\| 元信息 | 79.0 | 99% | 120 | 齐全 | a\\|b |')
    expect(md).not.toContain('a|b')
  })
})
