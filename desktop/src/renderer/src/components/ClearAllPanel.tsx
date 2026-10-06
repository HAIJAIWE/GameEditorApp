import { useCallback, useEffect, useState } from 'react'

/**
 * 「清空所有数据」确认面板（对齐 Python `ui/main_window.py::clear_all_data`，
 * 菜单入口 `编辑 → 清空所有数据`）。
 *
 * PyQt 用模态 `QMessageBox.question(..., Yes | No)` 问一句「确定要清空所有数据吗？」，
 * 确认后 `data_manager.clear_all()` + 刷新全部页签 + toast「数据已清空」。
 *
 * ## 与 PyQt 的差异（都是**加了护栏 / 说得更清楚**，不是漏做）
 * - **显示条数**：PyQt 只问「确定吗」，用户不知道自己在删多少。TS 侧先 `data.listAll()`
 *   读出总数，确认区写明「将删除 N 条数据」。
 * - **明确不可撤销的风险**：文案点明「**正在编辑的条目表单里未保存的修改会一并丢失**」。
 *   TS 的条目表单草稿只存在于 React state（未点保存即只在内存里），
 *   清空后那些 id 已不存在，保存必然失败 —— 与其让用户撞上「数据不存在」报错，
 *   不如在按下确认前就说清楚。
 * - **可撤销**：与 PyQt 一致走 `data:deleteMany` 的统一路径，主进程会落一条
 *   `deleteMany` 撤销记录，用户按 `Ctrl+Z` 可整批找回（面板上如实告知）。
 *
 * 交互沿用项目既有做法：**内联两按钮确认态**（同 `BatchEditPanel` 的删除确认、
 * `BackupPanel` 的恢复/删除确认），不自造弹窗组件。
 * 浮层头部已有统一的「关闭」按钮，故本组件**不接收 `onClose`**（关闭 = 取消）。
 */

interface ClearAllPanelProps {
  /** 清空完成回调：宿主需刷新增撤状态与各视图（对齐 PyQt 的 `_refresh_all_tabs()`） */
  onCleared: (deleted: number) => void
}

type CountState = { status: 'loading' } | { status: 'ready'; total: number } | { status: 'error'; message: string }

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function ClearAllPanel({ onCleared }: ClearAllPanelProps) {
  const [count, setCount] = useState<CountState>({ status: 'loading' })
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  // 打开面板即读全库条数（用户需要知道自己在删什么）；只读，不改数据
  useEffect(() => {
    let alive = true
    window.mbApi.data
      .listAll()
      .then((records) => {
        if (alive) setCount({ status: 'ready', total: records.length })
      })
      .catch((err: unknown) => {
        if (alive) setCount({ status: 'error', message: toErrorMessage(err) })
      })
    return () => {
      alive = false
    }
  }, [])

  const handleClear = useCallback(async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await window.mbApi.data.clearAll({ confirm: true })
      onCleared(result.deleted)
    } catch (err) {
      setError(toErrorMessage(err))
      setConfirming(false)
    } finally {
      setBusy(false)
    }
  }, [onCleared])

  const total = count.status === 'ready' ? count.total : null

  return (
    <div className="editor" data-testid="clearall-panel">
      <div className="editor-header">
        <div className="editor-title">
          清空所有数据
          <small>删除当前库全部条目（可撤销）</small>
        </div>
      </div>

      <div className="editor-body">
        {count.status === 'loading' && <div className="empty">正在统计全库数据条数…</div>}
        {count.status === 'error' && (
          <div className="form-error" data-testid="clearall-count-error">
            读取数据条数失败：{count.message}
          </div>
        )}

        {count.status === 'ready' &&
          (total === 0 ? (
            <div className="empty" data-testid="clearall-empty">
              当前库没有任何数据，无需清空。
            </div>
          ) : (
            <>
              {/* 破坏性操作的风险提示（与 BatchEditPanel 的 delete_selected 同一条样式类） */}
              <div className="danger-hint" data-testid="clearall-warning">
                将删除当前库全部 {total} 条数据（跨所有数据类型）。
                <br />
                正在编辑的条目表单里<b>未保存</b>的修改会一并丢失，且保存按钮之后会因条目已不存在而报错。
                <br />
                删除会整批记入撤销栈，可用 Ctrl+Z 找回；但关闭应用后撤销历史不再保留。
              </div>

              {confirming && (
                <div className="form-row" data-testid="clearall-confirm">
                  <span className="form-label">确认清空 {total} 条数据？</span>
                  <button
                    type="button"
                    className="btn danger"
                    data-testid="clearall-confirm-yes"
                    disabled={busy}
                    onClick={() => void handleClear()}
                  >
                    确认清空
                  </button>
                  <button
                    type="button"
                    className="btn"
                    data-testid="clearall-confirm-no"
                    disabled={busy}
                    onClick={() => setConfirming(false)}
                  >
                    取消
                  </button>
                </div>
              )}
            </>
          ))}

        {error !== null && (
          <div className="form-error" data-testid="clearall-error">
            {error}
          </div>
        )}
      </div>

      {!confirming && (
        <div className="editor-actions">
          <button
            type="button"
            className="btn danger"
            data-testid="clearall-start"
            disabled={busy || count.status !== 'ready' || total === 0}
            onClick={() => setConfirming(true)}
          >
            清空所有数据…
          </button>
        </div>
      )}
    </div>
  )
}