// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { DigitalWorkspaceBar } from '../../../src/renderer/src/components/digital'
import { renderDom } from './render'

describe('代码工作区栏（对齐 dsh fs-sandbox cwd）', () => {
  it('空根不渲染', async () => {
    const view = await renderDom(<DigitalWorkspaceBar root="" />)
    expect(view.query('[data-testid="digital-workspace"]')).toBeNull()
    await view.cleanup()
  })

  it('显示路径，点击「选择…」回调', async () => {
    const onChoose = vi.fn()
    const view = await renderDom(<DigitalWorkspaceBar root="/proj/code" onChoose={onChoose} />)
    expect(view.text()).toContain('/proj/code')
    await view.click(view.byTestId('digital-workspace-choose'))
    expect(onChoose).toHaveBeenCalled()
    await view.cleanup()
  })

  it('未传 onChoose：不渲染选择按钮', async () => {
    const view = await renderDom(<DigitalWorkspaceBar root="/proj/code" />)
    expect(view.query('[data-testid="digital-workspace-choose"]')).toBeNull()
    await view.cleanup()
  })
})
