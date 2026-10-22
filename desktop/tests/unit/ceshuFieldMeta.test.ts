import { describe, expect, it } from 'vitest'

import { buildChapterPrompt } from '../../src/shared/ceshuAi'
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
