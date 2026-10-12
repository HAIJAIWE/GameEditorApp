import { isChapterKey, type ChapterData, type CeshuDocument } from '../ceshuConstants'
import { withChapter } from '../ceshuModel'
import { categorizeValidationError } from '../ceshu/ceshuReports'
import { scoreCeshu } from '../ceshu/ceshuScorer'
import { validateCeshu } from '../ceshuValidation'
import { findCountConstraint, exceedsCountConstraint } from '../util/dataCountConstraint'
import { assessBalance, mean, numericFieldNames, stdev } from '../dataStats'
import type { DataTypeDef } from '../types'

/**
 * AI 产出的**确定性质量门**（v0.5 DD-19）—— 策划书半边 + 数据半边。
 *
 * ## 为什么要有这一层
 * 本项目已有 **7,114 行确定性纯逻辑**在生产里跑着（`ceshuValidation` / `ceshuScorer` /
 * `dataStats` / `dataCountConstraint` / `dataRef` / `ceshuFieldDeps`），
 * 但 agent / AI 生成的产出路径（`brain.ts` → LLM → 文本）**并没有强制跑这些门**
 * ⇒ **无法用机器判定"这次生成是好是坏"**，评估只能退化成 LLM 自评——
 * 而 Anthropic 的实证是：自评系统性偏松（self-preference bias），
 * 他们为此专门做了「评分器放独立上下文」的 Outcomes。
 *
 * 本模块的选择与 Anthropic 那句「**code 有自动化测试就能提供客观验证**」是同一个思路：
 * **本项目的策划书与数据质量同样有自动化检查**，所以评估应
 * **先过确定性门，LLM judge 只补机器判不了的维度**。
 *
 * ## 两个半边
 * | 半边 | 入口 | 判据 |
 * |---|---|---|
 * | **策划书** | `evaluateChapterDraft` | 生成字段合并进文档后重跑 `validateCeshu` + `scoreCeshu`，比较 before/after |
 * | **数据** | `evaluateDataCandidates` | 数量约束（P5，硬）+ 数值平衡性（`assessBalance`，建议） |
 *
 * 本模块是纯函数，不落盘、不调 LLM，可被 Node 端单测直接覆盖。
 */

export interface QualityGateVerdict {
  /** 被评估的章节 */
  chapter: string
  /** 生成前的校验错误数 */
  beforeErrors: number
  /** 应用生成结果后的校验错误数 */
  afterErrors: number
  /** 错误数变化（**负数 = 变好**） */
  errorDelta: number
  /** 应用后仍存在的**阻断性**问题（必填缺失 / 一致性冲突）；软警告不算 */
  blocking: string[]
  /** 生成前总分 */
  beforeScore: number
  /** 生成后总分 */
  afterScore: number
  /** 分数变化（正数 = 变好） */
  scoreDelta: number
  gradeBefore: string
  gradeAfter: string
  /** 是否确有净改善（错误减少 **或** 分数提高） */
  improved: boolean
  /** 一句话结论，供 UI 直接展示 */
  summary: string
  /**
   * LLM-as-Judge 的**辅助**结论（DD-19 剩余项，章节侧专用）。
   * 确定性门为主、judge 为辅：`toxicity` 命中只往 `summary` 追加合规提示，
   * **不推翻** `blocking` / `scoreDelta`。异步计算后再由 `applyJudge` 合并进来，
   * 故确定性 `evaluateChapterDraft` 产出的 verdict 此字段为 `null`。
   */
  judge: LlmJudgeVerdict | null
}

/**
 * 阻断性判定：只有 `required`（必填项缺失）与 `conflict`（一致性冲突）算阻断。
 * `warning`（一致性警告）与 `dep`（依赖缺失）是软问题——它们不该挡住"生成是否有改善"的判断。
 * 分类关键字沿用 `ceshuReports.ts::categorizeValidationError`（已有单测），不在此重复一份。
 */
