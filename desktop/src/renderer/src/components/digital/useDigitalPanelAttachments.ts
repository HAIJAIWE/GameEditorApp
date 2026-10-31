import { useCallback, useEffect, useRef, useState } from 'react'

import { toErrorMessage } from '../../../../shared/util/system'
import type { DigitalAttachment } from '../../../../shared/util/io'

/**
 * 待发送附件簇（对齐 dsh ui-attachment 的诚实子集）。
 *
 * 只负责「文件 → 复制进库 → 待发送列表」这一段：原生选择、整页拖拽投放、去重、移除。
 * 真正的发送（连同文本一起 dispatch 给 reducer）由面板调用方做——本 hook 只提供
 * `attachments` 与 `clearAttachments`，避免把「发送时序」也搬进来。
 */
export interface DigitalPanelAttachments {
  /** 已复制进库、等待随下一条消息发出的附件元数据 */
  attachments: DigitalAttachment[]
  /** 正在把选中文件复制进库（不确定进度：显示「导入中…」，不画假百分比） */
  adding: boolean
  /** 文件正拖到输入框上（高亮投放区） */
  dragActive: boolean
  /** 把一个本地路径的附件复制进库并加入待发送列表（原生选择与拖拽共用） */
  addAttachmentPath: (path: string) => void
  /** 选文件（原生对话框）→ 复制进库 → 入待发送列表 */
  addFromDialog: () => void
  removeAttachment: (name: string) => void
  clearAttachments: () => void
}

export function useDigitalPanelAttachments({
  running,
  setLocalError
}: {
  /** 运行中拒绝投放（与 dsh 一致：邀请仍在，真正拒绝发生在 drop） */
  running: boolean
  setLocalError: (message: string | null) => void
}): DigitalPanelAttachments {
  const [attachments, setAttachments] = useState<DigitalAttachment[]>([])
  const [adding, setAdding] = useState(false)
  const [dragActive, setDragActive] = useState(false)

  /** 把一个本地路径的附件复制进库并加入待发送列表（原生选择与拖拽共用） */
  const addAttachmentPath = useCallback(
    (path: string): void => {
      setLocalError(null)
      // 复制进库期间显示「导入中…」（真实拷贝，异步不阻塞；没有流式回调，故不确定进度）
      setAdding(true)
      void (async () => {
        try {
          const result = await window.mbApi.attachments.add({ path })
          if (!result.ok) {
            setLocalError(result.error)
            return
          }
          // 同一文件重复选不重复加（按入库后的绝对路径去重）
          setAttachments((prev) =>
            prev.some((file) => file.name === result.attachment.name) ? prev : [...prev, result.attachment]
          )
        } catch (error: unknown) {
          setLocalError(toErrorMessage(error))
        } finally {
          setAdding(false)
        }
      })()
    },
    [setLocalError]
  )

  /** 选文件（原生对话框）→ 复制进库 → 入待发送列表 */
  const addFromDialog = useCallback((): void => {
    setLocalError(null)
    void (async () => {
      try {
        const picked = await window.mbApi.dialog.chooseAttachmentFile()
        if (picked.path === null) return
        addAttachmentPath(picked.path)
      } catch (error: unknown) {
        setLocalError(toErrorMessage(error))
      }
    })()
  }, [addAttachmentPath, setLocalError])

  /**
   * 文档级拖拽投放（对齐 dsh `installDocumentDropEvents`）：整页任意位置拖入文件都能加入附件；
   * 用嵌套深度计数（dragenter/dragleave 成对）避免子元素间移动时高亮闪烁。
   */
  const dragDepth = useRef(0)
  useEffect(() => {
    const hasFiles = (event: DragEvent): boolean =>
      event.dataTransfer !== null && event.dataTransfer.types.includes('Files')
    const reset = (): void => {
      dragDepth.current = 0
      setDragActive(false)
    }
    const onDragEnter = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      dragDepth.current += 1
      // 运行中也显示投放邀请（disabled 态），与 dsh 一致；真正拒绝发生在 drop
      setDragActive(true)
    }
    const onDragOver = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      if (event.dataTransfer !== null) event.dataTransfer.dropEffect = running ? 'none' : 'copy'
    }
    const onDragLeave = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      dragDepth.current = Math.max(0, dragDepth.current - 1)
      if (dragDepth.current === 0) setDragActive(false)
    }
    const onDrop = (event: DragEvent): void => {
      if (!hasFiles(event)) return
      event.preventDefault()
      reset()
      if (running) return
      for (const file of Array.from(event.dataTransfer?.files ?? [])) {
        const path = window.mbApi.attachments.pathForFile(file)
        if (path !== '') addAttachmentPath(path)
      }
    }
    const onDragEnd = (): void => reset()
    document.addEventListener('dragenter', onDragEnter)
    document.addEventListener('dragover', onDragOver)
    document.addEventListener('dragleave', onDragLeave)
    document.addEventListener('drop', onDrop)
    window.addEventListener('dragend', onDragEnd)
    return () => {
      document.removeEventListener('dragenter', onDragEnter)
      document.removeEventListener('dragover', onDragOver)
      document.removeEventListener('dragleave', onDragLeave)
      document.removeEventListener('drop', onDrop)
      window.removeEventListener('dragend', onDragEnd)
    }
  }, [running, addAttachmentPath])

  const removeAttachment = useCallback((name: string): void => {
    setAttachments((prev) => prev.filter((file) => file.name !== name))
  }, [])

  const clearAttachments = useCallback((): void => {
    setAttachments([])
  }, [])

  return {
    attachments,
    adding,
    dragActive,
    addAttachmentPath,
    addFromDialog,
    removeAttachment,
    clearAttachments
  }
}
