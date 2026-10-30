import { describe, expect, it } from 'vitest'

import { createDefaultCeshu, normalizeCeshu } from '../../src/shared/ceshu/ceshuModel'
import {
  V5_NEW_CHAPTER_KEYS,
  migrateV4ToV5,
  needsV4Migration
} from '../../src/shared/ceshu/ceshuMigration'

/** 一份典型的 v4.0（9 章）旧策划书 */
function makeV4Raw(): Record<string, unknown> {
  return {
    version: '4.0',
    ceshu_id: 'abcd1234',
    created_at: '2026-01-01 00:00:00',
    updated_at: '2026-01-01 00:00:00',
    meta: { game_name: '旧游戏', gdd_scope: 'full' },
    vision: {
      competitive_analysis: ['竞品甲', '竞品乙'],
      business_model: '买断制'
    },
    worldview: { character_network: [{ name: '张三' }] },
    systems: {
      battle: {
        enabled: true,
        name: '战斗',
        config: { damage_formula: 'ATK-DEF', turn_mode: 'turn_based', combat_pace: 'medium' }
      },
      economy: {
        enabled: true,
        name: '经济',
        config: {
          currency_types: '金币, 钻石',
          source_mechanisms: '任务奖励',
          inflation_control: '回收机制',
          payment_system: '内购',
          recharge_tiers: '6元, 30元',
          vip_system: false,
          season_pass: true
        }
      }
    },
    resources: {
      audio_assets: ['bgm1.mp3'],
      risk_matrix: [{ risk: 'A' }],
      contingency_plan: '备用方案',
      localization: ['zh-CN']
    },
    tech: { milestones: [{ name: 'M1' }] }
  }
}

describe('needsV4Migration', () => {
  it('version=4.0 → 需要迁移', () => {
    expect(needsV4Migration({ version: '4.0' })).toBe(true)
  })

  it('version=5.0 且 18 章齐全 → 不需要迁移', () => {
    expect(needsV4Migration(createDefaultCeshu({ scope: 'full' }) as unknown as Record<string, unknown>)).toBe(false)
  })

  it('任一新增章节缺失 → 需要迁移（逐个验证 9 章）', () => {
    for (const missing of V5_NEW_CHAPTER_KEYS) {
      const raw: Record<string, unknown> = { version: '5.0' }
      for (const key of V5_NEW_CHAPTER_KEYS) {
        if (key !== missing) raw[key] = {}
      }
      expect(needsV4Migration(raw)).toBe(true)
    }
  })

  it('无 version 但 18 章齐全 → 不需要迁移', () => {
    const doc = createDefaultCeshu({ scope: 'full' }) as unknown as Record<string, unknown>
    delete doc.version
    expect(needsV4Migration({ ...doc, version: undefined })).toBe(false)
  })
})

describe('migrateV4ToV5：新章补默认值 + 版本升级', () => {
  it('缺失的新 9 章补默认值，version 升为 5.0', () => {
    const migrated = migrateV4ToV5({ version: '4.0' })
    for (const key of V5_NEW_CHAPTER_KEYS) {
      expect(migrated[key]).toBeTypeOf('object')
    }
    expect(migrated.version).toBe('5.0')
    // 新章默认值取自 createDefaultChapters
    expect((migrated.combat as Record<string, unknown>).damage_formula).toBe('')
  })

  it('旧 9 章原样保留（不覆写、不删除旧字段）', () => {
    const migrated = migrateV4ToV5(makeV4Raw())
    const vision = migrated.vision as Record<string, unknown>
    expect(vision.competitive_analysis).toEqual(['竞品甲', '竞品乙'])
    expect(vision.business_model).toBe('买断制')
    const systems = migrated.systems as Record<string, Record<string, unknown>>
    expect((systems.battle.config as Record<string, unknown>).damage_formula).toBe('ATK-DEF')
  })
})

