import { describe, expect, it } from 'vitest'

import { TaskRegistry, taskRegistry, withTask } from '../../src/main/task/taskRegistry'
import { runSingleShotTask } from '../../src/main/agent/execution/runTask'

/*
 * 取消表的语义（对话循环与单发 AI 共用）。
 * 这些断言对应四个曾经会出事的地方：
 *  1. 按 id 取消；2. 不带 id 时按窗口兜底；3. **归属校验**（不能取消别人窗口的任务）；
 *  4. `end` 的身份比对（同一 window 连发时，旧任务的收尾不能注销新任务）。
 */

describe('TaskRegistry', () => {
  it('begin 生成唯一 id；按 id 取消后 signal 立刻 aborted', () => {
    const registry = new TaskRegistry()
    const a = registry.begin(1)
    const b = registry.begin(1)
    expect(a.taskId).not.toBe(b.taskId)
    expect(a.signal.aborted).toBe(false)
    expect(registry.cancel(1, a.taskId)).toBe(true)
    expect(a.signal.aborted).toBe(true)
    // 只取消命中的那一笔
    expect(b.signal.aborted).toBe(false)
  })

  it('不带 taskId ⇒ 取消该窗口当前活跃的一笔（面板只有一个停止按钮的语义）', () => {
    const registry = new TaskRegistry()
    const ticket = registry.begin(7)
    expect(registry.cancel(7)).toBe(true)
    expect(ticket.signal.aborted).toBe(true)
  })

  it('归属校验：不能取消别的窗口的任务（改前 activeRuns 不校验 sender）', () => {
    const registry = new TaskRegistry()
    const mine = registry.begin(1) // 窗口 1
    // 窗口 2 拿到同一个 id 也取消不了
    expect(registry.cancel(2, mine.taskId)).toBe(false)
    expect(mine.signal.aborted).toBe(false)
    // 窗口 2 的兜底取消同样碰不到窗口 1
    expect(registry.cancel(2)).toBe(false)
    expect(mine.signal.aborted).toBe(false)
    // 自己窗口可以
    expect(registry.cancel(1, mine.taskId)).toBe(true)
    expect(mine.signal.aborted).toBe(true)
  })

  it('end 后取消返回 false（陈旧 controller 不会被命中），且表清空', () => {
    const registry = new TaskRegistry()
    const ticket = registry.begin(1)
    registry.end(ticket.taskId, ticket.signal)
    expect(registry.size).toBe(0)
    expect(registry.cancel(1, ticket.taskId)).toBe(false)
    // 兜底路径同样失效
    expect(registry.cancel(1)).toBe(false)
  })

  it('end 做身份比对：旧任务的收尾不会注销同 id 的新任务', () => {
    const registry = new TaskRegistry()
    const first = registry.begin(1, 'run_x')
    const second = registry.begin(1, 'run_x') // 复用同一 id（连发）
    // 旧任务先收尾：按 signal 比对 ⇒ 不删新任务
    registry.end(first.taskId, first.signal)
    expect(registry.size).toBe(1)
    expect(registry.cancel(1, 'run_x')).toBe(true)
    expect(second.signal.aborted).toBe(true)
    expect(first.signal.aborted).toBe(false)
  })

  it('渲染层指定 id 时沿用该 id（便于日志对账）', () => {
    const registry = new TaskRegistry()
    expect(registry.begin(1, 'run_abc').taskId).toBe('run_abc')
    // 空串按「未指定」处理
    expect(registry.begin(1, '').taskId).not.toBe('')
  })

  it('进程级单例只有一张表（对话循环与单发生成共用）', () => {
    const a = taskRegistry()
    const b = taskRegistry()
    expect(a).toBe(b)
    const ticket = a.begin(99)
    try {
      expect(b.cancel(99, ticket.taskId)).toBe(true)
    } finally {
      a.end(ticket.taskId, ticket.signal)
    }
  })
})

describe('withTask：登记/注销配对不能靠调用点自觉', () => {
  it('正常返回后自动注销（不留陈旧记录）', async () => {
    const registry = taskRegistry()
    const value = await withTask(101, async (signal) => {
      expect(signal.aborted).toBe(false)
      expect(registry.size).toBe(1)
      return 'done'
    })
    expect(value).toBe('done')
    expect(registry.size).toBe(0)
  })

  it('抛错时同样注销 —— 否则「取消已结束的任务」会命中陈旧 controller', async () => {
    const registry = taskRegistry()
    await expect(
      withTask(102, async () => {
        throw new Error('boom')
      })
    ).rejects.toThrow('boom')
    expect(registry.size).toBe(0)
  })

  it('运行中可被取消：signal 立刻 aborted，且 body 能看到', async () => {
    const registry = taskRegistry()
    await withTask(103, async (signal) => {
      expect(registry.cancel(103)).toBe(true)
      expect(signal.aborted).toBe(true)
    })
  })

  it('沿用渲染层指定的 taskId（日志/对账口径一致）', async () => {
    await withTask(
      104,
      async () => {
        // 用指定 id 取消得到 true ⇒ 说明登记用的就是它
        expect(taskRegistry().cancel(104, 'run_zz')).toBe(true)
      },
      'run_zz'
    )
  })

  it('同一窗口连发：旧任务收尾不会注销新任务（这是手写 try/finally 最易漏的那条）', async () => {
    const registry = taskRegistry()
    let releaseFirst: (() => void) | undefined
    let releaseSecond: (() => void) | undefined
    const firstGate = new Promise<void>((resolve) => (releaseFirst = resolve))
    const secondGate = new Promise<void>((resolve) => (releaseSecond = resolve))

    const first = withTask(105, async () => {
      await firstGate
      return 'first'
    })
    // 第一个还挂着时，同窗口再起一个（bySender 指向第二个）
    const second = withTask(105, async (signal) => {
      await secondGate
      return signal.aborted ? 'aborted' : 'second'
    })

    // 先让第一个收尾：它的 end 用 signal 比对，必须**不**注销第二个
    releaseFirst?.()
    await first
    expect(registry.size).toBe(1)

    // 第二个仍在跑 ⇒ 兜底取消能命中它
    expect(registry.cancel(105)).toBe(true)
    releaseSecond?.()
    expect(await second).toBe('aborted')
    expect(registry.size).toBe(0)
  })
})

describe('runSingleShotTask：取消归属由 harness 负责', () => {
  it('传 senderId ⇒ 运行期间该窗口可取消；结束后自动注销（不留陈旧 controller）', async () => {
    const registry = taskRegistry()
    let signalSeen: AbortSignal | undefined

    const result = await runSingleShotTask({
      isCloud: false,
      estimatedTokens: 10,
      taskType: 'chapter',
      senderId: 4242,
      run: async (signal) => {
        signalSeen = signal
        // 面板点「停止」：主进程此时能命中这一笔
        expect(registry.cancel(4242)).toBe(true)
        expect(signal?.aborted).toBe(true)
        return { value: '部分产出', model: 'stub' }
      }
    })

    expect(result.value).toBe('部分产出')
    expect(signalSeen).toBeInstanceOf(AbortSignal)
    // finally 已注销：再点一次停止返回 false（不是命中陈旧记录）
    expect(registry.cancel(4242)).toBe(false)
  })

  it('不传 senderId ⇒ 不登记（未接入取消的调用方行为不变）', async () => {
    const registry = taskRegistry()
    await runSingleShotTask({
      isCloud: false,
      estimatedTokens: 10,
      taskType: 'chapter',
      run: async (signal) => {
        expect(signal).toBeUndefined()
        expect(registry.size).toBe(0)
        return { value: 'x' }
      }
    })
  })
})
