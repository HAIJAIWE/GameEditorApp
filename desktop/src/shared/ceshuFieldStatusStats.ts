import type { CeshuFieldDef } from './ceshuConstants'
import type { ChapterFieldStatus, FieldReviewStatus } from './ceshuFieldStatus'

/**
 * 本章字段审核状态的汇总（顶部一行摘要用）。
 *
 * ## 为什么单独成模块
 * 摘要只是「数数 + 拼字符串」，与 React 无关；放进组件里就没法单测，
 * 也容易被后续的「队列视图」复用（同一口径：待审 / 人改 / 已批准）。
 *
 * ## 为什么只按 schema 字段统计
 * `field_status` 是 TS 独占的辅助信息，历史上可能残留已从 schema 删掉的键
 * （或模板带来的扩展键）。按 schema 遍历而不是遍历状态表，可以保证摘要
 * 与表单里实际可见的字段一致，不会出现「摘要说 3 个待审、表单只有 2 个徽标」。
 */

export interface FieldStatusCounts {
  ai_draft: number
  human_edited: number
  approved: number
}

/** 摘要里各状态的短词（`ai_draft` 用「待审」，与待审队列口径一致） */
const STATUS_SUMMARY_LABELS: Record<FieldReviewStatus, string> = {
  ai_draft: '待审',
  human_edited: '人改',
  approved: '已批准'
}

/** 固定展示顺序：先看要人动手的，再看已完成的 */
const SUMMARY_ORDER: readonly FieldReviewStatus[] = ['ai_draft', 'human_edited', 'approved']

/** 按本章字段定义统计各状态数量（schema 外字段不计入，避免扩展键干扰） */
export function countFieldStatuses(
  fieldStatus: ChapterFieldStatus | undefined,
  fields: readonly CeshuFieldDef[]
): FieldStatusCounts {
  const counts: FieldStatusCounts = { ai_draft: 0, human_edited: 0, approved: 0 }
  for (const field of fields) {
    const status = fieldStatus?.[field.key]?.status
    // 显式比较而非 `counts[status] += 1`：脏数据里的未知状态不该被算进任何一栏
    if (status === 'ai_draft' || status === 'human_edited' || status === 'approved') {
      counts[status] += 1
    }
  }
  return counts
}

/** 摘要文案：`2 待审 · 3 人改 · 5 已批准`；全零返回空串（调用方据此不渲染） */
export function formatFieldStatusSummary(counts: FieldStatusCounts): string {
  return SUMMARY_ORDER.filter((status) => counts[status] > 0)
    .map((status) => `${counts[status]} ${STATUS_SUMMARY_LABELS[status]}`)
    .join(' · ')
}
