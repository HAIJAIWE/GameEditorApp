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

  it('高于上限 → 取「视口 - 中栏保底」与「视口 70%」的较小者', () => {
    expect(clampDockWidth(2000, 1600)).toBe(Math.min(1600 - MAIN_AREA_MIN_WIDTH, 1600 * 0.7))
    // 1200(保底) vs 1120(70%) → 70% 先收紧
    expect(clampDockWidth(2000, 1600)).toBe(1120)
  })

  it('区间内原样（取整）', () => {
    expect(clampDockWidth(420.6, 1600)).toBe(421)
  })

  it('窄屏（视口 < 780）→ 仍返回最小 300', () => {
    expect(clampDockWidth(500, 700)).toBe(AI_DOCK_MIN_WIDTH)
  })
})

describe('dockWidth：默认值与持久化', () => {
  it('默认 = 视口 45%（对齐 dsh RIGHTBAR_DEFAULT_RATIO）', () => {
    expect(defaultDockWidth(1600)).toBe(720)
    expect(defaultDockWidth(1920)).toBe(864)
  })

  it('缺失 → 默认', () => {
    expect(loadAiDockWidth(1600, memoryStorage())).toBe(720)
  })

  it('非法值 → 默认', () => {
    expect(loadAiDockWidth(1600, memoryStorage({ 'mb.aiDock.width': 'abc' }))).toBe(720)
    expect(loadAiDockWidth(1600, memoryStorage({ 'mb.aiDock.width': '' }))).toBe(720)
  })

  it('保存后能读回（并按当前视口 clamp）', () => {
    const storage = memoryStorage()
    saveAiDockWidth(520, storage)
    expect(loadAiDockWidth(1600, storage)).toBe(520)
    // 换到更小视口：上限 = min(900 - 400, 900 * 70%) = 500，520 被夹到 500
    expect(loadAiDockWidth(900, storage)).toBe(500)
  })

  it('storage 为 null 不抛', () => {
    expect(() => saveAiDockWidth(400, null)).not.toThrow()
    expect(loadAiDockWidth(1600, null)).toBe(720)
  })
})
