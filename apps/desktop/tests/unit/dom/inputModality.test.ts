// @vitest-environment jsdom
import { beforeEach, describe, expect, it } from 'vitest'

import {
  INPUT_MODALITY_ATTRIBUTE,
  installInputModalityTracking,
  pointerModality
} from '../../../src/renderer/src/inputModality'

/**
 * 输入模态跟踪（借 dsh `ui-primitives/src/input-modality.ts`）。
 *
 * 为什么必须有：焦点环只在 keyboard 模态下显示。一旦判定错了方向——
 * 鼠标点击后仍画环（噪），或键盘导航后不画环（键盘用户失去定位）——
 * 单测里没有任何其它断言会红，只有这里会。
 */

const modality = (): string | null => document.documentElement.getAttribute(INPUT_MODALITY_ATTRIBUTE)
const pointerDown = (): void => {
  window.dispatchEvent(new Event('pointerdown'))
}

describe('input modality', () => {
  beforeEach(() => {
    installInputModalityTracking()
  })

  it('指针点击 → pointer；Tab 导航 → keyboard', () => {
    pointerDown()
    expect(modality()).toBe('pointer')
    expect(pointerModality()).toBe(true)

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }))
    expect(modality()).toBe('keyboard')
    expect(pointerModality()).toBe(false)
  })

  it('单独按修饰键不恢复焦点环（避免 Ctrl+C 后环闪出）', () => {
    pointerDown()
    expect(modality()).toBe('pointer')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Shift' }))
    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Control' }))
    expect(modality()).toBe('pointer')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(modality()).toBe('keyboard')
  })

  it('输入法组合中的方向键不算键盘导航（选词不该出环）', () => {
    pointerDown()

    const composing = new KeyboardEvent('keydown', { key: 'ArrowDown' })
    Object.defineProperty(composing, 'isComposing', { value: true })
    window.dispatchEvent(composing)
    expect(modality()).toBe('pointer')

    window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown' }))
    expect(modality()).toBe('keyboard')
  })
})
