/**
 * theme —— 多主题（深色 / 浅色）偏好。
 *
 * ## 为什么独立成模块
 * 与 `visibleTypes` / `gameStyle` / `imageGenConfig` 同一套约定：纯逻辑、零 React、
 * 零 fs，**可单测**，存储真源统一走 `settingsStore`（`readSetting` / `writeSetting`）。
 *
 * ## 主题怎么生效（CSS 变量体系）
 * `styles.css` 的 `:root` 已定义全部令牌（--bg / --text / --accent …）且全文规则
 * 都用 `var(--xxx)`。因此切换主题只需在 `<html>` 上切换 `data-theme` 属性，并在 CSS
 * 里加一段覆盖块即可整站换肤——**无需重构任何现有样式**。
 *
 * - 默认（无属性 / `data-theme` 缺失）= **浅色**（`styles.css` 的 `:root` 即 旧版「默认」主题配色）
 * - `data-theme="dark"` = 深色覆盖
 *
 * ## 为什么默认是浅色
 * 旧版 侧 `src/ui/main_window:116` 是 `self.current_theme = "默认"`，
 * 而「默认」在 `src/ui/themes/themes::_THEME_CONFIGS` 里是**浅色 + 蓝 accent `#0EA5E9`**。
 * TS 早期版本默认深色 + 绿 accent，是「界面和 旧版 不一致」的主因，故此处与 旧版 对齐。
 *
 * ## 有意不做（避免过度开发）
 * - **不接操作系统深色模式（`nativeTheme`）**：手动切换 + 持久化即可满足需求；
 *   自动跟随需监听系统变化并在每次窗口创建时同步，属独立增强，不在本次范围。
 * - **不做多套主题 / 自定义配色**：仅深/浅两档，符合「合适尺寸」。
 */

import { defaultSettingsStorage, readSetting, writeSetting, type StorageLike } from './settingsStore'

/** 主题模式 */
export type ThemeMode = 'dark' | 'light'

/** 主题设置键（登记进 `settingsStore.SETTINGS_KEYS`） */
export const THEME_KEY = 'mb.theme'

/** 缺省主题：浅色（= 旧版「默认」主题；与 `styles.css` 的 `:root` 默认值一致，避免闪屏） */
export const DEFAULT_THEME: ThemeMode = 'light'

/** 合法主题枚举（用于校验存储值，挡掉损坏/旧值） */
const VALID_THEMES: readonly ThemeMode[] = ['dark', 'light']

/**
 * 读主题偏好。
 * @returns 键缺失 / 值非法 / storage 不可用时回落 `DEFAULT_THEME`
 */
export function loadTheme(storage: StorageLike | null = defaultSettingsStorage()): ThemeMode {
  const raw = readSetting(THEME_KEY, storage)
  if (raw !== null && (VALID_THEMES as readonly string[]).includes(raw)) {
    return raw as ThemeMode
  }
  return DEFAULT_THEME
}

/** 写主题偏好（空值会被 `writeSetting` 视为清除，但主题恒写合法枚举，不会为空） */
export function saveTheme(mode: ThemeMode, storage: StorageLike | null = defaultSettingsStorage()): void {
  writeSetting(THEME_KEY, mode, storage)
}

/**
 * 把主题应用到 DOM（在 `<html>` 上切换 `data-theme`）。
 * - `light`（默认档）→ **移除**属性（回退到 `:root` 的浅色默认值，保持 DOM 干净）
 * - `dark`           → 设置 `data-theme="dark"`
 *
 * 非浏览器环境（主进程 / Node）下 `document` 不存在 → 静默 no-op，不影响功能。
 * 用结构化 `globalThis` 访问，避免 node 端 tsc（无 DOM lib）报 `document` 未定义。
 */
interface DomLike {
  document?: {
    documentElement: {
      setAttribute(name: string, value: string): void
      removeAttribute(name: string): void
    }
  }
}

export function applyTheme(mode: ThemeMode): void {
  const holder = globalThis as unknown as DomLike
  const doc = holder.document
  if (doc === undefined) return
  if (mode === 'dark') {
    doc.documentElement.setAttribute('data-theme', 'dark')
  } else {
    doc.documentElement.removeAttribute('data-theme')
  }
}
