import { useMemo, type ReactElement } from 'react'

import { useT } from '@mobai/client-ui'

import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import { findCouplingGaps } from '@mobai/shared/ceshu/workflow'
import { analyzeParallelism } from '@mobai/shared/ceshu/workflow'
import { buildHandoffPlan, planHandoffDocs } from '@mobai/shared/ceshu/workflow'
import { computeReadiness } from '@mobai/shared/ceshu/readiness'

/**
 * 开发交接体检面板。
 *
 * 把「完整 + 路线清晰」凝成一个开发者一眼能看的视图：设计填了多少、哪些文档能开工、
 * 哪些填了却交不了活、下一步先做什么。数据全部来自交接包已有的分析器
 * （`computeReadiness` / `buildHandoffPlan` / `analyzeParallelism` / `findCouplingGaps`），
 * 本组件只负责呈现——不新增任何口径。导出侧有同源的 `renderHandoffHealthMarkdown`。
 */

interface Props {
  doc: CeshuDocument
  onClose: () => void
}

function pctOf(filled: number, total: number): number {
  return total === 0 ? 100 : Math.round((filled / total) * 100)
}

export default function HealthPanel({ doc, onClose }: Props): ReactElement {
  const t = useT()
  const planned = useMemo(() => planHandoffDocs(doc), [doc])
  const plan = useMemo(() => buildHandoffPlan(doc), [doc])
  const parallelism = useMemo(() => analyzeParallelism(doc, { plan, planned }), [doc, plan, planned])
  const readiness = useMemo(() => computeReadiness(doc), [doc])
  const gaps = useMemo(() => findCouplingGaps(doc), [doc])

  const docs = plan.flatMap((volume) => volume.docs)
  const readyCount = docs.filter((item) => item.applicable && item.ready).length
  const blockedCount = docs.filter((item) => item.applicable && !item.ready).length
  const naCount = docs.filter((item) => !item.applicable).length
  const blocked = docs.filter((item) => item.applicable && !item.ready)

  const filled = readiness.total_required - readiness.total_missing
  const pct = Math.round(readiness.total_ratio * 100)

  return (
    <div className="review-overlay" data-testid="health-overlay" onClick={onClose}>
      <div className="review-panel" data-testid="health-panel" onClick={(event) => event.stopPropagation()}>
        <div className="review-panel-header">
          <span>{t('health.title')}</span>
          <button type="button" className="btn slim" data-testid="health-close" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>

        <div className="item-meta">
          {t('health.verdict')}
          <strong>{t('health.verdictStrong')}</strong>
        </div>

        <div className="impact-section">
          <h4>{t('health.completeness', { pct })}</h4>
          <div className="item-meta">
            {t('health.requiredLine', {
              filled,
              total: readiness.total_required,
              concept: pctOf(readiness.concept.required_filled, readiness.concept.required_total),
              production: pctOf(readiness.production.required_filled, readiness.production.required_total),
              release: pctOf(readiness.release.required_filled, readiness.release.required_total)
            })}
          </div>
        </div>

        <div className="impact-section">
          <h4>{t('health.gates')}</h4>
          <div className="item-meta">
            {t('health.gateSummary', { ready: readyCount, blocked: blockedCount, na: naCount })}
          </div>
          {blocked.length > 0 && (
            <ul className="impact-list">
              {blocked.slice(0, 12).map((item) => {
                const reasons: string[] = []
                if (item.fieldFilled < item.fieldTotal)
                  reasons.push(t('health.gateReasonMissing', { n: item.fieldTotal - item.fieldFilled }))
                if (item.blockers.length > 0) reasons.push(t('health.gateReasonBlockers', { n: item.blockers.length }))
                return (
                  <li key={item.path}>
                    ⏳ <code>{item.path}</code> — {item.doc.title}
                    {t('health.gateSuffix', { reasons: reasons.join(t('health.listSeparator')) })}
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="impact-section">
          <h4>{t('health.parallel')}</h4>
          <div className="item-meta">
            {t('health.waves', { n: parallelism.waves.length })}
            {parallelism.parallelGroups.length > 0 &&
              t('health.parallelGroups', {
                groups: parallelism.parallelGroups.map((group) => group.join(' + ')).join(t('health.listSeparator'))
              })}
          </div>
          {parallelism.conflicts.length > 0 && (
            <ul className="impact-list">
              {parallelism.conflicts.slice(0, 8).map((conflict) => (
                <li key={`${conflict.a}-${conflict.b}`}>
                  <code>{conflict.a}</code> ↔ <code>{conflict.b}</code>
                  {t('health.conflictFields', { fields: conflict.fields.join(t('health.listSeparator')) })}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="impact-section">
          <h4>{t('health.gaps', { n: gaps.length })}</h4>
          {gaps.length === 0 ? (
            <div className="item-meta">{t('health.noGaps')}</div>
          ) : (
            <ul className="impact-list">
              {gaps.map((gap) => (
                <li key={`${gap.chapter}-${gap.field}`}>
                  {t('health.gapLine', { because: gap.because, label: gap.label, why: gap.why })}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="impact-section">
          <h4>{t('health.nextSteps')}</h4>
          <ul className="impact-list">
            {readiness.next_steps.map((step, index) => (
              <li key={index}>{step}</li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  )
}
