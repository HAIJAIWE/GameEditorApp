import type { DataQualityVerdict } from '../../types'
import { isPlainObject } from '../model'
import type { CeshuDocument } from '../reference'
import type { DataTypeDef } from '../../types'
import type { LlmUsage } from '../../config/llm'
import type { DataTableIssue } from './ceshuDataTableCheck'

/**
 * AI 生成候选游戏数据纯逻辑（自 旧版 `core/agent/skills/ceshu_skill_generate::_ai_generate_data`
 * 与 `ui/ceshu/ai_data_generate_dialog` 匹平迁移）：
 * - 类型解析（单数/复数键均可，去重）+ 每类条数归一（1~20，默认 5）
 * - 策划书上下文（meta 三项 + numeric 三项截断 500 + 启用的系统名前 12 个）与类型字段提示
 * - 提示词组装 + LLM 输出的键名归一化（复数键优先、单数键兜底、仅保留对象条目、剥离 id）
 * - 候选条目摘要
 * 说明：AI 只生产候选，**必须人工勾选后**才写入数据表。
 */

/** 每类条数默认值与范围 */
export const DATA_GEN_DEFAULT_COUNT = 5
export const DATA_GEN_MIN_COUNT = 1
export const DATA_GEN_MAX_COUNT = 20

/** 提示词中每个背景字段/数值字段的截断长度 */
export const DATA_GEN_BACKGROUND_MAX_LENGTH = 500
/** 提示词中建议字段个数上限 */
export const DATA_GEN_FIELD_HINT_LIMIT = 14
/** 启用的系统名个数上限 */
export const DATA_GEN_SYSTEM_NAME_LIMIT = 12

/** 无背景信息时的占位文案 */
export const DATA_GEN_NO_BACKGROUND = '（策划书尚未填写背景信息，请按通用 RPG 设定生成）'

export const DATA_GEN_ERROR_NO_TYPE = '请至少选择一种数据类型（如角色、技能、怪物）。'
export const DATA_GEN_ERROR_UNPARSABLE = 'AI 返回内容无法解析为 JSON，请重试或减少生成数量。'
export const DATA_GEN_ERROR_EMPTY = 'AI 未返回任何有效数据条目，请补充数值章设定或调整要求后重试。'

/** 提示词排除的非用户字段 */
const EXCLUDED_FIELD_NAMES = new Set(['id', 'image', 'image_desc', 'image_tags'])

export interface SelectedDataType {
  /** 单数键（存储与建议字段查询用） */
  id: string
  /** 中文名 */
  name: string
  /** 复数键（AI 输出的对象键名） */
  pluralKey: string
}

export type DataGenCandidates = Record<string, Array<Record<string, unknown>>>

/** 生成候选结果（IPC 返回；candidates 为复数键 → 候选条目） */
export interface CeshuDataGenResult {
  model: string
  candidates: DataGenCandidates
  /** 每个复数键的条目数 */
  generatedCounts: Record<string, number>
  total: number
  /** 汇总文案（含分类计数） */
  summary: string
  /**
   * 候选的**确定性质量门**结论（v0.5 DD-19 的数据半边）。
   * 由 `shared/agent/qualityGate.ts::evaluateDataCandidates` 产出：数量约束（P5，硬）
   * + 数值平衡性（`dataStats::assessBalance`，建议）。
   * **可选**：旧调用方忽略该字段即可。
   */
  quality?: DataQualityVerdict | null
  /** 本次调用的 token 用量（v0.6 M5：成本护栏的观测数据）；本地档可能为空 */
  usage?: LlmUsage | null
}

/**
 * 解析所选数据类型：
 * 传入的单数或复数键（去空白 + 小写）都能识别；未知键按原样当作单数处理；保持传入顺序。
 */
export function resolveSelectedDataTypes(types: DataTypeDef[], rawKeys: string[]): SelectedDataType[] {
  const bySingular = new Map(types.map((type) => [type.id, type]))
  const byPlural = new Map(types.map((type) => [type.pluralKey, type]))
  const selected: SelectedDataType[] = []
  const seen = new Set<string>()

  for (const raw of rawKeys) {
    const key = String(raw ?? '').trim().toLowerCase()
    if (!key) continue
    const def = bySingular.get(key) ?? byPlural.get(key)
    const id = def ? def.id : key
    const name = def ? def.name : key
    const pluralKey = def ? def.pluralKey : key
    if (seen.has(id)) continue
    seen.add(id)
    selected.push({ id, name, pluralKey })
  }
  return selected
}

