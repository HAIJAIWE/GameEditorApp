// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { DigitalCommandMenu } from '../../../src/renderer/src/components/digital/digitalPanelViews'
import type { DigitalCommand } from '../../../src/shared/agent/tools/commands'
import { renderDom } from './render'

const COMMANDS: DigitalCommand[] = [
  { id: 'new', label: '新建对话', hint: '清空当前记录' },
  { id: 'preset', label: '切换预设', hint: '切到下一个预设' }
]

describe('斜杠命令菜单（P2）', () => {
  it('渲染命令项，点击回调 onRun(id)', async () => {
    const onRun = vi.fn()
    const view = await renderDom(<DigitalCommandMenu commands={COMMANDS} activeIndex={0} onRun={onRun} />)

    const items = view.queryAll('[data-testid="digital-command-item"]')
    expect(items).toHaveLength(2)
    expect(view.text()).toContain('/new')
    expect(view.text()).toContain('新建对话')

    // 高亮项标记
    expect(items[0]?.getAttribute('aria-selected')).toBe('true')
    expect(items[1]?.getAttribute('aria-selected')).toBe('false')

    await view.click(items[1] as HTMLElement)
    expect(onRun).toHaveBeenCalledWith('preset')

    await view.cleanup()
  })

  it('空命令列表：不渲染菜单', async () => {
    const view = await renderDom(<DigitalCommandMenu commands={[]} activeIndex={0} onRun={() => undefined} />)
    expect(view.query('[data-testid="digital-command-menu"]')).toBeNull()
    await view.cleanup()
  })
})
