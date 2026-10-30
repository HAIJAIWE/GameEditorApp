/**
 * 撤销/重做记录器（主进程侧）：持有 `UndoStack`，把用户手动操作的反向执行落地。
 *
 * 设计要点（见迁移收尾任务书）：
 * - 仅服务「用户手动操作」的安全子集（create/update/delete/batchUpdate/deleteMany），
 *   不含 importRecords（靠 backup 恢复）。
 * - 撤销/重做的执行**只调非记录原语**（restoreItem/deleteById/runAtomicTask），
 *   绝不调会记录的公开 mutator，否则自记录成环（重入防护）。
 * - 失败收集、单步不中断（对齐 operationLogStore.executeRollbackPlan 风格）。
 * - 整段以 ONE `runAtomicTask` 执行，保证原子且不破坏写队列；peek-then-commit，
 *   仅整段 resolve 才把 entry 从 undo 栈移入 redo 栈，失败保留历史（E8）。
 */

import { buildRedoStep, buildReverseStep, leafEntries, UndoStack, type UndoEntry, type UndoStep, type UndoSkip } from '../../shared/util/system/undoStack'
import type { ItemRecord } from '../../shared/types'
import type { UndoResult, UndoState } from '../../shared/ipc'

/** 撤销/重做执行所需的最小数据操作端口（便于单测注入替身） */
export interface UndoRecorderPort {
  /** 按完整记录写回（含显式 createdAt/updatedAt），恢复被删项不丢 createdAt（E10） */
  restoreItem(record: ItemRecord): Promise<void>
  /** 按 id 删除（非记录原语） */
  deleteById(id: string): Promise<boolean>
  /** 当前记录（E1/E2/E3 前置检查用） */
  getItem(id: string): ItemRecord | undefined
  /** id 是否已存在（E4 冲突检查） */
  exists(id: string): boolean
  /** 整段原子执行（包一层写队列） */
  runAtomicTask<T>(op: () => Promise<T>): Promise<T>
}

/** 单条失败/跳过项的统一展示形态 */
interface Issue {
  name: string
  reason: string
}

/**
 * 规范化 JSON：递归按 key 排序，忽略插入顺序差异（用于 compare-and-skip，E2/E3）。
 *
 * `undefined` 值的键**视同不存在**——与 JSON 语义一致（`JSON.stringify` 会丢弃它们，
 * 数据经 SQLite 往返后也会消失）。否则 `{a:undefined}` 会被判为与 `{}` 不同，
 * 造成「用户其实没改、却报已修改」的假跳过（fail-safe 方向，但仍是误判）。
 */
