/**
 * shared/documentSpec —— 文档规格注册表：游戏 GDD / 应用 SDD 双规格的唯一入口。
 *
 * 外部一律从这里 import（`.../documentSpec`），不要再深插目录内文件。
 * 路线 A「统一内核 + 双规格」的第一层：先有注册表与分派，后续各消费方逐层接入。
 */
import type { CeshuDocument } from '../ceshu/reference'
import { getDocKind } from '../ceshu/model'
import { APP_SPEC } from './appSpec'
import { GAME_SPEC } from './gameSpec'
import type { DocumentSpec, DocumentSpecKind } from './types'

export type { DocumentSpec, DocumentSpecKind, SpecChapter, SpecPart, SpecRole } from './types'
export { APP_SPEC, APP_PARTS, APP_META_KEY, APP_AGENT_DISPLAY, APP_AGENT_PROMPTS, APP_ROLES } from './appSpec'
export { GAME_SPEC } from './gameSpec'

/** 全部已注册规格（顺序稳定，供枚举 UI 用） */
export const DOCUMENT_SPECS: readonly DocumentSpec[] = [GAME_SPEC, APP_SPEC]

/** 按档位取规格；未注册的档位一律回落游戏档（老文档 / 脏值零回归） */
export function specForKind(kind: DocumentSpecKind | undefined): DocumentSpec {
  return kind === 'application' ? APP_SPEC : GAME_SPEC
}

/** 按文档取规格（唯一应该被消费方调用的入口） */
export function specForDoc(doc: CeshuDocument): DocumentSpec {
  return specForKind(getDocKind(doc))
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
