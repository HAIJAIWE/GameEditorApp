import { useState } from 'react'

import { CHAPTER_KEYS, CHAPTER_LABELS, type ChapterKey } from '../../../shared/ceshuConstants'
import {
  TEMPLATE_APPLY_MODES,
  TEMPLATE_APPLY_MODE_LABELS,
  TEMPLATE_NO_DATA_HINT,
  buildTemplatePreview,
  filterChapterTemplates,
  templateChapterLabel,
  type ChapterTemplate,
  type ChapterTemplateHit,
  type TemplateApplyMode
} from '../../../shared/ceshuTemplates'

/**
 * 章节模板库面板（对应 Python TemplatePickerDialog）：
 * - 章节下拉 + 关键词搜索 + 模板列表（`[章节] 名称` + 标签行）
 * - 右侧预览：标题/描述/标签 + 模板内容层级树（Python 为 HTML 渲染，此处用等价行树）
 * - 应用模式三选一（仅填空字段 / 覆盖 / 追加）+ 二次确认后回填章节草稿
 * 说明：应用时由上层（ChapterForm）按草稿数据合并，面板只负责选择与确认。
 */

interface TemplatePickerPanelProps {
  chapter: ChapterKey
  onApply: (template: ChapterTemplate, mode: TemplateApplyMode) => void
  onClose: () => void
}

export default function TemplatePickerPanel({ chapter, onApply, onClose }: TemplatePickerPanelProps) {
  const [chapterFilter, setChapterFilter] = useState<string>(chapter)
  const [keyword, setKeyword] = useState('')
  const [selectedIndex, setSelectedIndex] = useState(-1)
  const [mode, setMode] = useState<TemplateApplyMode>('fillEmpty')
  const [confirming, setConfirming] = useState(false)

  const hits = filterChapterTemplates(chapterFilter, keyword)
  const selected: ChapterTemplateHit | null = hits[selectedIndex] ?? null
  const selectedTemplate = selected?.template ?? null
  const previewRows = selectedTemplate ? buildTemplatePreview(selectedTemplate.data) : []
  const hasData = Boolean(selectedTemplate && Object.keys(selectedTemplate.data).length > 0)
  const canApply = Boolean(selectedTemplate) && hasData && !confirming

  const resetSelection = (): void => {
    setSelectedIndex(-1)
    setConfirming(false)
  }

  return (
    <div className="changelog-panel" data-testid="template-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">📚 章节模板库</span>
        <div className="editor-actions">
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
            应用模板
          </button>
          <button type="button" className="btn" data-testid="template-close" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>

      <div className="item-meta">每章预置 3-5 个高质量范例，支持搜索与一键应用。应用前可预览内容。</div>

      {confirming && selectedTemplate && (
        <div className="template-confirm" data-testid="template-confirm">
          <span data-testid="template-confirm-text">
            将应用模板「{selectedTemplate.name}」到「{templateChapterLabel(selected?.chapterKey ?? chapter)}
            」，应用模式：{TEMPLATE_APPLY_MODE_LABELS[mode]}。是否继续？
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
            确认应用
          </button>
          <button type="button" className="btn" data-testid="template-apply-cancel" onClick={() => setConfirming(false)}>
            取消
          </button>
        </div>
      )}

      <div className="template-filters">
        <span className="form-label">章节</span>
        <select
          className="form-select"
          data-testid="template-chapter"
          value={chapterFilter}
          onChange={(event) => {
            setChapterFilter(event.target.value)
            resetSelection()
          }}
        >
          <option value="">全部章节</option>
          {CHAPTER_KEYS.map((key) => (
            <option key={key} value={key}>
              {CHAPTER_LABELS[key]}
            </option>
          ))}
        </select>
        <span className="form-label">搜索</span>
        <input
          className="form-input"
          data-testid="template-search"
          placeholder="按名称/描述/标签搜索..."
          value={keyword}
          onChange={(event) => {
            setKeyword(event.target.value)
            resetSelection()
          }}
        />
        <span className="item-meta" data-testid="template-count">
          {hits.length} 个模板
        </span>
      </div>

      <div className="template-body">
        <div className="template-list" data-testid="template-list">
          {hits.length === 0 ? (
            <div className="empty" data-testid="template-empty">
              (无匹配模板)
            </div>
          ) : (
            hits.map((hit, index) => (
              <button
                key={`${hit.chapterKey}:${hit.template.name}:${index}`}
                type="button"
                className={`template-item${index === selectedIndex ? ' active' : ''}`}
                data-testid="template-item"
                onClick={() => {
                  setSelectedIndex(index)
                  setConfirming(false)
                }}
              >
                <span className="template-item-title">
                  [{templateChapterLabel(hit.chapterKey)}] {hit.template.name}
                </span>
                {hit.template.tags.length > 0 && (
                  <span className="template-item-tags">{hit.template.tags.join(' · ')}</span>
                )}
              </button>
            ))
          )}
        </div>

        <div className="template-preview" data-testid="template-preview">
          {!selectedTemplate ? (
            <div className="empty">选择左侧模板查看预览…</div>
          ) : (
            <>
              <div className="template-preview-title" data-testid="template-preview-title">
                [{templateChapterLabel(selected?.chapterKey ?? chapter)}] {selectedTemplate.name}
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
              <div className="form-label">模板内容</div>
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
        <span className="form-label">应用模式</span>
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