import { useEffect, useState } from 'react'

import { useT } from '@mobai/client-ui'

import { CHAPTER_KEYS, CHAPTER_LABELS, type ChapterKey } from '@mobai/shared/ceshu/reference'
import {
  isValidCustomTemplateName,
  parseTemplateTagsInput,
  searchCustomTemplates,
  filterCustomTemplates,
  customTemplateToChapterTemplate,
  type CeshuCustomTemplate
} from '@mobai/shared/ceshu/reference'
import {
  TEMPLATE_APPLY_MODES,
  TEMPLATE_APPLY_MODE_LABELS,
  TEMPLATE_NO_DATA_HINT,
  buildTemplatePreview,
  filterChapterTemplates,
  templateChapterLabel,
  type ChapterTemplate,
  type TemplateApplyMode
} from '@mobai/shared/ceshu/reference'
import { toErrorMessage } from '@mobai/shared/util/system'

/**
 * 章节模板库面板：
 * - 章节下拉 + 关键词搜索 + 来源筛选（全部/内置/自定义）+ 模板列表（`[章节] 名称` + 标签行）
 * - 右侧预览：标题/描述/标签 + 模板内容层级树
 * - 应用模式三选一（仅填空字段 / 覆盖 / 追加）+ 二次确认后回填章节草稿
 * - 「另存为模板」把当前章节草稿存为自定义模板；自定义模板可删除
 * 说明：应用/保存都由上层（ChapterForm）提供数据与合并，面板只负责选择与确认。
 */

interface TemplatePickerPanelProps {
  chapter: ChapterKey
  /** 来源游戏名（写入自定义模板的 source_game） */
  gameName: string
  /** 取当前章节草稿数据（另存为模板用） */
  onCaptureChapter: () => Record<string, unknown>
  onApply: (template: ChapterTemplate, mode: TemplateApplyMode) => void
  onClose: () => void
}

type TemplateSource = 'builtin' | 'custom'
type SourceFilter = 'all' | TemplateSource

interface TemplateEntry {
  key: string
  source: TemplateSource
  /** 展示用章节（自定义模板的全局归属显示为 global） */
  chapterKey: string
  template: ChapterTemplate
  customId: string
}

