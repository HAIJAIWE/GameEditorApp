import { describe, expect, it } from 'vitest'

import {
  buildChapterPrompt,
  buildFullGeneratePlan,
  type FullGenerateFormInput
} from '@mobai/shared/ceshu/prompts'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import { chaptersUpToStage } from '@mobai/shared/ceshu/workflow'

/**
 * 游戏档「一键生成」改造回归（2026-11-07，依据 docs/game-doc-corpus-2026.md）。
 *
 * 搜到的真实游戏文档一致表明 GDD 是从一页 pitch 分阶段长出来的活文档，
 * 且按项目裁剪章节；本项目此前一次铺满 24 章、还无视 enabled_modules 与品类。
 * 这里锁住改造后的 4 个行为。
 */
const form: FullGenerateFormInput = {
  gameName: '星河战记',
  gameType: 'RPG',
  style: '科幻',
  description: '玩家扮演星际考古学家，探索遗迹并拼合线索',
  references: '',
  platforms: ['PC'],
  businessModel: 'F2P'
}
const base = { scope: 'full' as const, includeMarket: true, includeRisk: true }

describe('生成阶段：立项 / 制作 / 全量', () => {
  it('缺省 = 全量 24 章（既有调用零回归）', () => {
    expect(buildFullGeneratePlan(form, base).order).toHaveLength(24)
  })

  it('立项 = concept 累计章，制作 = 累计到 production，全量 = 24', () => {
    const concept = buildFullGeneratePlan(form, { ...base, stage: 'concept' })
    const production = buildFullGeneratePlan(form, { ...base, stage: 'production' })
    const full = buildFullGeneratePlan(form, { ...base, stage: 'full' })
    expect(concept.order).toEqual(chaptersUpToStage('concept'))
    expect(production.order.length).toBeGreaterThan(concept.order.length)
    expect(full.order.length).toBeGreaterThan(production.order.length)
    // 阶段是累计：立项章必须全在制作里
    for (const key of concept.order) expect(production.order).toContain(key)
    // 提示词与章表一一对应，不缺不多
    expect(Object.keys(concept.chapterPrompts).sort()).toEqual([...concept.order].sort())
  })

  it('立项不含 release 章（市场/运营/发行/埋点等）', () => {
    const plan = buildFullGeneratePlan(form, { ...base, stage: 'concept' })
    for (const key of ['market_analysis', 'live_ops', 'analytics', 'publishing', 'resources']) {
      expect(plan.order, key).not.toContain(key)
    }
  })
})

describe('文档感知裁剪：不生成用户关闭 / 品类不适用的章', () => {
  it('新建默认文档（market/monetization/live_ops 默认关）→ 全量也不生成这三章', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    const plan = buildFullGeneratePlan(form, { ...base, visibleChapters: visibleChaptersForDoc(doc) })
    for (const key of ['market_analysis', 'monetization', 'live_ops']) {
      expect(plan.order, key).not.toContain(key)
    }
    expect(plan.order).toContain('gameplay')
  })

  it('无战斗品类（视觉小说）→ 不生成 combat 章', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.meta.game_type = '视觉小说'
    const plan = buildFullGeneratePlan(form, {
      ...base,
      visibleChapters: visibleChaptersForDoc(doc)
    })
    expect(plan.order).not.toContain('combat')
    expect(plan.order).toContain('story')
  })

  it('启用模块后 → 该章恢复生成', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.meta.enabled_modules = ['market_analysis', 'monetization', 'live_ops']
    const plan = buildFullGeneratePlan(form, { ...base, visibleChapters: visibleChaptersForDoc(doc) })
    expect(plan.order).toContain('monetization')
  })
})

describe('前文要点按生成顺序取前序（修 P0-1 回归）', () => {
  it('生成 market_analysis（生成第 3 位、章表第 13 位）时，摘要不含尚未生成的 story', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.vision.design_vision = '星际考古的核心幻想'
    // 模拟已生成 draft：meta + vision 已写；story 等虽在章表上排在 market 之前，但尚未生成
    const order = buildFullGeneratePlan(form, base).order
    const prompt = buildChapterPrompt(doc, 'market_analysis', {
      generationOrder: order,
      generatedChapters: ['meta', 'vision']
    }).prompt
    expect(prompt).toContain('前文要点')
    expect(prompt).toContain('星际考古的核心幻想') // vision 已生成 ⇒ 应作为前文
    // story 在章表上排在 market 之前、但生成顺序里在它之后 ⇒ 不得作为前文
    const digest = prompt.slice(prompt.indexOf('前文要点'), prompt.indexOf('该章节需要填充的字段列表'))
    expect(digest).not.toContain('世界观与角色')
    expect(digest).toContain('产品愿景')
  })

  it('不传 generationOrder 时回退章表顺序（单章生成零回归）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.vision.design_vision = '星际考古的核心幻想'
    const prompt = buildChapterPrompt(doc, 'story').prompt
    expect(prompt).toContain('前文要点')
    expect(prompt).toContain('星际考古的核心幻想')
  })
})

/** stage 与 scope 不可叠乘：lite 的基础 9 章不含 mvp，交集会把立项最关键的「先做什么」砍掉 */
describe('阶段与档位不叠乘（2026-11-07 修改造引入的 bug）', () => {
  it('立项 + lite 仍是完整 concept 7 章，含 mvp', () => {
    const plan = buildFullGeneratePlan(form, {
      scope: 'lite', includeMarket: false, includeRisk: false, stage: 'concept'
    })
    expect(plan.order).toEqual(chaptersUpToStage('concept'))
    expect(plan.order).toContain('mvp')
  })

  it('制作 + lite 仍累计到 production，不被基础 9 章截断', () => {
    const plan = buildFullGeneratePlan(form, {
      scope: 'lite', includeMarket: false, includeRisk: false, stage: 'production'
    })
    expect(plan.order).toContain('systems')
    expect(plan.order).toContain('art')
    expect(plan.order.length).toBeGreaterThan(10)
  })

  it('未指定 stage 时 lite 保持旧行为（基础 9 章 + meta）', () => {
    const plan = buildFullGeneratePlan(form, { scope: 'lite', includeMarket: true, includeRisk: true })
    expect(plan.order).toHaveLength(10)
    expect(plan.order).not.toContain('mvp')
  })
})
