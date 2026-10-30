/**
 * 交付日志（对齐 dsh `ui-deliverables` 的 delivery cards）。
 *
 * 记录 Agent 在一次会话里**显式交付给用户的文件**——目前唯一来源是
 * `system.ceshu` 的 `export` 动作（成功后 `data.filePath` 即交付文件）。
 *
 * ## 为什么不复用 operationLog
 * 操作日志是「数据变更 + 可按会话回滚」：交付出去的文件**不可回滚**，
 * 混进去会污染回滚计划（`buildRollbackPlan` 会把交付当数据变更处理）。
 * 故独立成一份轻量内存日志，只服务「交付卡」展示。
 */
export interface DeliveryRecord {
  id: string
  /** 所属会话（与操作日志同源，便于按轮次/会话过滤） */
  conversationId: string
  /** 交付文件的绝对路径 */
  path: string
  /** 展示用文件名（basename） */
  label: string
  /** 文件字节数（未知为 0） */
  bytes: number
  timestamp: number
}