export default function TemplatePickerPanel({
  chapter,
  gameName,
  onCaptureChapter,
  onApply,
  onClose
}: TemplatePickerPanelProps) {
  const t = useT()
  const [chapterFilter, setChapterFilter] = useState<string>(chapter)
  const [keyword, setKeyword] = useState('')
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>('all')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [mode, setMode] = useState<TemplateApplyMode>('fillEmpty')
  const [confirming, setConfirming] = useState(false)
  const [customTemplates, setCustomTemplates] = useState<CeshuCustomTemplate[]>([])
  const [deletingId, setDeletingId] = useState('')
  const [saveOpen, setSaveOpen] = useState(false)
  const [saveName, setSaveName] = useState('')
  const [saveDescription, setSaveDescription] = useState('')
  const [saveTags, setSaveTags] = useState('')
  const [saveScope, setSaveScope] = useState<'chapter' | 'global'>('chapter')
  const [saveBusy, setSaveBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

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

  // 内置：章节 + 关键词筛选；自定义：章节 + 关键词筛选
  const builtinHits = filterChapterTemplates(chapterFilter, keyword)
  const customHits = searchCustomTemplates(
    filterCustomTemplates(customTemplates, chapterFilter || undefined),
    keyword.trim()
  )
  const entries: TemplateEntry[] = [
    ...(sourceFilter === 'custom'
      ? []
      : builtinHits.map((hit) => ({
          key: `builtin:${hit.chapterKey}:${hit.template.name}`,
          source: 'builtin' as const,
          chapterKey: hit.chapterKey,
          template: hit.template,
          customId: ''
        }))),
    ...(sourceFilter === 'builtin'
      ? []
      : customHits.map((item) => ({
          key: `custom:${item.id}`,
          source: 'custom' as const,
          chapterKey: item.chapter_key || 'global',
          template: customTemplateToChapterTemplate(item),
          customId: item.id
        })))
  ]

  const selected: TemplateEntry | null = entries[selectedIndex] ?? null
  const selectedTemplate = selected?.template ?? null
  const previewRows = selectedTemplate ? buildTemplatePreview(selectedTemplate.data) : []
  const hasData = Boolean(selectedTemplate && Object.keys(selectedTemplate.data).length > 0)
  const canApply = Boolean(selectedTemplate) && hasData && !confirming
  const canSave = isValidCustomTemplateName(saveName) && !saveBusy

  const resetSelection = (): void => {
    setSelectedIndex(-1)
    setConfirming(false)
    setDeletingId('')
  }

  /** 另存为模板：取当前章节草稿 → 新建自定义模板（章节归属或全局） */
  const handleSaveTemplate = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    setSaveBusy(true)
    try {
      const created = await window.mbApi.ceshu.templates.save({
        name: saveName,
        description: saveDescription,
        tags: parseTemplateTagsInput(saveTags),
        chapterKey: saveScope === 'chapter' ? chapter : '',
        data: onCaptureChapter(),
        sourceGame: gameName
      })
      setCustomTemplates((prev) => [...prev, created])
      setSaveOpen(false)
      setSaveName('')
      setSaveDescription('')
      setSaveTags('')
      setNotice(t('templatePicker.saved', { name: created.name }))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setSaveBusy(false)
    }
  }

  /** 删除自定义模板（二次点击确认） */
  const handleDeleteTemplate = async (templateId: string): Promise<void> => {
    setError(null)
    setNotice(null)
    try {
      const result = await window.mbApi.ceshu.templates.remove({ id: templateId })
      if (result.deleted) {
        setCustomTemplates((prev) => prev.filter((item) => item.id !== templateId))
        setNotice(t('templatePicker.deleted'))
      } else {
        setError(t('templatePicker.deleteMissing'))
      }
      setDeletingId('')
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  return (
    <div className="changelog-panel" data-testid="template-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">{t('templatePicker.title')}</span>
        <div className="editor-actions">
          <button
            type="button"
            className="btn"
            data-testid="template-save-open"
            onClick={() => {
              setSaveOpen((open) => !open)
              setNotice(null)
            }}
          >
            {saveOpen ? t('templatePicker.cancelSave') : t('templatePicker.saveAs')}
          </button>
          <button
            type="button"
            className="btn primary"
            data-testid="template-apply"
            disabled={!canApply}
            onClick={() => {
              if (!selectedTemplate || !hasData) return
              setConfirming(true)
            }}
          >
            {t('templatePicker.apply')}
          </button>
          <button type="button" className="btn" data-testid="template-close" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>

      <div className="item-meta">{t('templatePicker.intro')}</div>

      {error && (
        <div className="form-error" data-testid="template-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice-banner inline" data-testid="template-notice">
          {notice}
        </div>
      )}

      {saveOpen && (
        <div className="template-save-form" data-testid="template-save-form">
          <div className="template-save-row">
            <span className="form-label">{t('templatePicker.nameLabel')}</span>
            <input
              className="form-input"
              data-testid="template-save-name"
              placeholder={t('templatePicker.namePlaceholder')}
              value={saveName}
              onChange={(event) => setSaveName(event.target.value)}
            />
            <span className="form-label">{t('templatePicker.scopeLabel')}</span>
            <select
              className="form-select"
              data-testid="template-save-scope"
              value={saveScope}
              onChange={(event) => setSaveScope(event.target.value as 'chapter' | 'global')}
            >
              <option value="chapter">{CHAPTER_LABELS[chapter]}</option>
              <option value="global">{t('templatePicker.scopeGlobal')}</option>
            </select>
          </div>
          <div className="template-save-row">
            <span className="form-label">{t('templatePicker.descLabel')}</span>
            <input
              className="form-input"
              data-testid="template-save-description"
              placeholder={t('templatePicker.descPlaceholder')}
              value={saveDescription}
              onChange={(event) => setSaveDescription(event.target.value)}
            />
            <span className="form-label">{t('templatePicker.tagsLabel')}</span>
            <input
              className="form-input"
              data-testid="template-save-tags"
              placeholder={t('templatePicker.tagsPlaceholder')}
              value={saveTags}
              onChange={(event) => setSaveTags(event.target.value)}
            />
          </div>
          <div className="template-save-row">
            <span className="item-meta" data-testid="template-save-summary">
              {t('templatePicker.saveSummary', {
                source: gameName ? t('templatePicker.saveSummarySource', { game: gameName }) : ''
              })}
            </span>
            <button
              type="button"
              className="btn primary"
              data-testid="template-save-confirm"
              disabled={!canSave}
              onClick={() => void handleSaveTemplate()}
            >
              {saveBusy ? t('templatePicker.saving') : t('templatePicker.saveConfirm')}
            </button>
            <button type="button" className="btn" data-testid="template-save-cancel" onClick={() => setSaveOpen(false)}>
              {t('common.cancel')}
            </button>
          </div>
        </div>
      )}

      {confirming && selectedTemplate && (
        <div className="template-confirm" data-testid="template-confirm">
          <span data-testid="template-confirm-text">
            {t('templatePicker.applyConfirm', {
              name: selectedTemplate.name,
              chapter: templateChapterLabel(selected?.chapterKey ?? chapter),
              mode: TEMPLATE_APPLY_MODE_LABELS[mode]
            })}
          </span>
          <button
            type="button"
            className="btn primary"
            data-testid="template-apply-confirm"
            onClick={() => {
              setConfirming(false)
              onApply(selectedTemplate, mode)
            }}
          >
            {t('templatePicker.confirmApply')}
          </button>
          <button type="button" className="btn" data-testid="template-apply-cancel" onClick={() => setConfirming(false)}>
            {t('common.cancel')}
          </button>
        </div>
      )}

      <div className="template-filters">
        <span className="form-label">{t('templatePicker.chapterLabel')}</span>
        <select
          className="form-select"
          data-testid="template-chapter"
          value={chapterFilter}
          onChange={(event) => {
            setChapterFilter(event.target.value)
            resetSelection()
          }}
        >
          <option value="">{t('templatePicker.allChapters')}</option>
          {CHAPTER_KEYS.map((key) => (
            <option key={key} value={key}>
              {CHAPTER_LABELS[key]}
            </option>
          ))}
        </select>
        <span className="form-label">{t('templatePicker.sourceLabel')}</span>
        <select
          className="form-select template-source"
          data-testid="template-source"
          value={sourceFilter}
          onChange={(event) => {
            setSourceFilter(event.target.value as SourceFilter)
            resetSelection()
          }}
        >
          <option value="all">{t('templatePicker.sourceAll')}</option>
          <option value="builtin">{t('templatePicker.sourceBuiltin')}</option>
          <option value="custom">{t('templatePicker.sourceCustom')}</option>
        </select>
        <span className="form-label">{t('templatePicker.searchLabel')}</span>
        <input
          className="form-input"
          data-testid="template-search"
          placeholder={t('templatePicker.searchPlaceholder')}
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value)
            resetSelection()
          }}
        />
        <span className="item-meta" data-testid="template-count">
          {t('template.count', { n: entries.length })}
        </span>
      </div>

      <div className="template-body">
        <div className="template-list" data-testid="template-list">
          {entries.length === 0 ? (
            <div className="empty" data-testid="template-empty">
              {t('template.empty')}
            </div>
          ) : (
            entries.map((entry, index) => (
              <div
                key={entry.key}
                className={`template-item${index === selectedIndex ? ' active' : ''}`}
                data-testid="template-row"
              >
                <button
                  type="button"
                  className="template-item-main"
                  data-testid="template-item"
                  onClick={() => {
                    setSelectedIndex(index)
                    setConfirming(false)
                    setDeletingId('')
                  }}
                >
                  <span className="template-item-title">
                    <span className={`template-badge ${entry.source}`} data-testid="template-badge">
                      {entry.source === 'custom' ? t('templatePicker.badgeCustom') : t('templatePicker.badgeBuiltin')}
                    </span>
                    [{entry.source === 'custom' && entry.chapterKey === 'global'
                      ? t('templatePicker.global')
                      : templateChapterLabel(entry.chapterKey)}]{' '}
                    {entry.template.name}
                  </span>
                  {entry.template.tags.length > 0 && (
                    <span className="template-item-tags">{entry.template.tags.join(' · ')}</span>
                  )}
                </button>
                {entry.source === 'custom' &&
                  (deletingId === entry.customId ? (
                    <span className="template-item-actions">
                      <button
                        type="button"
                        className="btn slim"
                        data-testid="template-delete-confirm"
                        onClick={() => void handleDeleteTemplate(entry.customId)}
                      >
                        {t('templatePicker.deleteConfirm')}
                      </button>
                      <button
                        type="button"
                        className="btn slim"
                        data-testid="template-delete-cancel"
                        onClick={() => setDeletingId('')}
                      >
                        {t('common.cancel')}
                      </button>
                    </span>
                  ) : (
                    <span className="template-item-actions">
                      <button
                        type="button"
                        className="btn slim"
                        data-testid="template-delete"
                        onClick={() => setDeletingId(entry.customId)}
                      >
                        {t('common.delete')}
                      </button>
                    </span>
                  ))}
              </div>
            ))
          )}
        </div>

        <div className="template-preview" data-testid="template-preview">
          {!selectedTemplate ? (
            <div className="empty">{t('templatePicker.previewEmpty')}</div>
          ) : (
            <>
              <div className="template-preview-title" data-testid="template-preview-title">
                [{selected?.chapterKey === 'global'
                  ? t('templatePicker.global')
                  : templateChapterLabel(selected?.chapterKey ?? chapter)}]{' '}
                {selectedTemplate.name}
              </div>
              {selectedTemplate.description && <div className="item-meta">{selectedTemplate.description}</div>}
              {selectedTemplate.tags.length > 0 && (
                <div className="template-tags">
                  {selectedTemplate.tags.map((tag) => (
                    <span className="template-tag" key={tag}>
                      #{tag}
                    </span>
                  ))}
                </div>
              )}
              <div className="form-label">{t('templatePicker.contentLabel')}</div>
              {previewRows.length === 0 ? (
                <div className="item-meta" data-testid="template-no-data">
                  {selectedTemplate.note ?? TEMPLATE_NO_DATA_HINT}
                </div>
              ) : (
                <div className="template-preview-rows" data-testid="template-preview-rows">
                  {previewRows.map((row) => (
                    <div
                      key={`${row.path}:${row.kind}`}
                      className={`template-preview-row ${row.kind}`}
                      style={{ paddingLeft: row.depth * 16 }}
                    >
                      {row.text}
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>

      <div className="template-mode-row">
        <span className="form-label">{t('templatePicker.modeLabel')}</span>
        <select
          className="form-select"
          data-testid="template-mode"
          value={mode}
          onChange={(event) => setMode(event.target.value as TemplateApplyMode)}
        >
          {TEMPLATE_APPLY_MODES.map((item) => (
            <option key={item} value={item}>
              {TEMPLATE_APPLY_MODE_LABELS[item]}
            </option>
          ))}
        </select>
      </div>
    </div>
  )
}