import { describe, expect, it } from 'vitest'

import {
  AI_DOCK_MIN_WIDTH,
  MAIN_AREA_MIN_WIDTH,
  clampDockWidth,
  defaultDockWidth,
  loadAiDockWidth,
  saveAiDockWidth
} from '../../src/renderer/src/dockWidth'

/** 内存版 Storage（jsdom 之外也能跑） */
function memoryStorage(initial: Record<string, string> = {}): Storage {
  const map = new Map(Object.entries(initial))
  return {
    get length() {
      return map.size
    },
    clear: () => map.clear(),
    getItem: (key: string) => map.get(key) ?? null,
    key: (index: number) => [...map.keys()][index] ?? null,
    removeItem: (key: string) => {
      map.delete(key)
    },
    setItem: (key: string, value: string) => {
      map.set(key, value)
    }
  } as Storage
}

describe('dockWidth：宽度夹取', () => {
  it('低于最小值 → 300', () => {
    expect(clampDockWidth(120, 1600)).toBe(AI_DOCK_MIN_WIDTH)
  })

  it('高于上限 → 视口 - 主区最小宽', () => {
    expect(clampDockWidth(2000, 1600)).toBe(1600 - MAIN_AREA_MIN_WIDTH)
  })

  it('区间内原样（取整）', () => {
    expect(clampDockWidth(420.6, 1600)).toBe(421)
  })

  it('窄屏（视口 < 780）→ 仍返回最小 300', () => {
    expect(clampDockWidth(500, 700)).toBe(AI_DOCK_MIN_WIDTH)
  })
})

describe('dockWidth：默认值与持久化', () => {
  it('默认 = 视口 30%（clamp 后；dsh 的 45% 会把策划书工具条挤换行）', () => {
    expect(defaultDockWidth(1600)).toBe(480)
    expect(defaultDockWidth(1920)).toBe(576)
  })

  it('缺失 → 默认', () => {
    expect(loadAiDockWidth(1600, memoryStorage())).toBe(480)
  })

  it('非法值 → 默认', () => {
    expect(loadAiDockWidth(1600, memoryStorage({ 'mb.aiDock.width': 'abc' }))).toBe(480)
    expect(loadAiDockWidth(1600, memoryStorage({ 'mb.aiDock.width': '' }))).toBe(480)
  })

  it('保存后能读回（并按当前视口 clamp）', () => {
    const storage = memoryStorage()
    saveAiDockWidth(520, storage)
    expect(loadAiDockWidth(1600, storage)).toBe(520)
    // 换到更小视口：上限 = 900 - 480 = 420，520 被夹到 420
    expect(loadAiDockWidth(900, storage)).toBe(420)
  })

  it('storage 为 null 不抛', () => {
    expect(() => saveAiDockWidth(400, null)).not.toThrow()
    expect(loadAiDockWidth(1600, null)).toBe(480)
  })
})
