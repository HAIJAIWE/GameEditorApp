import { CESHU_CHAPTER_FIELDS } from '../fields'
import type { CeshuDocument } from '../reference'
import { visibleChaptersForDoc } from '../model'

/**
 * 设计 ↔ 数据表核对：把「策划书说要建哪些表」与「数据编辑器里实际有什么」对上。
 *
 * 起因：策划书里写了「需要 200 把武器，字段要有攻击力/稀有度」，数据编辑器里却只有 3 条，
 * 或者字段叫 `atk` 而设计里写「攻击力」——两边谁也发现不了。这是「设计文档驱动数据」的最后一公里。
 *
 * 纯逻辑：只吃「文档」与「实际表摘要」，不碰 IPC / SQLite，方便单测与脚本复用。
 */

/** 数据编辑器里一张表的实际状况（由主进程从 SQLite + 类型 schema 汇总） */
export interface DataTableActual {
  /** 类型 id（如 equip） */
  typeId: string
  /** 类型中文名（如 装备） */
  typeName: string
  /** 现有条数 */
  count: number
  /** 该类型声明过的字段键（`formFields[].name`） */
  fieldNames: string[]
  /** 该类型声明过的字段中文标签（`formFields[].label`，已去尾部冒号） */
  fieldLabels: string[]
}

/** 设计里声明的一行数据表需求 */
export interface DataTableRequirement {
  /** 原始行（报错时回显，便于定位） */
  raw: string
  tableName: string
  purpose: string
  /** 关键字段（按逗号/顿号切分后的原始文本） */
  keyFields: string[]
  /** 期望条数；null = 没写或写不清（不核对条数） */
  expectedCount: number | null
  /** 是否为下限（写「≥50」这类） */
  isMinimum: boolean
}

export type DataTableIssueKind =
  | 'missing_table'
  | 'count_short'
  | 'count_over'
  | 'missing_field'
  | 'empty_table'
  | 'unparsed'

export interface DataTableIssue {
  kind: DataTableIssueKind
  level: 'error' | 'warn'
  /** 涉及的表名（原始写法） */
  table: string
  message: string
  /**
   * 命中时的实际类型 id（设计↔数据表核对面板的「AI 生成缺失数据」用它定位要补的表）。
   * 缺表（missing_table）时为 undefined——那种情况要先补齐结构，而不是灌数据。
   */
  typeId?: string
  /**
   * 条数缺口（期望 - 实际）。供 UI 预设本次生成的条数（受 20 条上限约束，多轮补齐）。
   * 空表且无期望数时为 undefined。
   */
  gap?: number
}

export interface DataTableCheckResult {
  /** 解析出来的需求（UI 要回显「设计里声明了什么」） */
  requirements: DataTableRequirement[]
  issues: DataTableIssue[]
  /** 全部通过时为 true（没有声明也算通过——那是「没写」，不是「不符」） */
  ok: boolean
}

/** 分隔符：中英文逗号/顿号/分号都认，策划手写时不会统一 */
const FIELD_SEPARATORS = /[,，、;；]/

/** 把「200 / ≥50 / >=50 / 50+ / 约200 / 200 条」解析成 {value, isMinimum} */
export function parseExpectedCount(raw: string): { value: number | null; isMinimum: boolean } {
  const text = raw.trim()
  if (text === '') return { value: null, isMinimum: false }
  const isMinimum = /^(≥|>=|>)/.test(text) || text.endsWith('+')
  const match = /(\d+)/.exec(text)
  if (match === null) return { value: null, isMinimum }
  const value = Number(match[1])
  return Number.isFinite(value) ? { value, isMinimum } : { value: null, isMinimum }
}

/** 解析 `tech.data_tables` 的行：`表名|用途|关键字段|期望条数`（第 4 段可缺） */
export function parseDataTableRequirements(rows: readonly unknown[]): DataTableRequirement[] {
  const out: DataTableRequirement[] = []
  for (const row of rows) {
    const raw = typeof row === 'string' ? row : ''
    if (raw.trim() === '') continue
    const parts = raw.split('|').map((part) => part.trim())
    const tableName = parts[0] ?? ''
    if (tableName === '') continue
    const keyFields = (parts[2] ?? '')
      .split(FIELD_SEPARATORS)
      .map((field) => field.trim())
      .filter((field) => field !== '')
    const { value, isMinimum } = parseExpectedCount(parts[3] ?? '')
    out.push({
      raw,
      tableName,
      purpose: parts[1] ?? '',
      keyFields,
      expectedCount: value,
      isMinimum
    })
  }
  return out
}

/** 从文档里取 `tech.data_tables`（章不可见 = 没有声明） */
export function readDataTableRows(doc: CeshuDocument): unknown[] {
  if (!visibleChaptersForDoc(doc).includes('tech')) return []
  const field = (CESHU_CHAPTER_FIELDS.tech ?? []).find((item) => item.key === 'data_tables')
  if (field === undefined) return []
  const value = (doc.tech as Record<string, unknown> | undefined)?.[field.key]
  return Array.isArray(value) ? value : []
}

function normalize(text: string): string {
  // 去掉尾部冒号（字段标签习惯带「:」）与空白，便于「攻击力」对上「攻击力:」
  return text.replace(/[:：]\s*$/, '').trim().toLowerCase()
}

