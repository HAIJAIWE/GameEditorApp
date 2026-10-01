import { useCallback, useEffect, useState } from 'react'

import type { AppInfo, ImportSummary, ItemRecord, TypeSummary } from '../../shared/types'

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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
  const [types, setTypes] = useState<TypeSummary[]>([])
  const [activeType, setActiveType] = useState<string | null>(null)
  const [items, setItems] = useState<ItemRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

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

  useEffect(() => {
    window.mbApi.app
      .info()
      .then(setInfo)
      .catch((err: unknown) => setError(toErrorMessage(err)))
  }, [])

  // 加载 12 数据类型 schema（由主进程下发），默认选中第一个类型
  useEffect(() => {
    let cancelled = false
    window.mbApi.data
      .listTypes()
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

  const handleCreate = async (): Promise<void> => {
    if (!activeType) return
    setBusy(true)
    try {
      const label = types.find((t) => t.id === activeType)?.name ?? activeType
      await window.mbApi.data.createItem({ type: activeType, data: { name: `${label} ${items.length + 1}` } })
      await reload(activeType)
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
      await reload(activeType)
    } catch (err) {
      setError(toErrorMessage(err))
    }
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

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          墨白可视化编辑
          <small>TS 重写版 · Phase 1 数据核心</small>
        </div>
        {types.map((t) => (
          <button
            key={t.id}
            type="button"
            className={`type-tab${t.id === activeType ? ' active' : ''}`}
            data-testid="type-tab"
            onClick={() => setActiveType(t.id)}
          >
            <span className="type-dot" style={{ background: t.color }} />
            {t.name}
          </button>
        ))}
      </aside>

      <div className="main">
        <header className="toolbar">
          <h1>数据表预览</h1>
          <button type="button" className="btn" disabled={busy} onClick={() => void handleImportLegacy()}>
            导入旧数据
          </button>
          <button type="button" className="btn primary" disabled={busy || !activeType} onClick={() => void handleCreate()}>
            新增测试条目
          </button>
        </header>

        {error && <div className="error-banner">{error}</div>}
        {notice && <div className="notice-banner">{notice}</div>}

        <div className="list">
          {!activeType ? (
            <div className="empty">正在加载数据类型…</div>
          ) : items.length === 0 ? (
            <div className="empty">暂无数据，点击「新增测试条目」或「导入旧数据」</div>
          ) : (
            items.map((item) => (
              <div key={item.id} className="item-row" data-testid="item-row">
                <span className="item-name">{String(item.data.name ?? item.id)}</span>
                <span className="item-meta">{item.id.slice(0, 8)}</span>
                <span className="item-meta">{new Date(item.createdAt).toLocaleTimeString()}</span>
                <button type="button" className="btn danger" onClick={() => void handleDelete(item.id)}>
                  删除
                </button>
              </div>
            ))
          )}
        </div>

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