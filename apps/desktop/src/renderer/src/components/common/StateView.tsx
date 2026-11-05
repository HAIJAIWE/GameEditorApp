import type { ReactNode } from 'react'

import { useT } from '@mobai/client-ui'
import type { MessageKey } from '@mobai/shared/i18n'

/**
 * 统一的「空 / 加载 / 错误」三态视图（Phase A）。
 *
 * ## 为什么需要它
 * 当前各面板的三态是各写各的：多数空态是裸 `<p>`；`sessionHistory` 甚至 `catch {}` 静默，
 * 读失败会显示成「没有数据」——用户无法区分「确实没有」和「读挂了」。
 *
 * ## 约定
 * - **错误不得静默**：`catch` 里至少渲染一次 `kind="error"`（或 toast），不能吞掉。
 * - `kind` 决定默认标题（`state.empty` / `common.loading` / `state.error`），可用 `title` 覆盖。
 * - 错误用 `role="alert"`，加载用 `aria-live="polite"`，便于读屏与 e2e 定位。
 * - 文案全部走 `t()`；新增键必须同时补 zh/en（i18n 棘轮 `BASELINE=0`）。
 */
export type StateKind = 'empty' | 'loading' | 'error'

const DEFAULT_TITLE: Record<StateKind, MessageKey> = {
  empty: 'state.empty',
  loading: 'common.loading',
  error: 'state.error'
}

export interface StateViewProps {
  kind: StateKind
  /** 覆盖默认标题 */
  title?: ReactNode
  /** 说明（错误时放原因，空态时放"下一步"引导） */
  description?: ReactNode
  /** 可选动作（重试 / 去创建 / 去设置） */
  action?: ReactNode
  testId?: string
}

export default function StateView({ kind, title, description, action, testId }: StateViewProps) {
  const t = useT()
  return (
    <div
      className={`state-view state-view-${kind}`}
      data-testid={testId}
      role={kind === 'error' ? 'alert' : 'status'}
      aria-live={kind === 'loading' ? 'polite' : undefined}
    >
      <div className="state-view-title">{title ?? t(DEFAULT_TITLE[kind])}</div>
      {description !== undefined && <div className="state-view-desc">{description}</div>}
      {action !== undefined && <div className="state-view-action">{action}</div>}
    </div>
  )
}
