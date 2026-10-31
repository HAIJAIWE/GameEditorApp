/**
 * 策划书**完备度报告**的数据形状与常量（替代已删除的 100 分制 `ceshuScorerData`）。
 *
 * ## 为什么删掉 100 分制
 * 用户的判定：「一百分制有啥用哈，也给不了啥东西，纯瞎评价的，也不能让设计文档
 * 完整的生成游戏出来呀」。复核确认两条硬伤：
 *   1. **编造基准**：`INDUSTRY_BENCHMARKS` 的「行业均值 77 分 / top_games 原神」
 *      没有任何来源，且会印在导出报告里 —— 直接违反本项目的 `禁编造` 铁律；
 *   2. **分数无行动力**：结构 30 + 质量 40 + 市场 30 是三个拍出来的权重，
 *      78 分既不能告诉用户「下一步补哪个字段」，也不能让文档变成能跑的游戏。
 *
 * ## 换成什么
 * **有明确分母的完备度**：每个阶段「适用的必填字段一共几个 / 你填了几个 / 缺哪几个」，
 * 外加两个客观观测（字数、内容质量提示）。分母来自 `CHAPTER_REQUIRED_FIELDS`，
 * 完全可复算，且每个缺口都能一键跳到对应章节去填 —— 这才有行动力。
 *
 * ## 与「有出处的对比」的关系
 * 完备度是「你自己有多全」；把同一批字段拿去和**有出处的真实文档**比（见
 * `ceshuReferenceGdd.ts`）才是「同类文档一般写到哪」。两者都不编造分数。
 */

import type { ChapterKey } from '../reference'
import type { CeshuStage } from '../workflow'
import type { CeshuReferenceComparison } from '../reference'
/** 单个章节在某个阶段的完备情况 */
export interface CeshuChapterReadiness {
  chapter_key: ChapterKey
  chapter_label: string
  /** 该章适用的必填字段总数（无必填按 0） */
  required_total: number
  /** 已填必填数 */
  required_filled: number
  /** 缺失的必填字段名 */
  missing_required: string[]
  /** 完成度（0~1，来自 computeChapterProgress；systems 章按启用系统占比） */
  completion: number
  /** 章节字数（中文按字 + 英文按词） */
  word_count: number
  /**
   * 内容质量提示（来自 `ceshuContentQuality`，与校验面板同阈值）。
   * 空数组 = 未发现空话/长句/缺数字问题。
   */
  quality_notes: string[]
  /** 是否完全未填写（完成度 0 且字数为 0） */
  empty: boolean
}

/** 某个阶段的完备度汇总 */
export interface CeshuStageReadiness {
  stage: CeshuStage
  /** 该阶段适用的必填字段总数（已按品类/模块口径剔除不适用章） */
  required_total: number
  required_filled: number
  /** 必填覆盖比（0~1）——**有明确分母**，不是拍出来的分数 */
  ratio: number
  /** 该阶段还有几个字段没填 */
  missing_count: number
  /** 该阶段适用的章数 */
  chapter_count: number
}

/**
 * 完备度报告（替代 `CeshuScoreReport`）。
 *
 * 刻意**不带** `total_score` / `grade` / `structure_score` 这类字段：
 * 它们正是被判定为「纯瞎评价」的东西。要对比就去看 `references`（有出处）。
 */
export interface CeshuReadinessReport {
  /** 立项阶段完备度（打开文档时用户首先面对的体量） */
  concept: CeshuStageReadiness
  /** 研发阶段（累计到研发的必填口径） */
  production: CeshuStageReadiness
  /** 发行阶段（= 全文，仅可见章） */
  release: CeshuStageReadiness
  /** 逐章明细（仅当前可见章，按缺口数降序由 UI 决定） */
  chapters: CeshuChapterReadiness[]
  /** 全文缺口总数（所有可见章必填缺失之和） */
  total_missing: number
  /** 全文必填总数 */
  total_required: number
  /** 全文必填覆盖比（0~1） */
  total_ratio: number
  /** 「下一步做什么」——按影响面排序的可执行建议（每条都指向可定位的章/字段） */
  next_steps: string[]
  /** 有出处的参照对比（真实公开 / 本项目交付 / 合成样例，各自注明出处） */
  references: CeshuReferenceComparison[]
}

/** 阶段展示名（与 ceshuStages.CESHU_STAGE_LABELS 同值；此处避免运行时循环 import 只做兜底） */
export const READINESS_STAGE_ORDER: readonly CeshuStage[] = ['concept', 'production', 'release'] as const
