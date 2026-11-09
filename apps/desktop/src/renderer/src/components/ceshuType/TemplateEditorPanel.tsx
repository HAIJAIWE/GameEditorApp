import { useEffect, useState } from 'react'

import { useT } from '@mobai/client-ui'

import { CHAPTER_KEYS, CHAPTER_LABELS, type CeshuDocument, type ChapterKey } from '@mobai/shared/ceshu/reference'
import {
  TEMPLATE_NAME_REQUIRED_ERROR,
  filterCustomTemplates,
  isValidCustomTemplateName,
  parseTemplateTagsInput,
  type CeshuCustomTemplate
} from '@mobai/shared/ceshu/reference'
import { isPlainObject } from '@mobai/shared/ceshu/model'
import {
  listChapterTemplates,
  mergeTemplateByMode,
  searchChapterTemplates,
  templateChapterLabel,
  type ChapterTemplate
} from '@mobai/shared/ceshu/reference'
import { toErrorMessage } from '@mobai/shared/util/system'

/**
 * GDD 模板编辑器面板：
 * - 左：模板列表（自定义 + 内置；筛选 = 全部章节 / 仅自定义 / 仅内置 / 各章节 + 关键词搜索）
 * - 右：模板编辑器（名称 / 章节 / 描述 / 标签 / 来源 / 数据 JSON）+「从当前章节加载」「应用到该章节」
 * - 底：新建 / 保存 / 删除 / 导出 / 导入（可勾选覆盖同 ID）/ 关闭
 * 有意偏离 旧版：① 「保存模板」不再同时把数据写入章节；
 * ② 「应用到该章节」直接落盘（经 ceshu:saveChapter），不做内存态等待人工保存；
 * ③ 选中内置模板时「保存」可用，等价于「另存为自定义模板」。
 */

interface TemplateEditorPanelProps {
  ceshuId: string
  doc: CeshuDocument
  currentChapter: string
  gameName: string
  onApplied: (updated: CeshuDocument, chapterKey: ChapterKey) => void
  onClose: () => void
}

type TemplateSource = 'custom' | 'builtin'

interface EditorEntry {
  key: string
  source: TemplateSource
  /** 列表展示文案 */
  label: string
  template: ChapterTemplate
  /** 模板自身所属章节（全局为 ''） */
  chapterKey: string
  /** 自定义模板 id（内置为空串） */
  customId: string
  /** 来源游戏名（内置为空串） */
  sourceGame: string
}

function stringifyData(data: unknown): string {
  return JSON.stringify(isPlainObject(data) ? data : {}, null, 2)
}