function isBlocking(error: string): boolean {
  const category = categorizeValidationError(error)
  return category === 'required' || category === 'conflict'
}

function summarize(verdict: Omit<QualityGateVerdict, 'summary'>): string {
  if (verdict.blocking.length > 0) {
    return `仍有 ${verdict.blocking.length} 个阻断问题（必填缺失 / 章节间硬冲突），建议先补齐再继续`
  }
  if (verdict.errorDelta < 0) {
    return `校验问题减少 ${-verdict.errorDelta} 个，评分 ${verdict.beforeScore} → ${verdict.afterScore}`
  }
  if (verdict.scoreDelta > 0) {
    return `评分提高 ${verdict.scoreDelta} 分（${verdict.beforeScore} → ${verdict.afterScore}）`
  }
  if (verdict.errorDelta === 0 && verdict.scoreDelta === 0) {
    return '校验问题与评分均无变化'
  }
  return `校验问题增加 ${verdict.errorDelta} 个，评分 ${verdict.beforeScore} → ${verdict.afterScore}，建议复核生成内容`
}

/**
 * 评估「把 `fields` 应用进 `base` 的 `chapter` 章节」这一动作的质量变化。
 *
 * `fields` 会与章节现有内容**合并**（生成值覆盖同名键），与 UI 点击"应用"的语义一致。
 * 章节 key 非法时返回 `null`（调用方通常已在 IPC 层用 `isChapterKey` 校验过）。
 */
export function evaluateChapterDraft(
  base: CeshuDocument,
  chapter: string,
  fields: Record<string, unknown>
): QualityGateVerdict | null {
  if (!isChapterKey(chapter)) return null

  const current = base[chapter] as ChapterData | undefined
  const merged: ChapterData = { ...(current ?? {}), ...fields }
  const afterDoc = withChapter(base, chapter, merged)

  const beforeErrors = validateCeshu(base)
  const afterErrors = validateCeshu(afterDoc)
  const beforeReport = scoreCeshu(base)
  const afterReport = scoreCeshu(afterDoc)

  const errorDelta = afterErrors.length - beforeErrors.length
  const scoreDelta = afterReport.total_score - beforeReport.total_score
  const blocking = afterErrors.filter(isBlocking)

  const verdict: Omit<QualityGateVerdict, 'summary'> = {
    chapter,
    beforeErrors: beforeErrors.length,
    afterErrors: afterErrors.length,
    errorDelta,
    blocking,
    beforeScore: beforeReport.total_score,
    afterScore: afterReport.total_score,
    scoreDelta,
    gradeBefore: beforeReport.grade,
    gradeAfter: afterReport.grade,
    improved: errorDelta < 0 || scoreDelta > 0,
    judge: null
  }
  return { ...verdict, summary: summarize(verdict) }
}

/* ---- 数据侧的确定性门（v0.5 DD-19 的数据半边） ---- */

/** 单个「类型 × 数值字段」的平衡性评估 */
export interface DataBalanceRow {
  /** 复数键 */
  type: string
  typeName: string
  /** 字段名 */
  field: string
  /** 字段显示名（去掉表单标签的冒号后缀，与 `dataStats` 一致） */
  label: string
  /** 参与统计的有效数值条数 */
  count: number
  avg: number
  std: number
  /** 平衡性判定（阈值 0.3，与 `dataStats::assessBalance` 同源） */
  verdict: 'good' | 'needs_adjust'
}

export interface DataQualityIssue {
  /** 复数键 */
  type: string
  typeName: string
  /** `count_limit` = 数量约束超限（**硬约束**）；`balance` = 离散度偏高（**建议**） */
  kind: 'count_limit' | 'balance'
  message: string
}

