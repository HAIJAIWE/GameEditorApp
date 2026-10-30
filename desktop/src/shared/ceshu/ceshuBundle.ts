import {
  CHAPTER_KEYS,
  CHAPTER_LABELS,
  type CeshuDocument,
  type ChapterData,
  type ChapterKey
} from './ceshuConstants'
import { getGddScope, isPlainObject, visibleChaptersForDoc } from './ceshuModel'
import { CESHU_CHAPTER_FIELDS, resolveFieldMeta } from './ceshuFields'
import { fieldStatusOf } from './ceshuFieldStatus'
import { validateCeshu } from './ceshuValidation'

/**
 * 双轨导出·机读轨（JSON）的纯逻辑（schema 类型 + 组装 + 序列化）。
 *
 * ## 为什么在 shared 而不是 main
 * 这段逻辑零 IO（不碰文件系统），而它的消费者有两端：
 * - `main/ceshu/export/exporter.ts`（落盘的那一端）；
 * - `shared/ceshuBundlePrompt.ts`（消费提示词生成，给外部 AI 用的那一端）。
 * 放 shared 让两端共用同一份类型与组装规则，避免「导出的结构」和「提示词描述的结构」各写一套。
 *
 * ## 不变量
 * - 纯函数：不碰文件系统，时间经参数注入（测试可复现）；
 * - 只读 doc：绝不在渲染过程中修改文档；
 * - 字段顺序 = schema 定义序在前、数据里的扩展键追加在后（与表单顺序一致）。
 */

/** 机读轨 schema 版本（结构不兼容升级时 +1，消费方按此分流） */
export const CESHU_BUNDLE_SCHEMA = 'mobai-ceshu-bundle/1'

export interface CeshuBundleField {
  key: string
  label: string
  /** 字段类型（schema 内字段必有；扩展键缺省） */
  kind?: string
  /** 必填（schema 内字段必有） */
  required?: boolean
  /** AI 可起草（false = 人定字段，机器不应自动填写） */
  aiDraftable?: boolean
  /** AI 生成目标（schema 内字段必有，来自字段契约） */
  aiHint?: string
  /** 人审要点（schema 内字段必有） */
  reviewHint?: string
  /** 字段值（原样序列化，未做人类可读格式化） */
  value: unknown
  /** 审核状态：ai_draft / human_edited / approved；无记录缺省 */
  status?: string
}

export interface CeshuBundleChapter {
  key: ChapterKey
  label: string
  /** 全局章号（1 起，与 Markdown 锚点一致） */
  index: number
  fields: CeshuBundleField[]
}

export interface CeshuBundle {
  schema: typeof CESHU_BUNDLE_SCHEMA
  exportedAt: string
  doc: {
    ceshuId: string
    versionLabel: string
    gddScope: string
    style: string
    moduleType: string
    isActive: boolean
    createdAt: string
    updatedAt: string
    gameName: string
    gameType: string
    positioning: string
    tags: string[]
    status: string
    confidentiality: string
  }
  chapters: CeshuBundleChapter[]
  validation: { errorCount: number; errors: string[] }
}

export interface BuildBundleOptions {
  /** 导出时间（ISO 字符串；测试注入固定值保证可复现） */
  exportedAt?: string
}

/** 组装机读轨结构（导出给测试与潜在的其他序列化格式复用） */
export function buildCeshuBundle(doc: CeshuDocument, options: BuildBundleOptions = {}): CeshuBundle {
  const scope = getGddScope(doc)
  const visible = new Set(visibleChaptersForDoc(doc))
  const chapters: CeshuBundleChapter[] = []
  for (const [position, key] of CHAPTER_KEYS.entries()) {
    if (!visible.has(key)) continue
    chapters.push({
      key,
      label: CHAPTER_LABELS[key],
      index: position + 1,
      fields: buildChapterFields(doc, key)
    })
  }

  const errors = validateCeshu(doc)
  return {
    schema: CESHU_BUNDLE_SCHEMA,
    exportedAt: options.exportedAt ?? new Date().toISOString(),
    doc: {
      ceshuId: doc.ceshu_id,
      versionLabel: doc.version_label,
      gddScope: scope,
      style: doc.style,
      moduleType: doc.module_type,
      isActive: doc.is_active,
      createdAt: doc.created_at,
      updatedAt: doc.updated_at,
      gameName: readString(doc.meta.game_name),
      gameType: readString(doc.meta.game_type),
      positioning: readString(doc.meta.positioning),
      tags: readTags(doc.meta.tags),
      status: readString(doc.meta.status),
      confidentiality: readString(doc.meta.confidentiality)
    },
    chapters,
    validation: { errorCount: errors.length, errors }
  }
}

/** 渲染机读轨 JSON（2 空格缩进 + 结尾换行，便于 Git diff） */
export function renderCeshuBundleJson(doc: CeshuDocument, options: BuildBundleOptions = {}): string {
  return `${JSON.stringify(buildCeshuBundle(doc, options), null, 2)}\n`
}

/** 单章字段：schema 定义序在前（带契约），数据里的扩展键追加在后（仅键值） */
function buildChapterFields(doc: CeshuDocument, chapter: ChapterKey): CeshuBundleField[] {
  // 防御：章节数据缺失（桩/老文档缺章、字段被整体删掉）时不应让导出崩溃，
  // 一律按空对象处理——schema 字段仍按契约产出（值为 undefined），只是没有扩展键。
  const data: ChapterData = isPlainObject(doc[chapter]) ? doc[chapter] : {}
  const statusMap = fieldStatusOf(doc.meta, chapter)
  const fields: CeshuBundleField[] = []

  for (const def of CESHU_CHAPTER_FIELDS[chapter] ?? []) {
    const meta = resolveFieldMeta(chapter, def)
    const status = statusMap[def.key]?.status
    fields.push({
      key: def.key,
      label: def.label,
      kind: def.kind,
      required: meta.required,
      aiDraftable: meta.aiDraftable,
      ...(meta.aiHint !== '' ? { aiHint: meta.aiHint } : {}),
      ...(meta.reviewHint !== '' ? { reviewHint: meta.reviewHint } : {}),
      value: readByPath(data, def.key),
      ...(status !== undefined ? { status } : {})
    })
  }

  // 扩展键（模板/旧数据带来的 schema 外字段）：保留值，不编造契约
  const schemaKeys = new Set((CESHU_CHAPTER_FIELDS[chapter] ?? []).map((def) => def.key.split('.')[0]))
  for (const key of Object.keys(data)) {
    if (schemaKeys.has(key)) continue
    fields.push({ key, label: key, value: data[key] })
  }
  return fields
}

/** 点路径读取（如 user_personas.primary）；中间节点非对象时返回 undefined */
function readByPath(data: ChapterData, path: string): unknown {
  let node: unknown = data
  for (const part of path.split('.')) {
    if (!isPlainObject(node)) return undefined
    node = node[part]
  }
  return node
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readTags(value: unknown): string[] {
  if (Array.isArray(value)) return value.filter((item): item is string => typeof item === 'string')
  if (typeof value === 'string' && value.trim() !== '') return [value]
  return []
}
