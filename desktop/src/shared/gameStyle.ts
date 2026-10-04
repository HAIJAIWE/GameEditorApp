/**
 * 游戏风格术语管理器 —— 移植自 Python `src/core/style_manager.py`。
 *
 * 数据来源 `data/templates/game_styles.json`（6 个风格 / 每个 46 个概念键，**6 风格键集完全一致**），
 * 按概念把标签里的任意风格术语 / 常见简写替换为目标风格的对应术语。
 * 例如：目标=仙侠时 "生命加成%" → "气血加成%"；目标=科幻时 → "HP加成%"。
 *
 * **数据是内联常量而非运行时读盘**（与 `ceshuPresets`/`glossaryTerms` 等既有迁移一致）：
 * 这样渲染层与主进程都能直接用，且不引入 fs 依赖。内联内容已与 JSON 逐字段核对一致。
 *
 * 与 Python 的语义对齐要点：
 * - 只迁移 `GameStyle` dataclass 的 6 个字段。JSON 里的 `color_palette` /
 *   `data_defs_example` 在 Python `load_styles` 中**不被读取**，因此这里也不进
 *   `GameStyleDef`——否则 `buildReplacementPairs` 会把颜色键值当成术语，产生
 *   Python 不存在的替换对。
 * - `_CONCEPT_ALIASES` 顺序与内容一字不差照抄。
 * - `resolveLabel` 中的替换是 **全部替换**：Python `str.replace` 会替换所有
 *   出现位置，故这里用 `split(source).join(target)`（而非 `String.replace`，
 *   后者只替换第一处），以匹配 Python 行为。
 *
 * 有意偏离（Python → TS）：
 * - Python `StyleManager` 是单例，内部持有可变状态 `_active_style`。TS 端
 *   **不保留任何模块级可变状态**（便于测试与 React 状态管理），活跃风格由调用方
 *   （React state）持有，因此所有需要风格的函数都把 `styleId` 作为必填参数。
 *   不做 fs / IPC / React 依赖，也不导出单例。
 * - `loadGameStyle` / `saveGameStyle` 采用 `settingsStore.ts` 的 `StorageLike` + 可选注入模式
 *   （Node 下无 localStorage 时静默处理）。Python 的活跃风格**不持久化**（进程内单例，重启即丢）；
 *   此处落 localStorage 属有意增强，避免重载后标签"莫名"变回原始术语。
 */

import type { StorageLike } from './settingsStore'
import { defaultSettingsStorage } from './settingsStore'

export interface GameStyleDef {
  id: string
  name: string
  description: string
  terminology: Readonly<Record<string, string>>
  worldviewKeywords: readonly string[]
  narrativeStyle: string
}

/**
 * 照抄 game_styles.json 的 6 个风格，顺序一致：
 * xianxia, scifi, fantasy, wuxia, modern, pixel。
 * 仅含 Python dataclass 的 6 个字段（不含 color_palette / data_defs_example）。
 */
