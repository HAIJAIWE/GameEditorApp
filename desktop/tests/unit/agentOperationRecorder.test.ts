import { describe, expect, it } from 'vitest'

import { createRecordingToolRunner, locateItem } from '../../src/main/agent/operationRecorder'
import { OperationLogStore } from '../../src/main/agent/operationLogStore'
import { createRollbackSkill, type RollbackDataPort } from '../../src/main/agent/skills/rollbackSkill'
import type { BrainToolRunner } from '../../src/shared/agent/brain'
import type { SkillResult } from '../../src/shared/agent/protocol'

const ROLE = { id: 'r1', type: 'role', data: { name: '法师', hp: 320 } }

function makeInner(result: SkillResult, calls: Array<{ tool: string; params: Record<string, unknown> }> = []): BrainToolRunner {
  return {
    resolve: (name) => name,
    needsConfirmation: () => false,
    execute: async (toolName, params) => {
      calls.push({ tool: toolName, params })
      return result
    }
  }
}

function makeRecorder(
  result: SkillResult,
  items: Array<{ id: string; type: string; data: Record<string, unknown> }> = [ROLE],
  calls: Array<{ tool: string; params: Record<string, unknown> }> = []
) {
  const operationLog = new OperationLogStore()
  const runner = createRecordingToolRunner(makeInner(result, calls), {
    operationLog,
    listItems: () => items,
    now: () => 1234
  })
  return { operationLog, runner, calls }
}

describe('locateItem：定位目标（歧义不猜）', () => {
  it('item_id 优先；无 item_id 时要求 name 唯一命中', () => {
    const items = [ROLE, { id: 'r2', type: 'role', data: { name: '战士' } }]
    expect(locateItem(items, { item_id: 'r2' })?.id).toBe('r2')
    expect(locateItem(items, { name: '战士' })?.id).toBe('r2')
    expect(locateItem(items, { name: '不存在' })).toBeNull()
    expect(locateItem(items, {})).toBeNull()
  })

  it('同名多条 → 返回 null（不猜）', () => {
    const items = [ROLE, { id: 'r9', type: 'role', data: { name: '法师' } }]
    expect(locateItem(items, { name: '法师' })).toBeNull()
  })
})

describe('createRecordingToolRunner：会话内数据变更的记录', () => {
  it('无 sessionId → 不记录（对齐 旧版「非会话上下文不记录」）', async () => {
    const { operationLog, runner } = makeRecorder({ success: true, message: '', data: ROLE })
    await runner.execute('system.game_data', { action: 'create' }, {})
    expect(operationLog.count()).toBe(0)
  })

  it('非数据表工具 / 非增删改动作 → 不记录', async () => {
    const { operationLog, runner } = makeRecorder({ success: true, message: '', data: ROLE })
    await runner.execute('tool.ask_user', { action: 'ask' }, { sessionId: 'c1' })
    await runner.execute('system.game_data', { action: 'list_types' }, { sessionId: 'c1' })
    expect(operationLog.count()).toBe(0)
  })

  it('执行失败 → 不记录（失败的操作不该进回滚计划）', async () => {
    const { operationLog, runner } = makeRecorder({ success: false, message: '', error: '炸了' })
    await runner.execute('system.game_data', { action: 'create' }, { sessionId: 'c1' })
    expect(operationLog.count()).toBe(0)
  })

  it('create：before 为 null，after 取自结果，项名与时间戳就位', async () => {
    const { operationLog, runner } = makeRecorder({ success: true, message: '', data: ROLE })
    await runner.execute('system.game_data', { action: 'create' }, { sessionId: 'c1' })

    const [record] = operationLog.listByConversation('c1')
    expect(record).toMatchObject({
      opType: 'create',
      dataType: 'role',
      itemId: 'r1',
      itemName: '法师',
      before: null,
      conversationId: 'c1',
      timestamp: 1234
    })
    expect(record?.after).toEqual({ name: '法师', hp: 320, id: 'r1' })
  })

  it('update：before 取自变更前快照（按 item_id 定位）', async () => {
    const updated = { id: 'r1', type: 'role', data: { name: '法师', hp: 999 } }
    const { operationLog, runner } = makeRecorder({ success: true, message: '', data: updated })
    await runner.execute('system.game_data', { action: 'update', item_id: 'r1' }, { sessionId: 'c1' })

    const [record] = operationLog.listByConversation('c1')
    expect(record?.before).toEqual({ name: '法师', hp: 320, id: 'r1' })
    expect(record?.after).toEqual({ name: '法师', hp: 999, id: 'r1' })
  })

  it('delete：before 按唯一 name 定位；after 为 null', async () => {
    const { operationLog, runner } = makeRecorder({ success: true, message: '', data: null })
    await runner.execute('system.game_data', { action: 'delete', name: '法师', confirm: true }, { sessionId: 'c1' })

    const [record] = operationLog.listByConversation('c1')
    expect(record).toMatchObject({ opType: 'delete', itemId: 'r1', itemName: '法师', after: null })
    expect(record?.before).toEqual({ name: '法师', hp: 320, id: 'r1' })
  })

  it('定位不到目标（同名歧义）→ before 为 null，不伪造快照', async () => {
    const items = [ROLE, { id: 'r9', type: 'role', data: { name: '法师' } }]
    const { operationLog, runner } = makeRecorder({ success: true, message: '', data: null }, items)
    await runner.execute('system.game_data', { action: 'delete', name: '法师' }, { sessionId: 'c1' })
    // 无结果 id 也无快照 → 整条不记录（宁缺勿错）
    expect(operationLog.count()).toBe(0)
  })
})

