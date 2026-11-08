import type { ChapterKey } from '../reference'

/**
 * 策划书阶段分层 —— 「打开就是 24 章 334 个字段」的解法。
 *
 * ## 为什么需要它
 * 2026-10-26 反向验证（`docs/ceshu-field-necessity.md`）：真实 5 页 GDD 只覆盖 7 章约 40 个字段；
 * 库内 10 份文档最高填写率 13%，且 5 章零使用。结论不是「字段写错了」，而是
 * **没有分层入口**——立项阶段的人看到发行阶段才需要的字段，只能关掉窗口。
 *
 * ## 设计原则
 * - **不删字段**：字段仍在 schema 里，只是按阶段决定「现在是否展开」；
 * - 阶段是**累计**的：进入研发阶段后，立项阶段的章仍然可见；
 * - `systems` 归研发阶段（它是动态配置章，立项时还没有系统要勾选）。
 *
 * 本模块只提供数据与判定函数，UI 如何呈现（折叠/隐藏/分组）由消费方决定。
 */

export type CeshuStage = 'concept' | 'production' | 'release'

/** 阶段推进顺序（从早到晚） */
export const CESHU_STAGE_ORDER: readonly CeshuStage[] = ['concept', 'production', 'release'] as const

export const CESHU_STAGE_LABELS: Record<CeshuStage, string> = {
  concept: '立项',
  production: '研发',
  release: '发行'
}

export const CESHU_STAGE_DESCRIPTIONS: Record<CeshuStage, string> = {
  concept: '讲清「做什么游戏、怎么玩、怎么赚钱、先做什么」——真实 5 页 GDD 的体量',
  production: '把核心玩法展开成可实现的设计：叙事、系统、美术、音频、技术、交互、关卡、测试',
  release: '上线前才需要：资源预算、市场与风险、可访问性、运营、埋点、发行与性能'
}

/**
 * 每个阶段**新增**的章（不累计；累计视图用 `chaptersUpToStage`）。
 * 立项 7 章对齐真实短 GDD 的覆盖范围；24 章在三个阶段里恰好各归属一次。
 */
export const CESHU_STAGE_CHAPTERS: Record<CeshuStage, readonly ChapterKey[]> = {
  concept: ['meta', 'vision', 'gameplay', 'combat', 'economy', 'numeric', 'mvp'],
  production: ['story', 'systems', 'art', 'audio', 'tech', 'monetization', 'uiux', 'level_design', 'qa'],
  release: [
    'resources',
    'market_analysis',
    'risk_handling',
    'accessibility',
    'live_ops',
    'analytics',
    'publishing',
    'performance'
  ]
}

/** 章 → 它所属的阶段（每章恰好一个） */
export function stageOfChapter(chapter: ChapterKey): CeshuStage {
  for (const stage of CESHU_STAGE_ORDER) {
    if (CESHU_STAGE_CHAPTERS[stage].includes(chapter)) return stage
  }
  /*
   * 不应发生：`CHAPTER_KEYS` 新增章节而这里漏配时，返回最早阶段会让新章
   * 在立项就出现（偏保守）；守卫测试会直接点名漏配的章。
   */
  return 'concept'
}

/** 截至某阶段应可见的章（累计，按阶段顺序拼接） */
export function chaptersUpToStage(stage: CeshuStage): ChapterKey[] {
  const end = CESHU_STAGE_ORDER.indexOf(stage)
  const chapters: ChapterKey[] = []
  for (let index = 0; index <= end; index += 1) {
    chapters.push(...CESHU_STAGE_CHAPTERS[CESHU_STAGE_ORDER[index]])
  }
  return chapters
}

/** 该章在当前阶段是否可见（累计语义） */
export function isChapterVisibleInStage(chapter: ChapterKey, stage: CeshuStage): boolean {
  return chaptersUpToStage(stage).includes(chapter)
}

/**
 * 「验收 / 机读数据」类字段：存在价值是让机器能判（对账、断言、证据核对），
 * 不是让人写散文。UI 上应与叙述内容分开，且**不计入文档完成度**——
 * 否则用户会以为立项阶段必须写一份经济账本。
 */
export interface MachineDataField {
  chapter: ChapterKey
  field: string
  /** 一句话说明它为什么属于机读层 */
  reason: string
}

export const CESHU_MACHINE_DATA_FIELDS: readonly MachineDataField[] = [
  { chapter: 'economy', field: 'ledger', reason: '逐笔对账，校验会求和核对期末期望' },
  { chapter: 'gameplay', field: 'design_targets', reason: '可验证的设计目标（指标/目标值/测量方法），属机读承诺而非叙述' },
  { chapter: 'qa', field: 'prototype_acceptance', reason: '「实测」类设计主张的证据来源' },
  { chapter: 'numeric', field: 'numeric_assertions', reason: '可复算的数值断言' },
  { chapter: 'numeric', field: 'design_claims', reason: '设计主张 → 证据核对' },
  { chapter: 'qa', field: 'test_case_list', reason: '可执行用例（机器按列校验）' },
  { chapter: 'qa', field: 'acceptance_journeys', reason: '验收旅程（步骤与期望可判定）' },
  { chapter: 'vision', field: 'design_assumptions', reason: '可证伪的关键假设（登记而非叙述）' }
] as const

/** 该字段是否属于机读数据层（供完成度统计与 UI 分组使用） */
export function isMachineDataField(chapter: string, field: string): boolean {
  // 纯字符串比对：应用章 key 命中不了游戏机读清单 ⇒ 恒为 false（应用档无机读数据层）。
  // 放宽成 string 让规格化章遍历能直接传入，游戏档逐项零回归。
  return CESHU_MACHINE_DATA_FIELDS.some((item) => item.chapter === chapter && item.field === field)
}
