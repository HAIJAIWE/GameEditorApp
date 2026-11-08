import { useState } from 'react'

import { useT } from '@mobai/client-ui'
import { type CeshuDocument } from '@mobai/shared/ceshu/reference'
import { displayFieldValue } from '@mobai/shared/ceshu/fields'
import { chapterDataForDoc, chapterFieldsForDoc, chapterLabelForDoc, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import {
  CESHU_AGENT_CONTEXT_LIMIT,
  CESHU_AGENT_GAME_PREFIX,
  CESHU_AGENT_PATCH_SYSTEM_PROMPT,
  CESHU_AGENT_SYSTEM_PROMPT,
  CESHU_AGENT_TRUNCATED_SUFFIX,
  CESHU_AGENT_UNTITLED,
  buildCeshuAgentPrompt,
  buildChapterContract
} from '@mobai/shared/ceshu/prompts'
import { parseCeshuPatch, type CeshuPatchItem } from '@mobai/shared/ceshu/data'
import type { MessageKey } from '@mobai/shared/i18n'
import { toErrorMessage } from '@mobai/shared/util/system'

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

const QUICK_PROMPTS: readonly MessageKey[] = ['agent.quick.risk', 'agent.quick.gameplay', 'agent.quick.art']

/** 整份策划书 → 紧凑上下文（只列已填字段，按章节分组）；提示词文本走 shared 常量，避免棘轮误判 */
function buildContext(doc: CeshuDocument, withContract: boolean): string {
  const meta = doc.meta as Record<string, unknown>
  const name = typeof meta.game_name === 'string' && meta.game_name !== '' ? meta.game_name : CESHU_AGENT_UNTITLED
  const type = typeof meta.game_type === 'string' ? meta.game_type : ''
  const lines = [`${CESHU_AGENT_GAME_PREFIX}${name}${type !== '' ? `（${type}）` : ''}`]
  /*
   * 「改文档 / 生成」模式：先下发字段契约（key / 类型 / 列 / 必填 / 要点），让模型知道
   * 「符合的文档」长什么样，而不是只看到已填值、靠 key 名去猜结构。放在已填内容之前，
   * 超长截断时优先保留——空文档正是最需要它的时刻。问答模式不下发（保持原有上下文体积）。
   */
  if (withContract) {
    const contract = buildChapterContract(doc, undefined, { maxChars: 3800 })
    if (contract !== '') lines.push('', contract)
  }
  // 直接遍历该文档可见章：应用档章不在 CHAPTER_KEYS 里，用「游戏全章表 ∩ visible」会把它们全丢掉。
  for (const chapter of visibleChaptersForDoc(doc)) {
    const fields = chapterFieldsForDoc(doc, chapter)
    const data = chapterDataForDoc(doc, chapter)
    const filled = fields
      .map((field) => ({ field, value: displayFieldValue(field, data[field.key]) }))
      .filter((item) => item.value !== '')
    if (filled.length === 0) continue
    lines.push('', `## ${chapterLabelForDoc(doc, chapter)}`)
    for (const item of filled) lines.push(`- ${item.field.label}：${item.value}`)
  }
  const text = lines.join('\n')
  return text.length > CESHU_AGENT_CONTEXT_LIMIT
    ? `${text.slice(0, CESHU_AGENT_CONTEXT_LIMIT)}${CESHU_AGENT_TRUNCATED_SUFFIX}`
    : text
}

export default function CeshuAgentPanel({
  doc,
  onApplyPatch
}: {
  doc: CeshuDocument
  onApplyPatch?: (items: CeshuPatchItem[]) => Promise<void>
}) {
  const t = useT()
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
      const context = buildContext(doc, patchMode)
      const system = patchMode ? CESHU_AGENT_PATCH_SYSTEM_PROMPT : CESHU_AGENT_SYSTEM_PROMPT
      const prompt = buildCeshuAgentPrompt(context, question)
      const result = await window.mbApi.llm.generate({ system, prompt })
      const reply = result.content ?? ''

      if (patchMode) {
        const parsed = parseCeshuPatch(reply, doc)
        if (parsed.items.length > 0) {
          setPendingPatch(parsed.items)
          setMessages((prev) => [
            ...prev,
            { role: 'assistant', text: t('agent.patchGenerated', { n: parsed.items.length }) }
          ])
        } else {
          setMessages((prev) => [...prev, { role: 'assistant', text: parsed.errors.join(t('agent.errorSeparator')) || t('agent.noPatch') }])
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
      setMessages((prev) => [...prev, { role: 'assistant', text: t('agent.applied') }])
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="agent-panel" data-testid="agent-panel">
      <div className="agent-header">
        <span>{t('agent.title')}</span>
        <label className="agent-mode">
          <input
            type="checkbox"
            data-testid="agent-patch-mode"
            checked={patchMode}
            onChange={(event) => setPatchMode(event.target.checked)}
          />
          {t('agent.patchMode')}
        </label>
      </div>
      <div className="agent-messages" data-testid="agent-messages">
        {messages.length === 0 ? (
          <div className="agent-empty">{t('agent.empty')}</div>
        ) : (
          messages.map((message, index) => (
            <div key={index} className={`agent-msg ${message.role}`}>
              {message.text}
            </div>
          ))
        )}
        {busy && <div className="agent-msg assistant">{t('agent.thinking')}</div>}
      </div>
      {pendingPatch !== null && (
        <button
          type="button"
          className="btn primary"
          data-testid="agent-apply-patch"
          disabled={busy}
          onClick={() => void apply()}
        >
          {t('agent.applyPatch', { n: pendingPatch.length })}
        </button>
      )}
      {error !== null && (
        <div className="form-error" data-testid="agent-error">
          {error}
        </div>
      )}
      <div className="agent-chips">
        {QUICK_PROMPTS.map((prompt) => (
          <button key={prompt} type="button" className="agent-chip" onClick={() => setInput(t(prompt))}>
            {t(prompt)}
          </button>
        ))}
      </div>
      <div className="agent-input-row">
        <input
          className="form-input"
          data-testid="agent-input"
          placeholder={t('agent.inputPlaceholder')}
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
          {t('agent.send')}
        </button>
      </div>
    </div>
  )
}
