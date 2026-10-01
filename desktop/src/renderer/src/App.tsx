import { useCallback, useEffect, useState } from 'react'

import type { AppInfo, ItemRecord } from '../../shared/types'

const DATA_TYPES = [
  { key: 'skill', label: '技能' },
  { key: 'character', label: '角色' },
  { key: 'monster', label: '怪物' },
  { key: 'equipment', label: '装备' },
  { key: 'item', label: '道具' },
  { key: 'achievement', label: '成就' }
] as const

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [activeType, setActiveType] = useState<string>(DATA_TYPES[0].key)
  const [items, setItems] = useState<ItemRecord[]>([])
  const [error, setError] = useState<string | null>(null)
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

  // 切换数据类型时加载列表；cancelled 防止快速切换导致的过期响应回写
  useEffect(() => {
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
    setBusy(true)
    try {
      const label = DATA_TYPES.find((t) => t.key === activeType)?.label ?? activeType
      await window.mbApi.data.createItem({ type: activeType, data: { name: `${label} ${items.length + 1}` } })
      await reload(activeType)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    try {
      await window.mbApi.data.deleteItem({ id })
      await reload(activeType)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  return (
    <div className="app">
      <aside className="sidebar">
        <div className="brand">
          墨白可视化编辑
          <small>TS 重写版 · Phase 0 骨架</small>
        </div>
        {DATA_TYPES.map((t) => (
          <button
            key={t.key}
            type="button"
            className={`type-tab${t.key === activeType ? ' active' : ''}`}
            data-testid="type-tab"
            onClick={() => setActiveType(t.key)}
          >
            {t.label}
          </button>
        ))}
      </aside>

      <div className="main">
        <header className="toolbar">
          <h1>数据表预览</h1>
          <button type="button" className="btn primary" disabled={busy} onClick={() => void handleCreate()}>
            新增测试条目
          </button>
        </header>

        {error && <div className="error-banner">{error}</div>}

        <div className="list">
          {items.length === 0 ? (
            <div className="empty">暂无数据，点击“新增测试条目”验证 IPC 链路</div>
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
              <span>{info.platform}</span>
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