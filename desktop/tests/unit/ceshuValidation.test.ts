import { describe, expect, it } from 'vitest'

import { chapterOrdinalCn, type CeshuDocument } from '../../src/shared/ceshuConstants'
import { createDefaultCeshu } from '../../src/shared/ceshuModel'
import { validateCeshu } from '../../src/shared/ceshuValidation'

function makeDoc(scope: 'full' | 'lite' = 'full'): CeshuDocument {
  return createDefaultCeshu({ scope })
}

/** 是否有错误包含指定片段 */
function hasError(errors: string[], fragment: string): boolean {
  return errors.some((error) => error.includes(fragment))
}

describe('策划书校验：必填字段（匹平 Python validate_ceshu）', () => {
  it('空文档：必填字段逐项报错（49 条，budget 默认 {} 不算空），无依赖错误', () => {
    const errors = validateCeshu(makeDoc())
    expect(errors).toHaveLength(49) // P2 后 24 章 47 必填 + 2 条依赖类（与旧口径的差集即新增 14 条）
    // game_name 是人定字段（名称须人决）：2026-10-23 起单独措辞，见下方专门用例
    expect(hasError(errors, "文档信息：字段 'game_name' 由人确定，尚未填写")).toBe(true)
    expect(hasError(errors, "第十六章·可访问性与本地化：字段 'accessibility_features' 为必填项")).toBe(true)
    // Python 语义：空字典 {} 不算空（第九章 budget 默认 {}，故不报错）
    expect(hasError(errors, "第九章·资源规划：字段 'budget' 为必填项")).toBe(false)
    expect(hasError(errors, '依赖缺失')).toBe(false)
  })

  it('人定必填字段（AI 不起草）缺失时报「由人确定」而非硬错误', () => {
    // 复刻演练发现：engine / main_npc_count 这类「人定 + 必填」字段被报成为
    // 必填项，但 AI 按契约永远不生成它们 ⇒ 错误无法通过生成消除、只能手填，
    // 却混在必填缺失里一起催人。故单独措辞（分组上落「其他（建议检查）」）。
    const doc = makeDoc()
    const errors = validateCeshu(doc)
    expect(hasError(errors, "第十章·技术规格：字段 'engine' 由人确定，尚未填写")).toBe(true)
    expect(hasError(errors, "第二章·世界观与角色：字段 'main_npc_count' 由人确定，尚未填写")).toBe(true)
    expect(hasError(errors, "第十章·技术规格：字段 'engine' 为必填项")).toBe(false)
  })

  it('lite 档只校验基础 9 章（22 条）', () => {
    const errors = validateCeshu(makeDoc('lite'))
    expect(errors).toHaveLength(22)
    expect(hasError(errors, '第十章')).toBe(false)
    expect(hasError(errors, '第十八章')).toBe(false)
  })

  it('必填字段填满后该项不再报错（空数组与 0 视为未填）', () => {
    const doc = makeDoc()
    doc.meta.game_name = '游戏'
    doc.meta.game_type = 'RPG'
    doc.meta.positioning = '定位'
    doc.meta.tags = []
    const errors = validateCeshu(doc)
    expect(hasError(errors, "文档信息：字段 'tags' 为必填项")).toBe(true)
    expect(hasError(errors, "文档信息：字段 'game_name' 为必填项")).toBe(false)
  })
})