describe('tool.rollback_ai_changes：确认门与执行', () => {
  function makePort(over: Partial<RollbackDataPort> = {}): RollbackDataPort & { calls: string[] } {
    const calls: string[] = []
    return {
      calls,
      deleteItem: async (id: string) => {
        calls.push(`delete:${id}`)
        return true
      },
      updateItem: async (id: string) => {
        calls.push(`update:${id}`)
        return undefined
      },
      importRecords: async (records) => {
        calls.push(`import:${records[0]?.id ?? ''}`)
        return undefined
      },
      ...over
    }
  }

  /** 造一条会话记录（用记录器，确保与真实写入路径一致） */
  async function seed(operationLog: OperationLogStore): Promise<void> {
    const { runner } = makeRecorder({ success: true, message: '', data: ROLE })
    const recording = createRecordingToolRunner(runner, { operationLog, listItems: () => [ROLE] })
    await recording.execute('system.game_data', { action: 'create' }, { sessionId: 'c1' })
  }

  it('未知动作报错', () => {
    const log = new OperationLogStore()
    const skill = createRollbackSkill({ operationLog: log, dataService: makePort() })
    expect(skill.execute({ action: 'undo' }, {})).toEqual({ success: false, error: '未知动作: undo', message: '' })
  })

  it('无 session_id 且上下文无会话 → 明确报错', () => {
    const log = new OperationLogStore()
    const skill = createRollbackSkill({ operationLog: log, dataService: makePort() })
    expect(skill.execute({ action: 'rollback' }, {})).toEqual({
      success: false,
      error: '没有可回滚的会话（缺少 session_id）',
      message: ''
    })
  })

  it('无记录 → 成功但提示没有可回滚的改动（不是错误）', async () => {
    const log = new OperationLogStore()
    const skill = createRollbackSkill({ operationLog: log, dataService: makePort() })
    const result = await skill.execute({ action: 'rollback' }, { sessionId: 'empty' })
    expect(result).toEqual({ success: true, message: '本次对话没有可回滚的数据改动', data: { count: 0 } })
  })

  it('未确认 → 返回 confirm 交互且**不执行任何回滚**', async () => {
    const log = new OperationLogStore()
    await seed(log)
    const port = makePort()
    const skill = createRollbackSkill({ operationLog: log, dataService: port })

    const result = await skill.execute({ action: 'rollback' }, { sessionId: 'c1' })
    expect(result.success).toBe(false)
    expect(result.interaction).toEqual({
      kind: 'confirm',
      prompt: '确认撤销本次对话的全部数据改动（1 项）？此操作不可撤销。'
    })
    expect(port.calls).toEqual([])
    expect(log.countByConversation('c1')).toBe(1)
  })

  it('确认后执行回滚并清空该会话记录（防重复回滚）', async () => {
    const log = new OperationLogStore()
    await seed(log)
    const port = makePort()
    const skill = createRollbackSkill({ operationLog: log, dataService: port })

    const result = await skill.execute({ action: 'rollback', confirm: true }, { sessionId: 'c1' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('已撤销 1 项数据改动')
    expect(port.calls).toEqual(['delete:r1'])
    expect(log.countByConversation('c1')).toBe(0)
  })

  it('部分失败/跳过 → 消息如实列出，且 success 为 false（不谎报成功）', async () => {
    const log = new OperationLogStore()
    await seed(log)
    const skill = createRollbackSkill({
      operationLog: log,
      dataService: makePort({
        deleteItem: async () => {
          throw new Error('库锁住了')
        }
      })
    })

    const result = await skill.execute({ action: 'rollback', confirm: true }, { sessionId: 'c1' })
    expect(result.success).toBe(false)
    expect(result.message).toContain('1 项失败')
    expect(result.error).toContain('库锁住了')
  })
})
