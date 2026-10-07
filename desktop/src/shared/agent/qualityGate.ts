import { isChapterKey, type ChapterData, type CeshuDocument } from '../ceshuConstants'
import { withChapter } from '../ceshuModel'
import { categorizeValidationError } from '../ceshuReports'
import { scoreCeshu } from '../ceshuScorer'
import { validateCeshu } from '../ceshuValidation'

/**
 * 策划书 AI 产出的**确定性评分门**（v0.5 DD-19）。
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
 * **本项目的策划书质量同样有自动化检查**，所以评估应**先过确定性门，LLM judge 只补机器判不了的维度**。
 *
 * ## 用法
 * 生成章节字段后**先合并进文档再跑门**，比较「生成前 / 生成后」的错误数与评分：
 * - `errorDelta < 0` 或 `scoreDelta > 0` ⇒ 有净改善
 * - `blocking` 非空 ⇒ 仍存在**阻断性问题**（必填缺失 / 章节间硬冲突），应提示先补齐
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
    improved: errorDelta < 0 || scoreDelta > 0
  }
  return { ...verdict, summary: summarize(verdict) }
}
