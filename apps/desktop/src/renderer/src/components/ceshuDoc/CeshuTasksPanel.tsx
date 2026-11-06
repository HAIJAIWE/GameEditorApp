import { useState } from 'react'

import { useT } from '@mobai/client-ui'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import {
  CESHU_TASK_PRIORITIES,
  collectRoleTasks,
  taskRoleLabelForDoc,
  taskRolesForDoc
} from '@mobai/shared/ceshu/workflow'
import { countTaskPlan } from '@mobai/shared/ceshu/prompts'
import { chapterLabelForDoc } from '@mobai/shared/ceshu/model'
import { toErrorMessage } from '@mobai/shared/util/system'

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
  const t = useT()
  // 岗位按档位分派；换文档（档位可能变）时若旧岗位不在新列表里，自动落到首个岗位
  const roles = taskRolesForDoc(doc)
  const [selectedRole, setRole] = useState<string>('programmer')
  const role = roles.includes(selectedRole) ? selectedRole : (roles[0] ?? 'programmer')
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
      setNotice(count === 0 ? t('tasks.noTasks') : t('tasks.generated', { n: count }))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="tasks-panel" data-testid="tasks-panel">
      <div className="tasks-toolbar">
        <div className="tasks-role-switch" role="group" aria-label={t('tasks.roleGroupLabel')}>
          {roles.map((item) => (
            <button
              key={item}
              type="button"
              data-testid={`tasks-role-${item}`}
              className={`artifact-btn${role === item ? ' active' : ''}`}
              onClick={() => setRole(item)}
            >
              {taskRoleLabelForDoc(doc, item)}
            </button>
          ))}
        </div>
        <button
          type="button"
          className="btn primary slim"
          data-testid="tasks-generate"
          disabled={busy}
          title={t('tasks.generateTitle')}
          onClick={() => void handleGenerate()}
        >
          {busy ? t('tasks.generating') : total > 0 ? t('tasks.regenerate') : t('tasks.generate')}
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
                  {t('tasks.priorityCount', { priority, n: group.length })}
                </div>
                <ul className="tasks-list">
                  {group.map((task, index) => (
                    <li key={`${priority}-${index}`} className="tasks-item" data-testid="tasks-plan-item">
                      <span className={`tasks-priority priority-${priority}`}>{priority}</span>
                      <span className="tasks-label">{task.title}</span>
                      <span className="tasks-value">{task.detail}</span>
                      <span className="tasks-source" data-testid="tasks-plan-source">
                        {chapterLabelForDoc(doc, task.source)}
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
          <p>{t('tasks.emptyTitle')}</p>
          <p className="form-hint">{t('tasks.emptyHint')}</p>
        </div>
      ) : (
        <div className="tasks-sections" data-testid="tasks-derived">
          <div className="tasks-derived-hint" data-testid="tasks-derived-hint">
            {t('tasks.derivedHint')}
          </div>
          {sections.map((section) => (
            <div key={section.chapter} className="tasks-section" data-testid={`tasks-section-${section.chapter}`}>
              <div className="tasks-section-title">
                {t('tasks.sectionCount', { label: section.label, n: section.items.length })}
              </div>
              <ul className="tasks-list">
                {section.items.map((item) => (
                  <li key={item.key} className="tasks-item">
                    <span className="tasks-check" aria-hidden="true" />
                    <span className="tasks-label">{item.label}</span>
                    <span className={`tasks-value${item.filled ? '' : ' empty'}`}>
                      {item.filled ? item.value : t('tasks.pendingValue')}
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
