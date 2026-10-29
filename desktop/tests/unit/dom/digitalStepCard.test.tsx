// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { DigitalStepList } from '../../../src/renderer/src/components/digital/digitalPanelViews'
import type { DigitalStep } from '../../../src/shared/agent/panel'
import { renderDom } from './render'

/**
 * 工具卡行头的 diff 增删行数（借 dsh `ui-tool` 的 diffAdded / diffRemoved）。
 *
 * 存在的意义：折叠态下也能一眼看出「这次改了多少」，不必展开长 diff。
 * 非 diff 结果**不能**显示 `+0 −0`——那是在虚构信息。
 */

const step = (over: Partial<DigitalStep> = {}): DigitalStep => ({
  order: 0,
  tool: 'system.write',
  kind: 'tool',
  status: 'done',
  ...over
})

describe('工具卡 · diff 增删行数', () => {
  it('diff 结果在行头显示 +N −M', async () => {
    const view = await renderDom(
      <DigitalStepList
        steps={[step({ result: ['--- a/x.ts', '+++ b/x.ts', '@@ -1 +1 @@', '-old', '+new1', '+new2'].join('\n') })]}
      />
    )
    const totals = view.byTestId('digital-step-diff-total')
    expect(totals.textContent).toContain('+2')
    expect(totals.textContent).toContain('−1')
    await view.cleanup()
  })

  it('非 diff 结果不出这段（不虚构 0/0）', async () => {
    const view = await renderDom(<DigitalStepList steps={[step({ result: '共 13 种数据类型' })]} />)
    expect(view.query('[data-testid="digital-step-diff-total"]')).toBeNull()
    await view.cleanup()
  })
})
