/**
 * 「在代码面板打开某个文件」的请求通道。
 *
 * 为什么需要它：代码面板（`CodePanel`）是自持状态的 mainView，`host.openMainView(id)`
 * 只切页签、不传参数。正文里的内联文件引用要「切到代码面板并定位到该文件」，
 * 于是用一个极小的模块级请求通道：发起方 `requestCodeView(path)` + 切页签，
 * 代码面板订阅并 `openFile(path)`。
 *
 * 单例语义：同一时刻只关心「最后一个请求」——用户连点两个文件引用，打开最后一个即可。
 * 面板挂载前发出的请求会暂存，挂载时 `takeCodeViewRequest()` 取走（不丢首次点击）。
 */

type Listener = (path: string) => void

let pending: string | null = null
const listeners = new Set<Listener>()

/** 请求在代码面板打开某文件（调用方随后负责切到代码页签）。 */
export function requestCodeView(path: string): void {
  pending = path
  for (const listener of listeners) listener(path)
}

/** 取走挂载前暂存的请求（取一次即清空）。 */
export function takeCodeViewRequest(): string | null {
  const path = pending
  pending = null
  return path
}

/** 订阅后续请求；返回取消订阅函数。 */
export function subscribeCodeViewRequest(listener: Listener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}