export interface DataQualityVerdict {
  /** 本次候选总条数 */
  total: number
  /** 逐复数键的候选条数 */
  counts: Record<string, number>
  /** 需要人工注意的问题（数量约束在前，平衡性在后） */
  issues: DataQualityIssue[]
  /** 逐「类型 × 数值字段」的平衡性（无论好坏都列出，供 UI 展示） */
  balance: DataBalanceRow[]
  /** 是否存在问题（数量约束超限或离散度偏高） */
  hasIssues: boolean
  /** 一句话结论，供 UI 直接展示 */
  summary: string
}

/** 从候选条目里取出某字段的有效数值（无法解析的跳过，与 `dataStats::toFiniteNumber` 同口径） */
function numericValues(items: readonly Record<string, unknown>[], field: string): number[] {
  const values: number[] = []
  for (const item of items) {
    const raw = item[field]
    const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' && raw.trim() !== '' ? Number(raw) : Number.NaN
    if (Number.isFinite(parsed)) values.push(parsed)
  }
  return values
}

function fieldLabel(typeDef: DataTypeDef, field: string): string {
  const label = typeDef.formFields.find((item) => item.name === field)?.label ?? field
  return label.replace(/[:：]\s*$/, '')
}

/**
 * 评估「AI 生成的数据候选」的质量（v0.5 DD-19 的数据半边）。
 *
 * 与策划书半边同源的思路：**用域内已有的确定性检查代替 LLM 自评**。
 * 这里复用两个已在生产里跑着的纯逻辑：
 * - **数量约束（P5，硬）**：`dataCountConstraint::findCountConstraint` + `exceedsCountConstraint`
 *   —— 策划书第四章的系统 config 声明了上限时，「现有 + 本次」超上限就是**可机器判定的问题**。
 * - **平衡性（建议）**：`dataStats::assessBalance`（std/avg > 0.3 判定 `needs_adjust`）
 *   —— 候选数值的离散度，是"值不值得导入"的客观参考。
 *
 * `existingCounts` 以**单数类型 id** 为键（与 `items.type` 的口径一致，见 `docs/ts-migration-roadmap.md`
 * 的「数据表键口径」）；缺省按 0 处理（此时数量约束只看本次生成量）。
 */
export function evaluateDataCandidates(
  candidates: Record<string, Array<Record<string, unknown>>>,
  options: {
    types?: readonly DataTypeDef[]
    /** 策划书第四章 `systems` 章节数据（数量约束的来源） */
    systems?: unknown
    existingCounts?: Record<string, number>
  } = {}
): DataQualityVerdict {
  const counts: Record<string, number> = {}
  let total = 0
  for (const [key, items] of Object.entries(candidates)) {
    counts[key] = Array.isArray(items) ? items.length : 0
    total += counts[key] as number
  }

  const limitIssues: DataQualityIssue[] = []
  const balanceIssues: DataQualityIssue[] = []
  const balance: DataBalanceRow[] = []

  for (const typeDef of options.types ?? []) {
    const key = typeDef.pluralKey
    const items = candidates[key]
    if (!Array.isArray(items) || items.length === 0) continue
    const typeName = typeDef.name || key
    const dataType = typeDef.id

    // ① 数量约束（硬）
    const constraint = findCountConstraint(options.systems, dataType)
    if (constraint !== null) {
      const existing = options.existingCounts?.[dataType] ?? 0
      const after = existing + items.length
      if (exceedsCountConstraint(after, constraint)) {
        limitIssues.push({
          type: key,
          typeName,
          kind: 'count_limit',
          message: `「${constraint.name}」规定数量上限 ${constraint.limit}，导入后将有 ${after} 个（现有 ${existing} + 本次 ${items.length}），已达/超过上限`
        })
      }
    }

    // ② 平衡性（建议）
    for (const field of numericFieldNames(typeDef)) {
      const values = numericValues(items, field)
      if (values.length < 2) continue
      const avg = mean(values)
      const std = stdev(values)
      const verdict = assessBalance(std, avg)
      balance.push({
        type: key,
        typeName,
        field,
        label: fieldLabel(typeDef, field),
        count: values.length,
        avg,
        std,
        verdict
      })
      if (verdict === 'needs_adjust') {
        balanceIssues.push({
          type: key,
          typeName,
          kind: 'balance',
          message: `「${typeName}」的 ${fieldLabel(typeDef, field)} 离散度偏高（均值 ${avg.toFixed(1)}、标准差 ${std.toFixed(1)}），建议复核数值平衡`
        })
      }
    }
  }

  const issues = [...limitIssues, ...balanceIssues]
  const hasIssues = issues.length > 0
  let summary: string
  if (limitIssues.length > 0) {
    summary = `${total} 条候选中有 ${limitIssues.length} 类会突破数量上限，建议减少条数或先调整策划书系统配置`
  } else if (balanceIssues.length > 0) {
    summary = `${total} 条候选通过数量约束，但有 ${balanceIssues.length} 个数值字段离散度偏高，建议复核后再导入`
  } else {
    summary = `${total} 条候选通过数量约束与平衡性检查`
  }

  return { total, counts, issues, balance, hasIssues, summary }
}

