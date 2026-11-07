import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import { chapterAnchorOf } from '@mobai/shared/ceshu/reference'
import { chapterDataForDoc, chapterFieldsForDoc, chapterLabelForDoc } from '@mobai/shared/ceshu/model'
import { orderedFieldEntriesForDoc, pipeTableForDoc } from '../common'
import { formatFieldValue } from '../common'

/**
 * Art Bible（美术圣经）独立交付物。
 *
 * 依据 `docs/game-doc-corpus-2026.md`：行业里 Art Bible 是**独立文档**而非 GDD 里的一节——
 * 百度文库《游戏研发项目管理制度》定义它「规定色彩体系、UI 组件库、角色设计规范」；
 * openagenticgame-gdd 把「资产管线与命名规范」单列 `10.10` 并配资产元数据 schema；
 * aeno.nl 的 Art-bible.pdf 是独立 PDF。本项目的 `art` 章其实已含这些字段
 * （色彩体系 / 字体 / 角色 / 场景 / UI 语言 / 动画 / 多分辨率 / 资产规格含命名规则），
 * 只是没有一个单独发给美术/外包的出口 ⇒ 这里把既有字段重新组织成独立交付物，不造新数据。
 *
 * 应用档（SDD）没有 `art` 章，导出为空提示。
 */
export function renderCeshuArtBible(doc: CeshuDocument): string {
  const meta = doc.meta as Record<string, unknown>
  const rawName = typeof meta.game_name === 'string' && meta.game_name.trim() !== '' ? meta.game_name : meta.project_name
  const name = typeof rawName === 'string' && rawName.trim() !== '' ? rawName.trim() : '未命名项目'

  const lines: string[] = [
    `# 《${name}》· Art Bible（美术圣经）`,
    '',
    '> 用途：交给美术 / 外包的一致性基准。风格、色彩、字体、角色、场景、UI、动画、资产规格一处定死。',
    '> 独立交付物：与 GDD 的「美术设计」章同源，改 GDD 后请重新导出本文件。',
    ''
  ]

  const data = chapterDataForDoc(doc, 'art')
  const fields = chapterFieldsForDoc(doc, 'art')
  if (fields.length === 0) {
    lines.push('（当前文档为应用档，无美术设计章，不产出 Art Bible。）', '')
    return lines.join('\n')
  }

  const entries = orderedFieldEntriesForDoc(doc, 'art', data)
  if (entries.length === 0) {
    lines.push('（美术设计章暂无内容，导出为空骨架）', '')
  }

  for (const [key, value] of entries) {
    const field = fields.find((item) => item.key === key)
    const label = field?.label ?? key
    lines.push(`## ${label}`, '')
    const table = pipeTableForDoc(doc, 'art', key, value)
    if (table !== null) {
      lines.push(`| ${table.headers.join(' | ')} |`)
      lines.push(`| ${table.headers.map(() => '---').join(' | ')} |`)
      for (const row of table.rows) lines.push(`| ${row.join(' | ')} |`)
    } else {
      const formatted = formatFieldValue(value, { bullet: '- ' })
      lines.push(formatted)
    }
    lines.push('')
  }

  // 未填字段也要留位置，方便美术对照「哪些还没定」
  const filled = new Set(entries.map(([key]) => key))
  const missing = fields.filter((field) => !filled.has(field.key))
  if (missing.length > 0) {
    lines.push('## 待定项', '')
    for (const field of missing) lines.push(`- ${field.label}（待定）`)
    lines.push('')
  }

  lines.push('## 来源章节', '')
  lines.push(`- ${chapterLabelForDoc(doc, 'art')}（gdd.md#${chapterAnchorOf('art')}）`)
  lines.push('')
  return lines.join('\n')
}
