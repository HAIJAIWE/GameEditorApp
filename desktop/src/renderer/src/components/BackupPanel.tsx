import { useCallback, useEffect, useState } from 'react'

import type { BackupEntry, RestoreOutcome } from '../../../shared/util/backup'

/**
 * 数据备份面板（对应 旧版 `ui/dialogs/backup_manager`）。
 *
 * 与 旧版 的差异（都是**加了护栏**，不是漏做）：
 * - 恢复/删除在**渲染层内联确认一次**，主进程再校验 `confirm: true`（旧版 只有一个弹窗，可被绕过）；
 * - 恢复会先自动生成 `pre-restore` 快照（旧版 对话框路径没有，恢复错文件即不可回退）；
 * - 删除是**软删除**（改名为 `.deleted`），不是 旧版 的物理 `unlink`；
 * - 显示创建时间与大小，且文件名直接给出（旧版 从「时间戳 - 文件名」显示文本反推，文件名含分隔符会解析错）。
 */

interface BackupPanelProps {
  /** 恢复成功后回调：主进程数据已变，宿主需重新拉取列表 */
  onRestored: () => void
  onClose: () => void
}

function formatSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / 1024 / 1024).toFixed(2)} MB`
}

function formatTime(iso: string): string {
  const date = new Date(iso)
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleString()
}

export default function BackupPanel({ onRestored, onClose }: BackupPanelProps) {
  const [entries, setEntries] = useState<BackupEntry[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [label, setLabel] = useState('')
  const [pending, setPending] = useState<{ action: 'restore' | 'delete'; name: string } | null>(null)

  const reload = useCallback(async (): Promise<void> => {
    try {
      setEntries(await window.mbApi.backup.list())
      setError(null)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [])

  useEffect(() => {
    let alive = true
    window.mbApi.backup
      .list()
      .then((list) => {
        if (alive) setEntries(list)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
  }, [])

  const handleCreate = async (): Promise<void> => {
    setBusy(true)
    setNotice(null)
    try {
      const trimmed = label.trim()
      const entry = await window.mbApi.backup.create(trimmed === '' ? {} : { label: trimmed })
      setLabel('')
      setNotice(`已创建备份：${entry.name}（${formatSize(entry.sizeBytes)}）`)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleRestore = async (name: string): Promise<void> => {
    setBusy(true)
    setPending(null)
    setNotice(null)
    try {
      const outcome: RestoreOutcome = await window.mbApi.backup.restore({ name, confirm: true })
      if (outcome.restored) {
        setNotice(
          `已从 ${name} 恢复 ${outcome.totalItems} 条数据` +
            (outcome.preBackup === null ? '' : `；恢复前已自动备份为 ${outcome.preBackup}`)
        )
        onRestored()
      } else {
        setError(`恢复失败：${outcome.error ?? '未知原因'}`)
      }
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (name: string): Promise<void> => {
    setBusy(true)
    setPending(null)
    setNotice(null)
    try {
      await window.mbApi.backup.remove({ name, confirm: true })
      setNotice(`已删除备份：${name}（软删除，文件改名为 .deleted）`)
      await reload()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="editor" data-testid="backup-panel">
      <div className="editor-header">
        <div className="editor-title">
          数据备份
          <small>整个活跃库的快照</small>
        </div>
      </div>

      <div className="editor-body">
        <div className="form-row">
          <label className="form-label" htmlFor="backup-label">
            备份标签（可选）
          </label>
          <input
            id="backup-label"
            className="form-input"
            data-testid="backup-label"
            value={label}
            placeholder="如 before-balance；留空则只用时间戳"
            disabled={busy}
            onChange={(event) => setLabel(event.target.value)}
          />
        </div>

        <button
          type="button"
          className="btn primary"
          data-testid="backup-create"
          disabled={busy}
          onClick={() => void handleCreate()}
        >
          创建备份
        </button>

        {error !== null && <div className="error-banner">{error}</div>}
        {notice !== null && (
          <div className="notice-banner" data-testid="backup-notice">
            {notice}
          </div>
        )}

        {pending !== null && (
          <div className="form-row" data-testid="backup-confirm">
            <span className="form-label">
              {pending.action === 'restore'
                ? `确认用 ${pending.name} 覆盖当前数据？会先自动备份当前状态。`
                : `确认删除 ${pending.name}？`}
            </span>
            <button
              type="button"
              className="btn danger"
              data-testid="backup-confirm-yes"
              disabled={busy}
              onClick={() =>
                void (pending.action === 'restore' ? handleRestore(pending.name) : handleDelete(pending.name))
              }
            >
              {pending.action === 'restore' ? '确认恢复' : '确认删除'}
            </button>
            <button
              type="button"
              className="btn"
              data-testid="backup-confirm-no"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              取消
            </button>
          </div>
        )}

        {entries === null && error === null && <div className="empty">正在读取备份列表…</div>}
        {entries !== null && entries.length === 0 && (
          <div className="empty" data-testid="backup-empty">
            暂无备份，点击「创建备份」
          </div>
        )}

        {entries !== null &&
          entries.map((entry) => (
            <div className="ref-row" data-testid="backup-row" key={entry.name} style={{ cursor: 'default' }}>
              <span className="ref-row-main">{entry.name}</span>
              <span className="item-meta">
                {formatTime(entry.createdAt)} · {formatSize(entry.sizeBytes)}
              </span>
              <span style={{ display: 'flex', gap: 6, marginTop: 4 }}>
                <button
                  type="button"
                  className="btn"
                  data-testid="backup-restore"
                  disabled={busy}
                  onClick={() => setPending({ action: 'restore', name: entry.name })}
                >
                  恢复
                </button>
                <button
                  type="button"
                  className="btn danger"
                  data-testid="backup-delete"
                  disabled={busy}
                  onClick={() => setPending({ action: 'delete', name: entry.name })}
                >
                  删除
                </button>
              </span>
            </div>
          ))}
      </div>

      <div className="editor-actions">
        <button type="button" className="btn" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}
