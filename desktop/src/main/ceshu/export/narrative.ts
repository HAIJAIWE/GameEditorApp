import {
  CHAPTER_LABELS,
  enabledModuleChapters,
  type CeshuDocument,
  type ChapterData,
  type ChapterKey
} from '../../../shared/ceshu/reference/ceshuConstants'
import { formatLocalTimestamp, getGameType, getGddScope, deriveRulesetId } from '../../../shared/ceshu/model/ceshuModel'
import {
  chapterHeading,
  classifySystems,
  fieldLabel,
  formatFieldValue,
  isEmptyValue,
  orderedFieldEntries,
  pipeTable,
  visibleChapterEntries
} from './common'

/**
 * 叙事版导出：把 24 章的字段重排成「设计首页 → 走读 → 架构 → 机制 → 数值 → MVP → 原型 → 变更」，
 * 其余章（美术/音频/技术/运营/埋点/发行/性能…）进「附录：模块细节」。
 *
 * 为什么需要它：工作版 / 交付版按 24 章平铺，读起来像 checklist；这一版按叙事组织，
 * 让策划书「像设计文档」而不是「字段表格」。数值仍与 GDD 同源，不重算。
 */

/** 首页抽取的字段（顺序即阅读顺序） */
const HOME_FIELDS: ReadonlyArray<readonly [ChapterKey, string]> = [
  ['meta', 'positioning'],
  ['vision', 'user_personas.primary'],
  ['vision', 'user_personas.secondary'],
  ['vision', 'design_vision'],
  ['vision', 'design_pillars'],
  ['gameplay', 'core_loop'],
  ['meta', 'non_goals']
]

/** 正文「核心机制」展开的章；其余章进模块附录 */
const MECHANIC_CHAPTERS: readonly ChapterKey[] = ['gameplay', 'combat', 'systems', 'economy']

/** 已在正文其他段用过的章（模块附录不再重复） */
const NARRATIVE_CHAPTERS = new Set<ChapterKey>(['meta', 'vision', 'numeric', 'mvp', ...MECHANIC_CHAPTERS])

export function renderCeshuNarrative(doc: CeshuDocument): string {
  const blocks = [
    renderHome(doc),
    renderWalkthrough(doc),
    renderArchitecture(doc),
    renderMechanics(doc),
    renderNumeric(doc),
    renderMvp(doc),
    renderPrototype(doc),
    renderChangelog(doc),
    renderModuleAppendix(doc)
  ].filter((block) => block.trim() !== '')
  return blocks.join('\n\n---\n\n') + '\n'
}

function renderHome(doc: CeshuDocument): string {
  const name = readString(doc.meta.game_name) || '未命名策划书'
  const lines = [
    `# ${name}`,
    '',
    `> 版本: ${doc.version_label || 'v1.0'} | 类型: ${readString(doc.meta.game_type) || '—'} | 日期: ${formatLocalTimestamp().slice(0, 10)}`
  ]
  for (const [chapter, field] of HOME_FIELDS) {
    const value = (doc[chapter] as ChapterData)[field]
    if (isEmptyValue(value)) continue
    lines.push('', ...renderField(chapter, field, value))
  }
  return lines.join('\n')
}

function renderWalkthrough(doc: CeshuDocument): string {
  const lines = ['## 玩法走读']
  const playthrough = doc.gameplay.playthrough_120s
  if (!isEmptyValue(playthrough)) {
    lines.push('', '### 120 秒走读', '', ...renderValue('gameplay', 'playthrough_120s', playthrough))
  }
  const first30 = doc.gameplay.first_30_min
  if (!isEmptyValue(first30)) {
    lines.push('', '### 新手体验（前 30 分钟）', '', ...renderValue('gameplay', 'first_30_min', first30))
  }
  return lines.length > 1 ? lines.join('\n') : ''
}

function renderArchitecture(doc: CeshuDocument): string {
  const lines = ['## 玩法架构']
  const loopLayers = doc.gameplay.loop_three_layers
  if (!isEmptyValue(loopLayers)) {
    lines.push('', '### 三层循环', '', ...renderValue('gameplay', 'loop_three_layers', loopLayers))
  }
  const stateMachine = doc.gameplay.state_machine
  if (!isEmptyValue(stateMachine)) {
    lines.push('', '### 状态机', '', ...renderValue('gameplay', 'state_machine', stateMachine))
  }
  const systems = renderSystemsTable(doc.systems)
  if (systems.length > 0) lines.push('', '### 游戏系统', '', ...systems)
  return lines.length > 1 ? lines.join('\n') : ''
}

function renderMechanics(doc: CeshuDocument): string {
  const lines = ['## 核心机制']
  for (const chapter of MECHANIC_CHAPTERS) {
    const data = doc[chapter]
    if (!data) continue
    const entries = orderedFieldEntries(chapter, data)
    if (entries.length === 0) continue
    lines.push('', `### ${CHAPTER_LABELS[chapter]}`)
    for (const [field, value] of entries) lines.push('', ...renderField(chapter, field, value))
  }
  return lines.length > 1 ? lines.join('\n') : ''
}

