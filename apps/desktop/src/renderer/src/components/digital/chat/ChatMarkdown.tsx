import { createContext, memo, useContext, type ReactElement, type ReactNode } from 'react'

import { useT } from '@mobai/client-ui'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import remarkBreaks from 'remark-breaks'
import rehypeHighlight from 'rehype-highlight'

export interface ChatMarkdownProps {
  /** 待渲染的 markdown 源文本 */
  text: string
  /** 附加到外层容器的类名（气泡内布局由 `.markdown-body` 控制；通常留空） */
  className?: string
  /**
   * 打开一个文件（对齐 dsh `ui-deliverables` 的「正文内联文件引用可点开」）。
   * 传入时，正文里**像文件路径**的内联代码会变成可点链接；缺省则按普通内联代码渲染。
   */
  onOpenFile?: (path: string) => void
}

/** 当前是否位于 ``` 围栏代码块内（围栏内不做路径链接化，避免把代码内容当路径） */
const InFenceContext = createContext(false)
/** 打开文件回调（经 context 下发，使渲染组件保持模块级稳定、不因 props 变化重挂） */
const OnOpenFileContext = createContext<((path: string) => void) | null>(null)

/**
 * 内联代码是否「像文件路径」：含分隔符 + 已知代码扩展名 + 单行且不太长。
 * 刻意保守——宁可不链接，也不把普通词条变成链接。
 */
const FILE_PATH_PATTERN =
  /(^|[/\\])[\w.-]+\.(tsx?|jsx?|mjs|cjs|json|mdx?|css|scss|less|html?|py|lua|sh|ya?ml|toml|ini|txt|csv|xml|sql|go|rs|java|kt|c|cc|cpp|h|hpp)$/i

function looksLikeFilePath(text: string): boolean {
  const value = text.trim()
  if (value === '' || value.length > 200 || value.includes('\n')) return false
  if (!value.includes('/') && !value.includes('\\')) return false
  return FILE_PATH_PATTERN.test(value)
}

/** 围栏代码块：标记子节点「在围栏内」，并保持默认 `<pre>` 排版 */
function PreRenderer({ node: _node, children }: { node?: unknown; children?: ReactNode }): ReactElement {
  return (
    <pre>
      <InFenceContext.Provider value={true}>{children}</InFenceContext.Provider>
    </pre>
  )
}

/** 代码节点：围栏内照旧渲染 `<code>`；正文内联且像路径时渲染成可点链接 */
function CodeRenderer({
  node: _node,
  className,
  children
}: {
  node?: unknown
  className?: string
  children?: ReactNode
}): ReactElement {
  const t = useT()
  const inFence = useContext(InFenceContext)
  const onOpenFile = useContext(OnOpenFileContext)
  const text = String(children).replace(/\n$/, '')
  if (!inFence && onOpenFile !== null && looksLikeFilePath(text)) {
    return (
      <button
        type="button"
        className="chat-file-link"
        data-testid="chat-file-link"
        title={t('agent.chat.openInCode', { path: text })}
        onClick={() => onOpenFile(text)}
      >
        {text}
      </button>
    )
  }
  return <code className={className}>{children}</code>
}

/**
 * 数字员工气泡的 markdown 渲染器。
 *
 * ## 插件映射
 * - `codehilite` + `fenced_code` → `rehype-highlight`（highlight.js 语法高亮 + ``` 围栏）
 * - `tables` + `sane_lists` → `remark-gfm`（GFM 表格 / 任务列表 / 删除线）
 * - `nl2br` → `remark-breaks`（单换行转 `<br>`）
 *
 * ## 刻意偏离 旧版
 * 旧版 的 `render_markdown` 有 `try/except` 兜底（异常时 `html.escape + <br>`）。
 * `react-markdown` 自身对畸形输入**容错**（不会抛到渲染层），且其产物是 React 元素而非原始 HTML 字符串，
 * 没有 XSS 风险，故**无需错误边界**。
 *
 * 空文本返回 `null`，让发空消息时气泡不渲染任何子节点。
 */
function ChatMarkdownImpl({ text, className, onOpenFile }: ChatMarkdownProps): ReactElement | null {
  if (!text) return null
  const containerClass = className !== undefined && className !== '' ? `markdown-body ${className}` : 'markdown-body'
  return (
    <div className={containerClass}>
      <OnOpenFileContext.Provider value={onOpenFile ?? null}>
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkBreaks]}
          rehypePlugins={[rehypeHighlight]}
          components={{
            // 链接强制新标签打开 + 防反向劫持；`node` 不是合法 DOM 属性，必须解构掉（改名 `_node` 以过 unused-vars）
            a: ({ node: _node, ...props }) => <a {...props} target="_blank" rel="noopener noreferrer" />,
            code: CodeRenderer,
            pre: PreRenderer
          }}
        >
          {text}
        </ReactMarkdown>
      </OnOpenFileContext.Provider>
    </div>
  )
}

const ChatMarkdown = memo(ChatMarkdownImpl)
ChatMarkdown.displayName = 'ChatMarkdown'

export default ChatMarkdown
