import { describe, expect, it } from 'vitest'

import {
  DEFAULT_LOCALE,
  LOCALES,
  LOCALE_LABELS,
  LOCALE_STORAGE_KEY,
  coverageOf,
  en,
  nextLocale,
  normalizeLocale,
  translate,
  translator,
  zh
} from '@mobai/shared/i18n'

describe('locale 归一化', () => {
  it('认 BCP-47 形态（en-US / en_US / EN 都归 en）', () => {
    expect(normalizeLocale('en-US')).toBe('en')
    expect(normalizeLocale('en_US')).toBe('en')
    expect(normalizeLocale('EN')).toBe('en')
    expect(normalizeLocale('zh-CN')).toBe('zh')
    expect(normalizeLocale('  en-GB  ')).toBe('en')
  })

  it('不认识的一律回落默认（语言设置坏了不该让界面炸）', () => {
    expect(normalizeLocale('fr')).toBe(DEFAULT_LOCALE)
    expect(normalizeLocale('')).toBe(DEFAULT_LOCALE)
    expect(normalizeLocale(null)).toBe(DEFAULT_LOCALE)
    expect(normalizeLocale(undefined)).toBe(DEFAULT_LOCALE)
    expect(normalizeLocale(42)).toBe(DEFAULT_LOCALE)
  })

  it('nextLocale 在中英之间循环；常量自洽', () => {
    expect(nextLocale('zh')).toBe('en')
    expect(nextLocale('en')).toBe('zh')
    expect(LOCALE_STORAGE_KEY.startsWith('mb.')).toBe(true)
    // 每种语言都要有自称（缺了设置页会显示 undefined）
    for (const locale of LOCALES) expect(LOCALE_LABELS[locale]).toBeTruthy()
  })
})

describe('文案表', () => {
  it('中英键集合完全一致（编译期已保证，这里防 as any 绕过）', () => {
    expect(Object.keys(en).sort()).toEqual(Object.keys(zh).sort())
  })

  it('两种语言的每条文案都非空（空串等于没翻译）', () => {
    for (const key of Object.keys(zh) as Array<keyof typeof zh>) {
      expect(zh[key].trim(), `zh.${key}`).not.toBe('')
      expect(en[key].trim(), `en.${key}`).not.toBe('')
    }
  })

  it('英文表里不该残留中文（复制粘贴时最容易漏）', () => {
    const leftover = (Object.entries(en) as Array<[string, string]>).filter(([, text]) =>
      /[\u4e00-\u9fa5]/u.test(text)
    )
    expect(leftover).toEqual([])
  })
})

describe('translate', () => {
  it('按语言取文案', () => {
    expect(translate('zh', 'common.ok')).toBe('确定')
    expect(translate('en', 'common.ok')).toBe('OK')
  })

  it('{name} 插值；参数缺失时保留占位符（便于定位漏传）', () => {
    expect(translate('en', 'agent.steps', { count: 3 })).toBe('3 steps')
    expect(translate('zh', 'agent.steps', { count: 3 })).toBe('3 步')
    expect(translate('en', 'agent.steps')).toBe('{count} steps')
    expect(translate('en', 'agent.steps', { other: 1 })).toBe('{count} steps')
  })

  it('布尔参数转字符串（避免 "true" 出现在奇怪的地方）', () => {
    // 用现有键验证机制：failedWith 只有一个占位符
    expect(translate('en', 'agent.failedWith', { reason: false })).toBe('Failed: false')
  })

  it('未知键返回键名本身，不抛错', () => {
    // 故意绕过类型：模拟"代码里写了个表里没有的键"
    const unknown = 'nope.missing' as unknown as Parameters<typeof translate>[1]
    expect(translate('en', unknown)).toBe('nope.missing')
  })

  it('translator(locale) 绑定语言', () => {
    const t = translator('en')
    expect(t('common.save')).toBe('Save')
  })
})

describe('coverageOf', () => {
  it('中文是基准（恒为 1）；英文当前全覆盖', () => {
    expect(coverageOf('zh')).toBe(1)
    expect(coverageOf('en')).toBe(1)
  })
})
