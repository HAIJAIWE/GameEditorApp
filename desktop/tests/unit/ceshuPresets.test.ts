import { describe, expect, it } from 'vitest'

import { createDefaultCeshu } from '../../src/shared/ceshuModel'
import {
  HYBRID_GAMEPLAY_PRESETS,
  PRESET_KEYS,
  PRESET_STYLE_BADGE_COLORS,
  PRESET_STYLE_BADGE_FALLBACK,
  buildPresetApplication,
  filterPresets,
  formatModuleBadge,
  formatRecommendedSystems,
  formatSecondaryModules,
  styleBadgeColor
} from '../../src/shared/ceshu/ceshuPresets'

type SystemMap = Record<string, { enabled: boolean }>

describe('ceshuPresets 预设数据', () => {
  it('共 18 个预设，首项 xianxia_rpg、末项 cyberpunk_moba，顺序与 Python 一致', () => {
    expect(PRESET_KEYS).toHaveLength(18)
    expect(PRESET_KEYS[0]).toBe('xianxia_rpg')
    expect(PRESET_KEYS[17]).toBe('cyberpunk_moba')
    expect(Object.keys(HYBRID_GAMEPLAY_PRESETS)).toEqual(PRESET_KEYS)
  })

  it('xianxia_rpg 逐字段一致', () => {
    expect(HYBRID_GAMEPLAY_PRESETS.xianxia_rpg).toEqual({
      label: '仙侠 RPG',
      style: 'xianxia',
      moduleType: 'rpg',
      secondaryModules: ['social'],
      recommendedSystems: ['character', 'battle', 'skill', 'equipment', 'growth', 'quest', 'item', 'social', 'economy'],
      highlight: '境界划分、宗门门派、法宝丹药、渡劫飞升'
    })
  })

  it('anime_openworld 逐字段一致（含两个副模块）', () => {
    expect(HYBRID_GAMEPLAY_PRESETS.anime_openworld).toEqual({
      label: '二次元开放世界',
      style: 'anime',
      moduleType: 'open_world',
      secondaryModules: ['rpg', 'gacha'],
      recommendedSystems: [
        'character', 'battle', 'skill', 'equipment', 'growth',
        'quest', 'item', 'social', 'content', 'customization', 'economy'
      ],
      highlight: '大世界探索、角色抽卡、元素反应、剧情演出'
    })
  })
})

describe('ceshuPresets 搜索筛选', () => {
  it('空关键字返回全部 18 条', () => {
    expect(filterPresets('')).toHaveLength(18)
    expect(filterPresets('   ')).toHaveLength(18)
  })

  it('中文与英文关键字均不区分大小写子串匹配', () => {
    expect(filterPresets('仙侠').map((entry) => entry.key)).toEqual(['xianxia_rpg', 'xianxia_mmorpg'])
    expect(filterPresets('cyberpunk').map((entry) => entry.key)).toEqual(['cyberpunk_rpg', 'cyberpunk_moba'])
    expect(filterPresets('moba').map((entry) => entry.key)).toEqual(['fantasy_moba', 'cyberpunk_moba'])
    expect(filterPresets('FPS').map((entry) => entry.key)).toEqual(['scifi_fps', 'modern_military_fps'])
    expect(filterPresets('不存在xyz')).toHaveLength(0)
  })

  it('结果条目携带 key 且保留预设字段', () => {
    const entries = filterPresets('修仙卡牌')
    expect(entries).toHaveLength(1)
    expect(entries[0].key).toBe('xianxia_card')
    expect(entries[0].moduleType).toBe('card')
  })
})

