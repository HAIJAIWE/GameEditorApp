import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { ScheduleStore, type ScheduleTask } from '../../src/main/agent/schedule/scheduleStore'

let dir = ''
let store: ScheduleStore

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mb-sched-'))
  store = new ScheduleStore(join(dir, 'schedule.json'))
})

afterEach(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true })
})

describe('ScheduleStore', () => {
  it('add 相对延迟并列出', () => {
    const before = Date.now()
    const task = store.add({ prompt: '喝水', delayMs: 60_000 })
    expect(task.prompt).toBe('喝水')
    expect(Date.parse(task.at)).toBeGreaterThanOrEqual(before + 59_000)
    expect(store.list()).toHaveLength(1)
  })

  it('add 绝对时间；非法 at 抛错；空 prompt 抛错', () => {
    expect(store.add({ prompt: 'x', at: '2026-12-01T09:00:00+08:00' }).at).toBe(
      new Date(Date.parse('2026-12-01T09:00:00+08:00')).toISOString()
    )
    expect(() => store.add({ prompt: 'x', at: '不是时间' })).toThrow()
    expect(() => store.add({ prompt: '  ', delayMs: 1000 })).toThrow()
    expect(() => store.add({ prompt: 'x' })).toThrow()
  })

  it('remove 命中/未命中', () => {
    const task = store.add({ prompt: 'a', delayMs: 1000 })
    expect(store.remove(task.id)).toBe(true)
    expect(store.remove(task.id)).toBe(false)
  })

  it('tick 一次性：到期通知一次并标记 firedAt', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    store.add({ prompt: '到点', at: past })
    const fired: ScheduleTask[] = []
    const now = Date.now()
    expect(store.tick(now, (t) => fired.push(t))).toHaveLength(1)
    expect(fired[0]?.prompt).toBe('到点')
    expect(store.list()[0]?.firedAt).toBeDefined()
    // 再 tick 不再触发
    expect(store.tick(now + 1000, (t) => fired.push(t))).toHaveLength(0)
  })

  it('tick 重复任务：推进 at、不置 firedAt', () => {
    const past = new Date(Date.now() - 1000).toISOString()
    const task = store.add({ prompt: '每分', at: past, repeatMs: 60_000 })
    const now = Date.now()
    expect(store.tick(now, () => undefined)).toHaveLength(1)
    const after = store.list().find((t) => t.id === task.id)
    expect(after?.firedAt).toBeUndefined()
    expect(Date.parse(after?.at ?? '')).toBeGreaterThan(now)
  })

  it('未到期不触发', () => {
    store.add({ prompt: '未来', delayMs: 60_000 })
    expect(store.tick(Date.now(), () => undefined)).toHaveLength(0)
  })
})
