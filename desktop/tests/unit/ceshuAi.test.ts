import { describe, expect, it } from 'vitest'

import {
  CHAPTER_GENERATION_HINTS,
  agentForChapter,
  buildChapterOrder,
  buildChapterPrompt,
  buildChapterPrompts,
  buildFullGeneratePlan,
  buildReviewMarkdown,
  buildReviewPrompts,
  buildReviewSummary,
  finalizeReview,
  filterGeneratedFields,
  getStyleGlossary,
  mapStyleLabelToKey,
  mapTypeLabelToKey,
  mergeChapterDraft,
  normalizeFullGenerateInput,
  parseReviewResponse,
  type CeshuAiReviewResult
} from '../../src/shared/ceshu/ceshuAi'
import { genreReviewProfile, reviewProbeFor } from '../../src/shared/ceshu/ceshuAiData'
import { parseLlmJson } from '../../src/shared/util/parseLlmJson'
import { CHAPTER_KEYS } from '../../src/shared/ceshu/ceshuConstants'
import { CESHU_CHAPTER_FIELDS } from '../../src/shared/ceshu/ceshuFields'
import { createDefaultCeshu, deriveRulesetId } from '../../src/shared/ceshu/ceshuModel'

describe('成稿反审（7 项三级判定，2026-10-26 由 5 维度评分改造）', () => {
  it('章节摘要：仅标量真值、【标签】+ key: value、每值截断 60 字', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.meta.game_name = '测试游戏'
    doc.meta.player_count = 0
    doc.vision.core_fantasy = 'x'.repeat(80)
    const summary = buildReviewSummary(doc)
    expect(summary).toContain('【文档信息】')
    expect(summary).toContain('game_name: 测试游戏')
    expect(summary).not.toContain('player_count') // 0 视为未填
    expect(summary).toContain(`core_fantasy: ${'x'.repeat(60)}`)
    expect(summary).not.toContain('x'.repeat(61))
  })

  it('空内容反审提示词：含 7 项追问 / 进度 / 校验数 / 严格 JSON 要求 / 规则集标识', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    for (const key of CHAPTER_KEYS) doc[key] = {}
    expect(buildReviewSummary(doc)).toBe('(策划书内容为空)')

    const built = buildReviewPrompts(doc, { progressTotal: 0.25, validationCount: 3 })
    expect(built.system).toContain('"findings"')
    expect(built.system).toContain('只输出 JSON')
    expect(built.system).toContain('blocker')
    expect(built.prompt).toContain('(策划书内容为空)')
    expect(built.prompt).toContain('完成进度: 25%')
    expect(built.prompt).toContain('内置校验问题数: 3')
    expect(built.prompt).toContain('规则集标识:')
  })

  it('解析：规范顺序 / level 兜底 pass / 标签兜底 / 建议补足 3 条', () => {
    const content = JSON.stringify({
      findings: [
        { key: 'ruleset', label: '同一规则集', level: 'BLOCKER', evidence: 'Demo 与正文口径不一致' },
        { key: 'constraints', level: 'suggestion', evidence: '少继承一条约束' },
        { key: 'numeric', level: '乱写', evidence: '无法识别' },
        { key: 'units', evidence: '缺 level 字段' }
      ],
      overall: '总体还行',
      suggestions: ['建议一', '建议二']
    })
    const payload = parseReviewResponse(content)
    expect(payload.parsed).toBe(true)
    expect(payload.findings.map((finding) => finding.key)).toEqual([
      'constraints',
      'choice',
      'numeric',
      'units',
      'lifecycle',
      'production',
      'ruleset'
    ])
    // level 大写归一化；非法 / 缺失一律兜底 pass
    expect(payload.findings.map((finding) => finding.level)).toEqual([
      'suggestion',
      'pass',
      'pass',
      'pass',
      'pass',
      'pass',
      'blocker'
    ])
    expect(payload.findings[0].label).toBe('约束与事实')
    expect(payload.findings[0].evidence).toBe('少继承一条约束')
    expect(payload.suggestions).toEqual(['建议一', '建议二', '（暂无更多建议）'])
    expect(payload.overall).toBe('总体还行')
  })

  it('finalizeReview 回填品类档案 / 规则集标识 / 品类追问', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.meta.game_type = '塔防'
    const payload = parseReviewResponse(JSON.stringify({ findings: [{ key: 'numeric', level: 'blocker', evidence: 'x' }] }))
    expect(payload.genreLabel).toBe('') // 解析层看不到文档，留空
    const finalized = finalizeReview(payload, doc)
    expect(finalized.genreLabel).toBe(genreReviewProfile('塔防').label)
    expect(finalized.rulesetId).toBe(deriveRulesetId(doc))
    // 追问按品类回填，与提示词同源
    const numeric = finalized.findings.find((finding) => finding.key === 'numeric')
    expect(numeric?.probe).toBe(reviewProbeFor('numeric', 'defense'))
  })

  it('解析：markdown 围栏与字符串建议容错；非法输出 parsed=false 且保留原文', () => {
    const fenced =
      '```json\n{"findings":[{"key":"numeric","level":"suggestion","evidence":"ok"}],"overall":"好","suggestions":"单一建议"}\n```'
    const payload = parseReviewResponse(fenced)
    expect(payload.parsed).toBe(true)
    expect(payload.findings.find((finding) => finding.key === 'numeric')?.level).toBe('suggestion')
    expect(payload.suggestions[0]).toBe('单一建议')
    expect(payload.suggestions).toHaveLength(3)

    const broken = parseReviewResponse('完全不是 JSON')
    expect(broken.parsed).toBe(false)
    expect(broken.rawText).toBe('完全不是 JSON')
    expect(broken.findings).toEqual([])
  })

  it('报告 Markdown：检查项表 / 竖线转义 / 阻塞·建议小结 / 进度与校验行', () => {
    const result: CeshuAiReviewResult = {
      model: 'test-model',
      parsed: true,
      rawText: '',
      progressTotal: 0.5,
      validationCount: 2,
      genreLabel: '动作 / 战斗导向',
      rulesetId: 'ceshu-x',
      overall: '总体结论',
      suggestions: ['A', 'B', 'C'],
      findings: [
        { key: 'numeric', label: '数值与可达性', level: 'blocker', probe: 'p', evidence: '依据|含竖线\n换行' },
        { key: 'units', label: '口径与单位', level: 'pass', probe: 'p', evidence: '' }
      ]
    }
    const markdown = buildReviewMarkdown('测试游戏', '2026-10-01 12:00:00', result)
    expect(markdown).toContain('# 成稿反审报告')
    expect(markdown).toContain('**游戏名称**: 测试游戏')
    expect(markdown).toContain('**品类**: 动作 / 战斗导向')
    expect(markdown).toContain('**规则集标识**: ceshu-x')
    expect(markdown).toContain('**结论**: 阻塞 1 项 · 建议 0 项')
    expect(markdown).toContain('| 数值与可达性 | 阻塞 | 依据\\|含竖线 换行 |')
    expect(markdown).toContain('## Top 3 改进建议')
    expect(markdown).toContain('1. A')
    expect(markdown).toContain('**策划书完成进度**: 50%')
    expect(markdown).toContain('**内置校验问题数**: 2')
  })
})

