/**
 * 错误文案工具（**零业务语义**，符合 `shared/README.md` §2 Q5 的 util 判据：
 * 把业务名词删掉后函数名仍然成立）。
 *
 * ## 为什么需要一个共享实现
 *
 * 在此之前 `toErrorMessage` 在渲染层被**复制了 21 份**（19 个组件各一份私有副本 +
 * `appUtils.ts` / `ceshuViewUtils.ts` 两份 export 版），实现完全一致：
 *
 * ```ts
 * return error instanceof Error ? error.message : String(error)
 * ```
 *
 * 后果是「错误文案口径」没有单一事实源——将来若要把 `Error` 之外的结构（如 IPC 返回的
 * `IpcResult`、带 `code` 的业务错误）也纳入展示，得改 21 个文件，漏一处就是不一致。
 *
 * 收敛方式照 `shared/README.md` §6 的标准动作：新位置实现一次，原处 re-export 保持兼容，
 * 新代码直接引本文件。
 */

/**
 * 把 `catch (error: unknown)` 的捕获值转成可直接展示的文案。
 *
 * - `Error` 实例 → `message`（不含堆栈，避免把内部路径透给用户）
 * - 其它值 → `String(error)`（IPC 侧的错误已经是结构化字符串）
 */
export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
