/**
 * Toast 非阻塞通知的**纯逻辑**。
 *
 * ## 为什么要有它
 * 旧版 侧 `data_tab` 有 **9 处**真实调用（`_show_toast`）：保存成功 / 删除成功 /
 * AI 生成内容已添加 / 已选择模板 / 已选择参考策划案 …… 属于高频、非阻塞反馈。
 * TS 侧目前只有 `App.tsx:109` 一个全局 `notice-banner`：
 * - **不会自动消失**（要等下一次操作才被覆盖），
 * - **占据布局空间**（会把它下方的面板往下挤，是布局抖动源），
 * - 且**只能显示一条**（后一条直接覆盖前一条，前一条的语义就丢了）。
 * ⇒ 补齐 Toast：浮层、自动淡出、可多条并存。
 *
 * ## 与 旧版 的差异（刻意）
 * - **可多条并存**：旧版 的 `Toast` 是**单个实例**，`show_message` 会覆盖上一条文本；
 *   本实现用队列存多条（上限 `MAX_VISIBLE`），旧的自然消失。
 *   理由：TS 侧一次操作常连发多条反馈（如「已保存」+「已同步」），覆盖会丢信息。
 * - **淡出用 CSS transition 而非逐帧 opacity**：旧版 `_fade_out` 是 `QTimer` 每
 *   `duration/2` 毫秒减 0.2 透明度（5 步走完）。TS 用 CSS 类名切换，不需要
 *   定时器逐帧改样式（也更省）。
 * - **kind 三态**：`default` / `success` / `error`（对齐 旧版 的 default/success/error
 *   三套 QSS，背景色分别取 `bg` / `accent` / `danger`）。
 *
 * ## 订阅器为什么不用 React Context
 * Context 需要 Provider 包住整棵树，而触发 Toast 的地方常在深层组件甚至
 * 非 React 代码里。用一个模块级轻量订阅器（同步广播）可以**任意位置直接调用**
 * `showToast('已保存')`，不必逐层透传 prop —— 这与本项目「不做假控件、
 * 但也不为传参造复杂管道」的取舍一致。**组件侧用 `useSyncExternalStore` 订阅**，
 * 避免自己写 effect 同步 setState（react-hooks v7 的 `set-state-in-effect` 是 error）。
 */

/** Toast 类型 */
export type ToastKind = 'default' | 'success' | 'error'

/** 单条 Toast */
export interface ToastItem {
  id: number
  text: string
  kind: ToastKind
  /** 自动消失的毫秒数 */
  duration: number
}

/** 默认显示时长 */
export const DEFAULT_TOAST_DURATION = 3000

/** 同屏最多显示几条（超出时丢弃**最旧的**，保证最新反馈一定可见） */
export const MAX_VISIBLE = 3

/** 时长的合理区间，防止传入 0/负数导致 Toast 永远不消失或瞬间消失 */
export const MIN_DURATION = 500
export const MAX_DURATION = 10_000

let seq = 0

/** 夹紧时长到合理区间；非法值回落默认 */
export function normalizeDuration(duration: number): number {
  if (!Number.isFinite(duration)) return DEFAULT_TOAST_DURATION
  if (duration < MIN_DURATION) return MIN_DURATION
  if (duration > MAX_DURATION) return MAX_DURATION
  return duration
}

/** 当前列表（模块级真源，订阅者从这里读快照） */
let current: readonly ToastItem[] = []
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
}

/** `useSyncExternalStore` 的订阅入口 */
export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** `useSyncExternalStore` 的快照入口（必须返回**稳定引用**，否则会无限重渲染） */
export function getToasts(): readonly ToastItem[] {
  return current
}

/** 内置定时器句柄，便于测试与销毁 */
const timers = new Map<number, ReturnType<typeof setTimeout>>()

/**
 * 弹出一条 Toast。
 * @returns 该条 Toast 的 id（可用于主动 dismiss）
 */
export function showToast(
  text: string,
  options: { kind?: ToastKind; duration?: number } = {}
): number {
  const trimmed = text.trim()
  // 空文本不弹（弹一个空气泡是无意义的视觉噪音）
  if (trimmed === '') return -1

  seq += 1
  const id = seq
  const item: ToastItem = {
    id,
    text: trimmed,
    kind: options.kind ?? 'default',
    duration: normalizeDuration(options.duration ?? DEFAULT_TOAST_DURATION)
  }

  // 超出上限时丢弃最旧的（含清理它的定时器，防内存泄漏）。
  // 用 slice 直接算出结果：不需要在循环里重新赋值，const 即可。
  const overflow = current.length + 1 - MAX_VISIBLE
  if (overflow > 0) {
    for (const dropped of current.slice(0, overflow)) clearTimer(dropped.id)
  }
  current = [...current, item].slice(-MAX_VISIBLE)
  emit()

  const timer = setTimeout(() => {
    timers.delete(id)
    dismissToast(id)
  }, item.duration)
  timers.set(id, timer)

  return id
}

function clearTimer(id: number): void {
  const timer = timers.get(id)
  if (timer !== undefined) {
    clearTimeout(timer)
    timers.delete(id)
  }
}

/** 主动移除一条（如用户点击关闭、或组件卸载前清理） */
export function dismissToast(id: number): void {
  clearTimer(id)
  const next = current.filter((item) => item.id !== id)
  // 无变化就不广播，避免无谓重渲染
  if (next.length === current.length) return
  current = next
  emit()
}

/** 清空全部（测试与「切换库/清空数据」这类场景用） */
export function clearToasts(): void {
  for (const id of [...timers.keys()]) clearTimer(id)
  if (current.length === 0) return
  current = []
  emit()
}
