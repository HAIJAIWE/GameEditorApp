import { describe, expect, it } from 'vitest'

import {
  agentForChapter,
  buildChapterPrompt,
  filterGeneratedFields,
  getStyleGlossary,
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