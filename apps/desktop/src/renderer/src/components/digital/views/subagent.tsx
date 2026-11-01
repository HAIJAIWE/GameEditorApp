import { useState } from 'react'

import { useT } from '@mobai/client-ui'
import { LucideIcon } from '../../common'
import type { DigitalPanelState } from '@mobai/shared/agent/ui'

/**
 * 运行中子智能体的「继续对话」控件（Slice 40）：
 * 输入一条消息「插话」（push 进它的收件箱，子循环下一轮可见），或「停止」它（只停它自己）。
 * 自持输入状态，避免列表级状态与多条子智能体互相干扰。
 */
function SubagentControls({
  id,
  onSteer,
  onStop
}: {
  id: string
  onSteer: (id: string, content: string) => void
  onStop: (id: string) => void
}) {
  const t = useT()
  const [text, setText] = useState('')
  const submit = (): void => {
    const content = text.trim()
    if (content === '') return
    onSteer(id, content)
    setText('')
  }
  return (
    <div className="digital-subagent-controls" data-testid="digital-subagent-controls">
      <input
        className="form-input digital-subagent-input"
        data-testid="digital-subagent-input"
        placeholder={t('agent.subagent.steerPlaceholder')}
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
        }}
      />
      <button
        type="button"
        className="btn slim primary"
        data-testid="digital-subagent-send"
        disabled={text.trim() === ''}
        onClick={submit}
      >
        {t('agent.subagent.steer')}
      </button>
      <button type="button" className="btn slim" data-testid="digital-subagent-stop" onClick={() => onStop(id)}>
        {t('agent.subagent.stop')}
      </button>
    </div>
  )
}

/**
 * 子智能体列表（Slice 38 / 40）：本轮派出的子任务、状态与结果摘要；
 * 运行中的子智能体额外提供「插话 / 停止」（需传入 onSteer / onStop）。
 */
export function DigitalSubagentList({
  subagents,
  onSteer,
  onStop
}: {
  subagents: DigitalPanelState['subagents']
  onSteer?: (id: string, content: string) => void
  onStop?: (id: string) => void
}) {
  const t = useT()
  if (subagents.length === 0) return null
  return (
    <div className="digital-subagents" data-testid="digital-subagents">
      <div className="home-section-label">{t('agent.subagent.heading', { n: subagents.length })}</div>
      <ul className="digital-subagent-list">
        {subagents.map((sub) => (
          <li
            key={sub.id}
            className={`digital-subagent digital-subagent-${sub.status}`}
            data-testid="digital-subagent"
            data-status={sub.status}
          >
            <span className="digital-subagent-id">{sub.id}</span>
            <span className="digital-subagent-task">{sub.task}</span>
            <span className="item-meta">
              {sub.status === 'running' ? t('agent.subagent.running') : sub.status === 'done' ? <LucideIcon name="check" size={12} /> : <LucideIcon name="x" size={12} />}
            </span>
            {sub.result !== undefined && sub.result !== '' && (
              <div className="digital-subagent-result">{sub.result}</div>
            )}
            {sub.status === 'running' && onSteer !== undefined && onStop !== undefined && (
              <SubagentControls id={sub.id} onSteer={onSteer} onStop={onStop} />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
