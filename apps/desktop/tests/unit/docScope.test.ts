import { describe, expect, it } from 'vitest'

import {
  contentChapterCountsForDoc,
  createDefaultCeshu,
  getDocKind,
  visibleChaptersForDoc
} from '@mobai/shared/ceshu/model'

/**
 * 阶段轴（方向版 lite / 细节版 full）守卫：三档都识别 gdd_scope，
 * 方向版只铺核心章，完整版铺全章；章数按档位给出（游戏零回归）。
 */
function doc(kind: 'game' | 'application' | 'ai', scope: 'lite' | 'full') {
  return createDefaultCeshu({ scope, docKind: kind, name: '示例' })
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
})

describe('阶段轴：AI 档 lite/full', () => {
  it('方向版保留模型卡，去掉其余模型层与实现章', () => {
    const lite = visibleChaptersForDoc(doc('ai', 'lite'))
    expect(lite).toContain('model_card')
    for (const key of ['data_sheet', 'system_card', 'eval_redteam', 'architecture', 'api']) {
      expect(lite).not.toContain(key)
    }
  })

  it('完整版含全部模型层四章', () => {
    const full = visibleChaptersForDoc(doc('ai', 'full'))
    for (const key of ['model_card', 'data_sheet', 'system_card', 'eval_redteam']) {
      expect(full).toContain(key)
    }
  })
})

describe('阶段轴：档位与章数（游戏零回归）', () => {
  it('contentChapterCountsForDoc：游戏 9/23、应用 6/16、AI 7/20', () => {
    expect(contentChapterCountsForDoc(doc('game', 'full'))).toEqual({ lite: 9, full: 23 })
    expect(contentChapterCountsForDoc(doc('application', 'full'))).toEqual({ lite: 6, full: 16 })
    expect(contentChapterCountsForDoc(doc('ai', 'full'))).toEqual({ lite: 7, full: 20 })
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
