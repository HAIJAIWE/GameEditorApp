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

import ChapterForm from './ChapterForm'

interface CeshuViewProps {
  ceshuId: string | null
  onChanged: () => void
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

/** 策划书编辑器：章节导航（含进度）+ 章节表单 */
export default function CeshuView({ ceshuId, onChanged }: CeshuViewProps) {
  const [doc, setDoc] = useState<CeshuDocument | null>(null)
  const [activeChapter, setActiveChapter] = useState<ChapterKey>('meta')
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exportFormat, setExportFormat] = useState<CeshuExportFormat>('markdown')

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

  return (
    <div className="ceshu-view">
      <header className="toolbar">
        <h1>{gameName}</h1>
        <span className="item-meta">档位：{scope === 'lite' ? '轻量（9 章）' : '工业级（18 章）'}</span>
        <span className="item-meta" data-testid="ceshu-total-progress">
          总进度 {Math.round((progress.total ?? 0) * 100)}%
        </span>
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

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      <div className="content">
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
      </div>
    </div>
  )
}