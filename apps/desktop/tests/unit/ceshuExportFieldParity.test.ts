import { describe, expect, it } from 'vitest'

import { renderCeshuMarkdown, renderCeshuDeliverableMarkdown } from '../../src/main/ceshu/export/doc/markdown'
import { renderCeshuNarrative } from '../../src/main/ceshu/export/content/narrative'
import { CHAPTER_KEYS, MODULE_CHAPTERS, type CeshuDocument, type ChapterKey } from '@mobai/shared/ceshu/reference'
import { CESHU_CHAPTER_FIELDS } from '@mobai/shared/ceshu/fields'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { isMachineDataField } from '@mobai/shared/ceshu/workflow'

/**
 * 编辑器字段 ↔ 生成设计文档 对拍（用户反馈「前端和生成后的内容不太一样」）。
 *
 * 三个结论，各有一条守卫：
 * 1. **没有字段被静默丢弃**：每个 schema 字段填唯一标记，标记必须出现在导出里；
 * 2. **机读字段不消失，只是搬到附录**：账本/断言/用例等必须出现在「附录」之后；
 * 3. **空字段按设计不输出**：这才是「看起来不一样」的真正来源，不是 bug。
 *
 * 若未来有人在 `orderedFieldEntries` / `renderChapter` 里加了新的过滤条件而没同步
 * 附录，第 1、2 条会立刻变红——防止「编辑器里写了、文档里没有」这类最难查的偏差。
 */

const APPENDIX_HEADING = '## 附录：验收与机读数据'

/**
 * 对拍要覆盖**全部** schema 字段 ⇒ 显式启用全部模块。
 * 新建文档默认会关掉发行期三章（市场分析/商业化/运营活动），
 * 不显式打开的话这三章的字段不会进导出，对拍会误报「字段被丢弃」。
 */
function withAllModules(doc: CeshuDocument): CeshuDocument {
  doc.meta.enabled_modules = [...MODULE_CHAPTERS]
  return doc
}

function marker(chapter: string, key: string): string {
  return `MARK_${chapter}_${key}`
}

/** 把除 meta/systems 外每个 schema 字段都填成唯一标记，返回被填字段清单 */
function fillEveryField(doc: CeshuDocument): Array<{ chapter: ChapterKey; key: string }> {
  const plan: Array<{ chapter: ChapterKey; key: string }> = []
  const target = doc as unknown as Record<string, Record<string, unknown>>
  for (const chapter of CHAPTER_KEYS) {
    // meta 是文档信息（非章节字段）；systems 是「系统开关 + 配置」动态结构，不按 schema 字段渲染
    if (chapter === 'meta' || chapter === 'systems') continue
    const defs = CESHU_CHAPTER_FIELDS[chapter] ?? []
    if (defs.length === 0) continue
    const data: Record<string, unknown> = {}
    for (const def of defs) {
      data[def.key] = marker(chapter, def.key)
      plan.push({ chapter, key: def.key })
    }
    target[chapter] = data
  }
  return plan
}

describe('策划书导出：编辑器字段 ↔ 生成文档 对拍', () => {
  it('每个非空 schema 字段都进文档：人读在正文、机读在附录，一个不漏', () => {
    const doc = withAllModules(createDefaultCeshu({ scope: 'full', name: '对拍样本' }))
    const plan = fillEveryField(doc)
    // 340 字段 - meta/systems 后仍有 300+，数量级本身也是一道防线
    expect(plan.length).toBeGreaterThan(300)

    const markdown = renderCeshuMarkdown(doc)
    const appendixAt = markdown.indexOf(APPENDIX_HEADING)
    expect(appendixAt).toBeGreaterThan(-1)

    const missing: string[] = []
    const misplaced: string[] = []
    for (const { chapter, key } of plan) {
      const at = markdown.indexOf(marker(chapter, key))
      if (at < 0) {
        missing.push(`${chapter}.${key}`)
        continue
      }
      const machine = isMachineDataField(chapter, key)
      if (machine && at < appendixAt) misplaced.push(`${chapter}.${key}（机读字段却出现在正文）`)
      if (!machine && at > appendixAt) misplaced.push(`${chapter}.${key}（人读字段却出现在附录）`)
    }

    // 失败时直接给出具体字段名，别让人从 300+ 个标记里肉眼找
    expect(missing).toEqual([])
    expect(misplaced).toEqual([])
  })

  it('空字段按设计不输出（这是「前后端看起来不一样」的来源，不是丢字段）', () => {
    const doc = withAllModules(createDefaultCeshu({ scope: 'full', name: '空字段样本' }))
    doc.combat.damage_formula = ''

    const markdown = renderCeshuMarkdown(doc)
    expect(markdown).not.toContain('**伤害公式**')
  })

  /**
   * 把字段保全不变式从 markdown 扩到其余「整本文档」格式。
   * narrative / deliverable 与 markdown 共用 `orderedFieldEntries` 全章渲染路径，
   * 但仍可能被各自的选择性段落（narrative 的首页/走读/架构/机制段、deliverable 的摘要段）
   * 漏掉字段——这里专门守住「非机读字段一个不漏」。
   * 机读字段由 markdown 的「附录：验收与机读数据」单独覆盖，此处不重复（curated 格式本就只展子集）。
   */
  it('narrative：每个非机读 schema 字段都进文档（一个不漏）', () => {
    const doc = withAllModules(createDefaultCeshu({ scope: 'full', name: 'narrative 对拍样本' }))
    const plan = fillEveryField(doc)
    const out = renderCeshuNarrative(doc)
    const missing = plan
      .filter(({ chapter, key }) => !isMachineDataField(chapter, key))
      .filter(({ chapter, key }) => out.indexOf(marker(chapter, key)) < 0)
      .map(({ chapter, key }) => `${chapter}.${key}`)
    // 失败时直接给出具体字段名
    expect(missing).toEqual([])
  })

  it('deliverable：每个非机读 schema 字段都进文档（一个不漏）', () => {
    const doc = withAllModules(createDefaultCeshu({ scope: 'full', name: 'deliverable 对拍样本' }))
    const plan = fillEveryField(doc)
    const out = renderCeshuDeliverableMarkdown(doc)
    const missing = plan
      .filter(({ chapter, key }) => !isMachineDataField(chapter, key))
      .filter(({ chapter, key }) => out.indexOf(marker(chapter, key)) < 0)
      .map(({ chapter, key }) => `${chapter}.${key}`)
    expect(missing).toEqual([])
  })
})
