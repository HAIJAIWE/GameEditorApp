/**
 * 游戏风格术语管理器 —— 移植自 旧版 `src/core/style_manager`。
 *
 * 数据来源 `data/templates/game_styles.json`（6 个风格 / 每个 46 个概念键，**6 风格键集完全一致**），
 * 按概念把标签里的任意风格术语 / 常见简写替换为目标风格的对应术语。
 * 例如：目标=仙侠时 "生命加成%" → "气血加成%"；目标=科幻时 → "HP加成%"。
 *
 * **数据是内联常量而非运行时读盘**（与 `ceshuPresets`/`glossaryTerms` 等既有迁移一致）：
 * 这样渲染层与主进程都能直接用，且不引入 fs 依赖。内联内容已与 JSON 逐字段核对一致。
 *
 * 与 旧版 的语义对齐要点：
 * - 只迁移 `GameStyle` dataclass 的 6 个字段。JSON 里的 `color_palette` /
 *   `data_defs_example` 在 旧版 `load_styles` 中**不被读取**，因此这里也不进
 *   `GameStyleDef`——否则 `buildReplacementPairs` 会把颜色键值当成术语，产生
 *   旧版 不存在的替换对。
 * - `_CONCEPT_ALIASES` 顺序与内容一字不差照抄。
 * - `resolveLabel` 中的替换是 **全部替换**：旧版 `str.replace` 会替换所有
 *   出现位置，故这里用 `split(source).join(target)`（而非 `String.replace`，
 *   后者只替换第一处），以匹配 旧版 行为。
 *
 * 有意偏离：
 * - 旧版 `StyleManager` 是单例，内部持有可变状态 `_active_style`。TS 端
 *   **不保留任何模块级可变状态**（便于测试与 React 状态管理），活跃风格由调用方
 *   （React state）持有，因此所有需要风格的函数都把 `styleId` 作为必填参数。
 *   不做 fs / IPC / React 依赖，也不导出单例。
 * - `loadGameStyle` / `saveGameStyle` 采用 `settingsStore.ts` 的 `StorageLike` + 可选注入模式
 *   （Node 下无 localStorage 时静默处理）。旧版 的活跃风格**不持久化**（进程内单例，重启即丢）；
 *   此处落 localStorage 属有意增强，避免重载后标签"莫名"变回原始术语。
 */

import type { StorageLike } from '../settings'
import { defaultStorage } from '../settings'

import {
  GAME_STYLES,
  CONCEPT_ALIASES,
  ACTIVE_GAME_STYLE_STORAGE_KEY,
  type GameStyleDef
} from './gameStyleData'
export * from './gameStyleData'

/** 取默认 storage（复用 `settingsStore` 的单一真源；Node / 主进程下可能不存在 → null） */

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
 * 插入顺序与 旧版 一致：外层按 GAME_STYLES 顺序遍历，内层按每个风格的
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
 * 与 旧版 `list.sort(key=...)` 一致）。targetId 未知 / 为空 → []。
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
 * 注意：替换为**全部替换**，故用 split/join。
 */
export function resolveLabel(label: string, styleId: string): string {
  if (!label || !styleId) return label

  const target = getStyle(styleId)
  if (!target || Object.keys(target.terminology).length === 0) return label

  const replacements = buildReplacementPairs(styleId)
  let result = label
  for (const [source, replacement] of replacements) {
    if (result.includes(source)) {
      // 旧版 str.replace 替换所有出现位置（非 String.replace 的首个）
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
    // 严格 > ：平分时保留先出现的风格
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
