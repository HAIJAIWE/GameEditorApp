// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { CeshuView } from '../../../src/renderer/src/components/ceshuDoc'
import { defineCeshuMenusPlugin } from '../../../src/renderer/src/plugins/ceshu'
import { defineCeshuViewsPlugin } from '../../../src/renderer/src/plugins/ceshu'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { PluginHost } from '@mobai/shared/plugin/host'
import { installMbApi, renderDom, type ApiStub, type RenderResult } from './render'

/**
 * 左栏「产出物切换」（三栏布局第一步）：
 * 默认设计文档 → 有章节大纲；切到原型/数据/任务 → 出占位、大纲隐藏；切回文档 → 恢复。
 */

let view: RenderResult | null = null
let api: ApiStub | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
  localStorage.clear()
})

function makeDoc() {
  const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
  doc.ceshu_id = 'c1'
  doc.meta.system_confirmed = true
  return doc
}

async function mount(): Promise<RenderResult> {
  // Slice 11：CeshuView 需要宿主来挂载编辑器内视图
  const host = new PluginHost()
  host.register(defineCeshuViewsPlugin())
  host.register(defineCeshuMenusPlugin(host))
  view = await renderDom(
    <CeshuView
      ceshuId="c1"
      onChanged={() => {}}
      onSelect={() => {}}
      types={[]}
      onBack={() => {}}
      host={host}
    />
  )
  return view
}

describe('CeshuView：左栏产出物切换', () => {
  it('默认设计文档有章节大纲；切到原型 → 出占位、大纲隐藏；切回 → 恢复', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    expect(rendered.byTestId('artifact-doc').className).toContain('active')
    expect(rendered.queryAll('[data-testid="chapter-tab"]').length).toBeGreaterThan(0)

    await rendered.click(rendered.byTestId('artifact-prototype'))
    expect(rendered.byTestId('prototype-panel')).toBeTruthy()
    expect(rendered.byTestId('artifact-nav-hint').textContent).toContain('原型预览')
    expect(rendered.queryAll('[data-testid="chapter-tab"]')).toHaveLength(0)

    await rendered.click(rendered.byTestId('artifact-data'))
    expect(rendered.byTestId('machine-panel')).toBeTruthy()

    await rendered.click(rendered.byTestId('artifact-tasks'))
    expect(rendered.byTestId('tasks-panel')).toBeTruthy()

    await rendered.click(rendered.byTestId('artifact-doc'))
    expect(rendered.queryAll('[data-testid="chapter-tab"]').length).toBeGreaterThan(0)
    expect(rendered.query('[data-testid="prototype-panel"]')).toBeNull()
  })

  /*
   * 2026-11-09：施工看板从内容槽（整块替换内容区）改挂产出物页签。
   * 这里守的是「改挂之后它真能在这个页签里渲染出来」——内容槽那一套（章节大纲整个消失）
   * 曾经让用户只能反复开关看板。
   */
  it('施工看板是第 5 个产出物页签：点开出现看板、左栏大纲隐藏、关闭回到设计文档', async () => {
    api = installMbApi({
      doc: makeDoc(),
      overrides: {
        'ceshu.workOrderProgress': () => ({
          progressPath: 'C:\\ws\\进度.md',
          workspace: 'C:\\ws',
          markdown: '',
          written: true,
          counts: { total: 2, done: 0, rework: 0, todo: 2, blocked: 0, machineFail: 0, unverified: 0 },
          next: '00-架构/01-范围与平台.md',
          nextState: 'todo',
          remaining: 2,
          entries: [
            {
              path: '00-架构/01-范围与平台.md',
              title: '范围与平台',
              volumeTitle: '架构',
              number: 1,
              ready: true,
              claimed: false,
              state: 'todo',
              note: '门禁就绪',
              summary: { total: 2, pass: 0, fail: 0, skip: 0, unverified: 2, machine: 0 },
              failures: []
            },
            {
              path: '02-核心玩法/03-战斗与伤害公式.md',
              title: '战斗与伤害公式',
              volumeTitle: '核心玩法',
              number: 2,
              ready: true,
              claimed: false,
              state: 'todo',
              note: '门禁就绪',
              summary: { total: 2, pass: 0, fail: 0, skip: 0, unverified: 2, machine: 0 },
              failures: []
            }
          ]
        })
      }
    })
    const rendered = await mount()

    // 5 个页签，顺序沿用 ARTIFACTS（文档 / 原型 / 数据 / 岗位任务 / 施工看板）
    expect(rendered.queryAll('[data-testid^="artifact-"]')).toHaveLength(5)

    await rendered.click(rendered.byTestId('artifact-workboard'))
    await rendered.flush()
    expect(rendered.byTestId('workboard-panel')).toBeTruthy()
    // 左栏不再是「目录将在这里」的通用占位，而是看板的说明
    expect(rendered.byTestId('artifact-nav-hint').textContent).toContain('施工看板在中间工作区')
    expect(rendered.queryAll('[data-testid="chapter-tab"]')).toHaveLength(0)

    // 面板自己的「关闭」也走产出物页签关闭 ⇒ 回到设计文档
    await rendered.click(rendered.byTestId('workboard-close'))
    expect(rendered.query('[data-testid="workboard-panel"]')).toBeNull()
    expect(rendered.byTestId('artifact-doc').className).toContain('active')
    expect(rendered.queryAll('[data-testid="chapter-tab"]').length).toBeGreaterThan(0)
  })
})
