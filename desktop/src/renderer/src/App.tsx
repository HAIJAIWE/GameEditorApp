import { useCallback, useEffect, useMemo, useState } from 'react'

import type { CeshuSummary } from '../../shared/ceshuConstants'
import { filterItemRecords } from '../../shared/dataTableOps'
import type { AppInfo, DataTypeDef, ImportSummary, ItemRecord } from '../../shared/types'

import AttrSystemPanel from './components/AttrSystemPanel'
import BatchEditPanel from './components/BatchEditPanel'
import CeshuView from './components/CeshuView'
import ItemForm from './components/ItemForm'
import ReferencesPanel, { type ReferenceTarget } from './components/ReferencesPanel'
import TypeEditorPanel from './components/TypeEditorPanel'

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function itemDisplayName(item: ItemRecord): string {
  const name = item.data['name']
  return typeof name === 'string' && name !== '' ? name : item.id
}

function formatImportSummary(summary: ImportSummary): string {
  const unknownKeys = Object.keys(summary.unknownTypes)
  const unknownNote =
    unknownKeys.length > 0
      ? `；另有 ${unknownKeys.length} 个未收录类型键（数据已保留）：${unknownKeys.slice(0, 6).join('、')}`
      : ''
  return `导入完成：新增 ${summary.imported} 条，更新 ${summary.updated} 条，跳过 ${summary.skipped} 条${unknownNote}`
}

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [types, setTypes] = useState<DataTypeDef[]>([])
  const [activeType, setActiveType] = useState<string | null>(null)
  const [items, setItems] = useState<ItemRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'data' | 'ceshu'>('data')
  const [editorOpen, setEditorOpen] = useState(false)
  const [attrSysOpen, setAttrSysOpen] = useState(false)
  const [ceshuList, setCeshuList] = useState<CeshuSummary[]>([])
  const [activeCeshuId, setActiveCeshuId] = useState<string | null>(null)

  const fields = activeType ? (types.find((def) => def.id === activeType)?.formFields ?? []) : []
  const selectedItem = items.find((item) => item.id === selectedId) ?? null
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)
  const [refTarget, setRefTarget] = useState<ReferenceTarget | null>(null)

  const filteredItems = useMemo(() => filterItemRecords(items, debouncedQuery), [items, debouncedQuery])
  // 仅统计仍然存在的勾选项（重载/删除后失效的 id 不参与批量操作）
  const aliveIds = useMemo(() => new Set(items.map((item) => item.id)), [items])
  const selectedVisibleIds = useMemo(
    () => [...selectedIds].filter((id) => aliveIds.has(id)),
    [selectedIds, aliveIds]
  )
  const allSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id))

  /** 事件处理器使用的重新加载（不在 effect 中直接调用，避免级联渲染） */
  const reload = useCallback(async (type: string): Promise<void> => {
    try {
      const list = await window.mbApi.data.listItems({ type })
      setItems(list)
      setError(null)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }, [])

  /** 策划书列表刷新；无选中项时自动选中第一份 */
  const reloadCeshuList = useCallback(async (): Promise<void> => {
    try {
      const list = await window.mbApi.ceshu.list()
      setCeshuList(list)
      setActiveCeshuId((current) => current ?? list[0]?.id ?? null)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }, [])

  useEffect(() => {
    window.mbApi.app
      .info()
      .then(setInfo)
      .catch((err: unknown) => setError(toErrorMessage(err)))
  }, [])

  // 加载数据类型 schema（主进程下发，用户可在「字段结构」中编辑并持久化），默认选中第一个类型
  useEffect(() => {
    let cancelled = false
    window.mbApi.schema
      .list()
      .then((list) => {
        if (cancelled) return
        setTypes(list)
        setActiveType((current) => current ?? list[0]?.id ?? null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 切换到策划书模式时加载列表（懒加载，避免启动即访问文件系统）
  useEffect(() => {
    if (mode !== 'ceshu') return
    let cancelled = false
    window.mbApi.ceshu
      .list()
      .then((list) => {
        if (cancelled) return
        setCeshuList(list)
        setActiveCeshuId((current) => current ?? list[0]?.id ?? null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [mode])

  // 切换数据类型时加载列表；cancelled 防止快速切换导致的过期响应回写
  useEffect(() => {
    if (!activeType) return
    let cancelled = false
    window.mbApi.data
      .listItems({ type: activeType })
      .then((list) => {
        if (!cancelled) {
          setItems(list)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [activeType])

  // 搜索防抖：输入停止 150ms 后再过滤列表
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150)
    return () => clearTimeout(timer)
  }, [query])

  const selectType = (id: string): void => {
    setSelectedId(null)
    setActiveType(id)
    setQuery('')
    setSelectedIds(new Set())
    setBatchOpen(false)
    setRefTarget(null)
  }

  /** 引用跳转：切到目标类型并选中该条目（保留引用面板，便于沿引用链继续查看） */
  const handleJump = (type: string, itemId: string, name: string): void => {
    setRefTarget({ type, id: itemId, name })
    setQuery('')
    setSelectedId(itemId)
    setActiveType(type)
  }

  const toggleSelect = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** 全选/全不选：作用于当前过滤结果（与搜索联动） */
  const toggleSelectAll = (): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      const allChecked = filteredItems.length > 0 && filteredItems.every((item) => next.has(item.id))
      for (const item of filteredItems) {
        if (allChecked) next.delete(item.id)
        else next.add(item.id)
      }
      return next
    })
  }

  /** 批量操作完成：提示结果、清空勾选、关闭面板并刷新列表 */
  const handleBatchApplied = (message: string): void => {
    setNotice(message)
    setSelectedIds(new Set())
    setBatchOpen(false)
    if (activeType) void reload(activeType)
  }

  const handleCreate = async (): Promise<void> => {
    if (!activeType) return
    setBusy(true)
    try {
      const label = types.find((t) => t.id === activeType)?.name ?? activeType
      const created = await window.mbApi.data.createItem({
        type: activeType,
        data: { name: `${label} ${items.length + 1}` }
      })
      await reload(activeType)
      setSelectedId(created.id)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (!activeType) return
    try {
      await window.mbApi.data.deleteItem({ id })
      if (selectedId === id) setSelectedId(null)
      await reload(activeType)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  const handleSaved = (updated: ItemRecord): void => {
    setNotice(`已保存：${String(updated.data.name ?? updated.id)}`)
    if (activeType) void reload(activeType)
  }

  const handleImportLegacy = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseJsonFile()
      if (!chosen.path) return
      setBusy(true)
      const summary = await window.mbApi.data.importLegacy({ path: chosen.path })
      setNotice(formatImportSummary(summary))
      if (activeType) await reload(activeType)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleExportLegacy = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseSaveJsonFile()
      if (!chosen.path) return
      setBusy(true)
      const summary = await window.mbApi.data.exportLegacy({ path: chosen.path })
      setNotice(`已导出 ${summary.totalItems} 条数据：${summary.filePath}`)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 字段结构保存后：刷新类型列表；当前类型被删除时回退到第一个 */
  const handleSchemaSaved = (saved: DataTypeDef[]): void => {
    setTypes(saved)
    setActiveType((current) => (saved.some((def) => def.id === current) ? current : (saved[0]?.id ?? null)))
  }

  const handleCreateCeshu = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const created = await window.mbApi.ceshu.create({ name: '', scope: 'full' })
      await reloadCeshuList()
      setActiveCeshuId(created.ceshu_id)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          墨白可视化编辑
          <small>TS 重写版 · Phase 1 数据核心</small>
        </div>
        <div className="mode-switch">
          <button
            type="button"
            data-testid="mode-data"
            className={`mode-btn${mode === 'data' ? ' active' : ''}`}
            onClick={() => setMode('data')}
          >
            数据表
          </button>
          <button
            type="button"
            data-testid="mode-ceshu"
            className={`mode-btn${mode === 'ceshu' ? ' active' : ''}`}
            onClick={() => setMode('ceshu')}
          >
            策划书
          </button>
        </div>
        {mode === 'data' ? (
          types.map((t) => (
            <button
              key={t.id}
              type="button"
              className={`type-tab${t.id === activeType ? ' active' : ''}`}
              data-testid="type-tab"
              onClick={() => selectType(t.id)}
            >
              <span className="type-dot" style={{ background: t.color }} />
              {t.name}
            </button>
          ))
        ) : (
          <>
            <button type="button" className="btn" data-testid="ceshu-create" onClick={() => void handleCreateCeshu()}>
              新建策划书
            </button>
            {ceshuList.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid="ceshu-row"
                className={`type-tab${item.id === activeCeshuId ? ' active' : ''}`}
                onClick={() => setActiveCeshuId(item.id)}
              >
                <span className="item-name">{item.gameName || '未命名策划书'}</span>
                <span className="item-meta">
                  {item.versionLabel}
                  {item.isActive ? ' ★' : ''} · {Math.round(item.progress * 100)}%
                </span>
              </button>
            ))}
            {ceshuList.length === 0 && <div className="sidebar-hint">暂无策划书，点击上方新建</div>}
          </>
        )}
      </aside>

      <div className="main">
        {mode === 'data' ? (
          <>
            <header className="toolbar">
              <h1>数据表预览</h1>
              <button type="button" className="btn" disabled={busy} onClick={() => void handleImportLegacy()}>
                导入旧数据
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void handleExportLegacy()}>
                导出为 JSON
              </button>
              <button
                type="button"
                className="btn"
                data-testid="open-type-editor"
                disabled={busy}
                onClick={() => setEditorOpen(true)}
              >
                字段结构
              </button>
              <button
                type="button"
                className="btn"
                data-testid="open-attr-system"
                disabled={busy}
                onClick={() => setAttrSysOpen(true)}
              >
                属性系统
              </button>
              <button
                type="button"
                className="btn"
                data-testid="open-references"
                disabled={busy || !selectedItem}
                onClick={() =>
                  selectedItem &&
                  setRefTarget({ type: selectedItem.type, id: selectedItem.id, name: itemDisplayName(selectedItem) })
                }
              >
                引用关系
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || !activeType}
                onClick={() => void handleCreate()}
              >
                新增测试条目
              </button>
            </header>

            {error && <div className="error-banner">{error}</div>}
            {notice && <div className="notice-banner">{notice}</div>}

            <div className="content">
              {editorOpen ? (
                <TypeEditorPanel types={types} onSaved={handleSchemaSaved} onClose={() => setEditorOpen(false)} />
              ) : attrSysOpen ? (
                <AttrSystemPanel onClose={() => setAttrSysOpen(false)} />
              ) : (
                <>
                  <div className="list-column">
                    <div className="list-toolbar">
                      <input
                        className="form-input search-input"
                        data-testid="search-input"
                        value={query}
                        placeholder="搜索 名称 / 描述 / ID（空格分词）"
                        onChange={(event) => setQuery(event.target.value)}
                      />
                      {query !== '' && (
                        <button type="button" className="btn slim" data-testid="search-clear" onClick={() => setQuery('')}>
                          清除
                        </button>
                      )}
                      <label className="ai-gen-check">
                        <input
                          type="checkbox"
                          data-testid="select-all"
                          checked={allSelected}
                          disabled={filteredItems.length === 0}
                          onChange={toggleSelectAll}
                        />
                        全选
                      </label>
                      <span className="item-meta" data-testid="list-count">
                        显示 {filteredItems.length} / {items.length} 条
                      </span>
                      <button
                        type="button"
                        className="btn"
                        data-testid="open-batch-edit"
                        disabled={selectedVisibleIds.length === 0}
                        onClick={() => {
                          setBatchOpen(true)
                          setRefTarget(null)
                        }}
                      >
                        批量操作（{selectedVisibleIds.length}）
                      </button>
                    </div>

                    <div className="list">
                      {!activeType ? (
                        <div className="empty">正在加载数据类型…</div>
                      ) : items.length === 0 ? (
                        <div className="empty">暂无数据，点击「新增测试条目」或「导入旧数据」</div>
                      ) : filteredItems.length === 0 ? (
                        <div className="empty" data-testid="search-empty">
                          没有匹配「{debouncedQuery}」的数据
                        </div>
                      ) : (
                        filteredItems.map((item) => (
                          <div
                            key={item.id}
                            className={`item-row${item.id === selectedId ? ' selected' : ''}`}
                            data-testid="item-row"
                            onClick={() => {
                              setSelectedId(item.id)
                              setBatchOpen(false)
                              setRefTarget(null)
                            }}
                          >
                            <input
                              type="checkbox"
                              className="item-check"
                              data-testid="item-check"
                              checked={selectedIds.has(item.id)}
                              onClick={(event) => event.stopPropagation()}
                              onChange={() => toggleSelect(item.id)}
                            />
                            <span className="item-name">{String(item.data.name ?? item.id)}</span>
                            <span className="item-meta">{item.id.slice(0, 8)}</span>
                            <button
                              type="button"
                              className="btn danger"
                              onClick={(event) => {
                                event.stopPropagation()
                                void handleDelete(item.id)
                              }}
                            >
                              删除
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {refTarget ? (
                    <ReferencesPanel
                      target={refTarget}
                      types={types}
                      onJump={handleJump}
                      onClose={() => setRefTarget(null)}
                    />
                  ) : batchOpen ? (
                    <BatchEditPanel
                      key={`${activeType ?? ''}:batch`}
                      type={activeType ?? ''}
                      typeDef={types.find((def) => def.id === activeType) ?? null}
                      selectedIds={selectedVisibleIds}
                      onApplied={handleBatchApplied}
                      onClose={() => setBatchOpen(false)}
                    />
                  ) : (
                    selectedItem && (
                      <ItemForm
                        key={`${selectedItem.id}:${selectedItem.updatedAt}`}
                        item={selectedItem}
                        fields={fields}
                        onSaved={handleSaved}
                      />
                    )
                  )}
                </>
              )}
            </div>
          </>
        ) : (
          <CeshuView ceshuId={activeCeshuId} onChanged={() => void reloadCeshuList()} onSelect={setActiveCeshuId} />
        )}

        <footer className="statusbar">
          {info ? (
            <>
              <span>版本 {info.version}</span>
              <span>类型 {types.length} 种</span>
              <span>数据：SQLite（{info.dbPath}）</span>
            </>
          ) : (
            <span>正在读取应用信息…</span>
          )}
        </footer>
      </div>
    </div>
  )
}