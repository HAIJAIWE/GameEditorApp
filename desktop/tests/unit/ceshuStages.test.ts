import { describe, expect, it } from 'vitest'

import { CHAPTER_KEYS } from '../../src/shared/ceshu/reference/ceshuConstants'
import { CESHU_CHAPTER_FIELDS } from '../../src/shared/ceshu/fields/ceshuFields'
import {
  CESHU_MACHINE_DATA_FIELDS,
  CESHU_STAGE_CHAPTERS,
  CESHU_STAGE_LABELS,
  CESHU_STAGE_ORDER,
  chaptersUpToStage,
  isChapterVisibleInStage,
  isMachineDataField,
  stageOfChapter
} from '../../src/shared/ceshu/workflow/ceshuStages'

/**
 * 阶段分层守卫（2026-10-26 反向验证后落地）：
 * 目的不是「多一个字段表」，而是保证**每一章都有且只有一个归属阶段**——
 * 新增章节时漏配会在这里直接失败，而不是悄悄让新章在立项阶段冒出来。
 */
describe('ceshuStages：阶段分层数据', () => {
  it('三个阶段恰好覆盖全部章节，不重不漏', () => {
    const assigned = CESHU_STAGE_ORDER.flatMap((stage) => CESHU_STAGE_CHAPTERS[stage])
    expect(new Set(assigned).size, '同一章被分到多个阶段').toBe(assigned.length)
    expect([...assigned].sort()).toEqual([...CHAPTER_KEYS].sort())
  })

  it('每章都能查到所属阶段，且与阶段表一致', () => {
    for (const chapter of CHAPTER_KEYS) {
      const stage = stageOfChapter(chapter)
      expect(CESHU_STAGE_CHAPTERS[stage], `${chapter} 的归属与阶段表不一致`).toContain(chapter)
    }
  })

  it('累计视图：立项只含立项章，发行含全部', () => {
    expect(chaptersUpToStage('concept')).toEqual([...CESHU_STAGE_CHAPTERS.concept])
    expect(chaptersUpToStage('production')).toEqual([
      ...CESHU_STAGE_CHAPTERS.concept,
      ...CESHU_STAGE_CHAPTERS.production
    ])
    expect(chaptersUpToStage('release')).toHaveLength(CHAPTER_KEYS.length)
  })

  it('立项阶段的章数收敛在「真实短 GDD 能写完」的量级（≤ 8 章）', () => {
    expect(CESHU_STAGE_CHAPTERS.concept.length).toBeLessThanOrEqual(8)
    expect(isChapterVisibleInStage('meta', 'concept')).toBe(true)
    expect(isChapterVisibleInStage('publishing', 'concept')).toBe(false)
    expect(isChapterVisibleInStage('publishing', 'release')).toBe(true)
  })

  it('阶段标签齐备（UI 直接用，不允许缺键）', () => {
    for (const stage of CESHU_STAGE_ORDER) {
      expect(CESHU_STAGE_LABELS[stage]).not.toBe('')
    }
  })

  it('机读数据字段必须真实存在（字段改名/删除时这里会失败）', () => {
    const missing: string[] = []
    for (const item of CESHU_MACHINE_DATA_FIELDS) {
      const fields = CESHU_CHAPTER_FIELDS[item.chapter] ?? []
      if (!fields.some((field) => field.key === item.field)) missing.push(`${item.chapter}.${item.field}`)
    }
    expect(missing, '机读数据清单指向了不存在的字段').toEqual([])
    expect(isMachineDataField('economy', 'ledger')).toBe(true)
    expect(isMachineDataField('economy', 'currency_types')).toBe(false)
  })
})
