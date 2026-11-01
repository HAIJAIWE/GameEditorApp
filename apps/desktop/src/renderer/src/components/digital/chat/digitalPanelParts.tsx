import { useState } from 'react'

import { useT } from '@mobai/client-ui'
import { modelContextWindow } from '@mobai/shared/config/llm'
import { type MessageKey, type TranslateParams } from '@mobai/shared/i18n'

/** 绑定语言的便捷类型（与 `translate.translator` 返回值一致） */
type TFn = (key: MessageKey, params?: TranslateParams) => string

/**
 * 智能体面板的尾部展示件（从 `DigitalPanel.tsx` 原样搬出）。
 *
 * 只放「纯展示、只吃 props」的三件：本轮状态行、令牌环、以及状态行用的秒数格式化。
 * 面板业务状态一概不进来——这样主组件瘦身时，这几块不需要跟着改。
 */

/** 秒 → 「12 秒」/「1 分 05 秒」（状态行用，不带毫秒——那是 runStats 的活） */
function formatElapsed(sec: number, t: TFn): string {
  if (sec < 60) return t('agent.elapsed.sec', { n: sec })
  const minutes = Math.floor(sec / 60)
  const rest = sec % 60
  return rest === 0 ? t('agent.elapsed.min', { n: minutes }) : t('agent.elapsed.minSec', { n: minutes, m: String(rest).padStart(2, '0') })
}

/**
 * 本轮状态行（对齐 dsh 对话流里的「深度求索中，用时 11分47秒…」/「已完成分析」）。
 *
 * **只报我们真有的状态**：dsh 那行还会带「已重试模型请求 (2/5) · 1s ▾」，
 * 但我们的循环没有把重试事件回传渲染层——没有数据就不造，宁可比它少一行。
 */
export function ConversationRunStatus({
  status,
  elapsedSec,
  latencyMs
}: {
  status: 'idle' | 'thinking' | 'waiting_approval' | 'waiting_input' | 'done' | 'error'
  elapsedSec: number
  latencyMs: number
}): React.JSX.Element | null {
  const t = useT()
  // 空闲/出错不显示：出错有专门的错误条（`digital-error`），这里再报一遍是噪音
  if (status === 'idle' || status === 'error') return null
  const thinking = status === 'thinking'
  const text = thinking
    ? t('agent.thinkingWithTime', { time: formatElapsed(elapsedSec, t) })
    : status === 'waiting_approval'
      ? t('agent.wait.confirm')
      : status === 'waiting_input'
        ? t('agent.wait.input')
        : latencyMs > 0
          ? t('agent.done.analyzedWithTime', { time: formatElapsed(Math.round(latencyMs / 1000), t) })
          : t('agent.done.analyzed')

  return (
    <div className={`conv-status conv-status-${status}`} data-testid="conv-status" role="status">
      <span className={`conv-status-dot${thinking ? ' is-running' : ''}`} aria-hidden />
      <span className={thinking ? 'is-shimmer' : undefined}>{text}</span>
    </div>
  )
}

/**
 * 令牌环（对齐 dsh ContextMeter）：用对话里**真实累计**的 token 数（prompt/completion/total，
 * 来自 `AgentRunStats`，由 `observability.ts` 事后统计）画「已用 / 上下文上限」圆环。
 *
 * 上限取按模型的**公开发布规格**（`MODEL_CONTEXT_WINDOWS`），不在表里回落默认值——
 * 是规格值、不是假运行时探测值。占用接近上限时环变色（accent → 强调 hover → 删除红）。
 * hover 浮出分解卡。无用量时不渲染（由外层 `turns > 0` 控制）。
 */
export function ContextMeter({
  total,
  prompt,
  completion,
  model
}: {
  total: number
  prompt: number
  completion: number
  model: string
}): React.JSX.Element {
  const t = useT()
  const ctx = modelContextWindow(model)
  const pct = ctx > 0 ? Math.min(1, total / ctx) : 0
  const [hover, setHover] = useState(false)
  const color =
    pct > 0.9 ? 'var(--change-delete)' : pct > 0.7 ? 'var(--accent-hover)' : 'var(--accent)'
  const radius = 9
  const circumference = 2 * Math.PI * radius
  const fmt = (n: number): string => (n >= 1000 ? `${(n / 1000).toFixed(n < 10000 ? 1 : 0)}k` : String(n))
  const title = t('agent.context.title', { pct: Math.round(pct * 100), total: fmt(total), ctx: fmt(ctx) })
  return (
    <span
      className="dsh-context-meter"
      data-testid="digital-context-meter"
      title={title}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <svg width="22" height="22" viewBox="0 0 22 22" aria-hidden="true">
        <circle cx="11" cy="11" r={radius} fill="none" stroke="var(--border)" strokeWidth="2.5" />
        <circle
          cx="11"
          cy="11"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="2.5"
          strokeDasharray={circumference}
          strokeDashoffset={circumference * (1 - pct)}
          strokeLinecap="round"
          transform="rotate(-90 11 11)"
        />
      </svg>
      {hover && (
        <span className="dsh-context-meter-pop" role="tooltip">
          <div>
            <span>{t('agent.context.total')}</span>
            <b>{total} tok</b>
          </div>
          <div>
            <span>{t('agent.context.input')}</span>
            <b>{prompt}</b>
          </div>
          <div>
            <span>{t('agent.context.output')}</span>
            <b>{completion}</b>
          </div>
          <div>
            <span>{t('agent.context.window')}</span>
            <b>{ctx}</b>
          </div>
          <div>
            <span>{t('agent.context.occupied')}</span>
            <b>{Math.round(pct * 100)}%</b>
          </div>
        </span>
      )}
    </span>
  )
}
