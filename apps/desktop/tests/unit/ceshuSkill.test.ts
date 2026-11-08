import { describe, expect, it } from 'vitest'

import { createCeshuSkill } from '@mobai/agent-core/skills/ceshuSkill'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import type { CeshuDocument, ChapterData, ChapterKey } from '@mobai/shared/ceshu/reference'

function clone<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T
}

/** 假存储端口：saveChapter 复刻真实 manager → withChapter 的「整章替换」语义 */
function makePort(seed: CeshuDocument) {
  const store = new Map<string, CeshuDocument>([['d1', clone(seed)]])
  return {
    list: () => [] as never[],
    get: (id: string): CeshuDocument => {
      const doc = store.get(id)
      if (doc === undefined) throw new Error('策划书不存在')
      return clone(doc)
    },
    create: async () => clone(seed),
    saveChapter: async (id: string, chapter: ChapterKey, data: ChapterData): Promise<CeshuDocument> => {
      const doc = store.get(id)
      if (doc === undefined) throw new Error('策划书不存在')
      const next = clone(doc) as unknown as Record<string, ChapterData>
      next[chapter] = data
      store.set(id, next as unknown as CeshuDocument)
      return clone(next as unknown as CeshuDocument)
    },
    remove: async () => true
  }
}

type R = { success: boolean; message: string; error?: string; data?: unknown }

function run(skill: ReturnType<typeof createCeshuSkill>, params: Record<string, unknown>): Promise<R> {
  return skill.execute(params, {}) as Promise<R>
}

describe('system.ceshu 技能 update：白名单 + 合并 + 校验反馈', () => {
  it('未知字段被拒，且不落盘', async () => {
    const port = makePort(createDefaultCeshu({ scope: 'full' }))
    const res = await run(createCeshuSkill({ ceshuManager: port }), {
      action: 'update',
      ceshu_id: 'd1',
      chapter: 'vision',
      data: { not_a_field: 'x' }
    })
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain('没有字段')
  })

  it('部分更新只覆盖传入字段，未传的已填内容保留（合并而非替换）', async () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.vision.design_vision = '原愿景'
    doc.vision.differentiation = '原差异'
    const port = makePort(doc)
    const res = await run(createCeshuSkill({ ceshuManager: port }), {
      action: 'update',
      ceshu_id: 'd1',
      chapter: 'vision',
      data: { design_vision: '新愿景' }
    })
    expect(res.success).toBe(true)
    const saved = (res.data as CeshuDocument).vision
    expect(saved.design_vision).toBe('新愿景')
    expect(saved.differentiation).toBe('原差异')
  })

  it('消息带上校验变化（写入后可见质量信号）', async () => {
    const port = makePort(createDefaultCeshu({ scope: 'full' }))
    const res = await run(createCeshuSkill({ ceshuManager: port }), {
      action: 'update',
      ceshu_id: 'd1',
      chapter: 'vision',
      data: { design_vision: '一句话愿景' }
    })
    expect(res.success).toBe(true)
    expect(res.message).toMatch(/校验问题/)
  })
})

describe('system.ceshu 技能 schema：取字段契约', () => {
  it('返回指定章契约（含 key 与 pipeList 列）', async () => {
    const port = makePort(createDefaultCeshu({ scope: 'full' }))
    const res = await run(createCeshuSkill({ ceshuManager: port }), {
      action: 'schema',
      ceshu_id: 'd1',
      chapter: 'gameplay'
    })
    expect(res.success).toBe(true)
    expect(res.message).toContain('【字段契约】')
    expect(res.message).toContain('core_loop')
    expect(res.message).toContain('层级|关注问题|玩家动作|系统变化|反馈|传递物')
  })

  it('缺 ceshu_id 报错', async () => {
    const port = makePort(createDefaultCeshu({ scope: 'full' }))
    const res = await run(createCeshuSkill({ ceshuManager: port }), { action: 'schema' })
    expect(res.success).toBe(false)
    expect(String(res.error)).toContain('ceshu_id')
  })
})
