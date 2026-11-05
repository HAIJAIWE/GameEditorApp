// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act, type ReactNode } from 'react'

import { LocaleProvider, useLocale } from '@mobai/client-ui'
import { LOCALES, type Locale } from '@mobai/shared/i18n'

import {
  getLocalePreference,
  setLocalePreference,
  useLocalePreference
} from '../../../src/renderer/src/localePreference'
import { type RenderResult, flush, renderDom } from './render'

/**
 * 复刻 `main.tsx` 的 `LocaleRoot`：订阅模块级 store，把当前 locale 注入 context。
 *
 * 这是 2026-11-05 修复「App 内层再包一层写死 locale 的 `LocaleProvider`，把响应式源盖死」
 * 后的正确接线。本用例锁住这条契约：**改模块级 store → context 消费者立即重渲染**。
 *
 * 若有人把 App 又用静态 `LocaleProvider locale={某 useState}` 包一层（旧 bug 的根），
 * 整条链会断：下拉框走到 `setLocalePreference` 改了 store，外层 `LocaleRoot` 虽重渲染，
 * 却被 App 内层那个不订阅 store 的 Provider 盖住 → 消费者读到的还是旧值。
 * 本用例把「store → useSyncExternalStore → LocaleProvider → 消费者」这条本该唯一的链路
 * 钉死，链路任何一段失效都会立刻红。
 */
function LocaleRoot({ children }: { children: ReactNode }) {
  const locale = useLocalePreference()
  return <LocaleProvider locale={locale}>{children}</LocaleProvider>
}

/** 读取 context 当前语言的消费者（对应 App 里所有 `useT()` / `useLocale()` 派生出的界面） */
function Mirror() {
  const locale = useLocale()
  return <span data-testid="mirror">{locale}</span>
}

/** 语言下拉：与设置面板同源，走 `setLocalePreference` 唯一真源 */
function Dropdown() {
  const locale = useLocale()
  return (
    <select
      data-testid="lang"
      value={locale}
      onChange={(event) => setLocalePreference(event.target.value as Locale)}
    >
      {LOCALES.map((item) => (
        <option key={item} value={item}>
          {item}
        </option>
      ))}
    </select>
  )
}

let view: RenderResult | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  setLocalePreference('zh')
  document.body.innerHTML = ''
})

describe('locale 响应式源（单源契约）', () => {
  it('改 store 后 context 消费者立即跟着变，且下拉双向同步', async () => {
    setLocalePreference('zh')
    view = await renderDom(
      <LocaleRoot>
        <Mirror />
        <Dropdown />
      </LocaleRoot>
    )
    expect(view.byTestId('mirror').textContent).toBe('zh')
    expect((view.byTestId('lang') as HTMLSelectElement).value).toBe('zh')

    // 模拟用户在下拉里选 English —— 这条路径就是设置面板语言项的真实调用
    const select = view.byTestId('lang') as HTMLSelectElement
    const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(select, 'en')
      select.dispatchEvent(new Event('change', { bubbles: true }))
    })
    await flush()

    expect(view.byTestId('mirror').textContent).toBe('en')
    expect((view.byTestId('lang') as HTMLSelectElement).value).toBe('en')
    expect(getLocalePreference()).toBe('en')
  })

  it('同值写入不抖动（store 早退，不触发多余重渲染）', async () => {
    setLocalePreference('zh')
    let renderCount = 0
    function Counting() {
      useLocalePreference()
      renderCount += 1
      return <span data-testid="c">{renderCount}</span>
    }
    view = await renderDom(<LocaleRoot><Counting /></LocaleRoot>)
    const before = Number(view.byTestId('c').textContent)
    setLocalePreference('zh') // 同值，store 应早退
    await flush()
    const after = Number(view.byTestId('c').textContent)
    expect(after).toBe(before)
  })
})
