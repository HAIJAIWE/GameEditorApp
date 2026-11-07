import { describe, expect, it } from 'vitest'

import { TECH_DOC_GDD_INPUTS, TECH_DOC_SECTIONS, techDocOutline } from '@mobai/shared/agent/techDoc/techDocSchema'

describe('技术设计文档章节（GDD 之外的工程文档）', () => {
  it('九个标准章节齐备', () => {
    expect(TECH_DOC_SECTIONS).toHaveLength(9)
    const ids = TECH_DOC_SECTIONS.map((section) => section.id)
    expect(ids).toEqual([
      'overview',
      'architecture',
      'modules',
      'data-model',
      'interfaces',
      'flows',
      'dependencies',
      'risks',
      'milestones'
    ])
  })

  it('每章都有标题与写作指引', () => {
    for (const section of TECH_DOC_SECTIONS) {
      expect(section.title.trim()).not.toBe('')
      expect(section.guidance.trim()).not.toBe('')
    }
  })

  it('outline 含全部章节标题', () => {
    const outline = techDocOutline()
    expect(outline).toContain('技术设计文档大纲')
    for (const section of TECH_DOC_SECTIONS) {
      expect(outline).toContain(section.title)
    }
  })
})

/** 第 4 步：GDD → TDD 信息层串联（2026-11-07，依据 docs/game-doc-corpus-2026.md） */
describe('techDocOutline：GDD 输入映射与回链', () => {
  it('映射覆盖全部 9 个标准章节，且与 TECH_DOC_SECTIONS 标题一一对应', () => {
    expect(TECH_DOC_GDD_INPUTS).toHaveLength(TECH_DOC_SECTIONS.length)
    const titles = TECH_DOC_SECTIONS.map((s) => s.title)
    for (const item of TECH_DOC_GDD_INPUTS) {
      expect(titles, item.section).toContain(item.section)
      expect(item.chapters.trim()).not.toBe('')
    }
  })

  it('outline 含输入表、引用/冲突回写与「来源章节」回链要求', () => {
    const outline = techDocOutline()
    expect(outline).toContain('输入：先读策划书（GDD）')
    expect(outline).toContain('对应 GDD 章节')
    expect(outline).toContain('需要回写 GDD 的章节')
    expect(outline).toContain('来源章节')
    for (const section of TECH_DOC_SECTIONS) expect(outline).toContain(section.title)
  })
})

/** onepage 下沉到 shared 后，main 侧 re-export 必须是同一实现（单一事实源） */
describe('一页摘要单一事实源', () => {
  it('shared 与 main re-export 产出完全一致', async () => {
    const shared = await import('@mobai/shared/ceshu/export/onePage')
    const main = await import('../../src/main/ceshu/export/content/onepage')
    const { createDefaultCeshu } = await import('@mobai/shared/ceshu/model')
    const doc = createDefaultCeshu({ scope: 'full', name: '同一份文档' })
    doc.vision.design_vision = '测试核心幻想'
    expect(main.renderCeshuOnePageMarkdown(doc)).toBe(shared.renderCeshuOnePageMarkdown(doc))
    expect(main.renderOnePageSummary(doc)).toBe(shared.renderOnePageSummary(doc))
  })
})
