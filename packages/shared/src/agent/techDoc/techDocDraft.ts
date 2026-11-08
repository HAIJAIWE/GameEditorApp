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
