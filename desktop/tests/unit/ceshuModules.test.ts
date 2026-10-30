import { describe, expect, it } from 'vitest'

import {
  CHAPTER_KEYS,
  MODULE_CHAPTERS,
  UNIVERSAL_CORE_CHAPTERS,
  enabledModuleChapters,
  isChapterEnabled,
  isCoreChapter,
  visibleChapterKeys
} from '../../src/shared/ceshu/reference/ceshuConstants'
import { buildCeshuBundle } from '../../src/shared/ceshu/workflow/ceshuBundle'
import { computeChapterProgress, createDefaultCeshu, visibleChaptersForDoc } from '../../src/shared/ceshu/model/ceshuModel'
import { computeReadiness } from '../../src/shared/ceshu/readiness/ceshuReadiness'
import { validateCeshu } from '../../src/shared/ceshu/validation/ceshuValidation'

/**
 * 通用底座 vs 系统模块（2026-10-26，docs/gdd-universal-core.md）：
 * - 底座（meta/vision/gameplay/mvp）恒启用、跨品类；
 * - 其余章是「系统模块」，按 enabled_modules 勾选；
 * - 缺省 = 全部模块 ⇒ 老文档行为零变化。
 */
describe('通用底座 vs 系统模块', () => {
  it('底座 4 章 + 模块 = 其余，两者不重不漏', () => {
    expect(UNIVERSAL_CORE_CHAPTERS).toEqual(['meta', 'vision', 'gameplay', 'mvp'])
    expect(MODULE_CHAPTERS).toHaveLength(CHAPTER_KEYS.length - UNIVERSAL_CORE_CHAPTERS.length)
    for (const chapter of UNIVERSAL_CORE_CHAPTERS) {
      expect(MODULE_CHAPTERS).not.toContain(chapter)
      expect(isCoreChapter(chapter)).toBe(true)
    }
    const all = new Set([...UNIVERSAL_CORE_CHAPTERS, ...MODULE_CHAPTERS])
    expect(all.size).toBe(CHAPTER_KEYS.length)
  })

  it('缺省 enabled_modules ⇒ 全部模块（向后兼容）', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    expect(enabledModuleChapters(doc)).toEqual([...MODULE_CHAPTERS])
    for (const chapter of CHAPTER_KEYS) expect(isChapterEnabled(chapter, doc)).toBe(true)
  })

  it('显式 enabled_modules ⇒ 只启用这些模块，底座恒启用；非法值被过滤', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.meta.enabled_modules = ['combat', 'economy']
    expect(enabledModuleChapters(doc)).toEqual(['combat', 'economy'])
    expect(isChapterEnabled('meta', doc)).toBe(true) // 底座
    expect(isChapterEnabled('combat', doc)).toBe(true)
    expect(isChapterEnabled('numeric', doc)).toBe(false)

    doc.meta.enabled_modules = ['combat', 'not_a_chapter' as never]
    expect(enabledModuleChapters(doc)).toEqual(['combat'])
  })

  it('visibleChapterKeys 传 enabledModules ⇒ 只留底座 + 勾选模块', () => {
    const visible = visibleChapterKeys('full', undefined, ['combat', 'economy'])
    expect(visible).toContain('meta')
    expect(visible).toContain('vision')
    expect(visible).toContain('combat')
    expect(visible).toContain('economy')
    expect(visible).not.toContain('numeric')
    expect(visible).not.toContain('art')
  })

  it('computeChapterProgress 尊重 enabled_modules：关掉的模块不进分母', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.meta.enabled_modules = ['combat']
    const progress = computeChapterProgress(doc)
    expect('combat' in progress).toBe(true)
    expect('economy' in progress).toBe(false)
    expect('numeric' in progress).toBe(false)
    for (const chapter of UNIVERSAL_CORE_CHAPTERS) expect(chapter in progress).toBe(true)
  })

  it('visibleChaptersForDoc：缺省全开，显式=底座+模块', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    expect(visibleChaptersForDoc(doc)).toEqual(CHAPTER_KEYS) // 缺省全开（零变化）
    doc.meta.enabled_modules = ['combat']
    const visible = visibleChaptersForDoc(doc)
    expect(visible).toContain('combat')
    expect(visible).not.toContain('economy')
    expect(visible).toContain('mvp')
  })
})

describe('模块联动：校验 / 机读包 / 评分 都尊重 enabled_modules', () => {
  it('校验：关掉的模块不报该模块必填缺失', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    // 缺省全开：economy 的必填（currency_types）应被报
    expect(validateCeshu(doc).some((e) => e.includes('currency_types'))).toBe(true)
    // 关掉 economy：不再报 currency_types
    doc.meta.enabled_modules = ['combat']
    expect(validateCeshu(doc).some((e) => e.includes('currency_types'))).toBe(false)
  })

  it('机读包：关掉的模块不出现在章节里', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.meta.enabled_modules = ['combat']
    const keys = buildCeshuBundle(doc).chapters.map((chapter) => chapter.key)
    expect(keys).toContain('meta')
    expect(keys).toContain('combat')
    expect(keys).not.toContain('economy')
    expect(keys).not.toContain('numeric')
  })

  it('完备度：关掉的模块不参与章节统计', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.meta.enabled_modules = ['combat']
    const keys = computeReadiness(doc).chapters.map((chapter) => chapter.chapter_key)
    expect(keys).toContain('combat')
    expect(keys).not.toContain('economy')
    expect(keys).not.toContain('numeric')
  })
})
