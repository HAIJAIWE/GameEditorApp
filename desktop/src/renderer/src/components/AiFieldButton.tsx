/**
 * 表单旁的「AI 帮我填」按钮（迁移自 Python `ui/ceshu/ai_field_button.py::AIFieldButton`，78 行）。
 *
 * ## 对齐 Python 的两个行为（都是防呆，不是装饰）
 * 1. **防重入**：busy 时点击直接忽略（`Python: if self._busy: return`），
 *    否则连点会并发发出多次 LLM 请求（每次都烧 token）。
 * 2. **60 秒安全兜底**：Python 用 `QTimer.singleShot(60_000)` 在到点时强制解除 busy。
 *    ⚠️ 这不是"优化"而是**必需**：若上层回调因异常未落地（IPC 挂住 / 抛错没接住），
 *    按钮会**永久禁用**，用户除了重启应用别无他法。
 *
 * ## 有意偏离（Python → TS）
 * - 状态**由父组件持有**（`busy` 是 prop），本组件是纯展示件。
 *   Python 把 `_busy` 存在按钮自己身上、由外部调用 `set_busy(False)` 复位；
 *   React 里"谁发起请求谁持有状态"更不容易漏复位（对齐 `gameStyle.ts` 的无模块级可变状态约定）。
 *   ⇒ 60 秒兜底随之**上移到发起方**（`ChapterForm`），见那里的 `AI_FIELD_SAFETY_MS`。
 * - 尺寸/配色交给 CSS（`.ai-field-btn`），不内联样式（对齐项目既有做法）。
 */
interface AiFieldButtonProps {
  /** 是否正在生成（禁用 + 提示文案切换） */
  busy: boolean
  /** 点击回调；busy / disabled 时不会被调用（防重入由本组件保证） */
  onFill: () => void
  /** 所属字段名，用于无障碍标签与悬浮提示 */
  fieldLabel: string
  /** 该字段是否禁止 AI 起草（「人定」字段）；禁用时点击无效 */
  disabled?: boolean
  /** 禁用时的悬浮说明 */
  disabledHint?: string
}

export function AiFieldButton({ busy, onFill, fieldLabel, disabled = false, disabledHint }: AiFieldButtonProps) {
  const blocked = busy || disabled
  const title = busy
    ? 'AI生成中，请稍候...'
    : disabled
      ? (disabledHint ?? '该字段不可由 AI 起草')
      : `AI帮我填：${fieldLabel}`
  return (
    <button
      type="button"
      className={`ai-field-btn${busy ? ' busy' : ''}`}
      data-testid="ai-field-btn"
      data-busy={busy ? 'true' : 'false'}
      data-disabled={disabled ? 'true' : 'false'}
      disabled={blocked}
      // 中文文案与 Python 保持一致（"AI帮我填" / "AI生成中，请稍候..."）
      title={title}
      aria-label={title}
      onClick={() => {
        if (blocked) return // 防重入 / 人定字段不交给 AI
        onFill()
      }}
    >
      {busy ? '…' : 'AI'}
    </button>
  )
}
