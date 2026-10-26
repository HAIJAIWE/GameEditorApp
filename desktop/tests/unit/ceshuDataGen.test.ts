import { describe, expect, it } from 'vitest'

import { BUILTIN_DATA_TYPES } from '../../src/shared/typeSchema'
import {
  DATA_GEN_DEFAULT_COUNT,
  DATA_GEN_ERROR_EMPTY,
  DATA_GEN_ERROR_NO_TYPE,
  DATA_GEN_ERROR_UNPARSABLE,
  DATA_GEN_NO_BACKGROUND,
  buildDataGenBackground,
  buildDataGenPrompt,
  buildDataGenSummaryMessage,
  buildDataGenTypeHints,
  clampDataGenCount,
  dataTypeFieldHints,
  normalizeDataGenCandidates,
  resolveSelectedDataTypes,
  summarizeCandidateItem
} from '../../src/shared/ceshuDataGen'

const roleDef = BUILTIN_DATA_TYPES.find((type) => type.id === 'role')
const skillDef = BUILTIN_DATA_TYPES.find((type) => type.id === 'skill')

describe('ceshuDataGen 类型与条数解析', () => {
  it('单数/复数键均可识别、大小写不敏感、去重且保持传入顺序', () => {
    const selected = resolveSelectedDataTypes(BUILTIN_DATA_TYPES, ['roles', ' SKILL ', 'role', 'unknown_type', ''])
    expect(selected).toEqual([
      { id: 'role', name: '角色', pluralKey: 'roles' },
      { id: 'skill', name: '技能', pluralKey: 'skills' },
      { id: 'unknown_type', name: 'unknown_type', pluralKey: 'unknown_type' }
    ])
  })

  it('12 种内置类型全部可通过复数键解析（pluralKey 唯一）', () => {
    const selected = resolveSelectedDataTypes(
      BUILTIN_DATA_TYPES,
      BUILTIN_DATA_TYPES.map((type) => type.pluralKey)
    )
    expect(selected).toHaveLength(12)
    expect(selected.map((item) => item.id)).toEqual(BUILTIN_DATA_TYPES.map((type) => type.id))
  })

  it('条数归一：默认 5，范围 1~20，非数值回退默认', () => {
    expect(DATA_GEN_DEFAULT_COUNT).toBe(5)
    expect(clampDataGenCount(undefined)).toBe(5)
    expect(clampDataGenCount('abc')).toBe(5)
    expect(clampDataGenCount(0)).toBe(1)
    expect(clampDataGenCount(-3)).toBe(1)
    expect(clampDataGenCount(25)).toBe(20)
    expect(clampDataGenCount(3.9)).toBe(3)
    expect(clampDataGenCount(7)).toBe(7)
  })

  it('错误文案与 旧版 一致', () => {
    expect(DATA_GEN_ERROR_NO_TYPE).toBe('请至少选择一种数据类型（如角色、技能、怪物）。')
    expect(DATA_GEN_ERROR_UNPARSABLE).toBe('AI 返回内容无法解析为 JSON，请重试或减少生成数量。')
    expect(DATA_GEN_ERROR_EMPTY).toBe('AI 未返回任何有效数据条目，请补充数值章设定或调整要求后重试。')
  })
})

