import { useState } from 'react'

import { CHAPTER_KEYS, CHAPTER_LABELS, type CeshuDocument } from '../../../shared/ceshu/reference/ceshuConstants'
import { CESHU_CHAPTER_FIELDS } from '../../../shared/ceshu/fields/ceshuFields'
import { displayFieldValue } from '../../../shared/ceshu/fields/ceshuFieldDisplay'
import { parseCeshuPatch, type CeshuPatchItem } from '../../../shared/ceshu/data/ceshuImportPatch'
import { visibleChaptersForDoc } from '../../../shared/ceshu/model/ceshuModel'
import { toErrorMessage } from '../../../shared/util/errors'

/**
 * 右栏智能体（三栏布局：左=产出物+大纲，中=工作区，右=智能体）。
 *
 * **上下文是整份策划书**（不绑当前章）——通用助手。
 * 两种模式：
 * - 问答（默认）：基于整份文档回答/给建议；
 * - 改文档：让 AI 只输出 JSON 补丁（`{"章节":{"字段":值}}`），解析后由调用方应用并落盘。
 */

interface ChatMessage {
  role: 'user' | 'assistant'
  text: string
}

const QUICK_PROMPTS = ['这游戏有什么风险？', '帮我补核心玩法', '给美术提需求']

const CONTEXT_LIMIT = 6000

function buildContext(doc: CeshuDocument): string {
  const meta = doc.meta as Record<string, unknown>
  const name = typeof meta.game_name === 'string' && meta.game_name !== '' ? meta.game_name : '未命名'
  const type = typeof meta.game_type === 'string' ? meta.game_type : ''
  const lines = [`游戏：${name}${type !== '' ? `（${type}）` : ''}`]
  const visible = new Set(visibleChaptersForDoc(doc))
  for (const chapter of CHAPTER_KEYS) {
    if (!visible.has(chapter)) continue
    const fields = CESHU_CHAPTER_FIELDS[chapter] ?? []
    const data = (doc[chapter] ?? {}) as Record<string, unknown>
    const filled = fields
      .map((field) => ({ field, value: displayFieldValue(field, data[field.key]) }))
      .filter((item) => item.value !== '')
    if (filled.length === 0) continue
    lines.push('', `## ${CHAPTER_LABELS[chapter]}`)
    for (const item of filled) lines.push(`- ${item.field.label}：${item.value}`)
  }
  const text = lines.join('\n')
  return text.length > CONTEXT_LIMIT ? `${text.slice(0, CONTEXT_LIMIT)}\n…（已截断）` : text
}

export default function CeshuAgentPanel({
  doc,
  onApplyPatch
}: {
  doc: CeshuDocument
  onApplyPatch?: (items: CeshuPatchItem[]) => Promise<void>
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [patchMode, setPatchMode] = useState(false)
  const [pendingPatch, setPendingPatch] = useState<CeshuPatchItem[] | null>(null)

  const send = async (): Promise<void> => {
    const question = input.trim()
    if (question === '' || busy) return
    setInput('')
    setError(null)
    setPendingPatch(null)
    setMessages((prev) => [...prev, { role: 'user', text: question }])
    setBusy(true)
    try {
      const context = buildContext(doc)
      const system = patchMode
        ? '你是游戏策划助手。用户要求修改策划书时，**只输出 JSON 补丁**，形如 {"章节key":{"字段key":值}}，只包含要改的字段；不要解释、不要代码块外文字。章节与字段 key 见上下文。'
        : '你是资深游戏策划助手。基于用户提供的整份策划书上下文回答问题和给建议；不要编造上下文里没有的设定，不确定就直说。回答简洁、分点、可落地。'
      const prompt = `【策划书上下文】\n${context}\n\n【用户】\n${question}`
      const result = await window.mbApi.llm.generate({ system, prompt })
      const reply = result.content ?? ''

      if (patchMode) {
        const parsed = parseCeshuPatch(reply, doc)
        if (parsed.items.length > 0) {
          setPendingPatch(parsed.items)
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', text: `已生成 ${parsed.items.length} 项修改，点「应用」写入。` }
          ])
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', text: parsed.errors.join('；') || '没有可应用的修改。' }])
        }
      } else {
        setMessages((prev) => [...prev, { role: 'assistant', text: reply }])
      }
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const apply = async (): Promise<void> => {
    if (pendingPatch === null || onApplyPatch === undefined) return
    setBusy(true)
    setError(null)
    try {
      await onApplyPatch(pendingPatch)
      setPendingPatch(null)
      setMessages((prev) => [...prev, { role: 'assistant', text: '已应用。' }])
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="agent-panel" data-testid="agent-panel">
      <div className="agent-header">
        <span>智能体</span>
        <label className="agent-mode">
          <input
            type="checkbox"
            data-testid="agent-patch-mode"
            checked={patchMode}
            onChange={(event) => setPatchMode(event.target.checked)}
          />
          改文档
        </label>
      </div>
      <div className="agent-messages" data-testid="agent-messages">
        {messages.length === 0 ? (
          <div className="agent-empty">和智能体对话（基于整份策划书）。勾「改文档」可让它出修改。</div>
        ) : (
          messages.map((message, index) => (
            <div key={index} className={`agent-msg ${message.role}`}>
              {message.text}
            </div>
          ))
        )}
        {busy && <div className="agent-msg assistant">思考中…</div>}
      </div>
      {pendingPatch !== null && (
        <button
          type="button"
          className="btn primary"
          data-testid="agent-apply-patch"
          disabled={busy}
          onClick={() => void apply()}
        >
          应用 {pendingPatch.length} 项修改
        </button>
      )}
      {error !== null && (
        <div className="form-error" data-testid="agent-error">
          {error}
        </div>
      )}
      <div className="agent-chips">
        {QUICK_PROMPTS.map((prompt) => (
          <button key={prompt} type="button" className="agent-chip" onClick={() => setInput(prompt)}>
            {prompt}
          </button>
        ))}
      </div>
      <div className="agent-input-row">
        <input
          className="form-input"
          data-testid="agent-input"
          placeholder="和智能体对话…"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') void send()
          }}
        />
        <button
          type="button"
          className="btn primary"
          data-testid="agent-send"
          disabled={busy || input.trim() === ''}
          onClick={() => void send()}
        >
          发送
        </button>
      </div>
    </div>
  )
}