/** 每类条数归一：非数值 → 默认 5；范围 1~20 */
export function clampDataGenCount(raw: unknown): number {
  const value = typeof raw === 'number' ? raw : Number(raw)
  if (!Number.isFinite(value)) return DATA_GEN_DEFAULT_COUNT
  return Math.max(DATA_GEN_MIN_COUNT, Math.min(Math.trunc(value), DATA_GEN_MAX_COUNT))
}

/** 策划书上下文 */
export function buildDataGenBackground(doc: Pick<CeshuDocument, 'meta' | 'numeric' | 'systems'>): string {
  const bits: string[] = []
  for (const [label, key] of [
    ['游戏名', 'game_name'],
    ['类型', 'game_type'],
    ['定位', 'positioning']
  ] as const) {
    const value = doc.meta[key]
    if (typeof value === 'string' && value) bits.push(`${label}：${value}`)
    else if (typeof value === 'number' && Number.isFinite(value)) bits.push(`${label}：${value}`)
  }
  for (const [label, key] of [
    ['核心公式', 'core_formulas'],
    ['平衡原则', 'balance_principles'],
    ['经济模型', 'economic_model']
  ] as const) {
    const value = doc.numeric[key]
    if (value === undefined || value === null || value === '') continue
    bits.push(`${label}：${String(value).slice(0, DATA_GEN_BACKGROUND_MAX_LENGTH)}`)
  }
  const enabledNames = Object.values(doc.systems)
    .map((config) => (isPlainObject(config) && config.enabled === true ? String(config.name ?? '').trim() : ''))
    .filter((name) => name.length > 0)
    .slice(0, DATA_GEN_SYSTEM_NAME_LIMIT)
  if (enabledNames.length > 0) {
    bits.push(`启用的游戏系统：${enabledNames.join('、')}`)
  }
  return bits.length > 0 ? bits.join('\n') : DATA_GEN_NO_BACKGROUND
}

/** 单个类型的建议字段名（排除 id 与 image* 字段，最多 14 个） */
export function dataTypeFieldHints(type: DataTypeDef | undefined): string[] {
  if (!type) return []
  return type.formFields
    .map((field) => field.name)
    .filter((name) => !EXCLUDED_FIELD_NAMES.has(name))
    .slice(0, DATA_GEN_FIELD_HINT_LIMIT)
}

/** 类型与建议字段清单 */
export function buildDataGenTypeHints(types: DataTypeDef[], selected: SelectedDataType[]): string {
  return selected
    .map((item) => {
      const def = types.find((type) => type.id === item.id)
      const fields = dataTypeFieldHints(def)
      if (!def) return `- ${item.name}（键: ${item.pluralKey}）：字段参考默认数据表`
      return fields.length > 0
        ? `- ${item.name}（键: ${item.pluralKey}）：建议字段 ${fields.join(', ')}`
        : `- ${item.name}（键: ${item.pluralKey}）：字段参考默认数据表`
    })
    .join('\n')
}

export interface DataGenPrompt {
  system: string
  prompt: string
}

/** 组装提示词 */
export function buildDataGenPrompt(
  doc: Pick<CeshuDocument, 'meta' | 'numeric' | 'systems'>,
  types: DataTypeDef[],
  selected: SelectedDataType[],
  count: number,
  instruction: string
): DataGenPrompt {
  const background = buildDataGenBackground(doc)
  const typeDesc = buildDataGenTypeHints(types, selected)
  const system = [
    '你是资深游戏数值与内容策划，负责从策划书设定出发生成初始游戏数据。',
    '你只输出一个合法 JSON 对象，不输出任何解释、注释或代码块标记。'
  ].join('')
  const requirementLines = [
    '1. 每个类型生成 ' + count + ' 条数据。',
    '2. 输出 JSON 对象：键为上面的复数键名，值为数组；不生成 id 字段。',
    '3. 每条必须包含 name；数值字段量级与策划书数值设定保持一致。',
    '4. 内容风格统一、可读，避免重复。'
  ]
  if (instruction) requirementLines.push(`5. 补充要求：${instruction}`)
  const prompt =
    '请根据下面的策划书设定，为指定的游戏数据类型生成初始候选数据（人工审批后才导入，允许少量瑕疵）。\n\n' +
    `[策划书设定]\n${background}\n\n` +
    `[数据类型与建议字段]\n${typeDesc}\n\n` +
    `[要求]\n${requirementLines.join('\n')}\n` +
    '输出格式示例：{"roles": [{"name": "示例", "desc": "..."}], "skills": [...]}'
  return { system, prompt }
}