describe('ceshuPresets 徽章与文案', () => {
  it('风格徽章底色查表，未命中返回默认色', () => {
    expect(PRESET_STYLE_BADGE_COLORS.xianxia).toBe('#9c27b0')
    expect(Object.keys(PRESET_STYLE_BADGE_COLORS)).toHaveLength(10)
    expect(styleBadgeColor('xianxia')).toBe('#9c27b0')
    expect(styleBadgeColor('unknown-style')).toBe(PRESET_STYLE_BADGE_FALLBACK)
    expect(PRESET_STYLE_BADGE_FALLBACK).toBe('#757575')
  })

  it('模块徽章转大写', () => {
    expect(formatModuleBadge('rpg')).toBe('RPG')
    expect(formatModuleBadge('open_world')).toBe('OPEN_WORLD')
  })

  it('推荐系统文案：始终取前 6 项，超过 6 项追加「 等 N 项」（照抄 Python rec_systems[:6]）', () => {
    expect(formatRecommendedSystems(HYBRID_GAMEPLAY_PRESETS.xianxia_rpg)).toBe(
      '角色、战斗、技能、装备、成长、任务 等 9 项'
    )
    expect(formatRecommendedSystems(HYBRID_GAMEPLAY_PRESETS.xianxia_mmorpg)).toBe(
      '角色、战斗、技能、装备、成长、任务 等 12 项'
    )
    // 内置 18 个预设的推荐系统都超过 6 项，用合成预设覆盖「不追加」分支
    expect(
      formatRecommendedSystems({
        label: '示例',
        style: 'x',
        moduleType: 'x',
        secondaryModules: [],
        recommendedSystems: ['character', 'battle'],
        highlight: ''
      })
    ).toBe('角色、战斗')
  })

  it('副模块文案：多个用 + 连接，无副模块返回空串', () => {
    expect(formatSecondaryModules(HYBRID_GAMEPLAY_PRESETS.anime_openworld)).toBe('rpg + gacha')
    expect(formatSecondaryModules(HYBRID_GAMEPLAY_PRESETS.fantasy_moba)).toBe('')
  })
})

describe('ceshuPresets 应用预设', () => {
  it('xianxia_rpg：启用 9 个推荐系统、回填 game_type，且不改动原文档', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const applied = buildPresetApplication(doc, 'xianxia_rpg')
    expect(applied).not.toBeNull()
    if (!applied) throw new Error('unreachable')

    expect(applied.enabledCount).toBe(9)
    expect(applied.gameTypeFilled).toBe(true)
    expect(applied.presetKey).toBe('xianxia_rpg')
    expect(applied.preset).toBe(HYBRID_GAMEPLAY_PRESETS.xianxia_rpg)

    const systems = applied.systems as SystemMap
    expect(systems.character.enabled).toBe(true)
    expect(systems.competitive.enabled).toBe(false)
    expect(applied.meta.game_type).toBe('rpg')

    // 原文档不可变
    const originalSystems = doc.systems as SystemMap
    expect(originalSystems.character.enabled).toBe(false)
    expect(doc.meta.game_type).toBe('')
  })

  it('对已应用结果再次应用：0 个新增启用、不重复回填', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const first = buildPresetApplication(doc, 'xianxia_rpg')
    if (!first) throw new Error('unreachable')

    const appliedDoc = { ...doc, systems: first.systems, meta: first.meta }
    const second = buildPresetApplication(appliedDoc, 'xianxia_rpg')
    expect(second).not.toBeNull()
    if (!second) throw new Error('unreachable')
    expect(second.enabledCount).toBe(0)
    expect(second.gameTypeFilled).toBe(false)
    expect(second.meta.game_type).toBe('rpg')
  })

  it('未知 presetKey 返回 null', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    expect(buildPresetApplication(doc, 'not_a_preset')).toBeNull()
  })

  it('fantasy_moba：7 项推荐系统、game_type=moba、无副模块', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const applied = buildPresetApplication(doc, 'fantasy_moba')
    expect(applied).not.toBeNull()
    if (!applied) throw new Error('unreachable')
    expect(applied.enabledCount).toBe(7)
    expect(applied.meta.game_type).toBe('moba')
    expect(formatSecondaryModules(applied.preset)).toBe('')
  })
})