/* ---- LLM-as-Judge 的辅助维度（DD-19 剩余项，章节侧专用） ---- */

/**
 * LLM-as-Judge 的辅助结论。
 *
 * ## 定位：确定性门为主，judge 为辅
 * 本项目的策划书/数据已有 7,114 行确定性纯逻辑在生产跑（`ceshuValidation` /
 * `ceshuScorer` / `dataStats` / `dataCountConstraint`），它们给出的
 * `blocking` / `errorDelta` / `scoreDelta` **是客观可机器判定**的质量结论。
 * LLM judge 只补机器判不了的维度：
 * - `toxicity`：合规红线（暴力/涉政/色情等），确定性门看不到；
 * - `readability` / `creativity`：文字质量与创意，机器打分无能为力；
 * - `score`：judge 综合分（0-100），**仅供参考**，不与确定性 `afterScore` 混用。
 *
 * 权重远低于确定性门：`toxicity === 'flagged'` 也**不推翻** `blocking` /
 * `scoreDelta`，只由 `applyJudge` 往 `summary` 追加一条合规提示，
 * 把"是否发布"的最终裁决权留在人手里。
 */
export interface LlmJudgeVerdict {
  /** 合规性：safe = 未命中红线；flagged = 命中需人工复核 */
  toxicity: 'safe' | 'flagged'
  /** 可读性（0-10） */
  readability: number
  /** 创意性（0-10） */
  creativity: number
  /** judge 综合分（0-100），仅供参考 */
  score: number
  /** judge 评语，UI 直接展示 */
  comment: string
}

/**
 * 把 LLM-as-Judge 的辅助结论合并进确定性 verdict。
 *
 * 纯函数（不调 LLM、不改入参），可被 Node 端单测直接覆盖：
 * - `judge` 为 `null`（judge 调用失败 / 降级 / 保密模式禁用）时**原样返回**确定性 verdict；
 * - `toxicity === 'flagged'` 时只往 `summary` 追加合规提示，**不改动** `blocking` / `scoreDelta`；
 * - 其余情况把 `judge` 挂到 `verdict.judge`，`summary` 保持不变。
 *
 * 调用方（`main/agent/qualityJudge.ts::runLlmJudge`）负责真正发起 LLM 调用、
 * 走 `effectiveProvider` 遵守保密约束、并在失败时降级返回 `null`。
 */
export function applyJudge(
  verdict: QualityGateVerdict | null,
  judge: LlmJudgeVerdict | null
): QualityGateVerdict | null {
  if (verdict === null) return null
  if (!judge) return verdict
  if (judge.toxicity === 'flagged') {
    return {
      ...verdict,
      judge,
      summary: `${verdict.summary} ⚠️ judge 标记内容存在合规风险，建议人工复核后再发布`
    }
  }
  return { ...verdict, judge }
}
