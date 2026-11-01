import { describe, expect, it } from 'vitest'

import { TECH_DOC_SECTIONS, techDocOutline } from '@mobai/shared/agent/techDoc/techDocSchema'

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
