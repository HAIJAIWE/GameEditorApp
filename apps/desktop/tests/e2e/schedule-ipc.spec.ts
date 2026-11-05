import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

interface ScheduleTaskShape {
  id: string
  prompt: string
  at: string
}

interface ScheduleApi {
  schedule: {
    list: () => Promise<{ tasks: ScheduleTaskShape[] }>
    remove: (req: { id: string }) => Promise<{ ok: boolean }>
  }
  agent: {
    executeTool: (req: {
      tool: string
      params: Record<string, unknown>
    }) => Promise<{ success: boolean; message: string; error?: string }>
  }
}

/**
 * 定时提醒的界面通道（`ui-schedule` 的本土移植）。
 *
 * 锁三件事：
 * 1. `schedule:list` / `schedule:remove` **真的注册了** —— UI 层对缺失通道是静默跳过的，
 *    单测全绿也可能整条链是死的，必须在这里显式验一次；
 * 2. 技能写入的提醒，IPC 读得到 —— 两者共用同一份 `<库>/schedule.json`
 *    （`ScheduleStore` 无内存缓存，这是并发安全的前提）；
 * 3. 删除后列表为空。
 */
test('定时提醒：技能写入 → IPC 可见 → 删除生效', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-schedule-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 初始为空（新库）
    const initial = await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: ScheduleApi }).mbApi
      return api.schedule.list()
    })
    expect(initial.tasks).toEqual([])

    // 走技能新增（与用户说「10 分钟后提醒我」同一条路径）
    const added = await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: ScheduleApi }).mbApi
      return api.agent.executeTool({
        tool: 'system.schedule',
        params: { action: 'add', prompt: '起来活动一下', delay_ms: 600_000 }
      })
    })
    expect(added.success, `技能执行失败：${added.error ?? added.message}`).toBe(true)

    // IPC 能读到技能写的那条（证明共用同一份文件，不是各存一份）
    const listed = await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: ScheduleApi }).mbApi
      return api.schedule.list()
    })
    expect(listed.tasks).toHaveLength(1)
    expect(listed.tasks[0]?.prompt).toBe('起来活动一下')

    // 删除后为空
    const id = listed.tasks[0]?.id ?? ''
    const removed = await window.evaluate(async (target) => {
      const api = (globalThis as unknown as { mbApi: ScheduleApi }).mbApi
      return api.schedule.remove({ id: target })
    }, id)
    expect(removed.ok).toBe(true)

    const after = await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: ScheduleApi }).mbApi
      return api.schedule.list()
    })
    expect(after.tasks).toEqual([])
  } finally {
    await app.close()
  }
})
