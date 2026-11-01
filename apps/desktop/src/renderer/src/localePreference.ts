import { useSyncExternalStore } from 'react'

import { readSetting, writeSetting } from '@mobai/shared/config/settings'
import { LOCALE_STORAGE_KEY, normalizeLocale, type Locale } from '@mobai/shared/i18n'

/**
 * 语言偏好的**唯一真源**（渲染层）。
 *
 * ## 为什么是一个模块级 store 而不是 React state
 * 语言要能被三处同时改/读：设置面板（改）、App 根（提供给 `LocaleProvider`）、
 * 以及将来任何非组件代码（导出文件名、日志）。挂在某个组件的 state 上就得层层下传，
 * 且"设置面板改了、根节点不知道"这类漏接只能靠肉眼发现。
 *
 * 与 `theme`/`fontSize` 同一路数（都是模块级 + 立即落盘 + 立即生效），
 * 只是语言多一个"必须触发 React 重渲染"的要求，故用 `useSyncExternalStore`。
 *
 * 存储键与归一化都在 `shared/i18n`（`mb.locale`）：存的值坏了（手改成 `fr`）也不会崩，
 * `normalizeLocale` 会回落中文。
 */

let current: Locale = normalizeLocale(readSetting(LOCALE_STORAGE_KEY))

const listeners = new Set<() => void>()

/** 当前语言（非组件代码用） */
export function getLocalePreference(): Locale {
  return current
}

/** 改语言：落盘 + 通知所有订阅者（同值早退，避免无意义重渲染） */
export function setLocalePreference(next: Locale): void {
  if (next === current) return
  current = next
  writeSetting(LOCALE_STORAGE_KEY, next)
  for (const listener of [...listeners]) listener()
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** 组件里读语言偏好（变更即重渲染） */
export function useLocalePreference(): Locale {
  return useSyncExternalStore(subscribe, getLocalePreference)
}
