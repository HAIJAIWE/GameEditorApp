import { describe, expect, it } from 'vitest'

import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import {
  APP_SPEC,
  GAME_SPEC,
  applyTemplateOverlay,
  specForDoc,
  templateOverlayKind
} from '@mobai/shared/documentSpec'

describe('模板覆盖层：标签 / 顺序 / 模块默认开关', () => {
  it('空覆盖层 = 原规格（恒等）', () => {
    const out = applyTemplateOverlay(GAME_SPEC, {})
    expect(out.chapterKeys).toEqual(GAME_SPEC.chapterKeys)
    expect(out.numberedKeys).toEqual(GAME_SPEC.numberedKeys)
    expect(out.chapterLabels).toEqual(GAME_SPEC.chapterLabels)
    expect(out.parts).toEqual(GAME_SPEC.parts)
    expect(out.modules).toEqual(GAME_SPEC.modules)
  })

  it('章名覆盖：只改显示名，章号沿用原位置', () => {
    const out = applyTemplateOverlay(GAME_SPEC, { chapters: [{ key: 'vision', name: '产品愿景与定位' }] })
    expect(out.chapterLabels.vision).toBe('1. 产品愿景与定位')
    expect(out.chapters.find((chapter) => chapter.key === 'vision')?.name).toBe('产品愿景与定位')
    // 其它章不受影响
    expect(out.chapterLabels.gameplay).toBe(GAME_SPEC.chapterLabels.gameplay)
  })

  it('分区内重排：章号跟随新位置、标签重新派生', () => {
    const corePart = GAME_SPEC.parts.find((part) => part.key === 'core')
    expect(corePart).toBeDefined()
    const reversed = [...(corePart?.chapters ?? [])].reverse()
    const out = applyTemplateOverlay(GAME_SPEC, { order: { chapters: { core: reversed } } })

    // 核心区首章 = 原末章（audio），章号变成 1
    const firstName = GAME_SPEC.chapters.find((chapter) => chapter.key === reversed[0])?.name
    expect(out.numberedKeys[0]).toBe(reversed[0])
    expect(out.chapterLabels[reversed[0]]).toBe(`1. ${firstName}`)
    // 核心区整体仍是前 9 章（lite 范围不变）
    expect(out.numberedKeys.slice(0, reversed.length)).toEqual(reversed)
    // 集合不变（不丢章、不添章）
    expect([...out.numberedKeys].sort()).toEqual([...GAME_SPEC.numberedKeys].sort())
  })

  it('分区重排：章号跟随分区顺序', () => {
    const partKeys = GAME_SPEC.parts.map((part) => part.key)
    const rotated = [...partKeys.slice(1), partKeys[0]]
    const out = applyTemplateOverlay(GAME_SPEC, { order: { parts: rotated } })

    expect(out.parts.map((part) => part.key)).toEqual(rotated)
    const firstPart = GAME_SPEC.parts.find((part) => part.key === rotated[0])
    expect(out.numberedKeys.slice(0, firstPart?.chapters.length ?? 0)).toEqual([...(firstPart?.chapters ?? [])])
  })

  it('分区标签与文档类型标签覆盖', () => {
    const out = applyTemplateOverlay(GAME_SPEC, {
      label: '游戏立项书',
      shortLabel: '立项',
      parts: [{ key: 'core', label: '核心体验' }]
    })
    expect(out.label).toBe('游戏立项书')
    expect(out.shortLabel).toBe('立项')
    expect(out.parts.find((part) => part.key === 'core')?.label).toBe('核心体验')
  })

  it('模块默认开关覆盖：应用 AI 模型层默认关 → 开', () => {
    const before = APP_SPEC.modules.find((module) => module.key === 'ai_layer')
    expect(before?.defaultOn).toBe(false)
    const out = applyTemplateOverlay(APP_SPEC, { modules: [{ key: 'ai_layer', defaultOn: true }] })
    expect(out.modules.find((module) => module.key === 'ai_layer')?.defaultOn).toBe(true)
    // 章集合不受影响
    expect(out.chapterKeys).toEqual(APP_SPEC.chapterKeys)
  })

  it('非法输入一律整份拒绝（不半应用）', () => {
    // kind 与目标规格不一致
    expect(() => applyTemplateOverlay(GAME_SPEC, { kind: 'application' })).toThrow(/不一致/)
    // 未知键（strictObject）
    expect(() => applyTemplateOverlay(GAME_SPEC, { unknown: 1 })).toThrow(/格式不正确/)
    // 顺序不是排列（长度不符）
    expect(() => applyTemplateOverlay(GAME_SPEC, { order: { parts: ['core'] } })).toThrow(/分区顺序/)
    // 顺序有重复项
    expect(() =>
      applyTemplateOverlay(GAME_SPEC, { order: { chapters: { core: ['vision', 'vision'] } } })
    ).toThrow(/分区「core」的章顺序/)
    // 章顺序引用了不存在的分区
    expect(() => applyTemplateOverlay(GAME_SPEC, { order: { chapters: { nope: [] } } })).toThrow(/不存在的分区/)
    // 章名覆盖引用了不存在的章
    expect(() => applyTemplateOverlay(GAME_SPEC, { chapters: [{ key: 'nope', name: 'X' }] })).toThrow(/不存在的章/)
    // 模块覆盖引用了不存在的模块
    expect(() => applyTemplateOverlay(GAME_SPEC, { modules: [{ key: 'nope', defaultOn: true }] })).toThrow(
      /不存在的模块/
    )
    // 空标签不合法
    expect(() => applyTemplateOverlay(GAME_SPEC, { chapters: [{ key: 'vision', name: '' }] })).toThrow(/格式不正确/)
  })

  it('纯函数：不修改入参', () => {
    const before = JSON.stringify(GAME_SPEC.chapterLabels)
    applyTemplateOverlay(GAME_SPEC, { chapters: [{ key: 'vision', name: '改过' }] })
    expect(JSON.stringify(GAME_SPEC.chapterLabels)).toBe(before)
  })
})