export const GAME_STYLES: readonly GameStyleDef[] = [
  {
    id: 'xianxia',
    name: '仙侠',
    description: '东方修仙题材，以天道轮回、飞升渡劫为核心',
    terminology: {
      hp: '气血',
      mp: '灵力',
      attack: '攻击',
      defense: '根骨',
      speed: '身法',
      level: '境界',
      exp: '修为',
      skill: '功法',
      equip: '法宝',
      item: '灵材',
      buff: '增益',
      debuff: '减益',
      monster: '妖兽',
      boss: '大妖',
      quest: '历练',
      currency_primary: '灵石',
      currency_premium: '元宝',
      guild: '宗门',
      party: '道侣',
      class: '门派',
      talent: '天赋',
      strengthen: '强化',
      evolve: '突破',
      summon: '召唤',
      shop: '坊市',
      stage: '秘境',
      bag: '储物袋',
      save: '存档',
      team: '道友',
      pvp: '斗法',
      pve: '历练',
      drop: '掉落',
      craft: '炼器',
      enchant: '附灵',
      upgrade: '升阶',
      rank: '品阶',
      quality: '品质',
      rarity: '稀有度',
      cooldown: '冷却',
      cost: '消耗',
      damage: '伤害',
      heal: '治疗',
      shield: '护盾',
      critical: '暴击',
      dodge: '闪避',
      hit: '命中'
    },
    worldviewKeywords: ['修仙', '飞升', '渡劫', '灵气', '天道', '仙界', '魔界', '人界'],
    narrativeStyle: '仙侠修真，以天道轮回为核心冲突，强调境界突破与因果循环'
  },
  {
    id: 'scifi',
    name: '科幻',
    description: '未来科技题材，以星际探索、赛博朋克为核心',
    terminology: {
      hp: 'HP',
      mp: '能量',
      attack: '火力',
      defense: '护甲',
      speed: '机动',
      level: '等级',
      exp: '经验值',
      skill: '技能',
      equip: '装备',
      item: '物资',
      buff: '增益',
      debuff: '减益',
      monster: '敌对单位',
      boss: 'BOSS',
      quest: '任务',
      currency_primary: '信用点',
      currency_premium: '钻石',
      guild: '军团',
      party: '小队',
      class: '职业',
      talent: '天赋',
      strengthen: '强化',
      evolve: '进化',
      summon: '部署',
      shop: '商店',
      stage: '关卡',
      bag: '仓库',
      save: '存档',
      team: '编队',
      pvp: '对战',
      pve: '副本',
      drop: '掉落',
      craft: '制造',
      enchant: '改装',
      upgrade: '升级',
      rank: '军衔',
      quality: '品质',
      rarity: '稀有度',
      cooldown: '冷却',
      cost: '消耗',
      damage: '伤害',
      heal: '修复',
      shield: '护盾',
      critical: '暴击',
      dodge: '闪避',
      hit: '命中'
    },
    worldviewKeywords: ['星际', '赛博', 'AI', '基因', '量子', '殖民', '异星', '机械'],
    narrativeStyle: '科幻未来，以科技与人性冲突为核心，强调探索与生存'
  },
  {
    id: 'fantasy',
    name: '奇幻',
    description: '西方魔幻题材，以魔法、种族、龙为核心',
    terminology: {
      hp: '生命值',
      mp: '魔力',
      attack: '攻击力',
      defense: '防御力',
      speed: '速度',
      level: '等级',
      exp: '经验值',
      skill: '技能',
      equip: '装备',
      item: '道具',
      buff: '增益',
      debuff: '减益',
      monster: '魔物',
      boss: '首领',
      quest: '任务',
      currency_primary: '金币',
      currency_premium: '宝石',
      guild: '公会',
      party: '队伍',
      class: '职业',
      talent: '天赋',
      strengthen: '强化',
      evolve: '进化',
      summon: '召唤',
      shop: '商店',
      stage: '关卡',
      bag: '背包',
      save: '存档',
      team: '队伍',
      pvp: '竞技',
      pve: '冒险',
      drop: '掉落',
      craft: '锻造',
      enchant: '附魔',
      upgrade: '升级',
      rank: '段位',
      quality: '品质',
      rarity: '稀有度',
      cooldown: '冷却',
      cost: '消耗',
      damage: '伤害',
      heal: '治疗',
      shield: '护盾',
      critical: '暴击',
      dodge: '闪避',
      hit: '命中'
    },
    worldviewKeywords: ['魔法', '龙', '精灵', '矮人', '圣光', '暗影', '王国', '冒险'],
    narrativeStyle: '西方奇幻，以光明与黑暗对抗为核心，强调英雄成长与史诗冒险'
  },
  {
    id: 'wuxia',
    name: '武侠',
    description: '传统武侠题材，以江湖恩怨、武功秘籍为核心',
    terminology: {
      hp: '内力',
      mp: '真气',
      attack: '武力',
      defense: '内功',
      speed: '轻功',
      level: '功力',
      exp: '历练',
      skill: '武功',
      equip: '兵器',
      item: '丹药',
      buff: '增益',
      debuff: '减益',
      monster: '恶人',
      boss: '高手',
      quest: '行侠',
      currency_primary: '银两',
      currency_premium: '元宝',
      guild: '帮派',
      party: '结义',
      class: '门派',
      talent: '资质',
      strengthen: '修炼',
      evolve: '突破',
      summon: '召唤',
      shop: '客栈',
      stage: '关卡',
      bag: '包裹',
      save: '存档',
      team: '侠侣',
      pvp: '比武',
      pve: '闯荡',
      drop: '掉落',
      craft: '锻造',
      enchant: '淬炼',
      upgrade: '升阶',
      rank: '排名',
      quality: '品质',
      rarity: '稀有度',
      cooldown: '冷却',
      cost: '消耗',
      damage: '伤害',
      heal: '疗伤',
      shield: '护体',
      critical: '暴击',
      dodge: '闪避',
      hit: '命中'
    },
    worldviewKeywords: ['江湖', '恩怨', '武功', '秘籍', '侠义', '正邪', '门派', '比武'],
    narrativeStyle: '传统武侠，以江湖恩怨为核心，强调侠义精神与武学追求'
  },
  {
    id: 'modern',
    name: '现代',
    description: '现代都市题材，以日常生活、竞技对抗为核心',
    terminology: {
      hp: '体力',
      mp: '精力',
      attack: '攻击',
      defense: '防御',
      speed: '速度',
      level: '等级',
      exp: '经验',
      skill: '技能',
      equip: '装备',
      item: '道具',
      buff: '增益',
      debuff: '减益',
      monster: '对手',
      boss: '强敌',
      quest: '任务',
      currency_primary: '金币',
      currency_premium: '钻石',
      guild: '俱乐部',
      party: '队伍',
      class: '职业',
      talent: '天赋',
      strengthen: '强化',
      evolve: '进化',
      summon: '招募',
      shop: '商店',
      stage: '关卡',
      bag: '背包',
      save: '存档',
      team: '队伍',
      pvp: '对战',
      pve: '挑战',
      drop: '掉落',
      craft: '制作',
      enchant: '改装',
      upgrade: '升级',
      rank: '段位',
      quality: '品质',
      rarity: '稀有度',
      cooldown: '冷却',
      cost: '消耗',
      damage: '伤害',
      heal: '回复',
      shield: '护盾',
      critical: '暴击',
      dodge: '闪避',
      hit: '命中'
    },
    worldviewKeywords: ['都市', '竞技', '校园', '职场', '运动', '音乐', '美食', '冒险'],
    narrativeStyle: '现代都市，以现实生活为核心，强调成长与社交'
  },
  {
    id: 'pixel',
    name: '像素/复古',
    description: '像素风格，以经典游戏体验为核心',
    terminology: {
      hp: 'HP',
      mp: 'MP',
      attack: 'ATK',
      defense: 'DEF',
      speed: 'SPD',
      level: 'LV',
      exp: 'EXP',
      skill: '技能',
      equip: '装备',
      item: '道具',
      buff: 'BUFF',
      debuff: 'DEBUFF',
      monster: '怪物',
      boss: 'BOSS',
      quest: '任务',
      currency_primary: '金币',
      currency_premium: '钻石',
      guild: '公会',
      party: '队伍',
      class: '职业',
      talent: '天赋',
      strengthen: '强化',
      evolve: '进化',
      summon: '召唤',
      shop: '商店',
      stage: '关卡',
      bag: '背包',
      save: '存档',
      team: '队伍',
      pvp: 'PVP',
      pve: 'PVE',
      drop: '掉落',
      craft: '合成',
      enchant: '附魔',
      upgrade: '升级',
      rank: '排名',
      quality: '品质',
      rarity: '稀有度',
      cooldown: 'CD',
      cost: '消耗',
      damage: '伤害',
      heal: '回复',
      shield: '护盾',
      critical: '暴击',
      dodge: '闪避',
      hit: '命中'
    },
    worldviewKeywords: ['冒险', '地下城', '勇者', '魔王', '宝藏', '迷宫', '符文', '神器'],
    narrativeStyle: '经典冒险，以勇者斗恶龙为核心，强调探索与成长'
  }
]

