import type { CeshuDocument } from '../reference'
import { fieldColumns } from '../fields'
import { column, toRowStrings } from '../workflow'
import { readText } from '../../util/io'

/**
 * Demo 生成提示词构建（文档 → 单文件可玩 HTML）。
 *
 * ## 为什么需要它（2026-10-24，用户指出「豆包那边直接生成 html 就能玩」）
 * 原型 Demo 不是手搓引擎，而是**把文档里的规则喂给模型，让它写一个单文件
 * HTML**——豆包的 561 行 Demo 就是这么来的。本模块把「文档 → 提示词」这一段
 * 固化下来：提取数值参数/状态机/核心循环/账本/验收旅程，压成一份硬约束清单，
 * 避免每次手写提示词、避免模型自由发挥偏离文档。
 *
 * ## 三条硬约束（决定 Demo 是否「可验收」）
 * 1. **RULES 常量 = 数值参数表**：Demo 里的 RULES 必须逐项来自文档参数，
 *    这是「GDD ↔ Demo 同源」的锚点（豆包靠 grep RULES 核对，我们靠提示词约束）；
 * 2. **单文件、零外部依赖**：不能引 CDN/框架/字体——离线双击就能玩；
 * 3. **可被验收器检查**：页面上必须有可见文本与可交互元素（验收器五项检查），
 *    并把「验收旅程」做成调试面板里的自检清单。
 */

export interface DemoPromptResult {
  system: string
  prompt: string
}

/** 文档 → Demo 生成提示词（无文档内容时也会产出可用提示词，只是规则区为空） */
export function buildDemoPrompt(doc: CeshuDocument): DemoPromptResult {
  const gameName = readText(doc.meta.game_name) || '未命名游戏'
  const gameType = readText(doc.meta.game_type) || '未指定'
  const positioning = readText(doc.meta.positioning) || ''
  // 一律走 toRowStrings：这些字段有的有列定义（对象行）、有的没有（字符串行），
  // 只认字符串会让 Demo 悄悄少掉数值参数表 / 验收旅程这类「必须可玩出来」的规则。
  const loopPoints = toRowStrings(doc.gameplay.core_loop_points, fieldColumns('gameplay', 'core_loop_points'))
  const stateMachine = toRowStrings(doc.gameplay.state_machine, fieldColumns('gameplay', 'state_machine'))
  const parameters = toRowStrings(doc.numeric.numeric_parameters, fieldColumns('numeric', 'numeric_parameters'))
  const ledger = toRowStrings(doc.economy.ledger, fieldColumns('economy', 'ledger'))
  const journeys = toRowStrings(doc.qa.acceptance_journeys, fieldColumns('qa', 'acceptance_journeys'))
  const cases = toRowStrings(doc.qa.test_case_list, fieldColumns('qa', 'test_case_list'))

  const lines: string[] = []
  lines.push(`为《${gameName}》（${gameType}）写一个**单文件可玩 HTML Demo**。`)
  if (positioning !== '') lines.push(`一句话定位：${positioning}`)
  lines.push('')

  if (loopPoints.length > 0) {
    lines.push('## 核心循环（必须可玩出来）')
    for (const point of loopPoints) lines.push(`- ${point}`)
    lines.push('')
  }

  if (stateMachine.length > 0) {
    lines.push('## 状态机（每条转移都要实现，结算效果照写）')
    for (const row of stateMachine) {
      lines.push(`- ${column(row, 0)} → [${column(row, 1)}] → ${column(row, 3)}${column(row, 2) !== '' ? `（${column(row, 2)}）` : ''}`)
    }
    lines.push('')
  }

  if (parameters.length > 0) {
    lines.push('## 数值参数（**必须原样进 RULES 常量**，一个都不许改）')
    for (const row of parameters) {
      lines.push(`- ${column(row, 0)} = ${column(row, 1)}`)
    }
    lines.push('')
  }

  if (ledger.length > 0) {
    lines.push('## 关键账本（新手前几分钟的资源流必须与之一致）')
    for (const row of ledger) {
      lines.push(`- ${column(row, 0)}：初始 ${column(row, 1)}，交易 ${column(row, 2)}，期末 ${column(row, 3)}`)
    }
    lines.push('')
  }

  if (cases.length > 0) {
    lines.push('## 验收用例（Demo 里要能手动复现）')
    for (const row of cases) {
      lines.push(`- [${column(row, 1)}] ${column(row, 0)}：${column(row, 2)} → ${column(row, 3)} → ${column(row, 4)}`)
    }
    lines.push('')
  }

  if (journeys.length > 0) {
    lines.push('## 验收旅程（做成调试面板里的自检清单，可勾选）')
    for (const row of journeys) {
      lines.push(`- ${column(row, 0)}：${column(row, 1)}（期望：${column(row, 2)}）`)
    }
    lines.push('')
  }

  lines.push(`## 硬约束（不满足即不可验收）
1. **单文件**：一个 .html，内联 CSS 与 JS，**零外部依赖**（不引 CDN/框架/字体/图片），离线双击可玩；
2. **RULES 常量**：把上面「数值参数」逐项写成 \`const RULES = { ... }\`，所有玩法数值只从 RULES 取，不得散落硬编码；
3. **真实计时**：建造/行军/产出用真实时间推进（\`setInterval\` 1Hz 即可），不要「点一下秒完成」——时间是这个游戏的核心资源；
4. **存档**：关键状态（资源/建筑等级/兵力/已占领点）写 \`localStorage\`，刷新页面能续玩；
5. **调试面板**：至少提供 加速 ×10/×30、加资源、重置 三个按钮，外加「验收旅程」勾选清单；
6. **反馈**：每次操作 1 秒内要有可见变化（数字跳动/日志/动画），不要无反馈的等待；
7. **中文界面**，暗色主题，1280×900 内完整可用（不需要响应式）；
8. 页面必须有 **≥100 字可见文本** 与 **≥3 个可交互元素**（按钮/输入），否则自动化验收会判失败。`)

  return {
    system:
      '你是资深游戏原型工程师。你的任务是把一份策划书的规则写成**可直接玩**的单文件 HTML Demo。' +
      '严格遵守用户给出的硬约束，不要解释、不要省略，只输出完整的 HTML 源码（从 <!DOCTYPE html> 开始到 </html> 结束）。',
    prompt: lines.join('\n')
  }
}
