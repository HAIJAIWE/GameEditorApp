import type { ReactElement } from 'react'

import LucideIcon from '../LucideIcon'
import {
  attachmentExtension,
  formatAttachmentSize,
  type DigitalAttachment
} from '../../../../shared/util/libraryAttachments'
import { useAttachmentImage } from './useAttachmentImage'

/**
 * composer 待发送附件区（对齐 dsh draft rail 的诚实子集）。
 *
 * - 图片附件（`image/*`）显示**真实缩略图**，复用 `attachments:readImage`；
 *   读图失败回退成文件 chip（仍能发送，只是没缩略图）。
 * - 其它附件显示文件 chip（图标 + 名称 + 大小）。
 * - 每项可移除；刻意不做 dsh 的边缘翻页箭头 / 滚轮横向滚动（窄 composer 用不上）。
 */
export function PendingAttachments({
  attachments,
  onRemove,
  adding = false
}: {
  attachments: DigitalAttachment[]
  onRemove: (path: string) => void
  /** 正在把选中的文件复制进库：显示不确定进度（不画假百分比） */
  adding?: boolean
}): ReactElement | null {
  if (attachments.length === 0 && !adding) return null
  return (
    <div className="dsh-attachment-chips" data-testid="digital-attachments">
      {attachments.map((file) =>
        file.mime.startsWith('image/') ? (
          <PendingImageChip key={file.path} file={file} onRemove={onRemove} />
        ) : (
          <PendingFileChip key={file.path} file={file} onRemove={onRemove} />
        )
      )}
      {adding && (
        <span className="dsh-attachment-chip dsh-attachment-adding" data-testid="digital-attachment-adding">
          <span className="dsh-attachment-thumb-loading" aria-hidden="true" />
          导入中…
        </span>
      )}
    </div>
  )
}

/** chip 的次要文本：扩展名 + 大小（对齐 dsh `FileCard` 的 `[extension, size].join(' ')`） */
function metaOf(file: DigitalAttachment): string {
  return [attachmentExtension(file.name), formatAttachmentSize(file.bytes)]
    .filter((part) => part !== '')
    .join(' · ')
}

function RemoveButton({ path, onRemove }: { path: string; onRemove: (path: string) => void }): ReactElement {
  return (
    <button
      type="button"
      className="dsh-attachment-remove"
      data-testid="digital-attachment-remove"
      aria-label="移除附件"
      title="移除附件"
      onClick={() => onRemove(path)}
    >
      <LucideIcon name="x" size={12} />
    </button>
  )
}

function PendingFileChip({
  file,
  onRemove
}: {
  file: DigitalAttachment
  onRemove: (path: string) => void
}): ReactElement {
  return (
    <span className="dsh-attachment-chip" data-testid="digital-attachment-chip" data-kind="file">
      <LucideIcon name="file-text" size={12} />
      <span className="dsh-attachment-name" title={file.path}>
        {file.name}
      </span>
      <span className="dsh-attachment-size">{metaOf(file)}</span>
      <RemoveButton path={file.path} onRemove={onRemove} />
    </span>
  )
}

function PendingImageChip({
  file,
  onRemove
}: {
  file: DigitalAttachment
  onRemove: (path: string) => void
}): ReactElement {
  const { src, failed } = useAttachmentImage(file.path)
  // 读图失败：回退文件 chip（附件本身还在，只是没缩略图）
  if (failed) return <PendingFileChip file={file} onRemove={onRemove} />
  return (
    <span className="dsh-attachment-chip" data-testid="digital-attachment-chip" data-kind="image">
      <span className="dsh-attachment-thumb" aria-hidden="true">
        {src === null ? <span className="dsh-attachment-thumb-loading" /> : <img src={src} alt="" />}
      </span>
      <span className="dsh-attachment-name" title={file.path}>
        {file.name}
      </span>
      <span className="dsh-attachment-size">{metaOf(file)}</span>
      <RemoveButton path={file.path} onRemove={onRemove} />
    </span>
  )
}
