import { describe, expect, it } from 'vitest'

import { CHAPTER_KEYS, CHAPTER_REQUIRED_FIELDS, type CeshuDocument } from '../../src/shared/ceshu/reference/ceshuConstants'
import { createDefaultCeshu } from '../../src/shared/ceshu/model/ceshuModel'
import {
  CESHU_REFERENCE_GDDS,
  CESHU_REFERENCE_KIND_LABELS,
  compareWithReferences,
  conceptRequiredFields,
  referenceGaps,
  referenceKey,
  type CeshuReferenceKind
} from '../../src/shared/ceshu/reference/ceshuReferenceGdd'
import { chaptersUpToStage } from '../../src/shared/ceshu/workflow/ceshuStages'

/**
 * 有出处的参照文档库守卫（2026-10-27）。
 *
 * 这套数据替代了被删掉的 `INDUSTRY_BENCHMARKS`（「行业均值 77 分 / top_games 原神」——
 * 凭空写出、违反本项目 `禁编造` 铁律）。故本文件的**首要职责是守住「不编造」**：
 * 每条必须有出处、`kind` 必须如实标注、覆盖数据的键必须落在真实必填字段上。
 */

const VALID_KINDS: CeshuReferenceKind[] = ['real-public', 'project-deliverable', 'project-sample']

/** 立项阶段全部真实必填字段的 '章.字段' 键集合（与 conceptRequiredFields 同源） */
function conceptFieldKeys(): Set<string> {
  const keys = new Set<string>()
  for (const chapter of chaptersUpToStage('concept')) {
    for (const field of CHAPTER_REQUIRED_FIELDS[chapter] ?? []) keys.add(referenceKey(chapter, field))
  }
  return keys
}

function docWith(gameType = 'RPG'): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full' })
  doc.meta = { ...doc.meta, game_type: gameType }
  return doc
}

/** 空文档：清空全部章（仓库默认档在 meta 含 game_name 等初始文案） */
function emptyDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full' })
  const target = doc as unknown as Record<string, unknown>
  for (const key of CHAPTER_KEYS) target[key] = {}
  return doc
}

describe('参照文档库：不编造（出处守卫）', () => {
  it('库非空，且每条的 kind 都是三个合法值之一', () => {
    expect(CESHU_REFERENCE_GDDS.length).toBeGreaterThan(0)
    for (const reference of CESHU_REFERENCE_GDDS) {
      expect(VALID_KINDS, `${reference.id} 的 kind 非法：${reference.kind}`).toContain(reference.kind)
    }
  })

  it('每一条都**必须有** source.attribution（谁能核验、是哪份文档）', () => {
    for (const reference of CESHU_REFERENCE_GDDS) {
      expect(reference.source.attribution, `${reference.id} 缺少出处说明`).toBeTruthy()
      expect(typeof reference.source.attribution).toBe('string')
      expect(reference.source.attribution.trim().length).toBeGreaterThan(0)
    }
  })

  it('CESHU_REFERENCE_KIND_LABELS 覆盖全部 kind，且合成样例显式标「非真实文档」', () => {
    for (const kind of VALID_KINDS) {
      expect(CESHU_REFERENCE_KIND_LABELS[kind], `kind ${kind} 缺少中文标签`).toBeTruthy()
    }
    // 合成样例必须自曝身份，避免被当行业基准
    expect(CESHU_REFERENCE_KIND_LABELS['project-sample']).toContain('非真实文档')
  })

  it('真实公开文档带 url；本项目产物带 path（出处可点/可查）', () => {
    for (const reference of CESHU_REFERENCE_GDDS) {
      if (reference.kind === 'real-public') {
        expect(reference.source.url, `${reference.id} 是真实公开文档却没有 url`).toBeTruthy()
      } else {
        expect(reference.source.path, `${reference.id} 缺仓库内路径`).toBeTruthy()
      }
    }
  })

  it('合成样例的 attribution 里也必须写明「非真实文档」', () => {
    for (const reference of CESHU_REFERENCE_GDDS.filter((item) => item.kind === 'project-sample')) {
      expect(reference.source.attribution, `${reference.id} 的出处未自曝为合成样例`).toContain('非真实文档')
    }
  })

  it('id 唯一、title / genre / gameType 非空', () => {
    const ids = CESHU_REFERENCE_GDDS.map((reference) => reference.id)
    expect(new Set(ids).size).toBe(ids.length)
    for (const reference of CESHU_REFERENCE_GDDS) {
      expect(reference.title).toBeTruthy()
      expect(reference.genre).toBeTruthy()
      expect(reference.gameType).toBeTruthy()
    }
  })
})

