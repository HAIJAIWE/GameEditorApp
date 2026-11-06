import { describe, expect, it } from 'vitest'

import {
  APP_CHAPTER_FIELDS,
  APP_CHAPTER_SCHEMAS,
  appRequiredFields,
  createAppDefaultChapters
} from '@mobai/shared/appSchema'
import { APP_SPEC } from '@mobai/shared/documentSpec'
import { CHAPTER_KEYS } from '@mobai/shared/ceshu/reference'
import { createDefaultCeshu, normalizeCeshu } from '@mobai/shared/ceshu/model'

/**
 * 应用章表落 schema + 文档构造分派（路线 A 第 1、2 步）的守卫。
 *
 * 两条最重要的不变量：
 * 1. **游戏档零回归**：不传 docKind 时，createDefaultCeshu 的章表逐项等于 24 章，
 *    且没有任何应用章渗进去。
 * 2. **必填单一事实源**：规格的 requiredFields 必须等于 appSchema 里
 *    `required: true` 的字段，不能两边各写一份。
 */
describe('应用章表字段 schema', () => {
  it('规格里每一章都有字段定义，且必填字段与 schema 完全一致', () => {
    for (const chapter of APP_SPEC.chapters) {
      const fields = APP_CHAPTER_FIELDS[chapter.key]
      expect(fields, `${chapter.key} 缺字段定义`).toBeTruthy()
      expect(fields!.length).toBeGreaterThan(0)
      expect([...chapter.requiredFields]).toEqual([...appRequiredFields(chapter.key)])
      expect(chapter.requiredFields.length).toBeGreaterThan(0)
      // 必填字段必须真实存在于字段表（防止规格写了 schema 里没有的 key）
      const keys = new Set(fields!.map((f) => f.key))
      for (const key of chapter.requiredFields) expect(keys.has(key), `${chapter.key}.${key}`).toBe(true)
    }
  })

  it('字段 key 在章内唯一，且 combo/multiCombo 都带 optionLabels', () => {
    for (const [chapter, fields] of Object.entries(APP_CHAPTER_FIELDS)) {
      const keys = fields.map((f) => f.key)
      expect(new Set(keys).size, `${chapter} 字段 key 重复`).toBe(keys.length)
      for (const field of fields) {
        if (field.kind === 'combo' || field.kind === 'multiCombo') {
          expect(field.optionLabels, `${chapter}.${field.key} 缺 optionLabels`).toBeTruthy()
          for (const value of field.values ?? []) {
            expect(field.optionLabels?.[value], `${chapter}.${field.key}.${value}`).toBeTruthy()
          }
        }
      }
    }
  })

  it('字段 key 与游戏章 key 零重叠（否则同一份数据会被两套规格解释）', () => {
    const game = new Set<string>(CHAPTER_KEYS)
    for (const key of Object.keys(APP_CHAPTER_SCHEMAS)) {
      if (key === 'meta') continue
      expect(game.has(key), `${key} 撞了游戏章 key`).toBe(false)
    }
  })

  it('默认章节：章表齐全，列表类字段为空数组而非 undefined', () => {
    const defaults = createAppDefaultChapters()
    expect(Object.keys(defaults)).toEqual([...APP_SPEC.chapterKeys])
    // 列表类默认值必须是 []：否则 UI 拿到 undefined 会把「没有数据」显示成「读失败」
    expect(defaults.meta.platform).toEqual([])
    expect(defaults.nonfunctional.compatibility).toEqual([])
    expect(defaults.architecture.modules).toEqual([])
    expect(defaults.risks.risk_register).toEqual([])
    expect(defaults.overview).toBeDefined()
  })

  it('baseMeta 合并而非覆盖（不丢 gdd_scope / game_name / doc_kind）', () => {
    const base = { gdd_scope: 'lite', game_name: '测试应用', doc_kind: 'application' }
    const merged = createAppDefaultChapters(base)
    expect(merged.meta.gdd_scope).toBe('lite')
    expect(merged.meta.game_name).toBe('测试应用')
    expect(merged.meta.doc_kind).toBe('application')
    expect(merged.meta.platform).toEqual([])
  })
})

describe('文档构造分派（游戏零回归 / 应用章表齐全）', () => {
  it('不传 docKind：章表恰为 24 章，没有任何应用章渗入', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '游戏' })
    const record = doc as unknown as Record<string, unknown>
    for (const key of CHAPTER_KEYS) expect(record[key], `缺游戏章 ${key}`).toBeDefined()
    for (const key of APP_SPEC.numberedKeys) expect(record[key], `误带应用章 ${key}`).toBeUndefined()
    // META_DEFAULTS 里 doc_kind 默认就是 'game'（上一轮落的），不是 undefined
    expect(doc.meta.doc_kind).toBe('game')
    expect(doc.meta.game_name).toBe('游戏')
  })

  it('显式 game：与不传逐项一致', () => {
    const plain = createDefaultCeshu({ scope: 'lite', name: 'X' })
    const explicit = createDefaultCeshu({ scope: 'lite', name: 'X', docKind: 'game' })
    expect(Object.keys(explicit).sort()).toEqual(Object.keys(plain).sort())
    expect(explicit.meta).toEqual(plain.meta)
  })

  it('显式 application：24 章底座 + 16 应用章，档位写进 meta', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '效率工具', docKind: 'application' })
    const record = doc as unknown as Record<string, unknown>
    for (const key of CHAPTER_KEYS) expect(record[key], `缺游戏兼容底座 ${key}`).toBeDefined()
    for (const key of APP_SPEC.numberedKeys) expect(record[key], `缺应用章 ${key}`).toBeDefined()
    expect(doc.meta.doc_kind).toBe('application')
    expect(doc.meta.project_name).toBe('效率工具')
    expect(doc.meta.gdd_scope).toBe('full')
    // meta 合并：游戏侧字段没被应用 meta 冲掉
    expect(doc.meta.game_name).toBe('效率工具')
  })
})

describe('读盘归一化：应用章往返不丢', () => {
  it('保存后重新读入，16 应用章都还在（未知键保留 + 缺失补齐）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '往返', docKind: 'application' })
    ;(doc as unknown as Record<string, unknown>).architecture = { modules: [{ module: 'A' }] }
    const restored = normalizeCeshu(JSON.parse(JSON.stringify(doc)))
    const record = restored as unknown as Record<string, unknown>
    for (const key of APP_SPEC.numberedKeys) expect(record[key], `读盘丢了 ${key}`).toBeDefined()
    expect(record.architecture).toEqual({ modules: [{ module: 'A' }] })
    expect(restored.meta.doc_kind).toBe('application')
  })

  it('磁盘里缺某一应用章时补空默认值，不静默留 undefined', () => {
    const raw = { ceshu_id: 'abcd1234', meta: { doc_kind: 'application', game_name: '缺章' } }
    const restored = normalizeCeshu(raw)
    const record = restored as unknown as Record<string, unknown>
    for (const key of APP_SPEC.numberedKeys) expect(record[key], `未补齐 ${key}`).toBeDefined()
  })

  it('游戏档读盘完全不触发应用章补齐（零回归）', () => {
    const restored = normalizeCeshu({ ceshu_id: 'abcd1234', meta: { game_name: '游戏' } })
    const record = restored as unknown as Record<string, unknown>
    for (const key of APP_SPEC.numberedKeys) expect(record[key], `游戏档误带 ${key}`).toBeUndefined()
  })
})
