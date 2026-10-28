import { describe, expect, it } from 'vitest'

import {
  CHAPTER_KEYS,
  NON_COMBAT_GAME_TYPES,
  chapterApplicableToGenre,
  gameTypeHasCombat,
  visibleChapterKeys
} from '../../src/shared/ceshuConstants'
import { computeChapterProgress, createDefaultCeshu, getGameType } from '../../src/shared/ceshuModel'
import { computeReadiness } from '../../src/shared/ceshuReadiness'

/**
 * 品类条件必填守卫（2026-10-26）。
 *
 * 起因：真实 GDD 走查发现无战斗品类（休闲合成）立项完成度被「伪必填」的 combat 章压低
 * （68% vs 含战斗 82%，见 docs/ceshu-import-walkthrough.md）。
 * 修复：按 `meta.game_type` 判定，无战斗品类的 combat 章从 visibleChapterKeys 剔除，
 * 不进导航/导出/机读包/完成度分母/评分。**缺省（未选品类）按「有战斗」保守处理 ⇒ 老文档零变化。**
 */
describe('品类条件必填：无战斗品类隐藏 combat 章', () => {
  it('gameTypeHasCombat：无战斗品类 false；其余 / 缺省 true', () => {
    for (const genre of NON_COMBAT_GAME_TYPES) expect(gameTypeHasCombat(genre)).toBe(false)
    expect(gameTypeHasCombat('SLG')).toBe(true)
    expect(gameTypeHasCombat('卡牌')).toBe(true)
    expect(gameTypeHasCombat('')).toBe(true)
    expect(gameTypeHasCombat(undefined)).toBe(true)
    expect(gameTypeHasCombat(null)).toBe(true)
  })

  it('chapterApplicableToGenre：仅 combat 受品类影响，其余章恒适用', () => {
    expect(chapterApplicableToGenre('combat', '模拟经营')).toBe(false)
    expect(chapterApplicableToGenre('combat', 'SLG')).toBe(true)
    expect(chapterApplicableToGenre('economy', '模拟经营')).toBe(true)
    expect(chapterApplicableToGenre('vision', '视觉小说')).toBe(true)
  })

  it('visibleChapterKeys：不传 gameType 时与旧版逐项一致（零行为变化）', () => {
    expect(visibleChapterKeys('full')).toEqual(CHAPTER_KEYS)
    // lite 档含 combat（它是第 5 个编号章），确认未传 gameType 时不误删
    expect(visibleChapterKeys('lite')).toContain('combat')
  })

  it('visibleChapterKeys：无战斗品类剔除 combat；含战斗品类保留（两档位都验）', () => {
    const mergeFull = visibleChapterKeys('full', '模拟经营')
    expect(mergeFull).not.toContain('combat')
    expect(mergeFull).toHaveLength(CHAPTER_KEYS.length - 1)
    expect(visibleChapterKeys('full', 'SLG')).toContain('combat')
    expect(visibleChapterKeys('lite', '模拟经营')).not.toContain('combat')
  })

  it('computeChapterProgress：填 combat 不改变非战斗品类的 total，但拉高含战斗品类', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.meta.game_type = '模拟经营'
    const mergeBefore = computeChapterProgress(doc).total

    // 把 combat 填满
    doc.combat.combat_mode = '自动战斗'
    doc.combat.damage_formula = 'atk - def'

    const mergeAfter = computeChapterProgress(doc)
    expect(getGameType(doc)).toBe('模拟经营')
    expect(mergeAfter.combat).toBeUndefined() // combat 不在进度里
    expect(mergeAfter.total).toBe(mergeBefore) // 非战斗品类：填 combat 不改变 total

    // 切到含战斗品类：combat 计满，且 total 被拉高
    doc.meta.game_type = 'SLG'
    const slg = computeChapterProgress(doc)
    expect(slg.combat).toBe(1)
    expect(slg.total).toBeGreaterThan(mergeAfter.total)
  })

  it('完备度：无战斗品类少算 combat 章（23 章），含战斗 24 章', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.meta.game_type = '模拟经营'
    expect(computeReadiness(doc).chapters).toHaveLength(CHAPTER_KEYS.length - 1)
    expect(computeReadiness(doc).chapters.some((chapter) => chapter.chapter_key === 'combat')).toBe(false)

    doc.meta.game_type = 'SLG'
    expect(computeReadiness(doc).chapters).toHaveLength(CHAPTER_KEYS.length)
    expect(computeReadiness(doc).chapters.some((chapter) => chapter.chapter_key === 'combat')).toBe(true)
  })
})
