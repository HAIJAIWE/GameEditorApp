import { useEffect, useState } from 'react'

import { CHAPTER_KEYS, CHAPTER_LABELS, type ChapterKey } from '../../../shared/ceshu/reference/ceshuConstants'
import { countNotesByChapter, filterNotes, notePreview, type CeshuNote } from '../../../shared/ceshu/notes/ceshuNotes'
import { toErrorMessage } from '../../../shared/util/system/errors'

/**
 * 章节笔记面板：
 * - 左侧：章节筛选（全部 + 各章）+ 笔记列表（含该章数量徽标与 30 字预览）+ 新建笔记
 * - 右侧：章节（只读）+ 作者 + 正文编辑器 + 保存 / 删除（二次确认）
 * 说明：旧版 编辑区的章节下拉在保存时被忽略（quirk），TS 改为只读展示；
 * 新建笔记的归属章节取自左侧筛选（未筛选时用列表首个章节）。
 */

interface ChapterNotesPanelProps {
  ceshuId: string
  onClose: () => void
}

export default function ChapterNotesPanel({ ceshuId, onClose }: ChapterNotesPanelProps) {
  const [notes, setNotes] = useState<CeshuNote[] | null>(null)
  const [chapterFilter, setChapterFilter] = useState('')
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [author, setAuthor] = useState('')
  const [content, setContent] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.mbApi.ceshu.notes
      .list({ id: ceshuId })
      .then((loaded) => {
        if (!cancelled) setNotes(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [ceshuId])

  const listed = filterNotes(notes ?? [], chapterFilter || undefined)
  const counts = countNotesByChapter(notes ?? [])
  const current = (notes ?? []).find((note) => note.id === selectedId) ?? null
  const targetChapter: ChapterKey = chapterFilter ? (chapterFilter as ChapterKey) : (CHAPTER_KEYS[0] as ChapterKey)

  /** 重新拉取列表（磁盘为唯一事实来源），必要时保持选中项 */
  const refresh = async (keepId?: string): Promise<CeshuNote[]> => {
    const loaded = await window.mbApi.ceshu.notes.list({ id: ceshuId })
    setNotes(loaded)
    if (keepId && loaded.some((note) => note.id === keepId)) {
      setSelectedId(keepId)
    }
    return loaded
  }

  const handleSelect = (note: CeshuNote): void => {
    setSelectedId(note.id)
    setAuthor(note.author)
    setContent(note.content)
    setConfirmDelete(false)
    setError(null)
    setNotice(null)
  }

  /** 新建空笔记并选中（归属章节 = 左侧筛选章节，缺省列表首个章节） */
  const handleAdd = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const created = await window.mbApi.ceshu.notes.add({ id: ceshuId, chapterKey: targetChapter, content: '' })
      await refresh(created.id)
      setAuthor(created.author)
      setContent('')
      setConfirmDelete(false)
      setNotice(`已新建笔记（${CHAPTER_LABELS[targetChapter]}），填写后点击「保存」`)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!selectedId) {
      setError('请先选择或新建一条笔记')
      return
    }
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const updated = await window.mbApi.ceshu.notes.update({
        id: ceshuId,
        noteId: selectedId,
        content,
        author: author.trim() || undefined
      })
      await refresh(updated.id)
      setAuthor(updated.author)
      setContent(updated.content)
      setNotice('笔记已保存')
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    if (!selectedId) return
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await window.mbApi.ceshu.notes.remove({ id: ceshuId, noteId: selectedId })
      await refresh()
      setSelectedId(null)
      setAuthor('')
      setContent('')
      setConfirmDelete(false)
      setNotice(result.deleted ? '笔记已删除' : '笔记不存在，可能已被删除')
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="changelog-panel" data-testid="notes-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">
          章节笔记{notes ? `（共 ${notes.length} 条）` : ''}
        </span>
        <div className="editor-actions">
          <button type="button" className="btn" data-testid="notes-add" disabled={busy} onClick={() => void handleAdd()}>
            新建笔记
          </button>
          <button
            type="button"
            className="btn primary"
            data-testid="notes-save"
            disabled={busy || !selectedId}
            onClick={() => void handleSave()}
          >
            保存
          </button>
          {confirmDelete ? (
            <button
              type="button"
              className="btn danger"
              data-testid="notes-delete-confirm"
              disabled={busy}
              onClick={() => void handleDelete()}
            >
              确认删除
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              data-testid="notes-delete"
              disabled={busy || !selectedId}
              onClick={() => setConfirmDelete(true)}
            >
              删除
            </button>
          )}
          <button type="button" className="btn" data-testid="notes-close" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>

      {error && (
        <div className="form-error" data-testid="notes-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice-banner" data-testid="notes-notice">
          {notice}
        </div>
      )}

      <div className="notes-body">
        <div className="notes-side">
          <span className="form-label">章节筛选</span>
          <select
            className="form-select"
            data-testid="notes-filter"
            value={chapterFilter}
            onChange={(event) => setChapterFilter(event.target.value)}
          >
            <option value="">全部章节</option>
            {CHAPTER_KEYS.map((key) => (
              <option key={key} value={key}>
                {CHAPTER_LABELS[key]}
              </option>
            ))}
          </select>

          <div className="notes-list">
            {notes === null ? (
              <div className="empty">正在加载笔记…</div>
            ) : listed.length === 0 ? (
              <div className="empty">暂无笔记，点击「新建笔记」开始记录</div>
            ) : (
              listed.map((note) => {
                const label = CHAPTER_LABELS[note.chapter_key as ChapterKey] ?? note.chapter_key
                const count = counts[note.chapter_key] ?? 0
                const preview = notePreview(note.content)
                return (
                  <button
                    key={note.id}
                    type="button"
                    data-testid="notes-item"
                    className={`notes-item${note.id === selectedId ? ' active' : ''}`}
                    onClick={() => handleSelect(note)}
                  >
                    <span className="notes-item-title">
                      [{label}] (×{count})
                    </span>
                    <span className="notes-item-preview">{preview || '(空)'}</span>
                    <span className="notes-item-meta">
                      {note.author} · {note.updated_at || note.created_at}
                    </span>
                  </button>
                )
              })
            )}
          </div>
        </div>

        <div className="notes-editor">
          <div className="notes-editor-row">
            <span className="form-label">章节</span>
            <span className="item-meta" data-testid="notes-chapter">
              {CHAPTER_LABELS[(current?.chapter_key as ChapterKey) ?? targetChapter] ??
                (current?.chapter_key ?? targetChapter)}
              {current ? '' : '（新建归属）'}
            </span>
            <span className="form-label">作者</span>
            <input
              className="form-input"
              data-testid="notes-author"
              value={author}
              placeholder="作者名（缺省 anonymous）"
              onChange={(event) => setAuthor(event.target.value)}
            />
          </div>
          <textarea
            className="form-textarea notes-content"
            data-testid="notes-content"
            value={content}
            placeholder="在此输入笔记内容（设计想法、修改记录、讨论要点）…"
            onChange={(event) => setContent(event.target.value)}
          />
          <div className="item-meta" data-testid="notes-status">
            {selectedId
              ? `编辑中：${current?.updated_at || ''}`
              : '未选择笔记（可先「新建笔记」，或从左侧选择一条）'}
          </div>
        </div>
      </div>
    </div>
  )
}