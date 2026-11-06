import { describe, expect, it } from 'vitest'

import {
  CHAPTER_KEYS,
  CHAPTER_LABELS,
  CHAPTER_REQUIRED_FIELDS,
  chapterAnchorOf,
  chapterNumber
} from '@mobai/shared/ceshu/reference'
import { CESHU_CHAPTER_FIELDS } from '@mobai/shared/ceshu/fields'
import { visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import {
  chapterAnchorForDoc,
  chapterDataForDoc,
  chapterFieldsForDoc,
  chapterLabelForDoc,
  chapterNumberForDoc,
  visibleChaptersForDoc as chaptersForDoc,
  requiredFieldsForDoc
} from '@mobai/shared/ceshu/model'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import {
  APP_AI_LAYER_KEYS,
  APP_CHAPTER_FIELDS,
  APP_CHAPTER_KEYS,
  APP_CHAPTER_LABELS,
  appChapterAnchorOf,
  appChapterNumber,
  appRequiredFields
} from '@mobai/shared/appSchema'

/**
 * 规格化查表层（路线 A 第 3 步）的守卫。
 * 核心不变量：**游戏档的每个查表结果都等于既有常量**（零回归），
 * 应用档则完全走 SDD 章表/标签/字段。
 */
describe('游戏档：查表结果逐项等于既有常量（零回归）', () => {
  const doc = createDefaultCeshu({ scope: 'full', name: '游戏' })

  it('chaptersForDoc 等于 visibleChaptersForDoc', () => {
    expect([...chaptersForDoc(doc)]).toEqual([...visibleChaptersForDoc(doc)])
  })

  it('章标签 / 必填 / 字段 / 章号 / 锚点逐项一致', () => {
    for (const key of CHAPTER_KEYS) {
      expect(chapterLabelForDoc(doc, key), `label ${key}`).toBe(CHAPTER_LABELS[key])
      expect([...requiredFieldsForDoc(doc, key)], `required ${key}`).toEqual(CHAPTER_REQUIRED_FIELDS[key] ?? [])
      expect(chapterFieldsForDoc(doc, key), `fields ${key}`).toBe(CESHU_CHAPTER_FIELDS[key] ?? [])
      expect(chapterNumberForDoc(doc, key), `number ${key}`).toBe(chapterNumber(key))
      expect(chapterAnchorForDoc(doc, key), `anchor ${key}`).toBe(chapterAnchorOf(key))
    }
  })

  it('未知章 key 安全回落（不抛错、不返回游戏章内容）', () => {
    expect(chapterLabelForDoc(doc, 'no_such_chapter')).toBe('no_such_chapter')
    expect(requiredFieldsForDoc(doc, 'no_such_chapter')).toEqual([])
    expect(chapterFieldsForDoc(doc, 'no_such_chapter')).toEqual([])
    expect(chapterNumberForDoc(doc, 'no_such_chapter')).toBe(0)
    expect(chapterDataForDoc(doc, 'no_such_chapter')).toEqual({})
  })
})

describe('应用档：查表完全走 SDD', () => {
  const doc = createDefaultCeshu({ scope: 'full', name: '效率工具', docKind: 'application' })

  it('章表恰为 SDD 17 章（AI 模型层默认隐藏），且不含游戏章', () => {
    // AI 模型层四章仅在 enabled_modules 含 ai_layer 时进入可见章，默认不含
    expect([...chaptersForDoc(doc)]).toEqual([...APP_CHAPTER_KEYS].filter((key) => !APP_AI_LAYER_KEYS.includes(key)))
    for (const key of CHAPTER_KEYS) {
      if (key === 'meta') continue
      expect(chaptersForDoc(doc).includes(key), `误带游戏章 ${key}`).toBe(false)
    }
  })

  it('章标签 / 必填 / 字段 / 章号 / 锚点逐项等于 appSchema', () => {
    for (const key of APP_CHAPTER_KEYS) {
      expect(chapterLabelForDoc(doc, key), `label ${key}`).toBe(APP_CHAPTER_LABELS[key])
      expect([...requiredFieldsForDoc(doc, key)], `required ${key}`).toEqual([...appRequiredFields(key)])
      expect(chapterFieldsForDoc(doc, key), `fields ${key}`).toBe(APP_CHAPTER_FIELDS[key] ?? [])
      expect(chapterNumberForDoc(doc, key), `number ${key}`).toBe(appChapterNumber(key))
      expect(chapterAnchorForDoc(doc, key), `anchor ${key}`).toBe(appChapterAnchorOf(key))
    }
  })

  it('章号 1..16 连续，标签不出现游戏章名', () => {
    const numbered = APP_CHAPTER_KEYS.filter((key) => key !== 'meta')
    expect(numbered.map((key) => chapterNumberForDoc(doc, key))).toEqual(
      Array.from({ length: numbered.length }, (_, i) => i + 1)
    )
    const labels = APP_CHAPTER_KEYS.map((key) => chapterLabelForDoc(doc, key)).join(' ')
    for (const word of ['战斗', '经济', '数值', '关卡', '角色']) expect(labels).not.toContain(word)
  })

  it('章节数据能读到应用章内容', () => {
    const record = doc as unknown as Record<string, unknown>
    record.architecture = { modules: [{ module: 'A' }] }
    expect(chapterDataForDoc(doc, 'architecture')).toEqual({ modules: [{ module: 'A' }] })
  })

  it('应用章标签与游戏同名 key 的标签互不相同', () => {
    const game = createDefaultCeshu({ scope: 'full' })
    expect(chapterLabelForDoc(doc, 'meta')).toBe('文档信息')
    expect(chapterLabelForDoc(game, 'meta')).toBe('文档信息')
    // 应用第 1 章是「项目概述」，游戏第 1 章是「产品愿景」
    expect(chapterLabelForDoc(doc, 'overview')).toContain('项目概述')
    expect(chapterLabelForDoc(game, 'vision')).toContain('产品愿景')
  })
})
