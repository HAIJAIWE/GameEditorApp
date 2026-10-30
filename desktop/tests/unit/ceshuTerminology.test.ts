import { describe, expect, it } from 'vitest'

import {
  MAX_TERM_CONFLICTS,
  MIN_VARIANT_USES,
  TERM_CHECK_GROUP_IDS,
  buildTermGroups,
  detectTerminologyConflicts,
  terminologyConflictMessage,
  terminologyConflictMessages
} from '../../src/shared/ceshu/ceshuTerminology'
import { validateCeshu } from '../../src/shared/ceshu/ceshuValidation'
import { createDefaultCeshu } from '../../src/shared/ceshu/ceshuModel'
import type { CeshuDocument } from '../../src/shared/ceshu/ceshuConstants'

function makeDoc(): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', name: '测试游戏' })
}

describe('buildTermGroups：同义词组的三道收敛', () => {
  it('白名单内的组被收录（hp = 生命值 / 血量）', () => {
    const hp = buildTermGroups().find((group) => group.id === 'hp')
    expect(hp?.variants).toContain('生命值')
    expect(hp?.variants).toContain('血量')
  })

  it('子串过滤：生命 ⊂ 生命值 被剔除（构词关系不是换叫法）', () => {
    const hp = buildTermGroups().find((group) => group.id === 'hp')
    expect(hp?.variants).not.toContain('生命')
  })

  it('白名单外的组不查（range/cost 等同 ID 不同义，报了是噪音）', () => {
    const ids = buildTermGroups().map((group) => group.id)
    expect(ids).not.toContain('range')
    expect(ids).not.toContain('cost')
    expect(ids).not.toContain('atk') // 攻击 ⊂ 攻击力，过滤后只剩一个变体 ⇒ 整组丢弃
    for (const id of ids) expect(TERM_CHECK_GROUP_IDS).toContain(id)
  })
})

describe('detectTerminologyConflicts：判定', () => {
  it('同一概念两种叫法都用够次数 → 命中，带次数与首见章节', () => {
    const doc = makeDoc()
    doc.combat.balance_strategy = '生命值越高，容错越高。生命值上限由装备决定。'
    doc.numeric.balance_principles = '血量随等级线性增长。血量不足时优先补防。'

    const conflicts = detectTerminologyConflicts(doc)
    const hp = conflicts.find((item) => item.id === 'hp')
    expect(hp).toBeDefined()
    const variants = hp?.usages.map((usage) => usage.variant)
    expect(variants).toEqual(expect.arrayContaining(['生命值', '血量']))
    expect(hp?.usages.find((usage) => usage.variant === '生命值')?.firstChapter).toBe('combat')
    expect(hp?.usages.find((usage) => usage.variant === '血量')?.firstChapter).toBe('numeric')
  })

  it('只用一种叫法 → 不报', () => {
    const doc = makeDoc()
    doc.combat.balance_strategy = '生命值越高容错越高。生命值上限由装备决定。'
    expect(detectTerminologyConflicts(doc).some((item) => item.id === 'hp')).toBe(false)
  })

  it('只出现一次 → 不算命名习惯（最少使用次数收敛）', () => {
    const doc = makeDoc()
    doc.combat.balance_strategy = '生命值越高容错越高。生命值上限由装备决定。'
    doc.numeric.balance_principles = '血量不足时优先补防。' // 仅 1 次
    expect(detectTerminologyConflicts(doc).some((item) => item.id === 'hp')).toBe(false)
    expect(MIN_VARIANT_USES).toBe(2)
  })

  it('长变体优先匹配：攻击力不会被算成攻击（atk 组已整体排除）', () => {
    const doc = makeDoc()
    doc.combat.balance_strategy = '攻击力决定输出。攻击力越高越好。'
    doc.numeric.balance_principles = '攻击决定节奏。攻击越强越快。'
    // atk 组不在白名单（攻击 ⊂ 攻击力），因此任何情况都不报
    expect(detectTerminologyConflicts(doc)).toEqual([])
  })

  it('空文档 → 无冲突', () => {
    expect(detectTerminologyConflicts(makeDoc())).toEqual([])
  })
})

describe('术语警告文案与校验链集成', () => {
  it('文案含变体名、概念 ID、次数与首见章节', () => {
    const doc = makeDoc()
    doc.combat.balance_strategy = '生命值越高容错越高。生命值上限由装备决定。'
    doc.numeric.balance_principles = '血量随等级增长。血量不足时补防。'
    const conflict = detectTerminologyConflicts(doc).find((item) => item.id === 'hp')
    const message = terminologyConflictMessage(conflict!)
    expect(message).toContain('术语不一致')
    expect(message).toContain('「生命值」')
    expect(message).toContain('「血量」')
    expect(message).toContain('hp')
    expect(message).toContain('首见')
  })

  it('超过上限时补一条汇总（不刷屏）', () => {
    const conflicts = Array.from({ length: MAX_TERM_CONFLICTS + 2 }, (_, index) => ({
      id: `g${index}`,
      usages: [
        { variant: '甲', count: 2, firstChapter: 'combat' as const },
        { variant: '乙', count: 2, firstChapter: 'numeric' as const }
      ]
    }))
    const messages = terminologyConflictMessages(conflicts)
    expect(messages).toHaveLength(MAX_TERM_CONFLICTS + 1)
    expect(messages.at(-1)).toContain('另有 2 组')
  })

  it('validateCeshu 收进校验结果；统一叫法的文档不出现该警告', () => {
    const inconsistent = makeDoc()
    inconsistent.combat.balance_strategy = '生命值越高容错越高。生命值上限由装备决定。'
    inconsistent.numeric.balance_principles = '血量随等级增长。血量不足时补防。'
    expect(validateCeshu(inconsistent).some((item) => item.includes('术语不一致'))).toBe(true)

    const consistent = makeDoc()
    consistent.combat.balance_strategy = '生命值越高容错越高。生命值上限由装备决定。'
    consistent.numeric.balance_principles = '生命值随等级增长。生命值不足时补防。'
    expect(validateCeshu(consistent).some((item) => item.includes('术语不一致'))).toBe(false)
  })
})
