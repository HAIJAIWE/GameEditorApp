import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'

import ChatMarkdown from './ChatMarkdown'

export interface DigitalMessageItemProps {
  role: 'user' | 'assistant'
  /** 消息原文；用户消息按纯文本渲染，助手消息走 markdown */
  text: string
  /** 流式中的半截文本：只渲染原文 + 光标，避免半截 markdown 闪格式 */
  streaming?: boolean
}

/**
 * 复制文本到剪贴板。
 *
 * 为什么要两级兜底：Electron 渲染进程在非安全上下文（file://、部分测试环境）里
 * `navigator.clipboard` 可能整个不存在，而 `writeText` 也可能因权限被拒；
 * 两者都失败时静默返回 false —— 复制失败不该打断对话，也不该弹错误。
 */
export async function copyToClipboard(text: string): Promise<boolean> {
  const clipboard = navigator.clipboard
  if (clipboard !== undefined && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text)
      return true
    } catch {
      // 落到 execCommand 兜底
    }
  }
  return copyWithExecCommand(text)
}

/** 旧式兜底：临时 textarea + execCommand('copy')，用完立刻摘除避免影响布局 */
function copyWithExecCommand(text: string): boolean {
  const textarea = document.createElement('textarea')
  textarea.value = text
  // 只读 + 移出视口：既保证可选中，又不让页面滚动位置跳一下
  textarea.setAttribute('readonly', '')
  textarea.style.position = 'fixed'
  textarea.style.top = '-1000px'
  textarea.style.opacity = '0'
  document.body.appendChild(textarea)
  try {
    textarea.select()
    return document.execCommand('copy')
  } catch {
    return false
  } finally {
    document.body.removeChild(textarea)
  }
}

function CopyIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <rect x="5.75" y="5.75" width="7.5" height="7.5" rx="1.5" stroke="currentColor" strokeWidth="1.2" />
      <path d="M10.25 3.75v-.5a1.5 1.5 0 0 0-1.5-1.5h-5a1.5 1.5 0 0 0-1.5 1.5v5a1.5 1.5 0 0 0 1.5 1.5h.5" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" />
    </svg>
  )
}

function CopiedIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M3.5 8.5 6.5 11.5 12.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

/**
 * 一条对话消息（移植 dsh `ui-chat` 的 MessageItem 排版取舍）。
 *
 * - 用户消息：右对齐实心 accent 气泡，宽度上限 82%；
 * - 助手消息：扁平正文，不套边框卡片，占满列宽；
 * - 两者底部都挂一行 hover / focus-within 才显形的纯图标动作。
 *
 * 动作按钮刻意不写可见文字：e2e 用 `filter({ hasText })` + `innerText()` 断言消息内容，
 * 任何标签文字都会污染断言，因此语义只走 `aria-label`。
 */
export function DigitalMessageItem({ role, text, streaming = false }: DigitalMessageItemProps): ReactElement {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  // 卸载时清掉「已复制」的回落定时器，避免对已卸载组件 setState
  useEffect(() => {
    return () => {
      if (resetTimer.current !== null) clearTimeout(resetTimer.current)
    }
  }, [])

  const handleCopy = useCallback(() => {
    void copyToClipboard(text).then((ok) => {
      if (!ok) return
      setCopied(true)
      if (resetTimer.current !== null) clearTimeout(resetTimer.current)
      resetTimer.current = setTimeout(() => setCopied(false), 1500)
    })
  }, [text])

  return (
    // 流式条目沿用旧 testid（e2e 按 digital-streaming 做 toContainText / toHaveCount(0)）
    <div
      className={`digital-message-item digital-message-item-${role}`}
      data-testid={streaming ? 'digital-streaming' : 'digital-message'}
      data-role={role}
    >
      {role === 'user' ? (
        <div className="digital-message-bubble">{text}</div>
      ) : (
        <div className="digital-message-body">
          {streaming ? text : <ChatMarkdown text={text} />}
          {streaming && <span className="digital-cursor" aria-hidden="true" />}
        </div>
      )}
      <div className="digital-message-actions">
        <button
          type="button"
          className="digital-message-action"
          data-testid="digital-message-copy"
          aria-label={copied ? '已复制' : '复制消息'}
          title={copied ? '已复制' : '复制消息'}
          onClick={handleCopy}
        >
          {copied ? <CopiedIcon /> : <CopyIcon />}
        </button>
      </div>
    </div>
  )
}

export default DigitalMessageItem
