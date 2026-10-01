import { useCallback, useEffect, useState } from 'react'

import {
  CESHU_EXPORT_FORMATS,
  CESHU_FORMAT_LABELS,
  CHAPTER_LABELS,
  visibleChapterKeys,
  type CeshuDocument,
  type CeshuExportFormat,
  type ChapterData,
  type ChapterKey
} from '../../../shared/ceshuConstants'
import { computeChapterProgress, getGddScope } from '../../../shared/ceshuModel'
import type { CeshuChangeItem, CeshuChangelog } from '../../../shared/ceshuDiff'

import ChapterForm from './ChapterForm'

interface CeshuViewProps {
  ceshuId: string | null
  onChanged: () => void
  /** 切换当前策划书（派生新版本后自动切到新版本） */
  onSelect: (id: string) => void
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 变更明细按章节分组（保持出现顺序） */
function groupByChapter(changes: CeshuChangeItem[]): Array<[string, CeshuChangeItem[]]> {
  const groups = new Map<string, CeshuChangeItem[]>()
  for (const change of changes) {
    const list = groups.get(change.chapter)
    if (list) list.push(change)
    else groups.set(change.chapter, [change])
  }
  return [...groups.entries()]
}

/** 策划书编辑器：章节导航（含进度）+ 章节表单 + 版本链操作 */
export default function CeshuView({ ceshuId, onChanged, onSelect }: CeshuViewProps) {
  const [doc, setDoc] = useState<CeshuDocument | null>(null)
  const [activeChapter, setActiveChapter] = useState<ChapterKey>('meta')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exportFormat, setExportFormat] = useState<CeshuExportFormat>('markdown')
  const [deriveOpen, setDeriveOpen] = useState(false)
  const [deriveNote, setDeriveNote] = useState('')
  const [changelog, setChangelog] = useState<CeshuChangelog | null>(null)

