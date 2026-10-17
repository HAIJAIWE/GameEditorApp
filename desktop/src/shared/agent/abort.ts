/**
 * 取消信号相关的最小工具（**共享层**）。
 *
 * 为什么单独一个文件而不是塞进某个传输层：`AbortError` 的识别在**两侧**都要用 ——
 *  - `shared/agent/brain/loop.ts`（决策层）：判断这次异常是「中止」还是「真失败」；
 *  - `main/agent/*Transport.ts`（传输层）：决定要不要把异常包装成业务错误。
 * 而分层铁律禁止 `shared/` 反向 import `main/`，故放在这里由两侧共同 import。
 */

/**
 * 是否是「取消」导致的异常。
 *
 * 传输层的 `catch` 必须先用它分流：取消**不等于**业务失败。若把 `AbortError` 包成
 * 「AI 调用失败：…」，循环只能报 `transport_error`，把用户主动停止显示成故障，
 * 而且会丢掉已产出的部分结果。
 *
 * 判定同时看 `name` 与 Node 侧的 `code`：浏览器 / undici 给 `name: 'AbortError'`，
 * Node 的 `AbortError` 还带 `code: 'ABORT_ERR'`。
 */
export function isAbortError(error: unknown): boolean {
  if (error instanceof Error) {
    if (error.name === 'AbortError') return true
    if ((error as { code?: unknown }).code === 'ABORT_ERR') return true
  }
  return false
}
