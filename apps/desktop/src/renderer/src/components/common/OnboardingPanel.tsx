import { useEffect, useMemo, useRef, useState } from 'react'

import { useT } from '@mobai/client-ui'
import { countByType, type TypeCountRow } from '@mobai/shared/util/data'
import {
  ONBOARDING_STEPS,
  QUICK_ACTIONS,
  STATS_PER_ROW,
  STEPS_PER_ROW,
  isAllComplete,
  loadOnboardingState,
  progressLabel,
  saveOnboardingState,
  withCollapsed,
  withDismissed,
  withStepCompleted,
  type OnboardingState
} from '@mobai/shared/config/settings'
import type { DataTypeDef, ItemRecord } from '@mobai/shared/types'
import { toErrorMessage } from '@mobai/shared/util/system'

/**
 * 快速入门面板。
 * 菜单入口：**帮助 → 快速入门**（`MenuBar.tsx`）。
 *
 * ## 迁了什么
 * - **引导区** `OnboardingGuide`：标题行「🚀 快速入门」+ 折叠（▼/▶）+ 进度「N/5 已完成」+
 *   关闭（✕）；`STEPS_PER_ROW` 列的步骤卡（24px 圆形序号徽章，完成显 ✓，未完成显下标；
 *   未完成的卡带「开始」按钮 → 标记完成并派发 `onAction(step.id)`）。
 *   5 步全部完成后延迟 ~500ms 自动折叠卡片。
 * - **快捷操作卡** `QUICK_ACTIONS`：`STEPS_PER_ROW` 列的 6 张可点卡 → `onAction(id, dataType ?? '')`。
 * - **数据概览卡**：`STATS_PER_ROW` 列的按类型计数卡（`shared/util/dataStats.ts::countByType`），
 *   计数用类型色，取自 `window.mbApi.data.listAll()`。
 *
 * ## 有意不迁（宁缺勿错）
 * - 数据概览头的「⚙ 管理显示类型」按钮：它唯一的消费者 `TypeVisibilityPanel` 在 TS 已随侧栏
 *   刻意下线（见 `App.tsx` 注释），旧版 亦无等价物 —— 概览区改为路由到既有「游戏数据统计」。
 * - 不按 `visible_types` 过滤（TS 未接线）。
 *
 * ## 状态持久化
 * 状态（折叠 / 关闭 / 完成度）经 `shared/onboarding.ts` 落 `mb.onboarding`；「✕」关闭会
 * **先显式持久化再 `onClose()`**（面板随之卸载，不能只靠 state 变化后的 effect）。
 *
 * 浮层头部已有统一的「关闭」按钮，故本组件不自绘关闭框（与 `ShortcutsPanel` 同一约定）。
 */
interface OnboardingPanelProps {
  types: DataTypeDef[]
  onAction: (actionId: string, dataType: string) => void
  onClose: () => void
}

