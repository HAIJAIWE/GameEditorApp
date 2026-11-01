/**
 * 语言（locale）—— 中英双语的第一块地基。
 *
 * ## 为什么单独成模块
 * 语言是**跨层**概念：主进程（导出文件名、日志）、渲染层（界面文案）、
 * 甚至 agent 的系统提示词都可能要看它。放在 `shared` 里，三层都能 import，
 * 且保持"零 React、零 fs"（`shared` 的铁律）。
 *
 * ## 现状与路线（别把这里当"已完成"）
 * 界面文案目前仍 100% 硬编码中文（约 200 个文件）。本模块只提供
 * **类型 + 归一化 + 默认值**，配合 `catalog.ts` 的键表，让迁移可以逐文件进行。
 * 覆盖率由 `tests/unit/i18nCoverage.test.ts` 棘轮守住（只许降不许升）。
 */

/** 支持的语言（新增语言时：这里 + `LOCALE_LABELS` + `catalog.ts` 的对照表） */
export const LOCALES = ['zh', 'en'] as const

export type Locale = (typeof LOCALES)[number]

/** 默认语言：中文（现有用户与全部文案都是中文，切换必须是显式行为） */
export const DEFAULT_LOCALE: Locale = 'zh'

/** 语言在 UI 上的自称（**不做翻译**：语言名永远用该语言自己写） */
export const LOCALE_LABELS: Record<Locale, string> = {
  zh: '简体中文',
  en: 'English'
}

/** localStorage 键（沿用 `mb.` 命名空间，见 `config/settings/settingsStore.ts`） */
export const LOCALE_STORAGE_KEY = 'mb.locale'

/**
 * 把任意输入归一化成受支持的 `Locale`。
 *
 * 宽容策略：`en-US` / `en_US` / `EN` 都归到 `en`（浏览器 `navigator.language` 就是这种形态）；
 * 不认识的（含空串 / null）一律回落 `DEFAULT_LOCALE`——语言设置坏了不该让界面炸。
 */
export function normalizeLocale(raw: unknown): Locale {
  if (typeof raw !== 'string') return DEFAULT_LOCALE
  const head = raw.trim().toLowerCase().split(/[-_]/u)[0] ?? ''
  return (LOCALES as readonly string[]).includes(head) ? (head as Locale) : DEFAULT_LOCALE
}

/** 下一个语言（中 ⇄ 英；将来三种语言时改成环形，调用点不用动） */
export function nextLocale(current: Locale): Locale {
  const index = LOCALES.indexOf(current)
  return LOCALES[(index + 1) % LOCALES.length] ?? DEFAULT_LOCALE
}
