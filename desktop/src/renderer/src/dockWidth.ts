/**
 * AI 停靠栏（右栏）宽度：纯逻辑 + localStorage 持久化。
 *
 * 与 UI 解耦的原因：拖拽计算（clamp / 默认比例 / 容错）都是纯函数，能直接单测；
 * App 只负责把鼠标位移换算成「期望宽度」再交给这里。
 */

/** 右栏最小宽度（与旧 CSS `min-width: 300px` 一致） */
export const AI_DOCK_MIN_WIDTH = 300

/** 主区至少保留的宽度：窗口再窄也不把主区挤没 */
export const MAIN_AREA_MIN_WIDTH = 480

/** 默认宽度占视口的比例（对齐 旧版 的 75:25） */
export const AI_DOCK_DEFAULT_RATIO = 0.25

const STORAGE_KEY = 'mb.aiDock.width'

/** 把期望宽度夹到「[300, 视口 - 480]」区间；窄屏时两者相等，结果为 300 */
export function clampDockWidth(desired: number, viewportWidth: number): number {
  const max = Math.max(AI_DOCK_MIN_WIDTH, viewportWidth - MAIN_AREA_MIN_WIDTH)
  const rounded = Math.round(desired)
  return Math.min(Math.max(rounded, AI_DOCK_MIN_WIDTH), max)
}

/** 默认宽度：视口的 25%（再 clamp） */
export function defaultDockWidth(viewportWidth: number): number {
  return clampDockWidth(viewportWidth * AI_DOCK_DEFAULT_RATIO, viewportWidth)
}

function defaultStorage(): Storage | null {
  try {
    return typeof localStorage === 'undefined' ? null : localStorage
  } catch {
    return null
  }
}

/**
 * 读上次宽度；缺失/非法/storage 不可用 → 默认 25%。
 * 读到的值也会按**当前视口**重新 clamp（换到更小的屏幕时不至于把主区挤没）。
 */
export function loadAiDockWidth(viewportWidth: number, storage: Storage | null = defaultStorage()): number {
  try {
    const raw = storage?.getItem(STORAGE_KEY)
    if (raw === null || raw === undefined || raw.trim() === '') {
      return defaultDockWidth(viewportWidth)
    }
    const parsed = Number(raw)
    if (!Number.isFinite(parsed)) {
      return defaultDockWidth(viewportWidth)
    }
    return clampDockWidth(parsed, viewportWidth)
  } catch {
    return defaultDockWidth(viewportWidth)
  }
}

/** 写宽度（失败静默：隐私模式/配额不足不影响使用） */
export function saveAiDockWidth(width: number, storage: Storage | null = defaultStorage()): void {
  try {
    storage?.setItem(STORAGE_KEY, String(Math.round(width)))
  } catch {
    // 忽略
  }
}