/**
 * 字段是否「对得上」。
 *
 * 只做精确相等不够用：类型里的标签是「道具名称:」「效果类型:」，而策划在设计里只会写
 * 「名称」「效果」——精确匹配会制造一堆假警报，警报一多这个功能就没人看了。
 * 所以放宽成「一方包含另一方」，但要求被匹配的声明至少 2 个字，
 * 避免「血」这种单字把一堆字段都认成命中。
 */
function fieldMatches(declared: string, known: readonly string[]): boolean {
  const target = normalize(declared)
  if (target === '') return false
  return known.some((candidate) => {
    const text = normalize(candidate)
    if (text === '') return false
    if (text === target) return true
    return target.length >= 2 && (text.includes(target) || target.includes(text))
  })
}

/**
 * 表名归一：把设计里的写法对到实际类型上。
 *
 * 只在「完全一致」时才认，会让「装备表」和「装备」变成两张表——核对报「没建表」，
 * 用户去补齐、补齐又新建一个「装备表」，于是同一个东西变成两张表。
 * 所以放宽成三级：完全一致 → 去掉「表」后缀 → 名称包含关系（≥2 字）。
 *
 * 补齐（`ceshuDataTableScaffold`）复用同一份解析，避免两边各有一套口径。
 */
export interface ResolvedTable {
  table: DataTableActual
  /** 非空表示是靠归一命中的，UI 要说明理由（别让用户以为名字真的一模一样） */
  reason: string
}

export function resolveDataTable(
  declaredName: string,
  actual: readonly DataTableActual[]
): ResolvedTable | undefined {
  const raw = normalize(declaredName)
  const stripped = normalize(declaredName.replace(/(配置表|数据表|表)$/, ''))

  const exact = actual.find((table) => normalize(table.typeName) === raw || normalize(table.typeId) === raw)
  if (exact !== undefined) return { table: exact, reason: '' }

  if (stripped !== raw && stripped !== '') {
    const bySuffix = actual.find(
      (table) => normalize(table.typeName) === stripped || normalize(table.typeId) === stripped
    )
    if (bySuffix !== undefined) {
      return { table: bySuffix, reason: `「${declaredName}」按「${bySuffix.typeName}」处理（去掉「表」字后一致）` }
    }
  }

  if (stripped.length >= 2) {
    const byContains = actual.find((table) => {
      const name = normalize(table.typeName)
      return name.length >= 2 && (name.includes(stripped) || stripped.includes(name))
    })
    if (byContains !== undefined) {
      return { table: byContains, reason: `「${declaredName}」按「${byContains.typeName}」处理（名称相近）` }
    }
  }

  return undefined
}

/**
 * 核对：声明了但没建表 / 条数不够 / 字段对不上 / 建了却是空表。
 *
 * 只报「设计说了、数据没有」这一向。反向（数据里有一堆设计没提的表）不报——
 * 那常常是复用类型或历史数据，报出来只会变成噪音。
 */
export function checkDataTablePlan(
  requirements: readonly DataTableRequirement[],
  actual: readonly DataTableActual[]
): DataTableCheckResult {
  const issues: DataTableIssue[] = []

  for (const requirement of requirements) {
    const resolved = resolveDataTable(requirement.tableName, actual)
    const table = resolved?.table

    if (table === undefined) {
      issues.push({
        kind: 'missing_table',
        level: 'error',
        table: requirement.tableName,
        message: `设计里要求「${requirement.tableName}」表，数据编辑器里没有这个类型（要新建或改表名对齐）`
      })
      continue
    }

    if (table.count === 0) {
      issues.push({
        kind: 'empty_table',
        level: 'warn',
        table: requirement.tableName,
        message: `「${table.typeName}」表已建但一条数据都没有`,
        typeId: table.typeId,
        gap: requirement.expectedCount ?? undefined
      })
    } else if (requirement.expectedCount !== null) {
      const expected = requirement.expectedCount
      if (table.count < expected) {
        issues.push({
          kind: 'count_short',
          level: 'error',
          table: requirement.tableName,
          message: `「${table.typeName}」期望${requirement.isMinimum ? '至少 ' : ' '}${expected} 条，实际 ${table.count} 条`,
          typeId: table.typeId,
          gap: expected - table.count
        })
      } else if (!requirement.isMinimum && table.count > expected) {
        issues.push({
          kind: 'count_over',
          level: 'warn',
          table: requirement.tableName,
          message: `「${table.typeName}」期望 ${expected} 条，实际 ${table.count} 条（超出 ${table.count - expected} 条，确认是否漏改设计）`
        })
      }
    }

    // 关键字段：键名或中文标签任一对上即可（设计里通常写中文）
    const known = [...table.fieldNames, ...table.fieldLabels]
    const missing = requirement.keyFields.filter((field) => !fieldMatches(field, known))
    if (missing.length > 0) {
      issues.push({
        kind: 'missing_field',
        level: 'error',
        table: requirement.tableName,
        message: `「${table.typeName}」缺字段：${missing.join('、')}`
      })
    }
  }

  return { requirements: [...requirements], issues, ok: issues.length === 0 }
}