function canonicalJson(value: unknown): string {
  if (value === null || typeof value !== 'object') return String(JSON.stringify(value))
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(',')}]`
  const obj = value as Record<string, unknown>
  const keys = Object.keys(obj)
    .filter((key) => obj[key] !== undefined)
    .sort()
  return `{${keys.map((k) => `${JSON.stringify(k)}:${canonicalJson(obj[k])}`).join(',')}}`
}

/** 深度相等比较（忽略键顺序） */
function sameData(a: Record<string, unknown>, b: Record<string, unknown>): boolean {
  return canonicalJson(a) === canonicalJson(b)
}

export class UndoRecorder {
  private readonly stack = new UndoStack()

  constructor(private readonly port: UndoRecorderPort) {}

  /** 记录一次可撤销操作（由 DataService 的公开 mutator 成功后在主进程调用） */
  record(entry: UndoEntry): void {
    this.stack.pushUndo(entry)
  }

  /** 撤销栈顶操作：展开 children → 逐条前置检查 → 整段原子执行 */
  async undo(): Promise<UndoResult> {
    const entry = this.stack.peekUndo()
    if (entry === null) {
      return { applied: 0, failed: [], skipped: [], ...this.state() }
    }
    const leaves = leafEntries(entry)
    const { applied, failed, skipped } = await this.apply(leaves, 'undo')
    // peek-then-commit：仅当没有任何「失败」时才把 entry 从 undo 栈提交到 redo 栈；
    // 只要有失败（E8），保留 entry（不弹栈、不进 redo），历史不丢，便于重试。
    if (failed.length === 0) {
      this.stack.popUndo()
      this.stack.pushRedo(entry)
    }
    return { applied, failed, skipped, ...this.state() }
  }

  /** 重做栈顶操作：对称于 undo */
  async redo(): Promise<UndoResult> {
    const entry = this.stack.peekRedo()
    if (entry === null) {
      return { applied: 0, failed: [], skipped: [], ...this.state() }
    }
    const leaves = leafEntries(entry)
    const { applied, failed, skipped } = await this.apply(leaves, 'redo')
    if (failed.length === 0) {
      this.stack.popRedo()
      this.stack.pushUndo(entry)
    }
    return { applied, failed, skipped, ...this.state() }
  }

  getState(): UndoState {
    return this.stack.getState()
  }

  private state(): { canUndo: boolean; canRedo: boolean } {
    const s = this.stack.getState()
    return { canUndo: s.canUndo, canRedo: s.canRedo }
  }

  /**
   * 执行一组叶子记录的反向（undo）或正向（redo）动作。
   * 单步失败不中断、收集 errors/skipped；整段作为 ONE 原子任务执行。
   * @throws 仅当发生非预期异常（如底层存储崩溃）才抛出，调用方据此保留 entry（E8）。
   */
  private async apply(
    leaves: UndoEntry[],
    mode: 'undo' | 'redo'
  ): Promise<{ applied: number; failed: Issue[]; skipped: Issue[] }> {
    const failed: Issue[] = []
    const skipped: Issue[] = []
    let applied = 0

    await this.port.runAtomicTask(async () => {
      for (const leaf of leaves) {
        const stepOrSkip: UndoStep | UndoSkip = mode === 'undo' ? buildReverseStep(leaf) : buildRedoStep(leaf)
        if ('reason' in stepOrSkip) {
          // before===null 等结构性缺失：跳过并展示原因
          skipped.push({ name: stepOrSkip.itemName, reason: stepOrSkip.reason })
          continue
        }
        try {
          const ok = await this.executeStep(leaf, stepOrSkip, mode, skipped)
          if (ok) applied += 1
        } catch (error) {
          failed.push({
            name: stepOrSkip.itemName,
            reason: error instanceof Error ? error.message : String(error)
          })
        }
      }
    })

    return { applied, failed, skipped }
  }

  /**
   * 执行单步反向/正向动作，含业务前置检查（E1-E4）。
   * @returns true=已应用；false=被前置检查拦截（已在 skipped 登记，调用方不再计入 applied）
   */
  private async executeStep(leaf: UndoEntry, step: UndoStep, mode: 'undo' | 'redo', skipped: Issue[]): Promise<boolean> {
    if (step.kind === 'remove') {
      const current = this.port.getItem(step.itemId)
      if (mode === 'undo') {
        // 撤销「创建」：条目已不在 = 意外达成撤销目标 → 视作已应用（no-op）；
        // 被改过 → 跳过（E2，避免丢失后续编辑）；否则删除。
        if (current === undefined) return true
        if (leaf.after !== null && !sameData(current.data, leaf.after.data)) {
          skipped.push({ name: leaf.itemName, reason: `「${leaf.itemName}」创建后已修改，未撤销（避免丢失后续编辑）` })
          return false
        }
        const removed = await this.port.deleteById(step.itemId)
        if (!removed) {
          skipped.push({ name: leaf.itemName, reason: `「${leaf.itemName}」删除失败` })
          return false
        }
        return true
      }
      // 重做「删除」：已不在 → no-op；否则删除
      if (current === undefined) return true
      const removed = await this.port.deleteById(step.itemId)
      if (!removed) {
        skipped.push({ name: leaf.itemName, reason: `「${leaf.itemName}」删除失败` })
        return false
      }
      return true
    }

    // restore 型动作（update/delete 撤销 → 写回 before；create/update 重做 → 写回 after）
    const snapshot = step.snapshot
    if (mode === 'undo') {
      if (leaf.opType === 'delete') {
        // 撤销删除：若 id 已存在（冲突）→ 跳过（E4，绝不盲覆盖）
        if (this.port.exists(step.itemId)) {
          skipped.push({ name: leaf.itemName, reason: `「${leaf.itemName}」已存在，未恢复（避免覆盖现有数据）` })
          return false
        }
        await this.port.restoreItem(snapshot)
        return true
      }
      // 撤销更新：条目不在 → 跳过（E1）；被改过 → 跳过（E3）
      const current = this.port.getItem(step.itemId)
      if (current === undefined) {
        skipped.push({ name: leaf.itemName, reason: `「${leaf.itemName}」已不存在，未撤销` })
        return false
      }
      if (leaf.after !== null && !sameData(current.data, leaf.after.data)) {
        // 这是「撤销 update」路径：条目是被**更新**过（不是创建），文案不能照抄上面 create 分支
        skipped.push({ name: leaf.itemName, reason: `「${leaf.itemName}」更新后已修改，未撤销（避免丢失后续编辑）` })
        return false
      }
      await this.port.restoreItem(snapshot)
      return true
    }

    // 重做：写回 after
    if (leaf.opType === 'create') {
      // 重做「创建」：若 id 已存在 → 跳过（冲突）
      if (this.port.exists(step.itemId)) {
        skipped.push({ name: leaf.itemName, reason: `「${leaf.itemName}」已存在，未重做（避免覆盖现有数据）` })
        return false
      }
      await this.port.restoreItem(snapshot)
      return true
    }
    // 重做「更新」：不在 → 跳过（E1）；用户在 undo 期间改过 → 跳过（E3 对称）
    const current = this.port.getItem(step.itemId)
    if (current === undefined) {
      skipped.push({ name: leaf.itemName, reason: `「${leaf.itemName}」已不存在，未重做` })
      return false
    }
    if (leaf.before !== null && !sameData(current.data, leaf.before.data)) {
      skipped.push({ name: leaf.itemName, reason: `「${leaf.itemName}」已修改，未重做（避免丢失后续编辑）` })
      return false
    }
    await this.port.restoreItem(snapshot)
    return true
  }
}
