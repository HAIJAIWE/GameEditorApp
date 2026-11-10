import type { CeshuDocument } from '../reference'
import { displayFieldValue } from '../fields'
import {
  chapterDataForDoc,
  chapterFieldsForDoc,
  chapterLabelForDoc,
  requiredFieldsForDoc,
  visibleChaptersForDoc
} from '../model'
import { isMachineDataField } from '../workflow'

/**
 * 生成结果速览（2026-11-11）：把「一页预览」真正压成一页。
 *
 * 背景：`renderOnePageSummary` 是「立项阶段完备度清单」，会把每个章的**全部必填字段**
 * 逐条列出（空 → 「（待填）」）。制作档 15 章实测 34261 字符 / 中文 19864 字 / 7 个 `###` 小节，
 * 早就不是「一页」，渲染层却把它整个塞进 `<pre>`。本函数只回答「这次写了什么」：
 * 只摘**已有内容**的章、每章最多 2 个字段（必填优先）、单值压成一行并截断、全文设字符预算。
 *
 * 与 `renderOnePageSummary` 分工明确：后者是导出格式（onepage）与一页总览的同口径清单，
 * 必须保留空字段占位；本函数只给一键生成面板做应用前确认，不改动任何导出产物。
 */
export interface GenerationDigestOptions {
  /** 只看这些章（默认：文档可见章）。生成面板传 plan.order 以贴合本次实际生成范围。 */
  chapters?: readonly string[]
  /** 单字段值最多保留的字符数，默认 88 */
  maxFieldChars?: number
  /** 每章最多展示几个字段，默认 2 */
  maxFieldsPerChapter?: number
  /** 正文字符预算（不含头部摘要），默认 1400，约一屏 A4 */
  maxTotalChars?: number
}

const NL = String.fromCharCode(10)

/** 把字段值压成一行：去掉列表符号 / markdown 强调、折叠空白，超长截断 */
function clipDigestValue(value: string, max: number): string {
  const flat = value
    .split(NL)
    .map((line) => line.trim().replace(/^[\-*·•>#]+\s*/, '').replace(/\*\*/g, ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
  return flat.length <= max ? flat : flat.slice(0, max) + '…'
}

export function renderGenerationDigest(
  doc: CeshuDocument,
  options: GenerationDigestOptions = {}
): string {
  const chapters = options.chapters ?? visibleChaptersForDoc(doc)
  const maxFieldChars = options.maxFieldChars ?? 88
  const maxFieldsPerChapter = options.maxFieldsPerChapter ?? 2
  const maxTotalChars = options.maxTotalChars ?? 1400
  const blocks: string[] = []
  let used = 0
  let omitted = 0

  for (const chapter of chapters) {
    const data = chapterDataForDoc(doc, chapter)
    const required = new Set(requiredFieldsForDoc(doc, chapter))
    const filled = chapterFieldsForDoc(doc, chapter)
      .filter((field) => !isMachineDataField(chapter, field.key))
      .map((field) => ({ field, value: displayFieldValue(field, data[field.key]) }))
      .filter((entry) => entry.value !== '')
    if (filled.length === 0) continue
    // 必填优先，让用户先看到「这一章最该有的东西」；同组内保持字段表原顺序
    const picked = [
      ...filled.filter((entry) => required.has(entry.field.key)),
      ...filled.filter((entry) => !required.has(entry.field.key))
    ].slice(0, maxFieldsPerChapter)
    const lines = picked.map(
      (entry) => '- **' + entry.field.label + '**：' + clipDigestValue(entry.value, maxFieldChars)
    )
    const block = '### ' + chapterLabelForDoc(doc, chapter) + NL + NL + lines.join(NL)
    if (used > 0 && used + block.length > maxTotalChars) {
      omitted += 1
      continue
    }
    blocks.push(block)
    used += block.length
  }

  if (blocks.length === 0) return ''
  const head = '> 已速览 ' + blocks.length + ' 章 · 约 ' + used + ' 字（生成结果尚未写盘）'
  const tail = omitted > 0
    ? NL + NL + '> 另有 ' + omitted + ' 章未展开；应用并保存后可在文档或导出中查看全文。'
    : ''
  return head + NL + NL + blocks.join(NL + NL) + tail
}
