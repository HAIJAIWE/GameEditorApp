import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

/** 事件流与最终结果（IPC 解包后） */
interface BrainEventShape {
  type: string
  tool?: string
  result?: string
  text?: string
  success?: boolean
}

interface AgentBrainApi {
  agent: {
    chat: (req: { input: string }) => Promise<{ text: string; events: BrainEventShape[]; completed: boolean }>
  }
  data: {
    createItem: (req: { type: string; data: Record<string, unknown> }) => Promise<{ id: string }>
  }
}

interface ChatBody {
  messages: Array<{ role: string; content?: string; tool_call_id?: string }>
  tools: Array<{ name: string }>
}

interface OllamaChatStub {
  host: string
  bodies: ChatBody[]
  close: () => Promise<void>
}

/**
 * 最小 Ollama `/api/chat` 桩服务：第 1 次请求返回一个 tool_call，第 2 次返回流式终稿。
 * 覆盖 A1-2 的「桩服务返回工具调用 → 断言 step 事件序列与最终文本」（W30 技法）。
 */
async function startOllamaChatStub(): Promise<OllamaChatStub> {
  const bodies: ChatBody[] = []
  let call = 0
  const lines = (rows: unknown[]): string => rows.map((row) => `${JSON.stringify(row)}\n`).join('')

  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          models: [
            { name: 'stub:latest', model: 'stub:latest', modified_at: '2026-01-01T00:00:00Z', size: 1, digest: 'stub' }
          ]
        })
      )
      return
    }
    if (req.method === 'POST' && req.url === '/api/chat') {
      let raw = ''
      req.on('data', (chunk: Buffer) => {
        raw += chunk.toString('utf-8')
      })
      req.on('end', () => {
        try {
          bodies.push(JSON.parse(raw) as ChatBody)
        } catch {
          bodies.push({ messages: [], tools: [] })
        }
        call += 1
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
        if (call === 1) {
          // 第一轮：要求调用工具
          res.end(
            lines([
              {
                model: 'stub:latest',
                created_at: '2026-01-01T00:00:00Z',
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [{ function: { name: 'system.game_data', arguments: { action: 'list_types' } } }]
                },
                done: false
              },
              {
                model: 'stub:latest',
                created_at: '2026-01-01T00:00:00Z',
                message: { role: 'assistant', content: '' },
                done: true,
                done_reason: 'stop'
              }
            ])
          )
          return
        }
        // 第二轮：流式终稿
        res.end(
          lines([
            {
              model: 'stub:latest',
              created_at: '2026-01-01T00:00:00Z',
              message: { role: 'assistant', content: '共' },
              done: false
            },
            {
              model: 'stub:latest',
              created_at: '2026-01-01T00:00:00Z',
              message: { role: 'assistant', content: ' 13 种数据类型' },
              done: false
            },
            {
              model: 'stub:latest',
              created_at: '2026-01-01T00:00:00Z',
              message: { role: 'assistant', content: '' },
              done: true,
              done_reason: 'stop'
            }
          ])
        )
      })
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end('{}')
  })

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    host: `http://127.0.0.1:${port}`,
    bodies,
    close: () =>
      new Promise<void>((resolve) => {
        server.close(() => resolve())
      })
  }
}

test('Agent Brain 循环：桩服务返回工具调用 → 执行工具 → 流式终稿', async () => {
  const stub = await startOllamaChatStub()
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-agent-brain-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: {
      ...process.env,
      MB_USER_DATA_DIR: userDataDir,
      MB_OLLAMA_HOST: stub.host,
      MB_OLLAMA_MODEL: 'stub:latest'
    }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    // 造一条数据，让后续工具执行有真实内容
    await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: AgentBrainApi }).mbApi
      await api.data.createItem({ type: 'role', data: { name: '法师' } })
    })

    const result = (await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: AgentBrainApi }).mbApi
      return api.agent.chat({ input: '帮我看看有哪些数据类型' })
    })) as { text: string; events: BrainEventShape[]; completed: boolean }

    // 终稿（两轮流式增量拼接）
    expect(result.completed).toBe(true)
    expect(result.text).toBe('共 13 种数据类型')

    // 事件序列：思考 → 流式 → 工具执行 → 第二轮思考 → 流式 → 终稿
    expect(result.events.map((event) => event.type)).toEqual([
      'step_start',
      'stream_done',
      'step_start',
      'step_done',
      'step_start',
      'stream_chunk',
      'stream_chunk',
      'stream_done',
      'done'
    ])
    expect(result.events[2]).toEqual({ type: 'step_start', order: 0, tool: '并行1工具' })
    const stepDone = result.events[3]
    expect(stepDone?.tool).toBe('system.game_data')
    expect(stepDone?.success).toBe(true)
    expect(stepDone?.result).toContain('可用数据类型（')
    expect(result.events.at(-1)).toEqual({ type: 'done', text: '共 13 种数据类型' })

    // 桩服务侧核对：第一轮带 tools 与系统提示词；第二轮回灌了 tool 结果
    expect(stub.bodies).toHaveLength(2)
    const first = stub.bodies[0]
    expect(first?.tools.map((tool) => tool.name).sort()).toEqual(['system.ceshu', 'system.game_data'])
    expect(first?.messages[0]?.role).toBe('system')
    expect(first?.messages[0]?.content).toContain('游戏策划 AI 助手')
    expect(first?.messages.some((message) => message.role === 'system' && message.content?.includes('## 规则'))).toBe(true)
    expect(first?.messages.at(-1)).toEqual({ role: 'user', content: '帮我看看有哪些数据类型' })

    const second = stub.bodies[1]
    const toolMessages = second?.messages.filter((message) => message.role === 'tool') ?? []
    expect(toolMessages).toHaveLength(1)
    expect(toolMessages[0]?.content).toContain('可用数据类型（')
    expect(toolMessages[0]?.tool_call_id).toBeTruthy()
  } finally {
    await app.close()
    await stub.close()
  }
})
