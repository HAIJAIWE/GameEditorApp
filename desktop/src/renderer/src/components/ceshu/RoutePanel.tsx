import { useMemo, type ReactElement } from 'react'

import type { CeshuDocument } from '../../../../shared/ceshu/ceshuConstants'
import { analyzeParallelism, buildHandoffPlan, planHandoffDocs } from '../../../../shared/ceshu/ceshuHandoff'

/**
 * 开发路线面板。
 *
 * 把「路线清晰」变成一眼能看的东西：**几波、每波能并行做什么、每份文档门禁过没过**。
 * 数据全部来自交接包已有的 `planHandoffDocs` / `buildHandoffPlan` / `analyzeParallelism`，
 * 本组件只负责呈现——不新增任何口径。
 */

interface Props {
  doc: CeshuDocument
  onClose: () => void
}

export default function RoutePanel({ doc, onClose }: Props): ReactElement {
  const planned = useMemo(() => planHandoffDocs(doc), [doc])
  const plan = useMemo(() => buildHandoffPlan(doc), [doc])
  const parallelism = useMemo(() => analyzeParallelism(doc, { plan, planned }), [doc, plan, planned])
  const statusById = useMemo(
    () => new Map(plan.flatMap((item) => item.docs).map((status) => [status.doc.id, status])),
    [plan]
  )

  return (
    <div className="review-overlay" data-testid="route-overlay" onClick={onClose}>
      <div className="review-panel" data-testid="route-panel" onClick={(event) => event.stopPropagation()}>
        <div className="review-panel-header">
          <span>开发路线</span>
          <button type="button" className="btn slim" data-testid="route-close" onClick={onClose}>
            关闭
          </button>
        </div>

        <div className="item-meta">
          共 {planned.length} 份文档 / {parallelism.waves.length} 波
          {parallelism.parallelGroups.length > 0 &&
            ` ｜ 可并行：${parallelism.parallelGroups.map((group) => group.join(' + ')).join('；')}`}
        </div>
        <div className="item-meta">
          开工第一份：<code>{planned[0]?.path ?? '—'}</code>
        </div>

        {parallelism.waves.map((wave) => (
          <div className="impact-section" key={wave.index}>
            <h4>
              第 {wave.index + 1} 波 · {wave.volumes.map((volume) => volume.folder).join('、')}
            </h4>
            <ul className="impact-list">
              {wave.docs.map((path) => {
                const item = planned.find((candidate) => candidate.path === path)
                const status = item === undefined ? undefined : statusById.get(item.def.id)
                const mark =
                  status === undefined ? '—' : !status.applicable ? '—' : status.ready ? '✅' : '⏳'
                const gate =
                  status === undefined
                    ? ''
                    : `（字段 ${status.fieldFilled}/${status.fieldTotal}${
                        status.blockers.length > 0 ? `，问题 ${status.blockers.length}` : ''
                      }）`
                return (
                  <li key={path}>
                    {mark} <code>{path}</code>
                    {gate}
                  </li>
                )
              })}
            </ul>
          </div>
        ))}

        {parallelism.conflicts.length > 0 && (
          <div className="impact-section">
            <h4>并行前先约口径（跨卷共享字段）</h4>
            <ul className="impact-list">
              {parallelism.conflicts.slice(0, 8).map((conflict) => (
                <li key={`${conflict.a}-${conflict.b}`}>
                  <code>{conflict.a}</code> ↔ <code>{conflict.b}</code>：{conflict.fields.join('、')}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
