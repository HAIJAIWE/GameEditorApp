import { describe, expect, it } from 'vitest'

import { createDefaultCeshu, getDocKind, needsGameDataEditor } from '@mobai/shared/ceshu/model'

/**
 * 文档类型（meta.doc_kind）：游戏档 / 应用档。
 *
 * 应用档不启用游戏数据编辑（角色/怪物/技能），改由 `MainViewMount` 隐藏 `data.mainView`。
 * 这里锁定「只有显式 application 才降级」的保守语义，避免脏值把游戏文档误判成应用。
 */
describe('文档类型（docKind）', () => {
  it('默认游戏档：需要游戏数据编辑', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    expect(getDocKind(doc)).toBe('game')
    expect(needsGameDataEditor(doc)).toBe(true)
  })

  it('显式 application 才降级为应用档；不需要游戏数据编辑', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    const app = { ...doc, meta: { ...doc.meta, doc_kind: 'application' } }
    expect(getDocKind(app)).toBe('application')
    expect(needsGameDataEditor(app)).toBe(false)
  })

  it('脏值 / 缺失一律按游戏档，避免误伤老文档', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    expect(getDocKind({ ...doc, meta: { ...doc.meta, doc_kind: 'weird' } })).toBe('game')
    expect(getDocKind({ ...doc, meta: { ...doc.meta, doc_kind: undefined } })).toBe('game')
    expect(getDocKind({ ...doc, meta: { ...doc.meta, doc_kind: 123 } })).toBe('game')
  })
})
