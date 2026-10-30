import { describe, expect, it } from 'vitest'

import { CHAPTER_KEYS, CHAPTER_LABELS, CHAPTER_REQUIRED_FIELDS, type CeshuDocument } from '../../src/shared/ceshu/reference/ceshuConstants'
import { createDefaultCeshu } from '../../src/shared/ceshu/model/ceshuModel'
import { computeReadiness, readinessFillGap, readinessStageLabel } from '../../src/shared/ceshu/readiness/ceshuReadiness'
import { chaptersUpToStage } from '../../src/shared/ceshu/workflow/ceshuStages'
import { validateCeshu } from '../../src/shared/ceshu/validation/ceshuValidation'

/**
 * 完备度引擎（`computeReadiness`）—— 替代已删除的 100 分制 `scoreCeshu`。
 *
 * 用户判定「一百分制有啥用哈…纯瞎评价的」，故改造后刻意**不含** total_score / grade /
 * 三维度权重：只报「每个阶段必填几个 / 填了几个 / 缺哪几个」+ 逐章缺口 + 有出处的参照对比。
 *
 * 核心契约（本文件锁死）：
 * - 分母与 `CHAPTER_REQUIRED_FIELDS` × 可见章**同源**，可复算；
 * - 无战斗品类的 combat 章不进分母（与 `computeChapterProgress` 同口径）；
 * - 「完备度说缺 N」与「校验报 N 条必填」方向一致（`readinessFillGap` 守卫）；
 * - `next_steps` 每条都能对应到可定位的章/字段。
 */

/** 空文档：清空全部章（仓库默认档在 meta 含 game_name 等初始文案，按「完全未填写」口径清零） */
function emptyDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full' })
  const target = doc as unknown as Record<string, unknown>
  for (const key of CHAPTER_KEYS) target[key] = {}
  return doc
}

describe('完备度引擎：阶段分母与缺口', () => {
  it('空文档：立项 0/16、研发 0/34、发行 0/50，逐章 24 条，全部 empty', () => {
    const report = computeReadiness(emptyDoc())

    expect(report.concept).toMatchObject({
      stage: 'concept',
      required_total: 16,
      required_filled: 0,
      ratio: 0,
      missing_count: 16,
      chapter_count: 7
    })
    expect(report.production.required_total).toBe(34)
    expect(report.production.chapter_count).toBe(16)
    expect(report.release.required_total).toBe(50)
    expect(report.release.chapter_count).toBe(24)

    expect(report.total_required).toBe(50)
    expect(report.total_missing).toBe(50)
    expect(report.total_ratio).toBe(0)
    expect(report.chapters).toHaveLength(24)
    expect(report.chapters.every((chapter) => chapter.empty)).toBe(true)
  })

  it('分母可复算：全文必填总数 = CHAPTER_REQUIRED_FIELDS 各章之和 = 50', () => {
    // 这是「有明确分母」的证据：报告里的数字来自常量表，不是拍出来的权重
    const sum = CHAPTER_KEYS.reduce((total, key) => total + (CHAPTER_REQUIRED_FIELDS[key] ?? []).length, 0)
    expect(sum).toBe(50)
    expect(computeReadiness(emptyDoc()).total_required).toBe(sum)
  })

  it('阶段是累计的：立项 ⊂ 研发 ⊂ 发行（章数与必填单调不减）', () => {
    const report = computeReadiness(emptyDoc())
    expect(report.concept.chapter_count).toBeLessThan(report.production.chapter_count)
    expect(report.production.chapter_count).toBeLessThan(report.release.chapter_count)
    expect(report.concept.required_total).toBeLessThan(report.production.required_total)
    expect(report.production.required_total).toBeLessThan(report.release.required_total)
    expect(report.release.required_total).toBe(report.total_required)
  })

  it('立项阶段章数与 chaptersUpToStage 一致', () => {
    expect(computeReadiness(emptyDoc()).concept.chapter_count).toBe(chaptersUpToStage('concept').length)
    expect(chaptersUpToStage('concept')).toHaveLength(7)
  })

  it('填满 meta 四必填：meta 章 4/4、缺失为空、完成度 1，立项 4/16', () => {
    const doc = emptyDoc()
    doc.meta = { game_name: '测试游戏', game_type: 'RPG', positioning: '一句话定位', tags: ['标签'] }

    const report = computeReadiness(doc)
    const meta = report.chapters.find((chapter) => chapter.chapter_key === 'meta')

    expect(meta?.required_total).toBe(4)
    expect(meta?.required_filled).toBe(4)
    expect(meta?.missing_required).toEqual([])
    expect(meta?.completion).toBe(1)
    expect(meta?.empty).toBe(false)

    expect(report.concept.required_filled).toBe(4)
    expect(report.concept.ratio).toBe(0.25) // 4/16
    expect(report.concept.missing_count).toBe(12)
  })

  it('部分填写：meta 只填 1 个必填 ⇒ 缺 3 个，逐章缺口点名缺的字段', () => {
    const doc = emptyDoc()
    doc.meta = { game_name: '只填了名字' }

    const meta = computeReadiness(doc).chapters.find((chapter) => chapter.chapter_key === 'meta')
    expect(meta?.required_filled).toBe(1)
    expect(meta?.missing_required).toEqual(['game_type', 'positioning', 'tags'])
  })

  it('章节标签来自 CHAPTER_LABELS（用于 UI 展示与报告）', () => {
    const report = computeReadiness(emptyDoc())
    const meta = report.chapters.find((chapter) => chapter.chapter_key === 'meta')
    expect(meta?.chapter_label).toBe(CHAPTER_LABELS.meta)
  })
})

