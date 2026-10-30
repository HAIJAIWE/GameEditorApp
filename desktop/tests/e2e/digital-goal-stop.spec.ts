import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * 本轮目标条（GoalBar）+ 「停止」二次确认（两段式 kill）。
 *
 * 两个能力都是「诚实做」：目标随每次发送进系统提示词（后端真消费），
 * 停止二次确认走既有的真实取消链路（task.cancel）——不是假按钮。
 */

interface OllamaBody {
  messages: Array<{ role: string; content?: string }>
}
interface OllamaStub {
  host: string
  bodies: OllamaBody[]
  close: () => Promise<void>
}

/** 首帧直接回流式终稿（一行结束，便于断言「目标进了系统提示词」） */
function startFinalStub(finalText: string): Promise<OllamaStub> {
  const bodies: OllamaBody[] = []
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          models: [{ name: 'stub:latest', model: 'stub:latest', modified_at: '2026-01-01T00:00:00Z', size: 1, digest: 'stub' }]
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
          bodies.push(JSON.parse(raw) as OllamaBody)
        } catch {
          bodies.push({ messages: [] })
        }
        const lines = (rows: unknown[]): string => rows.map((row) => `${JSON.stringify(row)}\n`).join('')
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
        res.end(
          lines([
            { model: 'stub:latest', created_at: '2026-01-01T00:00:00Z', message: { role: 'assistant', content: finalText }, done: false },
            { model: 'stub:latest', created_at: '2026-01-01T00:00:00Z', message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }
          ])
        )
      })
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end('{}')
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        host: `http://127.0.0.1:${port}`,
        bodies,
        close: () =>
          new Promise<void>((resolveClose) => {
            server.close(() => resolveClose())
          })
      })
    })
  })
}

/** 首帧延迟 4s 回工具调用，给「停止」二次确认留足点击窗口；第二帧回终稿 */
function startStopStub(): Promise<OllamaStub> {
  const bodies: OllamaBody[] = []
  let call = 0
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          models: [{ name: 'stub:latest', model: 'stub:latest', modified_at: '2026-01-01T00:00:00Z', size: 1, digest: 'stub' }]
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
          bodies.push(JSON.parse(raw) as OllamaBody)
        } catch {
          bodies.push({ messages: [] })
        }
        call += 1
        const lines = (rows: unknown[]): string => rows.map((row) => `${JSON.stringify(row)}\n`).join('')
        if (call === 1) {
          // 故意延迟 4s：保持运行态，让测试能在窗口内完成两次点击
          setTimeout(() => {
            res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
            res.end(
              lines([
                {
                  model: 'stub:latest',
                  created_at: '2026-01-01T00:00:00Z',
                  message: { role: 'assistant', content: '', tool_calls: [{ function: { name: 'system.game_data', arguments: { action: 'list_types' } } }] },
                  done: false
                },
                { model: 'stub:latest', created_at: '2026-01-01T00:00:00Z', message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }
              ])
            )
          }, 4000)
          return
        }
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
        res.end(
          lines([
            { model: 'stub:latest', created_at: '2026-01-01T00:00:00Z', message: { role: 'assistant', content: '完成' }, done: false },
            { model: 'stub:latest', created_at: '2026-01-01T00:00:00Z', message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }
          ])
        )
      })
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end('{}')
  })
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const address = server.address()
      const port = typeof address === 'object' && address ? address.port : 0
      resolve({
        host: `http://127.0.0.1:${port}`,
        bodies,
        close: () =>
          new Promise<void>((resolveClose) => {
            server.close(() => resolveClose())
          })
      })
    })
  })
}

test('本轮目标条：可编辑，且随发送注入系统提示词的「【本轮目标】」段', async () => {
  const stub = await startFinalStub('收到')
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-goal-'))
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: stub.host, MB_OLLAMA_MODEL: 'stub:latest' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    const goalInput = window.getByTestId('digital-goal-input')
    await expect(goalInput).toBeVisible()
    // 目标条可编辑（对齐 dsh GoalBar 内联输入）
    await goalInput.fill('把战斗公式收敛到 3 个可调参数')

    const input = window.getByTestId('digital-input')
    await input.fill('开始')
    await window.getByTestId('digital-send').click()

    // 主进程首帧请求携带目标：桩侧首条请求的系统提示词应含目标段
    await expect
      .poll(() => stub.bodies.length, { timeout: 20000 })
      .toBeGreaterThanOrEqual(1)
    const sysText = stub.bodies[0]?.messages
      .filter((message) => message.role === 'system')
      .map((message) => message.content ?? '')
      .join('\n')
    expect(sysText).toContain('【本轮目标】')
    expect(sysText).toContain('把战斗公式收敛到 3 个可调参数')
  } finally {
    await app.close()
    await stub.close()
  }
})

test('「停止」二次确认：第一次点进入确认态（data-armed=true），第二次点真正停止本轮', async () => {
  const stub = await startStopStub()
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-stop-'))
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: stub.host, MB_OLLAMA_MODEL: 'stub:latest' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    const input = window.getByTestId('digital-input')
    await input.fill('开始')
    await window.getByTestId('digital-send').click()

    const stop = window.getByTestId('digital-stop')
    // 进入运行态：停止按钮出现
    await expect(stop).toBeVisible({ timeout: 15000 })
    await expect(stop).toHaveAttribute('data-armed', 'false')

    // 第一次点：只 arm（对齐 dsh 两段式 kill 的「先确认」）
    await stop.click()
    await expect(stop).toHaveAttribute('data-armed', 'true', { timeout: 5000 })

    // 第二次点：走真实取消链路（task.cancel），本轮结束 → 停止按钮消失
    await stop.click()
    await expect(stop).toBeHidden({ timeout: 15000 })
  } finally {
    await app.close()
    await stub.close()
  }
})
