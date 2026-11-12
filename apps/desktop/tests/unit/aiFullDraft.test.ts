import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  AI_FULL_DRAFT_VERSION,
  aiFullDraftKey,
  clearAiFullDraft,
  loadAiFullDraft,
  saveAiFullDraft,
  type AiFullDraft
} from '../../src/renderer/src/components/agent'

/**
 * 单测守的是两件事：窗口意外关闭后还能不能把整轮生成捡回来；以及
 * 落盘旁路永远不能打断生成。用最小 fake storage 而不是 jsdom——本文件跑在
 * vitest 的 node 环境，顺带验证「storage 注入优先、无 window 时安全降级」。
 */
function createFakeStorage() {
  const data = new Map<string, string>()
  let throwOnNextSet = false
  return {
    getItem(key: string): string | null {
      return data.get(key) ?? null
    },
    setItem(key: string, value: string): void {
      if (throwOnNextSet) {
        throwOnNextSet = false
        const error = new Error('The quota has been exceeded.')
        error.name = 'QuotaExceededError'
        throw error
      }
      data.set(key, value)
    },
    removeItem(key: string): void {
      data.delete(key)
    },
    /** 让下一次 setItem 抛配额超限，验证 save 的失败降级 */
    failNextSet(): void {
      throwOnNextSet = true
    }
  }
}

function makeDraft(ceshuId = 'ceshu-1'): AiFullDraft {
  return {
    version: 1,
    ceshuId,
    savedAt: 1730000000000,
    stage: 'full',
    scope: 'all',
    briefConfirmed: true,
    results: {
      chapter_1: { title: '战斗系统', body: '回合制，含 3 条判定' },
      chapter_2: { title: '经济系统' }
    },
    statuses: { chapter_1: 'done', chapter_2: 'running' },
    errors: { chapter_3: '请求超时' },
    usageTotal: 12345,
    summary: '已完成 2 章'
  }
}

afterEach(() => {
  vi.unstubAllGlobals()
})

describe('AI_FULL_DRAFT_VERSION / aiFullDraftKey', () => {
  it('version 固定为 1，键按 ceshuId 隔离', () => {
    expect(AI_FULL_DRAFT_VERSION).toBe(1)
    expect(aiFullDraftKey('ceshu-1')).toBe('mb.aiFull.draft.ceshu-1')
    expect(aiFullDraftKey('ceshu-1')).not.toBe(aiFullDraftKey('ceshu-2'))
  })
})

describe('saveAiFullDraft / loadAiFullDraft：round-trip', () => {
  it('保存后能完整读回，且别的 ceshuId 读不到', () => {
    const storage = createFakeStorage()
    const draft = makeDraft()
    expect(saveAiFullDraft(draft, storage)).toBe(true)
    expect(loadAiFullDraft('ceshu-1', storage)).toEqual(draft)
    expect(loadAiFullDraft('ceshu-2', storage)).toBeNull()
  })

  it('同一 ceshuId 再保存会覆盖旧快照', () => {
    const storage = createFakeStorage()
    expect(saveAiFullDraft(makeDraft(), storage)).toBe(true)
    const newer: AiFullDraft = { ...makeDraft(), savedAt: 999, summary: '第二轮' }
    expect(saveAiFullDraft(newer, storage)).toBe(true)
    expect(loadAiFullDraft('ceshu-1', storage)).toEqual(newer)
  })
})

