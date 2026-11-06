/**
 * 规格化章表查表（路线 A 第 3 步的统一收口点）。
 *
 * 问题：`CHAPTER_LABELS` / `CHAPTER_REQUIRED_FIELDS` / `CESHU_CHAPTER_FIELDS`
 * 是**游戏 24 章**的编译期常量，12+ 消费方直接 `TABLE[chapter]` 查表。
 * 应用档有自己的 16 章与字段表，若各家自己判断档位就会散落成十几个分支。
 *
 * 这里把「按 `doc` 查章表元数据」收成一组函数：
 * - **游戏档一律委托既有常量**（逐字节零回归）；
 * - 应用档走 `appSchema` / `appSchema/table`，章号连续、标签独立；
 * - 消费方逐个从 `TABLE[key]` 换成 `xxxForDoc(doc, key)`。
 *
 * 章表**遍历**不在这里：由 `visibleChaptersForDoc(doc)` 统一分派（见 ceshuModel）。
 * 本模块刻意不 import `ceshuModel`，切断循环依赖。
 *
 * 类型上用 `string` 而非 `ChapterKey`：应用章 key 不是游戏联合类型的一员，
 * 强行并进去会污染所有 `Record<ChapterKey, X>`。边界处用 `isChapterKey` 窄化。
 */
import {
  CHAPTER_LABELS,
  CHAPTER_REQUIRED_FIELDS,
  chapterAnchorOf,
  chapterNumber,
  isChapterKey,
  type CeshuDocument,
  type CeshuFieldDef,
  type ChapterKey
} from '../reference'
import { CESHU_CHAPTER_FIELDS } from '../fields'
import { getDocKind } from './docKind'
import {
  APP_CHAPTER_FIELDS,
  APP_CHAPTER_LABELS,
  appChapterAnchorOf,
  appChapterNumber,
  appRequiredFields
} from '../../appSchema'

function isApp(doc: CeshuDocument): boolean {
  return getDocKind(doc) === 'application'
}

/** 章标签：游戏档用 CHAPTER_LABELS，应用档用 APP_CHAPTER_LABELS */
export function chapterLabelForDoc(doc: CeshuDocument, key: string): string {
  if (isApp(doc)) return APP_CHAPTER_LABELS[key] ?? key
  return isChapterKey(key) ? CHAPTER_LABELS[key] : key
}

/** 章必填字段：游戏档用 CHAPTER_REQUIRED_FIELDS，应用档从字段表派生 */
export function requiredFieldsForDoc(doc: CeshuDocument, key: string): readonly string[] {
  if (isApp(doc)) return appRequiredFields(key)
  return isChapterKey(key) ? (CHAPTER_REQUIRED_FIELDS[key] ?? []) : []
}

/** 章字段定义：游戏档用 CESHU_CHAPTER_FIELDS，应用档用 APP_CHAPTER_FIELDS */
export function chapterFieldsForDoc(doc: CeshuDocument, key: string): readonly CeshuFieldDef[] {
  if (isApp(doc)) return (APP_CHAPTER_FIELDS[key] ?? []) as readonly CeshuFieldDef[]
  return isChapterKey(key) ? (CESHU_CHAPTER_FIELDS[key] ?? []) : []
}

/** 章号：文档信息段为 0；应用档由自己的分区表派生（连续） */
export function chapterNumberForDoc(doc: CeshuDocument, key: string): number {
  if (isApp(doc)) return appChapterNumber(key)
  return isChapterKey(key) ? chapterNumber(key) : 0
}

/** 导出锚点：Markdown 目录与交接包「来源」回链必须指同一个锚点 */
export function chapterAnchorForDoc(doc: CeshuDocument, key: string): string {
  if (isApp(doc)) return appChapterAnchorOf(key)
  return isChapterKey(key) ? chapterAnchorOf(key) : ''
}

/** 章数据（应用章不在 CeshuDocument 的编译期章表里，走宽松索引） */
export function chapterDataForDoc(doc: CeshuDocument, key: string): Record<string, unknown> {
  const value = (doc as unknown as Record<string, unknown>)[key]
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {}
}

/** 类型守卫：只对游戏档的章 key 收窄成 ChapterKey（供遗留消费方） */
export function narrowChapterKey(key: string): ChapterKey | null {
  return isChapterKey(key) ? key : null
}
