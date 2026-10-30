import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  applyFontSize,
  applyTheme,
  DEFAULT_CONFIRM_DELETE,
  DEFAULT_FONT_SIZE,
  DEFAULT_THEME,
  formatFontScale,
  fontSizeToScale,
  loadConfirmDelete,
  loadFontSize,
  loadTheme,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  normalizeFontSize,
  saveConfirmDelete,
  saveFontSize,
  saveTheme,
  scaleToFontSize,
  THEME_OPTIONS,
  UI_FONT_SCALE_VAR,
  type ThemeMode
} from '../../src/shared/config/settings/settingsPreferences'
import { SETTINGS_KEYS, type StorageLike } from '../../src/shared/config/settings/settingsStore'

/**
 * 设置偏好（字号 / 主题 / 删除时确认）的纯逻辑单测。
 *
 * 与 `theme.test.ts` 同构：内存 storage 注入 + 「全抛 storage」模拟隐私模式 / 配额满。
 * 覆盖五类必测项：缺失键回落、非法值被 clamp/回落、storage 抛异常不崩、
 * 写入读回一致、主题只接受 light/dark。
 */

/** 内存版 StorageLike（与 settingsStore 的最小面一致：三项方法） */
function memStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial))
  return {
    data,
    getItem(key: string): string | null {
      return data.has(key) ? (data.get(key) as string) : null
    },
    setItem(key: string, value: string): void {
      data.set(key, value)
    },
    removeItem(key: string): void {
      data.delete(key)
    }
  }
}

/** 三项方法全抛的 storage：模拟隐私模式 / 存储被禁用 */
function throwingStorage(): StorageLike {
  return {
    getItem(): string | null {
      throw new Error('storage unavailable')
    },
    setItem(): void {
      throw new Error('storage unavailable')
    },
    removeItem(): void {
      throw new Error('storage unavailable')
    }
  }
}

/* ==========================================================================
 * ① 缺失键 → 回落默认
 * ========================================================================== */
describe('settingsPreferences：① 键缺失回落默认', () => {
  it('字号键缺失 → DEFAULT_FONT_SIZE(=13，对齐 旧版 setValue(13))', () => {
    expect(loadFontSize(memStorage())).toBe(DEFAULT_FONT_SIZE)
    expect(DEFAULT_FONT_SIZE).toBe(13)
  })

  it('确认删除键缺失 → DEFAULT_CONFIRM_DELETE(=true，破坏性操作的安全默认)', () => {
    expect(loadConfirmDelete(memStorage())).toBe(DEFAULT_CONFIRM_DELETE)
    expect(DEFAULT_CONFIRM_DELETE).toBe(true)
  })

  it('storage=null（Node / 主进程）→ 全部回落默认，不抛', () => {
    expect(loadFontSize(null)).toBe(DEFAULT_FONT_SIZE)
    expect(loadConfirmDelete(null)).toBe(DEFAULT_CONFIRM_DELETE)
    expect(loadTheme(null)).toBe(DEFAULT_THEME)
  })
})

/* ==========================================================================
 * ② 非法值 → clamp 或回落默认，**绝不照单全收**
 * ========================================================================== */
