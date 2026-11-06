import { describe, expect, it } from 'vitest'

import { buildCeshuBundle } from '../../src/main/ceshu/export/delivery/bundle'
import { renderCeshuOnePageMarkdown } from '../../src/main/ceshu/export/content/onepage'
import {
  CHAPTER_LABELS,
  type CeshuDocument,
  type ChapterKey
} from '@mobai/shared/ceshu/reference'
import {
  chapterDataForDoc,
  createDefaultCeshu,
  getDocKind,
  requiredFieldsForDoc,
  visibleChaptersForDoc,
  withChapter
} from '@mobai/shared/ceshu/model'
import { APP_CHAPTER_FIELDS, APP_CHAPTER_LABELS } from '@mobai/shared/appSchema'
import { chaptersUpToStage, isMachineDataField } from '@mobai/shared/ceshu/workflow'

/**
 * 路线 A 第 3 步收口守卫：`visibleChaptersForDoc` 的消费方在应用档下必须真的产出 SDD 内容。
 *
 * 类型通过 ≠ 行为正确：曾经的写法是「遍历游戏 24 章 ∩ visible」或直接 `CHAPTER_LABELS[应用章]`，
 * 应用档会得到空列表 / undefined 标签，而 tsc 一声不吭。这里锁定三条不变量：
 * 1. 机读包/一页摘要覆盖全部可见应用章，标签来自 APP_CHAPTER_LABELS；
 * 2. 字段定义与必填来自应用档规格，而不是游戏常量；
 * 3. 游戏档逐项零回归（章序、index、标签仍等于既有常量）。
 */
function appDoc(name = '测试应用'): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', docKind: 'application', name })
}

describe('应用档：可见章消费方产出 SDD 内容', () => {
  it('机读包覆盖全部可见应用章，标签与字段都来自应用规格', () => {
    const doc = appDoc()
    const visible = visibleChaptersForDoc(doc)
    expect(getDocKind(doc)).toBe('application')
    expect(visible.length).toBeGreaterThan(10)

    const bundle = buildCeshuBundle(doc)
    expect(bundle.chapters.map((chapter) => chapter.key)).toEqual([...visible])
    for (const chapter of bundle.chapters) {
      expect(chapter.label).toBe(APP_CHAPTER_LABELS[chapter.key])
      expect(chapter.label).not.toContain('undefined')
    }

    // 编号章的字段定义序 = APP_CHAPTER_FIELDS 的定义序（不是游戏 CESHU_CHAPTER_FIELDS）
    const numbered = bundle.chapters[1]
    const schemaKeys = (APP_CHAPTER_FIELDS[numbered.key] ?? []).map((field) => field.key)
    expect(schemaKeys.length).toBeGreaterThan(0)
    expect(numbered.fields.slice(0, schemaKeys.length).map((field) => field.key)).toEqual(schemaKeys)
  })

  it('机读包必填标记取应用档必填表（resolveFieldMeta 显式传入）', () => {
    const doc = appDoc()
    const key = visibleChaptersForDoc(doc).find((item) => requiredFieldsForDoc(doc, item).length > 0)
    expect(key).toBeDefined()
    const required = new Set(requiredFieldsForDoc(doc, key!))
    const chapter = buildCeshuBundle(doc).chapters.find((item) => item.key === key)!
    expect(chapter.fields.some((field) => field.required === true)).toBe(true)
    for (const field of chapter.fields) {
      if (field.required !== undefined) expect(field.required).toBe(required.has(field.key))
    }
  })

  it('一页摘要铺开全部应用章标题，不出现 undefined', () => {
    const doc = appDoc()
    const md = renderCeshuOnePageMarkdown(doc)
    expect(md).toContain('《测试应用》· 一页摘要')
    for (const key of visibleChaptersForDoc(doc)) expect(md).toContain(APP_CHAPTER_LABELS[key])
    expect(md).not.toContain('undefined')
  })

  it('一页摘要标题回落到 project_name（应用档不写 game_name 时）', () => {
    const doc = appDoc()
    const meta = doc.meta as Record<string, unknown>
    delete meta.game_name
    meta.project_name = '应用项目名'
    expect(renderCeshuOnePageMarkdown(doc)).toContain('《应用项目名》· 一页摘要')
  })

  it('应用章不属于游戏机读数据层', () => {
    const doc = appDoc()
    for (const key of visibleChaptersForDoc(doc)) {
      expect(isMachineDataField(key, 'ledger')).toBe(false)
    }
  })

  it('withChapter 能把应用章数据写进文档（应用档可编辑保存的前提）', () => {
    const doc = appDoc()
    const key = visibleChaptersForDoc(doc)[1]
    const next = withChapter(doc, key, { overview: '一段应用设计内容' })
    expect(chapterDataForDoc(next, key).overview).toBe('一段应用设计内容')
    // 纯函数：原文档不被改写
    expect(chapterDataForDoc(doc, key).overview).toBeUndefined()
    expect(getDocKind(next)).toBe('application')
  })
})

describe('游戏档：章表分派后逐项零回归', () => {
  it('机读章章序 / index / 标签仍等于既有常量', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    const bundle = buildCeshuBundle(doc)
    expect(bundle.chapters).toHaveLength(24)
    expect(bundle.chapters[0]).toMatchObject({ key: 'meta', label: '文档信息', index: 1 })
    expect(bundle.chapters.at(-1)).toMatchObject({ index: 24 })
    for (const chapter of bundle.chapters) {
      expect(chapter.label).toBe(CHAPTER_LABELS[chapter.key as ChapterKey])
    }
  })

  it('一页摘要仍是立项阶段裁剪后的游戏章', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
    const md = renderCeshuOnePageMarkdown(doc)
    expect(md).toContain('立项阶段')
    expect(md).toContain('《测试游戏》· 一页摘要')
    // 章标题集合恰好是「立项阶段 ∩ 可见章」的既有游戏标签（逐项零回归）
    const visible = visibleChaptersForDoc(doc)
    const stageLabels = chaptersUpToStage('concept')
      .filter((chapter) => visible.includes(chapter))
      .map((chapter) => CHAPTER_LABELS[chapter])
    const heads = md.split('\n').filter((line) => line.startsWith('## '))
    expect(heads).toHaveLength(stageLabels.length)
    for (const label of stageLabels) expect(md).toContain(`## ${label}`)
  })
})
