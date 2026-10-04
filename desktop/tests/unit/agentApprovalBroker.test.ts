import { describe, expect, it } from 'vitest'

import { AgentApprovalBroker } from '../../src/main/agent/approvalBroker'

describe('AgentApprovalBroker：危险操作审批中转', () => {
  it('nextId 递增且不重复', () => {
    const broker = new AgentApprovalBroker()
    expect(broker.nextId()).toBe('approval_1')
    expect(broker.nextId()).toBe('approval_2')
    expect(broker.nextId()).toBe('approval_3')
  })

  it('登记后由渲染层回传决定兑现 promise', async () => {
    const broker = new AgentApprovalBroker()
    const id = broker.nextId()
    const decision = broker.registerWith(id)
    expect(broker.size).toBe(1)

    expect(broker.resolve(id, true)).toBe(true)
    await expect(decision).resolves.toBe(true)
    // 兑现后从未决集合移除
    expect(broker.size).toBe(0)
  })

  it('拒绝同样兑现为 false', async () => {
    const broker = new AgentApprovalBroker()
    const id = broker.nextId()
    const decision = broker.registerWith(id)
    broker.resolve(id, false)
    await expect(decision).resolves.toBe(false)
  })

  it('未知 requestId 回传返回 false（不误伤其它待办）', async () => {
    const broker = new AgentApprovalBroker()
    const id = broker.nextId()
    const decision = broker.registerWith(id)

    expect(broker.resolve('approval_999', true)).toBe(false)
    expect(broker.size).toBe(1)
    broker.resolve(id, true)
    await expect(decision).resolves.toBe(true)
  })

  it('重复回传同一 id：第二次返回 false（已被消费）', async () => {
    const broker = new AgentApprovalBroker()
    const id = broker.nextId()
    const decision = broker.registerWith(id)
    expect(broker.resolve(id, true)).toBe(true)
    expect(broker.resolve(id, false)).toBe(false)
    await expect(decision).resolves.toBe(true)
  })

  it('rejectAll：窗口关闭/会话中断时全部按未批准兑现', async () => {
    const broker = new AgentApprovalBroker()
    const first = broker.registerWith(broker.nextId())
    const second = broker.registerWith(broker.nextId())
    expect(broker.size).toBe(2)

    broker.rejectAll()
    await expect(first).resolves.toBe(false)
    await expect(second).resolves.toBe(false)
    expect(broker.size).toBe(0)
  })
})
