import { describe, expect, it } from 'vitest'

import {
  CHAPTER_GENERATION_HINTS,
  agentForChapter,
  buildChapterOrder,
  buildChapterPrompt,
  buildFullGeneratePlan,
  filterGeneratedFields,
  getStyleGlossary,
  mapStyleLabelToKey,
  mapTypeLabelToKey,
  mergeChapterDraft,
  normalizeFullGenerateInput,
  parseLlmJson
} from '../../src/shared/ceshuAi'
import { CHAPTER_KEYS } from '../../src/shared/ceshuConstants'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'

describe('AI 生成：子智能体路由与风格术语（匹平 Python AgentRouter / _STYLE_GLOSSARIES）', () => {
  it('18 章均有路由与展示名；关键映射与章节提示语正确', () => {
    for (const chapter of CHAPTER_KEYS) {
      const agent = agentForChapter(chapter)
      expect(agent.displayName).not.toBe('')
      expect(agent.agentPrompt).not.toBe('')
    }
    expect(agentForChapter('combat').displayName).toBe('策划专家')
    expect(agentForChapter('worldview').displayName).toBe('文案写手')
    expect(agentForChapter('numeric').displayName).toBe('数据分析师')
    expect(agentForChapter('tech').displayName).toBe('代码助手')
    expect(agentForChapter('meta').displayName).toBe('通用策划助手')
    expect(agentForChapter('audio').agentPrompt).toContain('音乐风格')
  })

  it('风格术语表：已知风格返回术语，未知/空返回空串', () => {
    expect(getStyleGlossary('xianxia')).toContain('渡劫')
    expect(getStyleGlossary('fantasy')).toContain('精灵')
    expect(getStyleGlossary('')).toBe('')
    expect(getStyleGlossary('unknown-style')).toBe('')
  })
})

describe('AI 生成：整章提示词组装（匹平 Python _ai_fill_chapter）', () => {
  it('整章模式：字段列表含全部键、含上下文与 JSON 输出要求', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    const built = buildChapterPrompt(doc, 'meta')

    expect(built.fields).toEqual(Object.keys(doc.meta))
    expect(built.fields).toContain('game_name')
    expect(built.system).toContain('通用策划助手')
    expect(built.system).toContain('只输出 JSON')
    expect(built.prompt).toContain('游戏名称: 测试游戏')
    expect(built.prompt).toContain('该章节需要填充的字段列表:')
    expect(built.prompt).toContain('必须为字段列表中的每个字段都生成内容')
  })

  it('补全模式：仅空字段；已有非空内容作为保留参考；风格术语进入上下文', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    doc.meta.game_type = 'RPG'
    doc.style = 'xianxia'

    const built = buildChapterPrompt(doc, 'meta', { onlyEmpty: true })
    expect(built.fields).not.toContain('game_name')
    expect(built.fields).not.toContain('game_type')
    expect(built.fields).toContain('positioning')
    expect(built.system).toContain('请仅补全下面列出的空字段')
    expect(built.prompt).toContain('只输出上面字段列表中列出的空字段')
    expect(built.prompt).toContain('- game_name: 测试游戏')
    expect(built.prompt).toContain('风格术语表:')
    expect(built.prompt).toContain('渡劫')
  })

  it('补全模式：无空字段时字段列表为空（上层不再调用 LLM）', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const combat = doc.combat
    for (const key of Object.keys(combat)) {
      combat[key] = '已填内容'
    }
    expect(buildChapterPrompt(doc, 'combat', { onlyEmpty: true }).fields).toEqual([])
  })
})

describe('AI 生成：LLM 输出容错解析（匹平 Python _parse_llm_json）', () => {
  it('去除 markdown 围栏并截取 JSON 边界', () => {
    expect(parseLlmJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 })
    expect(parseLlmJson('好的，结果如下：{"game_name": "星海"} 以上。')).toEqual({ game_name: '星海' })
  })

  it('尾逗号容错；非法输入返回空对象；非对象返回空对象', () => {
    expect(parseLlmJson('{"a": 1,}')).toEqual({ a: 1 })
    expect(parseLlmJson('{"list": [1, 2,],}')).toEqual({ list: [1, 2] })
    expect(parseLlmJson('这不是 JSON')).toEqual({})
    expect(parseLlmJson('')).toEqual({})
    expect(parseLlmJson('[1, 2, 3]')).toEqual({})
  })
})

describe('AI 生成：字段清洗', () => {
  it('只保留该章 schema 字段 / 既有数据键；丢弃未知键、null 与空值', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const filtered = filterGeneratedFields(doc, 'combat', {
      damage_formula: '伤害 = 攻击 - 防御',
      unknown_field: '应丢弃',
      empty_text: '',
      nothing: null,
      zero: 0
    })
    expect(filtered).toEqual({ damage_formula: '伤害 = 攻击 - 防御' })
  })

  it('点路径父键保留（如 user_personas 对象整体返回）；既有扩展键保留', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const vision = filterGeneratedFields(doc, 'vision', {
      user_personas: { primary: '核心玩家', secondary: '休闲玩家' },
      design_vision: '愿景'
    })
    expect(vision).toEqual({ user_personas: { primary: '核心玩家', secondary: '休闲玩家' }, design_vision: '愿景' })

    const meta = filterGeneratedFields(doc, 'meta', { version: '0.2.0', game_name: '游戏' })
    expect(meta).toEqual({ version: '0.2.0', game_name: '游戏' })
  })
})

