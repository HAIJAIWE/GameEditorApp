/**
 * settingsPreferences —— 设置面板的**通用偏好**（对齐 Python `ui/dialogs/settings_dialog.py`）。
 *
 * ## 本模块只管三项（其余**刻意不做**，逐条依据见文件末尾的表格）
 * | 偏好 | Python 出处 | TS 落点 |
 * |---|---|---|
 * | 字体大小 | `settings_dialog.py:398-403`（QSpinBox 8~48，默认 13） | `mb.fontSize` + CSS 变量 `--ui-font-scale` |
 * | 主题 | `settings_dialog.py:218-221`（主题下拉） | **复用 `theme.ts`**，本模块只做再导出 |
 * | 删除时确认 | `settings_dialog.py:239-241`（QCheckBox） | `mb.confirmDelete`，消费者 `BatchEditPanel` |
 *
 * ## 为什么独立成模块（而不是塞进 `settingsStore.ts`）
 * `settingsStore.ts` 是**通用存储层**（键值 / JSON / 列举 / 导入导出），不认识任何
 * 具体偏好；本模块是**领域层**（知道「字号要 clamp 到 8–48」「主题只有两档」）。
 * 分层后`settingsStore` 仍是通用基座、新增偏好不会把它撑成一个什么都懂的杂物间。
 *
 * ## 为什么不自己再实现一遍主题
 * 主题的读写/校验/落 DOM 已在 `theme.ts`（`loadTheme`/`saveTheme`/`applyTheme`）。
 * **再写一份就是第二真源**（铁律：不过度开发）。本模块只把 `loadTheme` 等再导出，
 * 让设置面板**一个 import 拿到全部偏好**，同时保持 `theme.ts` 是唯一实现。
 *
 * ## 纯逻辑，零 React、零 fs —— 可单测
 * 存储真源统一走 `settingsStore`（`readSetting`/`writeSetting`/`SETTINGS_KEYS`），
 * 与 `theme.ts`/`visibleTypes.ts`/`gameStyle.ts` 同一套约定；
 * 「键缺失 / 值非法 / storage 不可用」三种情况一律**回落默认**，不抛。
 */

import { defaultSettingsStorage, readSetting, writeSetting, SETTINGS_KEYS, type StorageLike } from './settingsStore'
import type { ThemeMode } from './theme'

/* ==========================================================================
 * 一、字体大小
 * ========================================================================== */

/** 字号基准（px）：对齐 Python `settings_dialog.py:401` 的 `setValue(13)` */
export const DEFAULT_FONT_SIZE = 13

/** 字号下限（px）：对齐 `settings_dialog.py:400` 的 `setRange(8, 48)` 下界 */
export const MIN_FONT_SIZE = 10

/** 字号上限（px）：对齐 `setRange(8, 48)` 上界 */
export const MAX_FONT_SIZE = 21

/** CSS 自定义属性名（与 `styles.css` 的 `:root` 声明同名，勿单方面改名） */
export const UI_FONT_SCALE_VAR = '--ui-font-scale'

/**
 * 规整字号到 `[MIN_FONT_SIZE, MAX_FONT_SIZE]` 的整数。
 *
 * ⚠️ **为什么越界用 clamp 而非「回落默认」**（与 `theme.ts` 的策略**故意不同**）：
 * 字号是**连续量**，用户从 13 拖到 999 只该被截到 48，而不是「跳回 13」——
 * 后者会让滑块/输入框出现「我明明拖到底了却变回默认」的诡异手感。
 * 真正**非法**的是「不是数字」（`NaN` / `Infinity` / 空串 / 非数字串），那些才回落默认。
 *
 * @param raw 任意来源的值（非数字 → 回落 `DEFAULT_FONT_SIZE`）
 * @returns `[8, 48]` 内的整数
 */
export function normalizeFontSize(raw: unknown): number {
  // ⚠️ 空串/纯空白必须**先判掉**，不能交给 Number()：
  // `Number('')` 与 `Number('  ')` 都是 **0**（不是 NaN），会被当成「用户想要 0px」
  // 而夹到下限 10 —— 用户清空输入框后失焦会莫名变成 10px。
  // 先判空 ⇒ 走「无效输入」分支回落基准 13。
  if (typeof raw === 'string' && raw.trim() === '') {
    return DEFAULT_FONT_SIZE
  }
  const value = typeof raw === 'number' ? raw : Number(String(raw).trim())
  if (!Number.isFinite(value)) {
    return DEFAULT_FONT_SIZE
  }
  // 先四舍五入再 clamp：16.7 → 17（整数像素，避免子像素抖动）
  const rounded = Math.round(value)
  return Math.max(MIN_FONT_SIZE, Math.min(MAX_FONT_SIZE, rounded))
}

