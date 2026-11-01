import { useCallback, useEffect, useMemo, useState } from 'react'

import { LucideIcon } from '@mobai/client-ui'

/**
 * 库条（A2-2）：新建 / 重命名 / 删除 / 切换活跃库。
 *
 * 校验口径：**主进程是唯一权威**（`main/library/manager.ts::validateLibraryName`，
 * 库名会参与拼路径故规则偏严）。本组件只做「非空 + 长度」的**按钮启用判断**这种 UX 级预检，
 * 真正的拒绝理由一律由 IPC 返回的中文错误展示——避免两处校验规则漂移。
 *
 * 活跃库变化由主进程广播 `library:changed`（切换经本组件触发），App 收到后重载全部视图。
 */

interface LibraryEntryShape {
  name: string
  createdAt: string
  description: string
  isInitial: boolean
}

/**
 * `library:list` 的返回：条目 + **当前活跃库**。
 *
 * `active` 不能靠渲染层推断。切换库时主进程广播 `library:changed`，App 收到后整页重载，
 * 组件内状态全丢；此时若只拿到条目数组，唯一能给的答案就是「第一个」——库条会显示初始库，
 * 而数据来自刚切过去的库，并且再选初始库会被 `name === active` 判成无变化、切不回去。
 */
interface LibraryListResult {
  libraries: LibraryEntryShape[]
  active: string
}

interface LibraryApi {
  list: () => Promise<LibraryListResult>
  create: (req: { name: string; description?: string }) => Promise<LibraryEntryShape>
  rename: (req: { from: string; to: string }) => Promise<{ ok: boolean }>
  // 破坏性：契约层要求 confirm 必填（主进程再挡一次），这里必须显式传 true
  remove: (req: { name: string; confirm: boolean }) => Promise<{ switchedTo: string | null }>
  switch: (req: { name: string }) => Promise<{ ok: boolean }>
}

/** 与主进程 `LIBRARY_NAME_MAX` 对齐（仅用于按钮启用判断） */
const NAME_MAX = 40

type EditingMode = 'create' | 'rename' | null

