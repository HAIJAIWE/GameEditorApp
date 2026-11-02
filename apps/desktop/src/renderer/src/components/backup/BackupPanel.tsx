import { useCallback, useEffect, useState } from 'react'

import { useT } from '@mobai/client-ui'
import type { BackupEntry, RestoreOutcome } from '@mobai/shared/util/io'

/**
 * 数据备份面板。
 *
 * 与 旧版 的差异（都是**加了护栏**，不是漏做）：
 * - 恢复/删除在**渲染层内联确认一次**，主进程再校验 `confirm: true`；
 * - 恢复会先自动生成 `pre-restore` 快照；
 * - 删除是**软删除**（改名为 `.deleted`），不是 旧版 的物理 `unlink`；
 * - 显示创建时间与大小，且文件名直接给出。
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
  const t = useT()
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
      setNotice(t('backup.created', { name: entry.name, size: formatSize(entry.sizeBytes) }))
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
          t('backup.restored', {
            name,
            count: outcome.totalItems,
            extra: outcome.preBackup === null ? '' : t('backup.restoredExtra', { path: outcome.preBackup })
          })
        )
        onRestored()
      } else {
        setError(t('backup.restoreFailed', { reason: outcome.error ?? t('backup.unknownReason') }))
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
      setNotice(t('backup.deleted', { name }))
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
          {t('backup.title')}
          <small>{t('backup.subtitle')}</small>
        </div>
      </div>

      <div className="editor-body">
        <div className="form-row">
          <label className="form-label" htmlFor="backup-label">
            {t('backup.labelLabel')}
          </label>
          <input
            id="backup-label"
            className="form-input"
            data-testid="backup-label"
            value={label}
            placeholder={t('backup.labelPlaceholder')}
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
          {t('backup.create')}
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
                ? t('backup.confirmRestore', { name: pending.name })
                : t('backup.confirmDelete', { name: pending.name })}
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
              {pending.action === 'restore' ? t('backup.confirmRestoreBtn') : t('backup.confirmDeleteBtn')}
            </button>
            <button
              type="button"
              className="btn"
              data-testid="backup-confirm-no"
              disabled={busy}
              onClick={() => setPending(null)}
            >
              {t('backup.cancel')}
            </button>
          </div>
        )}

        {entries === null && error === null && <div className="empty">{t('backup.loading')}</div>}
        {entries !== null && entries.length === 0 && (
          <div className="empty" data-testid="backup-empty">
            {t('backup.empty')}
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
                  {t('backup.restore')}
                </button>
                <button
                  type="button"
                  className="btn danger"
                  data-testid="backup-delete"
                  disabled={busy}
                  onClick={() => setPending({ action: 'delete', name: entry.name })}
                >
                  {t('backup.delete')}
                </button>
              </span>
            </div>
          ))}
      </div>

      <div className="editor-actions">
        <button type="button" className="btn" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
    </div>
  )
}
