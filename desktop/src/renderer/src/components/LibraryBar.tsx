import { useCallback, useEffect, useMemo, useState } from 'react'

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

interface LibraryApi {
  list: () => Promise<LibraryEntryShape[]>
  create: (req: { name: string; description?: string }) => Promise<LibraryEntryShape>
  rename: (req: { from: string; to: string }) => Promise<{ ok: boolean }>
  remove: (req: { name: string }) => Promise<{ switchedTo: string | null }>
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

  const api = useMemo(() => (window.mbApi as unknown as { library: LibraryApi }).library, [])

  const refresh = useCallback(async (): Promise<void> => {
    try {
      const list = await api.list()
      setLibraries(list)
      setActive((current) => (list.some((item) => item.name === current) ? current : (list[0]?.name ?? '')))
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : String(failure))
    }
  }, [api])

  // 首次加载：写成 promise 链直挂 effect（与 App.tsx 既有约定一致，避免同步 setState 级联渲染）
  useEffect(() => {
    let cancelled = false
    api
      .list()
      .then((list) => {
        if (cancelled) return
        setLibraries(list)
        setActive((current) => (list.some((item) => item.name === current) ? current : (list[0]?.name ?? '')))
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
    void run(() => api.remove({ name: current.name }))
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
          className="btn slim"
          data-testid="library-create"
          disabled={busy}
          onClick={() => startEdit('create')}
        >
          新建
        </button>
        <button
          type="button"
          className="btn slim"
          data-testid="library-rename"
          disabled={busy || current === undefined}
          onClick={() => startEdit('rename')}
        >
          重命名
        </button>
        <button
          type="button"
          className="btn slim danger"
          data-testid="library-remove"
          // 初始库禁删（主进程同样会拒绝，这里只是不给无效入口）
          disabled={busy || current === undefined || current.isInitial}
          title={current?.isInitial === true ? '初始库不可删除' : undefined}
          onClick={handleRemove}
        >
          删除
        </button>
      </div>

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
