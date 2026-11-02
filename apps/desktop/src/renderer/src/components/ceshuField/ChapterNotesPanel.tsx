import { useEffect, useState } from 'react'

import { useT } from '@mobai/client-ui'

import { CHAPTER_KEYS, CHAPTER_LABELS, type ChapterKey } from '@mobai/shared/ceshu/reference'
import { countNotesByChapter, filterNotes, notePreview, type CeshuNote } from '@mobai/shared/ceshu/notes'
import { toErrorMessage } from '@mobai/shared/util/system'

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
  const t = useT()
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
      setNotice(t('notes.created', { chapter: CHAPTER_LABELS[targetChapter] }))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleSave = async (): Promise<void> => {
    if (!selectedId) {
      setError(t('notes.needSelection'))
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
      setNotice(t('notes.saved'))
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
      setNotice(result.deleted ? t('notes.deleted') : t('notes.deleteMissing'))
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
          {notes ? t('notes.titleWithCount', { n: notes.length }) : t('notes.title')}
        </span>
        <div className="editor-actions">
          <button type="button" className="btn" data-testid="notes-add" disabled={busy} onClick={() => void handleAdd()}>
            {t('notes.add')}
          </button>
          <button
            type="button"
            className="btn primary"
            data-testid="notes-save"
            disabled={busy || !selectedId}
            onClick={() => void handleSave()}
          >
            {t('common.save')}
          </button>
          {confirmDelete ? (
            <button
              type="button"
              className="btn danger"
              data-testid="notes-delete-confirm"
              disabled={busy}
              onClick={() => void handleDelete()}
            >
              {t('notes.confirmDelete')}
            </button>
          ) : (
            <button
              type="button"
              className="btn"
              data-testid="notes-delete"
              disabled={busy || !selectedId}
              onClick={() => setConfirmDelete(true)}
            >
              {t('common.delete')}
            </button>
          )}
          <button type="button" className="btn" data-testid="notes-close" onClick={onClose}>
            {t('common.close')}
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
          <span className="form-label">{t('notes.chapterFilter')}</span>
          <select
            className="form-select"
            data-testid="notes-filter"
            value={chapterFilter}
            onChange={(event) => setChapterFilter(event.target.value)}
          >
            <option value="">{t('notes.allChapters')}</option>
            {CHAPTER_KEYS.map((key) => (
              <option key={key} value={key}>
                {CHAPTER_LABELS[key]}
              </option>
            ))}
          </select>

          <div className="notes-list">
            {notes === null ? (
              <div className="empty">{t('notes.loading')}</div>
            ) : listed.length === 0 ? (
              <div className="empty">{t('notes.empty')}</div>
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
                    <span className="notes-item-preview">{preview || t('notes.previewEmpty')}</span>
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
            <span className="form-label">{t('notes.chapter')}</span>
            <span className="item-meta" data-testid="notes-chapter">
              {CHAPTER_LABELS[(current?.chapter_key as ChapterKey) ?? targetChapter] ??
                (current?.chapter_key ?? targetChapter)}
              {current ? '' : t('notes.newOwnership')}
            </span>
            <span className="form-label">{t('notes.author')}</span>
            <input
              className="form-input"
              data-testid="notes-author"
              value={author}
              placeholder={t('notes.authorPlaceholder')}
              onChange={(event) => setAuthor(event.target.value)}
            />
          </div>
          <textarea
            className="form-textarea notes-content"
            data-testid="notes-content"
            value={content}
            placeholder={t('notes.contentPlaceholder')}
            onChange={(event) => setContent(event.target.value)}
          />
          <div className="item-meta" data-testid="notes-status">
            {selectedId
              ? t('notes.editing', { time: current?.updated_at || '' })
              : t('notes.noSelection')}
          </div>
        </div>
      </div>
    </div>
  )
}