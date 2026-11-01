/**
 * 宿主 UI 桥：把 App 的**界面级能力**暴露给插件命令。
 *
 * 为什么需要它：插件命令跑在纯模块里（`run: () => void`），拿不到 `setNotice` /
 * `setCeshuHomeVisible` / `activeCeshuId`。而「导航类命令」恰恰要这些——
 * 不架这座桥，就只能把动作留在 App 里，等于没插件化。
 *
 * 设计取舍：
 * - **注入式单例**，与 `pluginHost` 同一路数；App 每次渲染注入最新实现（`openPanel` 是普通函数、每次新建）。
 * - 暴露的是 App 的 **`openPanel`（含守卫）**，不是 `host.openPanel`：守卫要读 schema（「没有类型就别开
 *   快速创建」）并给提示，这些只有 App 知道。插件因此拿到的行为与菜单完全一致。
 * - 桥本身**不做业务判断**，只是通道；缺实现时静默降级（`notify` 无接收方 = 无操作）。
 */
export interface HostUiBridge {
  /** 顶部提示（App 的 `setNotice`） */
  notify: (message: string) => void
  /** 打开浮层（App 的 `openPanel`：含「需要类型」「引用需目标」等守卫与提示） */
  openPanel: (panelId: string, params?: unknown) => void
  /** 回策划书首页 / 离开首页（App 的 `setCeshuHomeVisible`） */
  setHomeVisible: (visible: boolean) => void
  /** 当前打开的策划书 id（null = 还在首页） */
  getActiveCeshuId: () => string | null
}

let bridge: HostUiBridge | null = null

export function setHostUi(next: HostUiBridge | null): void {
  bridge = next
}

export function notify(message: string): void {
  bridge?.notify(message)
}

export function openPanel(panelId: string, params?: unknown): void {
  bridge?.openPanel(panelId, params)
}

export function setHomeVisible(visible: boolean): void {
  bridge?.setHomeVisible(visible)
}

export function getActiveCeshuId(): string | null {
  return bridge?.getActiveCeshuId() ?? null
}
