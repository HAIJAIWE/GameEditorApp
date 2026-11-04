/**
 * 全局输入模态跟踪（借 dsh `ui-primitives/src/input-modality.ts` 的机制）。
 *
 * 在 `<html>` 上发布 `data-input-modality="pointer" | "keyboard"`：
 * - 指针点击后进入 **pointer** 模态 → CSS 抑制 `:focus-visible` 焦点环，
 *   避免「鼠标点一下按钮也闪一圈蓝框」；可编辑控件（`:read-write`）不受影响。
 * - 按 Tab / 方向键 / Home / End / PageUp / PageDown 后进入 **keyboard** 模态，
 *   焦点环恢复 —— 键盘用户始终看得见焦点在哪。
 *
 * 与 dsh 的两点差异（有意）：
 * 1. dsh 在模块顶层直接装监听；这里导出 `installInputModalityTracking()` 由入口显式调用，
 *    便于单测注入与重复安装保护。
 * 2. dsh 的 `focusin` 逻辑保留原样：只有「按键之后焦点又落到**另一个**控件」才切 keyboard，
 *    单纯的修饰键（Shift/Ctrl）与重新聚焦同一控件不会让环闪出来。
 *
 * 只发布属性、不碰样式；样式侧规则见 `styles.css` 的「焦点环」段。
 */
export const INPUT_MODALITY = { pointer: 'pointer', keyboard: 'keyboard' } as const
export type InputModality = (typeof INPUT_MODALITY)[keyof typeof INPUT_MODALITY]

/** 在 `<html>` 上承载当前模态的属性名。 */
export const INPUT_MODALITY_ATTRIBUTE = 'data-input-modality'

/** 这些键代表「用键盘在导航」，应恢复焦点环。 */
const FOCUS_NAVIGATION = new Set(['Tab', 'Home', 'End', 'PageUp', 'PageDown'])

let pointer = false
let pointerOwnsFocus = false
let keyFocusOrigin: EventTarget | undefined
let installed = false

function publish(): void {
  document.documentElement.setAttribute(
    INPUT_MODALITY_ATTRIBUTE,
    pointerOwnsFocus ? INPUT_MODALITY.pointer : INPUT_MODALITY.keyboard
  )
}

/** 上一次输入是否来自指针（与焦点环是否可见解耦，tooltip 等可复用）。 */
export function pointerModality(): boolean {
  return pointer
}

/** 安装全局监听（幂等；非浏览器环境直接返回）。 */
export function installInputModalityTracking(): void {
  if (installed || typeof window === 'undefined') return
  installed = true

  window.addEventListener(
    'pointerdown',
    () => {
      pointer = true
      pointerOwnsFocus = true
      keyFocusOrigin = undefined
      publish()
    },
    true
  )

  window.addEventListener(
    'keydown',
    (event) => {
      pointer = false
      // 输入法组合期间的方向键用于选词，不该算「键盘导航」
      if (event.isComposing) {
        keyFocusOrigin = undefined
        return
      }
      // composedPath 能拿到打开着的 shadow root 里真正的控件
      keyFocusOrigin = event.composedPath()[0]
      if (!FOCUS_NAVIGATION.has(event.key) && !event.key.startsWith('Arrow')) return
      pointerOwnsFocus = false
      publish()
    },
    true
  )

  window.addEventListener(
    'focusin',
    (event) => {
      if (keyFocusOrigin === undefined || event.composedPath()[0] === keyFocusOrigin) return
      keyFocusOrigin = undefined
      if (!pointerOwnsFocus) return
      pointerOwnsFocus = false
      publish()
    },
    true
  )

  window.addEventListener('blur', () => {
    keyFocusOrigin = undefined
  })
}