describe('参照文档库：覆盖数据的键必须真实存在', () => {
  it('coverage 的每个键都落在「立项阶段真实必填字段」上（防幽灵字段/错拼）', () => {
    const valid = conceptFieldKeys()
    const bad: string[] = []
    for (const reference of CESHU_REFERENCE_GDDS) {
      for (const key of Object.keys(reference.coverage)) {
        if (!valid.has(key)) bad.push(`${reference.id}:${key}`)
      }
    }
    expect(bad, 'coverage 引用了立项阶段不存在的字段键').toEqual([])
  })

  it('每条都登记了**全部**立项必填字段（缺口也要显式登记 covered:false，不靠缺键表达）', () => {
    const valid = conceptFieldKeys()
    const missing: string[] = []
    for (const reference of CESHU_REFERENCE_GDDS) {
      for (const key of valid) {
        if (!(key in reference.coverage)) missing.push(`${reference.id}:${key}`)
      }
    }
    expect(missing, 'coverage 遗漏了立项必填字段（缺键＝未登记，无法区分「没写」与「漏登记」）').toEqual([])
  })

  it('每条 coverage 都有非空的 evidence（缺口也要写明依据）', () => {
    for (const reference of CESHU_REFERENCE_GDDS) {
      for (const [key, coverage] of Object.entries(reference.coverage)) {
        expect(coverage.evidence, `${reference.id}:${key} 缺少 evidence`).toBeTruthy()
        expect(coverage.evidence.trim().length).toBeGreaterThan(0)
      }
    }
  })

  it('真实公开文档保留真实缺口（Doom Bible 的 gameplay.core_loop = false，不脑补）', () => {
    const doom = CESHU_REFERENCE_GDDS.find((reference) => reference.id === 'DOOM')
    expect(doom?.coverage['gameplay.core_loop']?.covered).toBe(false)
    // 缺口不被抹平：DOOM 一定有未覆盖字段
    expect(Object.values(doom!.coverage).some((item) => item.covered === false)).toBe(true)
  })
})

describe('conceptRequiredFields：品类口径与完成度同源', () => {
  it('含战斗品类 / 缺省：立项 16 个必填字段', () => {
    expect(conceptRequiredFields('SLG')).toHaveLength(16)
    expect(conceptRequiredFields('')).toHaveLength(16)
    expect(conceptRequiredFields(undefined)).toHaveLength(16)
  })

  it('无战斗品类：剔除 combat 的 2 个必填 ⇒ 14 个', () => {
    expect(conceptRequiredFields('模拟经营')).toHaveLength(14)
    expect(conceptRequiredFields('视觉小说')).toHaveLength(14)
    // combat 被剔除
    const keys = conceptRequiredFields('模拟经营').map((item) => `${item.chapter}.${item.field}`)
    expect(keys.some((key) => key.startsWith('combat.'))).toBe(false)
  })

  it('返回的字段与 CHAPTER_REQUIRED_FIELDS 逐项一致（不另造一套分母）', () => {
    const fields = conceptRequiredFields('SLG')
    for (const { chapter, field } of fields) {
      expect(CHAPTER_REQUIRED_FIELDS[chapter]).toContain(field)
    }
    const expected = CHAPTER_REQUIRED_FIELDS.meta.length + CHAPTER_REQUIRED_FIELDS.vision.length
    expect(fields.filter((item) => item.chapter === 'meta' || item.chapter === 'vision').length).toBe(expected)
  })
})

describe('compareWithReferences：逐行同分母、delta 可解释', () => {
  it('当前文档为空时 docCovered = 0，delta = -covered', () => {
    const rows = compareWithReferences(emptyDoc())
    for (const row of rows) {
      expect(row.docCovered).toBe(0)
      expect(row.delta).toBe(-row.covered)
    }
  })

  it('每行 total 与该行 gameType 的品类口径一致（无战斗参照被剔除 combat）', () => {
    const rows = compareWithReferences(docWith('RPG'))
    const merge = rows.find((row) => row.id === 'MERGE')
    const slg = rows.find((row) => row.id === 'SLG')
    // MERGE 是模拟经营 ⇒ 该行分母少 2；SLG 含战斗 ⇒ 16
    expect(merge?.total).toBe(14)
    expect(slg?.total).toBe(16)
  })

  it('delta = docCovered - covered（三个数落在同一批字段上）', () => {
    const doc = docWith('RPG')
    doc.meta = { ...doc.meta, game_name: '测试', positioning: '定位', tags: ['a'] }
    for (const row of compareWithReferences(doc)) {
      expect(row.delta).toBe(row.docCovered - row.covered)
      expect(row.ratio).toBeCloseTo(row.total === 0 ? 0 : row.covered / row.total, 2)
    }
  })

  it('产出带 kindLabel / attribution（UI 直接展示，保证「有出处」）', () => {
    for (const row of compareWithReferences(docWith('RPG'))) {
      expect(row.kindLabel).toBe(CESHU_REFERENCE_KIND_LABELS[row.kind])
      expect(row.attribution).toBeTruthy()
    }
  })

  it('用自造的一小撮 references 时只比这些（可注入）', () => {
    const custom = [CESHU_REFERENCE_GDDS[0]!]
    const rows = compareWithReferences(docWith('RPG'), custom)
    expect(rows).toHaveLength(1)
    expect(rows[0]!.id).toBe('DOOM')
  })
})

describe('referenceGaps：真实文档「还差什么」', () => {
  it('返回该文档未覆盖的立项必填字段（带中文章名）', () => {
    const doom = CESHU_REFERENCE_GDDS.find((reference) => reference.id === 'DOOM')!
    const gaps = referenceGaps(doom)
    // DOOM 明确有 7 个立项缺口
    expect(gaps).toHaveLength(7)
    expect(gaps.some((gap) => gap.includes('核心玩法') || gap.includes('gameplay'))).toBe(true)
  })

  it('无战斗品类下不把 combat 的缺口算进去（口径一致）', () => {
    const doom = CESHU_REFERENCE_GDDS.find((reference) => reference.id === 'DOOM')!
    const withCombat = referenceGaps(doom, 'SLG')
    const noCombat = referenceGaps(doom, '模拟经营')
    expect(noCombat.length).toBeLessThanOrEqual(withCombat.length)
  })
})
