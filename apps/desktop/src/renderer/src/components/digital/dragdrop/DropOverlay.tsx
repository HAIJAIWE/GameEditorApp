import { createPortal } from 'react-dom'
import type { ReactElement } from 'react'

/**
 * 全屏投放邀请（对齐 dsh `ui-attachment` 的 `DropOverlay` / DragMask）。
 *
 * 拖入文件时覆盖整页：毛玻璃 + 居中插图 + 标题 + 限制说明。
 * **`pointer-events: none`** 是关键——拖拽事件必须继续到达页面，否则
 * `dragenter/dragleave` 的嵌套计数会失衡、投放判定也会失效。
 * 经 `createPortal` 挂到 `document.body`（避免被祖先的 transform 裁掉）。
 *
 * `disabled`（智能体运行中）时换成「禁止」插图并去掉限制说明——与 dsh 一致。
 */
export function DropOverlay({ disabled }: { disabled: boolean }): ReactElement {
  return createPortal(
    <div className="digital-drop-mask" data-testid="digital-drop-overlay" role="status">
      <div className="digital-drop-wrap">
        <div className="digital-drop-illustration" aria-hidden="true">
          <Illustration disabled={disabled} />
        </div>
        <div className="digital-drop-title">
          {disabled ? '智能体运行中，暂不能添加附件' : '松开以添加附件'}
        </div>
        {!disabled && <div className="digital-drop-desc">支持任意文件，会复制进当前库</div>}
      </div>
    </div>,
    document.body
  )
}

/** 上传插图（115×84）：虚线投放框 + 上箭头；disabled 时加一道斜杠 */
function Illustration({ disabled }: { disabled: boolean }): ReactElement {
  return (
    <svg width="115" height="84" viewBox="0 0 115 84" fill="none" aria-hidden="true">
      <rect
        x="18"
        y="14"
        width="80"
        height="56"
        rx="12"
        stroke="currentColor"
        strokeWidth="2"
        strokeDasharray="6 5"
        opacity="0.35"
      />
      <path
        d="M57.5 56V30M57.5 30l-10 10M57.5 30l10 10"
        stroke="currentColor"
        strokeWidth="2.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {disabled && (
        <path d="M30 66 84 18" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" opacity="0.6" />
      )}
    </svg>
  )
}
