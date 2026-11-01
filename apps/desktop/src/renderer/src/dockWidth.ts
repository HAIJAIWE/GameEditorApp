/**
 * AI 停靠栏（右栏）宽度：纯逻辑 + localStorage 持久化。
 *
 * 与 UI 解耦的原因：拖拽计算（clamp / 默认比例 / 容错）都是纯函数，能直接单测；
 * App 只负责把鼠标位移换算成「期望宽度」再交给这里。
 */

/** 右栏最小宽度（与旧 CSS `min-width: 300px` 一致） */
export const AI_DOCK_MIN_WIDTH = 300

/** 中栏（对话）至少保留的宽度：对齐 dsh `columns.ts` 的 CENTER_MIN = 400 */
export const MAIN_AREA_MIN_WIDTH = 400

/**
 * 默认宽度占视口的比例：**45%**（dsh `columns.ts` 的 RIGHTBAR_DEFAULT_RATIO）。
 *
 * 中栏改成对话之后，这条可以照 dsh 用了：对话在 400px 就够读，
 * 右栏要装策划书/数据编辑这类密集表单，给宽才是对的。
 */
export const AI_DOCK_DEFAULT_RATIO = 0.45

/** 右栏宽度上限占视口的比例（对齐 dsh 的 70% 上限） */
export const AI_DOCK_MAX_RATIO = 0.7

const STORAGE_KEY = 'mb.aiDock.width'

/**
 * 把期望宽度夹到合法区间：
 * 下界 300；上界取「视口 - 主区 480」与「视口 70%」的较小者（两者都要满足）。
 * 窄屏时上界可能低于下界，此时结果为 300（宁可挤主区也不给负宽度）。
 */
export function clampDockWidth(desired: number, viewportWidth: number): number {
  const maxByMain = viewportWidth - MAIN_AREA_MIN_WIDTH
  const maxByRatio = viewportWidth * AI_DOCK_MAX_RATIO
  const max = Math.max(AI_DOCK_MIN_WIDTH, Math.min(maxByMain, maxByRatio))
  const rounded = Math.round(desired)
  return Math.min(Math.max(rounded, AI_DOCK_MIN_WIDTH), max)
}

/** 默认宽度：视口的 45%（再 clamp） */
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
