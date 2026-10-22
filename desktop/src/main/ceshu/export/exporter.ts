import { mkdirSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  CESHU_FORMAT_EXTENSIONS,
  type CeshuDocument,
  type CeshuExportFormat,
  type CeshuExportResult
} from '../../../shared/ceshuConstants'

import { renderCeshuBundleJson } from './bundle'
import { renderCeshuDocx } from './docx'
import { renderCeshuExcel } from './excel'
import { renderCeshuHtml } from './html'
import { renderCeshuMarkdown } from './markdown'
import { renderCeshuPdf } from './pdf'
import { renderCeshuPptx } from './pptx'

/**
 * 策划书导出管道：按格式渲染 → 临时文件 + rename 原子写 → 返回结果。
 * 渲染器为纯函数（返回 string/Buffer），PDF 依赖 Electron 隐藏窗口（printToPDF）。
 * `bundle`（双轨）一次写两份：人读 Markdown + 机读 JSON（同主文件名）。
 */
export async function exportCeshuDocument(
  doc: CeshuDocument,
  format: CeshuExportFormat,
  targetPath: string
): Promise<CeshuExportResult> {
  if (format === 'bundle') {
    return exportBundle(doc, targetPath)
  }

  const filePath = ensureExtension(targetPath, CESHU_FORMAT_EXTENSIONS[format])
  const content = await renderContent(doc, format)
  const bytes = writeAtomic(filePath, content)
  return { filePath, format, bytes }
}

/** 双轨导出：`<name>.md`（人读）+ `<name>.json`（机读），各自原子写 */
function exportBundle(doc: CeshuDocument, targetPath: string): CeshuExportResult {
  const mdPath = ensureExtension(targetPath, '.md')
  const jsonPath = mdPath.replace(/\.md$/i, '.json')

  const mdBytes = writeAtomic(mdPath, renderCeshuMarkdown(doc))
  const jsonBytes = writeAtomic(jsonPath, renderCeshuBundleJson(doc))

  return {
    filePath: mdPath,
    format: 'bundle',
    bytes: mdBytes,
    files: [
      { path: mdPath, bytes: mdBytes },
      { path: jsonPath, bytes: jsonBytes }
    ]
  }
}

/** 临时文件 + rename 原子写；返回写入字节数 */
function writeAtomic(filePath: string, content: string | Buffer): number {
  mkdirSync(dirname(filePath), { recursive: true })
  const tmpPath = `${filePath}.tmp`
  writeFileSync(tmpPath, content)
  renameSync(tmpPath, filePath)
  return typeof content === 'string' ? Buffer.byteLength(content, 'utf-8') : content.byteLength
}

/**
 * 单文件格式的内容渲染。**刻意排除 `bundle`**：双轨不走这条路径（见 `exportBundle`），
 * 用 `Exclude` 让类型系统守住穷尽性 —— 将来新增单文件格式时漏写 case 会直接编译失败。
 */
async function renderContent(
  doc: CeshuDocument,
  format: Exclude<CeshuExportFormat, 'bundle'>
): Promise<string | Buffer> {
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