/**
 * 概念别名 —— 字段标签中常用的简写形式，映射到 game_styles.json 的概念 key。
 * 这些简写会被当作额外的源术语参与替换。顺序与内容照抄 Python `_CONCEPT_ALIASES`。
 */
export const CONCEPT_ALIASES: Readonly<Record<string, readonly string[]>> = {
  hp: ['生命', '生命值', '血量', '体力'],
  mp: ['法力', '魔力', '蓝量', '灵力'],
  attack: ['攻击', '攻击力', '火力', '物理攻击'],
  defense: ['防御', '防御力', '护甲', '根骨'],
  speed: ['速度', '身法', '机动'],
  level: ['等级', '境界'],
  exp: ['经验', '修为', '经验值'],
  skill: ['技能', '功法'],
  equip: ['装备', '法宝'],
  item: ['道具', '灵材', '物资'],
  monster: ['怪物', '妖兽', '敌对单位'],
  boss: ['首领', '大妖', 'BOSS'],
  quest: ['任务', '历练'],
  guild: ['公会', '宗门', '军团'],
  currency_primary: ['金币', '灵石', '信用点'],
  currency_premium: ['钻石', '元宝'],
  critical: ['暴击'],
  dodge: ['闪避'],
  hit: ['命中'],
  cooldown: ['冷却'],
  damage: ['伤害'],
  heal: ['治疗'],
  shield: ['护盾']
}

