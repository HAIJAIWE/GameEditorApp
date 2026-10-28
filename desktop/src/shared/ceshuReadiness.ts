/**
 * 策划书**完备度引擎**（替代已删除的 100 分制 `ceshuScorer`）。
 *
 * 输出 `CeshuReadinessReport`：每个阶段「必填字段几个 / 填了几个 / 缺哪几个」，
 * 逐章缺口 + 内容质量提示 + **有出处的**参照对比。全部可复算，无编造分数。
 *
 * 分母口径与 `computeChapterProgress` / `validateCeshu` **同源**：
 * `CHAPTER_REQUIRED_FIELDS` × 可见章（档位 × 品类 × 启用模块）。所以
 * 「完备度说缺 3 个」与「校验说 3 条必填缺失」永远一致，不会两套标准。
 */

import {
  CHAPTER_LABELS,
  CHAPTER_REQUIRED_FIELDS,
  isChapterEnabled,
  chapterApplicableToGenre,
  type CeshuDocument,
  type ChapterKey
} from './ceshuConstants'
import { analyzeChapterQuality, contentQualityIssues } from './ceshuContentQuality'
import { fieldLabelOf } from './ceshuFields'
import { computeChapterProgress, getGameType, isFilledValue, visibleChaptersForDoc } from './ceshuModel'
import { CESHU_STAGE_LABELS, chaptersUpToStage, type CeshuStage } from './ceshuStages'
import { classifyValidationMessage } from './ceshuValidationGroups'
import { countWordsInChapter } from './ceshuWordCount'
import { compareWithReferences } from './ceshuReferenceGdd'
import {
  READINESS_STAGE_ORDER,
  type CeshuChapterReadiness,
  type CeshuReadinessReport,
  type CeshuStageReadiness
} from './ceshuReadinessData'
import { validateCeshu } from './ceshuValidation'

// 契约层（ipc.ts / 渲染层）统一从本模块引入完备度报告类型与常量
export * from './ceshuReadinessData'

/** 该章在该文档下是否参与完备度（品类适用 + 模块启用）——与可见章口径一致 */
function chapterCounts(chapter: ChapterKey, doc: CeshuDocument, gameType: string): boolean {
  return chapterApplicableToGenre(chapter, gameType) && isChapterEnabled(chapter, doc)
}

/** 统计单章：必填总数 / 已填 / 缺失 / 完成度 / 字数 / 质量提示 */
function chapterReadiness(
  doc: CeshuDocument,
  chapter: ChapterKey,
  progress: Record<string, number>
): CeshuChapterReadiness {
  const data = doc[chapter] as Record<string, unknown> | undefined
  const required = CHAPTER_REQUIRED_FIELDS[chapter] ?? []
  const missing: string[] = []
  let filled = 0
  for (const field of required) {
    if (isFilledValue(data?.[field])) filled += 1
    else missing.push(field)
  }
  const wordCount = countWordsInChapter(data)
  const completion = progress[chapter] ?? 0
  const qualityNotes =
    data === undefined
      ? []
      : contentQualityIssues(analyzeChapterQuality(data), { chapterLabel: CHAPTER_LABELS[chapter] ?? chapter })

  return {
    chapter_key: chapter,
    chapter_label: CHAPTER_LABELS[chapter] ?? chapter,
    required_total: required.length,
    required_filled: filled,
    missing_required: missing,
    completion,
    word_count: wordCount,
    quality_notes: qualityNotes,
    empty: required.length > 0 ? filled === 0 && wordCount === 0 : wordCount === 0
  }
}

/** 汇总某阶段（累计）的必填覆盖 */
function stageReadiness(doc: CeshuDocument, stage: CeshuStage, gameType: string): CeshuStageReadiness {
  const stageChapters = new Set(chaptersUpToStage(stage))
  const counted = visibleChaptersForDoc(doc).filter(
    (chapter) => stageChapters.has(chapter) && chapterCounts(chapter, doc, gameType)
  )
  let total = 0
  let filled = 0
  for (const chapter of counted) {
    const required = CHAPTER_REQUIRED_FIELDS[chapter] ?? []
    const data = doc[chapter] as Record<string, unknown> | undefined
    total += required.length
    for (const field of required) if (isFilledValue(data?.[field])) filled += 1
  }
  const ratio = total === 0 ? 1 : Math.round((filled / total) * 100) / 100
  return {
    stage,
    required_total: total,
    required_filled: filled,
    ratio,
    missing_count: total - filled,
    chapter_count: counted.length
  }
}

