import { createServer, type IncomingMessage, type Server, type ServerResponse } from 'node:http'
import { afterEach, describe, expect, it } from 'vitest'

import { createRemoteSubAgentProvider } from '../../src/main/agent/subagent/subagentRemote'
import type { SubAgentTask } from '../../src/shared/agent/brain'

function makeTask(text: string): SubAgentTask {
  return {
    task: text,
    depth: 1,
    signal: new AbortController().signal,
    inbox: { push: () => undefined, drain: () => [] },
    sandboxPolicy: 'workspace-write'
  }
}

let server: Server | null = null

afterEach(async () => {
  if (server !== null) {
    await new Promise<void>((resolve) => server?.close(() => resolve()))
    server = null
  }
})

function startServer(handler: (req: IncomingMessage, res: ServerResponse) => void): Promise<string> {
  return new Promise((resolve) => {
    server = createServer(handler)
    server.listen(0, '127.0.0.1', () => {
      const address = server?.address()
      const port = typeof address === 'object' && address !== null ? address.port : 0
      resolve(`http://127.0.0.1:${port}/run`)
    })
  })
}

describe('远程子智能体 provider（Slice 33）', () => {
  it('POST {task,depth} → 取 {text}', async () => {
    let received = ''
    const url = await startServer((req, res) => {
      let body = ''
      req.on('data', (chunk: unknown) => {
        body += String(chunk)
      })
      req.on('end', () => {
        received = body
        res.setHeader('content-type', 'application/json')
        res.end(JSON.stringify({ text: '远程结果' }))
      })
    })

    const provider = createRemoteSubAgentProvider({ url })
    const outcome = await provider.run(makeTask('帮我查一下'))

    expect(outcome.success).toBe(true)
    expect(outcome.text).toBe('远程结果')
    expect(JSON.parse(received)).toMatchObject({ task: '帮我查一下', depth: 1 })
  })

  it('非 2xx → success=false，带状态码', async () => {
    const url = await startServer((_req, res) => {
      res.statusCode = 500
      res.end('boom')
    })

    const provider = createRemoteSubAgentProvider({ url })
    const outcome = await provider.run(makeTask('x'))

    expect(outcome.success).toBe(false)
    expect(outcome.text).toContain('HTTP 500')
  })
})
