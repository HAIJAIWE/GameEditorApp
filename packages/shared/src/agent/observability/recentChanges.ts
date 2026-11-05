/**
 * 「最近改动」的**展示投影**（IPC `agent:recentChanges` 的出口单源）。
 *
 * 为什么要投影而不是直接下发 `OperationRecord`：
 * - `before/after` 是回滚依赖的完整快照（`buildRollbackPlan` 直接读它）。
 *   渲染层**没有任何回滚入口**，不需要看快照，更不该能改它；
 *   全量下发既扩大泄密面，也让「展示时脱敏」变成一场追着新组件补的打地鼠。
 * - `itemName` 是用户自由文本，可能含 `api_key=sk-…` 这类密钥。
 *   在主进程出口就脱敏，密钥根本不跨 IPC 边界。
 *
 * 边界：**存储层零改动**。`maskSecrets` 只作用于发给 UI 的投影，
 * 落盘的 `OperationRecord` 保持原文，回滚数据不会被 `****` 污染。
 */

import { maskSecrets } from '../../util/security/secretMask'
import type { OperationRecord } from './operationLog'

/** 面板与对话内联改动卡需要的字段（没有 before/after） */
export interface RecentChangeView {
  opType: OperationRecord['opType']
  dataType: string
  itemId: string
  /** 已脱敏的条目名 */
  itemName: string
  conversationId: string
  timestamp: number
  /** 该条目名被遮挡了几处密钥；缺省/0 表示没遮挡 */
  maskedCount?: number
}

/** 把操作记录投影成可安全下发的展示数据（纯函数，可单测） */
export function toRecentChangeViews(records: readonly OperationRecord[]): RecentChangeView[] {
  return records.map((record) => {
    const masked = maskSecrets(record.itemName)
    return {
      opType: record.opType,
      dataType: record.dataType,
      itemId: record.itemId,
      itemName: masked.text,
      conversationId: record.conversationId,
      timestamp: record.timestamp,
      ...(masked.count > 0 ? { maskedCount: masked.count } : {})
    }
  })
}
