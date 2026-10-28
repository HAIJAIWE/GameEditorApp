import { describe, expect, it } from 'vitest'

import { createDefaultCeshu } from '../../src/shared/ceshuModel'
import { fingerprintCeshuDesign, isPrototypeStale } from '../../src/shared/ceshuPrototypeStale'

/**
 * 原型过期判定：生成原型时记下设计指纹，打开时重算比对。
 * 关键是不能误报——保存原型本身会刷新 updated_at，若把时间戳算进指纹就会「一生成完立刻报过期」。
 */

function doc() {
  return createDefaultCeshu({ scope: 'full', name: '星海计划' })
}

describe('fingerprintCeshuDesign', () => {
  it('同一文档指纹稳定（不随调用变化）', () => {
    const value = doc()
    expect(fingerprintCeshuDesign(value)).toBe(fingerprintCeshuDesign(value))
  })

  it('章节内容改了 → 指纹变', () => {
    const a = doc()
    const b = doc()
    b.gameplay.core_loop = '改了核心循环'
    expect(fingerprintCeshuDesign(a)).not.toBe(fingerprintCeshuDesign(b))
  })

  it('原型/指纹/时间戳不进指纹（保存原型不会立刻报过期）', () => {
    const value = doc()
    const base = fingerprintCeshuDesign(value)
    value.demo_html = '<html></html>'
    value.demo_source_fingerprint = 'deadbeef'
    value.updated_at = '2099-01-01 00:00:00'
    expect(fingerprintCeshuDesign(value)).toBe(base)
  })
})

describe('isPrototypeStale', () => {
  it('没有原型 → 不过期', () => {
    expect(isPrototypeStale(doc())).toBe(false)
  })

  it('有原型但没指纹（老原型）→ 不报，避免误报', () => {
    const value = doc()
    value.demo_html = '<html></html>'
    expect(isPrototypeStale(value)).toBe(false)
  })

  it('指纹一致 → 不过期', () => {
    const value = doc()
    value.demo_html = '<html></html>'
    value.demo_source_fingerprint = fingerprintCeshuDesign(value)
    expect(isPrototypeStale(value)).toBe(false)
  })

  it('生成后文档又改了 → 过期', () => {
    const value = doc()
    value.demo_html = '<html></html>'
    value.demo_source_fingerprint = fingerprintCeshuDesign(value)
    value.gameplay.core_loop = '生成原型之后又改了循环'
    expect(isPrototypeStale(value)).toBe(true)
  })
})