describe('AI 生成：子智能体路由与风格术语', () => {
  it('17 章均有路由与展示名；关键映射与章节提示语正确', () => {
    for (const chapter of CHAPTER_KEYS) {
      const agent = agentForChapter(chapter)
      expect(agent.displayName).not.toBe('')
      expect(agent.agentPrompt).not.toBe('')
    }
    expect(agentForChapter('combat').displayName).toBe('策划专家')
    expect(agentForChapter('story').displayName).toBe('文案写手')
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

describe('AI 生成：整章提示词组装', () => {
  it('整章模式：字段列表含全部键、含上下文与 JSON 输出要求', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    const built = buildChapterPrompt(doc, 'meta')

    // 字段清单 = 字段表 ∪ 数据键（schema 权威；顺序以字段表为准）
    expect(built.fields).toEqual([
      'game_name',
      'game_type',
      'game_type_tags',
      'platform',
      'positioning',
      'tags',
      'non_goals',
      'alternatives',
      'status',
      'confidentiality',
      'gdd_scope',
      'version',
      'date'
    ])
    expect(built.fields).toContain('game_name')
    expect(built.system).toContain('通用策划助手')
    expect(built.system).toContain('只输出 JSON')
    expect(built.prompt).toContain('游戏名称: 测试游戏')
    expect(built.prompt).toContain('该章节需要填充的字段列表:')
    expect(built.prompt).toContain('必须为字段列表中的每个字段都生成内容')
    // 写作规范：AI 可解析（列表统一 `- `）+ 人可读（先结论、短句、具体化）
    expect(built.prompt).toContain('写作规范')
    expect(built.prompt).toContain('单句尽量不超过 40 字')
    expect(built.prompt).toContain('列表统一用「- 」开头')
  })

  it('整章模式：无默认值的字段（可选/拆分/新导入）也进字段清单——模型看得见才生成', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    // numeric 的数据键只有 6 个，字段表有 9+（含 numeric_parameters/numeric_assertions）
    expect(Object.keys(doc.numeric)).not.toContain('numeric_parameters')
    const built = buildChapterPrompt(doc, 'numeric')
    expect(built.fields).toContain('numeric_parameters')
    expect(built.fields).toContain('numeric_assertions')
    expect(built.prompt).toContain('numeric_parameters')
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
    expect(built.prompt).toContain('写作规范')
  })

  it('补全模式：无空字段时字段列表为空（上层不再调用 LLM）', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const combat = doc.combat
    // 填满**字段表全部字段**（不只是数据键）才算真的无空缺
    for (const field of CESHU_CHAPTER_FIELDS.combat ?? []) {
      const head = field.key.split('.')[0]
      combat[head] = '已填内容'
    }
    expect(buildChapterPrompt(doc, 'combat', { onlyEmpty: true }).fields).toEqual([])
  })
})

describe('AI 生成：单字段定向生成', () => {
  it('onlyFields 收窄：fields 精确等于传入的字段列表（不取全章键）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    const built = buildChapterPrompt(doc, 'meta', { onlyFields: ['game_name'] })
    expect(built.fields).toEqual(['game_name'])
  })

  it('onlyFields 优先于 onlyEmpty：同时传 onlyEmpty 时仍以 onlyFields 为准', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    doc.meta.game_name = '已填游戏名'
    const built = buildChapterPrompt(doc, 'meta', { onlyEmpty: true, onlyFields: ['positioning'] })
    expect(built.fields).toEqual(['positioning'])
  })

  it('onlyFields 时 system 走单字段分支（含「仅生成下面列出的字段」，不含「完整内容」）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    const built = buildChapterPrompt(doc, 'meta', { onlyFields: ['game_name'] })
    expect(built.system).toContain('仅生成下面列出的字段')
    expect(built.system).not.toContain('完整内容')
  })

  it('onlyFields 时 prompt 导语为「生成以下单个字段」（区别于整章导语）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    const built = buildChapterPrompt(doc, 'meta', { onlyFields: ['game_name'] })
    expect(built.prompt).toContain('生成以下单个字段')
    expect(built.prompt).not.toContain('整章生成内容')
  })

  it('action 注入任务指令：四个动作各有针对性措辞；无动作时提示词零膨胀', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    const rewrite = buildChapterPrompt(doc, 'story', { onlyFields: ['main_plot'], action: 'rewrite' })
    expect(rewrite.prompt).toContain('【本次任务：改写】')
    expect(rewrite.prompt).toContain('不要新增或删除要点')

    const expand = buildChapterPrompt(doc, 'story', { onlyFields: ['main_plot'], action: 'expand' })
    expect(expand.prompt).toContain('【本次任务：展开】')
    expect(expand.prompt).toContain('补充具体的细节')

    const condense = buildChapterPrompt(doc, 'story', { onlyFields: ['main_plot'], action: 'condense' })
    expect(condense.prompt).toContain('【本次任务：精简】')
    expect(condense.prompt).toContain('压缩到原来的一半')

    const explain = buildChapterPrompt(doc, 'story', { onlyFields: ['main_plot'], action: 'explain' })
    expect(explain.prompt).toContain('【本次任务：通俗化】')
    expect(explain.prompt).toContain('白话解释')

    // 无 action：任何任务指令块都不出现（整章 / 补全 / 单字段三条路径都不该有）
    for (const options of [{}, { onlyEmpty: true }, { onlyFields: ['main_plot'] }]) {
      expect(buildChapterPrompt(doc, 'story', options).prompt).not.toContain('【本次任务')
    }
  })
})

