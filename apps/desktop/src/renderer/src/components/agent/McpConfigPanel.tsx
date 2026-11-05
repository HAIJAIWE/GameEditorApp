import { useEffect, useState } from 'react'

import { useT } from '@mobai/client-ui'

import { PanelShell } from '../common'

/**
 * MCP 配置面板（Slice 20）：编辑 `userData/mcp.json` 的原始 JSON，保存后主进程写盘并**重连**。
 *
 * 用「JSON 文本框」而不是结构化表单：MCP 配置形态简单（`mcpServers` 映射），
 * 文本框零学习成本、支持任意字段（stdio/http/risk），也便于用户从别处（如 dsh）整段粘贴。
 */
export default function McpConfigPanel({ onClose }: { onClose: () => void }) {
  const t = useT()
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
        setError(result.error ?? t('mcpConfig.saveFailed'))
      } else {
        setNotice(t('mcpConfig.saved', { count: result.count ?? 0 }))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelShell
      testId="mcp-config-panel"
      toolbar={<span className="item-meta">{t('mcpConfig.subtitle')}</span>}
      footer={
        <>
          <button type="button" className="btn" data-testid="mcp-config-close" onClick={onClose}>
            {t('common.close')}
          </button>
          <button
            type="button"
            className="btn primary"
            data-testid="mcp-config-save"
            disabled={busy}
            onClick={() => void handleSave()}
          >
            {t('mcpConfig.save')}
          </button>
        </>
      }
    >
        <div className="item-meta">
          {t('mcpConfig.hint', {
            stdio: '{ "command": "npx", "args": ["-y", "some-mcp-server"] }',
            http: '{ "url": "https://…", "headers": {…} }',
            empty: '{ "mcpServers": {} }',
            maxTools: '"maxTools": 24'
          })}
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
    </PanelShell>
  )
}
