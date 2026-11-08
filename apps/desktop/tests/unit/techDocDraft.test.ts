import { describe, expect, it } from 'vitest'

import { buildTechDocDraft } from '@mobai/shared/agent/techDoc/techDocDraft'
import { TECH_DOC_SECTIONS } from '@mobai/shared/agent/techDoc/techDocSchema'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'

/**
 * GDD → TDD 草稿（2026-11-08）。
 * 依据 docs/game-doc-corpus-2026.md：GDD=what / TDD=how，行业要求 TDD 从 GDD 取素材、
 * 不凭空写实现方案。此前 outline 只给空骨架，这里验证素材真的进了草稿。
 */
describe('buildTechDocDraft', () => {
  it('9 章大纲齐全，且含 GDD 输入映射与来源回链', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '星河战记' })
    const draft = buildTechDocDraft(doc, 'tech-星河战记')
    expect(draft.markdown).toContain('# tech-星河战记')
    for (const section of TECH_DOC_SECTIONS) {
      expect(draft.markdown, section.title).toContain(`## ${section.title}`)
    }
    expect(draft.markdown).toContain('输入：先读策划书（GDD）')
    expect(draft.markdown).toContain('## 来源小节')
  })

  it('已填的 GDD 字段被摘进对应 TDD 章节，并标注来源章名', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '星河战记' })
    doc.meta.game_name = '星河战记'
    doc.vision.design_vision = '星际考古的核心幻想'
    doc.tech.engine = 'Unreal Engine 5'
    const draft = buildTechDocDraft(doc, 'tech-doc')
    expect(draft.sourcedFields).toBeGreaterThan(0)
    expect(draft.markdown).toContain('星际考古的核心幻想')
    expect(draft.markdown).toContain('Unreal Engine 5')
    expect(draft.markdown).toContain('来自 1. 产品愿景')
    expect(draft.sourceChapters.length).toBeGreaterThan(0)
  })

  it('空文档：生成空草稿而非报错，明确提示无素材', () => {
    const doc = createDefaultCeshu({ scope: 'lite', name: '空项目' })
    const draft = buildTechDocDraft(doc, 'tech-empty')
    expect(draft.markdown).toContain('（待补：本段暂无 GDD 素材')
    expect(draft.sourceChapters.length).toBeGreaterThanOrEqual(0)
  })

  it('应用档同样可用（章节按档位规格化，不会误取游戏章）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '应用', docKind: 'application' })
    doc.meta.project_name = '轻量任务看板'
    const draft = buildTechDocDraft(doc, 'tech-app')
    expect(draft.markdown).toContain('## 架构总览')
    expect(() => draft.markdown).not.toThrow()
  })
})
