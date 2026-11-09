import { useT } from '@mobai/client-ui'
import { type CeshuDocument } from '@mobai/shared/ceshu/reference'
import { displayFieldValue } from '@mobai/shared/ceshu/fields'
import {
  chapterDataForDoc,
  chapterFieldsForDoc,
  chapterLabelForDoc,
  getDocKind,
  requiredFieldsForDoc,
  visibleChaptersForDoc
} from '@mobai/shared/ceshu/model'
import { CESHU_STAGE_LABELS, chaptersUpToStage, isMachineDataField, type CeshuStage } from '@mobai/shared/ceshu/workflow'

/**
 * 一页式总览（2026 对齐）。
 *
 * 2026 年 GDD 主流是「一页讲清 → 分层展开」（见 `docs/gdd-2026-state-of-practice.md`），
 * 而我们此前只有「逐章编辑」。本组件把当前阶段的章节压成一页**只读**摘要：
 * - 每个字段显示：**必填一律显示**（空则「待填」）、**非必填仅显示已填**——一页既看全貌也看缺口；
 * - 机读数据（账本/断言/用例…）不进正文，只在章尾给一句「另有 N 项机读数据（不计入完成度）」；
 * - 按品类剔除不适用章（如无战斗品类的 combat）。
 *
 * 只读：不提供编辑，避免与 ChapterForm 的保存/字段状态逻辑打架。
 */
interface CeshuOverviewProps {
  doc: CeshuDocument
  stage: CeshuStage
  /** 与编辑器进度条同源（computeChapterProgress 的结果） */
  progress: Record<string, number>
}

interface OverviewRow {
  key: string
  label: string
  value: string
  required: boolean
  filled: boolean
}

export default function CeshuOverview({ doc, stage, progress }: CeshuOverviewProps) {
  const t = useT()
  const visible = visibleChaptersForDoc(doc)
  // 阶段是游戏研发流程概念：软件档（应用 / AI）不做阶段裁剪，直接铺全章。
  const chapters: readonly string[] =
    getDocKind(doc) !== 'game'
      ? visible
      : chaptersUpToStage(stage).filter((chapter) => visible.includes(chapter))

  // 每章算出自己的行与必填计数（纯函数，不在 map 里改外部累加器——否则触发 react-hooks/immutability）
  const sections = chapters.map((chapter) => {
    const data = chapterDataForDoc(doc, chapter)
    const fields = chapterFieldsForDoc(doc, chapter)
    const required = new Set(requiredFieldsForDoc(doc, chapter))
    const bodyFields = fields.filter((field) => !isMachineDataField(chapter, field.key))
    const machineCount = fields.length - bodyFields.length

    const rows: OverviewRow[] = []
    for (const field of bodyFields) {
      const isRequired = required.has(field.key)
      const value = displayFieldValue(field, data[field.key])
      const filled = value !== ''
      // 必填一律显示（含待填）；非必填只显示已填
      if (isRequired || filled) {
        rows.push({ key: field.key, label: field.label, value, required: isRequired, filled })
      }
    }

    const pct = Math.round((progress[chapter] ?? 0) * 100)
    const requiredCount = rows.filter((row) => row.required).length
    const filledRequired = rows.filter((row) => row.required && row.filled).length
    return { chapter, label: chapterLabelForDoc(doc, chapter), pct, rows, machineCount, requiredCount, filledRequired }
  })

  const requiredTotal = sections.reduce((sum, section) => sum + section.requiredCount, 0)
  const requiredFilled = sections.reduce((sum, section) => sum + section.filledRequired, 0)
  const overall = requiredTotal === 0 ? 0 : Math.round((requiredFilled / requiredTotal) * 100)

  return (
    <div className="ceshu-overview" data-testid="ceshu-overview">
      <header className="overview-head">
        <h2 className="overview-title">{t('ceshu.overview.title', { stage: CESHU_STAGE_LABELS[stage] })}</h2>
        <p className="overview-summary">
          {t('ceshu.overview.summary', {
            sections: chapters.length,
            filled: requiredFilled,
            total: requiredTotal,
            pct: overall
          })}
          {requiredTotal - requiredFilled > 0 && (
            <span className="overview-gap">
              {t('ceshu.overview.gap', { count: requiredTotal - requiredFilled })}
            </span>
          )}
        </p>
      </header>

      {sections.map((section) => (
        <section key={section.chapter} className="overview-chapter" data-testid={`overview-chapter-${section.chapter}`}>
          <h3 className="overview-chapter-head">
            <span>{section.label}</span>
            <span className={`overview-pct${section.pct >= 80 ? ' hi' : section.pct >= 50 ? ' mid' : ' low'}`}>
              {section.pct}%
            </span>
          </h3>
          {section.rows.length === 0 ? (
            <p className="overview-empty-note">{t('ceshu.overview.empty')}</p>
          ) : (
            <dl className="overview-fields">
              {section.rows.map((row) => (
                <div key={row.key} className="overview-field" data-testid={`overview-field-${section.chapter}-${row.key}`}>
                  <dt className={`overview-field-label${row.required ? ' required' : ''}`}>
                    {row.label}
                    {row.required ? ' *' : ''}
                  </dt>
                  <dd className={`overview-field-value${row.filled ? '' : ' empty'}`}>
                    {row.filled ? row.value : t('ceshu.overview.pending')}
                  </dd>
                </div>
              ))}
            </dl>
          )}
          {section.machineCount > 0 && (
            <p className="overview-machine-note">
              {t('ceshu.overview.machine', { count: section.machineCount })}
            </p>
          )}
        </section>
      ))}
    </div>
  )
}
