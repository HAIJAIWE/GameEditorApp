/**
 * 混合玩法预设市场纯逻辑（自 旧版 `core/ceshu/ceshu_constants::HYBRID_GAMEPLAY_PRESETS`
 * 与 `ui/ceshu/preset_market_dialog` 匹平迁移）：18 个「风格 + 主模块 + 副模块 + 推荐系统」预设、
 * 关键字筛选、风格徽章配色与「应用预设」（启用推荐系统 + 回填 meta.game_type）语义。
 * 注意：本模块为纯函数，不改动传入的策划书文档。
 */

import { SYSTEM_LABELS, type CeshuDocument, type ChapterData } from './ceshuConstants'
import { isPlainObject } from '../model/ceshuModel'

export interface HybridGameplayPreset {
  label: string
  style: string
  moduleType: string
  secondaryModules: string[]
  recommendedSystems: string[]
  highlight: string
}

/** 18 个预设，key 与顺序与 旧版 HYBRID_GAMEPLAY_PRESETS 完全一致 */
export const HYBRID_GAMEPLAY_PRESETS: Record<string, HybridGameplayPreset> = {
  xianxia_rpg: {
    label: '仙侠 RPG',
    style: 'xianxia',
    moduleType: 'rpg',
    secondaryModules: ['social'],
    recommendedSystems: ['character', 'battle', 'skill', 'equipment', 'growth', 'quest', 'item', 'social', 'economy'],
    highlight: '境界划分、宗门门派、法宝丹药、渡劫飞升'
  },
  xianxia_mmorpg: {
    label: '仙侠 MMORPG',
    style: 'xianxia',
    moduleType: 'mmorpg',
    secondaryModules: ['competitive'],
    recommendedSystems: [
      'character', 'battle', 'skill', 'equipment', 'growth',
      'quest', 'item', 'social', 'economy', 'content', 'customization', 'competitive'
    ],
    highlight: '万人宗门战、跨服斗法、法宝熔炼、仙魔阵营'
  },
  wuxia_slg: {
    label: '武侠 SLG',
    style: 'wuxia',
    moduleType: 'slg',
    secondaryModules: ['rpg'],
    recommendedSystems: ['character', 'social', 'economy', 'quest', 'content', 'battle', 'growth', 'equipment', 'item'],
    highlight: '江湖门派经营、武林盟主争夺、武功秘籍收集、势力版图'
  },
  scifi_fps: {
    label: '科幻 FPS',
    style: 'sci-fi',
    moduleType: 'fps',
    secondaryModules: ['rpg'],
    recommendedSystems: ['character', 'battle', 'equipment', 'competitive', 'growth', 'customization', 'social'],
    highlight: '机甲装备、能量护盾、外星战场、阵营对抗'
  },
  scifi_survival: {
    label: '末日生存',
    style: 'post_apoc',
    moduleType: 'survival',
    secondaryModules: ['sandbox'],
    recommendedSystems: ['character', 'item', 'equipment', 'content', 'growth', 'battle', 'skill', 'social', 'economy', 'quest'],
    highlight: '资源搜刮、庇护所建造、变异生物、避难所经营'
  },
  fantasy_arpg: {
    label: '奇幻 ARPG',
    style: 'fantasy',
    moduleType: 'arpg',
    secondaryModules: ['roguelike'],
    recommendedSystems: ['character', 'battle', 'skill', 'equipment', 'growth', 'item', 'quest', 'content', 'customization'],
    highlight: '龙与魔法、地牢探险、装备词缀、技能树'
  },
  modern_card: {
    label: '现代卡牌',
    style: 'realistic',
    moduleType: 'card',
    secondaryModules: ['rpg'],
    recommendedSystems: ['character', 'skill', 'item', 'gacha', 'economy', 'quest', 'social', 'competitive'],
    highlight: '卡组构筑、抽卡保底、天梯竞技、卡牌合成'
  },
  fantasy_moba: {
    label: '奇幻 MOBA',
    style: 'fantasy',
    moduleType: 'moba',
    secondaryModules: [],
    recommendedSystems: ['character', 'battle', 'skill', 'equipment', 'competitive', 'growth', 'customization'],
    highlight: '英雄设计、B/P 系统、匹配算法、皮肤系统'
  },
  steampunk_strategy: {
    label: '蒸汽朋克策略',
    style: 'steampunk',
    moduleType: 'strategy',
    secondaryModules: ['slg'],
    recommendedSystems: ['character', 'battle', 'social', 'economy', 'content', 'quest', 'growth', 'equipment', 'item'],
    highlight: '机械兵团、蒸汽科技树、资源争夺、领土扩张'
  },
  cyberpunk_rpg: {
    label: '赛博朋克 RPG',
    style: 'cyberpunk',
    moduleType: 'rpg',
    secondaryModules: ['fps'],
    recommendedSystems: ['character', 'battle', 'skill', 'equipment', 'growth', 'quest', 'item', 'social', 'customization'],
    highlight: '义体改造、黑客技能、企业阵营、夜之城探索'
  },
  dark_fantasy_roguelike: {
    label: '暗黑奇幻 Roguelike',
    style: 'dark',
    moduleType: 'roguelike',
    secondaryModules: ['arpg'],
    recommendedSystems: ['character', 'battle', 'skill', 'equipment', 'growth', 'item', 'content', 'quest'],
    highlight: '永久死亡、随机地牢、黑暗氛围、装备词缀随机'
  },
  modern_military_fps: {
    label: '现代军事 FPS',
    style: 'realistic',
    moduleType: 'fps',
    secondaryModules: ['competitive'],
    recommendedSystems: ['character', 'battle', 'equipment', 'competitive', 'social', 'customization', 'growth'],
    highlight: '真实武器、战术小队、排位赛、皮肤经济'
  },
  anime_openworld: {
    label: '二次元开放世界',
    style: 'anime',
    moduleType: 'open_world',
    secondaryModules: ['rpg', 'gacha'],
    recommendedSystems: [
      'character', 'battle', 'skill', 'equipment', 'growth',
      'quest', 'item', 'social', 'content', 'customization', 'economy'
    ],
    highlight: '大世界探索、角色抽卡、元素反应、剧情演出'
  },
  xianxia_card: {
    label: '修仙卡牌',
    style: 'xianxia',
    moduleType: 'card',
    secondaryModules: ['rpg'],
    recommendedSystems: ['character', 'skill', 'item', 'gacha', 'economy', 'quest', 'social', 'growth'],
    highlight: '仙人卡组、境界突破、宗门卡池、渡劫玩法'
  },
  post_apoc_tower_defense: {
    label: '末日塔防',
    style: 'post_apoc',
    moduleType: 'tower_defense',
    secondaryModules: ['survival'],
    recommendedSystems: ['character', 'item', 'equipment', 'content', 'battle', 'skill', 'growth', 'economy'],
    highlight: '废土防御塔、丧尸波次、资源管理、幸存者招募'
  },
  wuxia_arpg: {
    label: '武侠 ARPG',
    style: 'wuxia',
    moduleType: 'arpg',
    secondaryModules: ['rpg'],
    recommendedSystems: ['character', 'battle', 'skill', 'equipment', 'growth', 'quest', 'item', 'content', 'customization'],
    highlight: '武功连招、轻功攀爬、江湖剧情、神兵利器'
  },
  fantasy_slg: {
    label: '奇幻 SLG',
    style: 'fantasy',
    moduleType: 'slg',
    secondaryModules: ['rpg'],
    recommendedSystems: ['character', 'social', 'economy', 'quest', 'content', 'battle', 'growth', 'equipment', 'item'],
    highlight: '种族阵营、领地建设、魔法军团、王座争霸'
  },
  cyberpunk_moba: {
    label: '赛博 MOBA',
    style: 'cyberpunk',
    moduleType: 'moba',
    secondaryModules: ['fps'],
    recommendedSystems: ['character', 'battle', 'skill', 'equipment', 'competitive', 'growth', 'customization', 'social'],
    highlight: '义体英雄、技能组合、企业战队、霓虹地图'
  }
}

