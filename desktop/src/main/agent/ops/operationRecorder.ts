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

import type { BrainToolRunner } from '../../../shared/agent/brain'
import type { OperationRecord } from '../../../shared/agent/observability'
import type { SkillExecutionContext, SkillResult } from '../../../shared/agent/config'
import type { OperationLogStore } from '../store/operationLogStore'
import type { DeliveryLogStore } from '../store/deliveryLogStore'

/** 记录器需要的条目形态（`ItemRecord` 的结构子集） */
export interface RecorderItem {
  id: string
  type: string
  data: Record<string, unknown>
}

export interface OperationRecorderDeps {
  operationLog: OperationLogStore
  /**
   * 交付日志（可选）：导出类动作成功后记一条「交付了某文件」。
   * 与操作日志分开存——交付不可回滚，混进去会污染回滚计划。
   */
  deliveryLog?: DeliveryLogStore
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

/** 取路径最后一段（交付卡展示用；不引 node:path） */
function baseNameOf(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index === -1 ? normalized : normalized.slice(index + 1)
}

/**
 * 从技能结果里提取「交付文件」：目前唯一来源是 `system.ceshu` 的 `export` 动作，
 * 成功后 `data.filePath` 即交付文件的绝对路径。非导出动作/失败一律返回 null（不造假交付）。
 */
function extractDelivery(
  toolName: string,
  params: Record<string, unknown>,
  result: SkillResult
): { path: string; bytes: number } | null {
  if (toolName !== 'system.ceshu' || result.success !== true) return null
  if (params['action'] !== 'export') return null
  const data = toPayload(result.data)
  if (data === null) return null
  const filePath = typeof data['filePath'] === 'string' ? data['filePath'].trim() : ''
  if (filePath === '') return null
  const bytes = typeof data['bytes'] === 'number' && Number.isFinite(data['bytes']) ? data['bytes'] : 0
  return { path: filePath, bytes }
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
      // 无会话上下文：不记录任何东西，直接执行
      const conversationId = typeof ctx.sessionId === 'string' ? ctx.sessionId.trim() : ''
      const described = describeOperation(toolName, params)
      // 变更前快照必须在执行**前**抓（执行后数据已变）
      const snapshot =
        described !== null && conversationId !== '' && described.opType !== 'create'
          ? locateItem(deps.listItems(), params)
          : null

      const result = await inner.execute(toolName, params, ctx)

      // ① 数据变更记录（成功才记；定位不到条目不记，避免写出指向错误条目的回滚计划）
      if (described !== null && conversationId !== '' && result.success === true) {
        const after = extractItem(result)
        const itemId = after?.id ?? snapshot?.id ?? ''
        const dataType = after?.type ?? snapshot?.type ?? ''
        if (itemId !== '' && dataType !== '') {
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
        }
      }

      // ② 交付记录（导出成功 → 交付了某文件；与数据变更分开存，交付不可回滚）
      if (deps.deliveryLog !== undefined && conversationId !== '') {
        const delivery = extractDelivery(toolName, params, result)
        if (delivery !== null) {
          deps.deliveryLog.record({
            conversationId,
            path: delivery.path,
            label: baseNameOf(delivery.path),
            bytes: delivery.bytes,
            timestamp: (deps.now ?? Date.now)()
          })
        }
      }

      return result
    }
  }
}
