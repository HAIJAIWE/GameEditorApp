/**
 * `system.document` 内置技能（对齐 dsh `document` 的可用子集）：把常见文档解析成纯文本。
 *
 * 用途：让智能体读已有策划书/资料（docx / pptx / xlsx / txt / md / json / csv），
 * 例如「导入一份 Word 策划书，提炼成 24 章」。
 *
 * 实现：docx/pptx 用 `jszip` 解 XML 取文本节点；xlsx 用 `exceljs`；纯文本直读。
 * **PDF 需额外库**，v1 明确返回 `EUNSUPPORTED`（提示先转 docx/txt），不假装能解析。
 *
 * 安全：路径围栏在工作区内（复用 `fsContainment`）；文件大小 20MB、文本 200K 字符上限。
 * 风险：READ_ONLY（只读文件）。
 */

import { readFile, stat } from 'node:fs/promises'
import { extname } from 'node:path'
import ExcelJS from 'exceljs'
import JSZip from 'jszip'

import type { SkillProtocol, SkillResult } from '../../../shared/agent/config'
import { resolveInsideRoot } from './fsContainment'

/** 单文件大小上限（字节） */
export const DOCUMENT_MAX_BYTES = 20 * 1024 * 1024
/** 回灌给模型的文本上限（字符） */
export const DOCUMENT_MAX_CHARS = 200_000

const TEXT_EXTS = new Set([
  '.txt', '.md', '.markdown', '.json', '.csv', '.tsv', '.log', '.yaml', '.yml', '.xml', '.html', '.htm'
])

export interface DocumentSkillOptions {
  /** 工作区根目录（文档需在其中） */
  root: () => string
}

function decodeEntities(text: string): string {
  return text
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&')
    .replace(/&#(\d+);/g, (_m, code: string) => String.fromCodePoint(Number(code)))
}

/** docx 正文 XML → 纯文本（按段落 `</w:p>` 分行，取 `<w:t>` 文本节点） */
export function docxToText(xml: string): string {
  const lines: string[] = []
  for (const paragraph of xml.split(/<\/w:p>/)) {
    const parts = [...paragraph.matchAll(/<w:t[^>]*>([\s\S]*?)<\/w:t>/g)].map((m) => m[1] ?? '')
    if (parts.length > 0) lines.push(decodeEntities(parts.join('')))
  }
  return lines.join('\n')
}

/** pptx 单页 XML → 纯文本（取 `<a:t>` 文本节点） */
export function pptxSlideToText(xml: string): string {
  const parts = [...xml.matchAll(/<a:t[^>]*>([\s\S]*?)<\/a:t>/g)].map((m) => m[1] ?? '')
  return decodeEntities(parts.join(' ')).trim()
}

async function xlsxToText(buffer: Buffer): Promise<string> {
  const workbook = new ExcelJS.Workbook()
  // exceljs 的 Buffer 类型与 Node 的 Buffer<ArrayBufferLike> 泛型不兼容，运行时同一对象
  await workbook.xlsx.load(buffer as never)
  const lines: string[] = []
  workbook.eachSheet((sheet) => {
    lines.push(`## ${sheet.name}`)
    sheet.eachRow((row) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : []
      lines.push(values.map((value) => (value === null || value === undefined ? '' : String(value))).join('\t'))
    })
  })
  return lines.join('\n')
}

function slideNumber(name: string): number {
  return Number(/(\d+)/.exec(name)?.[1] ?? 0)
}

function fail(message: string, error: string): SkillResult {
  return { success: false, message: `document 失败：${message}`, error }
}

export function createDocumentSkill(options: DocumentSkillOptions): SkillProtocol {
  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action !== 'read') {
      return fail(`未知 action: ${action}（当前仅支持 read）`, 'EBADACTION')
    }
    const relPath = typeof params.path === 'string' ? params.path : ''
    let abs: string
    try {
      abs = await resolveInsideRoot(options.root(), relPath)
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'EESCAPE')
    }

    let size: number
    try {
      const info = await stat(abs)
      if (!info.isFile()) return fail('目标是目录，请给文件路径', 'EISDIR')
      size = info.size
    } catch {
      return fail(`未找到文件：${relPath}`, 'ENOTFOUND')
    }
    if (size > DOCUMENT_MAX_BYTES) {
      return fail(`文件过大（${size} 字节，上限 ${DOCUMENT_MAX_BYTES}）`, 'ETOOBIG')
    }

    const ext = extname(abs).toLowerCase()
    let text: string
    try {
      if (TEXT_EXTS.has(ext)) {
        text = await readFile(abs, 'utf8')
      } else if (ext === '.docx') {
        const zip = await JSZip.loadAsync(await readFile(abs))
        const entry = zip.file('word/document.xml')
        text = docxToText(entry === null ? '' : await entry.async('string'))
      } else if (ext === '.pptx') {
        const zip = await JSZip.loadAsync(await readFile(abs))
        const slides = Object.keys(zip.files)
          .filter((name) => /^ppt\/slides\/slide\d+\.xml$/.test(name))
          .sort((a, b) => slideNumber(a) - slideNumber(b))
        const parts: string[] = []
        for (const name of slides) {
          const entry = zip.file(name)
          if (entry === null) continue
          parts.push(`## ${name.replace(/^ppt\/slides\//, '').replace(/\.xml$/, '')}\n${pptxSlideToText(await entry.async('string'))}`)
        }
        text = parts.join('\n\n')
      } else if (ext === '.xlsx') {
        text = await xlsxToText(await readFile(abs))
      } else if (ext === '.pdf') {
        return fail('PDF 解析需要额外库，暂不支持（可先转成 docx/txt 再读）', 'EUNSUPPORTED')
      } else {
        return fail(`不支持的文档类型：${ext === '' ? '无扩展名' : ext}`, 'EUNSUPPORTED')
      }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'EPARSE')
    }

    const truncated = text.length > DOCUMENT_MAX_CHARS
    const capped = truncated ? text.slice(0, DOCUMENT_MAX_CHARS) : text
    return {
      success: true,
      message: truncated ? `${capped}\n\n（文本截断到 ${DOCUMENT_MAX_CHARS} 字符，原 ${text.length}）` : capped,
      data: { path: relPath, ext, chars: text.length, truncated }
    }
  }

  return {
    id: 'system.document',
    description:
      '读取工作区内的文档并转成纯文本：docx / pptx / xlsx / txt / md / json / csv / yaml。'
      + '用于导入已有策划书/资料。PDF 暂不支持（需转 docx/txt）。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['read'], description: '操作类型: read=读取解析' },
        path: { type: 'string', description: '文件路径（相对工作区根）' }
      },
      required: ['action', 'path']
    },
    tags: ['system', 'document'],
    execute: run
  }
}
