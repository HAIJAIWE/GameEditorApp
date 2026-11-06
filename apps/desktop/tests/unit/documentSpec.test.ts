import { describe, expect, it } from 'vitest'

import {
  CHAPTER_KEYS,
  CHAPTER_LABELS,
  CHAPTER_NAMES,
  CHAPTER_PARTS,
  CHAPTER_REQUIRED_FIELDS,
  NUMBERED_CHAPTER_KEYS
} from '@mobai/shared/ceshu/reference'
import { AGENT_DISPLAY, CHAPTER_AGENT_MAP, CHAPTER_GENERATION_HINTS } from '@mobai/shared/ceshu/prompts'
import { CESHU_ROLE_LABELS, CESHU_ROLE_ORDER } from '@mobai/shared/ceshu/workflow'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import {
  APP_SPEC,
  DOCUMENT_SPECS,
  GAME_SPEC,
  hiddenMainViewIdsForKind,
  specChapterNumber,
  specForDoc,
  specForKind
} from '@mobai/shared/documentSpec'
import { hiddenMainViewIdsForDocKind } from '../../src/renderer/src/plugins/context'

/**
 * 路线 A「统一内核 + 双规格」的结构守卫。
 *
 * 最关键的一条：游戏规格**必须**等于既有常量（适配视图而非复制品）——
 * 否则「规格」会变成第二份真相源，将来改了 CHAPTER_PARTS 却忘了改规格，
 * 游戏侧行为就悄悄漂移。应用规格则必须完全独立：章 key 不与游戏章重叠、
 * 章号连续、AI 角色与岗位不含游戏语义。
 */
describe('游戏规格：既有常量的适配视图（零复制、零漂移）', () => {
  it('章表 / 章名 / 标签 / 必填字段逐项等于 reference 常量', () => {
    expect(GAME_SPEC.chapterKeys).toEqual([...CHAPTER_KEYS])
    expect(GAME_SPEC.numberedKeys).toEqual([...NUMBERED_CHAPTER_KEYS])
    expect(GAME_SPEC.metaKey).toBe('meta')
    for (const chapter of GAME_SPEC.chapters) {
      const key = chapter.key as keyof typeof CHAPTER_NAMES
      expect(chapter.name).toBe(CHAPTER_NAMES[key])
      expect(chapter.label).toBe(CHAPTER_LABELS[key])
      expect(chapter.aiHint).toBe(CHAPTER_GENERATION_HINTS[key] ?? '')
      expect(chapter.agentId).toBe(CHAPTER_AGENT_MAP[key])
      expect([...chapter.requiredFields]).toEqual(CHAPTER_REQUIRED_FIELDS[key] ?? [])
    }
  })

  it('分区与 AI 角色表也来自既有常量', () => {
    expect(GAME_SPEC.parts.map((p) => [p.key, p.label, [...p.chapters]])).toEqual(
      CHAPTER_PARTS.map((p) => [p.key, p.label, [...p.chapters]])
    )
    expect(GAME_SPEC.agentDisplay).toBe(AGENT_DISPLAY)
    expect(GAME_SPEC.roles).toEqual(CESHU_ROLE_ORDER.map((key) => ({ key, label: CESHU_ROLE_LABELS[key] })))
  })

  it('游戏档不隐藏任何页签', () => {
    expect(GAME_SPEC.hiddenMainViewIds).toEqual([])
    expect(hiddenMainViewIdsForKind('game')).toEqual([])
    expect(hiddenMainViewIdsForKind(undefined)).toEqual([])
  })
})

describe('应用规格：独立章表、连续章号、无游戏语义', () => {
  it('章 key 除 meta 外与游戏章表零重叠', () => {
    const gameKeys = new Set<string>(CHAPTER_KEYS)
    const overlap = APP_SPEC.chapterKeys.filter((key) => key !== APP_SPEC.metaKey && gameKeys.has(key))
    expect(overlap).toEqual([])
  })

  it('章号由自己的 parts 派生，1..N 连续不跳号', () => {
    const numbers = APP_SPEC.numberedKeys.map((key) => specChapterNumber(APP_SPEC, key))
    expect(numbers).toEqual(Array.from({ length: numbers.length }, (_, i) => i + 1))
    expect(specChapterNumber(APP_SPEC, APP_SPEC.metaKey)).toBe(0)
    // 标签里的章号与派生结果一致（不能出现「第十六章」前面没有第十五章）
    expect(APP_SPEC.chapters.filter((c) => c.key !== APP_SPEC.metaKey)).toHaveLength(numbers.length)
  })

  it('分区覆盖全部编号章且不重复', () => {
    const fromParts = APP_SPEC.parts.flatMap((p) => [...p.chapters])
    expect(fromParts).toEqual([...APP_SPEC.numberedKeys])
    expect(new Set(fromParts).size).toBe(fromParts.length)
  })

  it('每章都有 AI 角色与生成要求，角色都能查到展示名', () => {
    for (const chapter of APP_SPEC.chapters) {
      expect(chapter.aiHint.length).toBeGreaterThan(0)
      expect(APP_SPEC.agentDisplay[chapter.agentId]).toBeTruthy()
      expect(APP_SPEC.agentPrompts[chapter.agentId]).toBeTruthy()
      expect(chapter.requiredFields.length).toBeGreaterThan(0)
      expect(APP_SPEC.chapterLabels[chapter.key]).toBe(chapter.label)
    }
  })

  it('AI 角色 / 岗位不含游戏语义（策划 / 数值 / 美术 / 关卡）', () => {
    const text = [
      ...Object.values(APP_SPEC.agentDisplay),
      ...APP_SPEC.roles.map((r) => r.label),
      ...APP_SPEC.chapters.map((c) => c.name)
    ].join(' ')
    for (const word of ['策划', '数值', '美术', '关卡', '战斗', '掉落', '伤害']) {
      expect(text).not.toContain(word)
    }
  })

  it('应用档隐藏游戏数据编辑页签', () => {
    expect(hiddenMainViewIdsForKind('application')).toEqual(['data.mainView'])
  })
})

describe('规格注册表与分派', () => {
  it('两个规格已注册，kind 唯一', () => {
    expect(DOCUMENT_SPECS).toHaveLength(2)
    expect(new Set(DOCUMENT_SPECS.map((s) => s.kind)).size).toBe(2)
    expect(specForKind('game')).toBe(GAME_SPEC)
    expect(specForKind('application')).toBe(APP_SPEC)
    expect(specForKind(undefined)).toBe(GAME_SPEC)
  })

  it('specForDoc：默认 / 显式游戏 → GAME_SPEC，显式应用 → APP_SPEC', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    expect(specForDoc(doc)).toBe(GAME_SPEC)
    ;(doc.meta as Record<string, unknown>).doc_kind = 'game'
    expect(specForDoc(doc)).toBe(GAME_SPEC)
    ;(doc.meta as Record<string, unknown>).doc_kind = 'application'
    expect(specForDoc(doc)).toBe(APP_SPEC)
    // 脏值（含旧 ai 值）回落游戏档（与 getDocKind 的保守语义一致）
    ;(doc.meta as Record<string, unknown>).doc_kind = 'unknown'
    expect(specForDoc(doc)).toBe(GAME_SPEC)
  })
})

describe('规格层与渲染层隐藏规则不漂移', () => {
  it('hiddenMainViewIdsForKind 与 mainViewVisibility 的纯函数结果一致', () => {
    for (const kind of ['game', 'application', undefined] as const) {
      expect([...hiddenMainViewIdsForKind(kind)]).toEqual([...hiddenMainViewIdsForDocKind(kind)])
    }
  })
})