/** 生成「下一步做什么」：按影响面排序，每条都能对应到可定位的章/字段 */
function buildNextSteps(report: Omit<CeshuReadinessReport, 'next_steps'>, hardErrors: number): string[] {
  const steps: string[] = []
  const { concept, chapters, total_missing } = report

  if (concept.missing_count > 0) {
    const gaps = chapters
      .filter((chapter) => conceptStageChapter(chapter.chapter_key))
      .flatMap((chapter) =>
        chapter.missing_required.map((field) => `${chapter.chapter_label}·${fieldLabelOf(chapter.chapter_key, field)}`)
      )
    const shown = gaps.slice(0, 5).join('、')
    const more = gaps.length > 5 ? ` 等 ${gaps.length} 项` : ''
    steps.push(`先补齐立项阶段还差的 ${concept.missing_count} 个必填字段：${shown}${more}`)
  } else {
    steps.push(`立项阶段必填已齐（${concept.required_filled}/${concept.required_total}），可以拿去开工或进入研发阶段`)
  }

  const emptyChapters = chapters.filter((chapter) => chapter.empty)
  if (emptyChapters.length > 0) {
    steps.push(
      `有 ${emptyChapters.length} 章完全未填写（${emptyChapters
        .slice(0, 4)
        .map((chapter) => chapter.chapter_label)
        .join('、')}${emptyChapters.length > 4 ? ' 等' : ''}），按阶段推进即可，不必一次写完 24 章`
    )
  }

  const hollow = chapters.filter((chapter) => chapter.quality_notes.some((note) => note.includes('空话')))
  if (hollow.length > 0) {
    steps.push(
      `${hollow.length} 章内容偏空（${hollow
        .slice(0, 3)
        .map((chapter) => chapter.chapter_label)
        .join('、')}${hollow.length > 3 ? ' 等' : ''}）：命中空话套话，建议改成具体描述`
    )
  }
  const noNumber = chapters.filter((chapter) => chapter.quality_notes.some((note) => note.includes('数字')))
  if (noNumber.length > 0) {
    steps.push(`${noNumber.length} 章偏长但缺可验证的数字/实例，建议补具体数值`)
  }

  if (total_missing > concept.missing_count) {
    steps.push(
      `全文（发行阶段口径）还差 ${total_missing} 个必填字段；不急——立项/研发/发行是按阶段推进的，先把当前阶段写满`
    )
  }

  if (report.references.length > 0) {
    const real = report.references.filter((item) => item.kind !== 'project-sample')
    if (real.length > 0) {
      steps.push(
        `可对照下面「有出处的参照文档」逐字段核对（如 ${real[0].title}：立于 ${real[0].kindLabel}）；它们是真实文档，缺口同样保留`
      )
    }
  }

  /*
   * 校验的**硬错误**（必填/格式/冲突/依赖）不是「完备度缺口」——完备度只看必填填没填，
   * 但一份「字段都填了、格式却写错」的稿子同样不能开工。这里显式点出来，避免
   * 用户看到「完备度 100%」却在校验里撞一头包。
   */
  if (hardErrors > 0) {
    steps.push(`另有 ${hardErrors} 条校验错误（格式异常/跨章冲突/依赖缺失），打开「校验」逐条处理`)
  }

  return steps
}

/** 该章是否属于立项阶段（用于 next_steps 只点立项缺口） */
function conceptStageChapter(chapter: ChapterKey): boolean {
  return chaptersUpToStage('concept').includes(chapter)
}

/**
 * 计算完备度报告。
 *
 * @param doc 被评估的文档
 * @param validationErrors 可选：调用方已算好的校验结果（避免重复跑校验）。
 *   不传时本函数内部自行调用 `validateCeshu`——仅用于让「完备度」与「校验」同源可核。
 */
export function computeReadiness(doc: CeshuDocument, validationErrors?: string[]): CeshuReadinessReport {
  const gameType = getGameType(doc)
  const errors = validationErrors ?? validateCeshu(doc)
  // 逐章进度对全部可见章计算（与导航/进度条一致，不传 stage）
  const progress = computeChapterProgress(doc)
  const visible = visibleChaptersForDoc(doc).filter((chapter) => chapterCounts(chapter, doc, gameType))

  const chapters = visible.map((chapter) => chapterReadiness(doc, chapter, progress))

  const stageMap = {} as Record<CeshuStage, CeshuStageReadiness>
  for (const stage of READINESS_STAGE_ORDER) stageMap[stage] = stageReadiness(doc, stage, gameType)

  const totalRequired = chapters.reduce((sum, chapter) => sum + chapter.required_total, 0)
  const totalFilled = chapters.reduce((sum, chapter) => sum + chapter.required_filled, 0)
  const totalRatio = totalRequired === 0 ? 1 : Math.round((totalFilled / totalRequired) * 100) / 100

  const base: Omit<CeshuReadinessReport, 'next_steps'> = {
    concept: stageMap.concept,
    production: stageMap.production,
    release: stageMap.release,
    chapters,
    total_missing: totalRequired - totalFilled,
    total_required: totalRequired,
    total_ratio: totalRatio,
    references: compareWithReferences(doc)
  }

  const hardErrors = countHardErrors(errors)
  return { ...base, next_steps: buildNextSteps(base, hardErrors) }
}

/** 硬错误数（必填/格式/冲突/依赖）——与校验面板同一套分类，只数 `severity === 'error'` */
function countHardErrors(messages: readonly string[]): number {
  return messages.filter((message) => classifyValidationMessage(message).severity === 'error').length
}

