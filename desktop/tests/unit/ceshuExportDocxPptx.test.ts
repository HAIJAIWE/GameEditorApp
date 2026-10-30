import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { renderCeshuDocx } from '../../src/main/ceshu/export/docx'
import { renderCeshuPptx } from '../../src/main/ceshu/export/pptx'
import { CHAPTER_LABELS, type CeshuDocument, type GddScope } from '../../src/shared/ceshu/ceshuConstants'
import { createDefaultCeshu } from '../../src/shared/ceshu/ceshuModel'

/**
 * 策划书 docx / pptx 渲染器单测：以 JSZip 解包回读 XML，断言关键结构与字段均已落地。
 */

function createFixture(scope: GddScope): CeshuDocument {
  const doc = createDefaultCeshu({ scope })
  doc.meta.game_name = '测试游戏'
  doc.meta.game_type = 'RPG'
  doc.meta.positioning = '一句话定位'
  doc.meta.tags = ['剧情向']
  ;(doc.combat as Record<string, unknown>).damage_formula = '伤害 = 攻击 - 防御'
  const systems = doc.systems as unknown as Record<string, { enabled: boolean; config: Record<string, unknown> }>
  systems.battle.enabled = true
  systems.battle.config.turn_mode = 'turn_based'
  return doc
}

/**
 * 打上字段审核状态：meta 1 条待审、combat 1 条待审 + 1 条已批准。
 * 用 schema 内真实字段 key，避免统计函数把「扩展键」过滤掉后数字对不上。
 */
function withFieldStatus(doc: CeshuDocument): CeshuDocument {
  const at = '2026-10-23T10:00:00.000Z'
  doc.meta.field_status = {
    meta: { positioning: { status: 'ai_draft', at } },
    combat: {
      combat_mode: { status: 'ai_draft', at },
      damage_formula: { status: 'approved', at }
    }
  }
  return doc
}

/** 解包 docx 主文档 XML */
async function readDocxXml(buffer: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(buffer)
  return (await zip.file('word/document.xml')?.async('string')) ?? ''
}

/** 解包 pptx 并返回各页 XML */
async function readSlideXmls(buffer: Buffer): Promise<string[]> {
  const zip = await JSZip.loadAsync(buffer)
  const names = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
  return Promise.all(names.map((name) => zip.file(name)!.async('string')))
}

describe('策划书 docx 渲染器', () => {
  it('full 档：含游戏名、章节标题、字段值与系统表，中文字体为微软雅黑', async () => {
    const buffer = await renderCeshuDocx(createFixture('full'))
    const xml = await readDocxXml(buffer)

    expect(xml).toContain('测试游戏')
    expect(xml).toContain('第五章·战斗系统设计')
    expect(xml).toContain('伤害 = 攻击 - 防御')
    expect(xml).toContain('系统')
    expect(xml).toContain('已启用系统配置详情')
    expect(xml).toContain('微软雅黑')
    expect(xml).toContain('<w:tbl>')
    expect(xml).toContain('总进度:')
  })

  it('lite 档：不导出工业级章节（无第十八章）', async () => {
    const buffer = await renderCeshuDocx(createFixture('lite'))
    const xml = await readDocxXml(buffer)

    expect(xml).toContain('测试游戏')
    expect(xml).not.toContain('第十八章')
  })

  it('审核进度：全文档汇总 + 仅列待审章节（口径同 Markdown）', async () => {
    const buffer = await renderCeshuDocx(withFieldStatus(createFixture('full')))
    const xml = await readDocxXml(buffer)

    expect(xml).toContain('审核进度')
    expect(xml).toContain('全文档：2 待审 · 1 已批准')
    // 用常量拼期望值：章节重排后章号会漂移，硬编码「第五章」会让用例误报
    expect(xml).toContain(`${CHAPTER_LABELS.combat}：1 待审`)
  })

  it('审核进度：无 field_status 时写「无审核记录」', async () => {
    const buffer = await renderCeshuDocx(createFixture('full'))
    const xml = await readDocxXml(buffer)

    expect(xml).toContain('审核进度')
    expect(xml).toContain('全文档：无审核记录')
  })
})

describe('策划书 pptx 渲染器', () => {
  it('full 档：封面 + 24 章 + 审核进度 + 完成度共 27 页，含游戏名与章节标题（P2 后 +7 章页）', async () => {
    const buffer = await renderCeshuPptx(createFixture('full'))
    expect(Buffer.isBuffer(buffer)).toBe(true)

    const zip = await JSZip.loadAsync(buffer)
    expect(zip.file('[Content_Types].xml')).toBeTruthy()

    const slides = await readSlideXmls(buffer)
    expect(slides).toHaveLength(27)
    expect(slides.some((xml) => xml.includes('测试游戏'))).toBe(true)
    expect(slides.some((xml) => xml.includes('第五章·战斗系统设计'))).toBe(true)
  })

  it('审核进度：全文档汇总 + 仅列待审章节（口径同 Markdown）', async () => {
    const slides = await readSlideXmls(await renderCeshuPptx(withFieldStatus(createFixture('full'))))

    expect(slides.some((xml) => xml.includes('审核进度'))).toBe(true)
    expect(slides.some((xml) => xml.includes('全文档：2 待审 · 1 已批准'))).toBe(true)
    expect(slides.some((xml) => xml.includes(`${CHAPTER_LABELS.combat}：1 待审`))).toBe(true)
  })

  it('审核进度：无 field_status 时写「无审核记录」', async () => {
    const slides = await readSlideXmls(await renderCeshuPptx(createFixture('full')))

    expect(slides.some((xml) => xml.includes('审核进度'))).toBe(true)
    expect(slides.some((xml) => xml.includes('全文档：无审核记录'))).toBe(true)
  })
})