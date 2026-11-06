import { describe, expect, it } from 'vitest'

import {
  APP_ADVERSARIAL_CHECK_PROBES,
  agentForChapter,
  agentForDocChapter,
  buildChapterPrompt,
  buildReviewPrompts,
  buildReviewSummary,
  filterGeneratedFields,
  finalizeReview,
  mergeChapterDraft,
  parseReviewResponse
} from '@mobai/shared/ceshu/prompts'
import { createDefaultCeshu, isChapterAllowedForDoc, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import {
  APP_AGENT_DISPLAY,
  APP_AGENT_PROMPTS,
  APP_CHAPTER_FIELDS,
  APP_REVIEW_ROLE_NOUN,
  APP_SYSTEM_DOC_NOUN,
  appChapterAi
} from '@mobai/shared/appSchema'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'

/**
 * 路线 A 第 4 步守卫：AI 提示词按 docKind 分派。
 *
 * 「只换章表不换提示词 = 假分开」：应用档若仍收到「游戏策划书 / 伤害公式 /
 * 风格术语表 / 品类档案」，模型就会写出游戏内容。这里锁定应用档拿到的是 SDD
 * 角色与措辞，同时锁定游戏档输出仍是既有口径（零回归）。
 */
function appDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full', docKind: 'application', name: '效率工具' })
  doc.meta.project_name = '效率工具'
  doc.meta.platform = ['desktop', 'mobile']
  doc.meta.positioning = '给小团队用的轻量任务看板'
  return doc
}

function gameDoc(): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', name: '星海计划' })
}

const ARCH = 'architecture'

describe('应用档：章节生成提示词是 SDD 口径', () => {
  it('agent 路由取应用角色，游戏档仍等于既有 agentForChapter', () => {
    const app = agentForDocChapter(appDoc(), ARCH)
    expect(app.agentId).toBe(appChapterAi(ARCH).agentId)
    expect(app.displayName).toBe(APP_AGENT_DISPLAY[app.agentId])
    expect(app.agentPrompt).toContain(APP_AGENT_PROMPTS[app.agentId])
    expect(app.agentPrompt).toContain(appChapterAi(ARCH).aiHint)
    // 游戏档零回归
    expect(agentForDocChapter(gameDoc(), 'combat')).toEqual(agentForChapter('combat'))
  })

  it('system 用「软件设计文档 + 中文章标签」，不出现游戏措辞', () => {
    const built = buildChapterPrompt(appDoc(), ARCH)
    expect(built.system).toContain(APP_SYSTEM_DOC_NOUN)
    expect(built.system).toContain(APP_AGENT_DISPLAY[appChapterAi(ARCH).agentId])
    expect(built.system).not.toContain('游戏策划书')
    expect(built.system).not.toContain('资深游戏策划')
    // 应用章 key 是英文，导语里应显示规格中文标签而不是裸 key
    expect(built.prompt).not.toContain(`「${ARCH}」`)
  })

  it('上下文是项目/平台口径，且不下发游戏风格术语表', () => {
    const built = buildChapterPrompt(appDoc(), ARCH)
    expect(built.prompt).toContain('项目名称: 效率工具')
    expect(built.prompt).toContain('目标平台:')
    expect(built.prompt).toContain('一句话定位: 给小团队用的轻量任务看板')
    expect(built.prompt).not.toContain('游戏名称:')
    expect(built.prompt).not.toContain('游戏类型:')
    expect(built.prompt).not.toContain('风格术语表')
  })

  it('写作规范是软件工程口径（幂等 / P95），不含玩家/帧率/技能', () => {
    const built = buildChapterPrompt(appDoc(), ARCH)
    expect(built.prompt).toContain('幂等')
    expect(built.prompt).toContain('P95')
    expect(built.prompt).not.toContain('玩家怎么恢复')
    expect(built.prompt).not.toContain('帧率')
    expect(built.prompt).not.toContain('技能冷却')
  })

  it('字段清单来自应用档字段表，而非游戏 CESHU_CHAPTER_FIELDS', () => {
    const built = buildChapterPrompt(appDoc(), ARCH)
    const schemaKeys = (APP_CHAPTER_FIELDS[ARCH] ?? []).map((field) => field.key.split('.')[0])
    expect(schemaKeys.length).toBeGreaterThan(0)
    for (const key of schemaKeys) expect(built.fields).toContain(key)
    expect(built.fields).not.toContain('damage_formula')
  })

  it('单字段生成下发应用档字段的 aiHint / reviewHint', () => {
    const field = (APP_CHAPTER_FIELDS[ARCH] ?? []).find((def) => def.aiHint || def.reviewHint)
    expect(field).toBeDefined()
    const built = buildChapterPrompt(appDoc(), ARCH, { onlyFields: [field!.key] })
    expect(built.fields).toEqual([field!.key])
    expect(built.prompt).toContain('字段写作要求')
  })

  it('补全空字段走应用档写作规范', () => {
    const built = buildChapterPrompt(appDoc(), ARCH, { onlyEmpty: true })
    expect(built.prompt).toContain('符合应用类型与目标平台')
    expect(built.prompt).not.toContain('符合游戏类型和风格')
  })
})