describe('ceshuDataGen 策划书上下文与提示词', () => {
  it('背景信息：meta 三项 + numeric 三项（截断 500）+ 启用系统名前 12 个', () => {
    const systems: Record<string, unknown> = {
      battle: { enabled: true, name: '战斗' },
      skill: { enabled: true, name: '技能' },
      disabled_one: { enabled: false, name: '未启用' },
      empty_name: { enabled: true, name: '  ' }
    }
    for (let index = 0; index < 12; index += 1) {
      systems[`extra${index}`] = { enabled: true, name: `系统${index + 1}` }
    }
    const background = buildDataGenBackground({
      meta: { game_name: '云海仙踪', game_type: 'RPG', positioning: '仙侠开放世界' },
      numeric: { core_formulas: 'A'.repeat(600), balance_principles: '平衡优先', economic_model: '' },
      systems
    } as never)

    const lines = background.split('\n')
    expect(lines[0]).toBe('游戏名：云海仙踪')
    expect(lines[1]).toBe('类型：RPG')
    expect(lines[2]).toBe('定位：仙侠开放世界')
    expect(lines[3]).toBe(`核心公式：${'A'.repeat(500)}`)
    expect(lines[4]).toBe('平衡原则：平衡优先')
    // economic_model 为空 → 不出现
    expect(background).not.toContain('经济模型')
    // 启用系统：战斗、技能 + 前 12 个 extra（共 14 个启用，截断到 12）
    expect(lines[5]).toBe(
      '启用的游戏系统：战斗、技能、系统1、系统2、系统3、系统4、系统5、系统6、系统7、系统8、系统9、系统10'
    )
    expect(lines).toHaveLength(6)
  })

  it('无背景信息 → 占位文案', () => {
    const background = buildDataGenBackground({
      meta: { game_name: '', game_type: '', positioning: '' },
      numeric: {},
      systems: {}
    } as never)
    expect(background).toBe(DATA_GEN_NO_BACKGROUND)
  })

  it('建议字段：排除 id 与 image*、最多 14 个；未知类型 → 字段参考默认数据表', () => {
    const hints = dataTypeFieldHints(roleDef)
    expect(hints).not.toContain('id')
    expect(hints.length).toBeLessThanOrEqual(14)
    expect(hints.slice(0, 11)).toEqual([
      'name',
      'job',
      'race',
      'faction',
      'attr_list',
      'skills',
      'talents',
      'buffs',
      'mechanism',
      'category',
      'tags'
    ])

    const text = buildDataGenTypeHints(
      BUILTIN_DATA_TYPES,
      resolveSelectedDataTypes(BUILTIN_DATA_TYPES, ['roles', 'ghost'])
    )
    const lines = text.split('\n')
    expect(lines[0]).toBe(`- 角色（键: roles）：建议字段 ${dataTypeFieldHints(roleDef).join(', ')}`)
    expect(lines[1]).toBe('- ghost（键: ghost）：字段参考默认数据表')
  })

  it('提示词：system 与 user 逐句对应 旧版', () => {
    const doc = {
      meta: { game_name: '云海仙踪', game_type: '', positioning: '' },
      numeric: { core_formulas: '伤害=攻击-防御' },
      systems: { battle: { enabled: true, name: '战斗' } }
    } as never
    const selected = resolveSelectedDataTypes(BUILTIN_DATA_TYPES, ['roles'])
    const built = buildDataGenPrompt(doc, BUILTIN_DATA_TYPES, selected, 3, '全部为 1-10 级')

    expect(built.system).toBe(
      '你是资深游戏数值与内容策划，负责从策划书设定出发生成初始游戏数据。' +
        '你只输出一个合法 JSON 对象，不输出任何解释、注释或代码块标记。'
    )
    expect(built.prompt).toBe(
      '请根据下面的策划书设定，为指定的游戏数据类型生成初始候选数据（人工审批后才导入，允许少量瑕疵）。\n\n' +
        '[策划书设定]\n' +
        '游戏名：云海仙踪\n核心公式：伤害=攻击-防御\n启用的游戏系统：战斗\n\n' +
        '[数据类型与建议字段]\n' +
        `- 角色（键: roles）：建议字段 ${dataTypeFieldHints(roleDef).join(', ')}\n\n` +
        '[要求]\n' +
        '1. 每个类型生成 3 条数据。\n' +
        '2. 输出 JSON 对象：键为上面的复数键名，值为数组；不生成 id 字段。\n' +
        '3. 每条必须包含 name；数值字段量级与策划书数值设定保持一致。\n' +
        '4. 内容风格统一、可读，避免重复。\n' +
        '5. 补充要求：全部为 1-10 级\n' +
        '输出格式示例：{"roles": [{"name": "示例", "desc": "..."}], "skills": [...]}'
    )

    // 无补充要求时不出现第 5 条
    const withoutInstruction = buildDataGenPrompt(doc, BUILTIN_DATA_TYPES, selected, 5, '')
    expect(withoutInstruction.prompt).not.toContain('5. 补充要求')
    expect(withoutInstruction.prompt).toContain('4. 内容风格统一、可读，避免重复。\n输出格式示例')
  })
})

