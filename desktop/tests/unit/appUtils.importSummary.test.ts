import { describe, expect, it } from 'vitest'

import { formatImportSummary } from '../../src/renderer/src/appUtils'
import type { ImportSummary } from '../../src/shared/types'

/**
 * 导入结果提示：正常数字 + 两类风险提示。
 *
 * 「没有 id 列」这条必须出现——它意味着每一行都成了新条目，
 * 用户本想改数值却得到整表翻倍。不提示就是静默毁数据。
 */

function summary(overrides: Partial<ImportSummary> = {}): ImportSummary {
  return {
    filePath: '/tmp/a.xlsx',
    totalItems: 3,
    imported: 3,
    updated: 0,
    skipped: 0,
    byType: { role: 3 },
    unknownTypes: {},
    missingIdSources: [],
    ...overrides
  }
}

describe('formatImportSummary', () => {
  it('正常导入只报三个数字', () => {
    const text = formatImportSummary(summary())
    expect(text).toContain('新增 3 条')
    expect(text).toContain('更新 0 条')
    expect(text).toContain('跳过 0 条')
    expect(text).not.toContain('没有 id 列')
  })

  it('有未收录类型键时提示', () => {
    const text = formatImportSummary(summary({ unknownTypes: { potions: 2 } }))
    expect(text).toContain('未收录类型键')
    expect(text).toContain('potions')
  })

  it('没有 id 列时明确提示「会变成重复项」', () => {
    const text = formatImportSummary(summary({ missingIdSources: ['工作表「角色」'] }))
    expect(text).toContain('没有 id 列')
    expect(text).toContain('工作表「角色」')
    expect(text).toContain('重复项')
  })

  it('两类提示同时出现时不互相吞掉', () => {
    const text = formatImportSummary(
      summary({ unknownTypes: { potions: 1 }, missingIdSources: ['CSV「roles」'] })
    )
    expect(text).toContain('未收录类型键')
    expect(text).toContain('CSV「roles」')
  })
})
