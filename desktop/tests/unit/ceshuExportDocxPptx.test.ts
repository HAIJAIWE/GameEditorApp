import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { renderCeshuDocx } from '../../src/main/ceshu/export/docx'
import { renderCeshuPptx } from '../../src/main/ceshu/export/pptx'
import type { CeshuDocument, GddScope } from '../../src/shared/ceshu/ceshuConstants'
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

describe('策划书 docx 渲染器', () => {
  it('full 档：含游戏名、章节标题、字段值与系统表，中文字体为微软雅黑', async () => {
    const buffer = await renderCeshuDocx(createFixture('full'))
    const zip = await JSZip.loadAsync(buffer)
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? ''

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
    const zip = await JSZip.loadAsync(buffer)
    const xml = (await zip.file('word/document.xml')?.async('string')) ?? ''

    expect(xml).toContain('测试游戏')
    expect(xml).not.toContain('第十八章')
  })
})

describe('策划书 pptx 渲染器', () => {
  it('full 档：封面 + 17 章 + 完成度共 19 页，含游戏名与章节标题', async () => {
    const buffer = await renderCeshuPptx(createFixture('full'))
    expect(Buffer.isBuffer(buffer)).toBe(true)

    const zip = await JSZip.loadAsync(buffer)
    expect(zip.file('[Content_Types].xml')).toBeTruthy()

    const slideNames = Object.keys(zip.files).filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
    expect(slideNames).toHaveLength(19)

    const slides = await Promise.all(slideNames.map((name) => zip.file(name)!.async('string')))
    expect(slides.some((xml) => xml.includes('测试游戏'))).toBe(true)
    expect(slides.some((xml) => xml.includes('第五章·战斗系统设计'))).toBe(true)
  })
})