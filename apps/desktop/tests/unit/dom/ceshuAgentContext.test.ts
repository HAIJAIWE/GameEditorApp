// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { buildAgentContext } from '../../../src/renderer/src/components/ceshuDoc/CeshuAgentPanel'
import { createDefaultCeshu, chapterFieldsForDoc, chapterLabelForDoc, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import { CESHU_AGENT_CONTEXT_LIMIT } from '@mobai/shared/ceshu/prompts'
import type { ChapterData } from '@mobai/shared/ceshu/reference'

/** 把每章每个「扁平」字段（跳过嵌套 key）填成长文本，用来撑爆预算 */
function inflate(doc: ReturnType<typeof createDefaultCeshu>): void {
  for (const chapter of visibleChaptersForDoc(doc)) {
    const data = (doc as unknown as Record<string, ChapterData>)[chapter]
    if (data === undefined) continue
    for (const field of chapterFieldsForDoc(doc, chapter)) {
      if (field.key.includes('.')) continue
      if (typeof data[field.key] === 'string' || data[field.key] === undefined) {
        data[field.key] = 'x'.repeat(200)
      }
    }
  }
}

describe('buildAgentContext：按章分配预算（问答上下文）', () => {
  it('小文档：已填章全部出现，不触发截断', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '小文档' })
    doc.vision.design_vision = '简短愿景'
    doc.gameplay.core_loop = '探索→战斗→收获'
    const text = buildAgentContext(doc, false)
    expect(text).toContain('产品愿景')
    expect(text).toContain('核心玩法')
    expect(text).not.toContain('…（已截断）')
    expect(text.length).toBeLessThanOrEqual(CESHU_AGENT_CONTEXT_LIMIT)
  })

  it('满字段长文档：末章仍出现（不被从头截断丢掉），且不超上限', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '大文档' })
    inflate(doc)
    const text = buildAgentContext(doc, false)
    expect(text.length).toBeLessThanOrEqual(CESHU_AGENT_CONTEXT_LIMIT)
    const lastChapter = visibleChaptersForDoc(doc).at(-1)
    expect(lastChapter).toBeTruthy()
    // 旧实现从头切前 6000 字，末章会整段消失；按章分配后末章必须出现
    expect(text).toContain(chapterLabelForDoc(doc, lastChapter as string))
  })

  it('改文档模式：仍带字段契约抬头', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '契约' })
    const text = buildAgentContext(doc, true)
    expect(text).toContain('【字段契约】')
    expect(text.length).toBeLessThanOrEqual(CESHU_AGENT_CONTEXT_LIMIT)
  })
})
