import { describe, expect, it } from 'vitest'

import { buildAiSeedPrompt } from '../../src/shared/ceshu/prompts/aiSeedPrompt'

/** 逐字对齐 旧版 `ui/ceshu/home_view::_on_ai_send` 的 `guided_text` 括号引导段 */
const GUIDE =
  '（请以资深游戏主策划身份和我多轮对话：先问 3-5 个关键问题，' +
  '包括核心玩法、世界观、主要游戏系统、规模、付费模式等，' +
  '等我回答充分后再调用 system.ceshu 的 ai_generate 生成完整策划书。' +
  '不要一句话就直接生成。）'

describe('buildAiSeedPrompt 空白输入', () => {
  it('空串 / 纯空白 / 换行 → null（调用方据此忽略发送）', () => {
    expect(buildAiSeedPrompt('')).toBeNull()
    expect(buildAiSeedPrompt('   ')).toBeNull()
    expect(buildAiSeedPrompt('\n')).toBeNull()
    expect(buildAiSeedPrompt(' \t\n ')).toBeNull()
  })
})

describe('buildAiSeedPrompt 正常输入', () => {
  it('以「[策划书生成] 」开头', () => {
    const out = buildAiSeedPrompt('做个仙侠 RPG')
    expect(out).not.toBeNull()
    expect(out?.startsWith('[策划书生成] ')).toBe(true)
  })

  it('前后空白被 trim，不保留多余空格', () => {
    expect(buildAiSeedPrompt('  做个仙侠 RPG  ')).toBe('[策划书生成] 做个仙侠 RPG\n\n' + GUIDE)
  })

  it('完整输出逐字匹配：前缀 + 空行 + 括号引导段', () => {
    const input = '做个仙侠 RPG，3 种族 5 阵营，回合制战斗'
    expect(buildAiSeedPrompt(input)).toBe(`[策划书生成] ${input}\n\n${GUIDE}`)
  })

  it('引导段包含 system.ceshu 与 ai_generate 关键词', () => {
    const out = buildAiSeedPrompt('测试')
    expect(out).toContain('system.ceshu')
    expect(out).toContain('ai_generate')
  })
})