describe('策划书校验：章节间一致性（11 项中的关键项）', () => {
  it('战斗模式与 systems.battle.config.turn_mode 冲突', () => {
    const doc = makeDoc()
    doc.combat.combat_mode = 'turn_based'
    ;(doc.systems.battle as { config: Record<string, unknown> }).config.turn_mode = 'realtime'
    expect(hasError(validateCeshu(doc), `一致性冲突：第${chapterOrdinalCn('combat')}章 combat.combat_mode='turn_based'`)).toBe(true)

    doc.combat.combat_mode = 'realtime'
    expect(hasError(validateCeshu(doc), '一致性冲突：第十二章')).toBe(false)
  })

  it('付费模式与 systems.economy.config.payment_system 冲突', () => {
    const doc = makeDoc()
    doc.monetization.payment_model = 'f2p'
    ;(doc.systems.economy as { config: Record<string, unknown> }).config.payment_system = 'p2p'
    expect(hasError(validateCeshu(doc), `一致性冲突：第${chapterOrdinalCn('monetization')}章 monetization.payment_model='f2p'`)).toBe(true)
  })

  it('两份风险矩阵：资源 TOP 风险未出现在十三章矩阵时警告，出现则不报', () => {
    const doc = makeDoc()
    doc.risk_handling.risk_matrix = ['进度风险']
    doc.resources.risk_matrix = ['技术风险']
    expect(hasError(validateCeshu(doc), 'TOP 风险未出现在第十三章矩阵：技术风险')).toBe(true)

    doc.resources.risk_matrix = ['进度风险']
    expect(hasError(validateCeshu(doc), 'TOP 风险未出现在')).toBe(false)
  })

  it('已设定阵营但 faction_system=none 时冲突', () => {
    const doc = makeDoc()
    doc.story.factions = ['联盟']
    ;(doc.systems.social as { config: Record<string, unknown> }).config.faction_system = 'none'
    expect(hasError(validateCeshu(doc), 'story.factions 已设定阵营')).toBe(true)
  })

  it('像素风美术 + 交响乐音乐警告；其他组合不报', () => {
    const doc = makeDoc()
    doc.art.art_style = '像素风'
    doc.audio.music_style = '交响乐'
    expect(hasError(validateCeshu(doc), '风格不协调')).toBe(true)

    doc.audio.music_style = '电子音乐'
    expect(hasError(validateCeshu(doc), '风格不协调')).toBe(false)
  })

  it('MVP 里程碑与技术里程碑不一致时警告；定价档位与充值档位比较兼容逗号字符串', () => {
    const doc = makeDoc()
    doc.mvp.milestones = [{ name: 'M1' }]
    doc.tech.milestones = [{ phase: 'P1' }]
    expect(hasError(validateCeshu(doc), `mvp.milestones 与 第${chapterOrdinalCn('tech')}章 tech.milestones 不一致`)).toBe(true)

    doc.monetization.pricing_tiers = ['6', '30']
    ;(doc.systems.economy as { config: Record<string, unknown> }).config.recharge_tiers = '6, 30'
    expect(hasError(validateCeshu(doc), 'monetization.pricing_tiers 与')).toBe(false)
    ;(doc.systems.economy as { config: Record<string, unknown> }).config.recharge_tiers = '6, 68'
    expect(hasError(validateCeshu(doc), 'monetization.pricing_tiers 与')).toBe(true)
  })

  it('语言列表与本地化资源不一致时警告', () => {
    const doc = makeDoc()
    doc.accessibility.language_list = ['简体中文', 'English']
    doc.resources.localization = ['简体中文']
    expect(hasError(validateCeshu(doc), `accessibility.language_list 与 第${chapterOrdinalCn('resources')}章`)).toBe(true)
  })

  it('NPC 数量与实际列表差异过大时警告（阈值 max(2, 20%)）', () => {
    const doc = makeDoc()
    doc.story.main_npc_count = 10
    doc.story.npc_list = [{ name: 'A' }, { name: 'B' }, { name: 'C' }]
    expect(hasError(validateCeshu(doc), 'npc_list 实际数量=3')).toBe(true)

    doc.story.main_npc_count = 4
    expect(hasError(validateCeshu(doc), 'npc_list 实际数量')).toBe(false)
  })

  it('货币类型名称集合不一致时警告；名称一致不报', () => {
    const doc = makeDoc()
    doc.economy.currency_types = [{ name: '金币' }, { name: '钻石' }]
    ;(doc.systems.economy as { config: Record<string, unknown> }).config.currency_types = '金币, 银币'
    expect(hasError(validateCeshu(doc), 'economy.currency_types 与')).toBe(true)

    ;(doc.systems.economy as { config: Record<string, unknown> }).config.currency_types = '钻石, 金币'
    expect(hasError(validateCeshu(doc), 'economy.currency_types 与')).toBe(false)
  })

  it('系统依赖缺失：启用 battle 未启用 character/skill 时报错，补齐依赖后通过', () => {
    const doc = makeDoc()
    ;(doc.systems.battle as { enabled: boolean }).enabled = true
    expect(hasError(validateCeshu(doc), `依赖缺失：第${chapterOrdinalCn('systems')}章 systems.battle 已启用，但其依赖系统 [character、skill] 未启用`)).toBe(true)

    ;(doc.systems.character as { enabled: boolean }).enabled = true
    ;(doc.systems.skill as { enabled: boolean }).enabled = true
    expect(hasError(validateCeshu(doc), '依赖缺失')).toBe(false)
  })
})
describe('策划书校验：内容质量提示（「写对」代理指标）', () => {
  /** 造一段「又长又空」的文本：空话密度 + 无数字 + 多行无列表结构 */
  const fluff = [
    '我们致力于打造丰富多样的游戏体验，深度融合多种玩法，为玩家带来极致体验。',
    '整体内容非常丰富多彩，融合了全方位创新性与高品质的制作水准，整体体验良好流畅。',
    '这样多样化的设计让游戏体验极丰富多样，深度融合各类元素，形成沉浸式体验。'
  ].join('\n')

  it('空话密度超标 → 报「内容质量提示」', () => {
    const doc = makeDoc()
    doc.vision.design_vision = fluff
    expect(validateCeshu(doc).some((item) => item.includes('内容质量提示') && item.includes('空话套话'))).toBe(true)
  })

  it('短文本/正常内容不误报', () => {
    const doc = makeDoc()
    doc.vision.design_vision = '做一款能让人沉浸的开放世界。'
    expect(validateCeshu(doc).some((item) => item.includes('内容质量提示'))).toBe(false)
  })

  it('结构化列表字段（stringList/pipeList）不要求「- 」列表结构', () => {
    const doc = makeDoc()
    // npc_list 是 pipeList：值是对象数组，本就不该有「- 」前缀
    doc.story.npc_list = [
      { name: '甲', role: '导师', location: '村庄', personality: '温和', quest_hook: '引导任务' },
      { name: '乙', role: '商人', location: '集市', personality: '精明', quest_hook: '交易任务' },
      { name: '丙', role: '卫兵', location: '城门', personality: '严肃', quest_hook: '警戒任务' }
    ]
    expect(validateCeshu(doc).some((item) => item.includes('NPC 列表') && item.includes('列表结构'))).toBe(false)
  })
})
