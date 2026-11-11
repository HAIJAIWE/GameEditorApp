import { describe, expect, it } from 'vitest'

import { chapterLabelForDoc, createDefaultCeshu, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import { buildChapterOrder, buildChapterPrompt } from '@mobai/shared/ceshu/prompts'
// buildPriorChaptersDigest 只为单测导出，未进 prompts 桶，故深导入源文件
import { buildPriorChaptersDigest } from '@mobai/shared/ceshu/prompts/ceshuAi'

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

/* ---- 锚点章 + 最近 N 章（24 章全量档的跨章一致性） ---- */

/** 24 章全量生成顺序；第 20 章（index 19）= live_ops，5 个锚点章都排在它之前 */
const FULL_ORDER = buildChapterOrder(true, true)

/** 锚点章各塞一个可辨识值：同时断言中文章名与字段值，不依赖提示词模板措辞 */
const ANCHOR_MARKERS: Record<string, { field: string; value: string }> = {
  vision: { field: 'core_fantasy', value: '锚点愿景：星际考古与失落文明' },
  gameplay: { field: 'core_loop', value: '锚点玩法：探索→战斗→收获' },
  combat: { field: 'combat_mode', value: '锚点战斗：伤害=攻击×倍率−防御' },
  economy: { field: 'source_sink', value: '锚点经济：星币单一硬通货' },
  numeric: { field: 'core_formulas', value: '锚点数值：指数成长曲线' }
}
const ANCHOR_KEYS = Object.keys(ANCHOR_MARKERS)

function asRecord(value: unknown): Record<string, unknown> {
  return value as Record<string, unknown>
}

/**
 * 复用 createDefaultCeshu，只把各章压成单字段。
 * schema.defaults 本身很长，会让摘要撞上 1400 上限而截掉尾部章节，选择逻辑就测不准了。
 */
function filledDoc(): ReturnType<typeof createDefaultCeshu> {
  const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
  const rec = asRecord(doc)
  for (const key of FULL_ORDER) {
    if (key === 'meta') continue
    rec[key] = { digest_marker: '占位-' + key }
  }
  for (const [key, marker] of Object.entries(ANCHOR_MARKERS)) {
    rec[key] = { [marker.field]: marker.value }
  }
  rec.story = { main_plot: '非锚点老章：不该出现' }
  rec.level_design = { first_levels: ['近期关卡：新手村'] }
  return doc
}

describe('前文要点：锚点章 + 最近 N 章', () => {
  it('24 章长序列生成第 20 章时，早前的 5 个锚点章仍在前文要点里', () => {
    expect(FULL_ORDER).toHaveLength(24)
    const doc = filledDoc()
    const digest = buildPriorChaptersDigest(
      doc, FULL_ORDER[19], FULL_ORDER, FULL_ORDER.slice(0, 19)
    )
    expect(digest.length).toBeGreaterThan(0)
    for (const key of ANCHOR_KEYS) {
      expect(digest).toContain(chapterLabelForDoc(doc, key))
      expect(digest).toContain(ANCHOR_MARKERS[key].value)
    }
    // 去重后必须按生成顺序：5 个锚点依次出现，且都排在「最近 6 章」之前
    const anchorPositions = ANCHOR_KEYS.map((key) => digest.indexOf(chapterLabelForDoc(doc, key)))
    expect(anchorPositions).toEqual([...anchorPositions].sort((a, b) => a - b))
    const recentLabel = chapterLabelForDoc(doc, 'level_design')
    expect(digest).toContain('近期关卡：新手村')
    expect(Math.max(...anchorPositions)).toBeLessThan(digest.indexOf(recentLabel))
    // 非锚点、又不在最近 6 章里的老章（story，第 4 位）不该被一起带上
    expect(digest).not.toContain('非锚点老章：不该出现')
    expect(digest).not.toContain(chapterLabelForDoc(doc, 'story'))
  })

  it('未生成的锚点章不得出现（generatedChapters 里没有它）', () => {
    const doc = filledDoc()
    const generated = FULL_ORDER.slice(0, 19).filter((key) => key !== 'economy')
    const digest = buildPriorChaptersDigest(doc, FULL_ORDER[19], FULL_ORDER, generated)
    expect(digest).not.toContain(ANCHOR_MARKERS.economy.value)
    expect(digest).not.toContain(chapterLabelForDoc(doc, 'economy'))
    // 其余 4 个已生成的锚点仍在，不受影响
    for (const key of ANCHOR_KEYS.filter((k) => k !== 'economy')) {
      expect(digest).toContain(ANCHOR_MARKERS[key].value)
    }
  })

  it('不传 generationOrder 时回退章表顺序，行为与改动前一致且结果不为空', () => {
    const doc = filledDoc()
    const digest = buildPriorChaptersDigest(doc, 'gameplay')
    expect(digest.length).toBeGreaterThan(0)
    expect(digest).toContain(ANCHOR_MARKERS.vision.value)
    // 显式传 visibleChaptersForDoc 与不传完全等价 ⇒ 证明回退的就是章表顺序
    expect(buildPriorChaptersDigest(doc, 'gameplay', visibleChaptersForDoc(doc))).toBe(digest)
  })

  it('硬上限不放宽：返回文本长度 ≤ 1400', () => {
    const doc = filledDoc()
    const rec = asRecord(doc)
    // 每个前序章塞 4 个超长字段（每字段截到 80 字），确保整体必然超过 1400
    for (const key of FULL_ORDER.slice(0, 19)) {
      if (key === 'meta') continue
      rec[key] = {
        long_a: '甲'.repeat(200),
        long_b: '乙'.repeat(200),
        long_c: '丙'.repeat(200),
        long_d: '丁'.repeat(200)
      }
    }
    const digest = buildPriorChaptersDigest(
      doc, FULL_ORDER[19], FULL_ORDER, FULL_ORDER.slice(0, 19)
    )
    expect(digest.length).toBeGreaterThan(1300) // 确实触发了总长截断，而非内容本来就短
    expect(digest.length).toBeLessThanOrEqual(1400)
  })
})
