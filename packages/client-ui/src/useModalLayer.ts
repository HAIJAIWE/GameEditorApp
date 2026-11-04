import { useEffect, type RefObject } from 'react'

/**
 * 模态浮层的焦点契约（借 dsh `useModalLayer` / `closeTopModal` 的思路，简化版）。
 *
 * 解决三个键盘用户会立刻撞上的问题（墨白此前一个都没处理，只有 3 处 `role="dialog"`）：
 * 1. **打开不聚焦**：浮层出来后焦点还在背后的按钮上，Tab 第一下就跑到浮层外；
 * 2. **Tab 逃逸**：浮层没有焦点陷阱，一路 Tab 能走到被遮住的内容里；
 * 3. **关闭不归还**：收起后焦点掉到 `<body>`，键盘用户得从头 Tab 一遍。
 *
 * 与 dsh 的差异（有意）：
 * - 不建全局模态栈（`closeTopModal` 需要支持嵌套浮层），只做单层契约；
 *   墨白当前没有「浮层里再开浮层」的场景，等有了再加栈。
 * - 可见性过滤只看 `hidden` / `aria-hidden`，不用布局属性 —— jsdom 里
 *   `offsetParent` 恒为 null，用它会把这个 hook 变成不可测。
 *
 * 用法：容器需要 `tabIndex={-1}`（否则 `container.focus()` 不生效，且 Tab 循环
 * 在没有可聚焦子元素时无处可去）。
 */
const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',')

function focusableWithin(container: HTMLElement): HTMLElement[] {
  return [...container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)].filter(
    (element) => !element.hasAttribute('hidden') && element.getAttribute('aria-hidden') !== 'true'
  )
}

export interface ModalLayerOptions {
  /** 是否处于打开态；为 false 时 hook 不做事（便于组件常挂载、按需显示） */
  open: boolean
  /** `Esc` 或遮罩点击时调用 */
  onClose: () => void
  /** 浮层容器（需要 `tabIndex={-1}`） */
  containerRef: RefObject<HTMLElement | null>
  /** 打开时的首选焦点目标；不填则聚焦容器内第一个可聚焦元素 */
  initialFocusRef?: RefObject<HTMLElement | null>
}

export function useModalLayer({
  open,
  onClose,
  containerRef,
  initialFocusRef
}: ModalLayerOptions): void {
  // 打开时把焦点搬进来，关闭时还给来源元素
  useEffect(() => {
    if (!open) return
    const container = containerRef.current
    if (container === null) return

    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null
    const target = initialFocusRef?.current ?? focusableWithin(container)[0] ?? container
    target.focus()

    return () => {
      // 来源元素可能已被卸载（比如它所在的列表刷新了），focus 前先确认还挂在文档上
      if (previous !== null && document.contains(previous)) previous.focus()
    }
  }, [open, containerRef, initialFocusRef])

  // Esc 关闭 + Tab / Shift+Tab 在容器内循环
  useEffect(() => {
    if (!open) return

    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        event.stopPropagation()
        onClose()
        return
      }
      if (event.key !== 'Tab') return

      const container = containerRef.current
      if (container === null) return
      const items = focusableWithin(container)
      if (items.length === 0) {
        // 没有任何可聚焦元素：别让 Tab 把焦点带走
        event.preventDefault()
        container.focus()
        return
      }

      const first = items[0]!
      const last = items[items.length - 1]!
      const active = document.activeElement
      const outside = active === null || !container.contains(active)

      if (event.shiftKey) {
        if (active === first || outside) {
          event.preventDefault()
          last.focus()
        }
      } else if (active === last || outside) {
        event.preventDefault()
        first.focus()
      }
    }

    // 捕获阶段：抢在页面级 keydown（如 App 的撤销快捷键）之前处理
    document.addEventListener('keydown', onKeyDown, true)
    return () => document.removeEventListener('keydown', onKeyDown, true)
  }, [open, onClose, containerRef])
}