describe('完备度引擎：品类口径（与完成度分母同源）', () => {
  it('无战斗品类（模拟经营）：combat 章不进分母，立项 14 / 逐章 23', () => {
    const doc = emptyDoc()
    doc.meta = { game_type: '模拟经营' }
    const report = computeReadiness(doc)

    expect(report.concept.required_total).toBe(14) // 16 - combat 的 2 个必填
    expect(report.concept.chapter_count).toBe(6) // 7 - combat
    expect(report.chapters).toHaveLength(23) // 24 - combat
    expect(report.chapters.some((chapter) => chapter.chapter_key === 'combat')).toBe(false)
  })

  it('含战斗品类（SLG）：combat 章计入，立项 16 / 逐章 24', () => {
    const doc = emptyDoc()
    doc.meta = { game_type: 'SLG' }
    const report = computeReadiness(doc)

    expect(report.concept.required_total).toBe(16)
    expect(report.concept.chapter_count).toBe(7)
    expect(report.chapters.some((chapter) => chapter.chapter_key === 'combat')).toBe(true)
  })

  it('缺省（未选品类）按「有战斗」保守处理 ⇒ 与 SLG 同口径', () => {
    const report = computeReadiness(emptyDoc())
    expect(report.concept.required_total).toBe(16)
    expect(report.chapters).toHaveLength(24)
  })

  it('enabled_modules 关掉的模块不进分母（与 computeChapterProgress 一致）', () => {
    const doc = emptyDoc()
    doc.meta = { enabled_modules: ['combat'] }
    const report = computeReadiness(doc)

    const keys = report.chapters.map((chapter) => chapter.chapter_key)
    expect(keys).toContain('combat')
    expect(keys).not.toContain('economy')
    expect(keys).not.toContain('numeric')
    // 底座章恒在
    expect(keys).toContain('meta')
    expect(keys).toContain('mvp')
  })
})

describe('完备度引擎：内容质量提示（与校验面板同阈值）', () => {
  it('「写满但空」的章进入 quality_notes；有具体数字的章不进', () => {
    const hollow = emptyDoc()
    hollow.story = { architecture: '体验丰富多样。深度融合玩法。带来极致体验。'.repeat(40) }
    const solid = emptyDoc()
    solid.story = { architecture: '首关 90 秒，平均死亡 2.3 次。Boss 血量 1200。'.repeat(40) }

    const hollowStory = computeReadiness(hollow).chapters.find((chapter) => chapter.chapter_key === 'story')
    const solidStory = computeReadiness(solid).chapters.find((chapter) => chapter.chapter_key === 'story')

    expect(hollowStory?.quality_notes.some((note) => note.includes('空话'))).toBe(true)
    expect(solidStory?.quality_notes).toEqual([])
  })

  it('next_steps 点名「内容偏空」的章（有行动力）', () => {
    const hollow = emptyDoc()
    hollow.story = { architecture: '体验丰富多样。深度融合玩法。带来极致体验。'.repeat(40) }
    expect(computeReadiness(hollow).next_steps.some((step) => step.includes('内容偏空'))).toBe(true)
  })
})

