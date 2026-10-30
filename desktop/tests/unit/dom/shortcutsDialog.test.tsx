// @vitest-environment jsdom
import { describe, expect, it, vi } from 'vitest'

import { ShortcutsDialog } from '../../../src/renderer/src/components/digital/ShortcutsDialog'
import { pressKey, renderDom } from './render'

/**
 * 键盘快捷键参考（对齐 dsh ui-shortcuts 的只读子集）：列出真实快捷键，
 * Esc / 关闭按钮都能收起。不做录制/改键（我们没有可改写的键位注册表）。
 */
describe('键盘快捷键弹窗', () => {
  it('列出真实快捷键（含分组与按键）', async () => {
    const rendered = await renderDom(<ShortcutsDialog onClose={() => undefined} />)
    const rows = rendered.queryAll('[data-testid="digital-shortcut-row"]')
    expect(rows.length).toBeGreaterThanOrEqual(8)
    expect(rendered.text()).toContain('发送消息')
    expect(rendered.text()).toContain('切换侧栏')
    expect(rendered.text()).toContain('Ctrl + Z')
    await rendered.cleanup()
  })

  it('Esc 与关闭按钮都收起', async () => {
    const onClose = vi.fn()
    const rendered = await renderDom(<ShortcutsDialog onClose={onClose} />)

    await pressKey('Escape')
    expect(onClose).toHaveBeenCalledTimes(1)

    await rendered.click(rendered.byTestId('digital-shortcuts-close'))
    expect(onClose).toHaveBeenCalledTimes(2)
    await rendered.cleanup()
  })
})
