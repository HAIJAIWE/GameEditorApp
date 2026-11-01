import { useState, type ReactElement } from 'react'

import { useT } from '@mobai/client-ui'
import type { DeliveryRecord } from '@mobai/shared/agent/observability'
import { attachmentExtension, formatAttachmentSize } from '@mobai/shared/util/io'

/** 折叠前显示的行数（对齐 dsh `Deliverables` 的 COLLAPSED_PRESENTED_COUNT） */
const COLLAPSED_DELIVERIES = 4

/**
 * 对话内联「本轮交付」卡（对齐 dsh `ui-deliverables` 的 delivery cards）。
 *
 * 数据来自交付日志（`system.ceshu` 的 export 动作成功后落一条），只展示**真实交付**的文件，
 * 不从正文里猜。行结构对齐 dsh `PresentedFileCard`：文件图标 + 名称 + 扩展名/大小；
 * 超过 4 行折叠（对齐 `COLLAPSED_PRESENTED_COUNT`）。点文件名用系统默认程序打开。
 *
 * 空列表整体不渲染：对话里多一张「本轮没交付」的空卡只会干扰阅读。
 */
export function DigitalDeliveryCard({
  deliveries,
  onOpen
}: {
  deliveries: readonly DeliveryRecord[]
  /**
   * 打开一个交付文件。对齐 dsh `file-actions` 的「主点击=应用内预览」：
   * 调用方按类型决定（文本进代码面板、二进制走系统程序）；缺省直接走系统程序。
   */
  onOpen?: (path: string) => void
}): ReactElement | null {
  const t = useT()
  const [expanded, setExpanded] = useState(false)
  if (deliveries.length === 0) return null
  const foldable = deliveries.length > COLLAPSED_DELIVERIES
  const rows = foldable && !expanded ? deliveries.slice(0, COLLAPSED_DELIVERIES) : deliveries
  const title = deliveries.length === 1 ? t('agent.delivery.one') : t('agent.delivery.many', { n: deliveries.length })
  return (
    <div className="digital-delivery-card" data-testid="digital-delivery-card" data-count={deliveries.length}>
      <div className="digital-delivery-head">
        <span className="digital-delivery-tile" aria-hidden="true">
          {TILE_ICON}
        </span>
        <span className="digital-delivery-title">{title}</span>
      </div>
      <ul className="digital-delivery-list">
        {rows.map((file) => {
          const extension = attachmentExtension(file.label)
          const meta = [extension, file.bytes > 0 ? formatAttachmentSize(file.bytes) : '']
            .filter((part) => part !== '')
            .join(' · ')
          return (
            <li key={file.id} className="digital-delivery-row">
              <button
                type="button"
                className="digital-delivery-file"
                data-testid="digital-delivery-file"
                title={file.path}
                onClick={() => {
                  if (onOpen !== undefined) onOpen(file.path)
                  else void window.mbApi.shell.openPath({ path: file.path })
                }}
              >
                {FILE_ICON}
                <span className="digital-delivery-name">{file.label}</span>
                {meta !== '' && <span className="digital-delivery-size">{meta}</span>}
              </button>
            </li>
          )
        })}
      </ul>
      {foldable && (
        <button
          type="button"
          className="digital-delivery-toggle"
          data-testid="digital-delivery-toggle"
          aria-expanded={expanded}
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? `${t('agent.change.collapse')} ▴` : `${t('agent.delivery.expand', { n: deliveries.length })} ▾`}
        </button>
      )}
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
