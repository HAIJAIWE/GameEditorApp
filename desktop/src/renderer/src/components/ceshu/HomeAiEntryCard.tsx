import { useState } from 'react'
import type { KeyboardEvent } from 'react'

/** 首页 AI 入口卡属性 */
export interface HomeAiEntryCardProps {
  /** 用户点击发送 / 回车：参数已 trim，调用方负责组装引导前缀后再投给 AI 面板 */
  onSend: (text: string) => void
  /** AI 面板不可用时禁用输入与按钮 */
  disabled?: boolean
}

/**
 * 策划书首页「AI 入口卡」（对齐 PyQt `ui/ceshu/home_view.py` 的 `AiEntryCard`）。
 *
 * 结构：标题（加粗）+ 提示（自动换行）+ 一行「输入框 + 按钮」。
 * 交互：回车即发送（`returnPressed`）；按钮点击即发送；空文本忽略；
 * 中文输入法未确认（组合态）时按 Enter 只用于选词，不触发发送。
 * 注意：PyQt 无 form 语义，这里也刻意不使用 `<form>`，避免意外提交 / 刷新。
 */
export default function HomeAiEntryCard({ onSend, disabled = false }: HomeAiEntryCardProps) {
  const [draft, setDraft] = useState('')

  /** 发送：仅当 trim 后非空且未禁用时回调，并清空草稿（对齐 Python `_on_ai_send`） */
  const send = () => {
    const trimmed = draft.trim()
    if (trimmed === '' || disabled) return
    onSend(trimmed)
    setDraft('')
  }

  /** 回车发送；输入法组合态（isComposing）下跳过，避免选词误触发送 */
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key !== 'Enter') return
    if (event.nativeEvent.isComposing) return
    event.preventDefault()
    send()
  }

  return (
    <section className="home-ai-card" data-testid="home-ai-card">
      <h3 className="home-ai-title">✨ 和 AI 聊想法，自动生成策划书</h3>
      <p className="home-ai-hint">
        描述你想做的游戏（如「做个仙侠 RPG，3 种族 5 阵营，回合制战斗」），AI 会引导你完成策划书
      </p>
      <div className="home-ai-input-row">
        <input
          className="form-input home-ai-input"
          data-testid="home-ai-input"
          placeholder="输入你的游戏想法，回车发送给 AI..."
          value={draft}
          disabled={disabled}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
        />
        <button
          type="button"
          className="btn primary"
          data-testid="home-ai-send"
          disabled={disabled}
          onClick={send}
        >
          和 AI 对话
        </button>
      </div>
    </section>
  )
}
