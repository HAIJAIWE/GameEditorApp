// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { DigitalReferenceMenu } from '../../../src/renderer/src/components/digital/digitalPanelViews'
import type { DigitalReference } from '../../../src/shared/agent/references'
import { renderDom } from './render'

const REFS: DigitalReference[] = [
  { id: 'character', name: '角色' },
  { id: 'skill', name: '技能' }
]

describe('@ 引用菜单（P2）', () => {
  it('渲染引用项，点击回调 onPick(name)', async () => {
    const onPick = vi.fn()
    const view = await renderDom(<DigitalReferenceMenu references={REFS} activeIndex={0} onPick={onPick} />)

    const items = view.queryAll('[data-testid="digital-reference-item"]')
    expect(items).toHaveLength(2)
    expect(view.text()).toContain('@角色')
    expect(items[0]?.getAttribute('aria-selected')).toBe('true')
    expect(items[1]?.getAttribute('aria-selected')).toBe('false')

    await view.click(items[1] as HTMLElement)
    expect(onPick).toHaveBeenCalledWith('技能')

    await view.cleanup()
  })

  it('空列表：不渲染菜单', async () => {
    const view = await renderDom(
      <DigitalReferenceMenu references={[]} activeIndex={0} onPick={() => undefined} />
    )
    expect(view.query('[data-testid="digital-reference-menu"]')).toBeNull()
    await view.cleanup()
  })
})
