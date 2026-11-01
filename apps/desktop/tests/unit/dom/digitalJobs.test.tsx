// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { DigitalJobList } from '../../../src/renderer/src/components/digital'
import type { JobRecord } from '@mobai/shared/agent/jobs/jobRegistry'
import { renderDom } from './render'

function job(overrides: Partial<JobRecord>): JobRecord {
  return {
    id: 't1:sub_1',
    kind: 'subagent',
    label: '生成第 1 章',
    status: 'running',
    output: '',
    startedAt: 0,
    ...overrides
  }
}

describe('后台任务面板（对齐 dsh ui-jobs）', () => {
  it('空列表不渲染', async () => {
    const view = await renderDom(<DigitalJobList jobs={[]} />)
    expect(view.query('[data-testid="digital-jobs"]')).toBeNull()
    await view.cleanup()
  })

  it('运行中：显示进度条与取消按钮', async () => {
    const onCancel = vi.fn()
    const view = await renderDom(
      <DigitalJobList jobs={[job({ id: 't2:sub_3', label: '整理数据' })]} onCancel={onCancel} />
    )
    expect(view.byTestId('digital-jobs')).toBeTruthy()
    expect(view.byTestId('digital-job-progress')).toBeTruthy()
    expect(view.text()).toContain('整理数据')
    await view.cleanup()
  })

  it('两击停止：第一次进入待确认态，第二次才真正取消', async () => {
    const onCancel = vi.fn()
    const view = await renderDom(
      <DigitalJobList jobs={[job({ id: 't2:sub_3', label: '整理数据' })]} onCancel={onCancel} />
    )
    const cancel = view.byTestId('digital-job-cancel')
    // 第一击：进入待确认（armed），但还没真正取消
    await view.click(cancel)
    expect(onCancel).not.toHaveBeenCalled()
    expect(view.byTestId('digital-job-cancel').getAttribute('data-armed')).toBe('true')
    expect(view.text()).toContain('确认停止')
    // 第二击：在待确认窗口内，真正取消
    await view.click(view.byTestId('digital-job-cancel'))
    expect(onCancel).toHaveBeenCalledWith('t2:sub_3')
    await view.cleanup()
  })

  it('已结算：不显示进度条与取消按钮，显示终态', async () => {
    const view = await renderDom(
      <DigitalJobList
        jobs={[job({ id: 't1:sub_1', status: 'completed', detail: '完成' })]}
        onCancel={() => undefined}
      />
    )
    expect(view.query('[data-testid="digital-job-progress"]')).toBeNull()
    expect(view.query('[data-testid="digital-job-cancel"]')).toBeNull()
    expect(view.text()).toContain('已完成')
    await view.cleanup()
  })

  it('未传 onCancel：运行中也不渲染取消按钮（避免死按钮）', async () => {
    const view = await renderDom(<DigitalJobList jobs={[job({ id: 't1:sub_9' })]} />)
    expect(view.query('[data-testid="digital-job-cancel"]')).toBeNull()
    await view.cleanup()
  })
})
