// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { CeshuModulePicker } from '../../../src/renderer/src/components/ceshuDoc'
import {
  CHAPTER_LABELS,
  DEFAULT_DISABLED_MODULE_CHAPTERS,
  MODULE_CHAPTERS,
  UNIVERSAL_CORE_CHAPTERS
} from '@mobai/shared/ceshu/reference'
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

describe('CeshuModulePicker：系统模块勾选', () => {
  it('默认按「新建默认」勾选（发行期三章默认关）；通用底座 4 章恒显示', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full' })
    view = await renderDom(<CeshuModulePicker doc={doc} onToggle={() => {}} />)
    expect(view!.byTestId('module-picker')).toBeTruthy()
    const text = view!.text()
    for (const chapter of UNIVERSAL_CORE_CHAPTERS) expect(text).toContain(CHAPTER_LABELS[chapter])
    for (const chapter of MODULE_CHAPTERS) {
      const expected = !DEFAULT_DISABLED_MODULE_CHAPTERS.includes(chapter)
      expect((view!.byTestId(`module-toggle-${chapter}`) as HTMLInputElement).checked, chapter).toBe(expected)
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

  it('按分区分组显示，且不丢任何模块章', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full' })
    view = await renderDom(<CeshuModulePicker doc={doc} onToggle={() => {}} />)
    for (const part of ['core', 'production', 'expansion']) {
      expect(view!.byTestId(`module-group-${part}`)).toBeTruthy()
    }
    for (const chapter of MODULE_CHAPTERS) {
      expect(view!.byTestId(`module-toggle-${chapter}`)).toBeTruthy()
    }
  })
})

describe('CeshuModulePicker：分组开关与预设（onSetModules）', () => {
  it('传入 onSetModules 时显示分组开关与最小核心预设按钮', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full' })
    view = await renderDom(<CeshuModulePicker doc={doc} onToggle={() => {}} onSetModules={() => {}} />)
    expect(view!.byTestId('module-preset-core')).toBeTruthy()
    expect(view!.byTestId('module-group-toggle-core')).toBeTruthy()
    expect(view!.byTestId('module-group-toggle-production')).toBeTruthy()
    expect(view!.byTestId('module-group-toggle-expansion')).toBeTruthy()
  })

  it('未传 onSetModules 时不渲染分组开关 / 预设（保持原行为）', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full' })
    view = await renderDom(<CeshuModulePicker doc={doc} onToggle={() => {}} />)
    expect(view!.query('[data-testid="module-preset-core"]')).toBeNull()
    expect(view!.query('[data-testid="module-group-toggle-core"]')).toBeNull()
  })

  it('点击分组开关把整组写入 onSetModules（移除该组模块，保留其余）', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.meta.enabled_modules = [...MODULE_CHAPTERS] // 先全开，才能测「关闭本组」
    const onSetModules = vi.fn()
    view = await renderDom(<CeshuModulePicker doc={doc} onToggle={() => {}} onSetModules={onSetModules} />)
    await view!.click(view!.byTestId('module-group-toggle-production')) // 全开 → 关闭本组
    expect(onSetModules).toHaveBeenCalledTimes(1)
    const arg = onSetModules.mock.calls[0][0] as string[]
    expect(arg).toContain('combat')
    expect(arg).not.toContain('monetization') // 制作与商业组模块被移除
  })

  it('点击最小核心预设只保留核心设计模块（移除制作与商业 / 扩展设计）', async () => {
    api = installMbApi()
    const doc = createDefaultCeshu({ scope: 'full' })
    const onSetModules = vi.fn()
    view = await renderDom(<CeshuModulePicker doc={doc} onToggle={() => {}} onSetModules={onSetModules} />)
    await view!.click(view!.byTestId('module-preset-core'))
    expect(onSetModules).toHaveBeenCalledTimes(1)
    const arg = onSetModules.mock.calls[0][0] as string[]
    expect(arg).toContain('combat')
    expect(arg).toContain('economy')
    expect(arg).not.toContain('monetization')
    expect(arg).not.toContain('live_ops')
  })
})
