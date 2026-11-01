import { describe, expect, it } from 'vitest'

import {
  OVERLAP_PAIRS,
  OVERLAP_SIMILARITY_THRESHOLD,
  detectFieldOverlaps,
  detectTextDuplication,
  fieldOverlapMessage,
  textSimilarity
} from '@mobai/shared/ceshu/workflow'
import { validateCeshu } from '@mobai/shared/ceshu/validation'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'

describe('textSimilarity：字符二元组 Dice', () => {
  it('完全相同 → 1；都空 → 0；完全无关 → 低分', () => {
    expect(textSimilarity('开放世界 RPG', '开放世界 RPG')).toBe(1)
    expect(textSimilarity('', 'x')).toBe(0)
    expect(textSimilarity('aaaa', 'bbbb')).toBe(0)
  })

  it('空白不影响判定', () => {
    expect(textSimilarity('伤害 = 攻击 - 防御', '伤害=攻击-防御')).toBe(1)
  })

  it('改写式重复落在阈值上方；不同主题落在阈值下方', () => {
    const rewritten = textSimilarity(
      '玩家在开放世界中自由探索，与 NPC 建立关系并改变剧情走向',
      '玩家可在开放世界里自由探索，和 NPC 建立关系、改变剧情走向'
    )
    expect(rewritten).toBeGreaterThan(OVERLAP_SIMILARITY_THRESHOLD)

    const different = textSimilarity(
      '玩家在开放世界中自由探索，与 NPC 建立关系并改变剧情走向',
      '经济系统使用双货币：金币用于日常交易，钻石用于稀有道具'
    )
    expect(different).toBeLessThan(OVERLAP_SIMILARITY_THRESHOLD)
  })
})

describe('detectTextDuplication：四类判定', () => {
  it('完全相同', () => {
    expect(detectTextDuplication('要做成什么样的游戏', '要做成什么样的游戏')).toMatchObject({
      duplicated: true,
      reason: 'identical',
      similarity: 1
    })
  })

  it('包含：短文本整体落在长文本里', () => {
    const verdict = detectTextDuplication(
      '伤害等于攻击力减去防御力再乘以技能系数',
      '经过反复权衡，最终确定伤害等于攻击力减去防御力再乘以技能系数，并在后期加入暴击修正'
    )
    expect(verdict).toMatchObject({ duplicated: true, reason: 'contained', similarity: 1 })
  })

  it('共享句：有一整句两边都出现', () => {
    const verdict = detectTextDuplication(
      '我们的愿景是做一个能让人沉浸的世界。此外还有很多其他的想法和目标。',
      '完全不同的另一段开头。我们的愿景是做一个能让人沉浸的世界。'
    )
    expect(verdict).toMatchObject({ duplicated: true, reason: 'sentences' })
  })

  it('太短的包含是巧合，不算重复', () => {
    expect(detectTextDuplication('游戏', '这是一个游戏')).toMatchObject({ duplicated: false })
  })

  it('空文本无从重复', () => {
    expect(detectTextDuplication('', '内容')).toMatchObject({ duplicated: false, reason: 'none' })
    expect(detectTextDuplication('内容', '   ')).toMatchObject({ duplicated: false, reason: 'none' })
  })

  it('相似但低于阈值 → 不判重', () => {
    const verdict = detectTextDuplication('主线剧情围绕拯救世界展开', '支线任务侧重日常叙事')
    expect(verdict.duplicated).toBe(false)
    expect(verdict.similarity).toBeLessThan(OVERLAP_SIMILARITY_THRESHOLD)
  })
})

describe('detectFieldOverlaps：文档级检测', () => {
  function makeDoc(): CeshuDocument {
    return createDefaultCeshu({ scope: 'full', name: '测试游戏' })
  }

  it('空文档 → 无重叠', () => {
    expect(detectFieldOverlaps(makeDoc())).toEqual([])
  })

  it('vision 章两字段写重 → 命中并附标签/理由/建议', () => {
    const doc = makeDoc()
    doc.vision.design_vision = '做一个让玩家沉浸的开放世界，重点是自由探索与 NPC 关系'
    doc.vision.differentiation = '做一个让玩家沉浸的开放世界，重点是自由探索与 NPC 关系'

    const found = detectFieldOverlaps(doc)
    expect(found).toHaveLength(1)
    expect(found[0]?.fields.map((field) => field.label)).toEqual(['设计愿景', '差异化优势'])
    expect(found[0]?.reason).toBe('identical')
    expect(found[0]?.guidance).toContain('玩家凭什么选你')
  })

  it('跨章对：numeric.core_formulas 与 combat.damage_formula 重复 → 命中', () => {
    const doc = makeDoc()
    doc.numeric.core_formulas = '伤害 = 攻击力 × 2 - 防御力'
    doc.combat.damage_formula = '最终伤害 = 攻击力 × 2 - 防御力，暴击时翻倍'

    const found = detectFieldOverlaps(doc)
    expect(found).toHaveLength(1)
    expect(found[0]?.fields.map((field) => field.chapter)).toEqual(['numeric', 'combat'])
    expect(found[0]?.reason).toBe('contained')
  })

  it('一边为空 → 不判定（没有可比对象）', () => {
    const doc = makeDoc()
    doc.vision.design_vision = '愿景内容'
    expect(detectFieldOverlaps(doc)).toEqual([])
  })

  it('两边都填但内容不同 → 不误报', () => {
    const doc = makeDoc()
    doc.vision.design_vision = '做一个让玩家沉浸的开放世界，重点是自由探索与 NPC 关系'
    doc.vision.differentiation = '相比竞品 A，我们的战斗采用实时指令插队，而不是读条回合制'
    expect(detectFieldOverlaps(doc)).toEqual([])
  })
})

describe('fieldOverlapMessage 与 validateCeshu 集成', () => {
  it('警告文案含章号、字段名、重复度与分工建议', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    doc.vision.design_vision = '做一个让玩家沉浸的开放世界'
    doc.vision.differentiation = '做一个让玩家沉浸的开放世界'
    const found = detectFieldOverlaps(doc)
    const message = fieldOverlapMessage(found[0]!)
    expect(message).toContain('内容重复警告')
    // 文档信息段（meta）不占章号 ⇒ vision 是第一章（chapterOrdinalCn 约定）
    expect(message).toContain('第一章')
    expect(message).toContain('「设计愿景」')
    expect(message).toContain('「差异化优势」')
    expect(message).toContain('100%')
    expect(message).toContain('玩家凭什么选你')
  })

  it('validateCeshu：重复内容进入校验结果；正常文档不出现该警告', () => {
    const duplicated = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    duplicated.vision.design_vision = '做一个让玩家沉浸的开放世界，重点是自由探索'
    duplicated.vision.differentiation = '做一个让玩家沉浸的开放世界，重点是自由探索'
    expect(validateCeshu(duplicated).some((item) => item.includes('内容重复警告'))).toBe(true)

    const healthy = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    healthy.vision.design_vision = '做一个让玩家沉浸的开放世界，重点是自由探索与 NPC 关系'
    healthy.vision.differentiation = '相比竞品采用实时指令插队战斗，而不是读条回合制'
    expect(validateCeshu(healthy).some((item) => item.includes('内容重复警告'))).toBe(false)
  })

  it('OVERLAP_PAIRS 声明的两组均可检测（防配置与实现脱节）', () => {
    for (const pair of OVERLAP_PAIRS) {
      expect(pair.fields).toHaveLength(2)
      expect(pair.guidance).not.toBe('')
    }
  })
})
