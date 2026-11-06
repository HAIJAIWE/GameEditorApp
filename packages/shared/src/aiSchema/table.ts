/**
 * AI 产品设计文档（SDD + 模型层）章表（顺序 / 分区 / 章名 / 标签 / 章号 / 锚点）的唯一事实源。
 *
 * 设计原则（呼应路线 A 与调研结论 2026-11-07）：
 * - AI 产品**本质是软件产品**，因此软件设计部分（概述/用户/范围/功能/流程/交互/架构/数据/
 *   接口/集成/非功能/安全/测试/发布/里程碑/风险）直接复用应用 SDD 的字段语义（见 chapters.ts
 *   对 `APP_CHAPTER_FIELDS` 的复用），避免重复造轮子、也避免语义漂移。
 * - 额外补上 AI **独有**的模型层四章：模型卡 / 数据表 / 系统卡 / 评测与红队。这三张卡 +
 *   合规 + Eval 是 ML 界标准化产物（Model Cards / Data Sheets / System Cards），应用 SDD 装不下。
 *
 * 章 key 是独立命名空间（与应用 SDD 的 key 同名但属不同规格），由 documentSpec.test.ts 的
 * 零重叠守卫锁定。章号由 `AI_PARTS` 位置派生（1..20 连续），不借用游戏 `CHAPTER_PARTS`。
 *
 * 为什么放 `aiSchema` 而不是 `documentSpec`：与 appSchema 同因——切断 cyclic 依赖（见
 * appSchema/ai.ts 注释）。`documentSpec/aiSpec.ts` 从这里 re-export。
 */
import type { ChapterData } from '../ceshu/reference'
import { APP_CHAPTER_NAMES } from '../appSchema'

/** 文档信息段 key（不占章号） */
export const AI_META_KEY = 'meta'

export interface AiPart {
  key: string
  label: string
  chapters: readonly string[]
}

/** AI 档分区（章号唯一事实源）：软件设计基础 + 模型层 */
export const AI_PARTS: readonly AiPart[] = [
  { key: 'definition', label: '定义与范围', chapters: ['overview', 'users', 'scope'] },
  { key: 'product', label: '产品设计', chapters: ['features', 'flows', 'interaction'] },
  { key: 'engineering', label: '技术设计', chapters: ['architecture', 'data_model', 'api', 'integration'] },
  { key: 'ai_layer', label: 'AI 模型层', chapters: ['model_card', 'data_sheet', 'system_card', 'eval_redteam'] },
  { key: 'quality', label: '质量与保障', chapters: ['nonfunctional', 'security', 'testing'] },
  { key: 'delivery', label: '交付与治理', chapters: ['release', 'milestones', 'risks'] }
] as const

/** 章名（不含章号）：软件章复用应用 SDD 命名，模型层另起 */
export const AI_CHAPTER_NAMES: Readonly<Record<string, string>> = {
  ...APP_CHAPTER_NAMES,
  meta: '文档信息',
  model_card: '模型卡',
  data_sheet: '数据表',
  system_card: '系统卡',
  eval_redteam: '评测与红队'
}

const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'] as const

/** 章号从 1 起的编号章（顺序即章号） */
export const AI_NUMBERED_KEYS: readonly string[] = AI_PARTS.flatMap((part) => [...part.chapters])

/** 全部章 key（meta 段 + 编号章），顺序即文档顺序 */
export const AI_CHAPTER_KEYS: readonly string[] = [AI_META_KEY, ...AI_NUMBERED_KEYS]

/**
 * 方向版（lite）编号章：沿用应用方向版，另保留「模型卡」——AI 产品的方向阶段
 * 至少要说清用哪个模型、能力边界在哪，否则方向不成立。
 */
export const AI_LITE_NUMBERED_KEYS: readonly string[] = ['overview', 'users', 'scope', 'features', 'model_card', 'milestones', 'risks']

/** 方向版（lite）全部章 key（含 meta） */
export const AI_LITE_KEYS: readonly string[] = [AI_META_KEY, ...AI_LITE_NUMBERED_KEYS]

/** 规格内章号：文档信息段为 0，编号章从 1 起（恒连续） */
export function aiChapterNumber(key: string): number {
  if (key === AI_META_KEY) return 0
  const index = AI_NUMBERED_KEYS.indexOf(key)
  return index < 0 ? 0 : index + 1
}

/** 完整章标签（含派生章号）；文档信息段无章号 */
export const AI_CHAPTER_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  AI_CHAPTER_KEYS.map((key) => {
    const name = AI_CHAPTER_NAMES[key] ?? key
    const n = aiChapterNumber(key)
    return [key, n === 0 ? name : `第${CN[n - 1] ?? n}章·${name}`]
  })
)

/** 分区显示名（序号由位置派生） */
export function aiPartDisplayName(part: AiPart): string {
  const index = AI_PARTS.indexOf(part)
  return `${CN[index] ?? index + 1}、${part.label}`
}

/** 章 → 所属分区 key；meta 返回 'meta' */
export function aiPartOf(key: string): string {
  if (key === AI_META_KEY) return 'meta'
  return AI_PARTS.find((part) => part.chapters.includes(key))?.key ?? ''
}

/** 导出锚点：与游戏 / 应用侧 `chapterAnchorOf` 同形，但基于 AI 章表位置 */
export function aiChapterAnchorOf(key: string): string {
  return `ch${AI_CHAPTER_KEYS.indexOf(key) + 1}`
}

/** 空章节默认数据（供读盘补齐） */
export type AiChapterMap = Record<string, ChapterData>