describe('loadAiFullDraft：损坏 / 不匹配的快照一律拒绝', () => {
  it('ceshuId 不匹配被拒（键对得上也不行）', () => {
    const storage = createFakeStorage()
    storage.setItem(aiFullDraftKey('ceshu-1'), JSON.stringify({ ...makeDraft(), ceshuId: 'ceshu-2' }))
    expect(loadAiFullDraft('ceshu-1', storage)).toBeNull()
  })

  it('version 不符被拒', () => {
    const storage = createFakeStorage()
    storage.setItem(aiFullDraftKey('ceshu-1'), JSON.stringify({ ...makeDraft(), version: 2 }))
    expect(loadAiFullDraft('ceshu-1', storage)).toBeNull()
  })

  it('坏 JSON 被拒', () => {
    const storage = createFakeStorage()
    storage.setItem(aiFullDraftKey('ceshu-1'), '{不是合法 JSON')
    expect(loadAiFullDraft('ceshu-1', storage)).toBeNull()
  })

  it('结构损坏被拒（顶层字段类型不对 / 缺字段 / 数组 / 非对象 / 状态值非法）', () => {
    const storage = createFakeStorage()
    const key = aiFullDraftKey('ceshu-1')
    const broken: string[] = [
      JSON.stringify({ ...makeDraft(), results: 42 }),
      JSON.stringify({ ...makeDraft(), statuses: [] }),
      JSON.stringify({ ...makeDraft(), errors: null }),
      JSON.stringify({ ...makeDraft(), usageTotal: '12345' }),
      JSON.stringify({ ...makeDraft(), statuses: { chapter_1: 'unknown' } }),
      JSON.stringify({ ...makeDraft(), results: { chapter_1: '不是对象' } }),
      JSON.stringify({ results: {}, statuses: {}, errors: {} }),
      JSON.stringify(null),
      JSON.stringify('a string'),
      JSON.stringify([])
    ]
    for (const raw of broken) {
      storage.setItem(key, raw)
      expect(loadAiFullDraft('ceshu-1', storage)).toBeNull()
    }
  })

  it('缺失快照（getItem 返回 null）返回 null', () => {
    const storage = createFakeStorage()
    expect(loadAiFullDraft('ceshu-1', storage)).toBeNull()
  })
})

describe('clearAiFullDraft', () => {
  it('clear 后 load 为 null，重复 clear 也安全', () => {
    const storage = createFakeStorage()
    expect(saveAiFullDraft(makeDraft(), storage)).toBe(true)
    expect(() => clearAiFullDraft('ceshu-1', storage)).not.toThrow()
    expect(loadAiFullDraft('ceshu-1', storage)).toBeNull()
    expect(() => clearAiFullDraft('ceshu-1', storage)).not.toThrow()
  })

  it('clear 只删当前 ceshuId 的快照', () => {
    const storage = createFakeStorage()
    expect(saveAiFullDraft(makeDraft('ceshu-1'), storage)).toBe(true)
    expect(saveAiFullDraft(makeDraft('ceshu-2'), storage)).toBe(true)
    clearAiFullDraft('ceshu-1', storage)
    expect(loadAiFullDraft('ceshu-1', storage)).toBeNull()
    expect(loadAiFullDraft('ceshu-2', storage)).not.toBeNull()
  })
})

describe('异常降级：存储永不抛错', () => {
  it('setItem 抛 QuotaExceededError 时 save 返回 false，且不破坏已有值', () => {
    const storage = createFakeStorage()
    const first = makeDraft()
    expect(saveAiFullDraft(first, storage)).toBe(true)
    const second: AiFullDraft = { ...makeDraft(), savedAt: 999, summary: '第二轮' }
    storage.failNextSet()
    expect(saveAiFullDraft(second, storage)).toBe(false)
    // 第一轮快照仍完整可读，没有被半写入或清空
    expect(loadAiFullDraft('ceshu-1', storage)).toEqual(first)
  })

  it('getItem / setItem / removeItem 全抛错时也不抛错', () => {
    const hostile = {
      getItem: (): string | null => {
        throw new Error('storage disabled')
      },
      setItem: (_key: string, _value: string): void => {
        throw new Error('storage disabled')
      },
      removeItem: (_key: string): void => {
        throw new Error('storage disabled')
      }
    }
    expect(loadAiFullDraft('ceshu-1', hostile)).toBeNull()
    expect(saveAiFullDraft(makeDraft(), hostile)).toBe(false)
    expect(() => clearAiFullDraft('ceshu-1', hostile)).not.toThrow()
  })

  it('无 window 环境且省略 storage 时安全返回（不抛错、不崩）', () => {
    vi.stubGlobal('window', undefined)
    expect(saveAiFullDraft(makeDraft())).toBe(false)
    expect(loadAiFullDraft('ceshu-1')).toBeNull()
    expect(() => clearAiFullDraft('ceshu-1')).not.toThrow()
  })
})