export default function OnboardingPanel({ types, onAction, onClose }: OnboardingPanelProps) {
  const t = useT()
  const [state, setState] = useState<OnboardingState>(loadOnboardingState)
  const [items, setItems] = useState<ItemRecord[]>([])
  const [error, setError] = useState<string | null>(null)
  const autoCollapseTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 加载全部条目（只读，用于数据概览计数）；失败仅记本地错误，绝不崩溃
  useEffect(() => {
    let alive = true
    window.mbApi.data
      .listAll()
      .then((records) => {
        if (alive) setItems(records)
      })
      .catch((err: unknown) => {
        if (alive) setError(toErrorMessage(err))
      })
    return () => {
      alive = false
    }
  }, [])

  // 状态变化即持久化（折叠 / 逐步完成；「✕」关闭另有显式写入，见 handleDismiss）
  useEffect(() => {
    saveOnboardingState(state)
  }, [state])

  const allDone = isAllComplete(state)

  // 5 步全部完成 → 延迟 500ms 自动折叠卡片；卸载时清理定时器
  useEffect(() => {
    if (!allDone || state.collapsed) return undefined
    autoCollapseTimer.current = setTimeout(() => {
      setState((prev) => (prev.collapsed ? prev : withCollapsed(prev, true)))
    }, 500)
    return () => {
      if (autoCollapseTimer.current !== null) {
        clearTimeout(autoCollapseTimer.current)
        autoCollapseTimer.current = null
      }
    }
  }, [allDone, state.collapsed])

  const rows: TypeCountRow[] = useMemo(() => countByType(items, types), [items, types])
  const colorByType = useMemo(() => new Map(types.map((def) => [def.id, def.color])), [types])

  const handleToggleCollapsed = (): void => {
    setState((prev) => withCollapsed(prev, !prev.collapsed))
  }

  const handleDismiss = (): void => {
    const next = withDismissed(withCollapsed(state, true), true)
    saveOnboardingState(next)
    setState(next)
    onClose()
  }

  const handleStepStart = (index: number, stepId: string): void => {
    setState((prev) => withStepCompleted(prev, index))
    onAction(stepId, '')
  }

  return (
    <div className="editor onboarding" data-testid="onboarding-panel">
      <div className="editor-header">
        <div className="editor-title onboarding-head">
          <button
            type="button"
            className="onboarding-collapse"
            data-testid="onboarding-collapse"
            aria-expanded={!state.collapsed}
            title={state.collapsed ? t('onboardingPanel.expandTitle') : t('onboardingPanel.collapseTitle')}
            onClick={handleToggleCollapsed}
          >
            {state.collapsed ? '▶' : '▼'}
          </button>
          <span className="onboarding-heading">{t('onboardingPanel.heading')}</span>
          <span className="onboarding-progress" data-testid="onboarding-progress">
            {progressLabel(state)}
          </span>
          <button
            type="button"
            className="onboarding-dismiss"
            data-testid="onboarding-dismiss"
            title={t('onboardingPanel.dismissTitle')}
            onClick={handleDismiss}
          >
            ✕
          </button>
        </div>
      </div>

      <div className="editor-body">
        {error !== null && (
          <div className="item-meta onboarding-error" role="alert">
            {t('onboardingPanel.error', { message: error })}
          </div>
        )}

        {!state.collapsed && (
          <div
            className="onboarding-steps"
            style={{ gridTemplateColumns: `repeat(${STEPS_PER_ROW}, minmax(0, 1fr))` }}
          >
            {ONBOARDING_STEPS.map((step, index) => {
              const done = state.completed.includes(index)
              return (
                <div
                  key={step.id}
                  className={`onboarding-step${done ? ' onboarding-step--done' : ''}`}
                  data-testid="onboarding-step"
                >
                  <div className="onboarding-step-head">
                    <span className={`onboarding-badge${done ? ' onboarding-badge--done' : ''}`} aria-hidden="true">
                      {done ? '✓' : index + 1}
                    </span>
                    <span className="onboarding-step-icon" aria-hidden="true">
                      {step.icon}
                    </span>
                    <span className="onboarding-step-title">{step.title}</span>
                  </div>
                  <div className="onboarding-step-desc">{step.desc}</div>
                  {!done && (
                    <button
                      type="button"
                      className="btn slim primary onboarding-step-start"
                      data-testid="onboarding-step-start"
                      onClick={() => handleStepStart(index, step.id)}
                    >
                      {t('onboardingPanel.start')}
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        )}

        <div className="onboarding-section">
          <div className="onboarding-section-title">{t('onboardingPanel.sectionTitle')}</div>
          <div className="item-meta onboarding-subtitle">{t('onboardingPanel.sectionSubtitle')}</div>
          <div
            className="onboarding-quick"
            style={{ gridTemplateColumns: `repeat(${STEPS_PER_ROW}, minmax(0, 1fr))` }}
          >
            {QUICK_ACTIONS.map((action) => (
              <button
                type="button"
                key={action.id}
                className="onboarding-quick-card"
                data-testid="onboarding-quick-action"
                onClick={() => onAction(action.id, action.dataType ?? '')}
              >
                <span className="onboarding-quick-icon" aria-hidden="true">
                  {action.icon}
                </span>
                <span className="onboarding-quick-label">{action.label}</span>
                <span className="onboarding-quick-desc">{action.desc}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="onboarding-section">
          <div className="onboarding-section-title onboarding-stats-head">
            <span>{t('onboardingPanel.statsTitle')}</span>
            <button
              type="button"
              className="onboarding-link"
              data-testid="onboarding-open-stats"
              onClick={() => onAction('stats', '')}
            >
              {t('onboardingPanel.openStats')}
            </button>
          </div>
          {types.length === 0 ? (
            <div className="item-meta">{t('onboardingPanel.noTypes')}</div>
          ) : (
            <div
              className="onboarding-stats"
              style={{ gridTemplateColumns: `repeat(${STATS_PER_ROW}, minmax(0, 1fr))` }}
            >
              {rows.map((row) => {
                const color = colorByType.get(row.type)
                return (
                  <div className="onboarding-stat" key={row.type} data-testid="onboarding-stat">
                    <span className="onboarding-stat-count" style={color ? { color } : undefined}>
                      {row.count}
                    </span>
                    <span className="onboarding-stat-name">{row.name}</span>
                  </div>
                )
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
