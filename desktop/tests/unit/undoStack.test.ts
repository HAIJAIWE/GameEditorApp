import { describe, expect, it } from 'vitest'

import {
  UNDO_BYTE_CAP,
  UNDO_MAX_DEPTH,
  UndoStack,
  buildRedoStep,
  buildReverseStep,
  leafEntries,
  type UndoEntry,
  type UndoStep
} from '../../src/shared/util/system/undoStack'
import type { ItemRecord } from '../../src/shared/types'

function rec(id: string, data: Record<string, unknown> = {}): ItemRecord {
  const now = '2024-01-01T00:00:00.000Z'
  return { id, type: 'role', data, createdAt: now, updatedAt: now }
}

function entry(partial: Partial<UndoEntry> & Pick<UndoEntry, 'opType' | 'itemId' | 'itemName'>): UndoEntry {
  return {
    dataType: 'role',
    before: null,
    after: null,
    timestamp: 0,
    ...partial
  }
}

describe('UndoStack 基础栈操作', () => {
  it('pushUndo 入栈、peekUndo 看栈顶、popUndo 出栈（LIFO）', () => {
    const stack = new UndoStack()
    stack.pushUndo(entry({ opType: 'create', itemId: 'a', itemName: 'A' }))
    stack.pushUndo(entry({ opType: 'update', itemId: 'b', itemName: 'B' }))

    expect(stack.canUndo()).toBe(true)
    expect(stack.canUndo()).toBe(true)
    const top = stack.peekUndo()
    expect(top?.itemName).toBe('B')

    const popped = stack.popUndo()
    expect(popped?.itemName).toBe('B')
    expect(stack.peekUndo()?.itemName).toBe('A')
    expect(stack.canRedo()).toBe(false)
  })

  it('pushUndo 会清空 redo 栈（E5：新操作截断 redo）', () => {
    const stack = new UndoStack()
    stack.pushUndo(entry({ opType: 'create', itemId: 'a', itemName: 'A' }))
    stack.pushRedo(entry({ opType: 'delete', itemId: 'x', itemName: 'X' }))
    expect(stack.canRedo()).toBe(true)

    stack.pushUndo(entry({ opType: 'update', itemId: 'b', itemName: 'B' }))
    expect(stack.canRedo()).toBe(false)
    expect(stack.canUndo()).toBe(true)
  })

  it('undo 执行后 entry 从 undo 移入 redo，可 redo 还原', () => {
    const stack = new UndoStack()
    const a = entry({ opType: 'create', itemId: 'a', itemName: 'A' })
    stack.pushUndo(a)
    expect(stack.canRedo()).toBe(false)

    stack.popUndo()
    stack.pushRedo(a)
    expect(stack.canUndo()).toBe(false)
    expect(stack.canRedo()).toBe(true)
    expect(stack.peekRedo()?.itemName).toBe('A')
  })
})

describe('UndoStack 上限淘汰', () => {
  it('超过深度上限 UNDO_MAX_DEPTH 时淘汰最旧（深度 100）', () => {
    const stack = new UndoStack()
    for (let i = 0; i < UNDO_MAX_DEPTH + 50; i++) {
      stack.pushUndo(entry({ opType: 'create', itemId: `id-${i}`, itemName: `N${i}` }))
    }
    expect(stack.canUndo()).toBe(true)
    // 超出部分被淘汰，长度收敛到上限
    expect((stack as unknown as { undoStack: UndoEntry[] }).undoStack.length).toBe(UNDO_MAX_DEPTH)
    // 最早入栈的已被淘汰
    expect(stack.peekUndo()?.itemName).toBe(`N${UNDO_MAX_DEPTH + 49}`)
  })

  it('超过字节上限 UNDO_BYTE_CAP 时淘汰最旧', () => {
    const stack = new UndoStack()
    const big: UndoEntry = entry({
      opType: 'create',
      itemId: 'big',
      itemName: 'BIG',
      after: rec('big', { payload: 'x'.repeat(100_000) })
    })
    // 每条约 ~100KB，25 条即超 2MB
    for (let i = 0; i < 25; i++) {
      stack.pushUndo({ ...big, itemId: `big-${i}`, itemName: `BIG${i}`, after: rec(`big-${i}`, { payload: 'x'.repeat(100_000) }) })
    }
    const len = (stack as unknown as { undoStack: UndoEntry[] }).undoStack.length
    expect(len).toBeLessThan(25)
    expect(len).toBeGreaterThan(0)
    // 字节上限确实生效（总字节应 <= 上限 + 单条余量）
    expect(len).toBeLessThanOrEqual(Math.ceil(UNDO_BYTE_CAP / 100_000) + 2)
  })
})

