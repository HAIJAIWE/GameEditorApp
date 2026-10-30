import { useState } from 'react'

import type { CeshuDocument } from '../../../shared/ceshu/ceshuConstants'
import {
  CESHU_ROLE_LABELS,
  CESHU_ROLE_ORDER,
  CESHU_TASK_PRIORITIES,
  collectRoleTasks,
  type CeshuRole
} from '../../../shared/ceshu/ceshuTasks'
import { countTaskPlan } from '../../../shared/ceshu/ceshuTaskPrompt'
import { CHAPTER_LABELS } from '../../../shared/ceshu/ceshuConstants'
import { toErrorMessage } from '../../../shared/util/errors'

/**
 * 岗位任务（三栏布局「岗位任务」标签）。
 *
 * 两种口径并存，且**优先 AI 生成的**：
 * - 有 `doc.task_plan[岗位]` → 那是 AI 从整份文档拆出来的**可执行动作**（实现/搭建/绘制/配置）；
 * - 没有 → 回落到「按章字段清单」（`collectRoleTasks`），并明确标注它不是任务。
 *
 * 旧版只有后者，等于把「文档里写了什么」当成了「这个岗位要干什么」。
 */
export default function CeshuTasksPanel({
  doc,
  onDocUpdated
}: {
  doc: CeshuDocument
  /** 生成完成后把最新文档交回上层（保存后的 doc） */
  onDocUpdated?: (doc: CeshuDocument) => void
}) {
  const [role, setRole] = useState<CeshuRole>('programmer')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const planned = doc.task_plan?.[role]
  const sections = collectRoleTasks(doc, role)
  const total = doc.task_plan === undefined ? 0 : countTaskPlan(doc.task_plan)

  const handleGenerate = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    setBusy(true)
    try {
      const result = await window.mbApi.ceshu.aiGenerateTasks({ id: doc.ceshu_id })
      onDocUpdated?.(result.doc)
      const count = countTaskPlan(result.plan)
      setNotice(count === 0 ? 'AI 没拆出任务：先补一些设计内容再试' : `已生成 ${count} 条岗位任务`)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tasks-panel" data-testid="tasks-panel">
      <div className="tasks-toolbar">
        <div className="tasks-role-switch" role="group" aria-label="岗位">
          {CESHU_ROLE_ORDER.map((item) => (
            <button
              key={item}
              type="button"
              data-testid={`tasks-role-${item}`}
              className={`artifact-btn${role === item ? ' active' : ''}`}
              onClick={() => setRole(item)}
            >
              {CESHU_ROLE_LABELS[item]}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn primary slim"
          data-testid="tasks-generate"
          disabled={busy}
          title="读整份策划书，拆成各岗位可执行的任务（会覆盖上次生成的结果）"
          onClick={() => void handleGenerate()}
        >
          {busy ? '拆解中…' : total > 0 ? '重新生成任务' : 'AI 生成任务'}
        </button>
      </div>

      {error !== null && (
        <div className="form-error" data-testid="tasks-error">
          {error}
        </div>
      )}
      {notice !== null && (
        <div className="notice-banner inline" data-testid="tasks-notice">
          {notice}
        </div>
      )}

      {planned !== undefined && planned.length > 0 ? (
        <div className="tasks-sections" data-testid="tasks-plan">
          {CESHU_TASK_PRIORITIES.map((priority) => {
            const group = planned.filter((task) => task.priority === priority)
            if (group.length === 0) return null
            return (
              <div key={priority} className="tasks-section" data-testid={`tasks-plan-${priority}`}>
                <div className="tasks-section-title">
                  {priority}（{group.length} 项）
                </div>
                <ul className="tasks-list">
                  {group.map((task, index) => (
                    <li key={`${priority}-${index}`} className="tasks-item" data-testid="tasks-plan-item">
                      <span className={`tasks-priority priority-${priority}`}>{priority}</span>
                      <span className="tasks-label">{task.title}</span>
                      <span className="tasks-value">{task.detail}</span>
                      <span className="tasks-source" data-testid="tasks-plan-source">
                        {CHAPTER_LABELS[task.source]}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )
          })}
        </div>
      ) : sections.length === 0 ? (
        <div className="artifact-placeholder" data-testid="tasks-empty">
          <p>该岗位暂无相关任务。</p>
          <p className="form-hint">点右上角「AI 生成任务」让 AI 从整份文档拆出可执行动作。</p>
        </div>
      ) : (
        <div className="tasks-sections" data-testid="tasks-derived">
          <div className="tasks-derived-hint" data-testid="tasks-derived-hint">
            以下是「按章字段清单」——它是文档写了什么的索引，还不是这个岗位要干的活。
            点「AI 生成任务」把它拆成可执行动作。
          </div>
          {sections.map((section) => (
            <div key={section.chapter} className="tasks-section" data-testid={`tasks-section-${section.chapter}`}>
              <div className="tasks-section-title">
                {section.label}（{section.items.length} 项）
              </div>
              <ul className="tasks-list">
                {section.items.map((item) => (
                  <li key={item.key} className="tasks-item">
                    <span className="tasks-check" aria-hidden="true" />
                    <span className="tasks-label">{item.label}</span>
                    <span className={`tasks-value${item.filled ? '' : ' empty'}`}>
                      {item.filled ? item.value : '（待补）'}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
