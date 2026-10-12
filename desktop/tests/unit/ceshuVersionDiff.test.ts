import { describe, expect, it } from 'vitest'

import type { CeshuDocument } from '../../src/shared/ceshu/ceshuConstants'
import {
  buildVersionDiff,
  buildVersionDiffMarkdown,
  chapterTotalChanges,
  formatDiffValue,
  versionDiffTotalChanges
} from '../../src/shared/ceshu/ceshuDiff'
import { createDefaultCeshu } from '../../src/shared/ceshu/ceshuModel'

function makeDoc(name = 'A'): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', name })
}

function chapterOf(doc: CeshuDocument, other: CeshuDocument, chapter: string) {
  const diff = buildVersionDiff(doc, other)
  const found = diff.chapter_diffs.find((item) => item.chapter_key === chapter)
  if (!found) throw new Error(`未找到章节 ${chapter}`)
  return { diff, chapter: found }
}

function fieldOf(doc: CeshuDocument, other: CeshuDocument, chapter: string, label: string) {
  const { chapter: chapterDiff } = chapterOf(doc, other, chapter)
  const found = chapterDiff.field_diffs.find((item) => item.field_label === label)
  if (!found) throw new Error(`未找到字段 ${label}`)
  return found
}

describe('版本对比：章节级 Diff（匹平 Python compute_version_diff）', () => {
  it('同一文档对比：17 章全无变更，未变字段数等于各章未变数之和', () => {
    const doc = makeDoc()
    const diff = buildVersionDiff(doc, doc)
    expect(diff.chapter_diffs).toHaveLength(17)
    expect(diff.total_added).toBe(0)
    expect(diff.total_removed).toBe(0)
    expect(diff.total_modified).toBe(0)
    expect(versionDiffTotalChanges(diff)).toBe(0)
    expect(diff.total_unchanged).toBeGreaterThan(0)
    expect(diff.total_unchanged).toBe(
      diff.chapter_diffs.reduce((sum, chapter) => sum + chapter.unchanged_count, 0)
    )
    // 相等章节短路：不产出字段明细
    for (const chapter of diff.chapter_diffs) {
      expect(chapter.field_diffs).toHaveLength(0)
      expect(chapterTotalChanges(chapter)).toBe(0)
    }
  })

  it('修改单字段：modified 1，未变数减少 1，字段路径与旧新值正确', () => {
    const a = makeDoc('A')
    const b = structuredClone(a)
    b.meta.game_name = 'B'

    const { diff, chapter } = chapterOf(a, b, 'meta')
    expect(diff.total_modified).toBe(1)
    expect(diff.total_added).toBe(0)
    expect(diff.total_removed).toBe(0)
    expect(chapter.modified_count).toBe(1)
    expect(chapterTotalChanges(chapter)).toBe(1)
    // 未变数 = 相等场景下该章未变数 - 1
    expect(chapter.unchanged_count).toBe(chapterOf(a, a, 'meta').chapter.unchanged_count - 1)

    const field = fieldOf(a, b, 'meta', 'game_name')
    expect(field).toMatchObject({
      field_path: 'meta.game_name',
      field_label: 'game_name',
      old_value: 'A',
      new_value: 'B',
      diff_type: 'modified'
    })
  })

  it('空值 → 有值算新增，有值 → 空值算删除（Python 空值语义）', () => {
    const a = makeDoc()
    const b = structuredClone(a)
    b.vision.design_vision = '新增的愿景文案'
    const c = structuredClone(b)
    c.vision.design_vision = ''

    expect(fieldOf(a, b, 'vision', 'design_vision').diff_type).toBe('added')
    expect(fieldOf(b, c, 'vision', 'design_vision').diff_type).toBe('removed')
    // 未触及的 art 章走短路分支：无字段明细，仅统计未变数
    expect(chapterOf(b, c, 'art').chapter.field_diffs).toHaveLength(0)
    expect(chapterOf(b, c, 'art').chapter.unchanged_count).toBeGreaterThan(0)
  })

  it('未触及章节保持零变更且无字段明细', () => {
    const a = makeDoc()
    const b = structuredClone(a)
    b.meta.game_name = 'B'
    const { chapter } = chapterOf(a, b, 'story')
    expect(chapterTotalChanges(chapter)).toBe(0)
    expect(chapter.field_diffs).toHaveLength(0)
    expect(chapter.unchanged_count).toBeGreaterThan(0)
  })

  it('systems 章：enabled 翻转算修改、key 缺失算新增/删除，字段标签为「sys (enabled)」', () => {
    const a = makeDoc()
    const b = structuredClone(a)
    ;(b.systems.battle as { enabled: boolean }).enabled = true
    // key 存在且 enabled=false → true：Python 判为 modified（不同于进度语义）
    const enabled = fieldOf(a, b, 'systems', 'battle (enabled)')
    expect(enabled).toMatchObject({
      field_path: 'systems.battle.enabled',
      old_value: false,
      new_value: true,
      diff_type: 'modified'
    })
    expect(chapterOf(a, b, 'systems').chapter.modified_count).toBe(1)

    // key 缺失 → 新增；反向 → 删除
    const missing = structuredClone(a)
    delete (missing.systems as Record<string, unknown>).battle
    expect(fieldOf(missing, a, 'systems', 'battle (enabled)').diff_type).toBe('added')
    expect(fieldOf(a, missing, 'systems', 'battle (enabled)').diff_type).toBe('removed')
  })
})

