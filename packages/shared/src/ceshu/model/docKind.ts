/**
 * 文档档位判定（放在独立文件，切断 `ceshuModel ↔ chapterView` 的循环依赖）。
 *
 * `ceshuModel` 与 `chapterView` 都要读档位；若档位判定留在 ceshuModel 里，
 * chapterView import 它、它又 import chapterView 就会成环。抽到这个零依赖的
 * 叶子模块后，两边都只依赖它。
 */
import type { CeshuDocument } from '../reference'
import { isPlainObject } from '../../util/object'

/** 文档类型：游戏 / 应用 / AI 产品设计（应用与 AI 档不启用游戏数据编辑，见 meta.doc_kind） */
export const DOC_KINDS = ['game', 'application', 'ai'] as const
export type DocKind = (typeof DOC_KINDS)[number]

/**
 * 读取文档类型（meta.doc_kind，缺省 `game`）。
 * 只有显式 `application` / `ai` 才进入对应档——老文档 / 脏值一律按游戏处理（零回归）。
 */
export function getDocKind(doc: CeshuDocument): DocKind {
  const meta = doc.meta
  if (!isPlainObject(meta)) return 'game'
  const kind = meta.doc_kind
  return kind === 'ai' ? 'ai' : kind === 'application' ? 'application' : 'game'
}

/** 该文档是否需要游戏数据编辑（仅游戏档需要；应用与 AI 档都不需要） */
export function needsGameDataEditor(doc: CeshuDocument): boolean {
  return getDocKind(doc) === 'game'
}

/**
 * 是否「非游戏」软件类文档（应用 / AI）。
 *
 * 导出 / 交接包 / 岗位 / AI 提示词里有大量「游戏走一套、软件走另一套」的分支，
 * 判据应统一为「不是游戏」而非「显式 == application」——否则 AI 档会悄悄落进游戏分支。
 * 应用与 AI 的差异由章表分派（`chapterView` / `specForDoc`）承担，这里只分「软件 / 游戏」。
 */
export function isSoftwareDoc(doc: CeshuDocument): boolean {
  return getDocKind(doc) !== 'game'
}
