/**
 * 操作日志与**会话级回滚**（D 档 `core/operation_log` 的 TS 迁移）。
 *
 * 语义澄清（读源码后确认，勿按名字臆测）：它**不是通用撤销**，而是 **AI 会话级安全网**——
 * 旧版 原实现 `if not conv_id: return`，即**只记录 AI 驱动会话中的数据变更，不记手动编辑**；
 * 随后可按会话把该次对话造成的所有数据改动**整段反向执行**，恢复到对话之前的状态。
 *
 * TS 与 旧版 的两处必要差异：
 *  1. 旧版 用 `threading.local()` 存 conv_id；TS 是单线程异步、无 thread-local 语义
 *     （await 交错会让「线程局部」失效）。故改为**显式上下文传递**（`SkillExecutionContext.sessionId`），
 *     全项目不使用全局可变态。
 *  2. 旧版 把日志与回滚都塞在 `OperationLog` 一个类里；TS 拆开——**回落计划是纯函数**
 *     （本文件，可完整单测），存储与执行在 `main/agent/operationLogStore.ts`。
 */

/** 一次数据变更的记录 */
export interface OperationRecord {
  opType: 'create' | 'update' | 'delete'
  /** 数据类型（单数 id，如 `role`）；回滚时需能直接定位 */
  dataType: string
  itemId: string
  /** 条目名，便于展示「AI 改了哪些东西」 */
  itemName: string
  /** 变更前快照（create 为 null） */
  before: Record<string, unknown> | null
  /** 变更后快照（delete 为 null） */
  after: Record<string, unknown> | null
  /** 所属会话（回滚按此分组） */
  conversationId: string
  timestamp: number
}

/** 回滚计划中的一步（对 DataService 的逆向动作） */
export type RollbackStep =
  | { kind: 'remove'; dataType: string; itemId: string; itemName: string }
  | { kind: 'restore'; dataType: string; itemId: string; itemName: string; snapshot: Record<string, unknown> }

/** 无法回滚的条目（附中文原因）——**不静默跳过**，交调用方展示 */
export interface RollbackSkip {
  opType: OperationRecord['opType']
  itemName: string
  reason: string
}

export interface RollbackPlan {
  steps: RollbackStep[]
  skipped: RollbackSkip[]
}

/**
 * 由操作记录生成回滚计划（**纯函数**）：按记录**逆序**（后进先出）生成逆向动作。
 *  - create → remove（删掉 AI 新建的）
 *  - update → restore（写回变更前快照）
 *  - delete → restore（写回被删前的快照）
 *
 * 缺少必要快照的记录**不静默丢弃**，而是进 `skipped` 并给出中文原因（避免「回滚成功」的假象）。
 */
export function buildRollbackPlan(records: readonly OperationRecord[]): RollbackPlan {
  const steps: RollbackStep[] = []
  const skipped: RollbackSkip[] = []

  for (const record of [...records].reverse()) {
    if (record.opType === 'create') {
      steps.push({
        kind: 'remove',
        dataType: record.dataType,
        itemId: record.itemId,
        itemName: record.itemName
      })
      continue
    }
    if (record.before === null) {
      skipped.push({
        opType: record.opType,
        itemName: record.itemName,
        reason: `${record.opType} 记录缺少变更前快照，无法恢复`
      })
      continue
    }
    steps.push({
      kind: 'restore',
      dataType: record.dataType,
      itemId: record.itemId,
      itemName: record.itemName,
      snapshot: record.before
    })
  }

  return { steps, skipped }
}

/** 回滚结果 */
export interface RollbackOutcome {
  /** 成功回滚的条目数 */
  count: number
  /** 失败条目（中文原因） */
  errors: string[]
  /** 因缺快照而未执行的条目 */
  skipped: RollbackSkip[]
}
