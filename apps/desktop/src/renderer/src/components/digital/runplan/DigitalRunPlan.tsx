import type { ReactElement } from 'react'

import { useT } from '@mobai/client-ui'
import type { DigitalPanelState, DigitalStep } from '@mobai/shared/agent/ui'

/**
 * 「本轮进度」条（借 dsh `ui-plan` 的 PlanCard / PlanPreview 结构：图标 + 标题 + 状态）。
 *
 * 为什么需要它：执行步骤默认折叠在「展开执行步骤（N）」按钮后面，运行中想知道
 * 「跑到第几步、有没有失败」得点开一次。这里把**同一份 `steps` 数据**压成一行：
 * 分段进度条 + 当前步骤名 + 计数，不重复列表内容（列表仍由 `DigitalStepList` 负责）。
 *
 * 数据全部派生自 `state.steps`，没有新增后端概念——dsh 的 plan 是「模型提交的计划文档」，
 * 我们还没有 plan 模式，所以不做假的计划审批，只做**执行进度**的可见化。
 */

const STATUS_BADGE_KEYS = {
  running: 'agent.plan.running',
  done: 'agent.plan.done',
  failed: 'agent.plan.failed'
} as const

/** 前导图标（16px 内联 SVG，零依赖）：三条横线 + 勾选位，暗示「清单进度」 */
function PlanIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <path
        d="M6 4h7M6 8h7M6 12h5"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
      />
      <path d="M2.5 4l1 1 1.5-1.6M2.5 8l1 1 1.5-1.6" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

export function DigitalRunPlan({
  steps,
  status,
  onExpand
}: {
  steps: DigitalStep[]
  /** 面板整体状态：用于徽标（进行中/已完成/有失败） */
  status: DigitalPanelState['status']
  /** 有值时卡片底部出现「查看步骤」：展开下方的执行步骤列表（进度条只给概览，细节仍在列表里） */
  onExpand?: () => void
}): ReactElement | null {
  const t = useT()
  if (steps.length === 0) return null

  const total = steps.length
  const done = steps.filter((step) => step.status === 'done').length
  const failed = steps.filter((step) => step.status === 'failed').length
  const runningStep = steps.find((step) => step.status === 'running')

  // 徽标优先级：有失败 > 运行中 > 已完成（失败必须盖过「已完成」，否则用户会漏看）
  const badge: 'running' | 'done' | 'failed' =
    failed > 0 ? 'failed' : runningStep !== undefined || status === 'thinking' ? 'running' : 'done'

  return (
    <div className="digital-run-plan" data-testid="digital-run-plan" data-state={badge}>
      <div className="digital-run-plan-head">
        <span className="digital-run-plan-icon" aria-hidden="true">
          <PlanIcon />
        </span>
        <span className="digital-run-plan-title">{t('agent.plan.title')}</span>
        <span className="digital-run-plan-count" data-testid="digital-run-plan-count">
          {done}/{total}
        </span>
        <span className={`digital-run-plan-badge badge-${badge}`}>{t(STATUS_BADGE_KEYS[badge])}</span>
      </div>

      <div
        className="digital-run-plan-bar"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={done}
        aria-label={t('agent.plan.aria', {
          done,
          total,
          failed: failed > 0 ? t('agent.plan.ariaFailed', { n: failed }) : ''
        })}
      >
        {steps.map((step, index) => (
          <span
            key={`${step.order}-${step.tool}-${index}`}
            className={`digital-run-plan-segment segment-${step.status}`}
            data-testid="digital-run-plan-segment"
            data-status={step.status}
            title={step.tool}
          />
        ))}
      </div>

      {runningStep !== undefined && (
        <div className="digital-run-plan-current" data-testid="digital-run-plan-current">
          {t('agent.plan.current')}
          <code>{runningStep.tool}</code>
        </div>
      )}
      {failed > 0 && runningStep === undefined && (
        <div className="digital-run-plan-current is-error" data-testid="digital-run-plan-failed">
          {t('agent.plan.failedHint', { n: failed })}
        </div>
      )}
      {onExpand !== undefined && (
        <button
          type="button"
          className="digital-run-plan-expand"
          data-testid="digital-run-plan-expand"
          onClick={onExpand}
        >
          {t('agent.plan.viewSteps')}
        </button>
      )}
    </div>
  )
}

export default DigitalRunPlan
