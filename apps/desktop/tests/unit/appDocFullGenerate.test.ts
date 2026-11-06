import { describe, expect, it } from 'vitest'

import {
  buildChapterOrder,
  buildFullGeneratePlan,
  type FullGenerateFormInput
} from '@mobai/shared/ceshu/prompts'
import {
  APP_CHAPTER_KEYS,
  APP_CHAPTER_LABELS,
  appChapterAi
} from '@mobai/shared/appSchema'

/**
 * 路线 A 第 4 步收尾守卫：一键全量生成按 docKind 分派。
 *
 * 此前应用档点「一键生成」会拿到硬编码的游戏 24 章顺序与品类关键词，
 * 字段表却查不到这些章 ⇒ 生成一堆空内容。这里锁定应用档拿到的是 SDD 全章计划，
 * 且游戏档 plan 与原路径逐项一致。
 */
const raw: FullGenerateFormInput = {
  gameName: '效率工具',
  gameType: 'RPG',
  style: '仙侠',
  description: '给小团队用的轻量任务看板',
  references: '某看板产品',
  platforms: ['PC', '移动端', '主机', 'Web'],
  businessModel: 'F2P'
}

const options = { scope: 'full' as const, includeMarket: true, includeRisk: true }

describe('应用档：一键全量生成计划走 SDD 规格', () => {
  const plan = buildFullGeneratePlan(raw, { ...options, docKind: 'application' })

  it('章序是 SDD 全章表，不受游戏档 lite / market / risk 裁剪影响', () => {
    expect([...plan.order]).toEqual([...APP_CHAPTER_KEYS])
    expect(plan.order).not.toContain('combat')
    expect(plan.order).not.toContain('damage_formula')
    const lite = buildFullGeneratePlan(raw, {
      ...options, scope: 'lite', includeMarket: false, includeRisk: false, docKind: 'application'
    })
    expect([...lite.order]).toEqual([...APP_CHAPTER_KEYS])
  })

  it('meta 种子是应用档字段，平台归一成规格 key，无游戏风格/类型', () => {
    expect(plan.metaSeed.project_name).toBe('效率工具')
    expect(plan.metaSeed.platform).toEqual(['desktop', 'mobile', 'web'])
    expect(plan.metaSeed.game_name).toBeUndefined()
    expect(plan.metaSeed.game_type).toBeUndefined()
    expect(plan.metaSeed.tags).toBeUndefined()
    expect(plan.styleKey).toBe('')
    expect(plan.typeKey).toBe('')
  })

  it('每章提示含 SDD 标签与本章 aiHint，不下发游戏关键词/硬约束块', () => {
    for (const key of plan.order) {
      const prompt = plan.chapterPrompts[key]
      expect(prompt).toBeDefined()
      expect(prompt).toContain(APP_CHAPTER_LABELS[key])
      expect(prompt).toContain('项目名称: 效率工具')
      expect(prompt).toContain('需求描述: 给小团队用的轻量任务看板')
      expect(prompt).toContain('目标平台')
      expect(prompt).not.toContain('游戏名称')
      expect(prompt).not.toContain('游戏类型:')
      expect(prompt).not.toContain('风格术语表')
      expect(prompt).not.toContain('品类关键词')
      expect(prompt).not.toContain('【关键词与硬约束】')
      // 每章的生成要求来自该章 AI 元数据（角色提示语 + 本章要求）
      expect(prompt).toContain(appChapterAi(key).aiHint)
    }
  })

  it('参考输入用「参考产品」措辞，不出现「参考游戏 / 商业模式」', () => {
    const metaPrompt = plan.chapterPrompts.meta
    expect(metaPrompt).toContain('参考产品: 某看板产品')
    expect(metaPrompt).not.toContain('参考游戏')
    expect(metaPrompt).not.toContain('商业模式')
  })
})

describe('游戏档：全量生成计划逐项零回归', () => {
  const plan = buildFullGeneratePlan(raw, options)

  it('章序 / meta 种子 / 风格类型 key 与既有路径一致', () => {
    expect([...plan.order]).toEqual(buildChapterOrder(true, true))
    expect(plan.metaSeed.game_name).toBe('效率工具')
    expect(plan.metaSeed.game_type).toBe('RPG')
    expect(plan.metaSeed.platform).toEqual(['PC', '移动端', '主机', 'Web'])
    expect(plan.metaSeed.tags).toEqual(['仙侠'])
    expect(plan.styleKey).toBe('xianxia')
    expect(plan.typeKey).not.toBe('')
  })

  it('章节提示仍含游戏关键词/硬约束与游戏用户输入措辞', () => {
    const prompt = plan.chapterPrompts.combat
    expect(prompt).toContain('【关键词与硬约束】')
    expect(prompt).toContain('游戏名称: 效率工具')
    expect(prompt).toContain('游戏类型: RPG')
    expect(prompt).toContain('参考游戏')
    expect(prompt).toContain('商业模式: F2P')
    expect(prompt).not.toContain('软件设计文档')
  })

  it('lite 档仍裁回基础章', () => {
    const lite = buildFullGeneratePlan(raw, { ...options, scope: 'lite', includeMarket: false, includeRisk: false })
    expect(lite.order.length).toBeLessThan(plan.order.length)
  })
})