export const ACTIVE_GAME_STYLE_STORAGE_KEY = 'mb.gameStyle'

/** 取默认 storage（复用 `settingsStore` 的单一真源；Node / 主进程下可能不存在 → null） */
function defaultStorage(): StorageLike | null {
  return defaultSettingsStorage()
}

/** 按 id 取风格；不存在返回 undefined */
export function getStyle(id: string): GameStyleDef | undefined {
  return GAME_STYLES.find((style) => style.id === id)
}

/** 返回 {style_id: style_name} 映射（按 GAME_STYLES 顺序） */
export function listStyleNames(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const style of GAME_STYLES) out[style.id] = style.name
  return out
}

/** 获取指定风格的术语映射表（副本）；风格不存在或 id 为空 → {} */
export function getTerminology(styleId: string): Record<string, string> {
  const style = getStyle(styleId)
  return style ? { ...style.terminology } : {}
}

/**
 * 构建跨风格术语映射表：{concept: {styleId: term}}。
 *
 * 插入顺序与 Python 一致：外层按 GAME_STYLES 顺序遍历，内层按每个风格的
 * terminology 键顺序；concept 首次出现时按首次出现的顺序插入。
 */
export function buildCrossStyleMap(): Record<string, Record<string, string>> {
  const cross: Record<string, Record<string, string>> = {}
  for (const style of GAME_STYLES) {
    for (const [concept, term] of Object.entries(style.terminology)) {
      // 用 Object.hasOwn 而非 `concept in cross`：后者对 'constructor'/'toString' 等
      // 原型链上的键会误判为已存在，赋值会落到 Object.prototype 上（原型污染）
      if (!Object.hasOwn(cross, concept)) cross[concept] = {}
      cross[concept][style.id] = term
    }
  }
  return cross
}

/**
 * 构建替换对列表 (源术语, 目标术语)。
 *
 * 两部分：① 跨风格术语（cross_map）；② 概念别名简写。
 * 最后按源术语长度降序**稳定**排序（JS `sort` 稳定，等长保持插入顺序，
 * 与 Python `list.sort(key=...)` 一致）。targetId 未知 / 为空 → []。
 */