describe('版本对比：字段值格式化与 Markdown 报告', () => {
  it('formatDiffValue：null → (空) / bool → 是·否 / 对象 → JSON / 超长截断', () => {
    expect(formatDiffValue(null)).toBe('(空)')
    expect(formatDiffValue(undefined)).toBe('(空)')
    expect(formatDiffValue(true)).toBe('是')
    expect(formatDiffValue(false)).toBe('否')
    expect(formatDiffValue('')).toBe('')
    expect(formatDiffValue(['a', 'b'])).toBe('["a","b"]')
    expect(formatDiffValue(12.5)).toBe('12.5')
    expect(formatDiffValue('abcdef', 3)).toBe('abc...')
    expect(formatDiffValue('abc', 3)).toBe('abc')
  })

  it('Markdown：报告头/统计/未变章节/字段表格 + 管道符与换行转义', () => {
    const a = makeDoc('A')
    const b = structuredClone(a)
    b.meta.game_name = 'B'
    b.vision.design_vision = 'a|b\nc'
    const diff = buildVersionDiff(a, b)
    const markdown = buildVersionDiffMarkdown(diff, '2026-10-01 12:00:00')

    expect(markdown).toContain('# 版本对比报告')
    expect(markdown).toContain(`- **旧版本**: v1.0 (${a.ceshu_id})`)
    expect(markdown).toContain(`- **新版本**: v1.0 (${b.ceshu_id})`)
    expect(markdown).toContain('- **对比时间**: 2026-10-01 12:00:00')
    expect(markdown).toContain('- ✚ 新增字段: 1')
    expect(markdown).toContain('- ✖ 删除字段: 0')
    expect(markdown).toContain('- ✎ 修改字段: 1')
    expect(markdown).toContain('- 总变更: 2')
    expect(markdown).toContain('| 字段 | 旧值 | 新值 | 类型 |')
    expect(markdown).toContain('| game_name | A | B | ✎ 修改 |')
    expect(markdown).toContain('| design_vision |  | a\\|b c | ✚ 新增 |')
    // 未触及章节输出「— 未变」
    expect(markdown).toContain('### 第二章·世界观与角色 — 未变')
    expect(markdown).toContain('### 文档信息')
    expect(markdown).toContain('新增 0 | 删除 0 | 修改 1 | 未变')
  })
})