// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { WorkBoardPanel } from '../../../src/renderer/src/components/ceshu'
import { setCeshuEditorBridge } from '../../../src/renderer/src/plugins/ceshu'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * 施工看板：把「几十份交接文档做到哪了、下一份做谁」变成一张表。
 *
 * 口径全在主进程（`buildHandoffProgressBoard`）算，面板只呈现；
 * 这里用桩把主进程的返回形状喂进来，断言面板没有走样（状态标签 / 机判结论 / 未过举证）。
 */

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

/** 主进程 `ceshu:workOrderProgress` 的返回形状（与 IPC 契约同形） */
function boardStub(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    progressPath: 'C:\\ws\\进度.md',
    workspace: 'C:\\ws',
    markdown: '共 2 份（已完成 1 / 需返工 1）',
    written: true,
    counts: { total: 2, done: 1, rework: 1, todo: 0, blocked: 0, machineFail: 2, unverified: 3 },
    next: '02-核心玩法/03-战斗与伤害公式.md',
    nextState: 'rework',
    remaining: 1,
    entries: [
      {
        path: '00-架构/01-范围与平台.md',
        title: '范围与平台',
        volumeTitle: '架构',
        number: 1,
        ready: true,
        claimed: true,
        state: 'done',
        note: '已按进度.md 记为完成，机判 3 条全过',
        summary: { total: 4, pass: 3, fail: 1, skip: 0, unverified: 1, machine: 3 },
        failures: []
      },
      {
        path: '02-核心玩法/03-战斗与伤害公式.md',
        title: '战斗与伤害公式',
        volumeTitle: '核心玩法',
        number: 2,
        ready: true,
        claimed: true,
        state: 'rework',
        note: '进度.md 记了完成，但机判有 1 条未过——按「机器只能否决」降级为需返工',
        summary: { total: 3, pass: 1, fail: 2, skip: 0, unverified: 0, machine: 3 },
        failures: [
          {
            id: 'core-combat-a1',
            text: '断言「伤害下限」',
            check: 'assertion',
            evidence: '表达式无法复算（expr:Damage>=1）'
          },
          {
            id: 'core-combat-a2',
            text: '数据表字段存在',
            check: 'data',
            evidence: 'level_design.difficulty_curve_points'
          }
        ]
      }
    ],
    ...overrides
  }
}

describe('施工看板面板', () => {
  it('列出总览、下一份与成绩单回写位置', async () => {
    api = installMbApi({ overrides: { 'ceshu.workOrderProgress': () => boardStub() } })
    view = await renderDom(<WorkBoardPanel ceshuId="dd66f593" onClose={() => undefined} />)

    const text = view.text()
    expect(text).toContain('施工看板')
    expect(text).toContain('共 2 份')
    expect(text).toContain('已完成 1')
    expect(text).toContain('需返工 1')
    expect(text).toContain('02-核心玩法/03-战斗与伤害公式.md')
    expect(text).toContain('成绩单已写回')
    expect(text).toContain('机判：未过 2 条 / 待人工或可执行用例 3 条')
  })

  it('逐份带工序状态标签（机判 fail ⇒ 需返工）', async () => {
    api = installMbApi({ overrides: { 'ceshu.workOrderProgress': () => boardStub() } })
    view = await renderDom(<WorkBoardPanel ceshuId="dd66f593" onClose={() => undefined} />)

    const entries = view.queryAll('[data-testid="workboard-entry"]')
    expect(entries).toHaveLength(2)
    expect(entries[0].getAttribute('data-state')).toBe('done')
    expect(entries[1].getAttribute('data-state')).toBe('rework')
    expect(entries[1].textContent).toContain('🔁 需返工')
    expect(entries[1].textContent).toContain('机判 通过 1 / 未过 2 / 待人工 0')
  })

  it('未过的验收默认折叠，点开才列举证', async () => {
    api = installMbApi({ overrides: { 'ceshu.workOrderProgress': () => boardStub() } })
    view = await renderDom(<WorkBoardPanel ceshuId="dd66f593" onClose={() => undefined} />)

    expect(view.queryAll('[data-testid="workboard-failures"]')).toHaveLength(0)
    const toggle = view.byTestId('workboard-toggle')
    expect(toggle.textContent).toContain('看未过的 2 条')
    await view.click(toggle)
    expect(view.queryAll('[data-testid="workboard-failures"]')).toHaveLength(1)
    const text = view.text()
    expect(text).toContain('core-combat-a1')
    expect(text).toContain('表达式无法复算')
    expect(toggle.textContent).toContain('收起未过的 2 条')
  })

  it('工作区不可写时如实说明成绩单没写回', async () => {
    api = installMbApi({ overrides: { 'ceshu.workOrderProgress': () => boardStub({ written: false }) } })
    view = await renderDom(<WorkBoardPanel ceshuId="dd66f593" onClose={() => undefined} />)

    expect(view.text()).toContain('成绩单没能写回')
  })

  it('全部做完时下一份显示「全部做完了」而不是空路径', async () => {
    api = installMbApi({
      overrides: { 'ceshu.workOrderProgress': () => boardStub({ next: null, nextState: null, remaining: 0 }) }
    })
    view = await renderDom(<WorkBoardPanel ceshuId="dd66f593" onClose={() => undefined} />)

    expect(view.text()).toContain('全部做完了')
  })

  it('每份都带「派这一份」，点了就把该份路径交给编辑器桥（不自己发请求）', async () => {
    api = installMbApi({ overrides: { 'ceshu.workOrderProgress': () => boardStub() } })
    const dispatched: string[] = []
    setCeshuEditorBridge({
      autoFill: () => undefined,
      showReadiness: () => undefined,
      showChangelog: () => undefined,
      exportProject: () => undefined,
      exportHandoff: () => undefined,
      startAiDev: () => undefined,
      startAiDevFor: (path: string) => dispatched.push(path)
    })
    view = await renderDom(<WorkBoardPanel ceshuId="dd66f593" onClose={() => undefined} />)

    const buttons = view.queryAll('[data-testid="workboard-dispatch"]')
    expect(buttons).toHaveLength(2)
    expect(buttons[0].getAttribute('data-path')).toBe('00-架构/01-范围与平台.md')
    expect(buttons[0].textContent).toContain('派这一份')

    await view.click(buttons[1])
    // 只走桥：面板自己不发 IPC（发请求 + 预填是编辑器视图的事，见 CeshuView.handleStartAiDevFor）
    expect(dispatched).toEqual(['02-核心玩法/03-战斗与伤害公式.md'])
    expect(api.calls).not.toContain('ceshu.workOrder')
  })

  it('核对失败时出错误条，不白屏', async () => {
    api = installMbApi({
      overrides: {
        'ceshu.workOrderProgress': () => {
          throw new Error('工作区未设置')
        }
      }
    })
    view = await renderDom(<WorkBoardPanel ceshuId="dd66f593" onClose={() => undefined} />)

    expect(view.byTestId('workboard-error').textContent).toContain('工作区未设置')
  })
})
