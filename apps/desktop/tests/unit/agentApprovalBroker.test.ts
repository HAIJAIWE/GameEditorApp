import { describe, expect, it } from 'vitest'

import { AgentApprovalBroker } from '../../src/main/agent/execution/approvalBroker'

describe('AgentApprovalBroker：危险操作审批中转', () => {
  it('nextId 递增且不重复', () => {
    const broker = new AgentApprovalBroker()
    expect(broker.nextId()).toBe('approval_1')
    expect(broker.nextId()).toBe('approval_2')
    expect(broker.nextId()).toBe('approval_3')
  })

  it('登记后由渲染层回传决定兑现 promise（危险确认）', async () => {
    const broker = new AgentApprovalBroker()
    const id = broker.nextId()
    const decision = broker.registerWith(id)
    expect(broker.size).toBe(1)

    expect(broker.resolve(id, { approved: true })).toBe(true)
    await expect(decision).resolves.toEqual({ approved: true })
    // 兑现后从未决集合移除
    expect(broker.size).toBe(0)
  })

  it('拒绝同样兑现为 approved=false', async () => {
    const broker = new AgentApprovalBroker()
    const id = broker.nextId()
    const decision = broker.registerWith(id)
    broker.resolve(id, { approved: false })
    await expect(decision).resolves.toEqual({ approved: false })
  })

  it('技能交互（提问）：回传自由文本答复', async () => {
    const broker = new AgentApprovalBroker()
    const id = broker.nextId()
    const decision = broker.registerWith(id)
    broker.resolve(id, { answer: '用火系法师' })
    await expect(decision).resolves.toEqual({ answer: '用火系法师' })
  })

  it('未知 requestId 回传返回 false（不误伤其它待办）', async () => {
    const broker = new AgentApprovalBroker()
    const id = broker.nextId()
    const decision = broker.registerWith(id)

    expect(broker.resolve('approval_999', { approved: true })).toBe(false)
    expect(broker.size).toBe(1)
    broker.resolve(id, { approved: true })
    await expect(decision).resolves.toEqual({ approved: true })
  })

  it('重复回传同一 id：第二次返回 false（已被消费）', async () => {
    const broker = new AgentApprovalBroker()
    const id = broker.nextId()
    const decision = broker.registerWith(id)
    expect(broker.resolve(id, { approved: true })).toBe(true)
    expect(broker.resolve(id, { approved: false })).toBe(false)
    await expect(decision).resolves.toEqual({ approved: true })
  })

  it('rejectAll：窗口关闭/会话中断时全部按未确认兑现', async () => {
    const broker = new AgentApprovalBroker()
    const first = broker.registerWith(broker.nextId())
    const second = broker.registerWith(broker.nextId())
    expect(broker.size).toBe(2)

    broker.rejectAll()
    await expect(first).resolves.toEqual({ approved: false })
    await expect(second).resolves.toEqual({ approved: false })
    expect(broker.size).toBe(0)
  })

  it('超时登记：到期自动按「未确认」兑现并清理（防登记滞留 pending）', async () => {
    const broker = new AgentApprovalBroker()
    const id = broker.nextId()
    const decision = broker.registerWith(id, 10)
    expect(broker.size).toBe(1)

    await expect(decision).resolves.toEqual({ approved: false })
    expect(broker.size).toBe(0)
  })

  it('超时登记：到期前被回传则按回传兑现，超时不再二次改写', async () => {
    const broker = new AgentApprovalBroker()
    const id = broker.nextId()
    const decision = broker.registerWith(id, 20)
    expect(broker.resolve(id, { approved: true })).toBe(true)
    await expect(decision).resolves.toEqual({ approved: true })

    // 越过原定超时点：登记不复活、不产生第二次兑现
    await new Promise((resolve) => setTimeout(resolve, 30))
    expect(broker.size).toBe(0)
    expect(broker.resolve(id, { approved: false })).toBe(false)
  })
})