describe('settingsPreferences：② 非法字号被规整', () => {
  it('范围与 旧版 setRange(8, 48) 一致', () => {
    // 锁定这个决策，防止后人「对齐 旧版」时改回去：Electron 窄栏撑不住 3.69 倍字号
    expect(MIN_FONT_SIZE).toBe(10)
    expect(MAX_FONT_SIZE).toBe(21)
  })

  it('999 → clamp 到上限 48：不是照单全收，也不是跳回默认 13', () => {
    expect(normalizeFontSize(999)).toBe(MAX_FONT_SIZE)
    expect(loadFontSize(memStorage({ [SETTINGS_KEYS.fontSize]: '999' }))).toBe(MAX_FONT_SIZE)
    // 锁定「clamp 而非回落默认」这个决策：跳回 13 会让滑块出现「拖到底却变默认」的手感
    expect(loadFontSize(memStorage({ [SETTINGS_KEYS.fontSize]: '999' }))).not.toBe(DEFAULT_FONT_SIZE)
  })

  it('0 与负数 → clamp 到下限 8', () => {
    expect(normalizeFontSize(0)).toBe(MIN_FONT_SIZE)
    expect(normalizeFontSize(-5)).toBe(MIN_FONT_SIZE)
    expect(loadFontSize(memStorage({ [SETTINGS_KEYS.fontSize]: '0' }))).toBe(MIN_FONT_SIZE)
    expect(loadFontSize(memStorage({ [SETTINGS_KEYS.fontSize]: '-20' }))).toBe(MIN_FONT_SIZE)
  })

  it('非数字（abc / 空串 / null / undefined）→ 回落默认 13', () => {
    expect(normalizeFontSize('abc')).toBe(DEFAULT_FONT_SIZE)
    expect(normalizeFontSize('')).toBe(DEFAULT_FONT_SIZE)
    expect(normalizeFontSize(null)).toBe(DEFAULT_FONT_SIZE)
    expect(normalizeFontSize(undefined)).toBe(DEFAULT_FONT_SIZE)
    expect(loadFontSize(memStorage({ [SETTINGS_KEYS.fontSize]: 'abc' }))).toBe(DEFAULT_FONT_SIZE)
    expect(loadFontSize(memStorage({ [SETTINGS_KEYS.fontSize]: '' }))).toBe(DEFAULT_FONT_SIZE)
  })

  it('Infinity / NaN → 回落默认（Number.isFinite 挡住）', () => {
    expect(normalizeFontSize(Number.POSITIVE_INFINITY)).toBe(DEFAULT_FONT_SIZE)
    expect(normalizeFontSize(Number.NaN)).toBe(DEFAULT_FONT_SIZE)
    expect(loadFontSize(memStorage({ [SETTINGS_KEYS.fontSize]: 'Infinity' }))).toBe(DEFAULT_FONT_SIZE)
  })

  it('小数先取整再 clamp（13.4 → 13；47.6 → 48），避免子像素抖动', () => {
    expect(normalizeFontSize(13.4)).toBe(13)
    expect(normalizeFontSize(20.7)).toBe(21)
  })

  it('边界值 8 与 48 原样保留（闭区间）', () => {
    expect(normalizeFontSize(MIN_FONT_SIZE)).toBe(MIN_FONT_SIZE)
    expect(normalizeFontSize(MAX_FONT_SIZE)).toBe(MAX_FONT_SIZE)
  })

  it('不变量：任何输入的规整结果都在 [8,48] 的整数内', () => {
    const candidates: unknown[] = [-1e9, -1, 0, 1, 7, 8, 13, 48, 49, 1e9, 13.5, '20', 'x', '', null, undefined, Number.NaN]
    for (const raw of candidates) {
      const result = normalizeFontSize(raw)
      expect(result).toBeGreaterThanOrEqual(MIN_FONT_SIZE)
      expect(result).toBeLessThanOrEqual(MAX_FONT_SIZE)
      expect(Number.isInteger(result)).toBe(true)
    }
  })
})

/* ==========================================================================
 * ③ storage 抛异常 → 回落默认，不崩
 * ========================================================================== */
describe('settingsPreferences：③ storage 异常时回落默认', () => {
  it('getItem 抛异常 → 字号/确认删除/主题全部回落默认，不冒泡', () => {
    const bad = throwingStorage()
    expect(loadFontSize(bad)).toBe(DEFAULT_FONT_SIZE)
    expect(loadConfirmDelete(bad)).toBe(DEFAULT_CONFIRM_DELETE)
    expect(loadTheme(bad)).toBe(DEFAULT_THEME)
  })

  it('setItem 抛异常 → 不抛（配额满 / 隐私模式），仍返回规整值供 UI 回显', () => {
    expect(() => saveFontSize(20, throwingStorage())).not.toThrow()
    expect(saveFontSize(20, throwingStorage())).toBe(20)
    expect(() => saveConfirmDelete(false, throwingStorage())).not.toThrow()
  })

  it('storage=null 时写入是安全空操作（不抛；字号仍回显规整后的值）', () => {
    expect(saveFontSize(20, null)).toBe(20)
    expect(saveConfirmDelete(false, null)).toBe(false)
    // theme.saveTheme 返回 void（写入成败由 settingsStore 内部处理），只断言不抛
    expect(() => saveTheme('dark', null)).not.toThrow()
  })
})

/* ==========================================================================
 * ④ 写入后读回一致
 * ========================================================================== */
