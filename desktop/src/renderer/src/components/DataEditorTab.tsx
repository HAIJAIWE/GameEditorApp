import { useCallback, useEffect, useState } from 'react'

import { filterItemRecords } from '../../../shared/dataTableOps'
import type { DataTypeDef, ItemRecord } from '../../../shared/types'

import ItemForm from './ItemForm'

interface DataEditorTabProps {
  /** 目标数据类型 id（对应策划书 enabled_editors[].data_type） */
  type: string
  /** 全部数据类型定义（条目表单按 type 取 formFields，引用字段解析 refType） */
  types: readonly DataTypeDef[]
  /** 活跃术语风格 id（字段标签术语替换；`''` = 原始术语） */
  gameStyle?: string
  /** 数据发生创建/删除/保存后回调（供外层刷新进度、引用等） */
  onDataChanged?: () => void
  /** 跳转定位：首次加载后自动选中的条目 id（命中列表时生效） */
  initialSelectedId?: string
  /** 跳转序号：父组件将其编入 key（重挂载触发重定位）；组件本身不消费，仅作契约声明 */
  targetNonce?: number
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/**
 * 单数据类型编辑器（内嵌于策划书右侧预览面板的一个标签页）。
 *
 * 对齐 PyQt `ui/data_tab.py::DataEditorTab`：左侧条目列表（搜索 / 新建 / 删除） +
 * 右侧条目表单。完全自包含，不依赖 App 状态——只消费传入的 `type` 与 `types`。
 */
export default function DataEditorTab({ type, types, gameStyle = '', onDataChanged, initialSelectedId }: DataEditorTabProps) {
  const [items, setItems] = useState<ItemRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const typeDef = types.find((def) => def.id === type) ?? null
  const typeName = typeDef?.name ?? type
  const fields = typeDef?.formFields ?? []
  const filteredItems = filterItemRecords(items, debouncedQuery)
  const selectedItem = items.find((item) => item.id === selectedId) ?? null

  /** 重新加载当前类型条目（事件处理器用；effect 内另走过期保护） */
  const reload = useCallback(async (): Promise<void> => {
    try {
      const list = await window.mbApi.data.listItems({ type })
      setItems(list)
      setError(null)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }, [type])

  // 切换类型时加载列表：父组件以 key=`type:nonce` 强制重挂载，故此处只需处理首次加载；
  // cancelled 防止卸载（或 StrictMode 双调用）下的过期响应回写。
  // 若带跳转定位（initialSelectedId）且命中列表，则加载完成后直接选中该条目。
  useEffect(() => {
    let cancelled = false
    window.mbApi.data
      .listItems({ type })
      .then((list) => {
        if (cancelled) return
        setItems(list)
        setError(null)
        if (initialSelectedId !== undefined && list.some((item) => item.id === initialSelectedId)) {
          setSelectedId(initialSelectedId)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [type, initialSelectedId])

  // 搜索防抖：输入停止 150ms 后再过滤列表（与 App.tsx 一致）
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150)
    return () => clearTimeout(timer)
  }, [query])

  /** 新建：命名 `${类型名} ${序号}`，创建后重载并选中新条目（对应 App.handleCreate） */
  const handleCreate = async (): Promise<void> => {
    setBusy(true)
    try {
      const created = await window.mbApi.data.createItem({ type, data: { name: `${typeName} ${items.length + 1}` } })
      await reload()
      setSelectedId(created.id)
      onDataChanged?.()
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 删除：若删的是当前选中项则清空选择，随后重载 */
  const handleDelete = async (id: string): Promise<void> => {
    try {
      await window.mbApi.data.deleteItem({ id })
      if (selectedId === id) setSelectedId(null)
      await reload()
      onDataChanged?.()
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  /** 表单保存完成：重载列表并提示（ItemForm 自身已完成 updateItem 落盘） */
  const handleSaved = (updated: ItemRecord): void => {
    setNotice(`已保存：${String(updated.data.name ?? updated.id)}`)
    void reload()
    onDataChanged?.()
  }

  return (
    <div className="data-editor-tab">
      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      <div className="data-editor-tab-main">
        <div className="list-column">
          <div className="list-toolbar">
            <input
              className="form-input search-input"
              data-testid="ceshu-data-search"
              value={query}
              placeholder="搜索 名称 / 描述 / ID（空格分词）"
              onChange={(event) => setQuery(event.target.value)}
            />
            <button
              type="button"
              className="btn primary"
              data-testid="ceshu-data-create"
              disabled={busy}
              onClick={() => void handleCreate()}
            >
              新建
            </button>
            <span className="item-meta">
              显示 {filteredItems.length} / {items.length} 条
            </span>
          </div>

          <div className="list">
            {items.length === 0 ? (
              <div className="empty" data-testid="ceshu-data-empty">
                暂无数据，点击「新建」创建第一条
              </div>
            ) : filteredItems.length === 0 ? (
              <div className="empty" data-testid="ceshu-data-empty">
                没有匹配「{debouncedQuery}」的数据
              </div>
            ) : (
              filteredItems.map((item) => (
                <div
                  key={item.id}
                  className={`item-row${item.id === selectedId ? ' selected' : ''}`}
                  data-testid="ceshu-data-item-row"
                  onClick={() => setSelectedId(item.id)}
                >
                  <span className="item-name">{String(item.data.name ?? item.id)}</span>
                  <span className="item-meta">{item.id.slice(0, 8)}</span>
                  <button
                    type="button"
                    className="btn danger"
                    data-testid="ceshu-data-delete"
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

        {selectedItem ? (
          <ItemForm
            key={`${selectedItem.id}:${selectedItem.updatedAt}`}
            item={selectedItem}
            fields={fields}
            types={types}
            gameStyle={gameStyle}
            onSaved={handleSaved}
          />
        ) : (
          <div className="empty">请选择或新建一条数据</div>
        )}
      </div>
    </div>
  )
}
