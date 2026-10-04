import { useEffect, useMemo, useState } from 'react'

import {
  SEARCH_ALL_FIELDS,
  SEARCH_ALL_TYPES,
  SEARCH_FIELD_OPTIONS,
  searchItems,
  truncateMatch
} from '../../../shared/advancedSearch'
import type { DataTypeDef, ItemRecord } from '../../../shared/types'

/**
 * 高级搜索面板（对应 Python `ui/dialogs/advanced_search.py` 的 AdvancedSearchDialog）。
 *
 * Python 能力：选类型 + 选字段（名称/ID/类型/描述）+ 关键词 + 结果列表 + 双击跳转。
 * TS 增强：额外提供「全部类型」「全部字段」两个哨兵选项（Python 只能单选）。
 * 数据来自 `data:listAll`（跨类型），不用新开 IPC；跳转复用主列表的 handleJump。
 *
 * 与列表搜索框的区别：列表搜索固定搜「名称/描述/ID」且限定当前类型；
 * 本面板可跨类型、可指定单字段（如只在「描述」里搜），命中后直接跳转到该条目。
 */

interface AdvancedSearchPanelProps {
  types: DataTypeDef[]
  onJump: (type: string, itemId: string, name: string) => void
  onClose: () => void
}

function itemDisplayName(item: ItemRecord): string {
  const name = item.data['name']
  return typeof name === 'string' && name !== '' ? name : item.id
}

export default function AdvancedSearchPanel({ types, onJump, onClose }: AdvancedSearchPanelProps) {
  const [items, setItems] = useState<ItemRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [keyword, setKeyword] = useState('')
  const [typeFilter, setTypeFilter] = useState<string>(SEARCH_ALL_TYPES)
  const [fieldFilter, setFieldFilter] = useState<string>(SEARCH_ALL_FIELDS)

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
  }, [])

  const typeName = (typeId: string): string => types.find((def) => def.id === typeId)?.name ?? typeId
  const fieldLabel = (field: string): string =>
    SEARCH_FIELD_OPTIONS.find((option) => option.value === field)?.label ?? field

  const trimmed = keyword.trim()
  const results = useMemo(
    () => searchItems(items ?? [], { keyword, type: typeFilter, field: fieldFilter }),
    [items, keyword, typeFilter, fieldFilter]
  )

  return (
    <aside className="editor" data-testid="advanced-search-panel">
      <div className="editor-header">
        <div className="editor-title">
          高级搜索
          <small>跨类型按字段检索</small>
        </div>
      </div>

      <div className="editor-body">
        <div className="form-row">
          <label className="form-label" htmlFor="adv-search-keyword">
            关键词
          </label>
          <input
            id="adv-search-keyword"
            className="form-input"
            data-testid="adv-search-keyword"
            value={keyword}
            placeholder="空格分隔多个词（须全部命中）"
            onChange={(event) => setKeyword(event.target.value)}
          />
        </div>

        <div className="form-row">
          <label className="form-label" htmlFor="adv-search-type">
            类型
          </label>
          <select
            id="adv-search-type"
            className="form-select"
            data-testid="adv-search-type"
            value={typeFilter}
            onChange={(event) => setTypeFilter(event.target.value)}
          >
            <option value={SEARCH_ALL_TYPES}>全部类型</option>
            {types.map((def) => (
              <option key={def.id} value={def.id}>
                {def.name}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label className="form-label" htmlFor="adv-search-field">
            字段
          </label>
          <select
            id="adv-search-field"
            className="form-select"
            data-testid="adv-search-field"
            value={fieldFilter}
            onChange={(event) => setFieldFilter(event.target.value)}
          >
            <option value={SEARCH_ALL_FIELDS}>全部字段</option>
            {SEARCH_FIELD_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        {error !== null && <div className="error-banner">{error}</div>}

        {items === null && error === null && <div className="empty">正在加载数据…</div>}

        {items !== null && trimmed === '' && (
          <div className="empty" data-testid="adv-search-hint">
            请输入关键词开始搜索
          </div>
        )}

        {items !== null && trimmed !== '' && (
          <>
            <div className="qc-stat-total" data-testid="adv-search-count">
              命中 {results.length} 条
              {typeFilter !== SEARCH_ALL_TYPES ? ` · 限「${typeName(typeFilter)}」` : ''}
              {fieldFilter !== SEARCH_ALL_FIELDS ? ` · 限「${fieldLabel(fieldFilter)}」字段` : ''}
            </div>

            {results.length === 0 ? (
              <div className="empty" data-testid="adv-search-empty">
                没有匹配「{trimmed}」的数据
              </div>
            ) : (
              <div className="adv-search-results">
                {results.map((item) => {
                  // 展示命中的值：指定字段取该字段，全部字段取名称作代表
                  const preview =
                    fieldFilter === SEARCH_ALL_FIELDS
                      ? itemDisplayName(item)
                      : String(resolvePreview(item, fieldFilter))
                  return (
                    <button
                      key={`${item.type}:${item.id}`}
                      type="button"
                      className="ref-row"
                      data-testid="adv-search-row"
                      title="点击跳转到该条目"
                      onClick={() => onJump(item.type, item.id, itemDisplayName(item))}
                    >
                      <span className="ref-row-main">{itemDisplayName(item)}</span>
                      <span className="item-meta">
                        {typeName(item.type)} · {truncateMatch(preview)}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      <div className="editor-actions">
        <button type="button" className="btn" data-testid="advanced-search-close" onClick={onClose}>
          关闭
        </button>
      </div>
    </aside>
  )
}

/** 结果行预览文本（数字转字符串；缺失字段回退为空串） */
function resolvePreview(item: ItemRecord, field: string): string {
  if (field === 'id') return item.id
  const value = item.data[field]
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}
