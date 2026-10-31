// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { DropOverlay } from '../../../src/renderer/src/components/digital'
import { renderDom } from './render'

/**
 * 全屏投放邀请（对齐 dsh `DropOverlay`）：经 portal 挂到 body（不在容器内），
 * 正常态给标题 + 限制说明，disabled 态只给禁止文案。
 */
describe('投放邀请', () => {
  it('正常态：标题 + 限制说明（portal 挂到 body，卸载后移除）', async () => {
    const rendered = await renderDom(<DropOverlay disabled={false} />)
    const mask = document.body.querySelector('[data-testid="digital-drop-overlay"]')
    expect(mask).not.toBeNull()
    expect(mask?.textContent).toContain('松开以添加附件')
    expect(mask?.textContent).toContain('支持任意文件')

    await rendered.cleanup()
    expect(document.body.querySelector('[data-testid="digital-drop-overlay"]')).toBeNull()
  })

  it('disabled 态：禁止文案、无限制说明', async () => {
    const rendered = await renderDom(<DropOverlay disabled />)
    const mask = document.body.querySelector('[data-testid="digital-drop-overlay"]')
    expect(mask?.textContent).toContain('暂不能添加附件')
    expect(mask?.textContent).not.toContain('支持任意文件')
    await rendered.cleanup()
  })
})
