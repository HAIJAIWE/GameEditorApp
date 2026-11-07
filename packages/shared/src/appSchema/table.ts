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

/** 应用档分区（章号唯一事实源）——对齐主流设计文档：定义 → 方案 → 数据/接口 → 质量 → 交付 → 附录 */
export const APP_PARTS: readonly AppPart[] = [
  { key: 'definition', label: '定义与目标', chapters: ['overview', 'users', 'scope'] },
  { key: 'solution', label: '方案设计', chapters: ['features', 'flows', 'interaction', 'architecture', 'alternatives'] },
  { key: 'data_api', label: '数据与接口', chapters: ['data_interface'] },
  { key: 'quality', label: '质量与保障', chapters: ['nonfunctional', 'testing'] },
  { key: 'crosscut', label: '横切关注点', chapters: ['security'] },
  { key: 'delivery', label: '交付与治理', chapters: ['release', 'milestones', 'risks'] },
  { key: 'appendix', label: '附录', chapters: ['glossary'] },
  // AI 模型层：可选分区，排在最后（不挤占现有章号），仅在启用 ai_layer 模块时可见
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
  alternatives: '替代方案',
  data_interface: '数据与接口',
  nonfunctional: '非功能需求',
  security: '安全与隐私',
  testing: '测试与质量',
  release: '发布与运维',
  milestones: '里程碑与资源',
  risks: '风险与取舍',
  glossary: '术语表',
  model_card: '模型卡',
  data_sheet: '数据表',
  system_card: '系统卡',
  eval_redteam: '评测与红队'
}

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

/**
 * 完整章标签（**应用档**）：纯主题式，不编号成章。
 * 依据 6 个软件文档原文（RFC/KEP/Google 设计文档/ADR/PEP/ModelCard）均用主题式小标题。
 * 游戏档另用编号式（CHAPTER_LABELS），两档按文档载体分派，见 `docs/game-doc-corpus-2026.md`。
 * 文档信息段即「文档信息」。
 */
export const APP_CHAPTER_LABELS: Readonly<Record<string, string>> = Object.fromEntries(
  APP_CHAPTER_KEYS.map((key) => [key, APP_CHAPTER_NAMES[key] ?? key])
)

/**
 * 分区显示名：**直接用分区标签**，不加中文序号。
 *
 * 与游戏侧 `partDisplayName` 同口径：章标签是「1. 项目概述」的阿拉伯数字，
 * 分区再套「一、」会变成两套编号混排（见 `docs/template-corpus.md`）。
 * 保留函数是为了让分区显示名有单一出口，别处不要自己拼序号。
 */
export function appPartDisplayName(part: AppPart): string {
  return part.label
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