export default function LibraryBar() {
  const [libraries, setLibraries] = useState<LibraryEntryShape[]>([])
  const [active, setActive] = useState('')
  const [mode, setMode] = useState<EditingMode>(null)
  const [draft, setDraft] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /**
   * 删除整库的二次确认闸（对齐 `ClearAllPanel` 的 `confirming` 口径）。
   * 整库删除**不走撤销**（撤销只覆盖数据条目），所以必须先明确确认再发 confirm:true。
   */
  const [confirmingRemove, setConfirmingRemove] = useState(false)

  const api = useMemo(() => (window.mbApi as unknown as { library: LibraryApi }).library, [])

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const snapshot = await api.list()
      setLibraries(snapshot.libraries)
      setActive(snapshot.active)
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }, [api])

  // 首次加载：写成 promise 链直挂 effect（与 App.tsx 既有约定一致，避免同步 setState 级联渲染）
  useEffect(() => {
    let cancelled = false
    api
      .list()
      .then((snapshot) => {
        if (cancelled) return
        setLibraries(snapshot.libraries)
        setActive(snapshot.active)
      })
      .catch((failure: unknown) => {
        if (!cancelled) setError(failure instanceof Error ? failure.message : String(failure))
      })
    return () => {
      cancelled = true
    }
  }, [api])

  const current = libraries.find((item) => item.name === active)
  const canSubmit = draft.trim() !== '' && draft.trim().length <= NAME_MAX && !busy

  const startEdit = (next: EditingMode): void => {
    setError(null)
    setMode(next)
    setDraft(next === 'rename' ? active : '')
  }

  const run = async (task: () => Promise<unknown>): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      await task()
      setMode(null)
      setDraft('')
      await refresh()
    } catch (failure) {
      // 主进程返回的中文错误直接展示
      setError(failure instanceof Error ? failure.message : String(failure))
      // 失败时以主进程为准回滚：handleSwitch 是乐观更新，若切换被拒而 active 不回滚，
      // 下拉会停在「并不活跃」的库上，用户再点它又因 `name === active` 判成无变化 ⇒ 卡住
      await refresh()
    } finally {
      setBusy(false)
    }
  }

  const handleSubmit = (): void => {
    const name = draft.trim()
    if (name === '') return
    if (mode === 'create') {
      void run(() => api.create({ name }))
      return
    }
    if (mode === 'rename') {
      void run(() => api.rename({ from: active, to: name }))
      return
    }
  }

  const handleSwitch = (name: string): void => {
    if (name === active) return
    setActive(name)
    void run(() => api.switch({ name }))
  }

  const handleRemove = (): void => {
    if (current === undefined || current.isInitial) return
    // 破坏性且不可撤销 ⇒ 两步：先亮确认闸，用户确认后才带 confirm:true 发 IPC
    setConfirmingRemove(true)
  }

  const confirmRemove = (): void => {
    if (current === undefined || current.isInitial) {
      setConfirmingRemove(false)
      return
    }
    void run(async () => {
      await api.remove({ name: current.name, confirm: true })
      setConfirmingRemove(false)
    })
  }

  const cancelRemove = (): void => {
    setConfirmingRemove(false)
  }

  return (
    <div className="library-bar" data-testid="library-bar">
      <div className="library-bar-row">
        <select
          className="form-select"
          data-testid="library-select"
          value={active}
          disabled={busy}
          onChange={(event) => handleSwitch(event.target.value)}
        >
          {libraries.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
              {item.isInitial ? '（初始）' : ''}
            </option>
          ))}
        </select>
        <span className="item-meta" data-testid="library-active">
          {active}
        </span>
      </div>

      <div className="library-bar-actions">
        <button
          type="button"
          className="btn slim icon"
          data-testid="library-create"
          aria-label="新建库"
          title="新建库"
          disabled={busy}
          onClick={() => startEdit('create')}
        >
          <LucideIcon name="plus" size={16} />
        </button>
        <button
          type="button"
          className="btn slim icon"
          data-testid="library-rename"
          aria-label="重命名库"
          title="重命名库"
          disabled={busy || current === undefined}
          onClick={() => startEdit('rename')}
        >
          <LucideIcon name="pencil" size={16} />
        </button>
        <button
          type="button"
          className="btn slim icon danger"
          data-testid="library-remove"
          aria-label="删除库"
          // 初始库禁删（主进程同样会拒绝，这里只是不给无效入口）
          disabled={busy || current === undefined || current.isInitial}
          title={current?.isInitial === true ? '初始库不可删除' : '删除库'}
          onClick={handleRemove}
        >
          <LucideIcon name="trash" size={16} />
        </button>
      </div>

      {/* 整库删除二次确认：删除会抹掉该库全部策划书/数据/图片，且**不进撤销栈** */}
      {confirmingRemove && current !== undefined && (
        <div className="library-bar-edit" data-testid="library-remove-confirm">
          <span className="form-label">确认删除库「{current.name}」？其全部策划书 / 数据 / 图片将被永久删除，且不可撤销。</span>
          <button
            type="button"
            className="btn slim danger"
            data-testid="library-remove-confirm-yes"
            disabled={busy}
            onClick={confirmRemove}
          >
            确认删除
          </button>
          <button
            type="button"
            className="btn slim"
            data-testid="library-remove-confirm-no"
            disabled={busy}
            onClick={cancelRemove}
          >
            取消
          </button>
        </div>
      )}

      {mode !== null && (
        <div className="library-bar-edit">
          <input
            className="form-input"
            data-testid="library-name-input"
            placeholder={mode === 'create' ? '新库名（如 项目 A）' : '新名称'}
            value={draft}
            maxLength={NAME_MAX}
            onChange={(event) => setDraft(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') handleSubmit()
              if (event.key === 'Escape') setMode(null)
            }}
          />
          <button
            type="button"
            className="btn slim primary"
            data-testid="library-name-submit"
            disabled={!canSubmit}
            onClick={handleSubmit}
          >
            {mode === 'create' ? '创建' : '确认'}
          </button>
          <button type="button" className="btn slim" data-testid="library-name-cancel" onClick={() => setMode(null)}>
            取消
          </button>
        </div>
      )}

      {error !== null && (
        <div className="form-error" data-testid="library-error">
          {error}
        </div>
      )}
    </div>
  )
}
