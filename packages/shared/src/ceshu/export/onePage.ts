import type { CeshuDocument } from '../reference'
import { displayFieldValue } from '../fields'
import {
  chapterDataForDoc,
  chapterFieldsForDoc,
  chapterLabelForDoc,
  computeChapterProgress,
  isSoftwareDoc,
  requiredFieldsForDoc,
  visibleChaptersForDoc
} from '../model'
import { CESHU_STAGE_LABELS, chaptersUpToStage, isMachineDataField } from '../workflow'

/**
 * 一页摘要（2026 对齐，见 `docs/one-page-overview.md`）。
 *
 * 把「立项阶段」压成一页，与 UI 的「一页总览」**同口径**：必填一律列出（空 → 「（待填）」）、
 * 非必填只列已填、机读数据只给计数、按档位 × 品类 × 模块裁剪。
 *
 * `level` 控制各章小标题的层级：独立一页用 2（`##`），嵌进「交付版」时用 3（`###`）。
 *
 * 2026-11-07 从 `apps/desktop/src/main/ceshu/export/content/onepage.ts` 下沉到 shared：
 * 它只依赖 shared 的纯函数，渲染层（一键生成面板）也需要用它做**生成后的一页 pitch 预览**。
 * main 侧保留同名 re-export，既有 import 路径不变。
 */
export function renderOnePageSummary(doc: CeshuDocument, level: 2 | 3 = 2): string {
  const stage = 'concept' as const
  const visible = visibleChaptersForDoc(doc)
  // 阶段是游戏研发流程概念：应用档不做阶段裁剪，直接铺 SDD 全章。
  const chapters: readonly string[] =
    isSoftwareDoc(doc)
      ? visible
      : chaptersUpToStage(stage).filter((chapter) => visible.includes(chapter))
  const progress = computeChapterProgress(doc)
  const hashes = '#'.repeat(level)

  let requiredTotal = 0
  let requiredFilled = 0
  const sections: string[] = []

  for (const chapter of chapters) {
    const data = chapterDataForDoc(doc, chapter)
    const fields = chapterFieldsForDoc(doc, chapter)
    const required = new Set(requiredFieldsForDoc(doc, chapter))
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
    const head = `${hashes} ${chapterLabelForDoc(doc, chapter)}（${pct}%）`
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
  const meta = doc.meta as Record<string, unknown>
  // 应用档把项目名写在 project_name，游戏档在 game_name；两者都取不到才回落。
  const rawName = typeof meta.game_name === 'string' && meta.game_name.trim() !== '' ? meta.game_name : meta.project_name
  const gameName = typeof rawName === 'string' && rawName.trim() !== '' ? rawName.trim() : '未命名策划书'
  return `# 《${gameName}》· 一页摘要\n\n${renderOnePageSummary(doc, 2)}\n`
}
