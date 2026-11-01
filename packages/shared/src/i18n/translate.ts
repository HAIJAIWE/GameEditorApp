/**
 * 翻译函数（纯逻辑，零 React）。
 *
 * ## 设计取舍
 * - **不抛异常**：缺键返回键名本身（`common.ok`），而不是抛错或返回空串。
 *   文案缺失是内容问题，不该让界面崩；键名出现在界面上也一眼能看出漏了哪个。
 * - **回落链**：当前语言 → 中文基准 → 键名。英文表缺键时宁可显示中文，
 *   也不要显示 `agent.stop` 这种开发者占位符。
 * - **参数插值**：`{name}` 形式，替换失败（没给参数）时保留原样，便于排查。
 */

import { CATALOGS, zh, type MessageKey } from './catalog'
import { DEFAULT_LOCALE, type Locale } from './locale'

/** 插值参数：字符串 / 数字 / 布尔都接受（布尔会转成 true/false） */
export type TranslateParams = Record<string, string | number | boolean>

/** `{name}` 占位（只认字母数字下划线，避免把 `{{` 之类误当参数） */
const PLACEHOLDER = /\{([A-Za-z0-9_]+)\}/gu

function interpolate(template: string, params: TranslateParams | undefined): string {
  if (params === undefined) return template
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name]
    return value === undefined ? match : String(value)
  })
}

/**
 * 取一条文案。
 *
 * @param locale 目标语言
 * @param key 文案键（类型安全：只接受 `catalog.ts` 里定义过的键）
 * @param params `{name}` 插值参数
 */
export function translate(locale: Locale, key: MessageKey, params?: TranslateParams): string {
  const text = CATALOGS[locale]?.[key] ?? zh[key] ?? key
  return interpolate(text, params)
}

/** 绑定语言的便捷形式：`const t = translator(locale); t('common.ok')` */
export function translator(locale: Locale): (key: MessageKey, params?: TranslateParams) => string {
  return (key, params) => translate(locale, key, params)
}

/**
 * 某语言对基准表的**覆盖率**（0–1）。
 *
 * 用途：`i18nCoverage` 用例与将来的设置页"翻译完成度"提示。
 * 只统计"存在且非空"的键——空串等于没翻译。
 */
export function coverageOf(locale: Locale): number {
  const base = Object.keys(zh)
  if (base.length === 0) return 1
  if (locale === DEFAULT_LOCALE) return 1
  const table = CATALOGS[locale] as Partial<Record<MessageKey, string>>
  const filled = base.filter((key) => {
    const value = table[key as MessageKey]
    return typeof value === 'string' && value.trim() !== ''
  })
  return filled.length / base.length
}