describe('应用档：清洗链与反审', () => {
  it('filterGeneratedFields 保留应用章字段、拒绝任意键', () => {
    const doc = appDoc()
    const key = (APP_CHAPTER_FIELDS[ARCH] ?? [])[0].key
    const result = filterGeneratedFields(doc, ARCH, { [key]: '模块划分结论', garbage_key: '脏数据' })
    expect(result[key]).toBe('模块划分结论')
    expect(result.garbage_key).toBeUndefined()
  })

  it('mergeChapterDraft 不再把应用章 draft 过滤掉', () => {
    const doc = appDoc()
    const next = mergeChapterDraft(doc, { [ARCH]: { boundary: '按领域边界拆 3 个模块' } })
    expect((next as unknown as Record<string, Record<string, unknown>>)[ARCH].boundary).toBe('按领域边界拆 3 个模块')
  })

  it('finalizeReview 回填的 probe 与 SDD 追问表一致', () => {
    const doc = appDoc()
    const parsed = parseReviewResponse('{"findings":[],"overall":"","suggestions":[]}')
    const finalized = finalizeReview(parsed, doc)
    expect(finalized.genreLabel).toBe(APP_SYSTEM_DOC_NOUN)
    for (const finding of finalized.findings) {
      expect(finding.probe).toBe(APP_ADVERSARIAL_CHECK_PROBES[finding.key as keyof typeof APP_ADVERSARIAL_CHECK_PROBES])
    }
    const game = finalizeReview(parsed, gameDoc())
    expect(game.genreLabel).not.toBe(APP_SYSTEM_DOC_NOUN)
  })

  it('反审角色与追问是 SDD 口径，摘要覆盖应用章', () => {
    const doc = appDoc()
    const key = visibleChaptersForDoc(doc)[1]
    const field = (APP_CHAPTER_FIELDS[key] ?? [])[0]
    ;(doc as unknown as Record<string, Record<string, unknown>>)[key][field.key] = '一段具体的应用设计内容'
    const built = buildReviewPrompts(doc, { progressTotal: 0.2, validationCount: 1 })
    expect(built.system).toContain(APP_REVIEW_ROLE_NOUN)
    expect(built.system).not.toContain('资深游戏策划')
    expect(built.system).toContain('接口契约不一致')
    expect(built.prompt).not.toContain('按「')
    expect(built.prompt).toContain('目标平台')
    expect(buildReviewSummary(doc)).toContain('一段具体的应用设计内容')
  })
})

describe('IPC 边界守卫：isChapterAllowedForDoc', () => {
  it('应用档放行应用章、拒绝脏 key；游戏章仍一律放行', () => {
    const app = appDoc()
    const game = gameDoc()
    for (const key of visibleChaptersForDoc(app)) {
      expect(isChapterAllowedForDoc(app, key)).toBe(true)
    }
    expect(isChapterAllowedForDoc(app, 'combat')).toBe(true) // 游戏章保持老行为
    expect(isChapterAllowedForDoc(app, 'not_a_real_chapter')).toBe(false)
    expect(isChapterAllowedForDoc(game, 'combat')).toBe(true)
    expect(isChapterAllowedForDoc(game, 'architecture')).toBe(false)
    expect(isChapterAllowedForDoc(game, 'not_a_real_chapter')).toBe(false)
  })
})

describe('游戏档：第 4 步分派后逐字节零回归', () => {
  it('system / 上下文 / 写作规范仍是既有游戏口径', () => {
    const doc = gameDoc()
    doc.meta.game_name = '星海计划'
    doc.meta.game_type = 'RPG'
    const built = buildChapterPrompt(doc, 'combat')
    expect(built.system).toContain('游戏策划书')
    expect(built.system).toContain(agentForChapter('combat').displayName)
    expect(built.prompt).toContain('游戏名称: 星海计划')
    expect(built.prompt).toContain('游戏类型: RPG')
    expect(built.prompt).toContain('符合游戏类型和风格')
    expect(built.prompt).toContain('玩家怎么恢复')
    expect(built.prompt).not.toContain('软件设计文档')
    expect(built.prompt).not.toContain('幂等')
    expect(built.fields).toContain('damage_formula')
  })

  it('反审仍是资深游戏策划 + 品类追问', () => {
    const built = buildReviewPrompts(gameDoc(), { progressTotal: 0.1, validationCount: 0 })
    expect(built.system).toContain('资深游戏策划')
    expect(built.system).toContain('本品类：')
    expect(built.prompt).toContain('游戏类型:')
    expect(built.prompt).not.toContain(APP_REVIEW_ROLE_NOUN)
  })
})
