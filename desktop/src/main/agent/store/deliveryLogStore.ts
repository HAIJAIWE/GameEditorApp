/**
 * 交付日志的内存存储（与 `operationLogStore` 同构，但语义独立：交付不可回滚）。
 *
 * 内存态、不落盘：交付卡只展示「本次运行里刚交付的文件」，跨重启保留没有意义
 * （文件可能已被移动/删除，旧记录反而误导）。超上限淘汰最旧一批。
 */

import type { DeliveryRecord } from '../../../shared/agent/observability'

/** 内存上限（超出后淘汰最旧一批） */
export const MAX_DELIVERIES = 2000
/** 每次超限淘汰的条目数 */
export const PURGE_DELIVERIES = 200

/** 「最近交付」的收窄条件（缺省 = 不筛） */
export interface DeliveryFilter {
  /** 只保留 `timestamp >= since` 的记录（对话面板传本轮开始时间） */
  since?: number
  /** 只保留该会话的记录 */
  conversationId?: string
}

export class DeliveryLogStore {
  private records: DeliveryRecord[] = []
  private seq = 0

  /** 记录一次交付；返回记录后的总条数（便于调用方断言） */
  record(entry: Omit<DeliveryRecord, 'id'>): number {
    this.seq += 1
    this.records.push({ ...entry, id: `d${this.seq}` })
    if (this.records.length > MAX_DELIVERIES) {
      this.records = this.records.slice(PURGE_DELIVERIES)
    }
    return this.records.length
  }

  /** 最近 N 条交付（新→旧），可按会话 / 起始时间收窄（先筛再截断，与操作日志同序） */
  listRecentFiltered(limit = 50, filter: DeliveryFilter = {}): DeliveryRecord[] {
    const n = Number.isFinite(limit) && limit > 0 ? Math.trunc(limit) : 50
    const { since, conversationId } = filter
    const matched = this.records.filter(
      (record) =>
        (conversationId === undefined || record.conversationId === conversationId) &&
        (since === undefined || record.timestamp >= since)
    )
    return matched.slice(-n).reverse()
  }

  /** 清空某会话的交付记录；返回删除条数 */
  clearConversation(conversationId: string): number {
    const before = this.records.length
    this.records = this.records.filter((record) => record.conversationId !== conversationId)
    return before - this.records.length
  }
}