export interface NormalizedCandidates {
  candidates: DataGenCandidates
  /** 每个复数键的条目数（仅含非空类型） */
  generatedCounts: Record<string, number>
  total: number
}

/**
 * 归一化 LLM 输出：
 * 优先取复数键，缺失且该复数键已知时回退单数键；仅保留对象条目；**剥离 id**（由数据层重新生成）。
 */
export function normalizeDataGenCandidates(
  parsed: unknown,
  selected: SelectedDataType[],
  knownPluralKeys: Set<string>
): NormalizedCandidates {
  const source = isPlainObject(parsed) ? parsed : {}
  const candidates: DataGenCandidates = {}
  const generatedCounts: Record<string, number> = {}
  for (const item of selected) {
    const bucket = source[item.pluralKey] ?? (knownPluralKeys.has(item.pluralKey) ? source[item.id] : undefined)
    const items = Array.isArray(bucket) ? bucket.filter(isPlainObject) : []
    // 剥离 id（数据层会重新生成，避免与既有条目冲突）
    const cleaned = items.map((entry) => {
      const copy: Record<string, unknown> = {}
      for (const [key, value] of Object.entries(entry)) {
        if (key === 'id') continue
        copy[key] = value
      }
      return copy
    })
    if (cleaned.length > 0) {
      candidates[item.pluralKey] = cleaned
      generatedCounts[item.pluralKey] = cleaned.length
    }
  }
  const total = Object.values(generatedCounts).reduce((sum, value) => sum + value, 0)
  return { candidates, generatedCounts, total }
}

/** 候选条目摘要：name + 前 3 个非 name 的标量字段 */
export function summarizeCandidateItem(item: Record<string, unknown>): string {
  const name = String(item['name'] ?? '未命名').trim()
  const parts: string[] = []
  for (const [key, value] of Object.entries(item)) {
    if (key === 'name') break
    if (parts.length >= 3) break
    const scalar = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean'
    if (scalar && value !== '') parts.push(`${key}=${String(value)}`)
  }
  return parts.length > 0 ? `${name}    |    ${parts.join('  ')}` : name
}

/** 生成结果汇总文案 */
export function buildDataGenSummaryMessage(generatedCounts: Record<string, number>): string {
  const total = Object.values(generatedCounts).reduce((sum, value) => sum + value, 0)
  const detail = Object.entries(generatedCounts)
    .map(([key, value]) => `${key}:${value}`)
    .join('、')
  return `已生成 ${total} 条候选数据（${detail}），请人工勾选导入。`
}

/**
 * 把「AI 生成缺失数据」的补充要求拼出来：说清要补哪张表、缺口多大、按什么原则生成。
 * 具体的数值/系统设定由 `buildDataGenPrompt` 从策划书喂给模型，这里只负责把
 * 「为什么生成、生成什么边界」讲清楚，避免 AI 凭空编一堆无关数据。
 */
export function buildDataFillInstruction(issue: DataTableIssue): string {
  const gapNote = issue.gap !== undefined ? `，缺口约 ${issue.gap} 条` : ''
  return (
    `「${issue.table}」表数据不足（单次生成上限 ${DATA_GEN_MAX_COUNT} 条，可多轮补齐${gapNote}）。` +
    '请严格依据本策划书的数值/系统章设定（含平衡公式、成长曲线、稀有度梯度、掉落概率等）生成数值合理的候选条目；' +
    '与当前数值体系无关或设计未定义的字段可留空或给合理默认值。' +
    '生成后请在预览里逐条核对、按实际数值微调后再导入数据表。'
  )
}