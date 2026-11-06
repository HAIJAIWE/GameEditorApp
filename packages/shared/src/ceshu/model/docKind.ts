/**
 * 文档档位判定（放在独立文件，切断 `ceshuModel ↔ chapterView` 的循环依赖）。
 *
 * `ceshuModel` 与 `chapterView` 都要读档位；若档位判定留在 ceshuModel 里，
 * chapterView import 它、它又 import chapterView 就会成环。抽到这个零依赖的
 * 叶子模块后，两边都只依赖它。
 */
import type { CeshuDocument } from '../reference'
import { isPlainObject } from '../../util/object'

/**
 * 文档类型：游戏 / 应用。**只有两种模式**——AI 产品属于「应用」，其模型层四章
 * 是应用文档的可选章节（见 `meta.optional_modules`），不再单列一种档位。
 */
export const DOC_KINDS = ['game', 'application'] as const
export type DocKind = (typeof DOC_KINDS)[number]

/**
 * 读取文档类型（meta.doc_kind，缺省 `game`）。
 * 只有显式 `application` 才进入应用档——老文档 / 脏值一律按游戏处理（零回归）。
 */
export function getDocKind(doc: CeshuDocument): DocKind {
  const meta = doc.meta
  return isPlainObject(meta) && meta.doc_kind === 'application' ? 'application' : 'game'
}

/** 该文档是否需要游戏数据编辑（仅游戏档需要；应用档不需要） */
export function needsGameDataEditor(doc: CeshuDocument): boolean {
  return getDocKind(doc) === 'game'
}

/**
 * 是否「非游戏」的软件类文档（即应用档）。
 * 导出 / 交接包 / 岗位 / AI 提示词里「游戏走一套、软件走另一套」的分支统一用它。
 */
export function isSoftwareDoc(doc: CeshuDocument): boolean {
  return getDocKind(doc) !== 'game'
}

/**
 * 已启用的**可选模块**（`meta.optional_modules`，值是模块 id 如 `ai_layer`）。
 *
 * ⚠️ 不要和游戏的 `meta.enabled_modules` 混用：后者是「启用哪些**模块章**」，
 * 值是章 key（见 `enabledModuleChapters`）。两者语义不同，故用不同字段。
 * 旧字段 `ai_enabled` 由 `normalizeCeshu` 读盘时一次性迁移到本字段。
 */
export function optionalModulesForDoc(doc: CeshuDocument): readonly string[] {
  const meta = doc.meta
  if (!isPlainObject(meta)) return []
  const raw = meta.optional_modules
  return Array.isArray(raw) ? raw.filter((item): item is string => typeof item === 'string') : []
}

/** 应用文档是否启用「AI 模型层」四章（模型卡 / 数据表 / 系统卡 / 评测与红队） */
export function aiEnabledForDoc(doc: CeshuDocument): boolean {
  return optionalModulesForDoc(doc).includes('ai_layer')
}
