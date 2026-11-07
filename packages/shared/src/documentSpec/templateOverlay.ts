/**
 * JSON 模板覆盖层：不改代码、不动章 key，仅用一份 JSON 覆盖规格的
 * 「**标签 / 顺序 / 模块默认开关**」三类信息。
 *
 * 为什么只允许这三类（边界即安全线）：
 * - **章 key 是数据落盘锚点**（文档数据按 `doc[key]` 存），改 key 必须配套迁移，
 *   不能让模板 JSON 碰——否则一次导入就能让老文档整体错位；
 * - **字段表 / AI 角色 / 岗位是行为契约**，覆盖它们会让导出、提示词、交接包互相错位；
 * - **标签与顺序是纯展示/编号信息**，改它们不动任何已存数据（数据仍按 key 存）；
 * - **模块默认开关只影响新文档默认勾选**，不回溯改老文档。
 *
 * 安全策略：zod 严格模式（未知键直接拒绝）+ 结构校验（顺序必须是原集合的排列、
 * 引用的章/分区/模块必须存在、kind 必须与目标规格一致）。任何一条不满足都抛错，
 * **绝不半应用**——半应用的模板比没有模板更难排查。
 */
import { z } from 'zod'
import type { DocumentSpec, DocumentSpecKind, SpecChapter, SpecModule, SpecPart } from './types'

/** 章名覆盖项（只改显示名，章号仍按位置派生） */
const chapterNameOverrideSchema = z.strictObject({
  key: z.string().min(1),
  name: z.string().min(1)
})

/** 分区标签覆盖项 */
const partLabelOverrideSchema = z.strictObject({
  key: z.string().min(1),
  label: z.string().min(1)
})

/** 模块默认开关覆盖项 */
const moduleOverrideSchema = z.strictObject({
  key: z.string().min(1),
  defaultOn: z.boolean()
})

/**
 * 覆盖层 JSON 契约（全部字段可选；`strictObject` ⇒ 多写一个键就报错）。
 *
 * 顺序用「分区顺序 + 分区内章顺序」表达，而不是一条全局章序：
 * 章号由分区位置派生，全局章序会与分区归属打架；分区内重排才是无歧义的。
 */
export const templateOverlaySchema = z.strictObject({
  /** 目标档位；给了就必须与基础规格一致（防止把应用模板套到游戏文档上） */
  kind: z.enum(['game', 'application']).optional(),
  /** 文档类型显示名（如「游戏策划书」） */
  label: z.string().min(1).optional(),
  /** 文档类型短名（按钮/徽标） */
  shortLabel: z.string().min(1).optional(),
  /** 分区标签覆盖 */
  parts: z.array(partLabelOverrideSchema).optional(),
  /** 章名覆盖 */
  chapters: z.array(chapterNameOverrideSchema).optional(),
  order: z
    .strictObject({
      /** 分区顺序（必须是原分区 key 的排列） */
      parts: z.array(z.string().min(1)).optional(),
      /** 分区 key → 该分区内章顺序（必须是该分区原章 key 的排列） */
      chapters: z.record(z.string().min(1), z.array(z.string().min(1))).optional()
    })
    .optional(),
  /** 模块默认开关覆盖 */
  modules: z.array(moduleOverrideSchema).optional()
})

export type TemplateOverlay = z.infer<typeof templateOverlaySchema>

/** 断言 `actual` 恰为 `expected` 的排列（同长度、无未知项、无重复项） */
function assertPermutation(actual: readonly string[], expected: readonly string[], what: string): void {
  if (actual.length !== expected.length) {
    throw new Error(`${what}必须是原顺序的重新排列：长度 ${actual.length} ≠ 期望 ${expected.length}`)
  }
  const expectedSet = new Set(expected)
  const seen = new Set<string>()
  for (const key of actual) {
    if (!expectedSet.has(key)) throw new Error(`${what}包含未知项：${key}`)
    if (seen.has(key)) throw new Error(`${what}存在重复项：${key}`)
    seen.add(key)
  }
}

/** zod 错误压成一行中文提示（路径 + 原因），便于直接展示给用户 */
function formatIssues(error: z.ZodError): string {
  return error.issues
    .map((issue) => `${issue.path.length > 0 ? issue.path.join('.') : '(根)'}: ${issue.message}`)
    .join('；')
}

/**
 * 把覆盖层应用到基础规格，返回**新的**规格对象（不改入参）。
 *
 * 重排后章序、按档位分派的标签、`chapterLabels` 全部重新派生——这是唯一正确做法：
 * 章号是位置的函数，位置变了标签必须跟着变，否则会出现「顺序换了、章号还停在旧位」。
 * 游戏档标签编号式、应用档主题式（依据 `docs/game-doc-corpus-2026.md`）。
 *
 * 任何不合法输入都抛错（不返回部分结果）。调用方若在「不能失败」的路径上
 * （如导出），应自行兜底；需要把错误暴露给用户的路径直接让异常冒泡即可。
 */
