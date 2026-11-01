import { useEffect, useMemo, useState, type ReactElement } from 'react'

import { buildCeshuBundle } from '@mobai/shared/ceshu/workflow'
import {
  BUNDLE_CONSUME_TASKS,
  BUNDLE_CONSUME_TASK_LABELS,
  BUNDLE_CONSUME_USAGE,
  buildBundleConsumePrompt,
  type BundleConsumeTask
} from '@mobai/shared/ceshu/prompts'
import { CHAPTER_LABELS, isChapterKey, type CeshuDocument, type ChapterKey } from '@mobai/shared/ceshu/reference'
import type { FieldReviewStatus } from '@mobai/shared/ceshu/fields'
import {
  parseCeshuIssues,
  parseCeshuPatch,
  previewPatchValue,
  type CeshuIssueParseResult,
  type CeshuPatchItem,
  type CeshuPatchParseResult
} from '@mobai/shared/ceshu/data'
import { migrationSplitTitle, pendingSplitCount, planCeshuMigration } from '@mobai/shared/ceshu/data'
import { REVIEW_QUEUE_KEY_HINT, resolveReviewQueueKey } from '../../reviewQueueKeys'
import { CeshuModulePicker } from '../ceshuDoc'
import { cursorAfterAccept } from './reviewQueueAdvance'
import { collectPendingReviewFields } from './reviewQueueData'
import { groupReviewQueue } from './reviewQueueGroups'
import { previewFieldValue, readFieldValue } from './reviewPreview'

/**
 * 编辑器内联浮层（B 方案 Slice 14：从 CeshuView 抽出为独立组件，经 `view` 能力挂载）。
 *
 * 只放**自包含**的浮层：数据从 `doc` 现算（纯函数），本地 UI state 留在组件内，
 * 需要的「应用/迁移」动作由上下文回调注入。这样 CeshuView 不再内联这几百行 JSX。
 */

/* ------------------------------- 迁移预览 ------------------------------- */

