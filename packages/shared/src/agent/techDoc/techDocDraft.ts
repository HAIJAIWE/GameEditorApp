import type { CeshuDocument } from '../../ceshu/reference'
import { chapterDataForDoc, chapterFieldsForDoc, chapterLabelForDoc } from '../../ceshu/model'
import { displayFieldValue } from '../../ceshu/fields'
import { TECH_DOC_GDD_INPUTS, TECH_DOC_SECTIONS, techDocOutline } from './techDocSchema'

/**
 * 从策划书（GDD）生成**技术设计文档草稿**：把 TDD 9 章大纲 + 对应 GDD 章的已填字段拼成初稿。
 *
 * 依据 `docs/game-doc-corpus-2026.md`：gamedesigning.org 的 GDD=what / TDD=how、
 * 机核 2026 的 GDD/TDD/SDD 三分、《通关游戏设计之道》书摘「技术需求很多内容会放在 TDD 里」。
 * 上轮已把「TDD 章 → GDD 素材章」映射写进 `TECH_DOC_GDD_INPUTS`，这里把映射真正用起来：
 * 此前 `system.tech_doc` 的 outline 只给空骨架，GDD 内容一个字都没进 TDD。
 *
 * 定位：**草稿 / 素材汇集，不是让 AI 凭空写实现方案**。每段都标注来源章节，
 * 由人（或后续 AI 展开）补架构与接口细节。零 LLM 调用、零预算门，纯函数可测。
 */
export interface TechDocDraft {
  markdown: string
  /** 从 GDD 摘出的字段条数（0 = 当前文档没有可用素材） */
  sourcedFields: number
  /** 参与摘录的 GDD 章节 */
  sourceChapters: string[]
}

/** TDD 章 → 该章要读的 GDD 章 key（与 TECH_DOC_GDD_INPUTS 的文字说明对齐） */
const SECTION_CHAPTER_KEYS: Readonly<Record<string, readonly string[]>> = {
  overview: ['vision', 'meta'],
  architecture: ['systems', 'tech'],
  modules: ['systems', 'gameplay'],
  'data-model': ['tech', 'numeric', 'economy'],
  interfaces: ['tech'],
  flows: ['gameplay', 'systems'],
  dependencies: ['tech', 'performance'],
  risks: ['risk_handling', 'tech'],
  milestones: ['tech', 'mvp']
}

/** 每章最多摘录的字段数，避免草稿过长 */
const MAX_FIELDS_PER_SECTION = 8

/**
 * AI 分节生成时单条素材值的截断长度。
 *
 * 草稿是给人看的，AI 生成是给模型看的：一条「数据表」值可能长到几百行 pipeList，
 * 原样塞进提示词会先吃掉预算、再把真正的写作要求挤到窗口边缘（本仓踩过）。
 */
const MAX_MATERIAL_VALUE_CHARS = 600

/** AI 分节生成可用的 GDD 素材条：与草稿同一份映射，但上限更宽 */
const MAX_AI_MATERIALS_PER_SECTION = 16

/** 给 AI 提示词用的一条素材（与 techDocPrompt 的 TechDocSectionMaterials 同形） */
export interface TechDocMaterial {
  label: string
  chapter: string
  value: string
}

/**
 * 取出某个 TDD 节对应的 GDD 素材（供 **AI 分节生成** 用）。
 *
 * 与草稿的区别：上限更宽（16 条 vs 8 条）、单条值截断到 600 字、丢掉空值。
 * 单条值截断是刻意的：pipeList 字段（数据表 / 数值断言）原样进 prompt 能把预算吃光，
 * 真正常用的信息（表名、列名、量级）在前 600 字里。
 */
export function techDocSectionMaterials(doc: CeshuDocument, sectionId: string): TechDocMaterial[] {
  const keys = SECTION_CHAPTER_KEYS[sectionId.trim()] ?? []
  const materials: TechDocMaterial[] = []
  for (const key of keys) {
    const fields = chapterFieldsForDoc(doc, key)
    if (fields.length === 0) continue
    const data = chapterDataForDoc(doc, key)
    const chapter = chapterLabelForDoc(doc, key)
    for (const field of fields) {
      if (materials.length >= MAX_AI_MATERIALS_PER_SECTION) return materials
      const value = displayFieldValue(field, data[field.key]).trim()
      if (value === '') continue
      materials.push({
        label: field.label,
        chapter,
        value: value.length > MAX_MATERIAL_VALUE_CHARS ? `${value.slice(0, MAX_MATERIAL_VALUE_CHARS)}…` : value
      })
    }
  }
  return materials
}

/** 从 TDD 全文按二级标题切出「已写完的其它节」，供分节生成做交叉引用 */
export function parseTechDocSections(markdown: string): Array<{ title: string; body: string }> {
  const lines = markdown.split(/\r?\n/)
  const sections: Array<{ title: string; body: string }> = []
  let title: string | null = null
  let body: string[] = []
  const flush = (): void => {
    if (title !== null) sections.push({ title, body: body.join('\n').trim() })
  }
  for (const line of lines) {
    const heading = /^##\s+(.*\S)\s*$/.exec(line)
    if (heading !== null && !line.startsWith('###')) {
      flush()
      title = heading[1] ?? ''
      body = []
      continue
    }
    if (title !== null) body.push(line)
  }
  flush()
  return sections
}

export function buildTechDocDraft(doc: CeshuDocument, title: string): TechDocDraft {
  const outline = techDocOutline()
  const lines: string[] = [`# ${title}`, '', '> 由策划书素材生成的技术设计文档草稿；实现细节待补。', '']
  const sourceChapters = new Set<string>()
  let sourcedFields = 0

  for (const section of TECH_DOC_SECTIONS) {
    const mapping = TECH_DOC_GDD_INPUTS.find((item) => item.section === section.title)
    lines.push(`## ${section.title}`, '')
    lines.push(`> ${section.guidance}`, '')
    if (mapping !== undefined) lines.push(`> 素材：${mapping.chapters}`, '')

    const keys = SECTION_CHAPTER_KEYS[section.id] ?? []
    const entries: string[] = []
    for (const key of keys) {
      const fields = chapterFieldsForDoc(doc, key)
      if (fields.length === 0) continue // 该章不属于当前文档档位
      const data = chapterDataForDoc(doc, key)
      const label = chapterLabelForDoc(doc, key)
      for (const field of fields) {
        if (entries.length >= MAX_FIELDS_PER_SECTION) break
        const value = displayFieldValue(field, data[field.key])
        if (value === '') continue
        entries.push(`- **${field.label}**（来自 ${label}）：${value}`)
        sourceChapters.add(label)
        sourcedFields++
      }
      if (entries.length >= MAX_FIELDS_PER_SECTION) break
    }
    lines.push(...(entries.length > 0 ? entries : ['（待补：本段暂无 GDD 素材，需人工填写实现细节）']))
    lines.push('')
  }

  lines.push('## 来源小节', '')
  if (sourceChapters.size === 0) {
    lines.push('（未取到 GDD 素材，请先填写策划书相关小节）', '')
  } else {
    for (const label of [...sourceChapters]) lines.push(`- ${label}`)
    lines.push('')
  }
  lines.push('---', '', outline, '')
  return { markdown: lines.join('\n'), sourcedFields, sourceChapters: [...sourceChapters] }
}
