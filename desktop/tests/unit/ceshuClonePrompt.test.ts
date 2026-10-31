import { describe, expect, it } from 'vitest'

import {
  CLONE_CONCEPT_CHAPTERS,
  applyCloneDecompose,
  buildCloneDecomposePrompt,
  parseCloneDecompose
} from '../../src/shared/ceshu/prompts'
import { createDefaultCeshu } from '../../src/shared/ceshu/model'

/**
 * 复刻拆解（复刻单线 MVP）：提示词 → AI JSON → 立项一页 → 文档。
 * 纯逻辑，不碰 LLM/IPC，保证可回归。
 */
describe('复刻拆解 ceshuClonePrompt', () => {
  it('提示词含 7 个立项章 + 真实字段键 + JSON/复刻约束', () => {
    const { system, prompt } = buildCloneDecomposePrompt({ gameName: '吸血鬼幸存者', gameType: 'Roguelike' })
    expect(CLONE_CONCEPT_CHAPTERS).toHaveLength(7)
    for (const chapter of CLONE_CONCEPT_CHAPTERS) expect(prompt).toContain(`"${chapter}"`)
    expect(prompt).toContain('"positioning"') // meta 字段
    expect(prompt).toContain('"core_loop"') // gameplay 字段
    expect(prompt).not.toContain('"ledger"') // 机读字段不进立项一页
    expect(prompt).not.toContain('"numeric_assertions"')
    expect(system).toContain('复刻自')
    expect(system).toContain('JSON')
  })

  it('解析只保留立项章 + 已知字段，丢弃未知章/未知字段', () => {
    const raw = JSON.stringify({
      meta: { positioning: '定位', unknown_field: 'x' },
      combat: { combat_mode: '自动战斗' },
      art: { art_style: '非立项章，应丢弃' },
      economy: { currency_types: '金币' }
    })
    const fields = parseCloneDecompose(raw)
    expect(fields.meta).toEqual({ positioning: '定位' })
    expect(fields.combat).toEqual({ combat_mode: '自动战斗' })
    expect(fields.economy).toEqual({ currency_types: '金币' })
    expect(fields.art).toBeUndefined()
  })

  it('解析丢弃机读字段（账本/断言不属于立项一页）', () => {
    const raw = JSON.stringify({
      economy: { currency_types: '金币', ledger: ['a|b'] },
      numeric: { core_formulas: 'x', numeric_assertions: ['y'] }
    })
    const fields = parseCloneDecompose(raw)
    expect(fields.economy).toEqual({ currency_types: '金币' })
    expect(fields.numeric).toEqual({ core_formulas: 'x' })
  })

  it('解析容忍 markdown 代码块包裹的 JSON', () => {
    const raw = '```json\n{"vision":{"design_vision":"一句话愿景"}}\n```'
    expect(parseCloneDecompose(raw).vision).toEqual({ design_vision: '一句话愿景' })
  })

  it('套用只覆盖立项章，其余章原样不动', () => {
    const base = createDefaultCeshu({ scope: 'full', name: 'X' })
    const beforeArt = base.art
    const doc = applyCloneDecompose(base, { meta: { positioning: '新定位' } })
    expect(doc.meta.positioning).toBe('新定位')
    expect(doc.art).toBe(beforeArt) // 未覆盖 → 引用不变
  })
})
