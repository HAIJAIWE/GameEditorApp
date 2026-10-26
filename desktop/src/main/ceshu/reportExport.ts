import { rename, writeFile } from 'node:fs/promises'

/**
 * 文本报告导出：渲染层生成 Markdown 文本，主进程原子写盘（临时文件 + rename）。
 * 用于 AI 审阅报告与完备性检查报告（对应 旧版 在 UI 线程直接写文件的做法）。
 */
export async function exportTextReportFile(
  filePath: string,
  content: string,
  label = '报告'
): Promise<{ filePath: string }> {
  const tempPath = `${filePath}.tmp`
  try {
    await writeFile(tempPath, content, 'utf-8')
    await rename(tempPath, filePath)
  } catch (error) {
    throw new Error(`写入${label}失败：${error instanceof Error ? error.message : String(error)}`, { cause: error })
  }
  return { filePath }
}