import { mkdtempSync, readFileSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { exportCeshuDocument } from '../../src/main/ceshu/export/exporter'

import {
  CESHU_EXPORT_FORMATS,
  CESHU_FORMAT_EXTENSIONS,
  CESHU_FORMAT_LABELS,
  type CeshuDocument
} from '@mobai/shared/ceshu/reference'
import {
  chapterDataForDoc,
  chapterFieldsForDoc,
  chapterLabelForDoc,
  createDefaultCeshu
} from '@mobai/shared/ceshu/model'
import { isMachineDataField } from '@mobai/shared/ceshu/workflow'
import {
  SPEC_BOOKLETS,
  buildDocGovernance,
  buildSpecBooklets,
  renderDocGovernanceMarkdown,
  renderSpecBookletsMarkdown
} from '@mobai/shared/ceshu/export/governance'

/**
 * 文档治理附录 / 专题分册（2026-11-12）。
 * 与 50 份公开 GDD 抽样对比后补的两层：治理层与按专题重排，均不新增正文事实。
 */
function baseDoc(): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', name: '三界游记' })
}

/** 往某章第一个**人读**字段写值（机读字段会被分册跳过；chapterDataForDoc 返回 doc 上的同一对象引用） */
function fillChapter(doc: CeshuDocument, chapter: string, value: string): void {
  const field = chapterFieldsForDoc(doc, chapter).find((item) => !isMachineDataField(chapter, item.key))
  expect(field, `${chapter} 应有人读字段定义`).toBeTruthy()
  chapterDataForDoc(doc, chapter)[field!.key] = value
}

describe('导出管道：两种新格式真实落盘', () => {
  it('governance / booklets 按 .md 原子写盘，内容可验，无残留 tmp', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-gov-export-'))
    const doc = baseDoc()
    doc.meta.positioning = '商业化方案待确认'

    const gov = await exportCeshuDocument(doc, 'governance', join(dir, 'gov'))
    expect(gov.filePath).toBe(join(dir, 'gov.md'))
    expect(gov.bytes).toBeGreaterThan(0)
    const govText = readFileSync(gov.filePath, 'utf-8')
    expect(govText).toContain('文档治理附录')
    expect(govText).toContain('商业化方案待确认')

    const bk = await exportCeshuDocument(doc, 'booklets', join(dir, 'booklets'))
    expect(bk.filePath).toBe(join(dir, 'booklets.md'))
    expect(readFileSync(bk.filePath, 'utf-8')).toContain('数值分册')
    expect(readdirSync(dir).filter((file) => file.endsWith('.tmp'))).toHaveLength(0)
  })
})

describe('导出格式枚举：governance / booklets', () => {
  it('两种格式都已注册，扩展名 .md，标签齐全', () => {
    expect(CESHU_EXPORT_FORMATS).toContain('governance')
    expect(CESHU_EXPORT_FORMATS).toContain('booklets')
    expect(CESHU_FORMAT_EXTENSIONS.governance).toBe('.md')
    expect(CESHU_FORMAT_EXTENSIONS.booklets).toBe('.md')
    expect(CESHU_FORMAT_LABELS.governance).toContain('文档治理')
    expect(CESHU_FORMAT_LABELS.booklets).toContain('专题分册')
    // 格式数不写死：新格式必须同时进 labels / extensions 两张穷尽映射
    for (const format of CESHU_EXPORT_FORMATS) {
      expect(CESHU_FORMAT_LABELS[format]).toBeTruthy()
      expect(CESHU_FORMAT_EXTENSIONS[format]).toMatch(/^\./)
    }
  })
})

