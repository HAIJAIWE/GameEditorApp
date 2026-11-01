import { mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  DEFAULT_WINDOW_STATE,
  WINDOW_STATE_FILENAME,
  WINDOW_STATE_VERSION,
  fitBoundsToDisplays,
  normalizeWindowState,
  readWindowState,
  windowStatePath,
  writeWindowState
} from '../../src/main/windowState'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'winstate-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

describe('windowState：路径与常量', () => {
  it('状态文件落在 userData 根下', () => {
    expect(windowStatePath('/data')).toBe(join('/data', WINDOW_STATE_FILENAME))
  })

  it('默认几何对齐 旧版 restore 默认（1200×800 @ 100/50）', () => {
    expect(DEFAULT_WINDOW_STATE).toEqual({
      x: 100,
      y: 50,
      width: 1200,
      height: 800,
      maximized: false,
      lastMode: 'data'
    })
  })
})

describe('normalizeWindowState：合法值直通', () => {
  it('完整合法状态原样保留', () => {
    const state = { x: 10, y: 20, width: 1600, height: 900, maximized: true, lastMode: 'ceshu' }
    expect(normalizeWindowState(state)).toEqual(state)
  })

  it('负坐标合法（多显示器左/上方）', () => {
    expect(normalizeWindowState({ x: -1920, y: -100, width: 1280, height: 800 }).x).toBe(-1920)
  })

  it('maximized 非 true 一律 false（不猜 truthy）', () => {
    expect(normalizeWindowState({ maximized: 'yes' }).maximized).toBe(false)
    expect(normalizeWindowState({ maximized: 1 }).maximized).toBe(false)
  })
})

describe('normalizeWindowState：坏数据逐项兜底', () => {
  it('非对象/ null → 全默认', () => {
    expect(normalizeWindowState(null)).toEqual(DEFAULT_WINDOW_STATE)
    expect(normalizeWindowState('x')).toEqual(DEFAULT_WINDOW_STATE)
    expect(normalizeWindowState(42)).toEqual(DEFAULT_WINDOW_STATE)
  })

  it('尺寸缺失/类型不对 → 默认尺寸', () => {
    expect(normalizeWindowState({}).width).toBe(1200)
    expect(normalizeWindowState({ width: '1600' }).width).toBe(1200)
    expect(normalizeWindowState({ height: null }).height).toBe(800)
  })

  it('尺寸过小（<480×360）→ 默认（防坏文件把窗口缩成不可用）', () => {
    expect(normalizeWindowState({ width: 100 }).width).toBe(1200)
    expect(normalizeWindowState({ height: 10 }).height).toBe(800)
  })

  it('尺寸超过上界 10000 → 默认（拔掉多显示器后的旧值）', () => {
    expect(normalizeWindowState({ width: 99999 }).width).toBe(1200)
    expect(normalizeWindowState({ height: 99999 }).height).toBe(800)
  })

  it('坐标越界 → 默认', () => {
    expect(normalizeWindowState({ x: 99999 }).x).toBe(100)
    expect(normalizeWindowState({ y: -99999 }).y).toBe(50)
  })

  it('NaN / Infinity → 默认', () => {
    expect(normalizeWindowState({ x: Number.NaN }).x).toBe(100)
    expect(normalizeWindowState({ width: Number.POSITIVE_INFINITY }).width).toBe(1200)
  })

  it('lastMode 空串/非字符串 → 默认 data', () => {
    expect(normalizeWindowState({ lastMode: '' }).lastMode).toBe('data')
    expect(normalizeWindowState({ lastMode: 7 }).lastMode).toBe('data')
  })

  it('小数坐标取整（Electron 只认整数）', () => {
    expect(normalizeWindowState({ x: 10.6, y: 20.2 })).toMatchObject({ x: 11, y: 20 })
  })
})

describe('readWindowState', () => {
  it('文件不存在 → null（调用方用默认几何）', () => {
    expect(readWindowState(dir)).toBeNull()
  })

  it('合法文件 → 解析并归一化', () => {
    writeFileSync(
      windowStatePath(dir),
      JSON.stringify({ version: 1, x: 0, y: 0, width: 1000, height: 700, maximized: false, lastMode: 'digital' }),
      'utf-8'
    )
    expect(readWindowState(dir)).toEqual({
      x: 0,
      y: 0,
      width: 1000,
      height: 700,
      maximized: false,
      lastMode: 'digital'
    })
  })

  it('JSON 损坏 → null（当没有状态，不崩）', () => {
    writeFileSync(windowStatePath(dir), '{broken', 'utf-8')
    expect(readWindowState(dir)).toBeNull()
  })

  it('字段缺失的 JSON → 逐项回落默认（不整体丢弃）', () => {
    writeFileSync(windowStatePath(dir), JSON.stringify({ maximized: true }), 'utf-8')
    const state = readWindowState(dir)
    expect(state).not.toBeNull()
    expect(state?.maximized).toBe(true)
    expect(state?.width).toBe(1200)
  })
})