describe('ceshuDataGen 候选归一化与摘要', () => {
  const knownPlurals = new Set(BUILTIN_DATA_TYPES.map((type) => type.pluralKey))
  const selected = resolveSelectedDataTypes(BUILTIN_DATA_TYPES, ['roles', 'skills'])

  it('复数键优先、单数键兜底、非数组/非对象条目丢弃、剥离 id', () => {
    const result = normalizeDataGenCandidates(
      {
        roles: [{ id: 'ai-1', name: '剑客', job: '战士' }, { name: '弓手' }, 5, 'text'],
        skill: [{ name: '火球术', cooldown: 3 }],
        monsters: [{ name: '野猪' }]
      },
      selected,
      knownPlurals
    )
    expect(result.generatedCounts).toEqual({ roles: 2, skills: 1 })
    expect(result.total).toBe(3)
    expect(result.candidates).toEqual({
      roles: [
        { name: '剑客', job: '战士' },
        { name: '弓手' }
      ],
      skills: [{ name: '火球术', cooldown: 3 }]
    })
  })

  it('未知复数键不回退单数键；空桶不进入结果', () => {
    const ghost = resolveSelectedDataTypes(BUILTIN_DATA_TYPES, ['ghost'])
    const noFallback = normalizeDataGenCandidates({ ghost: [], ghosts: [{ name: 'X' }] }, ghost, knownPlurals)
    expect(noFallback.total).toBe(0)
    expect(noFallback.candidates).toEqual({})

    const unknownPluralFallback = normalizeDataGenCandidates(
      { ghosts: [{ name: 'X' }] },
      resolveSelectedDataTypes(BUILTIN_DATA_TYPES, ['ghosts']),
      knownPlurals
    )
    expect(unknownPluralFallback.candidates).toEqual({ ghosts: [{ name: 'X' }] })
  })

  it('非对象根 → 全部为空', () => {
    expect(normalizeDataGenCandidates(null, selected, knownPlurals)).toEqual({
      candidates: {},
      generatedCounts: {},
      total: 0
    })
    expect(normalizeDataGenCandidates([1, 2], selected, knownPlurals).total).toBe(0)
  })

  it('摘要：name + 前 3 个标量字段；遇 name 键即停；缺失 name 用「未命名」', () => {
    // 旧版 原实现遇 name 键即 break：name 通常排在第一，故摘要大多只有名字（忠实保留该行为）
    expect(summarizeCandidateItem({ name: '剑客', desc: 'D', level: 1, hp: 100, mp: 50 })).toBe('剑客')
    expect(summarizeCandidateItem({ name: '剑客', desc: 'D' })).toBe('剑客')
    // name 不在首位时，会先累积前面的标量字段再中断
    expect(summarizeCandidateItem({ desc: 'D', name: '剑客', level: 1 })).toBe('剑客    |    desc=D')
    expect(summarizeCandidateItem({ desc: 'D', level: 1 })).toBe('未命名    |    desc=D  level=1')
    expect(summarizeCandidateItem({ desc: '', level: 0, hidden: true })).toBe(
      '未命名    |    level=0  hidden=true'
    )
    expect(summarizeCandidateItem({})).toBe('未命名')
  })

  it('汇总文案（含分类计数）', () => {
    expect(buildDataGenSummaryMessage({ roles: 2, skills: 1 })).toBe(
      '已生成 3 条候选数据（roles:2、skills:1），请人工勾选导入。'
    )
  })

  it('技能类型提示可用于生成（角色/技能两类提示都在）', () => {
    const text = buildDataGenTypeHints(BUILTIN_DATA_TYPES, resolveSelectedDataTypes(BUILTIN_DATA_TYPES, ['roles', 'skills']))
    expect(text.split('\n')).toHaveLength(2)
    expect(text).toContain('- 技能（键: skills）：建议字段 ')
    expect(dataTypeFieldHints(skillDef).length).toBeGreaterThan(0)
  })
})