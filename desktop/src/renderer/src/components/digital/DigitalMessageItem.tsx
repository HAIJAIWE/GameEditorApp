import { useCallback, useEffect, useRef, useState, type ReactElement } from 'react'

import ChatMarkdown from './ChatMarkdown'

export interface DigitalMessageItemProps {
  role: 'user' | 'assistant'
  /** 消息原文；用户消息按纯文本渲染，助手消息走 markdown */
  text: string
  /** 流式中的半截文本：只渲染原文 + 光标，避免半截 markdown 闪格式 */
  streaming?: boolean
  /**
   * 助手消息反馈提交（对齐 dsh `ui-message-feedback` 的 Like/Dislike）。
   * 传入才渲染反馈按钮；缺省时组件保持纯展示（其它用法不受影响）。
   * rating：5 = 有帮助，1 = 没帮助（与 `agent:feedback` 的 1–5 契约对齐）。
   */
  onFeedback?: (input: { rating: number; comment: string }) => Promise<void> | void
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

/** 大拇指（有帮助）。Lucide `thumbs-up` 路径，16px 视口。 */
function ThumbUpIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M7 10v12" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h2.76a2 2 0 0 0 1.79-1.11L12 2a3.13 3.13 0 0 1 3 3.88Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

/** 大拇指（没帮助）：镜像的 thumbs-down。 */
function ThumbDownIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" aria-hidden="true" focusable="false">
      <path d="M17 14V2" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      <path d="M9 18.12 10 14H4.17a2 2 0 0 1-1.92-2.56l2.33-8A2 2 0 0 1 6.5 2H20a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-2.76a2 2 0 0 0-1.79 1.11L12 22a3.13 3.13 0 0 1-3-3.88Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
    </svg>
  )
}

function CheckIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M3.5 8.5 6.5 11.5 12.5 5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}

function XIcon(): ReactElement {
  return (
    <svg width="16" height="16" viewBox="0 0 16 16" fill="none" aria-hidden="true" focusable="false">
      <path d="M4 4l8 8M12 4l-8 8" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  )
}

/** 有帮助 / 没帮助对应的 rating（与 `agent:feedback` 的 1–5 契约对齐） */
const RATING_UP = 5
const RATING_DOWN = 1

/**
 * 一条对话消息（移植 dsh `ui-chat` 的 MessageItem 排版取舍）。
 *
 * - 用户消息：右对齐实心 accent 气泡，宽度上限 82%；
 * - 助手消息：扁平正文，不套边框卡片，占满列宽；
 * - 两者底部都挂一行 hover / focus-within 才显形的纯图标动作。
 *
 * 动作按钮刻意不写可见文字：e2e 用 `filter({ hasText })` + `innerText()` 断言消息内容，
 * 任何标签文字都会污染断言，因此语义只走 `aria-label`。
 *
 * 助手消息额外挂 Like/Dislike（对齐 dsh `ui-message-feedback`）：点任一评分先展开一个
 * 可选的补充说明框，提交时走真实后端 `agent:feedback`（rating ≥4 且填了说明会提炼偏好）。
 */
export function DigitalMessageItem({
  role,
  text,
  streaming = false,
  onFeedback
}: DigitalMessageItemProps): ReactElement {
  const [copied, setCopied] = useState(false)
  const resetTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  /** 反馈表单：0 = 未打开；5/1 = 当前选中的评分 */
  const [feedbackRating, setFeedbackRating] = useState(0)
  const [feedbackComment, setFeedbackComment] = useState('')
  /** 已记录的评分（提交成功后按钮保持高亮） */
  const [recordedRating, setRecordedRating] = useState(0)
  const [feedbackBusy, setFeedbackBusy] = useState(false)
  const [feedbackError, setFeedbackError] = useState<string | null>(null)

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

  const openFeedback = useCallback((rating: number) => {
    setFeedbackRating(rating)
    setFeedbackError(null)
  }, [])

  const closeFeedback = useCallback(() => {
    setFeedbackRating(0)
    setFeedbackComment('')
    setFeedbackError(null)
  }, [])

  const submitFeedback = useCallback(() => {
    if (feedbackRating === 0 || onFeedback === undefined) return
    setFeedbackBusy(true)
    setFeedbackError(null)
    void Promise.resolve(onFeedback({ rating: feedbackRating, comment: feedbackComment.trim() }))
      .then(() => {
        setRecordedRating(feedbackRating)
        setFeedbackRating(0)
        setFeedbackComment('')
      })
      .catch(() => {
        setFeedbackError('反馈提交失败，请重试')
      })
      .finally(() => {
        setFeedbackBusy(false)
      })
  }, [feedbackRating, feedbackComment, onFeedback])

  const showFeedback = role === 'assistant' && !streaming && onFeedback !== undefined

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
        {showFeedback && (
          <>
            <button
              type="button"
              className="digital-message-action digital-message-feedback"
              data-testid="digital-feedback-up"
              data-active={recordedRating === RATING_UP ? 'true' : undefined}
              aria-label={recordedRating === RATING_UP ? '已标记有帮助' : '标记有帮助'}
              title={recordedRating === RATING_UP ? '已标记有帮助' : '标记有帮助'}
              onClick={() => openFeedback(RATING_UP)}
            >
              <ThumbUpIcon />
            </button>
            <button
              type="button"
              className="digital-message-action digital-message-feedback"
              data-testid="digital-feedback-down"
              data-active={recordedRating === RATING_DOWN ? 'true' : undefined}
              aria-label={recordedRating === RATING_DOWN ? '已标记没帮助' : '标记没帮助'}
              title={recordedRating === RATING_DOWN ? '已标记没帮助' : '标记没帮助'}
              onClick={() => openFeedback(RATING_DOWN)}
            >
              <ThumbDownIcon />
            </button>
          </>
        )}
      </div>
      {showFeedback && feedbackRating !== 0 && (
        // 补充说明框：可选。填了且评分 ≥4 时后端会把说明提炼成偏好（真实副作用）。
        // 收起时不渲染，故不会污染 e2e 对消息 innerText 的断言。
        <div className="digital-feedback-form" data-testid="digital-feedback-form">
          <textarea
            className="digital-feedback-comment"
            data-testid="digital-feedback-comment"
            rows={2}
            placeholder={
              feedbackRating === RATING_UP
                ? '哪里有帮助？（可选，会记成偏好）'
                : '哪里不对？（可选）'
            }
            value={feedbackComment}
            onChange={(event) => setFeedbackComment(event.target.value)}
          />
          <div className="digital-feedback-actions">
            <button
              type="button"
              className="digital-message-action"
              data-testid="digital-feedback-submit"
              aria-label="提交反馈"
              title="提交反馈"
              disabled={feedbackBusy}
              onClick={submitFeedback}
            >
              <CheckIcon />
            </button>
            <button
              type="button"
              className="digital-message-action"
              data-testid="digital-feedback-cancel"
              aria-label="取消"
              title="取消"
              onClick={closeFeedback}
            >
              <XIcon />
            </button>
          </div>
          {feedbackError !== null && (
            <div className="digital-feedback-error" data-testid="digital-feedback-error">
              {feedbackError}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

export default DigitalMessageItem
