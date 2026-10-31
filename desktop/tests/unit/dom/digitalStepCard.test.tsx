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

/**
 * 工具返回的图像（来自 `SkillResult.images`，data URL）：聊天卡内联缩略图条，
 * 对齐 dsh `ui-tool` 的 `tool.call.images` 槽。点击缩略图经 `AttachmentLightbox` 全屏查看。
 */
describe('工具卡 · 图像缩略图条（对齐 dsh tool.call.images）', () => {
  it('step.images 渲染缩略图条，点击打开 lightbox', async () => {
    const images = ['data:image/png;base64,AAA', 'data:image/png;base64,BBB']
    const view = await renderDom(<DigitalStepList steps={[step({ images })]} />)
    const strip = view.byTestId('digital-step-images')
    expect(strip).not.toBeNull()
    const thumbs = view.queryAll('[data-testid="digital-step-image-thumb"]')
    expect(thumbs).toHaveLength(2)
    expect(thumbs[0]?.querySelector('img')?.getAttribute('src')).toBe(images[0])
    // 默认不渲染 lightbox
    expect(view.query('[data-testid="digital-lightbox"]')).toBeNull()
    // 点击缩略图打开 lightbox，且显示对应原图
    await view.click(thumbs[0] as HTMLElement)
    const lb = view.query('[data-testid="digital-lightbox"]')
    expect(lb).not.toBeNull()
    expect(lb?.querySelector('.digital-lightbox-img')?.getAttribute('src')).toBe(images[0])
    await view.cleanup()
  })

  it('无图像的步不渲染缩略图条（形状保持干净）', async () => {
    const view = await renderDom(<DigitalStepList steps={[step({ result: 'ok' })]} />)
    expect(view.query('[data-testid="digital-step-images"]')).toBeNull()
    await view.cleanup()
  })
})
