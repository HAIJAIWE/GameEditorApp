import { describe, expect, it } from 'vitest'

import {
  contentChapterCountsForDoc,
  createDefaultCeshu,
  enabledModulesForDoc,
  getDocKind,
  normalizeCeshu,
  visibleChaptersForDoc
} from '@mobai/shared/ceshu/model'

/**
 * 阶段轴（方向版 lite / 细节版 full）+ 应用档可选「AI 模型层」守卫。
 * AI 不是独立档位：启用 `enabled_modules: ['ai_layer']` 后，应用文档末尾追加模型层四章。
 */
function doc(kind: 'game' | 'application', scope: 'lite' | 'full') {
  return createDefaultCeshu({ scope, docKind: kind, name: '示例' })
}

function withAi<T extends ReturnType<typeof doc>>(d: T): T {
  ;(d.meta as Record<string, unknown>).enabled_modules = ['ai_layer']
  return d
}

describe('阶段轴：应用档 lite/full', () => {
  it('方向版只含定义/功能/里程碑/风险，不含架构/接口/数据', () => {
    const lite = visibleChaptersForDoc(doc('application', 'lite'))
    for (const key of ['meta', 'overview', 'users', 'scope', 'features', 'milestones', 'risks']) {
      expect(lite).toContain(key)
    }
    for (const key of ['architecture', 'api', 'data_model', 'nonfunctional', 'testing']) {
      expect(lite).not.toContain(key)
    }
  })

  it('完整版含全部实现章', () => {
    const full = visibleChaptersForDoc(doc('application', 'full'))
    expect(full).toContain('architecture')
    expect(full).toContain('api')
    expect(full).toContain('data_model')
  })

  it('未勾选 AI 时，完整版不含模型层四章（不挤占 1–16 章号）', () => {
    const full = visibleChaptersForDoc(doc('application', 'full'))
    for (const key of ['model_card', 'data_sheet', 'system_card', 'eval_redteam']) {
      expect(full).not.toContain(key)
    }
    expect(full).toHaveLength(17) // meta + 16
  })
})

describe('应用档：可选 AI 模型层（enabled_modules）', () => {
  it('勾选后完整版追加模型层四章', () => {
    const full = visibleChaptersForDoc(withAi(doc('application', 'full')))
    for (const key of ['model_card', 'data_sheet', 'system_card', 'eval_redteam']) {
      expect(full).toContain(key)
    }
    expect(full).toHaveLength(21) // meta + 16 + 4
  })

  it('勾选后方向版补一章模型卡，不含其余模型层章', () => {
    const lite = visibleChaptersForDoc(withAi(doc('application', 'lite')))
    expect(lite).toContain('model_card')
    for (const key of ['data_sheet', 'system_card', 'eval_redteam']) {
      expect(lite).not.toContain(key)
    }
  })
})

describe('阶段轴：档位与章数（游戏零回归）', () => {  it('contentChapterCountsForDoc：游戏 9/23、应用 6/16、应用含 AI 7/20', () => {
    expect(contentChapterCountsForDoc(doc('game', 'full'))).toEqual({ lite: 9, full: 23 })
    expect(contentChapterCountsForDoc(doc('application', 'full'))).toEqual({ lite: 6, full: 16 })
    expect(contentChapterCountsForDoc(withAi(doc('application', 'full')))).toEqual({ lite: 7, full: 20 })
  })

  it('游戏 lite 可见章少于 full（沿用既有档位行为）', () => {
    const lite = visibleChaptersForDoc(doc('game', 'lite'))
    const full = visibleChaptersForDoc(doc('game', 'full'))
    expect(lite.length).toBeLessThan(full.length)
  })

  it('建文档时写入档位，读回一致', () => {
    const liteDoc = doc('application', 'lite')
    expect(getDocKind(liteDoc)).toBe('application')
    expect(liteDoc.meta.gdd_scope).toBe('lite')
  })
})

describe('可选模块：enabled_modules（单一事实源）', () => {
  it('enabled_modules 含 ai_layer 等价于启用 AI 模型层', () => {
    const d = doc('application', 'full')
    ;(d.meta as Record<string, unknown>).enabled_modules = ['ai_layer']
    expect(visibleChaptersForDoc(d)).toHaveLength(21) // meta + 16 + 4
  })

  it('未启用的模块不参与可见章', () => {
    expect(visibleChaptersForDoc(doc('application', 'full'))).toHaveLength(17) // meta + 16
  })

  it('normalizeCeshu 把旧 ai_enabled 一次性迁移为 enabled_modules 并删除旧字段', () => {
    const legacy = doc('application', 'full')
    ;(legacy.meta as Record<string, unknown>).ai_enabled = true
    const normalized = normalizeCeshu(JSON.parse(JSON.stringify(legacy)))
    expect(enabledModulesForDoc(normalized)).toEqual(['ai_layer'])
    expect((normalized.meta as Record<string, unknown>).ai_enabled).toBeUndefined()
  })
})