export const PRESET_KEYS: string[] = Object.keys(HYBRID_GAMEPLAY_PRESETS)

/** 风格徽章底色 */
export const PRESET_STYLE_BADGE_COLORS: Record<string, string> = {
  xianxia: '#9c27b0', // 紫
  wuxia: '#795548', // 棕
  'sci-fi': '#2196f3', // 蓝
  post_apoc: '#7e57c2', // 暗紫
  fantasy: '#4caf50', // 绿
  realistic: '#607d8b', // 灰蓝
  anime: '#ec407a', // 粉
  dark: '#424242', // 黑
  cyberpunk: '#00bcd4', // 青
  steampunk: '#a1887f' // 棕褐
}

/** 未命中风格时的默认徽章底色 */
export const PRESET_STYLE_BADGE_FALLBACK = '#757575'

export interface HybridPresetEntry extends HybridGameplayPreset {
  key: string
}

/** 搜索筛选：keyword 为空返回全部；否则对 label/style/moduleType/highlight/key 拼接后不区分大小写子串匹配 */
export function filterPresets(keyword: string): HybridPresetEntry[] {
  const kw = keyword.trim().toLowerCase()
  const entries: HybridPresetEntry[] = []
  for (const [key, preset] of Object.entries(HYBRID_GAMEPLAY_PRESETS)) {
    if (!kw) {
      entries.push({ key, ...preset })
      continue
    }
    const searchable = [preset.label, preset.style, preset.moduleType, preset.highlight, key].join(' ').toLowerCase()
    if (searchable.includes(kw)) entries.push({ key, ...preset })
  }
  return entries
}