function renderNumeric(doc: CeshuDocument): string {
  const entries = orderedFieldEntries('numeric', doc.numeric)
  if (entries.length === 0) return ''
  const lines = ['## 数值设计']
  for (const [field, value] of entries) lines.push('', ...renderField('numeric', field, value))
  return lines.join('\n')
}

function renderMvp(doc: CeshuDocument): string {
  const entries = orderedFieldEntries('mvp', doc.mvp)
  if (entries.length === 0) return ''
  const lines = ['## 首个可玩范围（MVP）']
  for (const [field, value] of entries) lines.push('', ...renderField('mvp', field, value))
  return lines.join('\n')
}

function renderPrototype(doc: CeshuDocument): string {
  const lines = ['## 原型验证']
  // 规则集标识显式写进正文：文档、契约、Demo 三方引用的是否同一套规则，要能一眼对上
  lines.push('', `> 规则集：\`${deriveRulesetId(doc)}\`（原型 Demo 应引用同一标识）`)
  const acceptance = doc.qa.prototype_acceptance
  if (isEmptyValue(acceptance)) {
    lines.push('', '(暂无原型验收记录；请在「测试与质量保障」章填写 `prototype_acceptance`。)')
  } else {
    lines.push('', ...renderField('qa', 'prototype_acceptance', acceptance))
  }
  if (!isEmptyValue(doc.demo_html)) {
    lines.push('', '> 可玩 Demo 已生成（`prototype/demo.html`）；结论以真机运行为准，截图描述不算证据。')
  }
  return lines.join('\n')
}

function renderChangelog(doc: CeshuDocument): string {
  return ['## 变更记录', '', `- 版本：${doc.version_label || 'v1.0'}`, `- 更新：${doc.updated_at || '—'}`].join('\n')
}

function renderModuleAppendix(doc: CeshuDocument): string {
  const entries = visibleChapterEntries(getGddScope(doc), getGameType(doc), enabledModuleChapters(doc))
  const lines = ['## 附录：模块细节']
  let any = false
  for (const entry of entries) {
    if (NARRATIVE_CHAPTERS.has(entry.key)) continue
    const data = doc[entry.key]
    if (!data) continue
    const fields = orderedFieldEntries(entry.key, data)
    if (fields.length === 0) continue
    any = true
    lines.push('', `### ${chapterHeading(entry)}`)
    for (const [field, value] of fields) lines.push('', ...renderField(entry.key, field, value))
  }
  return any ? lines.join('\n') : ''
}

/* ---------------- helpers ---------------- */

/** 字段 → `**标签**: 值`（pipeList 有列定义时渲染成 Markdown 表） */
function renderField(chapter: ChapterKey, field: string, value: unknown): string[] {
  const label = fieldLabel(chapter, field)
  const table = pipeTable(chapter, field, value)
  if (table !== null) {
    return [
      `**${label}**:`,
      '',
      `| ${table.headers.map(mdCell).join(' | ')} |`,
      `| ${table.headers.map(() => '---').join(' | ')} |`,
      ...table.rows.map((row) => `| ${row.map(mdCell).join(' | ')} |`),
      ''
    ]
  }
  const formatted = formatFieldValue(value)
  return formatted.includes('\n')
    ? [`**${label}**:`, ...formatted.split('\n').filter((line) => line.trim() !== '')]
    : [`**${label}**: ${formatted}`]
}

/** 字段值本身（不带标签；小节标题已经承担了标签职责） */
function renderValue(chapter: ChapterKey, field: string, value: unknown): string[] {
  const table = pipeTable(chapter, field, value)
  if (table !== null) {
    return [
      `| ${table.headers.map(mdCell).join(' | ')} |`,
      `| ${table.headers.map(() => '---').join(' | ')} |`,
      ...table.rows.map((row) => `| ${row.map(mdCell).join(' | ')} |`)
    ]
  }
  return formatFieldValue(value)
    .split('\n')
    .filter((line) => line.trim() !== '')
}

function renderSystemsTable(data: Record<string, unknown> | undefined): string[] {
  const [enabled, disabled] = classifySystems(data)
  if (enabled.length === 0 && disabled.length === 0) return []
  const lines = ['| 系统 | 状态 | 数据类型 | 名称 |', '|---|---|---|---|']
  for (const [id, item] of enabled) {
    lines.push(`| ${id} | ✅ 启用 | ${readString(item.data_type) || id} | ${readString(item.name) || id} |`)
  }
  for (const [id, item] of disabled) {
    lines.push(`| ${id} | ⬜ 未启用 | ${readString(item.data_type) || id} | ${readString(item.name) || id} |`)
  }
  return lines
}

function mdCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
