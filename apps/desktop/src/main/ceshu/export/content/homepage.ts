import {
  type CeshuDocument,
  type ChapterData,
  type ChapterKey
} from '@mobai/shared/ceshu/reference'
import { formatLocalTimestamp, deriveRulesetId } from '@mobai/shared/ceshu/model'
import {
  fieldLabel,
  formatFieldValue,
  isEmptyValue,
  pipeTable
} from '../common'

/**
 * 设计首页导出（2026-11-03，GDD 改造 L1-2）。
 *
 * 把策划书压成一页「能拿得出手」的立项 pitch：定位 → 目标玩家 → 核心幻想 → 设计支柱（表）→
 * 一句话循环 → 范围与非目标。区别于 `narrative`（首页+走读+架构+机制+…+附录）与 `onepage`
 * （按章必填清单），homepage 只产出这一页首页，方便单独发给他人 / 路演。
 *
 * 字段口径与 `narrative.renderHome` 一致（同一份 `HOME_FIELDS`），但作为独立格式出口，
 * 不复用 narrative 的内部函数，避免交叉依赖；渲染逻辑按 narrative 的同款写法复刻，行为对齐。
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

export function renderCeshuHomepage(doc: CeshuDocument): string {
  const name = readString(doc.meta.game_name) || '未命名策划书'
  const lines = [
    `# 《${name}》· 设计首页`,
    '',
    `> 版本: ${doc.version_label || 'v1.0'} | 类型: ${readString(doc.meta.game_type) || '—'} | 日期: ${formatLocalTimestamp().slice(0, 10)} | 规则集: ${deriveRulesetId(doc)}`
  ]
  for (const [chapter, field] of HOME_FIELDS) {
    const value = (doc[chapter] as ChapterData)[field]
    if (isEmptyValue(value)) continue
    lines.push('', ...renderField(chapter, field, value))
  }
  return lines.join('\n') + '\n'
}

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

function mdCell(text: string): string {
  return text.replace(/\|/g, '\\|').replace(/\n+/g, ' ')
}

function readString(value: unknown): string {
  return typeof value === 'string' ? value : ''
}
