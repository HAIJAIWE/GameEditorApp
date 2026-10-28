import { useCallback, useEffect, useRef, useState } from 'react'

import {
  buildCountConstraintMessage,
  exceedsCountConstraint,
  type CountConstraint
} from '../../../shared/util/dataCountConstraint'
import { filterItemRecords, withRenamedName } from '../../../shared/util/dataTableOps'
import { displayItemId } from '../../../shared/util/itemId'
import { showToast } from '../../../shared/util/toast'
import type { DataTypeDef, ItemRecord, TypeFieldDef } from '../../../shared/types'

import ItemForm from './ItemForm'
import LucideIcon from './LucideIcon'
import { toErrorMessage } from '../../../shared/util/errors'

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
  /** 打开「字段结构编辑器」编辑当前数据类型；不传则条目表单不渲染该菜单项 */
  onEditType?: (typeId: string) => void
  /** 打开「数据关联预览」查看某条目引用关系；不传则不渲染该菜单项 */
  onShowReferences?: (target: { type: string; id: string; name: string }) => void
  /** 打开「AI 数据生成」面板；不传则不渲染该按钮 */
  onAiGenerate?: (typeId: string) => void
  /**
   * 策划书给出的该类数据数量上限（由宿主用 `findCountConstraint(chapters.systems, type)` 解析）。
   * 非空且当前条目数已达上限时，「新建」先给出确认。
   */
  countConstraint?: CountConstraint | null
}

/** 右键菜单定位（视口坐标，用 `position: fixed` 渲染） */
interface RowMenuState {
  id: string
  x: number
  y: number
}

/**
 * 右键菜单尺寸估计（用于把浮层夹在视口内）：宽度对齐 CSS `.row-context-menu` 的 `min-width: 104px`；
 * 高度 = 4 个 `.btn.slim`（约 26px）+ 3 个 2px 间隔 + 8px 内边距 ≈ 120px。
 * 取整偏大即可 —— 只为防止贴右/下缘时出界，宁可多留 8px 边距。
 */
const CONTEXT_MENU_WIDTH = 104
const CONTEXT_MENU_HEIGHT = 122
const CONTEXT_MENU_MARGIN = 8

/**
 * 列表行长文本字段跳过集 —— 与 旧版 `data_tab._get_item_display_text` 完全一致：
 * 这些是长文本 / 富结构字段，拼进行内单行只会刷屏，故只显示「ID | 名称 | 关键字段」。
 */
const LIST_TEXT_SKIP_FIELDS: ReadonlySet<string> = new Set([
  'id', 'name', 'desc', 'description', 'content',
  'image', 'image_desc', 'image_tags', 'template',
  'tags', 'condition', 'event', 'reward', 'options'
])

/**
 * 构造列表行单行文本，对齐 旧版 `data_tab._get_item_display_text`：
 * `ID | 名称 | 关键字段1 | 关键字段2`（跳过长文本字段，最多拼 4 段）。
 * ID 取业务短 id `data.id`（旧版 `generate_id` 语义：每类型 0 起步短序号；
 * 2026-10-13 去掉了此前的「记录 uuid 前 8 位」外显——用户反馈「Id不对」），
 * 极端脏数据（data.id 缺失）才回退记录 id。完整记录 id 仍在行 title 悬停可见。
 */
function buildListRowText(item: ItemRecord, fields: readonly TypeFieldDef[]): string {
  const parts = [`ID:${displayItemId(item)}`, String(item.data.name ?? item.id)]
  for (const field of fields) {
    if (LIST_TEXT_SKIP_FIELDS.has(field.name)) continue
    const value = item.data[field.name]
    if (value !== undefined && value !== null && value !== '') {
      parts.push(String(value))
      if (parts.length >= 4) break
    }
  }
  return parts.join(' | ')
}

