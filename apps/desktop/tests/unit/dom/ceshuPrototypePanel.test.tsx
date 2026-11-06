// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { CeshuPrototypePanel } from '../../../src/renderer/src/components/ceshuDoc'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { fingerprintCeshuDesign } from '@mobai/shared/ceshu/workflow'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import { installMbApi, renderDom, type ApiStub, type RenderResult } from './render'

/**
 * 原型预览面板：复用 `buildDemoPrompt` + `window.mbApi.llm.generate`，
 * 把 LLM 返回的单文件 HTML 放进沙箱 iframe，并**落盘**到项目文件夹。
 */

let view: RenderResult | null = null
let api: ApiStub | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

function makeDoc(): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', name: '星海计划' })
}

function makeAppDoc(): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', docKind: 'application', name: '团队看板' })
}

const DEMO = '<html><body>hi</body></html>'

describe('CeshuPrototypePanel：生成', () => {
  it('调 llm.generate，剥掉代码围栏后渲染 iframe', async () => {
    api = installMbApi({
      overrides: {
        'llm.generate': () => ({ model: 'fake', content: `\`\`\`html\n${DEMO}\n\`\`\`` }),
        'ceshu.saveDemo': () => ({ doc: { ...makeDoc(), demo_html: DEMO } })
      }
    })
    view = await renderDom(<CeshuPrototypePanel doc={makeDoc()} />)

    expect(view!.byTestId('prototype-empty')).toBeTruthy()
    await view!.click(view!.byTestId('prototype-generate'))

    expect(api!.calls).toContain('llm.generate')
    expect(view!.byTestId('prototype-frame')).toBeTruthy()
    expect(view!.query('[data-testid="prototype-empty"]')).toBeNull()
  })

  it('生成后落盘：调 ceshu.saveDemo 并把最新文档交回上层', async () => {
    const saved = { ...makeDoc(), demo_html: DEMO }
    api = installMbApi({
      overrides: {
        'llm.generate': () => ({ model: 'fake', content: DEMO }),
        'ceshu.saveDemo': () => ({ doc: saved })
      }
    })

    let updated: CeshuDocument | null = null
    view = await renderDom(
      <CeshuPrototypePanel doc={makeDoc()} onDocUpdated={(next) => (updated = next)} />
    )

    await view!.click(view!.byTestId('prototype-generate'))

    expect(api!.calls).toContain('ceshu.saveDemo')
    expect(updated).not.toBeNull()
    expect(view!.byTestId('prototype-notice').textContent).toContain('prototype/demo.html')
  })

  it('落盘失败：成果仍然显示，但把错误说出来（不能假装成功）', async () => {
    api = installMbApi({
      overrides: {
        'llm.generate': () => ({ model: 'fake', content: DEMO }),
        'ceshu.saveDemo': () => {
          throw new Error('磁盘只读')
        }
      }
    })
    view = await renderDom(<CeshuPrototypePanel doc={makeDoc()} />)

    await view!.click(view!.byTestId('prototype-generate'))

    expect(view!.byTestId('prototype-frame')).toBeTruthy()
    expect(view!.byTestId('prototype-error').textContent).toContain('磁盘只读')
  })

  it('模型没返回完整 HTML → 显示错误，不出 iframe，也不落盘', async () => {
    api = installMbApi({
      overrides: { 'llm.generate': () => ({ model: 'fake', content: '抱歉，我做不到' }) }
    })
    view = await renderDom(<CeshuPrototypePanel doc={makeDoc()} />)

    await view!.click(view!.byTestId('prototype-generate'))

    expect(view!.byTestId('prototype-error').textContent).toContain('完整 HTML')
    expect(view!.query('[data-testid="prototype-frame"]')).toBeNull()
    expect(api!.calls).not.toContain('ceshu.saveDemo')
  })
})

describe('CeshuPrototypePanel：已保存的原型', () => {
  it('文档里有 demo_html → 打开就渲染，不需要再生成', async () => {
    api = installMbApi()
    const doc: CeshuDocument = { ...makeDoc(), demo_html: DEMO }
    view = await renderDom(<CeshuPrototypePanel doc={doc} />)

    expect(view!.byTestId('prototype-frame')).toBeTruthy()
    expect(view!.query('[data-testid="prototype-empty"]')).toBeNull()
    expect(api!.calls).toEqual([])
  })
})

/**
 * 原型过期提示：生成时记下设计指纹，打开时重算比对。
 * 关键是不能误报——老原型没有指纹、或指纹一致时都不该提示。
 */
describe('CeshuPrototypePanel：原型过期提示', () => {
  it('指纹一致 → 不提示', async () => {
    const base = makeDoc()
    const doc: CeshuDocument = {
      ...base,
      demo_html: DEMO,
      demo_source_fingerprint: fingerprintCeshuDesign(base)
    }
    api = installMbApi()
    view = await renderDom(<CeshuPrototypePanel doc={doc} />)
    expect(view!.query('[data-testid="prototype-stale"]')).toBeNull()
  })

  it('生成后文档又改了（指纹对不上）→ 提示可能过期', async () => {
    const base = makeDoc()
    const doc: CeshuDocument = {
      ...base,
      demo_html: DEMO,
      demo_source_fingerprint: fingerprintCeshuDesign(base)
    }
    // 生成原型之后又改了核心循环 ⇒ 当前指纹与生成时不一致
    doc.gameplay.core_loop = '生成原型之后改过的核心循环'
    api = installMbApi()
    view = await renderDom(<CeshuPrototypePanel doc={doc} />)
    expect(view!.byTestId('prototype-stale')).toBeTruthy()
  })

  it('老原型没有指纹 → 不误报', async () => {
    const doc: CeshuDocument = { ...makeDoc(), demo_html: DEMO }
    api = installMbApi()
    view = await renderDom(<CeshuPrototypePanel doc={doc} />)
    expect(view!.query('[data-testid="prototype-stale"]')).toBeNull()
  })
})

describe('CeshuPrototypePanel：应用档走界面原型提示词', () => {
  it('应用文档生成时用 buildAppPrototypePrompt（界面原型），而非可玩 Demo', async () => {
    let captured: { prompt?: string; system?: string } | null = null
    api = installMbApi({
      overrides: {
        'llm.generate': (req: unknown) => {
          captured = req as { prompt?: string; system?: string }
          return { model: 'fake', content: DEMO }
        },
        'ceshu.saveDemo': () => ({ doc: { ...makeAppDoc(), demo_html: DEMO } })
      }
    })
    view = await renderDom(<CeshuPrototypePanel doc={makeAppDoc()} />)
    await view!.click(view!.byTestId('prototype-generate'))
    expect(captured!.prompt ?? '').toContain('界面原型')
    expect(captured!.prompt ?? '').not.toContain('可玩 HTML Demo')
  })
})
