import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  createDocumentSkill,
  docxToText,
  pptxSlideToText
} from '@mobai/agent-core/skills/documentSkill'

let dir = ''

beforeEach(async () => {
  dir = await mkdtemp(join(tmpdir(), 'mb-doc-'))
})

afterEach(async () => {
  if (dir !== '') await rm(dir, { recursive: true, force: true })
})

type R = { success: boolean; message: string; error?: string; data?: unknown }

function skill() {
  const s = createDocumentSkill({ root: () => dir })
  return (params: Record<string, unknown>): Promise<R> => s.execute(params, {}) as Promise<R>
}

async function writeDocx(name: string, paragraphs: string[]): Promise<void> {
  const zip = new JSZip()
  const body = paragraphs.map((text) => `<w:p><w:r><w:t>${text}</w:t></w:r></w:p>`).join('')
  zip.file('word/document.xml', `<?xml version="1.0"?><w:document><w:body>${body}</w:body></w:document>`)
  await writeFile(join(dir, name), await zip.generateAsync({ type: 'nodebuffer' }))
}

async function writePptx(name: string, slides: string[]): Promise<void> {
  const zip = new JSZip()
  slides.forEach((text, index) => {
    zip.file(`ppt/slides/slide${index + 1}.xml`, `<p:sld><p:cSld><p:spTree><a:t>${text}</a:t></p:spTree></p:cSld></p:sld>`)
  })
  await writeFile(join(dir, name), await zip.generateAsync({ type: 'nodebuffer' }))
}

/** 生成一个最小合法 PDF（含正确 xref），正文为 `text` */
function buildMinimalPdf(text: string): Buffer {
  const content = `BT /F1 24 Tf 20 100 Td (${text}) Tj ET`
  const objects = [
    '<< /Type /Catalog /Pages 2 0 R >>',
    '<< /Type /Pages /Kids [3 0 R] /Count 1 >>',
    '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 200] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>',
    `<< /Length ${Buffer.byteLength(content, 'latin1')} >>\nstream\n${content}\nendstream`,
    '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>'
  ]
  let pdf = '%PDF-1.4\n'
  const offsets: number[] = []
  objects.forEach((body, index) => {
    offsets.push(Buffer.byteLength(pdf, 'latin1'))
    pdf += `${index + 1} 0 obj\n${body}\nendobj\n`
  })
  const xrefStart = Buffer.byteLength(pdf, 'latin1')
  pdf += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n`
  for (const offset of offsets) {
    pdf += `${String(offset).padStart(10, '0')} 00000 n \n`
  }
  pdf += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF\n`
  return Buffer.from(pdf, 'latin1')
}

describe('纯解析函数', () => {
  it('docxToText 按段落分行、解实体', () => {
    const xml = '<w:p><w:r><w:t>Hello</w:t></w:r></w:p><w:p><w:r><w:t>World &amp; more</w:t></w:r></w:p>'
    expect(docxToText(xml)).toBe('Hello\nWorld & more')
  })

  it('pptxSlideToText 取 a:t 文本', () => {
    expect(pptxSlideToText('<a:t>Slide</a:t><a:t>one</a:t>')).toBe('Slide one')
  })
})

describe('system.document（docx/pptx/xlsx/文本）', () => {
  it('docx → 段落文本', async () => {
    await writeDocx('a.docx', ['Hello', 'World & more'])
    const result = await skill()({ action: 'read', path: 'a.docx' })
    expect(result.success).toBe(true)
    expect(result.message).toBe('Hello\nWorld & more')
  })

  it('pptx → 各页文本', async () => {
    await writePptx('b.pptx', ['Slide one', 'Slide two'])
    const result = await skill()({ action: 'read', path: 'b.pptx' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('Slide one')
    expect(result.message).toContain('Slide two')
  })

  it('xlsx → 工作表与单元格', async () => {
    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet('Data')
    sheet.addRow(['name', 'hp'])
    sheet.addRow(['slime', 10])
    await writeFile(join(dir, 'c.xlsx'), Buffer.from(await workbook.xlsx.writeBuffer()))
    const result = await skill()({ action: 'read', path: 'c.xlsx' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('Data')
    expect(result.message).toContain('slime')
    expect(result.message).toContain('10')
  })

  it('纯文本直读', async () => {
    await writeFile(join(dir, 'd.md'), '# 标题', 'utf8')
    const result = await skill()({ action: 'read', path: 'd.md' })
    expect(result.message).toBe('# 标题')
  })

  it('pdf → 解析出文本', async () => {
    await writeFile(join(dir, 'e.pdf'), buildMinimalPdf('Hello PDF'))
    const result = await skill()({ action: 'read', path: 'e.pdf' })
    expect(result.success).toBe(true)
    expect(result.message).toContain('Hello PDF')
  })

  it('损坏的 pdf → EPARSE（不崩）', async () => {
    await writeFile(join(dir, 'bad.pdf'), Buffer.from('%PDF-1.4 not really a pdf'))
    const result = await skill()({ action: 'read', path: 'bad.pdf' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EPARSE')
  })

  it('未知扩展名 → EUNSUPPORTED', async () => {
    await writeFile(join(dir, 'f.xyz'), 'x')
    const result = await skill()({ action: 'read', path: 'f.xyz' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EUNSUPPORTED')
  })

  it('越界路径 → EESCAPE', async () => {
    const result = await skill()({ action: 'read', path: '../evil.docx' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EESCAPE')
  })

  it('文件不存在 → ENOTFOUND', async () => {
    const result = await skill()({ action: 'read', path: 'nope.docx' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('ENOTFOUND')
  })

  it('未知 action → EBADACTION', async () => {
    const result = await skill()({ action: 'frob' })
    expect(result.success).toBe(false)
    expect(result.error).toBe('EBADACTION')
  })
})
