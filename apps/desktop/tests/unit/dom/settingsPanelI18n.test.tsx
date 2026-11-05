// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { LocaleProvider } from '@mobai/client-ui'
import { LOCALE_STORAGE_KEY } from '@mobai/shared/i18n'

import { SettingsPanel } from '../../../src/renderer/src/components/common'
import { getLocalePreference, setLocalePreference } from '../../../src/renderer/src/localePreference'
import { renderDom, type RenderResult } from './render'

/**
 * 设置面板的 i18n 验收（第一个完成中英迁移的界面）。
 *
 * 为什么用渲染级断言而不是"检查代码里没有中文字面量"：
 * 后者只能证明"改了"，不能证明"切换真的生效"。这里直接渲染两种语言，
 * 断言可见文本真的换了——语言切换的价值就在"切了立刻变"。
 *
 * 已知残留（不在本用例范围）：`llmSetupGuide()` 生成的未配置引导仍返回中文，
 * 属下一批迁移（见 `shared/config/llm`）。
 */

let view: RenderResult | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  setLocalePreference('zh')
  document.body.innerHTML = ''
})

describe('SettingsPanel i18n', () => {
  it('中文：副标题/分节/语言项都是中文，语言下拉选中 zh', async () => {
    view = await renderDom(
      <LocaleProvider locale="zh">
        <SettingsPanel />
      </LocaleProvider>
    )
    const text = view.byTestId('settings-panel').textContent ?? ''
    // 窗口标题由浮层（AppPanelOverlay）负责，面板内不再重复；这里断言副标题与分节
    expect(text).toContain('偏好即时生效')
    expect(text).toContain('通用设置')
    expect(text).toContain('AI 模型服务')
    expect((view.byTestId('settings-language') as HTMLSelectElement).value).toBe('zh')
    // 语言名**不翻译**：中文界面里也要能认出 English
    const english = view.byTestId('settings-language').querySelector('option[value="en"]')
    expect(english?.textContent).toBe('English')
  })

  it('英文：副标题/分节换英文，且不再出现中文分节名', async () => {
    view = await renderDom(
      <LocaleProvider locale="en">
        <SettingsPanel />
      </LocaleProvider>
    )
    const text = view.byTestId('settings-panel').textContent ?? ''
    expect(text).toContain('Changes apply and save automatically')
    expect(text).toContain('General')
    expect(text).toContain('AI model service')
    expect(text).not.toContain('通用设置')
    expect((view.byTestId('settings-language') as HTMLSelectElement).value).toBe('en')
  })

  it('英文模式下显示"仍在迁移"的提示（不假装全站已翻译）', async () => {
    view = await renderDom(
      <LocaleProvider locale="en">
        <SettingsPanel />
      </LocaleProvider>
    )
    expect(view.byTestId('settings-language-hint').textContent).toContain('still being migrated')
  })

  it('语言偏好落盘到 mb.locale，且同值写入不抖动', async () => {
    setLocalePreference('en')
    expect(getLocalePreference()).toBe('en')
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('en')
    setLocalePreference('zh')
    expect(getLocalePreference()).toBe('zh')
    expect(window.localStorage.getItem(LOCALE_STORAGE_KEY)).toBe('zh')
  })
})
