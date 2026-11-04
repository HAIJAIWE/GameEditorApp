import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { createSubagentLedgerStore } from '@mobai/agent-core/store/subagentLedgerStore'
import {
  reconcileInterrupted,
  trimLedger,
  type SubagentRecord
} from '@mobai/shared/agent/brain'

/**
 * 子智能体账本（跨轮冷恢复）。
 *
 * 为什么必须有：子智能体是后台异步跑的，运行态只在内存 `pendingSubagents` 里。
 * 进程一退，用户就再也分不清「刚才派出去的子任务」是跑完了还是被中断了。
 * 这组测试守两件事：对账的幂等性（不能把已完成的重标）、以及重启后能从磁盘读回。
 */

const running = (id: string, startedAt = 1000): SubagentRecord => ({
  id,
  task: `task ${id}`,
  status: 'running',
  startedAt
})

describe('reconcileInterrupted', () => {
  it('把 running 标为 interrupted，保留 task 与 startedAt', () => {
    const { records, interrupted } = reconcileInterrupted([running('sub_1')], 2000)
    expect(interrupted).toHaveLength(1)
    expect(records[0]).toMatchObject({
      id: 'sub_1',
      task: 'task sub_1',
      status: 'interrupted',
      startedAt: 1000,
      endedAt: 2000
    })
  })

  it('已完成 / 失败的记录不动，重复对账幂等', () => {
    const done: SubagentRecord = {
      id: 'sub_2',
      task: 't',
      status: 'done',
      startedAt: 1,
      endedAt: 2,
      text: 'ok'
    }
    const first = reconcileInterrupted([done, running('sub_3')], 10)
    const second = reconcileInterrupted(first.records, 20)
    expect(second.interrupted).toHaveLength(0)
    expect(second.records).toEqual(first.records)
  })
})

describe('trimLedger', () => {
  it('超过上限只留最近 N 条（按 startedAt 倒序）', () => {
    const records = Array.from({ length: 5 }, (_, index) => running(`sub_${index}`, index))
    expect(trimLedger(records, 3).map((record) => record.id)).toEqual(['sub_4', 'sub_3', 'sub_2'])
  })
})

describe('createSubagentLedgerStore', () => {
  it('recordStart / recordEnd 落盘，新实例能读回', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-ledger-'))
    try {
      const path = join(dir, 'subagents.json')
      const store = createSubagentLedgerStore(path)
      store.port.recordStart({ id: 'sub_1', task: '调研', startedAt: 100 })
      expect(store.list()[0]).toMatchObject({ id: 'sub_1', status: 'running' })

      store.port.recordEnd('sub_1', { success: true, text: '结果', endedAt: 200 })
      expect(store.list()[0]).toMatchObject({ status: 'done', text: '结果' })

      // 模拟「重开应用」：新实例必须从磁盘读回，而不是空账本
      expect(createSubagentLedgerStore(path).list()[0]).toMatchObject({
        id: 'sub_1',
        status: 'done'
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('重启后 reconcile 把残留 running 标中断并持久化', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-ledger-'))
    try {
      const path = join(dir, 'subagents.json')
      createSubagentLedgerStore(path).port.recordStart({
        id: 'sub_9',
        task: '长任务',
        startedAt: 1
      })

      const restarted = createSubagentLedgerStore(path)
      expect(restarted.reconcile(5000).map((record) => record.id)).toEqual(['sub_9'])
      expect(createSubagentLedgerStore(path).list()[0]).toMatchObject({
        status: 'interrupted',
        endedAt: 5000
      })
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('文件损坏 / 不存在时当作空账本，不抛错', () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-ledger-'))
    try {
      const path = join(dir, 'subagents.json')
      expect(createSubagentLedgerStore(path).list()).toEqual([])

      writeFileSync(path, '{ not json', 'utf8')
      expect(createSubagentLedgerStore(path).list()).toEqual([])
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})
