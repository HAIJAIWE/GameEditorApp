import { useEffect, useState } from 'react'

import type { ReferenceReport } from '../../../../shared/util/search'
import type { DataTypeDef } from '../../../../shared/types'

/**
 * 引用关系面板：
 * 被谁引用（全库反向扫描）/ 引用了谁（按 id 精确解析，悬空 token 显示原文）/ 相似数据（同类型字段重合度）。
 * 行可点击跳转到目标条目（复用主列表的类型切换 + 选中逻辑）。
 */

export interface ReferenceTarget {
  type: string
  id: string
  /** 展示用名称（跳转时由来源行携带，避免目标类型列表未加载时显示不出名字） */
  name: string
}

type RefTab = 'referencedBy' | 'references' | 'similar'

interface ReferencesPanelProps {
  target: ReferenceTarget
  types: DataTypeDef[]
  onJump: (type: string, itemId: string, name: string) => void
  onClose: () => void
}

export default function ReferencesPanel({ target, types, onJump, onClose }: ReferencesPanelProps) {
  // 报告与其归属条目 id 一起存放：id 不匹配即视为「加载中」，避免在 effect 内同步清空状态
  const [state, setState] = useState<{ id: string; report: ReferenceReport | null; error: string | null }>({
    id: '',
    report: null,
    error: null
  })
  const [tab, setTab] = useState<RefTab>('referencedBy')

  useEffect(() => {
    let cancelled = false
    const id = target.id
    window.mbApi.data
      .references({ id })
      .then((data) => {
        if (!cancelled) setState({ id, report: data, error: null })
      })
      .catch((err: unknown) => {
        if (!cancelled) setState({ id, report: null, error: err instanceof Error ? err.message : String(err) })
      })
    return () => {
      cancelled = true
    }
  }, [target.id])

  const report = state.id === target.id ? state.report : null
  const error = state.id === target.id ? state.error : null

  const typeName = (typeId: string | null): string =>
    typeId === null ? '未知类型' : (types.find((def) => def.id === typeId)?.name ?? typeId)

  return (
    <aside className="editor" data-testid="references-panel">
      <div className="editor-header">
        <div className="editor-title">
          引用关系
          <small>
            {target.name} · {typeName(target.type)}
          </small>
        </div>
      </div>

      <div className="editor-body">
        <div className="ref-tabs">
          {(
            [
              ['referencedBy', '被谁引用', report?.referencedBy.length ?? 0],
              ['references', '引用了谁', report?.references.length ?? 0],
              ['similar', '相似数据', report?.similar.length ?? 0]
            ] as Array<[RefTab, string, number]>
          ).map(([key, label, count]) => (
            <button
              key={key}
              type="button"
              className={`ref-tab${tab === key ? ' active' : ''}`}
              data-testid={`ref-tab-${key}`}
              onClick={() => setTab(key)}
            >
              {label}（{count}）
            </button>
          ))}
        </div>

        {error && <div className="form-error">{error}</div>}
        {!report && !error && <div className="empty">正在分析引用关系…</div>}

        {report && tab === 'referencedBy' && (
          report.referencedBy.length === 0 ? (
            <div className="empty" data-testid="ref-empty">
              暂无其他数据引用本条
            </div>
          ) : (
            report.referencedBy.map((row, index) => (
              <button
                key={`${row.type}:${row.itemId}:${row.field}:${index}`}
                type="button"
                className="ref-row"
                data-testid="ref-row"
                title="点击跳转到该条目"
                onClick={() => onJump(row.type, row.itemId, row.itemName)}
              >
                <span className="ref-row-main">{row.itemName}</span>
                <span className="item-meta">
                  {typeName(row.type)} · 字段 {row.field}
                </span>
              </button>
            ))
          )
        )}

        {report && tab === 'references' && (
          report.references.length === 0 ? (
            <div className="empty" data-testid="ref-empty">
              本条目未引用其他数据
            </div>
          ) : (
            report.references.map((row, index) =>
              row.resolved ? (
                <button
                  key={`${row.field}:${row.targetId}:${index}`}
                  type="button"
                  className="ref-row"
                  data-testid="ref-row"
                  title="点击跳转到该条目"
                  onClick={() => onJump(row.targetType ?? '', row.targetId, row.targetName ?? row.raw)}
                >
                  <span className="ref-row-main">{row.targetName}</span>
                  <span className="item-meta">
                    字段 {row.field} · {typeName(row.targetType)}
                  </span>
                </button>
              ) : (
                <div className="ref-row dangling" key={`${row.field}:${row.targetId}:${index}`} data-testid="ref-dangling">
                  <span className="ref-row-main">未解析：{row.raw}</span>
                  <span className="item-meta">字段 {row.field} · 目标可能已删除，或填写的是名称而非 ID</span>
                </div>
              )
            )
          )
        )}

        {report && tab === 'similar' && (
          report.similar.length === 0 ? (
            <div className="empty" data-testid="ref-empty">
              暂无相似数据（同类型且共有非空字段 ≥ 2 才会列出）
            </div>
          ) : (
            report.similar.map((row) => (
              <button
                key={row.itemId}
                type="button"
                className="ref-row"
                data-testid="ref-row"
                title="点击跳转到该条目"
                onClick={() => onJump(target.type, row.itemId, row.itemName)}
              >
                <span className="ref-row-main">{row.itemName}</span>
                <span className="item-meta">
                  相似度 {row.similarity}% · 共同字段 {row.commonFields.join('、')}
                </span>
              </button>
            ))
          )
        )}
      </div>

      <div className="editor-actions">
        <button type="button" className="btn" data-testid="references-close" onClick={onClose}>
          关闭
        </button>
      </div>
    </aside>
  )
}