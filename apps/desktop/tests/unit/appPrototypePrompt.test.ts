import { describe, expect, it } from 'vitest'

import { buildAppPrototypePrompt, buildDemoPrompt } from '@mobai/shared/ceshu/prompts'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'

/** 应用「试玩版」提示词：把 SDD 压成可点击界面原型的硬约束。 */
function appDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full', docKind: 'application', name: '团队看板' })
  doc.meta.project_name = '团队看板'
  doc.meta.platform = ['desktop', 'web']
  const d = doc as unknown as Record<string, Record<string, unknown>>
  d.overview = { problem: '任务散落各处', value_proposition: '一站式协同', success_metrics: ['日活 1w'] }
  d.users = { personas: [{ name: '项目经理', context: '周会', pain: '找不到结论', goal: '快速对齐' }], scenarios: [] }
  d.features = {
    feature_list: [{ module: '看板', feature: '任务拖拽', acceptance: '可拖动排序' }],
    priorities: [],
    dependencies: []
  }
  return doc
}

describe('应用界面原型提示词（试玩版）', () => {
  it('含项目名 / 界面原型 / 功能清单 / 多屏约束，且不含游戏 RULES 口径', () => {
    const { system, prompt } = buildAppPrototypePrompt(appDoc())
    expect(system).toContain('原型')
    expect(prompt).toContain('团队看板')
    expect(prompt).toContain('界面原型')
    expect(prompt).toContain('功能清单')
    expect(prompt).toContain('任务拖拽')
    expect(prompt).toContain('多屏')
    expect(prompt).toContain('硬约束')
    expect(prompt).not.toContain('RULES')
    expect(prompt).not.toContain('可玩 HTML Demo')
  })

  it('游戏「可玩 Demo」提示词不受影响', () => {
    const game = createDefaultCeshu({ scope: 'full', name: '星海计划' })
    expect(buildDemoPrompt(game).prompt).toContain('可玩 HTML Demo')
  })
})
