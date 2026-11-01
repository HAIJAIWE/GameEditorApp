/**
 * 通用撤销栈的纯逻辑（撤销/重做「安全子集」）。
 *
 * 设计约束（见迁移收尾任务书）：
 * - 纯逻辑，**不依赖任何业务域**（lint 规则 2：util 禁止 import domain/**）。
 *   `UndoStep`/`UndoSkip` 在本文件内本地定义，不复用 `shared/agent/operationLog.ts`
 *   （那是 agent 层，跨层会破坏分层），但保持同形状、同中文原因文案。
 * - `before`/`after` 直接用 `ItemRecord`，因为撤销恢复需要完整记录（含 createdAt）。
 */

import type { ItemRecord } from '../../types'

/** 一条可撤销的操作记录 */
export interface UndoEntry {
  opType: 'create' | 'update' | 'delete' | 'batchUpdate' | 'deleteMany'
  /** 数据类型（单数 id） */
  dataType: string
  itemId: string
  /** 条目展示名（优先 name，缺省用 id） */
  itemName: string
  /** 变更前快照（create 为 null） */
  before: ItemRecord | null
  /** 变更后快照（delete 为 null） */
  after: ItemRecord | null
  timestamp: number
  /** 批量操作（batchUpdate/deleteMany）时，每个孩子是一条受影响的叶子记录 */
  children?: UndoEntry[]
}

/** 反向动作：删除某条目（撤销「创建」时使用） */
export type UndoStep =
  | { kind: 'remove'; dataType: string; itemId: string; itemName: string }
  | { kind: 'restore'; dataType: string; itemId: string; itemName: string; snapshot: ItemRecord }

/** 无法反向执行、需交调用方展示中文原因的条目 */
export interface UndoSkip {
  opType: UndoEntry['opType']
  itemName: string
  reason: string
}

/** 撤销栈上限（超出淘汰最旧），与操作日志上限同量级（偏保守） */
export const UNDO_MAX_DEPTH = 100
/** 撤销栈字节上限（所有 entry JSON 之和），超出淘汰最旧（防内存增长，P1） */
export const UNDO_BYTE_CAP = 2 * 1024 * 1024

/** 估算单条 entry 的 JSON 字节数（极端情况下 JSON 失败给保守估值，避免无限增长） */
function byteSize(entry: UndoEntry): number {
  try {
    return JSON.stringify(entry).length
  } catch {
    return 1024
  }
}

/**
 * 撤销/重做栈：LIFO。undo 栈存「可撤销操作」，redo 栈存「已撤销操作」。
 * 新操作入 undo 栈时清空 redo 栈（E5：新操作截断 redo）。
 */
export class UndoStack {
  private undoStack: UndoEntry[] = []
  private redoStack: UndoEntry[] = []
  private byteTotal = 0

  /** 入 undo 栈、清 redo 栈；同时执行深度与字节上限淘汰（最旧优先） */
  pushUndo(entry: UndoEntry): void {
    this.redoStack = []
    this.undoStack.push(entry)
    this.byteTotal += byteSize(entry)
    this.evict()
  }

  /** 入 redo 栈（撤销成功后调用） */
  pushRedo(entry: UndoEntry): void {
    this.redoStack.push(entry)
    this.evictRedo()
  }

  peekUndo(): UndoEntry | null {
    return this.undoStack.length > 0 ? this.undoStack[this.undoStack.length - 1] : null
  }

  peekRedo(): UndoEntry | null {
    return this.redoStack.length > 0 ? this.redoStack[this.redoStack.length - 1] : null
  }

  /** 弹出 undo 栈顶（撤销成功提交后调用） */
  popUndo(): UndoEntry | null {
    const entry = this.undoStack.pop() ?? null
    if (entry) this.byteTotal -= byteSize(entry)
    return entry
  }

  /** 弹出 redo 栈顶（重做成功提交后调用） */
  popRedo(): UndoEntry | null {
    const entry = this.redoStack.pop() ?? null
    if (entry) this.byteTotal -= byteSize(entry)
    return entry
  }

  canUndo(): boolean {
    return this.undoStack.length > 0
  }

  canRedo(): boolean {
    return this.redoStack.length > 0
  }

