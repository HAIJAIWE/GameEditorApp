/**
 * 危险操作审批的中转（A1-4）：主进程发起审批 → 渲染层弹模态 → 回传决定。
 *
 * Brain 循环里审批是**同步等待语义**（`await requestApproval(...)`），而跨进程是异步消息，
 * 故这里用「按 requestId 登记 promise + 兑现」把两者接起来。
 * 与 Python `FrontendSnapshot.confirm_dangerous` 的阻塞式对话框语义等价，
 * 但**不做任何隐式放行**：窗口关闭 / 未知 id / 未回传 一律视为未批准。
 *
 * id 由本模块统一发（`nextId`），避免多次并发会话都从 `approval_1` 开始而冲突。
 */

export class AgentApprovalBroker {
  private readonly pending = new Map<string, (approved: boolean) => void>()
  private seq = 0

  /** 分配一个新的审批请求 id */
  nextId(): string {
    return `approval_${++this.seq}`
  }

  /** 按给定 id 登记待审批，返回等待决定的 promise */
  registerWith(requestId: string): Promise<boolean> {
    return new Promise<boolean>((resolve) => {
      this.pending.set(requestId, resolve)
    })
  }

  /** 渲染层回传决定；未知 id 返回 false（可能已被取消或过期） */
  resolve(requestId: string, approved: boolean): boolean {
    const settle = this.pending.get(requestId)
    if (settle === undefined) return false
    this.pending.delete(requestId)
    settle(approved)
    return true
  }

  /** 未决请求数 */
  get size(): number {
    return this.pending.size
  }

  /** 全部按「未批准」兑现（窗口关闭/会话中断） */
  rejectAll(): void {
    for (const settle of this.pending.values()) settle(false)
    this.pending.clear()
  }
}
