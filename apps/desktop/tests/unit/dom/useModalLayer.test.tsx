// @vitest-environment jsdom
import { useRef } from 'react'
import { describe, expect, it, vi } from 'vitest'

import { useModalLayer } from '@mobai/client-ui'

import { renderDom } from './render'

/**
 * 模态浮层焦点契约（`@mobai/client-ui` 的 `useModalLayer`）。
 *
 * 为什么必须有：墨白有 3 个 `role="dialog"` 浮层，此前都没有焦点陷阱 ——
 * 打开后焦点留在背后、Tab 能走出去、关闭后掉到 body。这三件事在鼠标下完全无感，
 * 只有键盘用户会撞上，所以必须靠测试守住。
 */

function Modal({ onClose }: { onClose: () => void }): React.JSX.Element {
  const containerRef = useRef<HTMLDivElement>(null)
  useModalLayer({ open: true, onClose, containerRef })
  return (
    <div>
      <button data-testid="outside">外面</button>
      <div ref={containerRef} tabIndex={-1} role="dialog" data-testid="card">
        <button data-testid="a">A</button>
        <button data-testid="b">B</button>
      </div>
    </div>
  )
}

const activeId = (): string | null => document.activeElement?.getAttribute('data-testid') ?? null
const pressTab = (shiftKey = false): void => {
  document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true }))
}

describe('useModalLayer', () => {
  it('打开时把焦点移进容器（第一个可聚焦元素）', async () => {
    const view = await renderDom(<Modal onClose={() => undefined} />)
    try {
      expect(activeId()).toBe('a')
    } finally {
      await view.cleanup()
    }
  })

  it('Tab 在最后一个元素上循环回第一个（焦点不外逃）', async () => {
    const view = await renderDom(<Modal onClose={() => undefined} />)
    try {
      view.byTestId('b').focus()
      pressTab()
      expect(activeId()).toBe('a')
    } finally {
      await view.cleanup()
    }
  })

  it('Shift+Tab 在第一个元素上循环回最后一个', async () => {
    const view = await renderDom(<Modal onClose={() => undefined} />)
    try {
      view.byTestId('a').focus()
      pressTab(true)
      expect(activeId()).toBe('b')
    } finally {
      await view.cleanup()
    }
  })

  it('焦点在容器外时按 Tab 会被拉回容器内', async () => {
    const view = await renderDom(<Modal onClose={() => undefined} />)
    try {
      view.byTestId('outside').focus()
      pressTab()
      expect(activeId()).toBe('a')
    } finally {
      await view.cleanup()
    }
  })

  it('Esc 触发 onClose', async () => {
    const onClose = vi.fn()
    const view = await renderDom(<Modal onClose={onClose} />)
    try {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }))
      expect(onClose).toHaveBeenCalledTimes(1)
    } finally {
      await view.cleanup()
    }
  })
})
