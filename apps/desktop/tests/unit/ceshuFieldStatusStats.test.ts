import { describe, expect, it } from 'vitest'

import type { CeshuDocument, CeshuFieldDef } from '@mobai/shared/ceshu/reference'
import type { ChapterFieldStatus } from '@mobai/shared/ceshu/fields'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { countDocPendingFields, countFieldStatuses, formatFieldStatusSummary } from '@mobai/shared/ceshu/fields'

/** 只关心 key：统计逻辑不读 label/kind */
function field(key: string): CeshuFieldDef {
  return { key, label: key, kind: 'text' }
}

const FIELDS: readonly CeshuFieldDef[] = [field('positioning'), field('tags'), field('game_name')]

function statusTable(entries: Record<string, 'ai_draft' | 'human_edited' | 'approved'>): ChapterFieldStatus {
  const table: ChapterFieldStatus = {}
  for (const [key, status] of Object.entries(entries)) {
    table[key] = { status, at: '2024-01-01T00:00:00.000Z' }
  }
  return table
}

describe('countFieldStatuses：按 schema 统计', () => {
  it('三种状态分别计数', () => {
    const counts = countFieldStatuses(
      statusTable({ positioning: 'ai_draft', tags: 'human_edited', game_name: 'approved' }),
      FIELDS
    )
    expect(counts).toEqual({ ai_draft: 1, human_edited: 1, approved: 1 })
  })

  it('只计 schema 内字段，忽略状态表里的未知/扩展字段', () => {
    const counts = countFieldStatuses(
      statusTable({ positioning: 'ai_draft', legacy_field: 'approved', template_extra: 'human_edited' }),
      FIELDS
    )
    expect(counts).toEqual({ ai_draft: 1, human_edited: 0, approved: 0 })
  })

  it('无记录（undefined / 空表）全为零', () => {
    expect(countFieldStatuses(undefined, FIELDS)).toEqual({ ai_draft: 0, human_edited: 0, approved: 0 })
    expect(countFieldStatuses({}, FIELDS)).toEqual({ ai_draft: 0, human_edited: 0, approved: 0 })
  })
})

describe('formatFieldStatusSummary：摘要文案', () => {
  it('全零返回空串（组件据此不渲染）', () => {
    expect(formatFieldStatusSummary({ ai_draft: 0, human_edited: 0, approved: 0 })).toBe('')
  })

  it('只显示非零项', () => {
    expect(formatFieldStatusSummary({ ai_draft: 2, human_edited: 0, approved: 5 })).toBe('2 待审 · 5 已批准')
    expect(formatFieldStatusSummary({ ai_draft: 0, human_edited: 3, approved: 0 })).toBe('3 人改')
  })

  it('顺序固定为 待审 → 人改 → 已批准', () => {
    expect(formatFieldStatusSummary({ ai_draft: 2, human_edited: 3, approved: 5 })).toBe('2 待审 · 3 人改 · 5 已批准')
  })
})

/** 造一份带 `meta.field_status` 的真实文档（走默认文档，保证 schema 与生产一致） */
function docWithStatus(fieldStatus: Record<string, Record<string, 'ai_draft' | 'human_edited' | 'approved'>>): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full' })
  const chapters: Record<string, ChapterFieldStatus> = {}
  for (const [chapter, entries] of Object.entries(fieldStatus)) {
    chapters[chapter] = statusTable(entries)
  }
  doc.meta.field_status = chapters
  return doc
}

describe('countDocPendingFields：全文档待审数', () => {
  it('多章累加（meta + vision + gameplay）', () => {
    const doc = docWithStatus({
      meta: { game_name: 'ai_draft', positioning: 'ai_draft' },
      vision: { design_vision: 'ai_draft' },
      gameplay: { core_loop: 'ai_draft' }
    })
    expect(countDocPendingFields(doc)).toBe(4)
  })

  it('只计 schema 内字段，非 ai_draft 状态不计', () => {
    const doc = docWithStatus({
      meta: { game_name: 'ai_draft', legacy_field: 'ai_draft' },
      vision: { design_vision: 'human_edited', differentiation: 'approved' },
      // 整个章节都不在 schema 里的扩展键
      unknown_chapter: { whatever: 'ai_draft' }
    })
    expect(countDocPendingFields(doc)).toBe(1)
  })

  it('无 field_status（或为空表）时为 0', () => {
    const doc = createDefaultCeshu({ scope: 'full' })
    expect(countDocPendingFields(doc)).toBe(0)
    doc.meta.field_status = {}
    expect(countDocPendingFields(doc)).toBe(0)
  })
})