describe('完备度引擎：next_steps（可定位、有行动力）', () => {
  it('空文档：首条点名立项缺口字段，且含「完全未填写」「全文还差」', () => {
    const steps = computeReadiness(emptyDoc()).next_steps

    expect(steps[0]).toContain('先补齐立项阶段还差的 16 个必填字段')
    // 「下一步」是给人看的行动项：点名字段写中文标签（key 留在 `missing_required` 里给机器用）
    expect(steps[0]).toContain('文档信息·游戏名称')
    expect(steps[0]).not.toContain('·game_name')
    expect(steps.some((step) => step.includes('完全未填写'))).toBe(true)
    expect(steps.some((step) => step.includes('全文（发行阶段口径）还差 50 个必填字段'))).toBe(true)
  })

  it('硬错误单独点名（字段都填了但格式错时，完备度不背这个锅）', () => {
    // 空文档有 46 条 error 级校验（必填之外还有格式/冲突/依赖）
    const steps = computeReadiness(emptyDoc()).next_steps
    expect(steps.some((step) => step.includes('条校验错误'))).toBe(true)
  })

  it('可传入已算好的校验结果（IPC 只跑一次），结果与内部自查一致', () => {
    const doc = emptyDoc()
    const errors = validateCeshu(doc)
    expect(computeReadiness(doc, errors)).toEqual(computeReadiness(doc))
  })

  it('立项缺口为 0 时给出「可以开工」的正向提示', () => {
    const doc = emptyDoc()
    doc.meta = { game_name: 'x', game_type: 'RPG', positioning: 'y', tags: ['z'] }
    doc.vision = { design_vision: 'a', differentiation: 'b' }
    doc.gameplay = { core_loop: 'c', game_modes: ['d'] }
    doc.combat = { combat_mode: 'e', damage_formula: 'f' }
    doc.economy = { currency_types: ['g'], source_sink: 'h' }
    doc.numeric = { core_formulas: 'i', balance_principles: 'j' }
    doc.mvp = { mvp_scope: 'k', mvp_timeline: 'l' }

    const report = computeReadiness(doc)
    expect(report.concept.missing_count).toBe(0)
    expect(report.next_steps[0]).toContain('立项阶段必填已齐')
  })
})

describe('完备度引擎：与校验同源（守卫）', () => {
  it('readinessFillGap >= 0（完备度不比校验更宽松）', () => {
    /*
     * 完备度用 isFilledValue、校验用 isEmptyRequiredValue，两套口径本就应有差异：
     * 人定字段（game_type / engine / game_name 等）在校验里走「由人确定，尚未填写」分支，
     * **不含「为必填项」字样**，故校验的 requiredErrors 会比完备度缺口少几条。
     * 恒等式：完备度缺口 >= 校验「为必填项」条数（gap >= 0）——否则就是完备度漏报了必填。
     */
    const merge = emptyDoc()
    merge.meta = { game_type: '模拟经营' }
    expect(readinessFillGap(emptyDoc())).toBeGreaterThanOrEqual(0)
    expect(readinessFillGap(merge)).toBeGreaterThanOrEqual(0)
  })

  it('stageLabel 取自 CESHU_STAGE_LABELS（导出报告用）', () => {
    expect(readinessStageLabel('concept')).toBe('立项')
    expect(readinessStageLabel('production')).toBe('研发')
    expect(readinessStageLabel('release')).toBe('发行')
  })

  it('报告刻意不含 total_score / grade / structure_score（防「纯瞎评价」回归）', () => {
    const report = computeReadiness(emptyDoc()) as unknown as Record<string, unknown>
    expect(report).not.toHaveProperty('total_score')
    expect(report).not.toHaveProperty('grade')
    expect(report).not.toHaveProperty('structure_score')
    expect(report).not.toHaveProperty('market_potential_score')
    expect(report).not.toHaveProperty('industry_benchmark')
  })
})
