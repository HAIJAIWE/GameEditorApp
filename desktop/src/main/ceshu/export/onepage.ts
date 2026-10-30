import { CHAPTER_LABELS, CHAPTER_REQUIRED_FIELDS, type CeshuDocument } from '../../../shared/ceshu/ceshuConstants'
import { CESHU_CHAPTER_FIELDS } from '../../../shared/ceshu/ceshuFields'
import { displayFieldValue } from '../../../shared/ceshu/ceshuFieldDisplay'
import { computeChapterProgress, visibleChaptersForDoc } from '../../../shared/ceshu/ceshuModel'
import { CESHU_STAGE_LABELS, chaptersUpToStage, isMachineDataField } from '../../../shared/ceshu/ceshuStages'

/**
 * 一页摘要（2026 对齐，见 `docs/one-page-overview.md`）。
 *
 * 把「立项阶段」压成一页，与 UI 的「一页总览」**同口径**：必填一律列出（空 → 「（待填）」）、
 * 非必填只列已填、机读数据只给计数、按档位 × 品类 × 模块裁剪。
 *
 * `level` 控制各章小标题的层级：独立一页用 2（`##`），嵌进「交付版」时用 3（`###`）。
 */
export function renderOnePageSummary(doc: CeshuDocument, level: 2 | 3 = 2): string {
  const visible = new Set(visibleChaptersForDoc(doc))
  const stage = 'concept' as const
  const chapters = chaptersUpToStage(stage).filter((chapter) => visible.has(chapter))
  const progress = computeChapterProgress(doc)
  const hashes = '#'.repeat(level)

  let requiredTotal = 0
  let requiredFilled = 0
  const sections: string[] = []

  for (const chapter of chapters) {
    const data = (doc[chapter] ?? {}) as Record<string, unknown>
    const fields = CESHU_CHAPTER_FIELDS[chapter] ?? []
    const required = new Set(CHAPTER_REQUIRED_FIELDS[chapter] ?? [])
    const bodyFields = fields.filter((field) => !isMachineDataField(chapter, field.key))
    const machineCount = fields.length - bodyFields.length

    const lines: string[] = []
    for (const field of bodyFields) {
      const isRequired = required.has(field.key)
      const value = displayFieldValue(field, data[field.key])
      const filled = value !== ''
      if (!isRequired && !filled) continue // 非必填只列已填
      if (isRequired) {
        requiredTotal += 1
        if (filled) requiredFilled += 1
      }
      lines.push(`- **${field.label}**：${filled ? value : '（待填）'}`)
    }

    const pct = Math.round((progress[chapter] ?? 0) * 100)
    const head = `${hashes} ${CHAPTER_LABELS[chapter]}（${pct}%）`
    if (lines.length === 0) {
      sections.push(`${head}\n\n（暂无可展示内容）`)
    } else {
      const machine = machineCount > 0 ? `\n\n> 另有 ${machineCount} 项机读数据（不计入完成度）` : ''
      sections.push(`${head}\n\n${lines.join('\n')}${machine}`)
    }
  }

  const overall = requiredTotal === 0 ? 0 : Math.round((requiredFilled / requiredTotal) * 100)
  const gap = requiredTotal - requiredFilled
  const summary = `> ${CESHU_STAGE_LABELS[stage]}阶段 · 必填已填 ${requiredFilled}/${requiredTotal}（${overall}%）${
    gap > 0 ? ` · 还差 ${gap} 项` : ''
  }`

  return `${summary}\n\n${sections.join('\n\n')}`
}

/** 独立的一页摘要导出（`onepage` 格式）：H1 标题 + 一页摘要正文。 */
export function renderCeshuOnePageMarkdown(doc: CeshuDocument): string {
  const rawName = (doc.meta as Record<string, unknown>).game_name
  const gameName = typeof rawName === 'string' && rawName.trim() !== '' ? rawName.trim() : '未命名策划书'
  return `# 《${gameName}》· 一页摘要\n\n${renderOnePageSummary(doc, 2)}\n`
}
