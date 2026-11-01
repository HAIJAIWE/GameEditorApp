import { createContext, useContext, useMemo, type ReactNode } from 'react'

import {
  DEFAULT_LOCALE,
  translate,
  type Locale,
  type MessageKey,
  type TranslateParams
} from '@mobai/shared/i18n'

/**
 * 渲染层的语言上下文 + `useT()`。
 *
 * ## 为什么语言走 React context 而不是读 localStorage
 * - 组件不该知道"语言存在哪"（localStorage 是宿主的存储策略，Web/测试夹具没有）；
 * - 切语言要**立即重渲染**：context 变更天然触发，不需要额外的订阅/广播；
 * - 测试里可以直接 `<LocaleProvider locale="en">` 断言英文，不碰全局状态。
 *
 * 持久化由宿主负责（读 `mb.locale` → 传给 `LocaleProvider`），本包只消费。
 */

const LocaleContext = createContext<Locale>(DEFAULT_LOCALE)

export function LocaleProvider({ locale, children }: { locale: Locale; children: ReactNode }) {
  return <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
}

/** 当前语言（无 Provider 时回落 `DEFAULT_LOCALE`，不抛错——语言缺失不该让界面崩） */
export function useLocale(): Locale {
  return useContext(LocaleContext)
}

/**
 * 取翻译函数：`const t = useT(); t('common.ok')`。
 *
 * 返回的函数按 locale 记忆化：同一次渲染里多处调用不会重复建闭包，
 * 也让 `useMemo`/`useCallback` 的依赖里可以安全地放 `t`。
 */
export function useT(): (key: MessageKey, params?: TranslateParams) => string {
  const locale = useLocale()
  return useMemo(() => (key: MessageKey, params?: TranslateParams) => translate(locale, key, params), [locale])
}
