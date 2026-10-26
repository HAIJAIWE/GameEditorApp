/**
 * 操作日志的内存存储（对齐 旧版 `OperationLog` 的 `_operations` / `_MAX_OPERATIONS`）。
 *
 * **内存态、不落盘**：日志只服务于「本次运行内回滚刚发生的 AI 改动」，
 * 跨重启保留反而危险（数据可能已被手动改动，拿旧快照回滚会覆盖用户的手工结果）。
 *
 * 只保留上限内的条目、超限淘汰最旧的一批（旧版 同为 5000 / 批次 500）。
 * 单进程单线程（主进程），故无锁；写入按到达顺序追加。
 */

import { buildRollbackPlan, type OperationRecord, type RollbackOutcome, type RollbackPlan } from '../../shared/agent/operationLog'

/** 内存上限（超出后淘汰最旧一批，防长时间运行内存增长） */
export const MAX_OPERATIONS = 5000
/** 每次超限淘汰的条目数（旧条目优先） */
export const PURGE_BATCH = 500

export class OperationLogStore {
  private operations: OperationRecord[] = []

  /** 记录一次变更；返回记录后的总条数（便于调用方断言） */
  record(record: OperationRecord): number {
    this.operations.push(record)
    if (this.operations.length > MAX_OPERATIONS) {
      this.operations = this.operations.slice(PURGE_BATCH)
    }
    return this.operations.length
  }

  /** 某会话的全部记录（按发生顺序） */
  listByConversation(conversationId: string): OperationRecord[] {
    return this.operations.filter((record) => record.conversationId === conversationId)
  }

  count(): number {
    return this.operations.length
  }

  countByConversation(conversationId: string): number {
    return this.listByConversation(conversationId).length
  }

  /** 生成某会话的回滚计划（纯逻辑委托给 `buildRollbackPlan`） */
  planRollback(conversationId: string): RollbackPlan {
    return buildRollbackPlan(this.listByConversation(conversationId))
  }

  /** 清除某会话的记录（回滚后调用，避免重复回滚） */
  clearConversation(conversationId: string): number {
    const before = this.operations.length
    this.operations = this.operations.filter((record) => record.conversationId !== conversationId)
    return before - this.operations.length
  }

  /** 清空全部（对齐 旧版 `clear()`） */
  clear(): void {
    this.operations = []
  }
}

/** 执行回滚计划所需的最小数据操作端口（便于单测注入真实 DataService 或替身） */
export interface RollbackPort {
  removeItem: (id: string) => Promise<boolean>
  updateItem: (id: string, data: Record<string, unknown>) => Promise<unknown>
  /** 按原快照原样写回（含 id），用于恢复被删条目 */
  insertItem: (record: { id: string; type: string; data: Record<string, unknown> }) => Promise<unknown>
}

/**
 * 执行回滚计划：逐步应用，**单步失败不中断整体**（旧版 同为收集 errors 后继续），
 * 最终回报「成功数 / 失败原因 / 跳过项」——不做「回滚成功」的假象。
 */
export async function executeRollbackPlan(plan: RollbackPlan, port: RollbackPort): Promise<RollbackOutcome> {
  let count = 0
  const errors: string[] = []

  for (const step of plan.steps) {
    try {
      if (step.kind === 'remove') {
        const removed = await port.removeItem(step.itemId)
        if (!removed) {
          errors.push(`删除「${step.itemName}」失败：条目不存在`)
          continue
        }
      } else {
        const id = typeof step.snapshot['id'] === 'string' ? step.snapshot['id'] : step.itemId
        await port.insertItem({ id, type: step.dataType, data: step.snapshot })
      }
      count += 1
    } catch (error) {
      errors.push(`${step.kind === 'remove' ? '删除' : '恢复'}「${step.itemName}」：${error instanceof Error ? error.message : String(error)}`)
    }
  }

  return { count, errors, skipped: plan.skipped }
}
