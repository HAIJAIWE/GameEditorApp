import { fileURLToPath } from 'node:url'

import { describe, expect, it } from 'vitest'

import { createAcpSubAgentProvider } from '@mobai/agent-core/subagent/subagentAcp'
import type { SubAgentTask } from '@mobai/shared/agent/brain'

function makeTask(text: string, sandboxPolicy: SubAgentTask['sandboxPolicy'] = 'workspace-write'): SubAgentTask {
  return {
    task: text,
    depth: 1,
    signal: new AbortController().signal,
    inbox: { push: () => undefined, drain: () => [] },
    sandboxPolicy
  }
}

const fixture = fileURLToPath(new URL('../fixtures/fake-acp-agent.mjs', import.meta.url))

describe('ACP 子智能体 provider（Slice 36）', () => {
  it('initialize → session/new → prompt：收集 agent_message_chunk 文本', async () => {
    const provider = createAcpSubAgentProvider({ command: process.execPath, args: [fixture] })
    const outcome = await provider.run(makeTask('你好'))

    expect(outcome.success).toBe(true)
    expect(outcome.text).toBe('ACP 回答')
  })

  it('沙箱 read-only → 拒绝运行', async () => {
    const provider = createAcpSubAgentProvider({ command: process.execPath, args: [fixture] })
    const outcome = await provider.run(makeTask('x', 'read-only'))

    expect(outcome.success).toBe(false)
    expect(outcome.text).toContain('read-only')
  })
})
