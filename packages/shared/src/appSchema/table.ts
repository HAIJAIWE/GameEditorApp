/**
 * 应用 SDD 章表（顺序 / 分区 / 章名 / 标签 / 章号 / 锚点）的**唯一事实源**。
 *
 * 为什么放在 `appSchema` 而不是 `documentSpec`：
 * `ceshu/model` 的规格化查表层要读这份数据，而 `documentSpec` 反过来依赖
 * `ceshu/prompts` / `ceshu/workflow`（它们又依赖 `ceshu/model`）。把章表放在
 * 底层 `appSchema`（只 type-import `ceshu/reference`）可以切断这条循环。
 * `documentSpec/appSpec.ts` 从这里 re-export，不再自己派生章号。
 *
 * 章号由 `APP_PARTS` 位置派生（1..16 连续），不借用游戏 `CHAPTER_PARTS` 的
 * 静态章号——那是仓库注释里记过的「章号跳号、目录像缺页」历史缺陷。
 */
import type { ChapterData } from '../ceshu/reference'

/** 文档信息段 key（不占章号） */
export const APP_META_KEY = 'meta'

export interface AppPart {
  key: string
  label: string
  chapters: readonly string[]
}

/** 应用档分区（章号唯一事实源） */
export const APP_PARTS: readonly AppPart[] = [
  { key: 'definition', label: '定义与范围', chapters: ['overview', 'users', 'scope'] },
  { key: 'product', label: '产品设计', chapters: ['features', 'flows', 'interaction'] },
  { key: 'engineering', label: '技术设计', chapters: ['architecture', 'data_model', 'api', 'integration'] },
  { key: 'quality', label: '质量与保障', chapters: ['nonfunctional', 'security', 'testing'] },
  { key: 'delivery', label: '交付与治理', chapters: ['release', 'milestones', 'risks'] },
  // AI 模型层：可选分区，排在 16 章之后（不挤占现有章号），仅在「含 AI 模型层」时可见
  { key: 'ai_layer', label: 'AI 模型层', chapters: ['model_card', 'data_sheet', 'system_card', 'eval_redteam'] }
] as const

/** 章名（不含章号） */
export const APP_CHAPTER_NAMES: Readonly<Record<string, string>> = {
  meta: '文档信息',
  overview: '项目概述',
  users: '用户与场景',
  scope: '范围与非目标',
  features: '功能规格',
  flows: '核心流程与状态',
  interaction: '交互与界面',
  architecture: '技术架构',
  data_model: '数据模型',
  api: '接口契约',
  integration: '第三方与集成',
  nonfunctional: '非功能需求',
  security: '安全与隐私',
  testing: '测试与质量',
  release: '发布与运维',
  milestones: '里程碑与资源',
  risks: '风险与取舍',
  model_card: '模型卡',
  data_sheet: '数据表',
  system_card: '系统卡',
  eval_redteam: '评测与红队'
}

const CN = ['一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十'] as const

/** 章号从 1 起的编号章（顺序即章号） */
export const APP_NUMBERED_KEYS: readonly string[] = APP_PARTS.flatMap((part) => [...part.chapters])

/** 全部章 key（meta 段 + 编号章），顺序即文档顺序 */
export const APP_CHAPTER_KEYS: readonly string[] = [APP_META_KEY, ...APP_NUMBERED_KEYS]

/** AI 模型层四章（可选，仅「含 AI 模型层」时进入可见章） */
export const APP_AI_LAYER_KEYS: readonly string[] = ['model_card', 'data_sheet', 'system_card', 'eval_redteam']

/**
 * 方向版（lite）编号章：精简到「定义 + 功能 + 里程碑 + 风险」——
 * 回答「做什么、给谁、边界、何时交付、有哪些险」，不展开架构/接口/数据等实现细节。
 * 顺序沿用 APP_PARTS 的章序，保证方向版与完整版章号一致。
 */
export const APP_LITE_NUMBERED_KEYS: readonly string[] = ['overview', 'users', 'scope', 'features', 'milestones', 'risks']

/** 方向版（lite）全部章 key（含 meta） */
export const APP_LITE_KEYS: readonly string[] = [APP_META_KEY, ...APP_LITE_NUMBERED_KEYS]

/** 规格内章号：文档信息段为 0，编号章从 1 起（恒连续） */
export function appChapterNumber(key: string): number {
  if (key === APP_META_KEY) return 0
  const index = APP_NUMBERED_KEYS.indexOf(key)
  return index < 0 ? 0 : index + 1
}

/** 完整章标签（含派生章号）；文档信息段无章号 */
export const APP_CHAPTER_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  APP_CHAPTER_KEYS.map((key) => {
    const name = APP_CHAPTER_NAMES[key] ?? key
    const n = appChapterNumber(key)
    return [key, n === 0 ? name : `第${CN[n - 1] ?? n}章·${name}`]
  })
)

/** 分区显示名（序号由位置派生） */
export function appPartDisplayName(part: AppPart): string {
  const index = APP_PARTS.indexOf(part)
  return `${CN[index] ?? index + 1}、${part.label}`
}

/** 章 → 所属分区 key；meta 返回 'meta' */
export function appPartOf(key: string): string {
  if (key === APP_META_KEY) return 'meta'
  return APP_PARTS.find((part) => part.chapters.includes(key))?.key ?? ''
}

/** 导出锚点：与游戏侧 `chapterAnchorOf` 同形，但基于应用章表位置 */
export function appChapterAnchorOf(key: string): string {
  return `ch${APP_CHAPTER_KEYS.indexOf(key) + 1}`
}

/** 空章节默认数据（供读盘补齐） */
export type AppChapterMap = Record<string, ChapterData>
