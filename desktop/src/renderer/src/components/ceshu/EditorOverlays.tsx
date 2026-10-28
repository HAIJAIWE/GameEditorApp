import { useState, type ReactElement } from 'react'

import { buildCeshuBundle } from '../../../../shared/ceshuBundle'
import {
  BUNDLE_CONSUME_TASKS,
  BUNDLE_CONSUME_TASK_LABELS,
  BUNDLE_CONSUME_USAGE,
  buildBundleConsumePrompt,
  type BundleConsumeTask
} from '../../../../shared/ceshuBundlePrompt'
import { CHAPTER_LABELS, type CeshuDocument } from '../../../../shared/ceshuConstants'
import { migrationSplitTitle, pendingSplitCount, planCeshuMigration } from '../../../../shared/ceshuMigrationPlan'

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
