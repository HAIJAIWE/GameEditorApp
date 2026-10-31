import { useMemo, type ReactElement } from 'react'

import type { CeshuDocument } from '../../../../shared/ceshu/reference'
import { findCouplingGaps } from '../../../../shared/ceshu/workflow'
import { analyzeParallelism } from '../../../../shared/ceshu/workflow'
import { buildHandoffPlan, planHandoffDocs } from '../../../../shared/ceshu/workflow'
import { computeReadiness } from '../../../../shared/ceshu/readiness'

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
          <span>开发交接体检</span>
          <button type="button" className="btn slim" data-testid="health-close" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="item-meta">
          一句话判据：<strong>这份包现在能不能一路做完</strong>
        </div>

        <div className="impact-section">
          <h4>设计完成度 · {pct}%</h4>
          <div className="item-meta">
            必填 {filled}/{readiness.total_required} ｜ 立项 {pctOf(readiness.concept.required_filled, readiness.concept.required_total)}% ｜ 研发{' '}
            {pctOf(readiness.production.required_filled, readiness.production.required_total)}% ｜ 发行{' '}
            {pctOf(readiness.release.required_filled, readiness.release.required_total)}%
          </div>
        </div>

        <div className="impact-section">
          <h4>交接门禁</h4>
          <div className="item-meta">
            ✅ 可开工 {readyCount} ｜ ⏳ 待补 {blockedCount} ｜ — 不适用 {naCount}
          </div>
          {blocked.length > 0 && (
            <ul className="impact-list">
              {blocked.slice(0, 12).map((item) => {
                const reasons: string[] = []
                if (item.fieldFilled < item.fieldTotal) reasons.push(`缺 ${item.fieldTotal - item.fieldFilled} 字段`)
                if (item.blockers.length > 0) reasons.push(`问题 ${item.blockers.length}`)
                return (
                  <li key={item.path}>
                    ⏳ <code>{item.path}</code> — {item.doc.title}（{reasons.join('，')}）
                  </li>
                )
              })}
            </ul>
          )}
        </div>

        <div className="impact-section">
          <h4>并行机会</h4>
          <div className="item-meta">
            {parallelism.waves.length} 波
            {parallelism.parallelGroups.length > 0 &&
              ` ｜ 可并行：${parallelism.parallelGroups.map((group) => group.join(' + ')).join('、')}`}
          </div>
          {parallelism.conflicts.length > 0 && (
            <ul className="impact-list">
              {parallelism.conflicts.slice(0, 8).map((conflict) => (
                <li key={`${conflict.a}-${conflict.b}`}>
                  <code>{conflict.a}</code> ↔ <code>{conflict.b}</code>：{conflict.fields.join('、')}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="impact-section">
          <h4>可开发性缺口 · {gaps.length} 个</h4>
          {gaps.length === 0 ? (
            <div className="item-meta">无——填了的地方都能开工。</div>
          ) : (
            <ul className="impact-list">
              {gaps.map((gap) => (
                <li key={`${gap.chapter}-${gap.field}`}>
                  {gap.because}已填，但「{gap.label}」为空——{gap.why}
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="impact-section">
          <h4>下一步</h4>
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