/**
 * 字号 → `--ui-font-scale`（全站缩放系数）。
 *
 * `styles.css` 的正文规则统一写成 `calc(13px * var(--ui-font-scale) * k)`，
 * 其中 `13px` 是基准、`k` 是各元素相对基准的比例（如 12px → `12/13`）。故：
 *
 * ```
 * --ui-font-scale = normalizeFontSize(px) / DEFAULT_FONT_SIZE
 * ```
 *
 * 默认 13px → scale = 1 → 每个 `k` **精确还原**改动前的字号（默认态零视觉变化）。
 *
 * @param px 用户设定的字号（内部再 `normalizeFontSize` 一次，调用方可传原始值）
 */
export function fontSizeToScale(px: unknown): number {
  return normalizeFontSize(px) / DEFAULT_FONT_SIZE
}

/** CSS 取值字符串（最多 4 位小数；`1` 不写成 `1.0000`，保持 DOM 干净） */
export function formatFontScale(px: unknown): string {
  return String(Number(fontSizeToScale(px).toFixed(4)))
}

/** 缩放系数 → 字号（`fontSizeToScale` 的逆运算，用于测试互验） */
export function scaleToFontSize(scale: number): number {
  if (!Number.isFinite(scale)) {
    return DEFAULT_FONT_SIZE
  }
  return normalizeFontSize(Math.round(scale * DEFAULT_FONT_SIZE))
}

/**
 * 读字体大小偏好。
 * @returns 键缺失 / 值非法 / storage 不可用（null 或 `getItem` 抛）时回落 `DEFAULT_FONT_SIZE`
 */
export function loadFontSize(storage: StorageLike | null = defaultSettingsStorage()): number {
  const raw = readSetting(SETTINGS_KEYS.fontSize, storage)
  if (raw === null) {
    return DEFAULT_FONT_SIZE
  }
  return normalizeFontSize(raw)
}

/**
 * 写字体大小偏好（写入前先 `normalizeFontSize`，**不让非法值落盘**）。
 *
 * @returns **实际写入的（已规整的）字号** —— 而不是布尔成功标记。
 *   面板要用它回显「你输的 999 被存成了 48」；返回布尔还得再 clamp 一次才知道存了什么。
 *   storage 不可用时同样返回规整后的值（UI 显示与预期一致，只是没落盘）。
 */
export function saveFontSize(px: unknown, storage: StorageLike | null = defaultSettingsStorage()): number {
  const normalized = normalizeFontSize(px)
  writeSetting(SETTINGS_KEYS.fontSize, String(normalized), storage)
  return normalized
}

/* ==========================================================================
 * 二、主题（再导出 `theme.ts`，不重复实现）
 * ========================================================================== */

export { DEFAULT_THEME, loadTheme, saveTheme, applyTheme } from './theme'
export type { ThemeMode } from './theme'

/** 主题可选项（面板下拉的数据源；与 `theme.ts` 的合法枚举同源，不会漂移出第三档） */
export const THEME_OPTIONS: ReadonlyArray<{ value: ThemeMode; label: string }> = [
  { value: 'light', label: '浅色' },
  { value: 'dark', label: '深色' }
]

/* ==========================================================================
 * 三、删除时确认
 * ========================================================================== */

/**
 * 「删除时确认」默认值：**开启**。
 *
 * 关闭后删除**直接执行不确认**（破坏性操作），默认必须是安全的那一档。
 * Python 侧 `settings_dialog.py:239` 的 QCheckBox 未显式 `setChecked(True)` 而依赖
 * Qt 默认值 —— 这里不依赖隐式默认，显式写明。
 */
export const DEFAULT_CONFIRM_DELETE = true

/** 存储里该偏好的合法字面量（避免 `writeSetting` 的「空串即清除」语义） */
const CONFIRM_DELETE_TRUE = 'true'
const CONFIRM_DELETE_FALSE = 'false'