describe('specForDoc：文档携带覆盖层时才生效', () => {
  it('无覆盖层：返回基础规格（同一引用）', () => {
    const app = createDefaultCeshu({ scope: 'full', docKind: 'application' })
    expect(specForDoc(app)).toBe(APP_SPEC)
    const game = createDefaultCeshu({ scope: 'full' })
    expect(specForDoc(game)).toBe(GAME_SPEC)
  })

  it('有合法覆盖层：标签生效', () => {
    const doc = createDefaultCeshu({ scope: 'full', docKind: 'application' })
    doc.meta.template_overlay = { chapters: [{ key: 'overview', name: '项目背景与目标' }] }
    const spec = specForDoc(doc)
    expect(spec).not.toBe(APP_SPEC)
    expect(spec.chapterLabels.overview).toBe('项目背景与目标')
  })

  it('覆盖层损坏：fail-soft 退回基础规格（导出不因坏 JSON 失败）', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    doc.meta.template_overlay = { unknown: true }
    expect(specForDoc(doc)).toBe(GAME_SPEC)
  })

  it('templateOverlayKind：合法才返回档位，非法/非对象返回 undefined', () => {
    expect(templateOverlayKind({ kind: 'game' })).toBe('game')
    expect(templateOverlayKind({ kind: 'nope' })).toBeUndefined()
    expect(templateOverlayKind('not-object')).toBeUndefined()
    expect(templateOverlayKind({})).toBeUndefined()
  })
})

/** 档位分派：游戏档重排后编号跟随新位置，应用档重排后仍是主题式（2026-11-08） */
describe('模板覆盖层：标签按档位分派', () => {
  it('游戏档重排：章号跟随新位置（核心区首章变 1）', () => {
    const corePart = GAME_SPEC.parts.find((part) => part.key === 'core')
    const reversed = [...(corePart?.chapters ?? [])].reverse()
    const out = applyTemplateOverlay(GAME_SPEC, { order: { chapters: { core: reversed } } })
    const firstName = GAME_SPEC.chapters.find((chapter) => chapter.key === reversed[0])?.name
    expect(out.chapterLabels[reversed[0]]).toBe(`1. ${firstName}`)
  })

  it('应用档重排：标签不含编号（软件文档主题式口径）', () => {
    const out = applyTemplateOverlay(APP_SPEC, { chapters: [{ key: 'overview', name: '项目背景与目标' }] })
    expect(out.chapterLabels.overview).toBe('项目背景与目标')
    for (const label of Object.values(out.chapterLabels)) {
      expect(/^\d+\.\s/.test(label), `${label} 不应带编号`).toBe(false)
    }
  })
})

/** 编辑视图跟随覆盖层标签：specForDoc 是唯一取数口（2026-11-08 P2） */
describe('specForDoc：编辑视图与导出共用同一份标签', () => {
  it('有合法覆盖层 → chapterLabels 含自定义章名（CeshuView 注入导航后编辑视图同步）', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.meta.template_overlay = { chapters: [{ key: 'vision', name: '愿景与定位' }] }
    const spec = specForDoc(doc)
    expect(spec.chapterLabels.vision).toBe('1. 愿景与定位')
  })

  it('覆盖层损坏 → fail-soft 回退基础规格，编辑视图不会崩', () => {
    const doc = createDefaultCeshu({ scope: 'full', name: '测试' })
    doc.meta.template_overlay = { unknown: true }
    expect(specForDoc(doc)).toBe(GAME_SPEC)
  })
})
