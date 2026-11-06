/**
 * 文档档位判定（放在独立文件，切断 `ceshuModel ↔ chapterView` 的循环依赖）。
 *
 * `ceshuModel` 与 `chapterView` 都要读档位；若档位判定留在 ceshuModel 里，
 * chapterView import 它、它又 import chapterView 就会成环。抽到这个零依赖的
 * 叶子模块后，两边都只依赖它。
 */
import type { CeshuDocument } from '../reference'
import { isPlainObject } from '../../util/object'

/** 文档类型：游戏 / 应用（应用档不启用游戏数据编辑，见 meta.doc_kind 注释） */
export const DOC_KINDS = ['game', 'application'] as const
export type DocKind = (typeof DOC_KINDS)[number]

/**
 * 读取文档类型（meta.doc_kind，缺省 `game`）。
 * 只有显式 `application` 才降级为应用档——老文档 / 脏值一律按游戏处理。
 */
export function getDocKind(doc: CeshuDocument): DocKind {
  const meta = doc.meta
  return isPlainObject(meta) && meta.doc_kind === 'application' ? 'application' : 'game'
}

/** 该文档是否需要游戏数据编辑（应用档不需要） */
export function needsGameDataEditor(doc: CeshuDocument): boolean {
  return getDocKind(doc) !== 'application'
}