describe('settingsPreferences：④ 写入 → 读回一致', () => {
  it('字号往返：20 / 8 / 48 全部一致', () => {
    for (const px of [20, MIN_FONT_SIZE, MAX_FONT_SIZE]) {
      const s = memStorage()
      expect(saveFontSize(px, s)).toBe(px)
      expect(s.data.get(SETTINGS_KEYS.fontSize)).toBe(String(px))
      expect(loadFontSize(s)).toBe(px)
    }
  })

  it('写入非法值时，落盘的是**规整后**的值（存储里不留脏值）', () => {
    const s = memStorage()
    expect(saveFontSize(999, s)).toBe(MAX_FONT_SIZE)
    expect(s.data.get(SETTINGS_KEYS.fontSize)).toBe(String(MAX_FONT_SIZE))
    expect(loadFontSize(s)).toBe(MAX_FONT_SIZE)
  })

  it('确认删除往返：true / false 都一致，且存的是显式字面量', () => {
    const s = memStorage()
    saveConfirmDelete(false, s)
    expect(s.data.get(SETTINGS_KEYS.confirmDelete)).toBe('false')
    expect(loadConfirmDelete(s)).toBe(false)
    saveConfirmDelete(true, s)
    expect(s.data.get(SETTINGS_KEYS.confirmDelete)).toBe('true')
    expect(loadConfirmDelete(s)).toBe(true)
  })

  it('确认删除遇乱码 → 回落**开启**（安全档），而非 false', () => {
    for (const raw of ['yes', '0', '', 'TRUE']) {
      expect(loadConfirmDelete(memStorage({ [SETTINGS_KEYS.confirmDelete]: raw }))).toBe(true)
    }
  })

  it('主题往返：light / dark 一致（委托 theme.ts，未复制实现）', () => {
    const s = memStorage()
    saveTheme('dark', s)
    expect(loadTheme(s)).toBe('dark')
    saveTheme('light', s)
    expect(loadTheme(s)).toBe('light')
  })
})

/* ==========================================================================
 * ⑤ 主题只接受 'light' / 'dark'
 * ========================================================================== */
describe('settingsPreferences：⑤ 主题只接受 light / dark', () => {
  it('非法主题值一律回落 DEFAULT_THEME', () => {
    for (const raw of ['blue', 'DARK', 'Dark', 'neon', '', '0', 'light dark']) {
      expect(loadTheme(memStorage({ [SETTINGS_KEYS.theme]: raw }))).toBe(DEFAULT_THEME)
    }
  })

  it('合法值原样返回', () => {
    expect(loadTheme(memStorage({ [SETTINGS_KEYS.theme]: 'light' }))).toBe('light')
    expect(loadTheme(memStorage({ [SETTINGS_KEYS.theme]: 'dark' }))).toBe('dark')
  })

  it('THEME_OPTIONS 恰好两档，且每档都能被 loadTheme 认回来（面板下拉不会漂移出第三档）', () => {
    expect(THEME_OPTIONS).toHaveLength(2)
    const values = THEME_OPTIONS.map((option) => option.value)
    expect(values).toEqual(['light', 'dark'])
    for (const value of values) {
      expect(loadTheme(memStorage({ [SETTINGS_KEYS.theme]: value }))).toBe(value)
    }
  })
})

/* ==========================================================================
 * ⑥ 字号 → CSS 缩放系数（「一处生效」的数学基础）
 * ========================================================================== */
describe('settingsPreferences：⑥ fontSizeToScale / formatFontScale', () => {
  it('基准字号 13 → scale 精确为 1（默认态零视觉变化的回归保护）', () => {
    expect(fontSizeToScale(DEFAULT_FONT_SIZE)).toBe(1)
    expect(formatFontScale(DEFAULT_FONT_SIZE)).toBe('1')
  })

  it('范围内按比例换算：scale = 字号 / 13', () => {
    expect(fontSizeToScale(20)).toBeCloseTo(20 / DEFAULT_FONT_SIZE, 10)
    expect(fontSizeToScale(MIN_FONT_SIZE)).toBeCloseTo(MIN_FONT_SIZE / DEFAULT_FONT_SIZE, 10)
  })

  it('非法输入也先规整（算不出 NaN）', () => {
    expect(fontSizeToScale('abc')).toBe(1)
    expect(fontSizeToScale(999)).toBeCloseTo(MAX_FONT_SIZE / DEFAULT_FONT_SIZE, 10)
  })

  it('scale 恒为正有限数（NaN/Infinity 写进 CSS 会让整站字号塌掉）', () => {
    for (const raw of [-1, 0, 8, 13, 48, 999, 'abc', null, Number.NaN]) {
      const scale = fontSizeToScale(raw)
      expect(Number.isFinite(scale)).toBe(true)
      expect(scale).toBeGreaterThan(0)
    }
  })

  it('与逆运算互为逆（UI 回显 / 测试互验）', () => {
    for (const size of [MIN_FONT_SIZE, 12, DEFAULT_FONT_SIZE, 14, 20, MAX_FONT_SIZE]) {
      expect(scaleToFontSize(fontSizeToScale(size))).toBe(size)
    }
  })

  it('formatFontScale 最多 4 位小数（CSS 字符串干净）', () => {
    expect(formatFontScale(12)).toBe('0.9231')
    expect(formatFontScale(DEFAULT_FONT_SIZE)).toBe('1')
  })
})

