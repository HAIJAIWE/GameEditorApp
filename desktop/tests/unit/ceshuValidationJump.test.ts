import { describe, expect, it } from 'vitest'

import { CHAPTER_LABELS } from '../../src/shared/ceshuConstants'
import { resolveValidationChapter, resolveValidationTarget } from '../../src/shared/ceshuValidationJump'

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

describe('resolveValidationTarget：章 + 字段（跳到具体字段，而不只是切章）', () => {
  it('必填类文案：解析出章与 schema 里真实存在的字段 key', () => {
    expect(resolveValidationTarget("文档信息：字段 'game_name' 为必填项")).toEqual({
      chapter: 'meta',
      field: 'game_name'
    })
    expect(resolveValidationTarget(`${CHAPTER_LABELS.combat}：字段 'combat_mode' 为必填项`)).toEqual({
      chapter: 'combat',
      field: 'combat_mode'
    })
  })

  it('人定字段文案同样能定位（措辞不同，格式一致）', () => {
    expect(
      resolveValidationTarget(`${CHAPTER_LABELS.combat}：字段 'combat_mode' 由人确定，尚未填写（AI 不起草，需人工决断）`)
    ).toEqual({ chapter: 'combat', field: 'combat_mode' })
  })

  it('字段名不在该章 schema 里 → 退化成只跳章（field=null），不给出点了没反应的链接', () => {
    // core_fantasy 在 meta 章不存在（设计幻想要去 vision 章），跳过去也找不到字段块
    expect(resolveValidationTarget(`文档信息：字段 'core_fantasy' 为必填项`)).toEqual({
      chapter: 'meta',
      field: null
    })
  })

  it('系统配置类文案（systems.battle.config.*）：只跳章', () => {
    const message = `一致性冲突：${CHAPTER_LABELS.combat} combat.combat_mode='回合' 与 ${CHAPTER_LABELS.systems} systems.battle.config.turn_mode='实时' 不一致`
    expect(resolveValidationTarget(message)).toEqual({ chapter: 'combat', field: null })
  })

  it('双引号写法也能解析（文案风格变化时不静默失效）', () => {
    expect(resolveValidationTarget(`${CHAPTER_LABELS.vision}：字段 "design_vision" 为必填项`)).toEqual({
      chapter: 'vision',
      field: 'design_vision'
    })
  })

  it('定位不到章节 → null', () => {
    expect(resolveValidationTarget('某个未知问题')).toBeNull()
    expect(resolveValidationTarget('')).toBeNull()
  })
})