describe('writeWindowState：原子写与往返', () => {
  it('写入后能读回（往返一致）', () => {
    const state = { x: 33, y: 44, width: 1500, height: 950, maximized: true, lastMode: 'ceshu' }
    expect(writeWindowState(dir, state)).toBe(true)
    expect(readWindowState(dir)).toEqual(state)
  })

  it('落盘含 version 字段（便于将来迁移）', () => {
    writeWindowState(dir, DEFAULT_WINDOW_STATE)
    const raw = JSON.parse(readFileSync(windowStatePath(dir), 'utf-8')) as Record<string, unknown>
    expect(raw.version).toBe(WINDOW_STATE_VERSION)
  })

  it('写入前先归一化（坏值不会落盘）', () => {
    writeWindowState(dir, { x: Number.NaN, y: 0, width: 5, height: 5, maximized: false, lastMode: '' })
    const state = readWindowState(dir)
    expect(state?.x).toBe(100)
    expect(state?.width).toBe(1200)
    expect(state?.lastMode).toBe('data')
  })

  it('不留 .tmp 残留（原子写完成）', () => {
    writeWindowState(dir, DEFAULT_WINDOW_STATE)
    expect(existsSync(`${windowStatePath(dir)}.tmp`)).toBe(false)
  })

  it('目录不存在时自动创建', () => {
    const nested = join(dir, 'a', 'b')
    expect(writeWindowState(nested, DEFAULT_WINDOW_STATE)).toBe(true)
    expect(readWindowState(nested)).toEqual(DEFAULT_WINDOW_STATE)
  })

  it('覆盖写不留旧值', () => {
    writeWindowState(dir, { ...DEFAULT_WINDOW_STATE, width: 1000 })
    writeWindowState(dir, { ...DEFAULT_WINDOW_STATE, width: 1400 })
    expect(readWindowState(dir)?.width).toBe(1400)
  })
})

describe('fitBoundsToDisplays：窗口可见性校正', () => {
  const primary = { x: 0, y: 0, width: 1920, height: 1080 }

  it('落在主屏内 → 原样保留', () => {
    const state = { ...DEFAULT_WINDOW_STATE, x: 100, y: 50 }
    expect(fitBoundsToDisplays(state, [primary], primary)).toEqual(state)
  })

  it('落在左侧副屏（负坐标）→ 保留（多显示器左上布局）', () => {
    const left = { x: -1920, y: 0, width: 1920, height: 1080 }
    const state = { ...DEFAULT_WINDOW_STATE, x: -1800, y: 100 }
    expect(fitBoundsToDisplays(state, [primary, left], primary)).toEqual(state)
  })

  it('副屏拔掉后旧坐标在屏幕外 → 回退主屏居中', () => {
    const state = { ...DEFAULT_WINDOW_STATE, x: 3000, y: 200 }
    const fitted = fitBoundsToDisplays(state, [primary], primary)
    expect(fitted.width).toBe(state.width)
    expect(fitted.height).toBe(state.height)
    expect(fitted.x).toBe(Math.round((1920 - state.width) / 2))
    expect(fitted.y).toBe(Math.round((1080 - state.height) / 2))
  })

  it('跨屏大窗口但可见 → 保留尺寸（不误伤跨显示器布局）', () => {
    const state = { ...DEFAULT_WINDOW_STATE, x: 0, y: 0, width: 3840, height: 1080 }
    expect(fitBoundsToDisplays(state, [primary], primary)).toEqual(state)
  })

  it('不可见且超出主屏 → 尺寸收敛到主屏并居中', () => {
    const state = { ...DEFAULT_WINDOW_STATE, x: 5000, y: 5000, width: 3000, height: 2000 }
    const fitted = fitBoundsToDisplays(state, [primary], primary)
    expect(fitted.width).toBe(1920)
    expect(fitted.height).toBe(1080)
    expect(fitted.x).toBe(0)
    expect(fitted.y).toBe(0)
  })

  it('只贴住边缘（重叠不足 120×80）→ 视为不可见，回退居中', () => {
    const state = { ...DEFAULT_WINDOW_STATE, x: 1900, y: 50 }
    const fitted = fitBoundsToDisplays(state, [primary], primary)
    expect(fitted.x).toBe(Math.round((1920 - state.width) / 2))
  })

  it('校正不丢失 maximized / lastMode', () => {
    const state = { ...DEFAULT_WINDOW_STATE, x: 3000, y: 200, maximized: true, lastMode: 'ceshu' }
    const fitted = fitBoundsToDisplays(state, [primary], primary)
    expect(fitted.maximized).toBe(true)
    expect(fitted.lastMode).toBe('ceshu')
  })
})