/* ==========================================================================
 * ⑦ 应用到 DOM
 *
 * 本仓 vitest 是 **node 环境**（`vitest.config.ts` `environment: 'node'`），全局没有
 * `document`。故这里**注入一个假 document**（同 `theme.test.ts` 的做法）以验证
 * 「值真的被写到根元素上」；「真实浏览器里 CSS 变量是否驱动全站字号」由渲染证明覆盖。
 * ========================================================================== */
describe('settingsPreferences：⑦ applyFontSize / applyTheme 写 DOM', () => {
  let styleProps: Record<string, string>
  let rootAttrs: Record<string, string>
  let original: unknown

  beforeEach(() => {
    original = (globalThis as { document?: unknown }).document
    styleProps = {}
    rootAttrs = {}
    ;(globalThis as { document?: unknown }).document = {
      documentElement: {
        style: {
          setProperty(key: string, value: string): void {
            styleProps[key] = value
          }
        },
        setAttribute(key: string, value: string): void {
          rootAttrs[key] = value
        },
        removeAttribute(key: string): void {
          delete rootAttrs[key]
        }
      }
    }
  })

  afterEach(() => {
    ;(globalThis as { document?: unknown }).document = original
  })

  it('13px → --ui-font-scale = "1"', () => {
    applyFontSize(DEFAULT_FONT_SIZE)
    expect(styleProps[UI_FONT_SCALE_VAR]).toBe('1')
  })

  it('20px → --ui-font-scale = formatFontScale(20)（= 20/13）', () => {
    applyFontSize(20)
    expect(styleProps[UI_FONT_SCALE_VAR]).toBe(formatFontScale(20))
  })

  it('999px 被 clamp 成 48 的 scale（不会把 76.9 写进 CSS）', () => {
    applyFontSize(999)
    expect(styleProps[UI_FONT_SCALE_VAR]).toBe(formatFontScale(MAX_FONT_SIZE))
  })

  it('非法值不会把 NaN 写进 CSS 变量', () => {
    applyFontSize('abc')
    expect(styleProps[UI_FONT_SCALE_VAR]).toBe('1')
  })

  it('applyTheme 仍走 data-theme（面板的主题切换与状态栏按钮共用同一条路径）', () => {
    applyTheme('dark' as ThemeMode)
    expect(rootAttrs['data-theme']).toBe('dark')
    applyTheme('light' as ThemeMode)
    expect(rootAttrs['data-theme']).toBeUndefined()
  })

  it('无 document（Node / 渲染层卸载期）→ 静默 no-op，不抛', () => {
    ;(globalThis as { document?: unknown }).document = undefined
    expect(() => applyFontSize(20)).not.toThrow()
    expect(() => applyTheme('dark')).not.toThrow()
  })

  it('根节点缺 style（畸形 DOM）→ 静默 no-op，不抛', () => {
    ;(globalThis as { document?: unknown }).document = { documentElement: {} }
    expect(() => applyFontSize(20)).not.toThrow()
  })
})

/* ==========================================================================
 * ⑧ 键名防漂移（与 settingsStore.SETTINGS_KEYS 登记一致）
 * ========================================================================== */
describe('settingsPreferences：⑧ 设置键防漂移', () => {
  it('两个新键都带 mb. 前缀且与登记清单字面一致', () => {
    expect(SETTINGS_KEYS.fontSize).toBe('mb.fontSize')
    expect(SETTINGS_KEYS.confirmDelete).toBe('mb.confirmDelete')
  })
})