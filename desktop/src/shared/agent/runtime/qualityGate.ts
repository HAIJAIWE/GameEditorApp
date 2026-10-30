import { isChapterKey, type ChapterData, type CeshuDocument } from '../../ceshu/reference/ceshuConstants'
import { computeChapterProgress, withChapter } from '../../ceshu/model/ceshuModel'
import { categorizeValidationError } from '../../domain/ceshu/ceshuReports'
import { validateCeshu } from '../../ceshu/validation/ceshuValidation'
import { findCountConstraint, exceedsCountConstraint } from '../../util/dataCountConstraint'
import { assessBalance, mean, numericFieldNames, stdev } from '../../util/dataStats'
import type {
  DataBalanceRow,
  DataQualityIssue,
  DataQualityVerdict,
  DataTypeDef,
  LlmJudgeVerdict,
  QualityGateVerdict
} from '../../types'

/**
 * AI 产出的**确定性质量门**（v0.5 DD-19）—— 策划书半边 + 数据半边。
 *
 * ## 为什么要有这一层
 * 本项目已有 **7,114 行确定性纯逻辑**在生产里跑着（`ceshuValidation` / `ceshuReadiness` /
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
 * | **策划书** | `evaluateChapterDraft` | 生成字段合并进文档后重跑 `validateCeshu`，比较 before/after 的**错误数**与**立项阶段完成度** |
 * | **数据** | `evaluateDataCandidates` | 数量约束（P5，硬）+ 数值平衡性（`assessBalance`，建议） |
 *
 * 本模块是纯函数，不落盘、不调 LLM，可被 Node 端单测直接覆盖。
 */

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
    return `校验问题减少 ${-verdict.errorDelta} 个，立项完成度 ${pct(verdict.completionBefore)} → ${pct(verdict.completionAfter)}`
  }
  if (verdict.completionDelta > 0) {
    return `立项完成度提高 ${Math.round(verdict.completionDelta * 100)} 个百分点（${pct(verdict.completionBefore)} → ${pct(verdict.completionAfter)}）`
  }
  if (verdict.errorDelta === 0 && verdict.completionDelta === 0) {
    return '校验问题与完成度均无变化'
  }
  return `校验问题增加 ${verdict.errorDelta} 个，立项完成度 ${pct(verdict.completionBefore)} → ${pct(verdict.completionAfter)}，建议复核生成内容`
}

/** 完成度（0~1）→ 百分比整数串 */
function pct(value: number): string {
  return `${Math.round(value * 100)}%`
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

  /*
   * 改善判据从「总分差」改基到两个已有真实信号（2026-10-27，随 100 分制一并移除）：
   * `beforeScore/scoreDelta` 来自已删除的 `scoreCeshu`；而「错误数」与「立项完成度」
   * 都是校验/进度链路本就产出的客观量——不依赖任何拍出来的权重，也不可能编造。
   */
  const errorDelta = afterErrors.length - beforeErrors.length
  const completionBefore = computeChapterProgress(base, 'concept').total ?? 0
  const completionAfter = computeChapterProgress(afterDoc, 'concept').total ?? 0
  const completionDelta = Math.round((completionAfter - completionBefore) * 10000) / 10000
  const blocking = afterErrors.filter(isBlocking)

  const verdict: Omit<QualityGateVerdict, 'summary'> = {
    chapter,
    beforeErrors: beforeErrors.length,
    afterErrors: afterErrors.length,
    errorDelta,
    blocking,
    completionBefore,
    completionAfter,
    completionDelta,
    improved: errorDelta < 0 || completionDelta > 0,
    judge: null
  }
  return { ...verdict, summary: summarize(verdict) }
}

/* ---- 数据侧的确定性门（v0.5 DD-19 的数据半边） ---- */

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

/**
 * 把 LLM-as-Judge 的辅助结论合并进确定性 verdict。
 *
 * 纯函数（不调 LLM、不改入参），可被 Node 端单测直接覆盖：
 * - `judge` 为 `null`（judge 调用失败 / 降级 / 保密模式禁用）时**原样返回**确定性 verdict；
 * - `toxicity === 'flagged'` 时只往 `summary` 追加合规提示，**不改动** `blocking` / `completionDelta`；
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
