import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  CESHU_FORMAT_EXTENSIONS,
  type CeshuDocument,
  type CeshuExportFormat,
  type CeshuExportResult
} from '../../../shared/ceshu/ceshuConstants'

import { renderCeshuDocx } from './docx'
import { renderCeshuExcel } from './excel'
import { renderCeshuHtml } from './html'
import { renderCeshuMarkdown } from './markdown'
import { renderCeshuPdf } from './pdf'
import { renderCeshuPptx } from './pptx'

/**
 * 策划书导出管道：按格式渲染 → 临时文件 + rename 原子写 → 返回结果。
 * 渲染器为纯函数（返回 string/Buffer），PDF 依赖 Electron 隐藏窗口（printToPDF）。
 */
export async function exportCeshuDocument(
  doc: CeshuDocument,
  format: CeshuExportFormat,
  targetPath: string
): Promise<CeshuExportResult> {
  const filePath = ensureExtension(targetPath, CESHU_FORMAT_EXTENSIONS[format])
  const content = await renderContent(doc, format)

  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, content)
  renameSync(tmpPath, filePath)

  const bytes = typeof content === 'string' ? Buffer.byteLength(content, 'utf-8') : content.byteLength
  return { filePath, format, bytes }
}

async function renderContent(doc: CeshuDocument, format: CeshuExportFormat): Promise<string | Buffer> {
  switch (format) {
    case 'markdown':
      return renderCeshuMarkdown(doc)
    case 'html':
      return renderCeshuHtml(doc)
    case 'docx':
      return renderCeshuDocx(doc)
    case 'pptx':
      return renderCeshuPptx(doc)
    case 'pdf':
      return renderCeshuPdf(doc)
    case 'excel':
      return renderCeshuExcel(doc)
  }
}

/** 目标路径缺少正确扩展名时补上（对话框已带默认扩展名，此处兜底） */
function ensureExtension(filePath: string, extension: string): string {
  return filePath.toLowerCase().endsWith(extension) ? filePath : `${filePath}${extension}`
}