/** 风格徽章底色：查表，未命中返回默认色 */
export function styleBadgeColor(style: string): string {
  return PRESET_STYLE_BADGE_COLORS[style] ?? PRESET_STYLE_BADGE_FALLBACK
}

/** 模块徽章文案：模块类型转大写 */
export function formatModuleBadge(moduleType: string): string {
  return moduleType.toUpperCase()
}

/** 卡片上最多展示的推荐系统个数 */
const RECOMMENDED_SYSTEMS_SHOWN = 6

/**
 * 推荐系统文案（对应 旧版：
 * `sys_names = [SYSTEM_LABELS.get(s, s) for s in rec_systems[:6]]`，
 * `if len(rec_systems) > 6: sys_text += f" 等 {len(rec_systems)} 项"`）：
 * 始终最多展示前 6 项（中文名用「、」连接），超过 6 项时追加「 等 N 项」（N=总数）。
 */
export function formatRecommendedSystems(preset: HybridGameplayPreset): string {
  const systems = preset.recommendedSystems
  const text = systems
    .slice(0, RECOMMENDED_SYSTEMS_SHOWN)
    .map((key) => SYSTEM_LABELS[key] ?? key)
    .join('、')
  return systems.length > RECOMMENDED_SYSTEMS_SHOWN ? `${text} 等 ${systems.length} 项` : text
}

/** 副模块文案：原始 key 用 ' + ' 连接（不做中文映射），无副模块返回空串 */
export function formatSecondaryModules(preset: HybridGameplayPreset): string {
  return preset.secondaryModules.join(' + ')
}

export interface PresetApplication {
  systems: ChapterData
  meta: ChapterData
  enabledCount: number
  gameTypeFilled: boolean
  preset: HybridGameplayPreset
  presetKey: string
}

/**
 * 应用预设：深拷贝 doc.systems / doc.meta，仅把「存在于 systems 且为普通对象且未启用」的推荐系统置为
 * enabled（不存在的不新增、已启用不重复计数）；meta.game_type 为空时写入 preset.moduleType。未知 key 返回 null。
 */
export function buildPresetApplication(doc: CeshuDocument, presetKey: string): PresetApplication | null {
  const preset = HYBRID_GAMEPLAY_PRESETS[presetKey]
  if (!preset) return null

  const systems = structuredClone(doc.systems)
  const meta = structuredClone(doc.meta)

  let enabledCount = 0
  for (const sysKey of preset.recommendedSystems) {
    const cfg = systems[sysKey]
    if (isPlainObject(cfg) && cfg.enabled !== true) {
      cfg.enabled = true
      enabledCount += 1
    }
  }

  let gameTypeFilled = false
  if (!meta.game_type) {
    meta.game_type = preset.moduleType
    gameTypeFilled = true
  }

  return { systems, meta, enabledCount, gameTypeFilled, preset, presetKey }
}