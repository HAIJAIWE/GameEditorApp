import { describe, expect, it } from 'vitest'

import { CHAPTER_LABELS } from '../../src/shared/ceshuConstants'
import { resolveValidationChapter } from '../../src/shared/ceshuValidationJump'

describe('resolveValidationChapter：从校验文案定位章节', () => {
  it('文档信息段文案 → meta', () => {
    expect(resolveValidationChapter("文档信息：字段 'game_name' 为必填项")).toBe('meta')
  })

  it('编号章文案 → 对应章（期望值由 CHAPTER_LABELS 拼出，不写死章号）', () => {
    expect(resolveValidationChapter(`${CHAPTER_LABELS.vision}：字段 'design_vision' 为必填项`)).toBe('vision')
    expect(resolveValidationChapter(`${CHAPTER_LABELS.combat}：字段 'combat_mode' 为必填项`)).toBe('combat')
    expect(
      resolveValidationChapter(`${CHAPTER_LABELS.accessibility}：字段 'language_list' 为必填项`)
    ).toBe('accessibility')
  })

  it('冲突文案提到两章：取先出现者', () => {
    const message = `一致性冲突：${CHAPTER_LABELS.combat} combat.combat_mode='回合' 与 ${CHAPTER_LABELS.systems} systems.battle.config.turn_mode='实时' 不一致`
    expect(resolveValidationChapter(message)).toBe('combat')
  })

  it('先提到第一章、后提到第三章 → 返回第一章（按文案先后，而非章节顺序）', () => {
    const message = `${CHAPTER_LABELS.vision}「设计愿景」与 ${CHAPTER_LABELS.gameplay}「核心循环」描述不一致`
    expect(resolveValidationChapter(message)).toBe('vision')
  })

  it('反向：先提到第三章、后提到第一章 → 返回第三章', () => {
    const message = `${CHAPTER_LABELS.gameplay} 与 ${CHAPTER_LABELS.vision} 重复度 100%`
    expect(resolveValidationChapter(message)).toBe('gameplay')
  })

  it('无章节信息 → null', () => {
    expect(resolveValidationChapter('某个未知问题')).toBeNull()
    expect(resolveValidationChapter('')).toBeNull()
  })
})
