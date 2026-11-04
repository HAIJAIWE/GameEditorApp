// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { ShortcutKeys } from '@mobai/client-ui'
import { shortcutAria } from '@mobai/shared/util/ui'

import { renderDom } from './render'

/**
 * 键帽展示 + `aria-keyshortcuts` 派生。
 *
 * 为什么必须有：键帽是纯视觉（`aria-hidden`），真正给读屏的是按钮上的
 * `aria-keyshortcuts`。两件事任一写错——键帽拆错、或 aria 里用了 `Ctrl`
 * 而不是规范名 `Control`——界面看起来正常，只有读屏用户受影响。
 */

describe('ShortcutKeys / shortcutAria', () => {
  it('按键位串拆成键帽，间隔符独立渲染，整块 aria-hidden', async () => {
    const view = await renderDom(<ShortcutKeys keys="Ctrl+Shift+Z" />)
    try {
      expect(view.queryAll('.shortcut-key').map((node) => node.textContent)).toEqual([
        'Ctrl',
        'Shift',
        'Z'
      ])
      expect(view.queryAll('.shortcut-separator')).toHaveLength(2)
      expect(view.query('.shortcut-keys')?.getAttribute('aria-hidden')).toBe('true')
    } finally {
      await view.cleanup()
    }
  })

  it('bound 变体带 class，供设置面板用键帽底', async () => {
    const view = await renderDom(<ShortcutKeys keys="Ctrl+Z" variant="boxed" />)
    try {
      expect(view.query('.shortcut-keys-boxed')).not.toBeNull()
    } finally {
      await view.cleanup()
    }
  })

  it('shortcutAria 用规范名（Ctrl → Control，读屏才念得出）', () => {
    expect(shortcutAria('Ctrl+Z')).toBe('Control+Z')
    expect(shortcutAria('Ctrl+Shift+Z')).toBe('Control+Shift+Z')
    expect(shortcutAria('Alt+Enter')).toBe('Alt+Enter')
    expect(shortcutAria('Cmd+K')).toBe('Meta+K')
    expect(shortcutAria('Esc')).toBe('Esc')
  })
})