export function applyTemplateOverlay(base: DocumentSpec, overlay: unknown): DocumentSpec {
  const parsed = templateOverlaySchema.safeParse(overlay)
  if (!parsed.success) {
    throw new Error(`模板覆盖层格式不正确：${formatIssues(parsed.error)}`)
  }
  const data = parsed.data
  if (data.kind !== undefined && data.kind !== base.kind) {
    throw new Error(`模板覆盖层的 kind（${data.kind}）与目标规格（${base.kind}）不一致`)
  }

  // 1) 分区顺序：缺省沿用原顺序，给了就必须是原分区 key 的排列
  const basePartKeys = base.parts.map((part) => part.key)
  const partOrder = data.order?.parts ?? basePartKeys
  assertPermutation(partOrder, basePartKeys, '分区顺序')

  // 1.1) 章顺序里出现的分区 key 必须存在（否则静默忽略会让人以为改了其实没改）
  for (const key of Object.keys(data.order?.chapters ?? {})) {
    if (!basePartKeys.includes(key)) throw new Error(`章顺序引用了不存在的分区：${key}`)
  }

  // 2) 分区内章顺序：缺省沿用原顺序，给了就必须是该分区原章 key 的排列
  const chaptersByPart = new Map<string, string[]>()
  for (const part of base.parts) {
    const requested = data.order?.chapters?.[part.key] ?? [...part.chapters]
    assertPermutation(requested, [...part.chapters], `分区「${part.key}」的章顺序`)
    chaptersByPart.set(part.key, [...requested])
  }

  // 3) 章名覆盖：引用的章必须存在
  const nameByKey = new Map<string, string>()
  for (const item of data.chapters ?? []) {
    if (!base.chapterKeys.includes(item.key)) {
      throw new Error(`章名覆盖引用了不存在的章：${item.key}`)
    }
    nameByKey.set(item.key, item.name)
  }

  // 4) 分区标签覆盖：引用的分区必须存在
  const partLabelByKey = new Map<string, string>()
  for (const item of data.parts ?? []) {
    if (!basePartKeys.includes(item.key)) {
      throw new Error(`分区标签覆盖引用了不存在的分区：${item.key}`)
    }
    partLabelByKey.set(item.key, item.label)
  }

  // 5) 模块默认开关覆盖：引用的模块必须存在
  const moduleDefaultOn = new Map<string, boolean>()
  for (const item of data.modules ?? []) {
    if (!base.modules.some((module) => module.key === item.key)) {
      throw new Error(`模块覆盖引用了不存在的模块：${item.key}`)
    }
    moduleDefaultOn.set(item.key, item.defaultOn)
  }

  // 重建分区：新顺序 + 新标签 + 新章顺序
  const parts: SpecPart[] = partOrder.map((key) => {
    const basePart = base.parts.find((part) => part.key === key)
    if (basePart === undefined) throw new Error(`分区顺序引用了不存在的分区：${key}`)
    return {
      key,
      label: partLabelByKey.get(key) ?? basePart.label,
      chapters: chaptersByPart.get(key) ?? []
    }
  })

  // 章序 = 分区展开（章号由位置派生，故顺序即章号）
  const numberedKeys = parts.flatMap((part) => [...part.chapters])
  const chapterKeys = [base.metaKey, ...numberedKeys]
  const numberByKey = new Map(numberedKeys.map((key, index) => [key, index + 1]))
  const baseChapterByKey = new Map(base.chapters.map((chapter) => [chapter.key, chapter]))
  // 标签按档位分派：游戏档编号式（CHAPTER_LABELS 同形），应用档主题式（APP_CHAPTER_LABELS 同形）。
  // 依据 docs/game-doc-corpus-2026.md：游戏策划案多数派编号，软件设计文档原文主题式。
  const numbered = base.kind === 'game'

  const chapters: SpecChapter[] = chapterKeys.map((key) => {
    const baseChapter = baseChapterByKey.get(key)
    if (baseChapter === undefined) throw new Error(`章序引用了不存在的章：${key}`)
    const name = nameByKey.get(key) ?? baseChapter.name
    const number = numberByKey.get(key) ?? 0
    const label = numbered && number > 0 ? `${number}. ${name}` : name
    return { ...baseChapter, name, label }
  })

  const chapterLabels: Record<string, string> = {}
  for (const chapter of chapters) chapterLabels[chapter.key] = chapter.label

  const modules: SpecModule[] = base.modules.map((module) => ({
    ...module,
    defaultOn: moduleDefaultOn.get(module.key) ?? module.defaultOn
  }))

  return {
    ...base,
    label: data.label ?? base.label,
    shortLabel: data.shortLabel ?? base.shortLabel,
    parts,
    numberedKeys,
    chapterKeys,
    chapters,
    chapterLabels,
    modules
  }
}

/** 覆盖层的目标档位（供 UI 预校验：与文档档位是否匹配） */
export function templateOverlayKind(overlay: unknown): DocumentSpecKind | undefined {
  const parsed = templateOverlaySchema.safeParse(overlay)
  return parsed.success ? parsed.data.kind : undefined
}