/**
 * 校验与完备度的**一致性**自查：完备度说缺 N 个必填，校验也应当报 N 条「为必填项」。
 *
 * 两条链路各自独立实现（完备度数 isFilledValue，校验数 isEmptyRequiredValue），
 * 口径本就应有差异（空对象 {} 在两边判定不同）。此函数故意保守：只在**多出**时告警，
 * 供单测守卫「完备度不会比校验更宽松」。
 */
export function readinessFillGap(doc: CeshuDocument, validationErrors?: string[]): number {
  const errors = validationErrors ?? validateCeshu(doc)
  const requiredErrors = errors.filter((message) => message.includes('为必填项')).length
  return computeReadiness(doc, errors).total_missing - requiredErrors
}

/** 横排展示阶段名（导出报告用） */
export function readinessStageLabel(stage: CeshuStage): string {
  return CESHU_STAGE_LABELS[stage]
}

/* ---- 导出：Markdown 报告 ---- */

/** 转义 Markdown 表格单元格里的竖线 */
function escapeCell(text: string): string {
  return text.replace(/\|/g, '\\|')
}

/**
 * 生成完备度报告的 Markdown 文本（纯函数：调用方传游戏名/类型/时间戳便于固定与展示）。
 *
 * 与旧评分报告的**关键差异**：不再有「总分 / 等级 S-D / 三维度 30+40+30」，
 * 换成「各阶段必填覆盖 + 逐章缺口」；「同行业对比」换成**注明出处**的参照文档对比。
 */
export function buildReadinessReportMarkdown(
  gameName: string,
  gameType: string,
  report: CeshuReadinessReport,
  timestamp: string
): string {
  const r = report
  const pct = (n: number): string => `${Math.round(n * 100)}%`
  const lines: string[] = [
    '# 策划书完备度报告',
    '',
    `**游戏名称**: ${gameName || '未命名'}`,
    `**游戏类型**: ${gameType || '未指定'}`,
    `**生成时间**: ${timestamp}`,
    '',
    '> 本报告只做**可复算的完备度统计**，不给出总分或等级。',
    '> 是否「够用」请对照下方**有出处**的参照文档判断。',
    '',
    '## 阶段完备度',
    '',
    '| 阶段 | 必填覆盖 | 缺口 | 适用章数 |',
    '|------|----------|------|----------|',
    `| 立项 | ${r.concept.required_filled}/${r.concept.required_total}（${pct(r.concept.ratio)}） | ${r.concept.missing_count} | ${r.concept.chapter_count} |`,
    `| 研发 | ${r.production.required_filled}/${r.production.required_total}（${pct(r.production.ratio)}） | ${r.production.missing_count} | ${r.production.chapter_count} |`,
    `| 发行 | ${r.release.required_filled}/${r.release.required_total}（${pct(r.release.ratio)}） | ${r.release.missing_count} | ${r.release.chapter_count} |`,
    '',
    `**全文**: 必填 ${r.total_required - r.total_missing}/${r.total_required}（${pct(r.total_ratio)}），还差 ${r.total_missing} 项`,
    '',
    '## 下一步',
    ''
  ]
  for (const step of r.next_steps) lines.push(`- ${step}`)

  lines.push('', '## 逐章缺口', '', '| 章节 | 必填 | 字数 | 完成度 | 缺失必填 |', '|------|------|------|--------|----------|')
  for (const chapter of r.chapters) {
    const missing =
      chapter.missing_required.length > 0
        ? chapter.missing_required.map((field) => fieldLabelOf(chapter.chapter_key, field)).join('、')
        : '—'
    lines.push(
      `| ${escapeCell(chapter.chapter_label)} | ${chapter.required_filled}/${chapter.required_total} | ${chapter.word_count} | ${pct(chapter.completion)} | ${escapeCell(missing)} |`
    )
  }

  if (r.references.length > 0) {
    lines.push(
      '',
      '## 参照文档对比（有出处）',
      '',
      '> 只比**立项阶段同一批必填字段**；每条都注明出处，可自行核对。',
      '',
      '| 参照文档 | 出处类型 | 覆盖 | 你的覆盖 | 差距 | 出处 |',
      '|----------|----------|------|----------|------|------|'
    )
    for (const reference of r.references) {
      const where = reference.url !== undefined ? reference.url : (reference.path ?? reference.attribution)
      lines.push(
        `| ${escapeCell(reference.title)} | ${escapeCell(reference.kindLabel)} | ${reference.covered}/${reference.total}（${pct(reference.ratio)}） | ${reference.docCovered}/${reference.total} | ${reference.delta >= 0 ? '+' : ''}${reference.delta} | ${escapeCell(where)} |`
      )
    }
    lines.push('', '出处明细：')
    for (const reference of r.references) {
      const where = reference.url ?? reference.path
      lines.push(`- **${reference.title}**（${reference.kindLabel}）：${reference.attribution}${where ? ` — ${where}` : ''}`)
    }
  }

  return lines.join('\n')
}