describe('buildDocGovernance：只派生已有事实，不编造', () => {
  it('空文档给出治理骨架，责任人一律（待填），无待补项', () => {
    const g = buildDocGovernance(baseDoc())
    expect(g.projectName).toBe('三界游记')
    expect(g.chapterCount).toBeGreaterThan(0)
    expect(g.completionPct).toBeGreaterThanOrEqual(0)
    expect(g.completionPct).toBeLessThanOrEqual(100)
    expect(g.revisions).toHaveLength(1)
    expect(g.revisions[0].author).toBe('（待填）')
    expect(g.revisions[0].approver).toBe('（待填）')
    expect(g.pending).toHaveLength(0)
  })

  it('正文的「待确认」被汇总成待补项，带所在章与目标版本', () => {
    const doc = baseDoc()
    doc.meta.positioning = '御剑斩的灵根契合上限待确认，需与数值章对齐'
    const g = buildDocGovernance(doc)
    expect(g.pending.length).toBeGreaterThan(0)
    const item = g.pending[0]
    expect(item.excerpt).toContain('待确认')
    expect(item.chapterLabel).toBeTruthy()
    expect(item.targetVersion).toBe('下一版（待确认）')
    expect(item.ownerChapter).toBeTruthy()
  })

  it('待补项片段按完整句取，不从词中间硬切', () => {
    const doc = baseDoc()
    doc.meta.positioning = '项目状态：立项通过。商业化方案待确认，发行商待定。'
    const g = buildDocGovernance(doc)
    const item = g.pending.find((entry) => entry.excerpt.includes('商业化方案待确认'))
    expect(item).toBeTruthy()
    expect(item?.excerpt).toBe('商业化方案待确认，发行商待定。')
  })

  it('外部事实类留白标「需扩档」，不硬塞进当前档位', () => {
    const doc = baseDoc()
    doc.meta.positioning = '竞品真名与市场容量待确认'
    const g = buildDocGovernance(doc)
    const external = g.pending.find((item) => /竞品|市场/.test(item.excerpt))
    expect(external).toBeTruthy()
    expect(external?.needsStageUpgrade).toBe(true)
    expect(external?.ownerChapter).toBe('market_analysis')
  })

  it('术语只给候选，定义留空', () => {
    const doc = baseDoc()
    doc.meta.positioning = '核心机制是「御剑斩」与「灵根契合」'
    const g = buildDocGovernance(doc)
    expect(g.glossary.length).toBeGreaterThanOrEqual(2)
    expect(g.glossary[0].definition).toBe('')
    expect(g.glossary.some((item) => item.term === '御剑斩')).toBe(true)
  })
})

describe('renderDocGovernanceMarkdown', () => {
  it('六节齐全；不编造责任人 / 排期 / 外部事实', () => {
    const md = renderDocGovernanceMarkdown(baseDoc())
    for (const head of ['文档信息', '修订记录', '待补项清单', '外部事实待补', '术语表', '协作约定']) {
      expect(md).toContain(head)
    }
    expect(md).toContain('（待填）')
    expect(md).toContain('不新增事实')
    expect(md).toContain('刻意不编造')
    expect(md).not.toContain('批准人：张三')
  })

  it('待补项以表格呈现，逐项可销项', () => {
    const doc = baseDoc()
    doc.meta.positioning = '商业化方案待确认'
    const md = renderDocGovernanceMarkdown(doc)
    expect(md).toContain('待补项清单（')
    expect(md).toContain('待补项（正文片段）')
    expect(md).toContain('建议责任章')
    expect(md).toContain('目标版本')
    expect(md).toContain('商业化方案待确认')
  })
})

describe('专题分册：只重组已写内容', () => {
  it('四册定义齐全且章节不重复归属', () => {
    expect(SPEC_BOOKLETS.map((b) => b.key)).toEqual(['numeric', 'system', 'narrative', 'delivery'])
    const seen = SPEC_BOOKLETS.flatMap((b) => b.chapters)
    expect(new Set(seen).size).toBe(seen.length)
  })

  it('空文档四册都空：不为了凑册补写空话', () => {
    const booklets = buildSpecBooklets(baseDoc())
    expect(booklets).toHaveLength(4)
    for (const booklet of booklets) expect(booklet.entries).toHaveLength(0)
  })

  it('立项档：填了数值章就只出数值册，系统/叙事册明确提示切档', () => {
    const doc = baseDoc()
    fillChapter(doc, 'numeric', '修为需求 = 1200 × 1.18^(等级-1)')
    const booklets = buildSpecBooklets(doc)
    const numeric = booklets.find((b) => b.def.key === 'numeric')!
    const narrative = booklets.find((b) => b.def.key === 'narrative')!
    expect(numeric.entries.length).toBeGreaterThan(0)
    expect(narrative.entries).toHaveLength(0)
    const md = renderSpecBookletsMarkdown(doc)
    for (const def of SPEC_BOOKLETS) expect(md).toContain(def.title)
    expect(md).toContain('切到「制作 / 全量」档')
    expect(md).toContain('本册目录')
    expect(md).toContain('1200')
  })

  it('分册里不含空占位；跨册回链由正文提到的章名自动统计', () => {
    const doc = baseDoc()
    const levelLabel = chapterLabelForDoc(doc, 'level_design')
    fillChapter(doc, 'numeric', `成长曲线见「${levelLabel}」章的验收口径，参数 1200 与 1.18`)
    const booklets = buildSpecBooklets(doc)
    for (const booklet of booklets) {
      for (const entry of booklet.entries) {
        expect(entry.fields.length).toBeGreaterThan(0)
        for (const field of entry.fields) {
          expect(field.value).not.toBe('')
          expect(field.value).not.toBe('（待填）')
        }
      }
    }
    const numeric = booklets.find((b) => b.def.key === 'numeric')!
    expect(numeric.crossRefs.some((ref) => ref.booklet === '叙事分册')).toBe(true)
    const md = renderSpecBookletsMarkdown(doc)
    expect(md).toContain('跨册回链')
    expect(md).toContain('1200')
  })
})
