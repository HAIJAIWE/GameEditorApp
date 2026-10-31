import { useSyncExternalStore } from 'react'

import { dismissToast, getToasts, subscribeToasts } from '../../../../shared/util/ui'

/**
 * Toast 宿主组件。
 *
 * ## 为什么用 useSyncExternalStore 而不是 useEffect + setState
 * react-hooks v7.1.1 的 `set-state-in-effect` 是 **error**：在 effect 里同步 setState
 * 会直接报红。`useSyncExternalStore` 是 React 官方为「订阅外部数据源」提供的钩子，
 * 天然符合约束，且能避免「先渲染空列表、effect 后再补」的闪烁。
 *
 * ## 定位
 * 浮在父容器右下角（`position: absolute` + 宿主自身不占布局空间），
 * **不会把它下方的面板挤走** —— 这正是 `notice-banner` 的痛点（会推挤布局）。
 *
 * ## 无障碍
 * 容器 `role="status"` + `aria-live="polite"`：屏幕阅读器会朗读新增的提示，
 * 且**不打断**用户当前操作（polite 而非 assertive）。
 */
export default function ToastHost() {
  const toasts = useSyncExternalStore(subscribeToasts, getToasts, getToasts)

  if (toasts.length === 0) return null

  return (
    <div className="toast-host" data-testid="toast-host" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <div
          key={toast.id}
          className={`toast toast-${toast.kind}`}
          data-testid={`toast-${toast.kind}`}
          data-toast-id={toast.id}
        >
          <span className="toast-text">{toast.text}</span>
          <button
            type="button"
            className="toast-close"
            data-testid="toast-close"
            aria-label="关闭提示"
            onClick={() => dismissToast(toast.id)}
          >
            ×
          </button>
        </div>
      ))}
    </div>
  )
}
