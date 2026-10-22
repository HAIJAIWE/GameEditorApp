import { describe, expect, it } from 'vitest'

import { buildChapterPrompt } from '../../src/shared/ceshuAi'
import { CHAPTER_KEYS, type ChapterKey } from '../../src/shared/ceshuConstants'
import { CESHU_CHAPTER_FIELDS, resolveFieldMeta } from '../../src/shared/ceshuFields'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'

/**
 * 字段协作契约（人机协作写策划书的第一层）：
 * - `required` 从章节必填表派生，避免两处维护；
 * - `aiDraftable` 区分「AI 可起草」与「人定」；
 * - `aiHint` / `reviewHint` 让「生成目标」与「人审标准」在同一处对齐。
 */

describe('resolveFieldMeta：字段协作契约', () => {
  it('required 从章节必填表派生', () => {
    const positioning = CESHU_CHAPTER_FIELDS.meta.find((field) => field.key === 'positioning')
    expect(positioning).toBeDefined()
    expect(resolveFieldMeta('meta', positioning!).required).toBe(true)
  })

  it('人定字段 aiDraftable=false（如游戏名称）', () => {
    const gameName = CESHU_CHAPTER_FIELDS.meta.find((field) => field.key === 'game_name')!
    expect(resolveFieldMeta('meta', gameName).aiDraftable).toBe(false)
  })

  it('默认 aiDraftable=true、hint 为空', () => {
    expect(resolveFieldMeta('meta', { key: 'unknown', label: '未知', kind: 'text' as const })).toEqual({
      required: false,
      aiDraftable: true,
      aiHint: '',
      reviewHint: ''
    })
  })

  it('aiHint / reviewHint 原样透出', () => {
    const positioning = CESHU_CHAPTER_FIELDS.meta.find((field) => field.key === 'positioning')!
    const meta = resolveFieldMeta('meta', positioning)
    expect(meta.aiHint).toContain('给谁玩')
    expect(meta.reviewHint).toContain('一句话')
  })
})

describe('单字段生成提示词：带上字段契约', () => {
  it('onlyFields 时包含「字段写作要求 / AI 目标 / 人审要点」', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    const built = buildChapterPrompt(doc, 'meta', { onlyFields: ['positioning'] })
    expect(built.prompt).toContain('字段写作要求:')
    expect(built.prompt).toContain('AI 目标:')
    expect(built.prompt).toContain('人审要点:')
  })

  it('整章生成不追加字段写作要求（避免提示词膨胀）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    expect(buildChapterPrompt(doc, 'meta').prompt).not.toContain('字段写作要求:')
  })
})

/*
 * P0 补契约的回归守卫（2026-10-23）：
 * 体检时 aiHint 覆盖率仅 19%，补到 80% 后必须防回落——
 * 新增字段若忘记写契约，这里会失败并点名到字段。
 */
describe('字段契约覆盖率守卫（P0 补契约后不回落）', () => {
  it('每个章至少有一个带 aiHint 的字段，且全库覆盖率 ≥ 70%', () => {
    const chapters = CHAPTER_KEYS.filter((key) => key !== 'systems') // systems 是动态配置
    const missingChapters: string[] = []
    let withHint = 0
    let total = 0
    for (const chapter of chapters) {
      const fields = CESHU_CHAPTER_FIELDS[chapter] ?? []
      let chapterHasHint = false
      for (const field of fields) {
        total += 1
        if (resolveFieldMeta(chapter, field).aiHint !== '') {
          withHint += 1
          chapterHasHint = true
        }
      }
      if (!chapterHasHint) missingChapters.push(chapter)
    }
    expect(missingChapters, '这些章一个 aiHint 都没有').toEqual([])
    expect(withHint / total).toBeGreaterThanOrEqual(0.7)
  })

  it('P0 点名的高危字段必须有禁编造约束', () => {
    const highRisk: Array<[ChapterKey, string]> = [
      ['market_analysis', 'competitors'],
      ['market_analysis', 'market_size'],
      ['market_analysis', 'target_market']
    ]
    for (const [chapter, key] of highRisk) {
      const field = (CESHU_CHAPTER_FIELDS[chapter] ?? []).find((item) => item.key === key)
      expect(field, `${chapter}.${key} 不存在`).toBeDefined()
      const hint = resolveFieldMeta(chapter, field!)
      expect(hint.aiHint, `${chapter}.${key} 缺少禁编造约束`).toContain('待确认')
    }
  })

  it('P0 点名的人定字段必须 aiDraftable=false 且不带 aiHint', () => {
    const humanOnly: Array<[ChapterKey, string]> = [
      ['mvp', 'team_size'],
      ['mvp', 'budget_estimate'],
      ['monetization', 'whale_strategy'],
      ['monetization', 'arpu_target'],
      ['tech', 'engine'],
      ['tech', 'team_structure'],
      ['resources', 'budget.summary'],
      ['audio', 'audio_budget']
    ]
    for (const [chapter, key] of humanOnly) {
      const field = (CESHU_CHAPTER_FIELDS[chapter] ?? []).find((item) => item.key === key)
      expect(field, `${chapter}.${key} 不存在`).toBeDefined()
      const hint = resolveFieldMeta(chapter, field!)
      expect(hint.aiDraftable, `${chapter}.${key} 应标记为人定`).toBe(false)
      expect(hint.aiHint, `${chapter}.${key} 不应带 aiHint（人定字段不进提示词）`).toBe('')
    }
  })
})
