/**
 * shared/documentSpec —— 文档规格注册表：游戏 GDD / 应用 SDD 双规格的唯一入口。
 *
 * 外部一律从这里 import（`.../documentSpec`），不要再深插目录内文件。
 * 路线 A「统一内核 + 双规格」的第一层：先有注册表与分派，后续各消费方逐层接入。
 */
import type { CeshuDocument } from '../ceshu/reference'
import { getDocKind, templateOverlayForDoc } from '../ceshu/model'
import { APP_SPEC } from './appSpec'
import { GAME_SPEC } from './gameSpec'
import { applyTemplateOverlay } from './templateOverlay'
import type { DocumentSpec, DocumentSpecKind } from './types'

export type { DocumentSpec, DocumentSpecKind, SpecChapter, SpecPart, SpecRole } from './types'
export { APP_SPEC, APP_PARTS, APP_META_KEY, APP_AGENT_DISPLAY, APP_AGENT_PROMPTS, APP_ROLES } from './appSpec'
export { GAME_SPEC } from './gameSpec'
export { applyTemplateOverlay, templateOverlayKind, templateOverlaySchema } from './templateOverlay'
export type { TemplateOverlay } from './templateOverlay'

/** 全部已注册规格（顺序稳定，供枚举 UI 用） */
export const DOCUMENT_SPECS: readonly DocumentSpec[] = [GAME_SPEC, APP_SPEC]

/**
 * 校验一份规格的结构完整性。返回错误列表（空数组 = 通过）。
 * 加载时对全部规格跑一遍：模板写错在启动就报，而不是运行时才发现「某章没提示词」。
 */
export function validateDocumentSpec(spec: DocumentSpec): string[] {
  const errors: string[] = []
  const keys = spec.chapterKeys
  const keySet = new Set(keys)
  if (keySet.size !== keys.length) errors.push('chapterKeys 存在重复')
  const chapterKeyList = spec.chapters.map((chapter) => chapter.key)
  if (chapterKeyList.length !== keys.length || chapterKeyList.some((key, index) => key !== keys[index])) {
    errors.push('chapters 的顺序/集合与 chapterKeys 不一致')
  }
  const partChapters = spec.parts.flatMap((part) => [...part.chapters])
  const partSet = new Set(partChapters)
  if (partSet.size !== partChapters.length) errors.push('parts 存在重复章')
  for (const key of keys) {
    if (key !== spec.metaKey && !partSet.has(key)) errors.push(`章 ${key} 未归入任何分区`)
  }
  for (const key of partChapters) {
    if (!keySet.has(key)) errors.push(`分区引用了不存在的章 ${key}`)
  }
  const moduleKeys = new Set(spec.modules.map((item) => item.key))
  if (moduleKeys.size !== spec.modules.length) errors.push('modules 的 key 存在重复')
  for (const chapter of spec.chapters) {
    if (chapter.module !== undefined && !moduleKeys.has(chapter.module)) {
      errors.push(`章 ${chapter.key} 引用了未声明的模块 ${chapter.module}`)
    }
    if (spec.agentDisplay[chapter.agentId] === undefined) {
      errors.push(`章 ${chapter.key} 的 agentId ${chapter.agentId} 在 agentDisplay 里不存在`)
    }
  }
  for (const module of spec.modules) {
    if (module.chapters.length === 0) errors.push(`模块 ${module.key} 没有任何章`)
    for (const key of module.chapters) {
      if (!keySet.has(key)) errors.push(`模块 ${module.key} 引用了不存在的章 ${key}`)
    }
  }
  for (const chapter of spec.chapters) {
    if (chapter.module === undefined) continue
    const module = spec.modules.find((item) => item.key === chapter.module)
    if (module !== undefined && !module.chapters.includes(chapter.key)) {
      errors.push(`章 ${chapter.key} 声明模块 ${chapter.module}，但该模块未列出它`)
    }
  }
  for (const [role, chapters] of Object.entries(spec.roleChapters)) {
    for (const key of chapters) {
      if (!keySet.has(key)) errors.push(`岗位 ${role} 引用了不存在的章 ${key}`)
    }
  }
  return errors
}

// 加载即校验：任何规格结构不完整，直接抛错（fail-fast）
for (const spec of DOCUMENT_SPECS) {
  const errors = validateDocumentSpec(spec)
  if (errors.length > 0) {
    throw new Error(`文档规格校验失败（${spec.kind}）：\n${errors.join('\n')}`)
  }
}

/** 按档位取规格；未注册的档位一律回落游戏档（老文档 / 脏值零回归） */
export function specForKind(kind: DocumentSpecKind | undefined): DocumentSpec {
  return kind === 'application' ? APP_SPEC : GAME_SPEC
}

/**
 * 按文档取规格（唯一应该被消费方调用的入口）。
 *
 * 若文档携带 `meta.template_overlay`（JSON 模板覆盖层），在此应用：只覆盖
 * 标签 / 顺序 / 模块默认开关，章 key 与字段契约不变。
 *
 * **fail-soft**：覆盖层损坏时退回基础规格而不是抛错——导出 / 交接包不能因为
 * 一份坏 JSON 整体失败。需要把校验错误暴露给用户的路径（模板编辑 UI）应直接
 * 调用 `applyTemplateOverlay`，让异常冒泡。
 */
export function specForDoc(doc: CeshuDocument): DocumentSpec {
  const base = specForKind(getDocKind(doc))
  const overlay = templateOverlayForDoc(doc)
  if (overlay === undefined) return base
  try {
    return applyTemplateOverlay(base, overlay)
  } catch {
    return base
  }
}

/** 按档位取隐藏的主区页签（替代散落的隐藏规则，规则归规格所有） */
export function hiddenMainViewIdsForKind(kind: DocumentSpecKind | undefined): readonly string[] {
  return specForKind(kind).hiddenMainViewIds
}

/** 规格内章号：文档信息段为 0，编号章从 1 起（由 parts 派生，恒连续） */
export function specChapterNumber(spec: DocumentSpec, key: string): number {
  if (key === spec.metaKey) return 0
  return spec.numberedKeys.indexOf(key) + 1
}
