// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { DigitalStepList } from '../../../src/renderer/src/components/digital'
import type { DigitalStep } from '../../../src/shared/agent/ui'
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

  it('失败行摘要取错误行（跳过 "exit code" 噪音首行）并染红', async () => {
    const view = await renderDom(
      <DigitalStepList
        steps={[
          step({
            status: 'failed',
            success: false,
            result: 'Command failed with exit code 1\nError: 字段 ID 重复'
          })
        ]}
      />
    )
    const summary = view.container.querySelector('.digital-step-summary')
    expect(summary?.textContent).toBe('Error: 字段 ID 重复')
    expect(summary?.className).toContain('is-error')
    await view.cleanup()
  })

  it('运行中的摘要与状态字带 is-shimmer（扫光由 CSS 接管）', async () => {
    const view = await renderDom(<DigitalStepList steps={[step({ status: 'running', result: '正在读取数据' })]} />)
    expect(view.container.querySelector('.digital-step-summary.is-shimmer')).not.toBeNull()
    expect(view.container.querySelector('.digital-step-status .is-shimmer')?.textContent).toBe('执行中')
    await view.cleanup()
  })
})