  /**
   * 当前可撤销/重做状态（渲染层按钮 + 状态栏用）。
   * 批量操作（含 children）的标签统一为「批量操作（N 项）」。
   */
  getState(): { canUndo: boolean; canRedo: boolean; nextUndo: string | null; nextRedo: string | null } {
    const topUndo = this.peekUndo()
    const topRedo = this.peekRedo()
    const nextUndo =
      topUndo !== null
        ? topUndo.children !== undefined && topUndo.children.length > 0
          ? `批量操作（${topUndo.children.length} 项）`
          : topUndo.itemName
        : null
    const nextRedo =
      topRedo !== null
        ? topRedo.children !== undefined && topRedo.children.length > 0
          ? `批量操作（${topRedo.children.length} 项）`
          : topRedo.itemName
        : null
    return { canUndo: this.canUndo(), canRedo: this.canRedo(), nextUndo, nextRedo }
  }

  /** 深度/字节超限时淘汰最旧（先进先出方向） */
  private evict(): void {
    while (this.undoStack.length > UNDO_MAX_DEPTH || this.byteTotal > UNDO_BYTE_CAP) {
      const oldest = this.undoStack.shift()
      if (oldest === undefined) break
      this.byteTotal -= byteSize(oldest)
    }
  }

  private evictRedo(): void {
    while (this.redoStack.length > UNDO_MAX_DEPTH) {
      this.redoStack.shift()
    }
  }
}

/**
 * 由单条操作记录生成反向步骤（**纯函数**，不触碰 IO）。
 *
 * 三态代数（对齐 operationLog.buildRollbackPlan 的同一套中文文案）：
 *  - create → remove（删掉创建出来的条目）
 *  - update / delete → restore（写回 before 快照）
 *  - before === null → 跳过，附中文原因（不静默丢弃，避免「撤销成功」假象）
 *
 * 仅用于叶子操作（create/update/delete）。批量操作（batchUpdate/deleteMany）
 * 的反向由其 children 逐条生成，调用方需先展开；若误传入容器，返回跳过说明。
 */
export function buildReverseStep(entry: UndoEntry): UndoStep | UndoSkip {
  if (entry.opType === 'create') {
    if (entry.after === null) {
      return { opType: 'create', itemName: entry.itemName, reason: 'create 记录缺少变更后快照，无法撤销' }
    }
    return { kind: 'remove', dataType: entry.dataType, itemId: entry.after.id, itemName: entry.itemName }
  }
  if (entry.opType === 'update' || entry.opType === 'delete') {
    if (entry.before === null) {
      return { opType: entry.opType, itemName: entry.itemName, reason: `${entry.opType} 记录缺少变更前快照，无法恢复` }
    }
    return {
      kind: 'restore',
      dataType: entry.dataType,
      itemId: entry.before.id,
      itemName: entry.itemName,
      snapshot: entry.before
    }
  }
  // 容器型（batchUpdate/deleteMany）：应在调用方展开 children 后逐条处理
  return { opType: entry.opType, itemName: entry.itemName, reason: '批量操作需展开子项后逐条撤销' }
}

/**
 * 由单条操作记录生成「正向重做」步骤（**纯函数**）。
 * 重做 = 重新应用原操作：
 *  - create → restore(after)（重新创建）
 *  - update → restore(after)（重新应用更新后的状态）
 *  - delete → remove（再次删除）
 * before === null → 跳过。
 */
export function buildRedoStep(entry: UndoEntry): UndoStep | UndoSkip {
  if (entry.opType === 'create') {
    if (entry.after === null) {
      return { opType: 'create', itemName: entry.itemName, reason: 'create 记录缺少变更后快照，无法重做' }
    }
    return {
      kind: 'restore',
      dataType: entry.dataType,
      itemId: entry.after.id,
      itemName: entry.itemName,
      snapshot: entry.after
    }
  }
  if (entry.opType === 'update') {
    if (entry.after === null) {
      return { opType: 'update', itemName: entry.itemName, reason: 'update 记录缺少变更后快照，无法重做' }
    }
    return {
      kind: 'restore',
      dataType: entry.dataType,
      itemId: entry.after.id,
      itemName: entry.itemName,
      snapshot: entry.after
    }
  }
  if (entry.opType === 'delete') {
    return { kind: 'remove', dataType: entry.dataType, itemId: entry.itemId, itemName: entry.itemName }
  }
  return { opType: entry.opType, itemName: entry.itemName, reason: '批量操作需展开子项后逐条重做' }
}

/** 取出一条（含 children 容器）的叶子记录列表，便于批量撤销/重做逐条执行 */
export function leafEntries(entry: UndoEntry): UndoEntry[] {
  if (entry.children !== undefined && entry.children.length > 0) return entry.children
  return [entry]
}
