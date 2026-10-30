// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import CeshuModulePicker from '../../../src/renderer/src/components/ceshuDoc/CeshuModulePicker'
import { CHAPTER_LABELS, MODULE_CHAPTERS, UNIVERSAL_CORE_CHAPTERS } from '../../../src/shared/ceshu/reference/ceshuConstants'
import { createDefaultCeshu } from '../../../src/shared/ceshu/model/ceshuModel'
import { installMbApi, renderDom, type RenderResult } from './render'

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

describe('CeshuModulePicker：系统模块勾选', () => {
  it('默认全部模块勾选；通用底座 4 章恒显示', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full' })
    view = await renderDom(<CeshuModulePicker doc={doc} onToggle={() => {}} />)
    expect(view!.byTestId('module-picker')).toBeTruthy()
    const text = view!.text()
    for (const chapter of UNIVERSAL_CORE_CHAPTERS) expect(text).toContain(CHAPTER_LABELS[chapter])
    for (const chapter of MODULE_CHAPTERS) {
      expect((view!.byTestId(`module-toggle-${chapter}`) as HTMLInputElement).checked).toBe(true)
    }
  })

  it('显式 enabled_modules 反映勾选态；点击回调 (module, checked)', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.meta.enabled_modules = ['combat']
    const onToggle = vi.fn()
    view = await renderDom(<CeshuModulePicker doc={doc} onToggle={onToggle} />)
    expect((view!.byTestId('module-toggle-combat') as HTMLInputElement).checked).toBe(true)
    expect((view!.byTestId('module-toggle-economy') as HTMLInputElement).checked).toBe(false)
    await view!.click(view!.byTestId('module-toggle-economy'))
    expect(onToggle).toHaveBeenCalledWith('economy', true)
  })
})
