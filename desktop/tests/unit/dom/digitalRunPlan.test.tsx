// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { DigitalRunPlan } from '../../../src/renderer/src/components/digital/DigitalRunPlan'
import type { DigitalStep } from '../../../src/shared/agent/panel'
import { renderDom } from './render'

/**
 * 「本轮进度」条：分段状态、计数、徽标优先级。
 *
 * 徽标规则里最容易写错的是**失败盖过已完成**（用户会漏看失败），故单独锁一条。
 */

function step(tool: string, status: DigitalStep['status'], order = 0): DigitalStep {
  return { order, tool, kind: 'tool', status, ...(status === 'done' ? { success: true } : {}) }
}

describe('DigitalRunPlan', () => {
  it('没有步骤时整块不渲染（不留空卡）', async () => {
    const result = await renderDom(<DigitalRunPlan steps={[]} status="idle" />)
    expect(result.query('[data-testid="digital-run-plan"]')).toBeNull()
    await result.cleanup()
  })

  it('分段条按步骤状态着色，计数为 done/total', async () => {
    const result = await renderDom(
      <DigitalRunPlan
        steps={[step('system.game_data', 'done'), step('system.code', 'done'), step('system.shell', 'failed')]}
        status="done"
      />
    )

    const segments = result.queryAll('[data-testid="digital-run-plan-segment"]')
    expect(segments).toHaveLength(3)
    expect(segments.map((node) => node.getAttribute('data-status'))).toEqual(['done', 'done', 'failed'])
    expect(result.byTestId('digital-run-plan-count').textContent).toBe('2/3')
    await result.cleanup()
  })

  it('有失败时徽标是「有失败」且给出提示（不因整体完成而变绿）', async () => {
    const result = await renderDom(
      <DigitalRunPlan steps={[step('a', 'done'), step('b', 'failed')]} status="done" />
    )

    const card = result.byTestId('digital-run-plan')
    expect(card.getAttribute('data-state')).toBe('failed')
    expect(card.textContent).toContain('有失败')
    expect(result.byTestId('digital-run-plan-failed').textContent).toContain('1 步失败')
    await result.cleanup()
  })

  it('运行中显示当前步骤名与「进行中」徽标', async () => {
    const result = await renderDom(
      <DigitalRunPlan steps={[step('system.game_data', 'done'), step('system.ceshu', 'running', 1)]} status="thinking" />
    )

    const card = result.byTestId('digital-run-plan')
    expect(card.getAttribute('data-state')).toBe('running')
    expect(card.textContent).toContain('进行中')
    expect(result.byTestId('digital-run-plan-current').textContent).toContain('system.ceshu')
    await result.cleanup()
  })

  it('全部完成且无失败 → 徽标「已完成」', async () => {
    const result = await renderDom(<DigitalRunPlan steps={[step('a', 'done'), step('b', 'done')]} status="done" />)
    expect(result.byTestId('digital-run-plan').getAttribute('data-state')).toBe('done')
    await result.cleanup()
  })

  it('传了 onExpand 才出现「查看步骤」，点击回调一次（不传则不渲染）', async () => {
    const without = await renderDom(<DigitalRunPlan steps={[step('a', 'done')]} status="done" />)
    expect(without.query('[data-testid="digital-run-plan-expand"]')).toBeNull()
    await without.cleanup()

    let calls = 0
    const withHandler = await renderDom(
      <DigitalRunPlan
        steps={[step('a', 'done')]}
        status="done"
        onExpand={() => {
          calls += 1
        }}
      />
    )
    await withHandler.click(withHandler.byTestId('digital-run-plan-expand'))
    expect(calls).toBe(1)
    await withHandler.cleanup()
  })
})
