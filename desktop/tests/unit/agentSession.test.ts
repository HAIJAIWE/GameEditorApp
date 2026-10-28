import { mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AgentSessionStore } from '../../src/main/agent/sessionStore'
import {
  SESSION_CONTENT_LIMIT,
  SESSION_MAX_MESSAGES,
  buildSessionSnapshot,
  deriveTranscript,
  isSessionSnapshot,
  sessionInfoFromSnapshot,
  truncateSessionMessage
} from '../../src/shared/agent/session'

function makeDir(): string {
  return mkdtempSync(join(tmpdir(), 'mb-agent-session-'))
}

function userMessage(text: string, extra: Record<string, unknown> = {}): Record<string, unknown> {
  return { role: 'user', content: text, ...extra }
}

describe('会话快照纯逻辑', () => {
  it('超长 content 截断并带标记，短内容与其它键原样保留', () => {
    const long = 'x'.repeat(SESSION_CONTENT_LIMIT + 50)
    const truncated = truncateSessionMessage({ role: 'user', content: long, extra: 1 })
    expect(String(truncated.content)).toBe(`${'x'.repeat(SESSION_CONTENT_LIMIT)}\n[...截断 50 字符...]`)
    expect(truncated.role).toBe('user')
    expect(truncated.extra).toBe(1)

    const short = truncateSessionMessage({ role: 'assistant', content: '短' })
    expect(short.content).toBe('短')
    expect(SESSION_CONTENT_LIMIT).toBe(2000)
  })

  it('非字符串 content 不参与截断', () => {
    expect(truncateSessionMessage({ role: 'tool', content: 123 }).content).toBe(123)
    expect(truncateSessionMessage({ role: 'tool' }).content).toBeUndefined()
  })

  it('快照：meta 记全量条数，messages 只留最近 N 条', () => {
    const messages = Array.from({ length: SESSION_MAX_MESSAGES + 5 }, (_, index) => userMessage(`m${index}`))
    const snapshot = buildSessionSnapshot(messages, new Date(2026, 9, 4, 12, 30, 45))

    expect(SESSION_MAX_MESSAGES).toBe(50)
    expect(snapshot.meta.message_count).toBe(SESSION_MAX_MESSAGES + 5)
    expect(snapshot.meta.saved_at).toBe('2026-10-04 12:30:45')
    expect(snapshot.meta.timestamp).toBe(Math.floor(new Date(2026, 9, 4, 12, 30, 45).getTime() / 1000))
    expect(snapshot.messages).toHaveLength(SESSION_MAX_MESSAGES)
    expect(snapshot.messages[0]?.content).toBe('m5')
    expect(snapshot.messages.at(-1)?.content).toBe(`m${SESSION_MAX_MESSAGES + 4}`)
  })

  it('isSessionSnapshot / sessionInfoFromSnapshot', () => {
    expect(isSessionSnapshot({ meta: {}, messages: [] })).toBe(true)
    expect(isSessionSnapshot(null)).toBe(false)
    expect(isSessionSnapshot({ messages: [] })).toBe(false)
    expect(isSessionSnapshot({ meta: {}, messages: 'x' })).toBe(false)

    expect(sessionInfoFromSnapshot(null)).toEqual({ hasSession: false, messageCount: 0, savedAt: '' })
    const info = sessionInfoFromSnapshot(buildSessionSnapshot([userMessage('hi')]))
    expect(info.hasSession).toBe(true)
    expect(info.messageCount).toBe(1)
    expect(info.savedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })
})

describe('AgentSessionStore：落盘与读取', () => {
  it('save → 磁盘结构正确（meta + messages）且无 tmp 残留', async () => {
    const dir = makeDir()
    const store = new AgentSessionStore(dir)
    await store.save([userMessage('你好'), { role: 'assistant', content: '在的' }])

    const onDisk = JSON.parse(readFileSync(store.sessionFilePath, 'utf-8')) as {
      meta: { message_count: number }
      messages: Array<{ role: string }>
    }
    expect(onDisk.meta.message_count).toBe(2)
    expect(onDisk.messages.map((message) => message.role)).toEqual(['user', 'assistant'])
    expect(readdirSync(dir).filter((file) => file.endsWith('.tmp'))).toHaveLength(0)
  })

  it('readActive：文件不存在返 null；tryRestore 同样返 null', async () => {
    const store = new AgentSessionStore(makeDir())
    expect(store.readActive()).toBeNull()
    expect(store.tryRestore()).toBeNull()
    expect(store.info()).toEqual({ hasSession: false, messageCount: 0, savedAt: '' })
  })

  it('损坏文件：readActive 抛中文错误，tryRestore 容错返 null', async () => {
    const dir = makeDir()
    const store = new AgentSessionStore(dir)
    writeFileSync(store.sessionFilePath, '{不是 JSON', 'utf-8')
    expect(() => store.readActive()).toThrow('会话文件损坏（JSON 解析失败）')
    expect(store.tryRestore()).toBeNull()

    writeFileSync(store.sessionFilePath, JSON.stringify(['结构不对']), 'utf-8')
    expect(() => store.readActive()).toThrow('会话文件格式不正确')
    expect(store.tryRestore()).toBeNull()
  })

  it('空 messages 的合法快照视为无会话', async () => {
    const dir = makeDir()
    const store = new AgentSessionStore(dir)
    writeFileSync(store.sessionFilePath, JSON.stringify({ meta: { saved_at: 'x' }, messages: [] }), 'utf-8')
    expect(store.readActive()).not.toBeNull()
    expect(store.tryRestore()).toBeNull()
    expect(store.info().hasSession).toBe(false)
  })

  it('info：读取已保存会话的条数与保存时间', async () => {
    const dir = makeDir()
    const store = new AgentSessionStore(dir)
    await store.save([userMessage('a'), userMessage('b')])
    const info = store.info()
    expect(info.hasSession).toBe(true)
    expect(info.messageCount).toBe(2)
    expect(info.savedAt).toMatch(/^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/)
  })

  it('clear：删文件返回 true；文件不存在返回 false', async () => {
    const dir = makeDir()
    const store = new AgentSessionStore(dir)
    await store.save([userMessage('a')])
    expect(await store.clear()).toBe(true)
    expect(store.readActive()).toBeNull()
    expect(await store.clear()).toBe(false)
  })

  it('串行写队列：并发 save 后磁盘为最后一次结果，且无 tmp 残留', async () => {
    const dir = makeDir()
    const store = new AgentSessionStore(dir)
    await Promise.all([
      store.save([userMessage('第一次')]),
      store.save([userMessage('第二次'), userMessage('第二次-b')]),
      store.save([userMessage('第三次'), userMessage('第三次-b'), userMessage('第三次-c')])
    ])
    const snapshot = store.readActive()
    expect(snapshot?.meta.message_count).toBe(3)
    expect(snapshot?.messages[0]?.content).toBe('第三次')
    expect(readdirSync(dir).filter((file) => file.endsWith('.tmp'))).toHaveLength(0)
  })

  it('recordMetric：追加 JSONL', async () => {
    const dir = makeDir()
    const store = new AgentSessionStore(dir)
    await store.recordMetric('chat', { iterations: 2 })
    await store.recordMetric('tool', { tool: 'system.game_data' })

    const lines = readFileSync(join(dir, 'metrics.jsonl'), 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(2)
    const first = JSON.parse(lines[0] as string) as Record<string, unknown>
    expect(first.type).toBe('chat')
    expect(first.iterations).toBe(2)
    expect(typeof first.timestamp).toBe('number')
    expect((JSON.parse(lines[1] as string) as Record<string, unknown>).tool).toBe('system.game_data')
  })
})

describe('事件日志 append-only（Slice 29）', () => {
  it('recordEvents 追加 JSONL：每轮一行、只追加不覆盖', async () => {
    const store = new AgentSessionStore(makeDir())
    await store.recordEvents([{ type: 'step_start', tool: 'x' }], { sessionId: 's1' })
    await store.recordEvents([{ type: 'done', text: 'ok' }], { sessionId: 's1' })

    const lines = readFileSync(store.eventsFilePath, 'utf-8').trim().split('\n')
    expect(lines).toHaveLength(2)
    const first = JSON.parse(lines[0] as string) as {
      type: string
      sessionId: string
      events: unknown[]
    }
    expect(first.type).toBe('run_events')
    expect(first.sessionId).toBe('s1')
    expect(first.events).toEqual([{ type: 'step_start', tool: 'x' }])
  })

  it('空事件不写行（不产生空日志文件）', async () => {
    const store = new AgentSessionStore(makeDir())
    await store.recordEvents([], { sessionId: 's1' })
    expect(() => readFileSync(store.eventsFilePath, 'utf-8')).toThrow()
  })
})

describe('事件日志回放（Slice 32）', () => {
  it('readEvents 按 sessionId 过滤 + deriveTranscript 派生可读轨迹', async () => {
    const store = new AgentSessionStore(makeDir())
    await store.recordEvents(
      [
        { type: 'turn_stats', turn: 0 },
        { type: 'step_done', tool: 'system.ceshu', result: '已保存' },
        { type: 'done', text: '完成' }
      ],
      { sessionId: 's1' }
    )
    await store.recordEvents([{ type: 'done', text: '别的会话' }], { sessionId: 's2' })

    const runs = store.readEvents('s1')
    expect(runs).toHaveLength(1)
    const transcript = deriveTranscript(runs)
    expect(transcript).toContain('第 1 轮')
    expect(transcript).toContain('工具 system.ceshu：已保存')
    expect(transcript).toContain('最终答复：完成')
    expect(transcript).not.toContain('别的会话')
  })

  it('readEvents 文件不存在 → 空数组（不抛）', () => {
    const store = new AgentSessionStore(makeDir())
    expect(store.readEvents('x')).toEqual([])
  })
})