/**
 * 单数据类型编辑器（内嵌于策划书右侧预览面板的一个标签页）。
 *
 * 对齐 旧版 `ui/data_tab::DataEditorTab`：左侧条目列表（搜索 / 新建 / 右键菜单 / F2 重命名） +
 * 右侧条目表单。行文本为密集单行 `ID | 名称 | 关键字段`；
 * 删除入口在右键菜单 + 表单底部操作栏。完全自包含，
 * 不依赖 App 状态——只消费传入的 `type` 与 `types`。
 *
 * 与 旧版 的两处**刻意**差异（已记入 `docs/migration-audit.md`）：
 * - 重命名用行内输入框，而不是 旧版 的 `QInputDialog` 模态框（Electron 渲染层没有 `window.prompt`）。
 * - 列表上**不**绑定 Delete 键：旧版 的 Delete 会先弹「确定要删除这个项目吗？」再删，
 *   贸然加退格键会变成「一键误删」。但删除**入口**（右键菜单 / 表单底部「删除」钮）会先弹
 *   内联二次确认条，确认后才真正落盘。
 */
export default function DataEditorTab({
  type,
  types,
  gameStyle = '',
  onDataChanged,
  initialSelectedId,
  onEditType,
  onShowReferences,
  onAiGenerate,
  countConstraint = null
}: DataEditorTabProps) {
  const [items, setItems] = useState<ItemRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  /** 超限确认横幅正文（非空 = 正在等待用户确认是否继续创建） */
  const [countWarning, setCountWarning] = useState<string | null>(null)
  /** 正在行内重命名的条目 id（null = 未在重命名） */
  const [renamingId, setRenamingId] = useState<string | null>(null)
  const [renameDraft, setRenameDraft] = useState('')
  const [menu, setMenu] = useState<RowMenuState | null>(null)
  /** 待确认删除的条目（null = 不显示删除确认条） */
  const [deleteTarget, setDeleteTarget] = useState<ItemRecord | null>(null)
  /** 条目列表容器（选中项滚入可视区用） */
  const listRef = useRef<HTMLDivElement | null>(null)

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

  // 选中条目滚入可视区（block:'nearest' 不打动手动滚动位置）：列表按创建顺序升序后，
  // 新建的条目沉在列表底部——不自动滚动的话条目一多（20+），新建完根本看不见新条目
  // 
  useEffect(() => {
    if (selectedId === null) return
    listRef.current?.querySelector('.item-row.selected')?.scrollIntoView({ block: 'nearest' })
  }, [selectedId])

  // 右键菜单开着时，点击别处 / 失焦 / Esc 关闭（事件监听里的 setState 不属于「渲染期副作用」）
  useEffect(() => {
    if (menu === null) return
    const close = (): void => setMenu(null)
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') close()
    }
    window.addEventListener('click', close)
    window.addEventListener('blur', close)
    window.addEventListener('keydown', onKey)
    return () => {
      window.removeEventListener('click', close)
      window.removeEventListener('blur', close)
      window.removeEventListener('keydown', onKey)
    }
  }, [menu])

  /** 真正落盘的新建（已过数量约束确认） */
  const doCreate = async (): Promise<void> => {
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

  /**
   * 新建：命名 `${类型名} ${序号}`，创建后重载并选中新条目（对应 App.handleCreate）。
   * 策划书给该类数据设了数量上限且已满时，先弹行内确认（对齐 旧版 `_check_count_constraint`，
   * 默认取消；无策划书上下文 / 上限非法 / 未超限都直接创建）。
   */
  const handleCreate = async (): Promise<void> => {
    const blocking = exceedsCountConstraint(items.length, countConstraint) ? countConstraint : null
    if (countWarning === null && blocking !== null) {
      setCountWarning(buildCountConstraintMessage(blocking, items.length))
      return
    }
    setCountWarning(null)
    await doCreate()
  }

  /** 请求删除：弹出二次确认 */
  const requestDelete = (id: string): void => {
    const target = items.find((entry) => entry.id === id) ?? null
    if (target === null) return
    setDeleteTarget(target)
  }

  /** 二次确认后的真实落盘删除（原 handleDelete 逻辑） */
  const confirmDelete = async (): Promise<void> => {
    const target = deleteTarget
    if (target === null) return
    try {
      await window.mbApi.data.deleteItem({ id: target.id })
      if (selectedId === target.id) setSelectedId(null)
      setDeleteTarget(null)
      await reload()
      onDataChanged?.()
      // 对齐 旧版 data_tab 的「删除成功」toast（原先这里删完**没有任何反馈**）
      showToast('已删除', { kind: 'success' })
    } catch (err) {
      setDeleteTarget(null)
      setError(toErrorMessage(err))
    }
  }

  /** 复制条目为独立副本 */
  const handleDuplicate = async (id: string): Promise<void> => {
    const item = items.find((entry) => entry.id === id)
    if (!item) return
    try {
      const payload: Record<string, unknown> = { ...item.data }
      delete payload.id
      const created = await window.mbApi.data.createItem({ type, data: payload })
      await reload()
      setSelectedId(created.id)
      showToast(`已复制：${String(created.data.name ?? created.id)}`, { kind: 'success' })
      onDataChanged?.()
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  /** 进入行内重命名 */
  const startRename = (id: string): void => {
    const item = items.find((entry) => entry.id === id)
    if (!item) return
    setMenu(null)
    setSelectedId(id)
    setRenameDraft(String(item.data.name ?? ''))
    setRenamingId(id)
  }

  /** 提交重命名：空白名视为取消；落盘后重载列表并选中 */
  const commitRename = async (): Promise<void> => {
    const id = renamingId
    setRenamingId(null)
    if (id === null) return
    const item = items.find((entry) => entry.id === id)
    if (!item) return
    const next = withRenamedName(item.data, renameDraft)
    if (next === null) return
    if (next.name === item.data.name) return // 未改动，不产生无意义的写盘与提示
    try {
      await window.mbApi.data.updateItem({ id, data: next })
      await reload()
      setSelectedId(id)
      showToast(`已重命名为：${String(next.name)}`, { kind: 'success' })
      onDataChanged?.()
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  /** 表单保存完成：重载列表并提示（ItemForm 自身已完成 updateItem 落盘） */
  const handleSaved = (updated: ItemRecord): void => {
    showToast(`已保存：${String(updated.data.name ?? updated.id)}`, { kind: 'success' })
    void reload()
    onDataChanged?.()
  }

  /**
   * 表单复制完成：重载列表并**选中副本**。
   * ItemForm 已自行完成 createItem 落盘，这里只负责列表同步与选中。
   */
  const handleDuplicated = async (created: ItemRecord): Promise<void> => {
    await reload()
    setSelectedId(created.id)
    showToast(`已复制：${String(created.data.name ?? created.id)}`, { kind: 'success' })
    onDataChanged?.()
  }

  const menuItem = menu === null ? null : (items.find((item) => item.id === menu.id) ?? null)

  return (
    <div className="data-editor-tab">
      {error && <div className="error-banner">{error}</div>}

      {countWarning !== null && (
        <div className="count-warning" data-testid="ceshu-data-count-warning">
          <span className="count-warning-text">{countWarning}</span>
          <button
            type="button"
            className="btn danger"
            data-testid="ceshu-data-count-continue"
            onClick={() => void handleCreate()}
          >
            继续创建
          </button>
          <button
            type="button"
            className="btn"
            data-testid="ceshu-data-count-cancel"
            onClick={() => setCountWarning(null)}
          >
            取消
          </button>
        </div>
      )}

      {deleteTarget !== null && (
        <div className="count-warning" data-testid="ceshu-data-delete-confirm">
          <span className="count-warning-text">
            确定删除「{String(deleteTarget.data.name ?? deleteTarget.id)}」？此操作不可撤销
          </span>
          <button
            type="button"
            className="btn danger"
            data-testid="ceshu-data-delete-confirm-yes"
            onClick={() => void confirmDelete()}
          >
            删除
          </button>
          <button
            type="button"
            className="btn"
            data-testid="ceshu-data-delete-confirm-no"
            onClick={() => setDeleteTarget(null)}
          >
            取消
          </button>
        </div>
      )}

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
              <LucideIcon name="plus" size={14} />
              新建
            </button>
            <span className="item-meta">
              显示 {filteredItems.length} / {items.length} 条
            </span>
          </div>

          <div
            className="list"
            ref={listRef}
            // F2 重命名：焦点在列表上时才响应
            tabIndex={0}
            data-testid="ceshu-data-list"
            onKeyDown={(event) => {
              if (event.key === 'F2' && selectedId !== null) {
                event.preventDefault()
                startRename(selectedId)
              }
            }}
          >
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
                  title={`${buildListRowText(item, fields)}  ·  ${item.id}`}
                  onClick={() => setSelectedId(item.id)}
                  onContextMenu={(event) => {
                    event.preventDefault()
                    setSelectedId(item.id)
                    // 浮层用 position:fixed 且定位取 clientX/clientY，贴右/下缘时会出界被裁 ——
                    // 事件触发时按当前视口夹一次（不缓存，窗口尺寸变化后仍正确）。
                    setMenu({
                      id: item.id,
                      x: Math.max(CONTEXT_MENU_MARGIN, Math.min(event.clientX, window.innerWidth - CONTEXT_MENU_WIDTH - CONTEXT_MENU_MARGIN)),
                      y: Math.max(CONTEXT_MENU_MARGIN, Math.min(event.clientY, window.innerHeight - CONTEXT_MENU_HEIGHT - CONTEXT_MENU_MARGIN))
                    })
                  }}
                >
                  {renamingId === item.id ? (
                    <input
                      className="form-input rename-input"
                      data-testid="ceshu-data-rename-input"
                      value={renameDraft}
                      // 行内重命名必须立刻可输入
                      autoFocus
                      onClick={(event) => event.stopPropagation()}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault()
                          void commitRename()
                        } else if (event.key === 'Escape') {
                          event.preventDefault()
                          setRenamingId(null)
                        }
                      }}
                      onBlur={() => void commitRename()}
                    />
                  ) : (
                    <>
                      <span className="item-name">{buildListRowText(item, fields)}</span>
                      {/*
                        「AI 生成、待核对」点：与章节导航的圆点同一语义。
                        人在右侧表单点「保存」即消失（`updateItem` 会清掉标记）。
                        放在文本后面而不是覆盖在行首 —— 行首是条目名，不能被挤。
                      */}
                      {item.aiGeneratedAt !== undefined && (
                        <span
                          className="item-row-ai"
                          title="AI 生成，待核对（保存该条目即消除）"
                          data-testid={`item-ai-${item.id}`}
                        />
                      )}
                    </>
                  )}
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
            onDelete={() => {
              if (selectedItem !== null) requestDelete(selectedItem.id)
            }}
            onEditType={onEditType}
            onShowReferences={onShowReferences}
            onAiGenerate={onAiGenerate}
            onDuplicated={(created) => void handleDuplicated(created)}
          />
        ) : (
          <div className="empty">请选择或新建一条数据</div>
        )}
      </div>

      {menu !== null && menuItem !== null && (
        <div
          className="row-context-menu"
          data-testid="ceshu-data-menu"
          style={{ left: menu.x, top: menu.y }}
          onContextMenu={(event) => event.preventDefault()}
        >
          {/* 菜单项与 旧版 `virtual_list:217-231` 一致：重命名 / 编辑 / 复制 / 删除 */}
          <button
            type="button"
            className="btn slim"
            data-testid="ceshu-data-menu-rename"
            onClick={() => startRename(menu.id)}
          >
            重命名
          </button>
          <button
            type="button"
            className="btn slim"
            data-testid="ceshu-data-menu-edit"
            onClick={() => {
              setSelectedId(menu.id)
              setMenu(null)
            }}
          >
            编辑
          </button>
          <button
            type="button"
            className="btn slim"
            data-testid="ceshu-data-menu-copy"
            onClick={() => {
              setMenu(null)
              void handleDuplicate(menu.id)
            }}
          >
            复制
          </button>
          <button
            type="button"
            className="btn slim"
            data-testid="ceshu-data-menu-delete"
            onClick={() => {
              setMenu(null)
              requestDelete(menu.id)
            }}
          >
            删除
          </button>
        </div>
      )}
    </div>
  )
}
