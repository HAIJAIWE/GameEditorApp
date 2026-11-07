import { describe, expect, it } from 'vitest'

import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { buildChapterPrompt } from '@mobai/shared/ceshu/prompts'

/**
 * 整篇生成的「前文要点」：把当前章之前已写好的章节压成带上限的摘要注入提示词。
 *
 * 目的：修掉「逐章串行但后章看不到前章设定」导致的跨章自相矛盾——
 * 此前 buildChapterPrompt 只读 meta 与当前章，事后的 validateCeshu 只能报警不能阻止。
 *
 * 边界（这些断言就是边界本身）：只取前序章、有长度上限、单字段生成不注入。
 */
describe('前文要点：跨章一致性上下文', () => {
  it('游戏档：后章提示词带上前序章已写内容', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.meta.game_name = '测试游戏'
    doc.vision.core_fantasy = '玩家扮演星际考古学家'
    const built = buildChapterPrompt(doc, 'gameplay')
    expect(built.prompt).toContain('前文要点')
    expect(built.prompt).toContain('产品愿景')
    expect(built.prompt).toContain('星际考古学家')
  })

  it('只取前序章：未来章内容不得进提示词（避免因果倒置）', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.combat.combat_mode = '回合制'
    const built = buildChapterPrompt(doc, 'gameplay')
    expect(built.prompt).not.toContain('回合制')
  })

  it('首章不注入：没有前序章', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const built = buildChapterPrompt(doc, 'vision')
    expect(built.prompt).not.toContain('前文要点')
  })

  it('单字段定向生成不注入（目标明确，全局上下文只会干扰）', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.vision.core_fantasy = '玩家扮演星际考古学家'
    const built = buildChapterPrompt(doc, 'gameplay', { onlyFields: ['core_loop'] })
    expect(built.prompt).not.toContain('前文要点')
  })

  it('超长内容被截断，不会把整份文档塞回提示词', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.vision.core_fantasy = '甲'.repeat(500)
    const built = buildChapterPrompt(doc, 'gameplay')
    // 每个字段值最多 80 字，原文不可能整段出现
    expect(built.prompt).not.toContain('甲'.repeat(500))
    expect(built.prompt).toContain('…')
  })

  it('应用档同样生效', () => {
    const doc = createDefaultCeshu({ scope: 'full', docKind: 'application' })
    doc.meta.project_name = '测试应用'
    // 应用章 key 不在游戏档 ChapterKey 联合类型里，测试里用宽松索引写入
    ;(doc as unknown as Record<string, Record<string, unknown>>).overview.problem = '客服工单积压严重'
    const built = buildChapterPrompt(doc, 'features')
    expect(built.prompt).toContain('前文要点')
    expect(built.prompt).toContain('客服工单积压严重')
  })

  it('前序章全空时不出现该段（提示词零膨胀）', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    // 默认文档带各章 schema.defaults，先清空前序章再断言
    doc.vision = {}
    doc.story = {}
    const built = buildChapterPrompt(doc, 'gameplay')
    expect(built.prompt).not.toContain('前文要点')
  })
})
