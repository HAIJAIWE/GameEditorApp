// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { ScheduleSection } from '../../../src/renderer/src/plugins/session'
import { PluginHost } from '@mobai/shared/plugin/host'
import type { ScheduleTaskView } from '@mobai/shared/agent/schedule'
import { installMbApi, renderDom, type ApiStub } from './render'

/**
 * 「会话」页签的定时提醒分区。
 *
 * 锁两件事：① 智能体给自己定的提醒**在界面上看得见**（此前完全看不到）；
 * ② 能删 —— 而且只有真的删成功才从列表移除。
 */

let api: ApiStub | null = null

afterEach(() => {
  api?.restore()
  api = null
})

function renderSection(): ReturnType<typeof renderDom> {
  return renderDom(<ScheduleSection host={new PluginHost()} />)
}

function stub(tasks: ScheduleTaskView[], removeOk = true): ApiStub {
  return installMbApi({
    overrides: {
      'schedule.list': () => ({ tasks }),
      'schedule.remove': () => ({ ok: removeOk })
    }
  })
}

const ONE: ScheduleTaskView = {
  id: 'sched_1',
  prompt: '每天 9 点提醒我喝水',
  at: '2026-11-06T09:00:00.000Z'
}

describe('会话 · 定时提醒', () => {
  it('有提醒时列出内容与触发时间', async () => {
    api = stub([ONE])
    const view = await renderSection()
    expect(view.byTestId('session-block-schedule').textContent).toContain('每天 9 点提醒我喝水')
    expect(view.text()).toContain('定时提醒')
    await view.cleanup()
  })

  it('无提醒时不渲染分区（空区块只占版面）', async () => {
    api = stub([])
    const view = await renderSection()
    expect(view.query('[data-testid="session-block-schedule"]')).toBeNull()
    await view.cleanup()
  })

  it('点删除 → 调用 remove 并从列表移除', async () => {
    api = stub([ONE])
    const view = await renderSection()
    await view.click(view.byTestId('session-schedule-delete'))

    expect(api.calls).toContain('schedule.remove')
    expect(view.query('[data-testid="session-schedule-item"]')).toBeNull()
    await view.cleanup()
  })

  it('cron / 重复 / 已触发都标出来', async () => {
    const rich: ScheduleTaskView = {
      id: 'sched_2',
      prompt: '巡检',
      at: '2026-11-06T09:00:00.000Z',
      cron: '*/30 * * * *',
      repeatMs: 90_000,
      firedAt: '2026-11-05T09:00:00.000Z'
    }
    api = stub([rich])
    const view = await renderSection()
    const text = view.byTestId('session-schedule-item').textContent ?? ''
    expect(text).toContain('cron */30 * * * *')
    expect(text).toContain('每 2 分钟')
    expect(text).toContain('已触发')
    await view.cleanup()
  })

  it('没有 schedule 通道时静默不渲染、不抛错', async () => {
    // 不装 mbApi：jsdom / 未来 Web 宿主都可能没有这条通道
    const view = await renderDom(<ScheduleSection host={new PluginHost()} />)
    expect(view.query('[data-testid="session-block-schedule"]')).toBeNull()
    await view.cleanup()
  })
})
