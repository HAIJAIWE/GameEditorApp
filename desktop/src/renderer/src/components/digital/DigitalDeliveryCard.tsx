import type { ReactElement } from 'react'

import type { DeliveryRecord } from '../../../../shared/agent/deliveryLog'
import { formatAttachmentSize } from '../../../../shared/util/libraryAttachments'

/**
 * 对话内联「本轮交付」卡（对齐 dsh `ui-deliverables` 的 delivery cards）。
 *
 * 数据来自交付日志（`system.ceshu` 的 export 动作成功后落一条），只展示**真实交付**的文件，
 * 不从正文里猜。点文件名用系统默认程序打开（`attachments:open` 底层即 `shell.openPath`）。
 *
 * 空列表整体不渲染：对话里多一张「本轮没交付」的空卡只会干扰阅读。
 */
export function DigitalDeliveryCard({ deliveries }: { deliveries: readonly DeliveryRecord[] }): ReactElement | null {
  if (deliveries.length === 0) return null
  return (
    <div className="digital-delivery-card" data-testid="digital-delivery-card" data-count={deliveries.length}>
      <div className="digital-delivery-head">
        <span className="digital-delivery-tile" aria-hidden="true">
          {TILE_ICON}
        </span>
        <span className="digital-delivery-title">
          {deliveries.length === 1 ? '交付 1 个文件' : `交付 ${deliveries.length} 个文件`}
        </span>
      </div>
      <ul className="digital-delivery-list">
        {deliveries.map((file) => (
          <li key={file.id} className="digital-delivery-row">
            <button
              type="button"
              className="digital-delivery-file"
              data-testid="digital-delivery-file"
              title={file.path}
              onClick={() => {
                void window.mbApi.attachments.open({ path: file.path })
              }}
            >
              {FILE_ICON}
              <span className="digital-delivery-name">{file.label}</span>
              {file.bytes > 0 && <span className="digital-delivery-size">{formatAttachmentSize(file.bytes)}</span>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 卡头 tile：一个「已交付」的包裹箱图标（20px，零依赖） */
const TILE_ICON = (
  <svg width="20" height="20" viewBox="0 0 20 20" fill="none">
    <path d="M3 6.5 10 3l7 3.5v7L10 17l-7-3.5v-7Z" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
    <path d="M3 6.5 10 10l7-3.5M10 10v7" stroke="currentColor" strokeWidth="1.4" strokeLinejoin="round" />
  </svg>
)

/** 行内文件图标（14px） */
const FILE_ICON = (
  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" aria-hidden="true">
    <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    <path d="M14 2v6h6" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
  </svg>
)