export function MigrationOverlay({ doc, busy, onRun, onClose }: {
  doc: CeshuDocument
  busy: boolean
  onRun: () => void
  onClose: () => void
}): ReactElement {
  const plan = planCeshuMigration(doc)
  const pending = pendingSplitCount(doc)
  return (
    <div className="review-overlay" data-testid="migration-overlay" onClick={onClose}>
      <div className="review-panel" data-testid="migration-panel" onClick={(event) => event.stopPropagation()}>
        <div className="review-panel-header">
          <span>迁移预览</span>
          <button
            type="button"
            className="btn primary slim"
            data-testid="migration-run"
            disabled={busy || pending === 0}
            onClick={onRun}
          >
            执行迁移（{pending}）
          </button>
          <button type="button" className="btn slim" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="item-meta">
          迁移**幂等且非破坏**：把大段文本拆成「要点 + 补充」，原文保留，确认无误后可手动清空旧字段。
        </div>
        {plan.splits.length === 0 && plan.overlaps.length === 0 ? (
          <div className="item-meta">没有需要迁移的字段。</div>
        ) : (
          <div className="review-list">
            {plan.splits.map((item) => (
              <div className="migration-item" key={`split:${item.chapter}:${item.fieldKey}`} data-testid="migration-split">
                <div className="migration-title">{migrationSplitTitle(item)}</div>
                <div className="item-meta">拆成：要点列表（{item.points.length} 条）+ 补充说明</div>
                <ul className="migration-points">
                  {item.points.map((point, index) => (
                    <li key={index}>{point}</li>
                  ))}
                </ul>
                {item.notes !== '' && (
                  <div className="item-meta">
                    补充：{item.notes.slice(0, 120)}
                    {item.notes.length > 120 ? '…' : ''}
                  </div>
                )}
              </div>
            ))}
            {plan.overlaps.map((item) => (
              <div className="migration-item" key={`overlap:${item.chapter}`} data-testid="migration-overlap">
                <div className="migration-title">
                  {CHAPTER_LABELS[item.chapter]} · 重叠字段
                  {item.duplicated && (
                    <span className="field-badge duplicate" data-testid="migration-overlap-duplicated">
                      已重复 {Math.round(item.similarity * 100)}%
                    </span>
                  )}
                </div>
                <div className="item-meta">{item.fieldLabels.join(' / ')}</div>
                <div className="item-meta">{item.note}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/* ----------------------------- AI 消费提示词 ----------------------------- */

export function ConsumePromptOverlay({ doc, onClose }: {
  doc: CeshuDocument
  onClose: () => void
}): ReactElement {
  const [consumeTask, setConsumeTask] = useState<BundleConsumeTask>('draft')
  const prompt = buildBundleConsumePrompt(buildCeshuBundle(doc), consumeTask)
  return (
    <div className="review-overlay" data-testid="consume-overlay" onClick={onClose}>
      <div className="review-panel" data-testid="consume-panel" onClick={(event) => event.stopPropagation()}>
        <div className="review-panel-header">
          <span>AI 消费提示词</span>
          <button type="button" className="btn slim" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="item-meta">{BUNDLE_CONSUME_USAGE}</div>
        <div className="field-action-strip-actions">
          {BUNDLE_CONSUME_TASKS.map((task) => (
            <button
              key={task}
              type="button"
              className={`btn slim${consumeTask === task ? ' accent-outline' : ''}`}
              data-testid={`consume-task-${task}`}
              onClick={() => setConsumeTask(task)}
            >
              {BUNDLE_CONSUME_TASK_LABELS[task]}
            </button>
          ))}
        </div>
        <textarea
          className="form-textarea"
          data-testid="consume-prompt"
          readOnly
          rows={16}
          value={prompt}
          onFocus={(event) => event.currentTarget.select()}
        />
      </div>
    </div>
  )
}

/* ------------------------------ 全局审阅队列 ------------------------------ */

export function ReviewQueueOverlay({ doc, onFieldStatus, onApproveAllPending, onJumpField, onClose }: {
  doc: CeshuDocument
  onFieldStatus: (chapter: ChapterKey, updates: Record<string, FieldReviewStatus>) => void
  onApproveAllPending: () => void
  onJumpField: (chapter: ChapterKey, field: string) => void
  onClose: () => void
}): ReactElement {
  // doc 在浮层打开期间不变（模态），用 useMemo 稳定引用，避免键盘 effect 每次渲染重挂
  const pending = useMemo(() => collectPendingReviewFields(doc), [doc])
  const reviewGroups = useMemo(() => groupReviewQueue(pending), [pending])
  const [reviewCursor, setReviewCursor] = useState(0)
  const [collapsedChapters, setCollapsedChapters] = useState<ChapterKey[]>([])
  /** 渲染期夹取：列表变短（接受后）不越界 */
  const reviewCursorSafe = Math.min(reviewCursor, Math.max(0, pending.length - 1))
  const toggleGroup = (chapter: ChapterKey): void => {
    setCollapsedChapters((chapters) =>
      chapters.includes(chapter) ? chapters.filter((key) => key !== chapter) : [...chapters, chapter]
    )
  }

  // 键盘：j/k 上下、a 接受、v 查看跳转、Esc 关闭（与 CeshuView 原实现一致）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target
      const editable =
        target instanceof HTMLElement &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable)
      const action = resolveReviewQueueKey({
        key: event.key,
        ctrlKey: event.ctrlKey,
        metaKey: event.metaKey,
        altKey: event.altKey,
        editable,
        queueLength: pending.length
      })
      if (action === null) return
      event.preventDefault()
      if (action === 'close') {
        onClose()
        return
      }
      if (pending.length === 0) return
      if (action === 'next') {
        setReviewCursor((cursor) => Math.min(cursor + 1, pending.length - 1))
        return
      }
      if (action === 'prev') {
        setReviewCursor((cursor) => Math.max(cursor - 1, 0))
        return
      }
      const cursorIndex = Math.min(reviewCursor, pending.length - 1)
      const current = pending[cursorIndex]
      if (current === undefined) return
      if (action === 'accept') {
        setReviewCursor(cursorAfterAccept(cursorIndex, pending.length - 1))
        onFieldStatus(current.chapter, { [current.fieldKey]: 'approved' })
        return
      }
      onJumpField(current.chapter, current.fieldKey)
      onClose()
    }
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [pending, reviewCursor, onFieldStatus, onJumpField, onClose])

  return (
    <div className="review-overlay" data-testid="review-overlay" onClick={onClose}>
      <div className="review-panel" data-testid="review-panel" onClick={(event) => event.stopPropagation()}>
        <div className="review-panel-header">
          <span>待审字段：{pending.length} 个</span>
          <button
            type="button"
            className="btn primary slim"
            data-testid="review-accept-all"
            disabled={pending.length === 0}
            onClick={onApproveAllPending}
          >
            全部接受
          </button>
          <button type="button" className="btn slim" onClick={onClose}>
            关闭
          </button>
        </div>
        {pending.length === 0 ? (
          <div className="item-meta">没有待审字段。AI 生成后会出现在这里。</div>
        ) : (
          <div className="review-list">
            {reviewGroups.map((group) => {
              const collapsed = collapsedChapters.includes(group.chapter)
              return (
                <div
                  className="review-group"
                  key={`group:${group.chapter}:${group.startIndex}`}
                  data-testid="review-group"
                  data-chapter={group.chapter}
                >
                  <button
                    type="button"
                    className="review-group-head"
                    data-testid="review-group-head"
                    onClick={() => toggleGroup(group.chapter)}
                  >
                    {CHAPTER_LABELS[group.chapter]}（{group.items.length}）
                    <span className="review-group-caret">{collapsed ? '▸' : '▾'}</span>
                  </button>
                  {!collapsed &&
                    group.items.map(({ item, flatIndex }) => (
                      <div
                        className={`review-row${flatIndex === reviewCursorSafe ? ' current' : ''}`}
                        key={`${item.chapter}:${item.fieldKey}`}
                        data-testid="review-row"
                        data-current={flatIndex === reviewCursorSafe ? 'true' : 'false'}
                      >
                        <span className="review-chapter">{CHAPTER_LABELS[item.chapter]}</span>
                        <span className="review-field">{item.fieldLabel}</span>
                        <span className="review-preview" data-testid="review-preview">
                          {previewFieldValue(readFieldValue(doc[item.chapter], item.fieldKey))}
                        </span>
                        <button
                          type="button"
                          className="btn slim"
                          data-testid="review-goto"
                          onClick={() => {
                            onJumpField(item.chapter, item.fieldKey)
                            onClose()
                          }}
                        >
                          查看
                        </button>
                        <button
                          type="button"
                          className="btn slim primary"
                          data-testid="review-accept"
                          onClick={() => {
                            setReviewCursor(cursorAfterAccept(flatIndex, pending.length - 1))
                            onFieldStatus(item.chapter, { [item.fieldKey]: 'approved' })
                          }}
                        >
                          接受
                        </button>
                      </div>
                    ))}
                </div>
              )
            })}
          </div>
        )}
        {pending.length > 0 && (
          <div className="review-key-hint item-meta" data-testid="review-key-hint">
            {REVIEW_QUEUE_KEY_HINT}
          </div>
        )}
      </div>
    </div>
  )
}

/* ------------------------------- 导入 AI 结果 ------------------------------ */

export function ImportOverlay({ doc, busy, onApplyImport, onJumpChapter, onClose }: {
  doc: CeshuDocument
  busy: boolean
  /** 应用补丁（编辑器负责写盘 + 标记 AI 草稿）；返回是否成功 */
  onApplyImport: (changed: CeshuPatchItem[]) => Promise<boolean>
  onJumpChapter: (chapter: ChapterKey) => void
  onClose: () => void
}): ReactElement {
  const [importRaw, setImportRaw] = useState('')
  const [importResult, setImportResult] = useState<CeshuPatchParseResult | null>(null)
  const [issueResult, setIssueResult] = useState<CeshuIssueParseResult | null>(null)

  const changed = importResult === null ? [] : importResult.items.filter((item) => item.changed)

  const handleParseImport = (): void => {
    const parsedIssues = parseCeshuIssues(importRaw)
    if (parsedIssues.issues.length > 0) {
      setIssueResult(parsedIssues)
      setImportResult(null)
      return
    }
    setIssueResult(null)
    setImportResult(parseCeshuPatch(importRaw, doc))
  }

  const handleApply = async (): Promise<void> => {
    if (changed.length === 0) return
    const ok = await onApplyImport(changed)
    if (ok) onClose()
  }

  return (
    <div className="review-overlay" data-testid="import-overlay" onClick={onClose}>
      <div className="review-panel" data-testid="import-panel" onClick={(event) => event.stopPropagation()}>
        <div className="review-panel-header">
          <span>导入 AI 结果</span>
          <button
            type="button"
            className="btn primary slim"
            data-testid="import-apply"
            disabled={busy || changed.length === 0}
            onClick={() => void handleApply()}
          >
            应用（{changed.length}）
          </button>
          <button type="button" className="btn slim" onClick={onClose}>
            关闭
          </button>
        </div>
        <div className="item-meta">
          粘贴外部 AI 返回的字段增量（形如 {'{"章节": {"字段": 值}}'}，允许带 markdown 代码块）。
          空值不会覆盖已有内容；应用后这些字段标为「AI 草稿」待审。
        </div>
        <textarea
          className="form-textarea"
          data-testid="import-raw"
          rows={8}
          placeholder='{"meta": {"positioning": "一句话定位"}}'
          value={importRaw}
          onChange={(event) => {
            setImportRaw(event.target.value)
            setImportResult(null)
            setIssueResult(null)
          }}
        />
        <div className="field-action-strip-actions">
          <button type="button" className="btn slim" data-testid="import-parse" disabled={busy} onClick={handleParseImport}>
            解析预览
          </button>
        </div>
        {importResult !== null && (
          <>
            {importResult.errors.length > 0 && (
              <div className="form-error" data-testid="import-errors">
                {importResult.errors.map((message, index) => (
                  <div key={index}>{message}</div>
                ))}
              </div>
            )}
            {importResult.items.length > 0 && (
              <div className="review-list">
                {importResult.items.map((item) => (
                  <div
                    className="review-row"
                    key={`${item.chapter}:${item.fieldKey}`}
                    data-testid="import-item"
                    data-changed={item.changed ? 'true' : 'false'}
                  >
                    <span className="review-chapter">{CHAPTER_LABELS[item.chapter]}</span>
                    <span className="review-field">{item.fieldLabel}</span>
                    <span className="item-meta">
                      {item.changed
                        ? `${previewPatchValue(item.previous, 30)} → ${previewPatchValue(item.value, 30)}`
                        : '（无变化）'}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
        {issueResult !== null && (
          <>
            <div className="item-meta">
              这是审阅结果：共 {issueResult.issues.length} 条问题，逐条修改即可（本面板不自动改文档）
            </div>
            <div className="review-list" data-testid="import-issues">
              {issueResult.issues.map((issue, index) => {
                const chapter = isChapterKey(issue.chapter) ? issue.chapter : null
                const rowBody = (
                  <>
                    <span className="review-chapter">
                      {chapter === null ? issue.chapter : CHAPTER_LABELS[chapter]}
                    </span>
                    <span className="review-field">{issue.field}</span>
                    <span className="item-meta">
                      [{issue.severity}] {issue.message} —— 建议：{issue.suggestion}
                    </span>
                  </>
                )
                if (chapter === null) {
                  return (
                    <div className="review-row" key={index} data-testid="import-issue" data-severity={issue.severity}>
                      {rowBody}
                    </div>
                  )
                }
                return (
                  <button
                    type="button"
                    className="review-row review-row-link"
                    key={index}
                    data-testid="import-issue"
                    data-severity={issue.severity}
                    data-chapter={chapter}
                    onClick={() => {
                      // 一键定位：切到该章并关掉浮层，用户落地即可改这个字段
                      onJumpChapter(chapter)
                      onClose()
                    }}
                  >
                    {rowBody}
                  </button>
                )
              })}
            </div>
          </>
        )}
      </div>
    </div>
  )
}

/* ------------------------------ 派生新版本 ------------------------------ */

export function DeriveOverlay({ busy, onDerive, onClose }: {
  busy: boolean
  onDerive: (note: string) => void
  onClose: () => void
}): ReactElement {
  const [note, setNote] = useState('')
  return (
    <div className="derive-panel">
      <span className="form-label">新版本说明（可留空）</span>
      <input
        className="form-input"
        data-testid="derive-note"
        value={note}
        placeholder="本次迭代改了什么"
        onChange={(event) => setNote(event.target.value)}
      />
      <button type="button" className="btn primary" data-testid="derive-confirm" disabled={busy} onClick={() => onDerive(note)}>
        确认派生
      </button>
      <button type="button" className="btn" onClick={onClose}>
        取消
      </button>
    </div>
  )
}

/* ---------------------------- 系统模块勾选气泡 ---------------------------- */

export function ModulePickerOverlay({ doc, onToggle, onClose }: {
  doc: CeshuDocument
  onToggle: (module: ChapterKey, enabled: boolean) => void
  onClose: () => void
}): ReactElement {
  return <CeshuModulePicker doc={doc} onToggle={onToggle} onClose={onClose} />
}
