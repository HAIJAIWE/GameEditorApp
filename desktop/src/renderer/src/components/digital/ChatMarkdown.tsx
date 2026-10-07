import { memo, type ReactElement } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'

export interface ChatMarkdownProps {
  /** 待渲染的 markdown 源文本（与 Python `chat_renderer.render_markdown` 入参同语义） */
  text: string
  /** 附加到外层容器的类名（气泡内布局由 `.markdown-body` 控制；通常留空） */
  className?: string
}

/**
 * 数字员工气泡的 markdown 渲染器（对齐 Python `ui/chat_renderer.py::render_markdown`）。
 *
 * ## 插件映射（Python 扩展 → TS 插件）
 * - `codehilite` + `fenced_code` → `rehype-highlight`（highlight.js 语法高亮 + ``` 围栏）
 * - `tables` + `sane_lists` → `remark-gfm`（GFM 表格 / 任务列表 / 删除线）
 * - `nl2br` → `remark-breaks`（单换行转 `<br>`）
 *
 * ## 刻意偏离 Python
 * Python 的 `render_markdown` 有 `try/except` 兜底（异常时 `html.escape + <br>`）。
 * `react-markdown` 自身对畸形输入**容错**（不会抛到渲染层），且其产物是 React 元素而非原始 HTML 字符串，
 * 没有 XSS 风险（不会像 Python 那样把未转义内容插进 DOM），故**无需错误边界**。
 *
 * 空文本返回 `null`，让发空消息时气泡不渲染任何子节点。
 */
function ChatMarkdownImpl({ text, className }: ChatMarkdownProps): ReactElement | null {
  if (!text) return null
  const containerClass = className !== undefined && className !== '' ? `markdown-body ${className}` : 'markdown-body'
  return (
    <div className={containerClass}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm, remarkBreaks]}
        rehypePlugins={[rehypeHighlight]}
        components={{
          // 链接强制新标签打开 + 防反向劫持；`node` 不是合法 DOM 属性，必须解构掉（改名 `_node` 以过 unused-vars）
          a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />
        }}
      >
        {text}
      </ReactMarkdown>
    </div>
  )
}

const ChatMarkdown = memo(ChatMarkdownImpl)
ChatMarkdown.displayName = 'ChatMarkdown'

export default ChatMarkdown
