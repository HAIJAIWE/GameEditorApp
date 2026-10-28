import type { CeshuDocument, ChapterKey } from './ceshuConstants'
import { CESHU_CHAPTER_FIELDS, fieldColumns, fieldLabelOf } from './ceshuFields'
import {
  HANDOFF_DOCS,
  acceptanceCheck,
  acceptanceText,
  planHandoffDocs,
  type HandoffAcceptanceCheck
} from './ceshuHandoff'
import { toRowStrings } from './ceshuPipeRows'

/**
 * 字段变更影响面（改这里会影响什么）。
 *
 * ## 为什么需要
 * 「路线清晰」不只要求知道下一步做什么，还要求**改错了知道改哪里**。
 * 改 `combat.damage_formula` 时，人要知道：哪几份交接文档引用了它、哪条数值断言会失效、
 * 同源的拆分字段（`x_points` / `x_notes`）要不要一起改、会不会牵动数据侧。
 *
 * 这些关系在 `HANDOFF_DOCS` 与 schema 里**已经存在**，本模块只做反向索引，不新增真源。
 *
 * ## 分级（宁可少报，不谎报）
 * - `direct`：文档 `fields` 里**显式**引用了这个字段——确定受影响；
 * - `downstream`：同卷里紧跟在直接文档之后的那一份——需要复核，不一定要改；
 * - 断言：只有**断言文本 / 表达式里出现**该字段 key 或行 key 才算命中，不做语义猜测。
 */

export interface FieldImpactDoc {
  id: string
  path: string
  title: string
  volume: string
  /** 该字段在这份文档里承担什么（引用理由） */
  why: string
  relation: 'direct' | 'downstream'
}

export interface FieldImpactAssertion {
  claim: string
  expr: string
  /** 命中的关键词（字段 key 或行 key） */
  hit: string
}

export interface FieldImpactAcceptance {
  docId: string
  text: string
  check: HandoffAcceptanceCheck
}

export interface FieldImpact {
  chapter: ChapterKey
  field: string
  label: string
  docs: FieldImpactDoc[]
  assertions: FieldImpactAssertion[]
  /** 同源的拆分字段（`x` → `x_points` / `x_notes`，或反向） */
  splitFields: string[]
  acceptance: FieldImpactAcceptance[]
  /** 是否牵动数据侧（要重新核对 schema.json / snapshot.json） */
  affectsData: boolean
}

/**
 * 算一个字段的变更影响面。
 *
 * @param chapter 字段所属章
 * @param field   字段 key（schema 外的扩展键也支持，只是大概率没有引用）
 * @param options.rowKey 该字段某一行/某个参数的名字（如参数表里的「攻击」）；
 *        给了它，才会去数值断言里找引用——否则只按字段 key 匹配，避免瞎猜。
 */
