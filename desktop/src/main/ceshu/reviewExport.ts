import { rename, writeFile } from 'node:fs/promises'

/**
 * AI 审阅报告导出：渲染层生成 Markdown 文本，主进程原子写盘（临时文件 + rename）。
 * 用途对应 Python AIReviewDialog._on_export_md（Python 在 UI 线程直接写文件）。
 */
export async function exportReviewReportFile(filePath: string, content: string): Promise<{ filePath: string }> {
  const tempPath = `${filePath}.tmp`
  try {
    await writeFile(tempPath, content, 'utf-8')
    await rename(tempPath, filePath)
  } catch (error) {
    throw new Error(`写入审阅报告失败：${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
  return { filePath }
}