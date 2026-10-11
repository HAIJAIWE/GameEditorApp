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

/**
 * 交互答复：confirm 用 `approved`；question 单问题用 `answer`、多问题用 `answers`
 * （按下标对齐，与 Brain 侧 `BrainInteractionAnswer` 同形）。
 *
 * ⚠️ 此前类型漏了 `answers`，而 `agentIpc` 的对象展开会原样把它传下去、Brain 也会读——
 * 靠展开绕过 excess property 检查才过 tsc，属类型失真，这里补齐。
 */
export interface AgentInteractionAnswer {
  approved?: boolean
  answer?: string
  answers?: readonly string[]
}

export class AgentApprovalBroker {
  private readonly pending = new Map<string, (answer: AgentInteractionAnswer) => void>()
  private seq = 0

  /** 分配一个新的审批请求 id */
  nextId(): string {
    return `approval_${++this.seq}`
  }

  /**
   * 按给定 id 登记待答复，返回等待答复的 promise。
   *
   * `timeoutMs > 0` 时到期自动按「未确认」兑现并清理——Brain 侧虽已有等价超时，
   * 但那条路径**不会通知本 broker**，登记会一直滞留在 `pending`
   * （长会话反复「用户不答复」时会累积；超时语义与 Brain 的 `withAnswerTimeout` 一致）。
   */
  registerWith(requestId: string, timeoutMs = 0): Promise<AgentInteractionAnswer> {
    return new Promise<AgentInteractionAnswer>((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      // 兑现即清计时器；resolve() 与本类的超时分支都只走这一个 settle
      const settle = (answer: AgentInteractionAnswer): void => {
        if (timer !== undefined) clearTimeout(timer)
        resolve(answer)
      }
      this.pending.set(requestId, settle)
      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          this.resolve(requestId, { approved: false })
        }, timeoutMs)
      }
    })
  }

  /** 渲染层回传答复；未知 id 返回 false（可能已被取消或过期） */
  resolve(requestId: string, answer: AgentInteractionAnswer): boolean {
    const settle = this.pending.get(requestId)
    if (settle === undefined) return false
    this.pending.delete(requestId)
    settle(answer)
    return true
  }

  /** 未决请求数 */
  get size(): number {
    return this.pending.size
  }

  /** 全部按「未确认/未答复」兑现（窗口关闭/会话中断） */
  rejectAll(): void {
    for (const settle of this.pending.values()) settle({ approved: false })
    this.pending.clear()
  }
}
