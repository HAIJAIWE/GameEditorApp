// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { DigitalApproval } from '../../../src/renderer/src/components/digital/digitalPanelViews'
import { renderDom } from './render'

describe('审批卡片（Slice 39）', () => {
  it('显示风险档、工具/操作与参数', async () => {
    const view = await renderDom(
      <DigitalApproval
        approval={{ requestId: 'r1', tool: 'system.code', action: 'execute', params: { cmd: 'ls' } }}
        onApprove={() => undefined}
      />
    )

    const badge = view.byTestId('digital-approval-risk').textContent ?? ''
    expect(badge).toContain('风险：')
    expect(badge.length).toBeGreaterThan(3)
    expect(view.text()).toContain('system.code')
    expect(view.text()).toContain('execute')
    expect(view.text()).toContain('cmd')

    await view.cleanup()
  })
})
