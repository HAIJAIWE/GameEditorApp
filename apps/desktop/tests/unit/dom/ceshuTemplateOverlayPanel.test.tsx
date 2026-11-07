// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CeshuTemplateOverlayPanel } from '../../../src/renderer/src/components/ceshuDoc'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { installMbApi, renderDom, type RenderResult } from './render'

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

/**
 * 给 textarea 设值并触发 React onChange。
 * 复用 render 的 `change` 不行——它走的是 `HTMLInputElement.prototype` 的 value setter，
 * 对 textarea 会 Illegal invocation；这里用 textarea 自己的原型。
 */
async function setTextarea(target: RenderResult, value: string): Promise<void> {
  const el = target.byTestId('template-overlay-input') as HTMLTextAreaElement
  const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(el, value)
    el.dispatchEvent(new Event('input', { bubbles: true }))
  })
  await target.flush()
}

describe('CeshuTemplateOverlayPanel：模板覆盖层编辑器', () => {
  it('无覆盖层：初始为 {}、无清除按钮、预览为默认章序', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    view = await renderDom(<CeshuTemplateOverlayPanel doc={doc} onApply={() => {}} onClear={() => {}} onClose={() => {}} />)

    expect((view.byTestId('template-overlay-input') as HTMLTextAreaElement).value).toBe('{}')
    expect(view.query('[data-testid="template-overlay-clear"]')).toBeNull()
    // 默认模板：第一章是产品愿景
    expect(view.text()).toContain('产品愿景')
  })

  it('非法 JSON：显示解析错误并禁用应用', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full' })
    view = await renderDom(<CeshuTemplateOverlayPanel doc={doc} onApply={() => {}} onClear={() => {}} onClose={() => {}} />)

    await setTextarea(view, '{ 不是 json')
    expect(view.query('[data-testid="template-overlay-error"]')).not.toBeNull()
    expect(view.text()).toContain('JSON 解析失败')
    expect((view.byTestId('template-overlay-apply') as HTMLButtonElement).disabled).toBe(true)
  })

  it('非法覆盖层（未知键）：显示覆盖层错误并禁用应用', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full' })
    view = await renderDom(<CeshuTemplateOverlayPanel doc={doc} onApply={() => {}} onClear={() => {}} onClose={() => {}} />)

    await setTextarea(view, JSON.stringify({ unknown: 1 }))
    expect(view.text()).toContain('覆盖层不合法')
    expect((view.byTestId('template-overlay-apply') as HTMLButtonElement).disabled).toBe(true)
  })

  it('合法覆盖层：预览反映新章名，点击应用把解析结果交给 onApply', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full' })
    const onApply = vi.fn()
    view = await renderDom(
      <CeshuTemplateOverlayPanel doc={doc} onApply={onApply} onClear={() => {}} onClose={() => {}} />
    )

    const overlay = { chapters: [{ key: 'vision', name: '产品愿景与定位' }] }
    await setTextarea(view, JSON.stringify(overlay))
    expect(view.query('[data-testid="template-overlay-error"]')).toBeNull()
    expect(view.text()).toContain('产品愿景与定位')

    await view.click(view.byTestId('template-overlay-apply'))
    expect(onApply).toHaveBeenCalledTimes(1)
    expect(onApply).toHaveBeenCalledWith(overlay)
  })

  it('已有覆盖层：预填 JSON 并显示清除按钮，点击清除走 onClear', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.meta.template_overlay = { chapters: [{ key: 'vision', name: '愿景' }] }
    const onClear = vi.fn()
    view = await renderDom(
      <CeshuTemplateOverlayPanel doc={doc} onApply={() => {}} onClear={onClear} onClose={() => {}} />
    )

    expect((view.byTestId('template-overlay-input') as HTMLTextAreaElement).value).toContain('"vision"')
    await view.click(view.byTestId('template-overlay-clear'))
    expect(onClear).toHaveBeenCalledTimes(1)
  })

  it('应用空对象 {} = 清除（不落空壳覆盖层）', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full' })
    const onApply = vi.fn()
    const onClear = vi.fn()
    view = await renderDom(
      <CeshuTemplateOverlayPanel doc={doc} onApply={onApply} onClear={onClear} onClose={() => {}} />
    )

    await view.click(view.byTestId('template-overlay-apply'))
    expect(onApply).not.toHaveBeenCalled()
    expect(onClear).toHaveBeenCalledTimes(1)
  })
})