describe('AI 全量生成：章节顺序与生成要求（匹平 Python _build_chapter_order / chapter_hint）', () => {
  it('含市场/风险为 18 章，顺序与 Python 一致', () => {
    expect(buildChapterOrder(true, true)).toEqual([
      'meta',
      'vision',
      'market_analysis',
      'worldview',
      'characters',
      'gameplay',
      'combat',
      'systems',
      'economy',
      'monetization',
      'numeric',
      'art',
      'audio',
      'tech',
      'risk_handling',
      'mvp',
      'resources',
      'accessibility'
    ])
  })

  it('关闭市场/风险后为 16 章且位置正确', () => {
    const order = buildChapterOrder(false, false)
    expect(order).toHaveLength(16)
    expect(order).not.toContain('market_analysis')
    expect(order).not.toContain('risk_handling')
    expect(order[0]).toBe('meta')
    expect(order[1]).toBe('vision')
    expect(order[order.length - 1]).toBe('accessibility')
  })

  it('18 章生成要求文案齐全（抽查关键条目）', () => {
    for (const chapter of CHAPTER_KEYS) {
      expect(CHAPTER_GENERATION_HINTS[chapter].length).toBeGreaterThan(0)
    }
    expect(CHAPTER_GENERATION_HINTS.systems).toContain('enabled/config')
    expect(CHAPTER_GENERATION_HINTS.combat).toContain('伤害公式')
    expect(CHAPTER_GENERATION_HINTS.risk_handling).toContain('应急预案')
  })
})

describe('AI 全量生成：计划组装（匹平 Python _ai_generate_full / _build_chapter_prompts / _build_meta_seed）', () => {
  const form = {
    gameName: '星河战记',
    gameType: 'RPG',
    style: '仙侠',
    description: '修真者探索三界',
    references: '原神, 艾尔登法环',
    platforms: ['PC', '移动端'],
    businessModel: 'F2P'
  }

  it('轻量档只含基础 9 章（依赖顺序）；meta 种子与风格/类型映射正确', () => {
    const plan = buildFullGeneratePlan(form, { scope: 'lite', includeMarket: true, includeRisk: true })
    expect(plan.order).toEqual([
      'meta',
      'vision',
      'worldview',
      'gameplay',
      'systems',
      'numeric',
      'art',
      'tech',
      'resources'
    ])
    expect(plan.styleKey).toBe('xianxia')
    expect(plan.typeKey).toBe('rpg')
    expect(plan.metaSeed).toEqual({
      game_name: '星河战记',
      game_type: 'RPG',
      platform: ['PC', '移动端'],
      positioning: '',
      tags: ['仙侠']
    })
  })

  it('工业级档：市场/风险开关生效；每章提示词含【章节】【用户输入】【生成要求】', () => {
    const full = buildFullGeneratePlan(form, { scope: 'full', includeMarket: true, includeRisk: true })
    expect(full.order).toHaveLength(18)
    const prompt = full.chapterPrompts.systems ?? ''
    expect(prompt).toContain('【章节】第五章·游戏系统设计')
    expect(prompt).toContain('【用户输入】')
    expect(prompt).toContain('游戏名称: 星河战记')
    expect(prompt).toContain('概念描述: 修真者探索三界')
    expect(prompt).toContain('参考游戏: 原神, 艾尔登法环')
    expect(prompt).toContain('【生成要求】')
    expect(prompt).toContain('enabled/config')
    expect(prompt.endsWith('只输出 JSON。')).toBe(true)

    const noMarket = buildFullGeneratePlan(form, { scope: 'full', includeMarket: false, includeRisk: false })
    expect(noMarket.order).toHaveLength(16)
    expect(noMarket.chapterPrompts.market_analysis).toBeUndefined()
  })

  it('归一化：逗号拆分参考游戏、清理空白', () => {
    const input = normalizeFullGenerateInput({ ...form, references: ' 原神 ,, 艾尔登法环 ', gameName: ' 星 ' })
    expect(input.references).toEqual(['原神', '艾尔登法环'])
    expect(input.gameName).toBe('星')
  })
})

describe('AI 全量生成：提示词补充参数与草稿合并', () => {
  it('extraPrompt 追加在默认提示之后；styleOverride 优先于 doc.style', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const built = buildChapterPrompt(doc, 'meta', {
      extraPrompt: '【生成要求】请生成项目元信息。',
      styleOverride: 'xianxia'
    })
    expect(built.prompt.endsWith('【生成要求】请生成项目元信息。')).toBe(true)
    expect(built.prompt).toContain('风格: xianxia')
    expect(built.prompt).toContain('渡劫')
  })

  it('mergeChapterDraft：逐章浅合并、原文档不变、未知键忽略', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const merged = mergeChapterDraft(doc, { meta: { game_name: 'AI 名称' }, unknown: { a: 1 } })
    expect(merged.meta.game_name).toBe('AI 名称')
    expect(merged.meta.positioning).toBe('')
    expect(merged).not.toBe(doc)
    expect(doc.meta.game_name).toBe('')
    expect(Object.keys(merged)).not.toContain('unknown')
  })

  it('风格/类型标签映射：已知标签映射、未知返回空串', () => {
    expect(mapStyleLabelToKey('仙侠')).toBe('xianxia')
    expect(mapStyleLabelToKey('二次元')).toBe('anime')
    expect(mapStyleLabelToKey('未知')).toBe('')
    expect(mapTypeLabelToKey('RPG')).toBe('rpg')
    expect(mapTypeLabelToKey('策略')).toBe('strategy')
    expect(mapTypeLabelToKey('未知')).toBe('')
  })
})