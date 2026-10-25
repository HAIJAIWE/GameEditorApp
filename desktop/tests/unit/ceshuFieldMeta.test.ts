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
    // systems 是动态配置；P2 扩展设计 7 章在字段定义交付前 fields 为空——
    // 「没有字段的章」无所谓契约，跳过（字段填充后自动纳入本守卫）
    const chapters = CHAPTER_KEYS.filter((key) => key !== 'systems' && (CESHU_CHAPTER_FIELDS[key] ?? []).length > 0)
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

  /**
   * 2026-10-26 补齐 37 个可起草字段后立的不变式（比 70% 阈值更强）：
   * 「AI 可起草」与「有生成目标」必须等价——可起草却没有 aiHint，
   * 等于让模型对着字段名自由发挥，契约就名存实亡。
   * 人定字段（aiDraftable:false）不参与：它们本就不该有 aiHint。
   */
  it('每个 AI 可起草字段都必须有 aiHint（可起草 ⇔ 有生成目标）', () => {
    const missing: string[] = []
    for (const chapter of CHAPTER_KEYS) {
      if (chapter === 'systems') continue
      for (const field of CESHU_CHAPTER_FIELDS[chapter] ?? []) {
        const meta = resolveFieldMeta(chapter, field)
        if (meta.aiDraftable && meta.aiHint === '') missing.push(`${chapter}.${field.key}`)
      }
    }
    expect(missing, '这些字段 AI 可起草却没有生成目标（aiHint）').toEqual([])
  })

  /**
   * 人审侧的不变式（2026-10-26）：每个字段都要有 reviewHint——包括人定字段。
   * 人定字段虽然 AI 不起草，但填的人同样需要知道「填完该自查什么」；
   * 缺 reviewHint 的字段在评审队列里等于没有检查点。
   */
  it('每个字段都有 reviewHint（人审要点 100%，含人定字段）', () => {
    const missing: string[] = []
    for (const chapter of CHAPTER_KEYS) {
      if (chapter === 'systems') continue
      for (const field of CESHU_CHAPTER_FIELDS[chapter] ?? []) {
        if (resolveFieldMeta(chapter, field).reviewHint === '') missing.push(`${chapter}.${field.key}`)
      }
    }
    expect(missing, '这些字段没有人审要点（reviewHint）').toEqual([])
  })

  /**
   * 反向缺口守卫（2026-10-26，见 docs/ceshu-field-necessity.md）：
   * 真实 5 页 GDD 的最后一节是「数据编辑对接（本设计需要哪些数据表）」，
   * 而本产品的本体就是数据编辑器。这个字段曾被漏掉，补上后钉住防删。
   */
  it('技术规格章保留「所需数据表」字段（真实 GDD 的数据编辑对接）', () => {
    const field = CESHU_CHAPTER_FIELDS.tech.find((item) => item.key === 'data_tables')
    expect(field, 'tech.data_tables 缺失——策划书无法告诉编辑器要建哪些表').toBeDefined()
    const meta = resolveFieldMeta('tech', field!)
    expect(meta.aiHint).not.toBe('')
    expect(meta.reviewHint).not.toBe('')
    expect(meta.required).toBe(false)
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