describe('UndoStack.getState 标签', () => {
  it('普通条目返回 itemName；批量条目返回「批量操作（N 项）」', () => {
    const stack = new UndoStack()
    stack.pushUndo(entry({ opType: 'batchUpdate', itemId: 'role', itemName: '批量', children: [
      entry({ opType: 'update', itemId: 'c1', itemName: 'C1' }),
      entry({ opType: 'update', itemId: 'c2', itemName: 'C2' })
    ] }))
    const s = stack.getState()
    expect(s.canUndo).toBe(true)
    expect(s.nextUndo).toBe('批量操作（2 项）')

    stack.popUndo()
    stack.pushRedo(entry({ opType: 'deleteMany', itemId: 'mixed', itemName: '删批量', children: [
      entry({ opType: 'delete', itemId: 'd1', itemName: 'D1' })
    ] }))
    const s2 = stack.getState()
    expect(s2.nextRedo).toBe('批量操作（1 项）')
    expect(s2.canRedo).toBe(true)
  })

  it('空栈时 canUndo/canRedo 为 false，next 为 null', () => {
    const stack = new UndoStack()
    const s = stack.getState()
    expect(s).toEqual({ canUndo: false, canRedo: false, nextUndo: null, nextRedo: null })
  })
})

describe('buildReverseStep / buildRedoStep', () => {
  it('create → 反向为 remove（删掉创建出来的条目）', () => {
    const e = entry({ opType: 'create', itemId: 'a', itemName: 'A', after: rec('a', { name: 'A' }) })
    const step = buildReverseStep(e)
    expect(step).toEqual({ kind: 'remove', dataType: 'role', itemId: 'a', itemName: 'A' } as UndoStep)
  })

  it('update → 反向为 restore（写回 before）', () => {
    const before = rec('a', { name: '旧' })
    const e = entry({ opType: 'update', itemId: 'a', itemName: 'A', before, after: rec('a', { name: '新' }) })
    const step = buildReverseStep(e)
    if ('reason' in step) throw new Error('期望 restore')
    if (step.kind !== 'restore') throw new Error('期望 restore')
    expect(step.snapshot).toBe(before)
  })

  it('delete → 反向为 restore（写回 before，恢复被删项）', () => {
    const before = rec('a', { name: '旧' })
    const e = entry({ opType: 'delete', itemId: 'a', itemName: 'A', before, after: null })
    const step = buildReverseStep(e)
    if ('reason' in step) throw new Error('期望 restore')
    if (step.kind !== 'restore') throw new Error('期望 restore')
    expect(step.snapshot).toBe(before)
  })

  it('update/delete 缺 before → 跳过并附中文原因', () => {
    const e = entry({ opType: 'update', itemId: 'a', itemName: 'A', before: null, after: rec('a') })
    const step = buildReverseStep(e)
    expect('reason' in step).toBe(true)
    if ('reason' in step) {
      expect(step.reason).toBe('update 记录缺少变更前快照，无法恢复')
    }
  })

  it('create 缺 after → 跳过', () => {
    const e = entry({ opType: 'create', itemId: 'a', itemName: 'A', before: null, after: null })
    const step = buildReverseStep(e)
    expect('reason' in step).toBe(true)
  })

  it('create 重做 → restore(after)；update 重做 → restore(after)；delete 重做 → remove', () => {
    const after = rec('a', { name: '新' })
    const createRedo = buildRedoStep(entry({ opType: 'create', itemId: 'a', itemName: 'A', before: null, after }))
    if ('reason' in createRedo) throw new Error('期望 restore')
    if (createRedo.kind !== 'restore') throw new Error('期望 restore')
    expect(createRedo.snapshot).toBe(after)

    const updateRedo = buildRedoStep(entry({ opType: 'update', itemId: 'a', itemName: 'A', before: rec('a', { name: '旧' }), after }))
    if ('reason' in updateRedo) throw new Error('期望 restore')
    if (updateRedo.kind !== 'restore') throw new Error('期望 restore')
    expect(updateRedo.snapshot).toBe(after)

    const deleteRedo = buildRedoStep(entry({ opType: 'delete', itemId: 'a', itemName: 'A', before: rec('a'), after: null }))
    expect(deleteRedo).toEqual({ kind: 'remove', dataType: 'role', itemId: 'a', itemName: 'A' } as UndoStep)
  })
})

describe('leafEntries 展开', () => {
  it('叶子操作返回自身；容器操作展开 children', () => {
    const leaf = entry({ opType: 'create', itemId: 'a', itemName: 'A' })
    expect(leafEntries(leaf)).toEqual([leaf])

    const child1 = entry({ opType: 'update', itemId: 'c1', itemName: 'C1' })
    const child2 = entry({ opType: 'delete', itemId: 'c2', itemName: 'C2' })
    const container = entry({ opType: 'batchUpdate', itemId: 'role', itemName: '批量', children: [child1, child2] })
    expect(leafEntries(container)).toEqual([child1, child2])
  })
})
