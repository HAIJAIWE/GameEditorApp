import { useMemo, type ReactElement } from 'react'

import { useT } from '@mobai/client-ui'

import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import { analyzeParallelism } from '@mobai/shared/ceshu/workflow'
import { buildHandoffPlan, planHandoffDocs } from '@mobai/shared/ceshu/workflow'

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
  const t = useT()
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
          <span>{t('route.title')}</span>
          <button type="button" className="btn slim" data-testid="route-close" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>

        <div className="item-meta">
          {t('route.summary', { docs: planned.length, waves: parallelism.waves.length })}
          {parallelism.parallelGroups.length > 0 &&
            t('route.parallel', {
              groups: parallelism.parallelGroups.map((group) => group.join(' + ')).join(t('route.groupSeparator'))
            })}
        </div>
        <div className="item-meta">
          {t('route.firstDoc')}
          <code>{planned[0]?.path ?? '—'}</code>
        </div>

        {parallelism.waves.map((wave) => (
          <div className="impact-section" key={wave.index}>
            <h4>
              {t('route.waveTitle', {
                n: wave.index + 1,
                folders: wave.volumes.map((volume) => volume.folder).join(t('route.listSeparator'))
              })}
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
                    : status.blockers.length > 0
                      ? t('route.gateWithBlockers', {
                          filled: status.fieldFilled,
                          total: status.fieldTotal,
                          blockers: status.blockers.length
                        })
                      : t('route.gate', { filled: status.fieldFilled, total: status.fieldTotal })
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
            <h4>{t('route.conflictsTitle')}</h4>
            <ul className="impact-list">
              {parallelism.conflicts.slice(0, 8).map((conflict) => (
                <li key={`${conflict.a}-${conflict.b}`}>
                  <code>{conflict.a}</code> ↔ <code>{conflict.b}</code>
                  {t('route.conflictFields', { fields: conflict.fields.join(t('route.listSeparator')) })}
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>
    </div>
  )
}
