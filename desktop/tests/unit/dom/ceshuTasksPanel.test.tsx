// @vitest-environment jsdom
import { useState } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import CeshuTasksPanel from '../../../src/renderer/src/components/CeshuTasksPanel'
import { createDefaultCeshu } from '../../../src/shared/ceshuModel'
import type { CeshuDocument } from '../../../src/shared/ceshuConstants'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * 岗位任务面板：两种口径
 * - 没生成过 → 按章字段清单（并明确标注「这不是任务」）
 * - 生成过 → 按优先级分组的可执行任务，带依据章
 */

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

/**
 * 模拟真实父组件（`CeshuView`）：面板只回传 doc，由上层 setDoc 触发重渲染。
 * 拿静态 doc 测「生成后界面更新」是测不出东西的——真实链路里状态在上层。
 */
function Host({ initial, onUpdated }: { initial: CeshuDocument; onUpdated?: (doc: CeshuDocument) => void }) {
  const [doc, setDoc] = useState(initial)
  return (
    <CeshuTasksPanel
      doc={doc}
      onDocUpdated={(next) => {
        setDoc(next)
        onUpdated?.(next)
      }}
    />
  )
}

describe('CeshuTasksPanel：按章清单（未生成）', () => {
  it('默认程序岗位列出核心玩法；切美术出现美术章', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
    view = await renderDom(<CeshuTasksPanel doc={doc} />)

    expect(view!.byTestId('tasks-panel')).toBeTruthy()
    expect(view!.query('[data-testid="tasks-section-gameplay"]')).not.toBeNull()
    // 明确告知这不是任务，避免被当成待办
    expect(view!.byTestId('tasks-derived-hint').textContent).toContain('还不是这个岗位要干的活')

    await view!.click(view!.byTestId('tasks-role-artist'))
    expect(view!.query('[data-testid="tasks-section-art"]')).not.toBeNull()
  })
})

describe('CeshuTasksPanel：AI 生成的任务', () => {
  it('点生成 → 调 aiGenerateTasks → 按优先级渲染任务与依据章', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
    const generated: CeshuDocument = {
      ...doc,
      task_plan: {
        programmer: [
          { title: '实现核心循环状态机', detail: '三态切换，验收：能跑通一局', priority: 'P0', source: 'gameplay' },
          { title: '接入存档', detail: '退出重进不丢进度', priority: 'P1', source: 'systems' }
        ],
        artist: [{ title: '绘制主界面', detail: '', priority: 'P2', source: 'uiux' }]
      }
    }
    api = installMbApi({
      overrides: {
        'ceshu.aiGenerateTasks': () => ({
          doc: generated,
          plan: generated.task_plan,
          model: 'fake'
        })
      }
    })

    let updated: CeshuDocument | null = null
    view = await renderDom(<Host initial={doc} onUpdated={(next) => (updated = next)} />)

    await view!.click(view!.byTestId('tasks-generate'))

    expect(api!.calls).toContain('ceshu.aiGenerateTasks')
    // 生成结果交回上层（否则界面还显示旧 doc）
    expect(updated).not.toBeNull()
    expect(view!.byTestId('tasks-notice').textContent).toContain('3 条岗位任务')
    expect(view!.query('[data-testid="tasks-plan-P0"]')).not.toBeNull()
    expect(view!.query('[data-testid="tasks-plan-P1"]')).not.toBeNull()
    expect(view!.byTestId('tasks-plan-item').textContent).toContain('实现核心循环状态机')
    expect(view!.byTestId('tasks-plan-source').textContent).toContain('核心玩法')
  })

  it('生成失败：显示错误，不静默', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: 'X' })
    api = installMbApi({
      overrides: {
        'ceshu.aiGenerateTasks': () => {
          throw new Error('模型未配置')
        }
      }
    })
    view = await renderDom(<CeshuTasksPanel doc={doc} />)

    await view!.click(view!.byTestId('tasks-generate'))
    expect(view!.byTestId('tasks-error').textContent).toContain('模型未配置')
  })

  it('生成后切岗位：只显示该岗位的任务，没生成的岗位回落清单', async () => {
    const doc = createDefaultCeshu({ scope: 'full', name: 'X' })
    const withPlan: CeshuDocument = {
      ...doc,
      task_plan: { programmer: [{ title: '实现战斗结算', detail: '', priority: 'P0', source: 'combat' }] }
    }
    view = await renderDom(<CeshuTasksPanel doc={withPlan} />)

    expect(view!.byTestId('tasks-plan-item').textContent).toContain('实现战斗结算')
    await view!.click(view!.byTestId('tasks-role-artist'))
    // 美术岗没生成过 → 回到按章清单
    expect(view!.query('[data-testid="tasks-derived"]')).not.toBeNull()
  })
})
