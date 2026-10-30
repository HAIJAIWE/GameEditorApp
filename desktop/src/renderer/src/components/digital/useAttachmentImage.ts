import { useEffect, useState } from 'react'

/**
 * 读库内图片附件为 data URL（供缩略图 / lightbox 用）。
 *
 * 失败置 `failed`（不抛）：调用方据此回退成文件 chip，而不是静默丢附件。
 * 调用方应把 `path` 作为组件 `key`——路径变化会重挂组件，初始态自然重置，
 * 因此 effect 里**不同步 setState**（避免 `react-hooks/set-state-in-effect`）。
 */
export function useAttachmentImage(path: string): { src: string | null; failed: boolean } {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    let live = true
    void window.mbApi.attachments
      .readImage({ path })
      .then((result) => {
        if (!live) return
        if (result.ok) setSrc(result.dataUrl)
        else setFailed(true)
      })
      .catch(() => {
        if (live) setFailed(true)
      })
    return () => {
      live = false
    }
  }, [path])

  return { src, failed }
}