export function buildReplacementPairs(targetId: string): Array<[string, string]> {
  const target = getStyle(targetId)
  if (!target) return []

  const cross = buildCrossStyleMap()
  const pairs: Array<[string, string]> = []

  // 1. 从 game_styles.json 的术语构建替换对
  for (const styleTerms of Object.values(cross)) {
    const targetTerm = styleTerms[targetId]
    if (!targetTerm) continue
    for (const [otherSid, otherTerm] of Object.entries(styleTerms)) {
      if (otherSid !== targetId && otherTerm && otherTerm !== targetTerm) {
        pairs.push([otherTerm, targetTerm])
      }
    }
  }

  // 2. 从概念别名添加替换对
  for (const [concept, aliases] of Object.entries(CONCEPT_ALIASES)) {
    const targetTerm = target.terminology[concept]
    if (!targetTerm) continue
    for (const alias of aliases) {
      if (alias !== targetTerm) pairs.push([alias, targetTerm])
    }
  }

  // 按源术语长度降序排序，避免短术语先匹配
  pairs.sort((a, b) => b[0].length - a[0].length)
  return pairs
}

/**
 * 根据目标风格替换标签中的术语。
 *
 * 会把标签中出现的任何风格术语或常见简写替换为目标风格的对应术语。
 * 例：目标=仙侠 "生命加成%" → "气血加成%"，"法力加成%" → "灵力加成%"；
 *     目标=科幻 "生命加成%" → "HP加成%"，"法力加成%" → "能量加成%"。
 *
 * 注意：替换为**全部替换**（Python `str.replace` 语义），故用 split/join。
 */
export function resolveLabel(label: string, styleId: string): string {
  if (!label || !styleId) return label

  const target = getStyle(styleId)
  if (!target || Object.keys(target.terminology).length === 0) return label

  const replacements = buildReplacementPairs(styleId)
  let result = label
  for (const [source, replacement] of replacements) {
    if (result.includes(source)) {
      // Python str.replace 替换所有出现位置（非 String.replace 的首个）
      result = result.split(source).join(replacement)
    }
  }
  return result
}

/** 解析字段标签（去掉尾部单个冒号再处理，之后拼回冒号） */
export function resolveFieldLabel(fieldLabel: string, styleId: string): string {
  if (!fieldLabel) return fieldLabel

  let suffix = ''
  let label = fieldLabel
  if (label.endsWith(':')) {
    suffix = ':'
    label = label.slice(0, -1)
  }

  return resolveLabel(label, styleId) + suffix
}

/**
 * 从文本推断游戏风格。
 *
 * 每个风格：worldview_keywords 命中 +2 / 个，terminology 值命中 +1 / 个。
 * 只保留 score>0；取最高分（平分取先出现的，用严格 > 比较）；
 * 最高分 < 2 → ''。空文本 → ''。
 */
export function inferStyleFromText(text: string): string {
  if (!text) return ''

  let bestId = ''
  let bestScore = 0
  for (const style of GAME_STYLES) {
    let score = 0
    for (const keyword of style.worldviewKeywords) {
      if (text.includes(keyword)) score += 2
    }
    for (const term of Object.values(style.terminology)) {
      if (term && text.includes(term)) score += 1
    }
    // 严格 > ：平分时保留先出现的风格（对齐 Python max 取首个最大 key）
    if (score > bestScore) {
      bestScore = score
      bestId = style.id
    }
  }

  return bestScore >= 2 ? bestId : ''
}

/** 只接受已知风格 id，否则返回 '' */
export function normalizeGameStyleId(value: unknown): string {
  if (typeof value !== 'string') return ''
  return getStyle(value) ? value : ''
}

/** 读活跃风格；键缺失 / 未知 id / storage 不可用 → ''（不抛） */
export function loadGameStyle(storage?: StorageLike): string {
  const store = storage ?? defaultStorage()
  if (store === null) return ''
  return normalizeGameStyleId(store.getItem(ACTIVE_GAME_STYLE_STORAGE_KEY))
}

/**
 * 写活跃风格；写空（'' 或未知 id）时用 removeItem 清键（不留无意义键）；
 * storage 不可用则静默 no-op。
 */
export function saveGameStyle(styleId: string, storage?: StorageLike): void {
  const store = storage ?? defaultStorage()
  if (store === null) return
  const normalized = normalizeGameStyleId(styleId)
  if (!normalized) {
    store.removeItem(ACTIVE_GAME_STYLE_STORAGE_KEY)
    return
  }
  store.setItem(ACTIVE_GAME_STYLE_STORAGE_KEY, normalized)
}
