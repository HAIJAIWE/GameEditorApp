// @vitest-environment jsdom
import { act } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { DigitalSubagentList } from '../../../src/renderer/src/components/digital'
import { renderDom } from './render'

async function typeInto(input: HTMLInputElement, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('子智能体面板（Slice 40 继续对话）', () => {
  it('运行中：显示插话输入与停止；插话调用 onSteer 并清空输入', async () => {
    const onSteer = vi.fn()
    const onStop = vi.fn()
    const view = await renderDom(
      <DigitalSubagentList
        subagents={[{ id: 'sub_1', task: '整理数据', status: 'running' }]}
        onSteer={onSteer}
        onStop={onStop}
      />
    )

    expect(view.byTestId('digital-subagent-controls')).toBeTruthy()
    const input = view.byTestId('digital-subagent-input') as HTMLInputElement
    await typeInto(input, '补充要求')
    await view.click(view.byTestId('digital-subagent-send'))
    expect(onSteer).toHaveBeenCalledWith('sub_1', '补充要求')
    expect(input.value).toBe('')

    await view.click(view.byTestId('digital-subagent-stop'))
    expect(onStop).toHaveBeenCalledWith('sub_1')

    await view.cleanup()
  })

  it('已完成：不显示继续对话控件', async () => {
    const view = await renderDom(
      <DigitalSubagentList
        subagents={[{ id: 'sub_2', task: '已完成任务', status: 'done', result: '结果' }]}
        onSteer={() => undefined}
        onStop={() => undefined}
      />
    )
    expect(view.query('[data-testid="digital-subagent-controls"]')).toBeNull()
    expect(view.text()).toContain('已完成任务')
    await view.cleanup()
  })

  it('未传 onSteer/onStop：不渲染控件（避免死按钮）', async () => {
    const view = await renderDom(
      <DigitalSubagentList subagents={[{ id: 'sub_3', task: '运行中', status: 'running' }]} />
    )
    expect(view.query('[data-testid="digital-subagent-controls"]')).toBeNull()
    await view.cleanup()
  })
})
