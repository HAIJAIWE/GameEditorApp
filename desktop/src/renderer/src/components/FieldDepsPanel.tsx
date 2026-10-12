import { useEffect, useState } from 'react'

import { CHAPTER_LABELS, type ChapterKey } from '../../../shared/ceshuConstants'
import {
  DEP_TYPE_LABELS,
  STATUS_META as DEP_STATUS_META,
  type CeshuFieldDepsReport,
  type FieldDependencyType,
  type FieldDependencyStatus
} from '../../../shared/domain/ceshu/ceshuFieldDeps'
import { toErrorMessage } from '../../../shared/util/errors'

/**
 * 依赖检查面板（对应 Python FieldDependencyGraphDialog + SystemDependencyGraphDialog 的数据部分）：
 * - 字段依赖视图：20 条依赖逐条结果（章节.字段 → 章节.字段，状态着色）+ 章节分层（最长依赖链）
 * - 系统依赖视图：13 个系统分层 + 依赖边（缺失依赖标红）+ 缺失明细
 * 说明：Python 用 QGraphics 画布绘图，TS 改为「分层列表 + 边表」的等价表达（信息一致、可测）。
 */

interface FieldDepsPanelProps {
  ceshuId: string
  onClose: () => void
}

type View = 'field' | 'system'

function chapterLabel(key: string): string {
  return CHAPTER_LABELS[key as ChapterKey] ?? key
}

export default function FieldDepsPanel({ ceshuId, onClose }: FieldDepsPanelProps) {
  const [report, setReport] = useState<CeshuFieldDepsReport | null>(null)
  const [view, setView] = useState<View>('field')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.mbApi.ceshu
      .fieldDeps({ id: ceshuId })
      .then((loaded) => {
        if (!cancelled) setReport(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [ceshuId])

  const statusOf = (status: FieldDependencyStatus): { icon: string; color: string; label: string } =>
    DEP_STATUS_META[status]

  const warnings = report?.results.filter((item) => item.status === 'warning').length ?? 0
  const violations = report?.results.filter((item) => item.status === 'violation').length ?? 0

  return (
    <div className="changelog-panel" data-testid="fielddeps-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">依赖检查（字段依赖 + 系统依赖）</span>
        <div className="editor-actions">
          <button
            type="button"
            className={`btn${view === 'field' ? ' primary' : ''}`}
            data-testid="fielddeps-view-field"
            onClick={() => setView('field')}
          >
            字段依赖
          </button>
          <button
            type="button"
            className={`btn${view === 'system' ? ' primary' : ''}`}
            data-testid="fielddeps-view-system"
            onClick={() => setView('system')}
          >
            系统依赖
          </button>
          <button type="button" className="btn" data-testid="fielddeps-close" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>

      {error && (
        <div className="form-error" data-testid="fielddeps-error">
          {error}
        </div>
      )}

      {!report ? (
        <div className="empty">正在检查依赖…</div>
      ) : view === 'field' ? (
        <>
          <div className="changelog-entry" data-testid="fielddeps-summary">
            字段依赖共 {report.results.length} 条：✅ 通过{' '}
            {report.results.length - warnings - violations} · ⚠️ 警告 {warnings} · ❌ 冲突 {violations} · 章节分层{' '}
            {report.field_graph.layers.length} 层 · 依赖边 {report.field_graph.edges.length} 条
          </div>

          <div className="changelog-entry">
            <div className="form-label">章节分层（依赖链从下往上）</div>
            {report.field_graph.layers.map((layer, index) => (
              <div className="deps-layer" key={`field-layer-${index}`} data-testid="fielddeps-layer">
                <span className="deps-layer-index">L{index}</span>
                {layer.map((chapter) => {
                  const status = report.chapter_status[chapter] ?? 'ok'
                  const meta = statusOf(status)
                  return (
                    <span
                      className="deps-node"
                      key={chapter}
                      style={{ borderColor: meta.color, color: meta.color }}
                      title={`${chapterLabel(chapter)}：${meta.label}`}
                    >
                      {chapterLabel(chapter)}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="changelog-entry">
            <div className="form-label">依赖明细</div>
            <table className="score-table" data-testid="fielddeps-table">
              <thead>
                <tr>
                  <th>依赖</th>
                  <th>类型</th>
                  <th>状态</th>
                  <th>说明</th>
                </tr>
              </thead>
              <tbody>
                {report.results.map((item, index) => {
                  const meta = statusOf(item.status)
                  return (
                    <tr key={`${item.dependency.source_chapter}-${item.dependency.target_chapter}-${index}`} data-testid="fielddeps-row">
                      <td>
                        {chapterLabel(item.dependency.source_chapter)}.{item.dependency.source_field} →{' '}
                        {chapterLabel(item.dependency.target_chapter)}.{item.dependency.target_field}
                      </td>
                      <td>{DEP_TYPE_LABELS[item.dependency.dependency_type as FieldDependencyType]}</td>
                      <td style={{ color: meta.color }} data-testid="fielddeps-row-status">
                        {meta.icon} {meta.label}
                      </td>
                      <td>{item.message}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </>
      ) : (
        <>
          <div className="changelog-entry" data-testid="fielddeps-system-summary">
            {report.system_graph.missing_dependencies.length === 0 ? (
              <>系统依赖：✅ 已启用系统的依赖全部满足 · 节点 {report.system_graph.nodes.length} · 依赖边{' '}
                {report.system_graph.edges.length} · 分层 {report.system_graph.layers.length} 层</>
            ) : (
              <>
                系统依赖缺失 {report.system_graph.missing_dependencies.length} 项：
                {report.system_graph.missing_dependencies.map((item) => (
                  <span className="deps-missing" key={item.system} data-testid="fielddeps-missing">
                    {item.system} 缺少 {item.missing.join('、')}
                  </span>
                ))}
              </>
            )}
          </div>

          <div className="changelog-entry">
            <div className="form-label">系统分层（依赖链从下往上）</div>
            {report.system_graph.layers.map((layer, index) => (
              <div className="deps-layer" key={`system-layer-${index}`} data-testid="fielddeps-system-layer">
                <span className="deps-layer-index">L{index}</span>
                {layer.map((system) => {
                  const node = report.system_graph.nodes.find((item) => item.system === system)
                  const color = node?.has_missing_dependency ? '#EF4444' : node?.enabled ? '#22C55E' : '#888888'
                  return (
                    <span className="deps-node" key={system} style={{ borderColor: color, color }} title={node?.label ?? system}>
                      {node?.label ?? system}
                      {node?.enabled ? '（已启用）' : ''}
                    </span>
                  )
                })}
              </div>
            ))}
          </div>

          <div className="changelog-entry">
            <div className="form-label">依赖边</div>
            <table className="score-table" data-testid="fielddeps-system-table">
              <thead>
                <tr>
                  <th>系统</th>
                  <th>依赖</th>
                  <th>源/目标启用</th>
                  <th>状态</th>
                </tr>
              </thead>
              <tbody>
                {report.system_graph.edges.map((edge, index) => (
                  <tr key={`${edge.source_system}-${edge.target_system}-${index}`} data-testid="fielddeps-system-edge">
                    <td>{edge.source_system}</td>
                    <td>{edge.target_system}</td>
                    <td>
                      {edge.source_enabled ? '✅' : '—'} / {edge.target_enabled ? '✅' : '—'}
                    </td>
                    <td style={{ color: edge.missing ? '#EF4444' : '#22C55E' }}>
                      {edge.missing ? '✖ 依赖缺失' : '✓ 满足'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  )
}