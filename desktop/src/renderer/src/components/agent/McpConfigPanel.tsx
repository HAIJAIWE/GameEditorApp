import { useEffect, useState } from 'react'

/**
 * MCP 配置面板（Slice 20）：编辑 `userData/mcp.json` 的原始 JSON，保存后主进程写盘并**重连**。
 *
 * 用「JSON 文本框」而不是结构化表单：MCP 配置形态简单（`mcpServers` 映射），
 * 文本框零学习成本、支持任意字段（stdio/http/risk），也便于用户从别处（如 dsh）整段粘贴。
 */
export default function McpConfigPanel({ onClose }: { onClose: () => void }) {
  const [content, setContent] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.mbApi.mcp
      .getConfig()
      .then((result) => {
        if (alive) setContent(result.content)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
  }, [])

  const handleSave = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const result = await window.mbApi.mcp.setConfig({ content })
      if (!result.ok) {
        setError(result.error ?? '保存失败')
      } else {
        setNotice(`已保存并重连：${result.count ?? 0} 个 MCP 服务器`)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="editor" data-testid="mcp-config-panel">
      <div className="editor-header">
        <div className="editor-title">
          MCP 配置
          <small>编辑 userData/mcp.json（stdio: command/args/env；http: url/headers；可选 risk）</small>
        </div>
        <button type="button" className="btn slim" data-testid="mcp-config-close" onClick={onClose}>
          关闭
        </button>
      </div>
      <div className="editor-body">
        <div className="item-meta">
          保存后会自动重连。示例：stdio 用 {'{ "command": "npx", "args": ["-y", "某个-mcp-server"] }'}；
          远程用 {'{ "url": "https://…", "headers": {…} }'}。没有服务器就留 {'{ "mcpServers": {} }'}。
          工具多了可在顶层加 {'"maxTools": 24'} 调高工具面上限（默认本地 8 / 云端 15）。
        </div>
        <textarea
          className="form-textarea"
          data-testid="mcp-config-text"
          rows={18}
          spellCheck={false}
          value={content}
          onChange={(event) => {
            setContent(event.target.value)
            setNotice(null)
          }}
        />
        {error !== null && (
          <div className="form-error" data-testid="mcp-config-error">
            {error}
          </div>
        )}
        {notice !== null && (
          <div className="notice-banner" data-testid="mcp-config-notice">
            {notice}
          </div>
        )}
        <div className="field-action-strip-actions">
          <button
            type="button"
            className="btn primary"
            data-testid="mcp-config-save"
            disabled={busy}
            onClick={() => void handleSave()}
          >
            保存并重连
          </button>
        </div>
      </div>
    </div>
  )
}
