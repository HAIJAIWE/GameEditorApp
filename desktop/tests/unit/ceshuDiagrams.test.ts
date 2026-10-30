import { describe, expect, it } from 'vitest'

import {
  renderCoreLoopSvg,
  renderDocDiagrams,
  renderGrowthChartSvg,
  renderStateMachineSvg
} from '../../src/main/ceshu/export/content/diagrams'
import { createDefaultCeshu } from '../../src/shared/ceshu/model/ceshuModel'

describe('renderCoreLoopSvg：核心循环图', () => {
  it('步骤不足 2 个 → null（不画空图）', () => {
    expect(renderCoreLoopSvg([])).toBeNull()
    expect(renderCoreLoopSvg(['只有一个'])).toBeNull()
    expect(renderCoreLoopSvg(['  ', ''])).toBeNull()
  })

  it('3 步 → 合法 SVG，含全部步骤与回流标注', () => {
    const svg = renderCoreLoopSvg(['算成本', '派部队', '等行军', '判战报'])
    expect(svg).not.toBeNull()
    expect(svg).toContain('<svg')
    expect(svg).toContain('</svg>')
    expect(svg).toContain('核心循环')
    for (const step of ['算成本', '派部队', '等行军', '判战报']) expect(svg).toContain(step)
    expect(svg).toContain('回到起点')
    expect(svg).toContain('marker-end="url(#loopArrow)"')
  })

  it('超过 6 步只画前 6 步并标注总数', () => {
    const steps = ['一', '二', '三', '四', '五', '六', '七', '八']
    const svg = renderCoreLoopSvg(steps) as string
    expect(svg).toContain('共 8 步')
    expect(svg).not.toContain('>七<')
  })

  it('XML 特殊字符被转义（防注入/破坏 SVG）', () => {
    // 长文本会折行，故按「片段」断言转义，而不是断言完整字符串
    const svg = renderCoreLoopSvg(['A & B <script>', '收尾']) as string
    expect(svg).toContain('&amp;')
    expect(svg).toContain('&lt;')
    expect(svg).not.toContain('<script>')
    expect(svg).not.toMatch(/[^&]script>/)
  })
})

describe('renderStateMachineSvg：状态机图', () => {
  it('无有效转移 → null；3 列按「状态|事件|新状态」宽容解析', () => {
    expect(renderStateMachineSvg([])).toBeNull()
    expect(renderStateMachineSvg(['只有状态没有箭头'])).toBeNull() // 单列无法构成转移
    // 3 列：AI 常省掉结算效果列，按 状态|事件|新状态 理解，而不是丢弃整行
    const three = renderStateMachineSvg(['空闲|建造|扣资源']) as string
    expect(three).toContain('空闲')
    expect(three).toContain('扣资源')
  })

  it('每条转移一行：起止状态、事件、结算效果都出现', () => {
    const svg = renderStateMachineSvg([
      '空闲|点击升级且资源足够|扣资源并开始倒计时|建造中',
      '建造中|倒计时结束|建筑等级+1|空闲'
    ])
    expect(svg).not.toBeNull()
    for (const text of ['空闲', '建造中', '点击升级', '扣资源并开始倒计时', '建筑等级+1']) {
      expect(svg).toContain(text)
    }
    expect(svg).toContain('核心状态机')
  })

  it('结算效果可缺省（3 列也能画）', () => {
    const svg = renderStateMachineSvg(['A|事件|B']) as string
    expect(svg).toContain('A')
    expect(svg).toContain('B')
    expect(svg).toContain('事件')
  })

  it('XML 特殊字符被转义', () => {
    const svg = renderStateMachineSvg(['A&B|事件<1>|效果|C&D']) as string
    expect(svg).not.toContain('<1>')
    expect(svg).toContain('&amp;')
  })
})

describe('renderDocDiagrams：从文档取图', () => {
  it('空文档 → 两张都 null', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    expect(renderDocDiagrams(doc)).toEqual({ coreLoop: null, stateMachine: null, growthChart: null })
  })

  it('填了核心循环、状态机与成长曲线 → 三张都出', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.gameplay.core_loop_points = ['算', '派', '等', '判']
    doc.gameplay.state_machine = ['空闲|点击升级|扣资源|建造中', '建造中|完成|等级+1|空闲']
    doc.numeric.growth_curves = ['怪物HP|指数|10,1.28']
    const { coreLoop, stateMachine, growthChart } = renderDocDiagrams(doc)
    expect(coreLoop).not.toBeNull()
    expect(stateMachine).not.toBeNull()
    expect(growthChart).not.toBeNull()
  })
})

describe('renderGrowthChartSvg：成长曲线图', () => {
  it('指数型行 → 画图；含基数/成长与图例', () => {
    const svg = renderGrowthChartSvg(['怪物HP|指数|10,1.28', '金币|指数|4,1.22'])
    expect(svg).not.toBeNull()
    expect(svg).toContain('成长曲线（对数坐标）')
    expect(svg).toContain('怪物HP 10×1.28^(n-1)')
    expect(svg).toContain('金币 4×1.22^(n-1)')
    expect(svg).toContain('<polyline')
  })

  it('接受 ×/* 分隔写法', () => {
    expect(renderGrowthChartSvg(['A|指数|10×1.28'])).not.toBeNull()
    expect(renderGrowthChartSvg(['A|指数|10*1.28'])).not.toBeNull()
  })

  it('非指数型 / 参数不可解析 → 不画（返回 null）', () => {
    expect(renderGrowthChartSvg(['A|线性|10,1.28'])).toBeNull()
    expect(renderGrowthChartSvg(['A|指数|缓慢增长'])).toBeNull()
    expect(renderGrowthChartSvg([])).toBeNull()
  })

  it('最多三条曲线（超出忽略）', () => {
    const svg = renderGrowthChartSvg(['A|指数|1,1.2', 'B|指数|2,1.3', 'C|指数|3,1.4', 'D|指数|4,1.5']) as string
    expect(svg).toContain('C 3×1.4')
    expect(svg).not.toContain('D 4×1.5')
  })
})