describe('migrateV4ToV5：全部派生规则', () => {
  const migrated = migrateV4ToV5(makeV4Raw())

  it('vision.competitive_analysis（字符串列表）→ market_analysis.competitors（对象列表）', () => {
    expect((migrated.market_analysis as Record<string, unknown>).competitors).toEqual([
      { name: '竞品甲', type: '', strengths: '', weaknesses: '', market_share: '' },
      { name: '竞品乙', type: '', strengths: '', weaknesses: '', market_share: '' }
    ])
  })

  it('vision.business_model 优先于 systems.economy.payment_system 写入 monetization.payment_model', () => {
    expect((migrated.monetization as Record<string, unknown>).payment_model).toBe('买断制')
  })

  it('worldview.character_network → story.npc_list', () => {
    expect((migrated.story as Record<string, unknown>).npc_list).toEqual([{ name: '张三' }])
  })

  it('systems.battle.config → combat（damage_formula / turn_mode→combat_mode / combat_pace）', () => {
    const combat = migrated.combat as Record<string, unknown>
    expect(combat.damage_formula).toBe('ATK-DEF')
    expect(combat.combat_mode).toBe('turn_based')
    expect(combat.combat_pace).toBe('medium')
  })

  it('systems.economy.config.currency_types（逗号字符串）→ economy.currency_types（对象列表）', () => {
    expect((migrated.economy as Record<string, unknown>).currency_types).toEqual([
      { name: '金币', source: '', sink: '', exchange_rate: '' },
      { name: '钻石', source: '', sink: '', exchange_rate: '' }
    ])
  })

  it('source_mechanisms → economy.source_sink；inflation_control → economy.inflation_control', () => {
    const economy = migrated.economy as Record<string, unknown>
    expect(economy.source_sink).toBe('任务奖励')
    expect(economy.inflation_control).toBe('回收机制')
  })

  it('recharge_tiers（逗号字符串）→ monetization.pricing_tiers（字符串列表）', () => {
    expect((migrated.monetization as Record<string, unknown>).pricing_tiers).toEqual(['6元', '30元'])
  })

  it('vip_system=false 仍转换（is not None 语义）→ 未启用；season_pass=true → 启用', () => {
    const monetization = migrated.monetization as Record<string, unknown>
    expect(monetization.vip_system).toBe('未启用')
    expect(monetization.season_pass).toBe('启用')
  })

  it('resources → audio.sfx_list / risk_handling / accessibility.language_list', () => {
    expect((migrated.audio as Record<string, unknown>).sfx_list).toEqual(['bgm1.mp3'])
    const risk = migrated.risk_handling as Record<string, unknown>
    expect(risk.risk_matrix).toEqual([{ risk: 'A' }])
    expect(risk.contingency_plan).toBe('备用方案')
    expect((migrated.accessibility as Record<string, unknown>).language_list).toEqual(['zh-CN'])
  })

  it('tech.milestones → mvp.milestones', () => {
    expect((migrated.mvp as Record<string, unknown>).milestones).toEqual([{ name: 'M1' }])
  })
})

describe('migrateV4ToV5：守卫与 旧版 真值语义', () => {
  it('目标已填时不覆写', () => {
    const raw = makeV4Raw()
    raw.combat = { damage_formula: '既有公式' }
    raw.market_analysis = { competitors: [{ name: '已有竞品' }] }
    const migrated = migrateV4ToV5(raw)
    expect((migrated.combat as Record<string, unknown>).damage_formula).toBe('既有公式')
    expect((migrated.market_analysis as Record<string, unknown>).competitors).toEqual([{ name: '已有竞品' }])
  })

  it('空数组 / 空串按 旧版 真值为假 → 不产生派生', () => {
    const raw: Record<string, unknown> = {
      version: '4.0',
      vision: { competitive_analysis: [], business_model: '' },
      worldview: { character_network: [] },
      tech: { milestones: [] }
    }
    const migrated = migrateV4ToV5(raw)
    expect((migrated.market_analysis as Record<string, unknown>).competitors).toEqual([])
    expect((migrated.monetization as Record<string, unknown>).payment_model).toBe('')
    expect((migrated.story as Record<string, unknown>).npc_list).toEqual([])
    expect((migrated.mvp as Record<string, unknown>).milestones).toEqual([])
  })

  it('幂等：对已迁移结果再跑一次不产生额外变化', () => {
    const once = migrateV4ToV5(makeV4Raw())
    const twice = migrateV4ToV5(once)
    expect(twice).toEqual(once)
  })
})

describe('normalizeCeshu 集成：v4 才迁移，v5 不误迁移', () => {
  it('v4.0 文档经 normalizeCeshu 加载 → 完成派生且 version=5.0', () => {
    const doc = normalizeCeshu(makeV4Raw())
    expect(doc.version).toBe('5.0')
    expect(doc.combat.damage_formula).toBe('ATK-DEF')
    expect((doc.market_analysis.competitors as Array<Record<string, unknown>>)[0].name).toBe('竞品甲')
    expect(doc.mvp.milestones).toEqual([{ name: 'M1' }])
    // 旧章保留
    expect(doc.vision.business_model).toBe('买断制')
  })

  it('v5 文档即使旧章有值也不触发迁移（防止把默认/旧值误填进新章）', () => {
    const v5 = createDefaultCeshu({ scope: 'full' })
    ;(v5.systems.battle as { config: Record<string, unknown> }).config.damage_formula = '不该被搬走'
    const reloaded = normalizeCeshu(structuredClone(v5))
    expect(reloaded.combat.damage_formula).toBe('')
    expect(reloaded.meta.game_name).toBe('')
  })
})