describe('AI 生成：LLM 输出容错解析', () => {
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

describe('AI 全量生成：章节顺序与生成要求', () => {
  it('含市场/风险为 24 章，顺序与 旧版 一致（含 P2 扩展 7 章）', () => {
    expect(buildChapterOrder(true, true)).toEqual([
      'meta',
      'vision',
      'market_analysis',
      'story',
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
      'accessibility',
      'uiux',
      'level_design',
      'live_ops',
      'analytics',
      'qa',
      'publishing',
      'performance'
    ])
  })

  it('关闭市场/风险后为 22 章且位置正确', () => {
    const order = buildChapterOrder(false, false)
    expect(order).toHaveLength(22)
    expect(order).not.toContain('market_analysis')
    expect(order).not.toContain('risk_handling')
    expect(order[0]).toBe('meta')
    expect(order[1]).toBe('vision')
    expect(order[order.length - 1]).toBe('performance')
  })

  it('24 章生成要求文案齐全（抽查关键条目）', () => {
    for (const chapter of CHAPTER_KEYS) {
      expect(CHAPTER_GENERATION_HINTS[chapter].length).toBeGreaterThan(0)
    }
    expect(CHAPTER_GENERATION_HINTS.systems).toContain('enabled/config')
    expect(CHAPTER_GENERATION_HINTS.combat).toContain('伤害公式')
    expect(CHAPTER_GENERATION_HINTS.risk_handling).toContain('应急预案')
    // 一句话生成必须逼 AI 填实这两张最关键的机核验表（P0 #1/#2 在生成路径的闭环）
    expect(CHAPTER_GENERATION_HINTS.gameplay).toContain('状态机')
    expect(CHAPTER_GENERATION_HINTS.numeric).toContain('数值参数表')
    expect(CHAPTER_GENERATION_HINTS.numeric).toContain('数值断言')
  })
})

describe('AI 全量生成：计划组装', () => {
  const form = {
    gameName: '星河战记',
    gameType: 'RPG',
    style: '仙侠',
    description: '修真者探索三界',
    references: '原神, 艾尔登法环',
    platforms: ['PC', '移动端'],
    businessModel: 'F2P'
  }

  it('轻量档 = 文档信息段 + 核心 9 章（依赖顺序）；meta 种子与风格/类型映射正确', () => {
    const plan = buildFullGeneratePlan(form, { scope: 'lite', includeMarket: true, includeRisk: true })
    expect(plan.order).toEqual([
      'meta',
      'vision',
      'story',
      'gameplay',
      'combat',
      'systems',
      'economy',
      'numeric',
      'art',
      'audio'
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

  it('工业级档：市场/风险开关生效；每章提示词含【章节】【用户输入】【关键词与硬约束】【生成要求】', () => {
    const full = buildFullGeneratePlan(form, { scope: 'full', includeMarket: true, includeRisk: true })
    expect(full.order).toHaveLength(24)
    const prompt = full.chapterPrompts.systems ?? ''
    expect(prompt).toContain('【章节】第四章·游戏系统设计')
    expect(prompt).toContain('【用户输入】')
    expect(prompt).toContain('游戏名称: 星河战记')
    expect(prompt).toContain('概念描述: 修真者探索三界')
    expect(prompt).toContain('参考游戏: 原神, 艾尔登法环')
    expect(prompt).toContain('【关键词与硬约束】')
    expect(prompt).toContain('【生成要求】')
    expect(prompt).toContain('enabled/config')
    expect(prompt.endsWith('只输出 JSON。')).toBe(true)

    const noMarket = buildFullGeneratePlan(form, { scope: 'full', includeMarket: false, includeRisk: false })
    expect(noMarket.order).toHaveLength(22)
    expect(noMarket.chapterPrompts.market_analysis).toBeUndefined()
  })

  it('每章提示词注入结构化关键词 + 硬约束（一句话生成信号补足）', () => {
    const input = normalizeFullGenerateInput(form)
    const prompt = buildChapterPrompts(input, ['systems']).systems ?? ''
    // 风格术语表（仙侠 → xianxia，含渡劫/境界）
    expect(prompt).toContain('风格术语表(仙侠)')
    expect(prompt).toContain('渡劫')
    expect(prompt).toContain('境界划分')
    // 品类关键词 + 应含系统（RPG）
    expect(prompt).toContain('品类关键词(RPG)')
    expect(prompt).toContain('品类应含系统(RPG)')
    expect(prompt).toContain('战斗')
    // 平台硬约束（移动端点击区 44×44pt）
    expect(prompt).toContain('[平台·移动端]')
    expect(prompt).toContain('44×44pt')
    // 商业模式硬约束（F2P 保底）
    expect(prompt).toContain('[商业·F2P]')
    expect(prompt).toContain('保底')
    // 验收红线提示
    expect(prompt).toContain('验收红线')
  })

  it('无风格/类型/平台/商业时不注入空块（仅【关键词与硬约束】占位为「(无)」）', () => {
    const input = normalizeFullGenerateInput({
      gameName: 'x',
      gameType: '',
      style: '',
      description: '',
      references: '',
      platforms: '',
      businessModel: ''
    })
    const prompt = buildChapterPrompts(input, ['meta']).meta ?? ''
    expect(prompt).toContain('【关键词与硬约束】')
    expect(prompt).toContain('(无)')
    expect(prompt).not.toContain('风格术语表')
    expect(prompt).not.toContain('[平台·')
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
describe('AI 生成：禁编造约束（2026-10-23 体检后新增）', () => {
  it('整章与补全提示词都带禁编造段，且要点齐全', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    for (const options of [{}, { onlyEmpty: true }]) {
      const prompt = buildChapterPrompt(doc, 'market_analysis', options).prompt
      expect(prompt).toContain('禁编造（硬约束）')
      expect(prompt).toContain('竞品名、已上线游戏、引擎、IP、公司名必须是真实存在的')
      expect(prompt).toContain('「待确认」')
    }
  })

  it('单字段生成也带禁编造（外部 AI 提示词同源）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    const prompt = buildChapterPrompt(doc, 'market_analysis', { onlyFields: ['competitors'] }).prompt
    expect(prompt).toContain('禁编造（硬约束）')
  })
})
