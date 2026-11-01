import { describe, expect, it } from 'vitest'

import { buildDemoPrompt } from '@mobai/shared/ceshu/prompts'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'

describe('buildDemoPrompt：文档 → Demo 提示词', () => {
  it('空文档也能产出可用提示词（规则区为空，硬约束齐全）', () => {
    const { system, prompt } = buildDemoPrompt(createDefaultCeshu({ scope: 'full' }))
    expect(system).toContain('单文件 HTML Demo')
    expect(prompt).toContain('硬约束')
    expect(prompt).toContain('RULES 常量')
    expect(prompt).toContain('localStorage')
  })

  it('数值参数原样进提示词（RULES 同源锚点）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    doc.numeric.numeric_parameters = ['主城升级基数|30|10-120|慢|快', '步兵基础攻击|10|5-30|快|慢']
    const { prompt } = buildDemoPrompt(doc)
    expect(prompt).toContain('主城升级基数 = 30')
    expect(prompt).toContain('步兵基础攻击 = 10')
    expect(prompt).toContain('一个都不许改')
  })

  it('核心循环 / 状态机 / 账本 / 用例 / 旅程都进提示词', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    doc.gameplay.core_loop_points = ['算成本', '派部队']
    doc.gameplay.state_machine = ['空闲|点击升级|扣资源|建造中']
    doc.economy.ledger = ['首局|0|4,4,-5|3']
    doc.qa.test_case_list = ['首杀得币|正常|层1|等两次击杀|币≥5|待执行']
    doc.qa.acceptance_journeys = ['标准路径|1 升级；2 出征|首战可胜']
    const { prompt } = buildDemoPrompt(doc)
    expect(prompt).toContain('- 算成本')
    expect(prompt).toContain('空闲 → [点击升级] → 建造中')
    expect(prompt).toContain('初始 0，交易 4,4,-5，期末 3')
    expect(prompt).toContain('[正常] 首杀得币')
    expect(prompt).toContain('标准路径')
  })

  it('定位与游戏名进提示词', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '列王纷争录' })
    doc.meta.positioning = '给爱算计的玩家'
    const { prompt } = buildDemoPrompt(doc)
    expect(prompt).toContain('《列王纷争录》')
    expect(prompt).toContain('给爱算计的玩家')
  })
})