  useEffect(() => {
    if (!ceshuId) return
    let cancelled = false
    window.mbApi.ceshu
      .get({ id: ceshuId })
      .then((loaded) => {
        if (cancelled) return
        setDoc(loaded)
        setActiveChapter('meta')
        setError(null)
        setChangelog(null)
        setDeriveOpen(false)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [ceshuId])

  const handleSave = useCallback(
    async (chapter: ChapterKey, data: ChapterData): Promise<void> => {
      if (!ceshuId) return
      setBusy(true)
      try {
        const updated = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter, data })
        setDoc(updated)
        setNotice(`已保存：${CHAPTER_LABELS[chapter]}`)
        setError(null)
        onChanged()
      } catch (err) {
        setError(toErrorMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [ceshuId, onChanged]
  )

  if (!ceshuId) {
    return (
      <div className="ceshu-view">
        <div className="empty">请在左侧选择或新建策划书</div>
      </div>
    )
  }

  // 切换策划书时旧文档仍在 state 中，id 不匹配则视为加载中
  if (!doc || doc.ceshu_id !== ceshuId) {
    return (
      <div className="ceshu-view">
        <div className="empty">正在加载策划书…</div>
      </div>
    )
  }

  const scope = getGddScope(doc)
  const visible = visibleChapterKeys(scope)
  const progress = computeChapterProgress(doc)
  const gameName = typeof doc.meta.game_name === 'string' && doc.meta.game_name ? doc.meta.game_name : '未命名策划书'

  /** 导出当前策划书：选择保存路径 → 主进程按格式渲染并原子写盘 */
  const handleExport = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseCeshuExportFile({ format: exportFormat, defaultName: gameName })
      if (!chosen.path) return
      setBusy(true)
      const result = await window.mbApi.ceshu.export({ id: doc.ceshu_id, format: exportFormat, path: chosen.path })
      setNotice(`已导出（${CESHU_FORMAT_LABELS[result.format]}）：${result.filePath}`)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 派生新版本：复制当前版本内容，版本号自动递增，默认未激活 */
  const handleDerive = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      setBusy(true)
      const created = await window.mbApi.ceshu.derive({ id: doc.ceshu_id, note: deriveNote })
      setDeriveOpen(false)
      setDeriveNote('')
      setNotice(`已派生新版本 ${created.version_label}（默认未激活，可点「设为激活」）`)
      onChanged()
      onSelect(created.ceshu_id)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 将当前文档设为激活版本（同链其他版本自动取消激活） */
  const handleSetActive = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      setBusy(true)
      const updated = await window.mbApi.ceshu.setActive({ id: doc.ceshu_id })
      setDoc(updated)
      setNotice(`已激活版本：${updated.version_label}`)
      onChanged()
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 查看版本链变更记录（同链版本按时间逐对 diff） */
  const handleShowChangelog = async (): Promise<void> => {
    try {
      setError(null)
      setBusy(true)
      const log = await window.mbApi.ceshu.changelog({ id: doc.ceshu_id })
      setChangelog(log)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="ceshu-view">
      <header className="toolbar">
        <h1>{gameName}</h1>
        <span className="item-meta" data-testid="ceshu-version">
          {doc.version_label}
          {doc.is_active ? ' ★ 激活' : ' · 未激活'}
        </span>
        <span className="item-meta">档位：{scope === 'lite' ? '轻量（9 章）' : '工业级（18 章）'}</span>
        <span className="item-meta" data-testid="ceshu-total-progress">
          总进度 {Math.round((progress.total ?? 0) * 100)}%
        </span>
        {!doc.is_active && (
          <button type="button" className="btn" data-testid="ceshu-set-active" disabled={busy} onClick={() => void handleSetActive()}>
            设为激活
          </button>
        )}
        <button type="button" className="btn" data-testid="ceshu-derive" disabled={busy} onClick={() => setDeriveOpen((open) => !open)}>
          派生新版本
        </button>
        <button type="button" className="btn" data-testid="ceshu-changelog" disabled={busy} onClick={() => void handleShowChangelog()}>
          变更记录
        </button>
        <select
          className="form-select export-format"
          data-testid="export-format"
          value={exportFormat}
          onChange={(event) => setExportFormat(event.target.value as CeshuExportFormat)}
        >
          {CESHU_EXPORT_FORMATS.map((format) => (
            <option key={format} value={format}>
              {CESHU_FORMAT_LABELS[format]}
            </option>
          ))}
        </select>
        <button type="button" className="btn" data-testid="ceshu-export" disabled={busy} onClick={() => void handleExport()}>
          导出
        </button>
      </header>

      {deriveOpen && (
        <div className="derive-panel">
          <span className="form-label">新版本说明（可留空）</span>
          <input
            className="form-input"
            data-testid="derive-note"
            value={deriveNote}
            placeholder="本次迭代改了什么"
            onChange={(event) => setDeriveNote(event.target.value)}
          />
          <button type="button" className="btn primary" data-testid="derive-confirm" disabled={busy} onClick={() => void handleDerive()}>
            确认派生
          </button>
          <button type="button" className="btn" onClick={() => setDeriveOpen(false)}>
            取消
          </button>
        </div>
      )}

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      <div className="content">
        {changelog ? (
          <div className="changelog-panel" data-testid="changelog-panel">
            <div className="changelog-header">
              <span className="chapter-form-title">变更记录（{changelog.entries.length} 次版本变更）</span>
              <button type="button" className="btn" data-testid="changelog-close" onClick={() => setChangelog(null)}>
                关闭
              </button>
            </div>
            {changelog.entries.length === 0 ? (
              <div className="empty">暂无变更记录（版本链只有一份文档时无对比对象）</div>
            ) : (
              changelog.entries.map((entry) => (
                <div className="changelog-entry" key={`${entry.version}:${entry.date}`}>
                  <div className="changelog-entry-title">
                    {entry.version} — {entry.summary}
                  </div>
                  <div className="item-meta">{entry.date}</div>
                  {groupByChapter(entry.changes).map(([chapter, changes]) => (
                    <div className="changelog-chapter" key={chapter}>
                      <div className="form-label">{chapter}</div>
                      {changes.map((change, index) => (
                        <div key={`${change.field}:${index}`} className={`changelog-line ${change.type}`}>
                          {change.description}
                        </div>
                      ))}
                    </div>
                  ))}
                </div>
              ))
            )}
          </div>
        ) : (
          <>
            <div className="chapter-nav">
              {visible.map((key) => (
                <button
                  key={key}
                  type="button"
                  data-testid="chapter-tab"
                  className={`chapter-tab${key === activeChapter ? ' active' : ''}`}
                  onClick={() => setActiveChapter(key)}
                >
                  <span className="chapter-tab-label">{CHAPTER_LABELS[key]}</span>
                  <span className="chapter-progress">{Math.round((progress[key] ?? 0) * 100)}%</span>
                </button>
              ))}
              {scope === 'lite' && (
                <div className="chapter-nav-hint">轻量档仅含基础 9 章；在「项目元信息」中可切换为工业级 18 章</div>
              )}
            </div>

            <div className="chapter-body">
              <ChapterForm
                key={`${doc.ceshu_id}:${activeChapter}`}
                chapter={activeChapter}
                data={doc[activeChapter]}
                busy={busy}
                onSave={handleSave}
              />
            </div>
          </>
        )}
      </div>
    </div>
  )
}