import { useCallback, useEffect, useMemo, useState } from 'react'

import { UNKNOWN_TYPE_COLOR, buildRelationRows, buildSubjectDetailLine, itemDisplayName } from '@mobai/shared/util/search'
import type { DataTypeDef, ItemRecord } from '@mobai/shared/types'

/**
 * 关系图面板（迁移自 旧版 `ui/widgets/relation_graph::RelationTablePanel`，
 * 经 `ui/main_window::_show_relation_graph` 由「工具 → 关系图」菜单打开）。
 *
 * 与 旧版 一致的三段式：类型选择器 + 主体选择器 → 主体信息卡 → 关联数据表（5 列，双击行跳转）。
 * 行构建逻辑在 `shared/util/relationGraph.ts`（纯逻辑，已单测）。
 *
 * ## 与 旧版 的**有意差异**
 * - 旧版 构造时接受 `initial_type/initial_id`（由数据表双击 / AI 工具带入）。TS 没有「数据表页」，
 *   其两个调用点分别属于已下线的旧 IA 与 AI 域（E42 框架重写，不在本轮）→ 面板只保留菜单入口，
 *   不做无人调用的初始化参数（宁缺勿错）。
 * - 旧版 的「刷新」按钮只是重跑本地内存读取；TS 重跑一次 `data.listAll()`（数据在同进程外）。
 */

interface RelationGraphPanelProps {
  types: DataTypeDef[]
  /** 双击关联行 → 跳转到该条目（复用主列表的类型切换 + 选中逻辑） */
  onJump: (type: string, itemId: string, name: string) => void
}

export default function RelationGraphPanel({ types, onJump }: RelationGraphPanelProps) {
  const [items, setItems] = useState<ItemRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  /** 用户显式选过的类型 / 主体；为 null 时按「第一个」派生（不在 effect 里同步 setState） */
  const [typeId, setTypeId] = useState('')
  const [subjectId, setSubjectId] = useState<string | null>(null)
  /** 触发重载的序号（「刷新」按钮 +1） */
  const [reload, setReload] = useState(0)

  useEffect(() => {
    let alive = true
    window.mbApi.data
      .listAll()
      .then((list) => {
        if (alive) setItems(list)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
  }, [reload])

  /** 生效类型：用户选过且仍在 schema 里 → 用之；否则回落第一个类型 */
  const activeType = typeId !== '' && types.some((def) => def.id === typeId) ? typeId : (types[0]?.id ?? '')
  const subjects = useMemo(() => (items ?? []).filter((item) => item.type === activeType), [items, activeType])
  /** 生效主体：用户选过且仍存在 → 用之；否则回落该类型第一条 */
  const activeSubjectId =
    subjectId !== null && subjects.some((item) => item.id === subjectId) ? subjectId : (subjects[0]?.id ?? null)
  const subject = subjects.find((item) => item.id === activeSubjectId) ?? null
  const rows = useMemo(
    () => (subject === null ? [] : buildRelationRows(types, items ?? [], subject)),
    [types, items, subject]
  )

  const handleTypeChange = useCallback((next: string): void => {
    setTypeId(next)
    // 换类型后主体列表整体替换：清掉旧选择，交由派生值回落第一条
    setSubjectId(null)
  }, [])

  const handleRefresh = useCallback((): void => {
    setReload((prev) => prev + 1)
  }, [])

  return (
    <div className="editor" data-testid="relation-graph-panel">
      <div className="editor-header">
        <div className="editor-title">
          关系图
          <small>浏览某条数据引用了哪些其他数据</small>
        </div>
      </div>

      <div className="editor-body">
        <div className="rg-picker">
          <label className="rg-picker-field">
            类型:
            <select
              className="rg-select"
              data-testid="relation-type-select"
              value={activeType}
              onChange={(event) => handleTypeChange(event.target.value)}
            >
              {types.map((def) => (
                <option key={def.id} value={def.id}>
                  {def.name}
                </option>
              ))}
            </select>
          </label>
          <label className="rg-picker-field">
            主体:
            <select
              className="rg-select wide"
              data-testid="relation-subject-select"
              value={activeSubjectId ?? ''}
              onChange={(event) => setSubjectId(event.target.value)}
              disabled={subjects.length === 0}
            >
              {subjects.map((item) => (
                <option key={item.id} value={item.id}>
                  {itemDisplayName(item)} ({item.id})
                </option>
              ))}
            </select>
          </label>
          <button type="button" className="btn slim" data-testid="relation-refresh" onClick={handleRefresh}>
            刷新
          </button>
        </div>

        {error !== null && <div className="error-banner">{error}</div>}
        {items === null && error === null && <div className="empty">正在读取数据…</div>}

        {items !== null && types.length === 0 && (
          <div className="empty" data-testid="relation-empty">
            当前没有可用的数据类型（schema 为空），请先在「字段结构编辑器」中新增类型
          </div>
        )}

        {items !== null && types.length > 0 && subjects.length === 0 && (
          <div className="empty" data-testid="relation-empty">
            该类型暂无数据
          </div>
        )}

        {subject !== null && (
          <>
            <div
              className="rg-subject-card"
              data-testid="relation-subject"
              style={{ borderColor: types.find((def) => def.id === subject.type)?.color ?? UNKNOWN_TYPE_COLOR }}
            >
              <div className="rg-subject-name" data-testid="relation-subject-name">
                {itemDisplayName(subject)}
              </div>
              <div className="rg-subject-detail" data-testid="relation-subject-detail">
                {buildSubjectDetailLine(subject)}
              </div>
            </div>

            <div className="rg-relations-title">
              {rows.length > 0 ? `关联数据 (${rows.length} 项)` : '关联数据（无）'}
            </div>

            {rows.length === 0 ? (
              <div className="empty" data-testid="relation-rows-empty">
                该主体没有可解析的关联数据
              </div>
            ) : (
              <table className="rg-table" data-testid="relation-table">
                <thead>
                  <tr>
                    <th>来源字段</th>
                    <th>关联名称</th>
                    <th>类型</th>
                    <th>ID</th>
                    <th>描述</th>
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row, index) => {
                    const jumpable = row.typeId !== null && row.targetId !== null
                    return (
                      <tr
                        key={`${row.field}:${row.targetId ?? row.name}:${index}`}
                        className={jumpable ? 'rg-row' : 'rg-row dangling'}
                        data-testid={jumpable ? 'relation-row' : 'relation-row-dangling'}
                        title={jumpable ? '双击跳转到该条目' : '未解析到目标条目'}
                        onDoubleClick={() => {
                          if (row.typeId !== null && row.targetId !== null) {
                            onJump(row.typeId, row.targetId, row.name)
                          }
                        }}
                      >
                        <td>{row.field}</td>
                        <td className="rg-cell-name">{row.name}</td>
                        <td style={{ color: row.color }}>{row.typeLabel ?? '-'}</td>
                        <td className="rg-cell-id">{row.targetId ?? '-'}</td>
                        <td>{row.detail === '' ? '-' : row.detail}</td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            )}
          </>
        )}
      </div>
    </div>
  )
}