/**
 * 读「删除时确认」偏好。只接受 `'true'` / `'false'` 字面量。
 * @returns 键缺失 / 值非法 / storage 不可用时回落 `DEFAULT_CONFIRM_DELETE`（= 开启）
 */
export function loadConfirmDelete(storage: StorageLike | null = defaultSettingsStorage()): boolean {
  const raw = readSetting(SETTINGS_KEYS.confirmDelete, storage)
  if (raw === CONFIRM_DELETE_TRUE) {
    return true
  }
  if (raw === CONFIRM_DELETE_FALSE) {
    return false
  }
  // 乱码/空串 → 开启（安全档）：把「读不懂」解释成「不要删」而不是「随便删」
  return DEFAULT_CONFIRM_DELETE
}

/**
 * 写「删除时确认」偏好（显式写 `'true'`/`'false'`，不靠「键不存在」表达默认值）。
 * @returns 是否写入成功（storage 不可用 → false）
 */
export function saveConfirmDelete(enabled: boolean, storage: StorageLike | null = defaultSettingsStorage()): boolean {
  return writeSetting(SETTINGS_KEYS.confirmDelete, enabled ? CONFIRM_DELETE_TRUE : CONFIRM_DELETE_FALSE, storage)
}

/* ==========================================================================
 * 四、应用到 DOM
 * ========================================================================== */

/**
 * 把 `--ui-font-scale` 写到 `<html>` 上（与 `theme.ts::applyTheme` 同一手法）。
 *
 * **必须挂 `documentElement`（`:root`）而不是 body**：`styles.css` 里上百处字号
 * 分散在各种选择器层级，挂 body 会因继承/优先级导致部分元素不跟随。
 *
 * 非浏览器环境（主进程 / Node 单测）下 `document` 不存在 → 静默 no-op。
 * 用结构化 `globalThis` 访问，避免 node 端 tsc（无 DOM lib）报 `document` 未定义。
 */
interface DomLike {
  document?: {
    documentElement?: {
      style?: {
        setProperty(property: string, value: string): void
      }
    }
  }
}

/**
 * 应用字号到 DOM —— **立即生效**（CSS 变量改一个值即整站跟随）。
 *
 * 与 PyQt 的差异（如实告知，不照抄）：Python 只能提示「字体大小需要重启应用后生效」
 * （`settings_dialog.py:406`，Qt 必须重建 QApplication 字体）。
 * TS 侧改的是 CSS 自定义属性，浏览器**当场重算**，无需重启 —— 面板里也如实写「立即生效」。
 */
export function applyFontSize(px: unknown): void {
  const style = (globalThis as unknown as DomLike).document?.documentElement?.style
  if (style === undefined) {
    return
  }
  try {
    style.setProperty(UI_FONT_SCALE_VAR, formatFontScale(px))
  } catch {
    // 字号设置失效不该让应用崩（同 `theme.ts` 的降级思路）
  }
}

/* ==========================================================================
 * 附：PyQt 设置页里 TS 侧**刻意不做**的那几项（依据，勿当漏做）
 * --------------------------------------------------------------------------
 * | PyQt 项 | 为什么不迁 |
 * |---|---|
 * | 语言下拉（`settings_dialog.py:212-217`） | TS 无 i18n 框架，全站文案硬编码中文。选了也不生效 = 假控件 |
 * | 10 套 QSS 主题（`:218-223`） | TS 刻意只有 light/dark（`theme.ts:16-25` 记录了「合适尺寸」取舍）。恢复 10 套是过度开发 |
 * | 自动保存开关+ 间隔（`:226-236`） | TS 无自动保存；且策划书侧刻意不做整文档保存（见 roadmap E30 诚实边界②） |
 * | 界面布局下拉（`:393-396`） | PyQt 这页**只有一个选项** `three_column`，而 TS 顶层 IA 已按 E28 重写为「无侧栏 + 中央单栈」⇒ 布局已不是三栏，配下拉是纯装饰 |
 * | 三类 API Key（`:247-292`） | `settings:` 通道刻意**只有 has/set/delete、没有 get**（渲染层永远拿不到明文，相对 Python Fernet 的安全性保持）；扩到三类要动主进程加密存储 = 敏感面，另开一轮 |
 * | 工具页 6 个按钮（`:423-440`） | 主理人未核实真实消费者，按「宁缺勿错」不做 |
 * ========================================================================== */