export default function TemplateEditorPanel({
  ceshuId,
  doc,
  currentChapter,
  gameName,
  onApplied,
  onClose
}: TemplateEditorPanelProps) {
  const t = useT()
  const [customTemplates, setCustomTemplates] = useState<CeshuCustomTemplate[]>([])
  const [filter, setFilter] = useState<string>(currentChapter)
  const [keyword, setKeyword] = useState('')
  const [selectedKey, setSelectedKey] = useState('')
  const [selectedSource, setSelectedSource] = useState<TemplateSource>('custom')
  const [selectedId, setSelectedId] = useState('')
  const [name, setName] = useState('')
  const [chapterKey, setChapterKey] = useState<string>(currentChapter)
  const [description, setDescription] = useState('')
  const [tagsText, setTagsText] = useState('')
  const [sourceGame, setSourceGame] = useState('')
  const [dataText, setDataText] = useState('{}')
  const [deleting, setDeleting] = useState(false)
  const [overwrite, setOverwrite] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const loadCustomTemplates = async (): Promise<void> => {
    const loaded = await window.mbApi.ceshu.templates.list({})
    setCustomTemplates(loaded)
  }

  useEffect(() => {
    let cancelled = false
    window.mbApi.ceshu.templates
      .list({})
      .then((loaded) => {
        if (!cancelled) setCustomTemplates(loaded)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 列表构建
  const showCustom = filter !== '__builtin__'
  const showBuiltin = filter !== '__custom__'
  const chapterFilter = filter && filter !== '__custom__' && filter !== '__builtin__' ? filter : ''
  const trimmedKeyword = keyword.trim().toLowerCase()

  const entries: EditorEntry[] = []
  if (showCustom) {
    const base = filterCustomTemplates(customTemplates, chapterFilter || undefined)
    const matched = trimmedKeyword
      ? base.filter((item) =>
          `${item.name}${item.description}${item.tags.join(' ')}`.toLowerCase().includes(trimmedKeyword)
        )
      : base
    for (const item of matched) {
      entries.push({
        key: `custom:${item.id}`,
        source: 'custom',
        label: t('templateEditor.customLabel', {
          name: item.name || t('templateEditor.unnamed'),
          section: item.chapter_key ? `  (${templateChapterLabel(item.chapter_key)})` : ''
        }),
        template: {
          name: item.name,
          description: item.description,
          tags: item.tags,
          data: item.data
        },
        chapterKey: item.chapter_key,
        customId: item.id,
        sourceGame: item.source_game
      })
    }
  }
  if (showBuiltin) {
    const hits = chapterFilter
      ? listChapterTemplates(chapterFilter).map((template) => ({ chapterKey: chapterFilter, template }))
      : searchChapterTemplates(keyword.trim())
    for (const hit of hits) {
      entries.push({
        key: `builtin:${hit.chapterKey}:${hit.template.name}`,
        source: 'builtin',
        label: t('templateEditor.builtinLabel', {
          name: hit.template.name || t('templateEditor.unnamed'),
          section: templateChapterLabel(hit.chapterKey)
        }),
        template: hit.template,
        chapterKey: hit.chapterKey,
        customId: '',
        sourceGame: ''
      })
    }
  }

  const selectedEntry = entries.find((entry) => entry.key === selectedKey) ?? null

  /** 选中模板 → 填充编辑器 */
  const handleSelect = (entry: EditorEntry): void => {
    setSelectedKey(entry.key)
    setSelectedSource(entry.source)
    setSelectedId(entry.customId)
    setName(entry.template.name)
    setDescription(entry.template.description)
    setTagsText(entry.template.tags.join(', '))
    setChapterKey(entry.chapterKey)
    setSourceGame(entry.sourceGame)
    setDataText(stringifyData(entry.template.data))
    setDeleting(false)
  }

  /** 从当前章节加载 */
  const handleLoadCurrent = (): void => {
    const target = chapterKey || currentChapter
    const data = doc[target as ChapterKey]
    setDataText(stringifyData(data))
    if (!name.trim()) {
      setName(t('templateEditor.defaultName', { section: templateChapterLabel(target) }))
    }
  }

  /** 应用到该章节：按覆盖语义合并后直接写盘 */
  const handleApplyCurrent = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    const data = parseDataText()
    if (!data) return
    if (!chapterKey) {
      setError(t('templateEditor.needChapter'))
      return
    }
    setBusy(true)
    try {
      const existing = doc[chapterKey as ChapterKey]
      const merged = mergeTemplateByMode(existing, data, 'overwrite')
      const updated = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter: chapterKey, data: merged })
      onApplied(updated, chapterKey as ChapterKey)
      setNotice(t('templateEditor.applied', { section: templateChapterLabel(chapterKey) }))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 新建：清空编辑器并从当前章节预填 */
  const handleNew = (): void => {
    setSelectedKey('')
    setSelectedSource('custom')
    setSelectedId('')
    setName('')
    setDescription('')
    setTagsText('')
    setSourceGame('')
    setChapterKey(currentChapter)
    setDataText('{}')
    setDeleting(false)
    setError(null)
    setNotice(null)
    handleLoadCurrentFor(currentChapter)
  }

  const handleLoadCurrentFor = (target: string): void => {
    setDataText(stringifyData(doc[target as ChapterKey]))
    setName(t('templateEditor.defaultName', { section: templateChapterLabel(target) }))
  }

  /** 保存：选中自定义 → 更新；否则（含内置「另存为」）→ 新建 */
  const handleSave = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    if (!isValidCustomTemplateName(name)) {
      setError(TEMPLATE_NAME_REQUIRED_ERROR)
      return
    }
    const data = parseDataText()
    if (!data) return
    const tags = parseTemplateTagsInput(tagsText)
    setBusy(true)
    try {
      if (selectedId && selectedSource === 'custom') {
        const result = await window.mbApi.ceshu.templates.update({
          id: selectedId,
          name,
          description,
          tags,
          chapterKey,
          data,
          sourceGame
        })
        if (!result.updated) {
          setError(t('templateEditor.updateFailed'))
          return
        }
        await loadCustomTemplates()
        setNotice(t('templateEditor.updated', { name: name.trim() }))
      } else {
        const created = await window.mbApi.ceshu.templates.save({
          name,
          description,
          tags,
          chapterKey,
          data,
          sourceGame
        })
        setSelectedKey(`custom:${created.id}`)
        setSelectedSource('custom')
        setSelectedId(created.id)
        await loadCustomTemplates()
        setNotice(t('templateEditor.saved', { name: created.name }))
      }
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 删除当前自定义模板 */
  const handleDelete = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    if (!selectedId || selectedSource !== 'custom') {
      setError(t('templateEditor.needCustomSelected'))
      return
    }
    setBusy(true)
    try {
      const result = await window.mbApi.ceshu.templates.remove({ id: selectedId })
      if (!result.deleted) {
        setError(t('templateEditor.deleteFailed'))
        return
      }
      await loadCustomTemplates()
      setDeleting(false)
      handleNew()
      // 放在 handleNew 之后：新建会清空提示
      setNotice(t('templateEditor.deleted'))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 导出全部自定义模板 */
  const handleExport = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    try {
      const chosen = await window.mbApi.dialog.chooseTemplateJsonFile({
        mode: 'save',
        defaultName: 'custom_templates'
      })
      if (!chosen.path) return
      setBusy(true)
      const result = await window.mbApi.ceshu.templates.exportAll({ path: chosen.path })
      setNotice(t('templateEditor.exported', { n: result.count, path: result.filePath }))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 导入模板 */
  const handleImport = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    try {
      const chosen = await window.mbApi.dialog.chooseTemplateJsonFile({ mode: 'open' })
      if (!chosen.path) return
      setBusy(true)
      const result = await window.mbApi.ceshu.templates.importAll({ path: chosen.path, overwrite })
      await loadCustomTemplates()
      setNotice(t('templateEditor.imported', { n: result.imported, skipped: result.skipped }))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 解析数据 JSON；失败时设置错误并返回 null */
  const parseDataText = (): Record<string, unknown> | null => {
    const text = dataText.trim()
    if (!text) return {}
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      setError(t('templateEditor.jsonInvalid', { reason: toErrorMessage(err) }))
      return null
    }
    if (!isPlainObject(parsed)) {
      setError(t('templateEditor.needJsonObject'))
      return null
    }
    return parsed
  }

  return (
    <div className="changelog-panel" data-testid="template-editor-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">{t('templateEditor.title')}</span>
        <div className="editor-actions">
          <button type="button" className="btn" data-testid="editor-close" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>

      <div className="item-meta">
        {t('templateEditor.intro')}
      </div>

      {error && (
        <div className="form-error" data-testid="editor-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice-banner inline" data-testid="editor-notice">
          {notice}
        </div>
      )}

      <div className="template-filters">
        <span className="form-label">{t('templateEditor.chapterLabel')}</span>
        <select
          className="form-select"
          data-testid="editor-filter"
          value={filter}
          onChange={(event) => {
            setFilter(event.target.value)
            setDeleting(false)
          }}
        >
          <option value="">{t('templateEditor.allChapters')}</option>
          <option value="__custom__">{t('templateEditor.customOnly')}</option>
          <option value="__builtin__">{t('templateEditor.builtinOnly')}</option>
          {CHAPTER_KEYS.map((key) => (
            <option key={key} value={key}>
              {CHAPTER_LABELS[key]}
            </option>
          ))}
        </select>
        <span className="form-label">{t('templateEditor.searchLabel')}</span>
        <input
          className="form-input"
          data-testid="editor-search"
          placeholder={t('templateEditor.searchPlaceholder')}
          value={keyword}
          onChange={(event) => setKeyword(event.target.value)}
        />
        <span className="item-meta" data-testid="editor-count">
          {t('template.count', { n: entries.length })}
        </span>
      </div>

      <div className="template-editor-body">
        <div className="template-list" data-testid="editor-list">
          {entries.length === 0 ? (
            <div className="empty" data-testid="editor-empty">
              {t('template.empty')}
            </div>
          ) : (
            entries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                className={`template-item-main template-editor-item${entry.key === selectedKey ? ' active' : ''}`}
                data-testid="editor-item"
                onClick={() => handleSelect(entry)}
              >
                <span className="template-item-title">{entry.label}</span>
                {entry.template.tags.length > 0 && (
                  <span className="template-item-tags">{entry.template.tags.join(' · ')}</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="template-editor-form">
          <div className="template-save-row">
            <span className="form-label">{t('templateEditor.nameLabel')}</span>
            <input
              className="form-input"
              data-testid="editor-name"
              placeholder={t('templateEditor.namePlaceholder')}
              value={name}
              onChange={(event) => setName(event.target.value)}
            />
            <span className="form-label">{t('templateEditor.chapterLabel')}</span>
            <select
              className="form-select"
              data-testid="editor-chapter"
              value={chapterKey}
              onChange={(event) => setChapterKey(event.target.value)}
            >
              <option value="">{t('templateEditor.globalOption')}</option>
              {CHAPTER_KEYS.map((key) => (
                <option key={key} value={key}>
                  {CHAPTER_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div className="template-save-row">
            <span className="form-label">{t('templateEditor.descLabel')}</span>
            <input
              className="form-input"
              data-testid="editor-description"
              placeholder={t('templateEditor.descPlaceholder')}
              value={description}
              onChange={(event) => setDescription(event.target.value)}
            />
          </div>

          <div className="template-save-row">
            <span className="form-label">{t('templateEditor.tagsLabel')}</span>
            <input
              className="form-input"
              data-testid="editor-tags"
              placeholder={t('templateEditor.tagsPlaceholder')}
              value={tagsText}
              onChange={(event) => setTagsText(event.target.value)}
            />
            <span className="form-label">{t('templateEditor.sourceLabel')}</span>
            <input
              className="form-input"
              data-testid="editor-source"
              placeholder={t('templateEditor.sourcePlaceholder')}
              value={sourceGame}
              onChange={(event) => setSourceGame(event.target.value)}
            />
          </div>

          <span className="form-label">{t('templateEditor.dataLabel')}</span>
          <textarea
            className="form-textarea template-editor-data"
            data-testid="editor-data"
            value={dataText}
            onChange={(event) => setDataText(event.target.value)}
          />

          <div className="editor-actions">
            <button type="button" className="btn" data-testid="editor-load-current" onClick={handleLoadCurrent}>
              {t('templateEditor.loadCurrent')}
            </button>
            <button
              type="button"
              className="btn"
              data-testid="editor-apply-current"
              disabled={busy}
              onClick={() => void handleApplyCurrent()}
            >
              {t('templateEditor.applyCurrent')}
            </button>
          </div>

          <div className="editor-actions template-editor-actions">
            <button
              type="button"
              className="btn"
              data-testid="editor-new"
              disabled={busy}
              onClick={handleNew}
            >
              {t('templateEditor.newBtn')}
            </button>
            <button
              type="button"
              className="btn primary"
              data-testid="editor-save"
              disabled={busy}
              onClick={() => void handleSave()}
            >
              {selectedSource === 'builtin' ? t('templateEditor.saveAsCustom') : t('templateEditor.save')}
            </button>
            {deleting ? (
              <>
                <button
                  type="button"
                  className="btn"
                  data-testid="editor-delete-confirm"
                  disabled={busy}
                  onClick={() => void handleDelete()}
                >
                  {t('templateEditor.deleteConfirm')}
                </button>
                <button type="button" className="btn" data-testid="editor-delete-cancel" onClick={() => setDeleting(false)}>
                  {t('common.cancel')}
                </button>
              </>
            ) : (
              <button
                type="button"
                className="btn"
                data-testid="editor-delete"
                disabled={busy || !selectedId || selectedSource !== 'custom'}
                onClick={() => setDeleting(true)}
              >
                {t('common.delete')}
              </button>
            )}
            <span className="template-editor-sep" />
            <button type="button" className="btn" data-testid="editor-export" disabled={busy} onClick={() => void handleExport()}>
              {t('templateEditor.exportBtn')}
            </button>
            <button type="button" className="btn" data-testid="editor-import" disabled={busy} onClick={() => void handleImport()}>
              {t('templateEditor.importBtn')}
            </button>
            <label className="check-option">
              <input
                type="checkbox"
                data-testid="editor-overwrite"
                checked={overwrite}
                onChange={(event) => setOverwrite(event.target.checked)}
              />
              {t('templateEditor.overwrite')}
            </label>
          </div>

          {selectedEntry && (
            <div className="item-meta" data-testid="editor-selected">
              {t('templateEditor.selected', {
                label: selectedEntry.label,
                source: selectedEntry.source === 'custom' ? t('templatePicker.badgeCustom') : t('templatePicker.badgeBuiltin')
              })}
            </div>
          )}
          {gameName && <div className="item-meta">{t('templateEditor.sourceGame', { game: gameName })}</div>}
        </div>
      </div>
    </div>
  )
}

