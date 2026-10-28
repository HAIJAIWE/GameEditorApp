/**
 * 操作记录器（E3-2）：把 `BrainToolRunner` 包一层，记录 **Agent 会话内的数据变更**，
 * 供 `tool.rollback_ai_changes` 按会话回滚。
 *
 * 为什么包在 runner 上：`createDispatcherToolRunner()` 是 Agent 改数据的**唯一漏斗**
 * （技能只能经它执行），在此处记录一次即可全覆盖，不必改动三个技能的执行器、也不会漏掉新增技能。
 * 会话标识来自 `SkillExecutionContext.sessionId`（显式上下文，不用全局态）。
 *
 * **宁缺勿错**：
 *  - 只记录**执行成功**的操作（失败的操作不该进回滚计划）；
 *  - update/delete 的「变更前快照」按 `item_id` 或**唯一** `name` 定位，**歧义或找不到就不猜**，
 *    此时 `before` 为 null → 由 `buildRollbackPlan` 归入 `skipped` 并给出中文原因，
 *    绝不静默伪造一份快照（那会在回滚时把用户数据写坏）。
 */

import type { BrainToolRunner } from '../../shared/agent/brain'
import type { OperationRecord } from '../../shared/agent/operationLog'
import type { SkillExecutionContext, SkillResult } from '../../shared/agent/protocol'
import type { OperationLogStore } from './operationLogStore'

/** 记录器需要的条目形态（`ItemRecord` 的结构子集） */
export interface RecorderItem {
  id: string
  type: string
  data: Record<string, unknown>
}

export interface OperationRecorderDeps {
  operationLog: OperationLogStore
  /** 列出全部条目：用于定位目标并抓「变更前快照」 */
  listItems: () => RecorderItem[]
  /** 时间戳来源（测试可注入确定性实现） */
  now?: () => number
}

/** 唯一被记录变更的工具 */
const GAME_DATA_TOOL = 'system.game_data'

function toPayload(value: unknown): Record<string, unknown> | null {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

/** 从技能结果里取出条目（create/update 的 `data` 是 `ItemRecord`） */
function extractItem(result: SkillResult): RecorderItem | null {
  const record = toPayload(result.data)
  if (record === null) return null
  if (typeof record['id'] !== 'string' || typeof record['type'] !== 'string') return null
  const payload = toPayload(record['data'])
  return { id: record['id'], type: record['type'], data: payload ?? {} }
}

function itemNameOf(item: RecorderItem | null): string | null {
  if (item === null) return null
  const name = item.data['name']
  return typeof name === 'string' && name.trim() !== '' ? name.trim() : null
}

/** 定位目标条目：`item_id` 优先；否则要求 `name` **唯一命中**（歧义不猜，返回 null） */
export function locateItem(items: readonly RecorderItem[], params: Record<string, unknown>): RecorderItem | null {
  const itemId = typeof params['item_id'] === 'string' ? params['item_id'].trim() : ''
  if (itemId !== '') {
    return items.find((item) => item.id === itemId) ?? null
  }
  const name = typeof params['name'] === 'string' ? params['name'].trim() : ''
  if (name === '') return null
  const matches = items.filter((item) => item.data['name'] === name)
  return matches.length === 1 ? matches[0] : null
}

/** 是否为需记录的数据变更；不是则返回 null */
function describeOperation(
  toolName: string,
  params: Record<string, unknown>
): { opType: OperationRecord['opType'] } | null {
  if (toolName !== GAME_DATA_TOOL) return null
  const action = typeof params['action'] === 'string' ? params['action'] : ''
  if (action === 'create' || action === 'update' || action === 'delete') {
    return { opType: action }
  }
  return null
}

/** 包一层记录器；`inner` 为实际执行器（通常是 `createDispatcherToolRunner` 的产物） */
export function createRecordingToolRunner(
  inner: BrainToolRunner,
  deps: OperationRecorderDeps
): BrainToolRunner {
  return {
    resolve: (toolName) => inner.resolve(toolName),
    needsConfirmation: (toolName, action) => inner.needsConfirmation(toolName, action),
    execute: async (toolName, params, ctx: SkillExecutionContext) => {
      const described = describeOperation(toolName, params)
      // 无会话上下文不记录
      const conversationId = typeof ctx.sessionId === 'string' ? ctx.sessionId.trim() : ''
      if (described === null || conversationId === '') {
        return inner.execute(toolName, params, ctx)
      }

      const snapshot = described.opType === 'create' ? null : locateItem(deps.listItems(), params)
      const result = await inner.execute(toolName, params, ctx)
      if (result.success !== true) return result

      const after = extractItem(result)
      const itemId = after?.id ?? snapshot?.id ?? ''
      const dataType = after?.type ?? snapshot?.type ?? ''
      // 定位不到条目（既无结果 id 也无快照）→ 不记录，避免写出指向错误条目的回滚计划
      if (itemId === '' || dataType === '') return result

      deps.operationLog.record({
        opType: described.opType,
        dataType,
        itemId,
        itemName: itemNameOf(after) ?? itemNameOf(snapshot) ?? itemId,
        before: snapshot === null ? null : { ...snapshot.data, id: snapshot.id },
        after: after === null ? null : { ...after.data, id: after.id },
        conversationId,
        timestamp: (deps.now ?? Date.now)()
      })
      return result
    }
  }
}