export function analyzeFieldImpact(
  doc: CeshuDocument,
  chapter: ChapterKey,
  field: string,
  options: { rowKey?: string } = {}
): FieldImpact {
  const planned = planHandoffDocs(doc)
  const plannedIds = new Set(planned.map((item) => item.def.id))
  const pathById = new Map(planned.map((item) => [item.def.id, item.path]))

  const direct = HANDOFF_DOCS.filter(
    (def) =>
      plannedIds.has(def.id) &&
      def.fields.some((item) => item.chapter === chapter && item.field === field)
  )

  const docs: FieldImpactDoc[] = direct.map((def) => ({
    id: def.id,
    path: pathById.get(def.id) ?? '',
    title: def.title,
    volume: def.volumeId,
    why: def.fields.find((item) => item.chapter === chapter && item.field === field)?.why ?? '',
    relation: 'direct'
  }))

  // 下游：同卷里紧跟直接文档的那一份（再往后就是连锁，报出来只会制造噪音）
  const directIds = new Set(direct.map((def) => def.id))
  for (const def of direct) {
    const index = planned.findIndex((item) => item.def.id === def.id)
    if (index < 0) continue
    for (let cursor = index + 1; cursor < planned.length; cursor += 1) {
      const candidate = planned[cursor]
      if (candidate.volume.id !== def.volumeId) break
      if (directIds.has(candidate.def.id)) break
      docs.push({
        id: candidate.def.id,
        path: candidate.path,
        title: candidate.def.title,
        volume: candidate.volume.id,
        why: '排在受影响文档之后，需要复核是否受同一改动影响',
        relation: 'downstream'
      })
      break
    }
  }

  // 断言：只认「文本里出现关键词」，不做语义猜测
  const needles = new Set<string>([field])
  if (options.rowKey !== undefined && options.rowKey.trim() !== '') needles.add(options.rowKey.trim())
  const assertions: FieldImpactAssertion[] = []
  const assertionRows = toRowStrings(
    doc.numeric?.numeric_assertions ?? [],
    fieldColumns('numeric', 'numeric_assertions')
  )
  for (const row of assertionRows) {
    const cells = row.split('|').map((cell) => cell.trim())
    const claim = cells[0] ?? ''
    const expr = cells[1] ?? ''
    const haystack = `${claim} ${expr}`
    const hit = [...needles].find((needle) => needle !== '' && haystack.includes(needle))
    if (hit !== undefined) assertions.push({ claim, expr, hit })
  }

  // 同源拆分字段：`x` ↔ `x_points` / `x_notes`（字段契约里最容易被漏改的一对）
  const keys = (CESHU_CHAPTER_FIELDS[chapter] ?? []).map((item) => item.key)
  const base = field.replace(/_(points|notes)$/, '')
  const splitFields = keys.filter((key) => key !== field && (key === base || key.startsWith(`${base}_`)))

  const acceptance: FieldImpactAcceptance[] = direct.flatMap((def) =>
    def.acceptance.map((entry) => ({
      docId: def.id,
      text: acceptanceText(entry),
      check: acceptanceCheck(entry)
    }))
  )

  return {
    chapter,
    field,
    label: fieldLabelOf(chapter, field),
    docs,
    assertions,
    splitFields,
    acceptance,
    // 目前只有「数据表声明」会直接改变数据侧形状；其余字段改了不重生成 schema
    affectsData: chapter === 'tech' && field === 'data_tables'
  }
}

/**
 * 影响面 → Markdown（面板/报告直接贴）。
 *
 * 顺序按「必须改 → 复核 → 会失效 → 一起改 → 数据侧 → 重新判定」排，
 * 因为改字段时人的第一个问题是「我现在必须动哪些」。
 */
export function renderFieldImpactMarkdown(impact: FieldImpact): string {
  const lines: string[] = []
  lines.push(`### 改「${impact.label}」会影响什么`)
  lines.push('')

  const direct = impact.docs.filter((item) => item.relation === 'direct')
  const downstream = impact.docs.filter((item) => item.relation === 'downstream')

  if (direct.length === 0 && downstream.length === 0) {
    lines.push('- 没有交接文档直接引用这个字段（改它不影响施工文档）。')
  }
  if (direct.length > 0) {
    lines.push('**必须改（直接引用）**')
    lines.push('')
    for (const item of direct) lines.push(`- \`${item.path}\` — ${item.why}`)
    lines.push('')
  }
  if (downstream.length > 0) {
    lines.push('**复核即可（下游）**')
    lines.push('')
    for (const item of downstream) lines.push(`- \`${item.path}\` — ${item.why}`)
    lines.push('')
  }
  if (impact.assertions.length > 0) {
    lines.push('**会失效的数值断言**')
    lines.push('')
    for (const item of impact.assertions) {
      lines.push(`- ${item.claim}：\`${item.expr}\`（命中：${item.hit}）`)
    }
    lines.push('')
  }
  if (impact.splitFields.length > 0) {
    lines.push('**同源字段（通常要一起改）**')
    lines.push('')
    for (const key of impact.splitFields) lines.push(`- \`${key}\``)
    lines.push('')
  }
  if (impact.affectsData) {
    lines.push('**数据侧**')
    lines.push('')
    lines.push('- 会改变数据表结构：需要重新生成 `schema.json` 与 `data/snapshot.json`。')
    lines.push('')
  }
  if (impact.acceptance.length > 0) {
    lines.push('**会重新判定的验收条目**')
    lines.push('')
    for (const item of impact.acceptance) {
      const tag =
        item.check === 'assertion'
          ? '（判定：contract.json 断言）'
          : item.check === 'test'
            ? '（判定：自动化测试）'
            : ''
      lines.push(`- [ ] ${item.text}${tag}`)
    }
    lines.push('')
  }
  return lines.join('\n')
}
