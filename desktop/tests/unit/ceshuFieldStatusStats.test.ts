import { describe, expect, it } from 'vitest'

import type { CeshuFieldDef } from '../../src/shared/ceshuConstants'
import type { ChapterFieldStatus } from '../../src/shared/ceshuFieldStatus'
import { countFieldStatuses, formatFieldStatusSummary } from '../../src/shared/ceshuFieldStatusStats'

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
