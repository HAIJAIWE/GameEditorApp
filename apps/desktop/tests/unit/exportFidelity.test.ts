import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { resolve } from 'node:path'

import {
  Document,
  HeadingLevel,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx'
import JSZip from 'jszip'
import PptxGenJS from 'pptxgenjs'
import { describe, expect, it } from 'vitest'

/**
 * 导出保真预演（Phase 1）：
 * 验证 docx / pptx 的 JS 导出链在中文场景下的基础能力（标题 / 正文 / 表格 / 中文字体）。
 * 样例文件输出到 spikes/out/ 供人工打开验收。
 * 正式导出服务（含 6 格式与 golden-file 验收）在后续 Phase 落地。
 */

const OUT_DIR = resolve(process.cwd(), 'spikes/out')

describe('导出保真预演', () => {
  it('docx：生成含中文标题与表格的文档，并以结构断言回读', async () => {
    const doc = new Document({
      sections: [
        {
          children: [
            new Paragraph({ text: '战斗系统设计', heading: HeadingLevel.HEADING_1 }),
            new Paragraph({
              children: [new TextRun({ text: '中文排版验证：技能、属性、伤害公式。', font: '微软雅黑' })]
            }),
            new Table({
              width: { size: 60, type: WidthType.PERCENTAGE },
              rows: [
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '属性', bold: true })] })] }),
                    new TableCell({ children: [new Paragraph({ children: [new TextRun({ text: '数值', bold: true })] })] })
                  ]
                }),
                new TableRow({
                  children: [
                    new TableCell({ children: [new Paragraph({ text: '攻击力' })] }),
                    new TableCell({ children: [new Paragraph({ text: '120' })] })
                  ]
                })
              ]
            })
          ]
        }
      ]
    })

    const buffer = await Packer.toBuffer(doc)
    mkdirSync(OUT_DIR, { recursive: true })
    writeFileSync(resolve(OUT_DIR, 'sample.docx'), buffer)

    const zip = await JSZip.loadAsync(buffer)
    const documentXml = await zip.file('word/document.xml')?.async('string')
    expect(documentXml).toBeTruthy()
    expect(documentXml).toContain('战斗系统设计')
    expect(documentXml).toContain('伤害公式')
    expect(documentXml).toContain('<w:tbl>')
    expect(documentXml).toContain('微软雅黑')
  })

  it('pptx：生成含中文标题与表格的幻灯片，并以结构断言回读', async () => {
    const pptx = new PptxGenJS()
    const slide = pptx.addSlide()
    slide.addText('战斗系统设计', {
      x: 0.5,
      y: 0.5,
      w: 9,
      h: 0.8,
      fontSize: 28,
      bold: true,
      fontFace: '微软雅黑',
      color: '1F2937'
    })
    slide.addTable(
      [
        [{ text: '属性', options: { bold: true } }, { text: '数值', options: { bold: true } }],
        [{ text: '攻击力' }, { text: '120' }]
      ],
      { x: 0.5, y: 1.8, w: 6, fontFace: '微软雅黑' }
    )

    mkdirSync(OUT_DIR, { recursive: true })
    const pptxPath = resolve(OUT_DIR, 'sample.pptx')
    await pptx.writeFile({ fileName: pptxPath })

    const zip = await JSZip.loadAsync(readFileSync(pptxPath))
    const slideXml = await zip.file('ppt/slides/slide1.xml')?.async('string')
    expect(slideXml).toBeTruthy()
    expect(slideXml).toContain('战斗系统设计')
    expect(slideXml).toContain('攻击力')
    expect(zip.file('[Content_Types].xml')).toBeTruthy()
  })
})