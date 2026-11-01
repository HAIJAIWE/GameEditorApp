import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createScheduleSkill } from '@mobai/agent-core/skills/scheduleSkill'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mb-schedskill-'))
})

afterEach(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true })
})

type R = { success: boolean; message: string; error?: string; data?: unknown }

function skill() {
  const s = createScheduleSkill({ filePath: join(dir, 'schedule.json') })
  return (params: Record<string, unknown>): Promise<R> => s.execute(params, {}) as Promise<R>
}

describe('system.schedule（提醒子集）', () => {
  it('add → list → remove', async () => {
    const run = skill()
    const added = await run({ action: 'add', prompt: '开会', delay_ms: 60_000 })
    expect(added.success).toBe(true)
    const id = (added.data as { task: { id: string } }).task.id

    const listed = await run({ action: 'list' })
    expect(listed.message).toContain('开会')

    expect((await run({ action: 'remove', id })).success).toBe(true)
    const after = await run({ action: 'list' })
    expect(after.message).toContain('没有定时提醒')
  })

  it('add 支持 cron 表达式', async () => {
    const result = await skill()({ action: 'add', prompt: '每5分', cron: '*/5 * * * *' })
    expect(result.success).toBe(true)
    expect((result.data as { task: { cron: string } }).task.cron).toBe('*/5 * * * *')
  })

  it('list 空', async () => {
    expect((await skill()({ action: 'list' })).message).toContain('没有定时提醒')
  })

  it('add 缺时间 → EADD', async () => {
    const result = await skill()({ action: 'add', prompt: 'x' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EADD')
  })

  it('remove 不存在 → ENOTFOUND', async () => {
    expect((await skill()({ action: 'remove', id: 'nope' })).error).toBe('ENOTFOUND')
  })

  it('未知 action → EBADACTION', async () => {
    expect((await skill()({ action: 'frob' })).error).toBe('EBADACTION')
  })
})
