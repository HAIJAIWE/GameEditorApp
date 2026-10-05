import { mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import ExcelJS from 'exceljs'

interface CeshuExportResult {
  filePath: string
  format: string
  bytes: number
}

/** 导出按钮/格式选择在 UI 中可见 */
test('策划书导出 UI：格式选择（6 种）与导出按钮存在', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-export-ui-'))
  const app = await launchApp(userDataDir)
  try {
    const window = await app.firstWindow()
    await waitReady(window)

    await window.getByTestId('mode-ceshu').click()
    await window.getByTestId('ceshu-create').click()
    await expect(window.getByTestId('ceshu-export')).toBeVisible()
    await expect(window.getByTestId('export-format').locator('option')).toHaveCount(6)
  } finally {
    await app.close()
  }
})

/** 六格式导出链路：渲染 → 原子写盘 → 文件内容/魔数校验（对话框仅能人工操作，直接传路径） */
test('策划书导出：Markdown/HTML/docx/pptx/PDF/Excel 全链路落盘', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-export-e2e-'))
  const outDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-export-out-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    const results = await window.evaluate(async (targetDir) => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            ceshu: {
              create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string; meta: Record<string, unknown> }>
              get: (req: { id: string }) => Promise<{ meta: Record<string, unknown> }>
              saveChapter: (req: { id: string; chapter: string; data: unknown }) => Promise<unknown>
              export: (req: { id: string; format: string; path: string }) => Promise<unknown>
            }
          }
        }
      ).mbApi

      const created = await api.ceshu.create({ name: 'E2E 导出游戏', scope: 'lite' })
      const doc = await api.ceshu.get({ id: created.ceshu_id })
      await api.ceshu.saveChapter({
        id: created.ceshu_id,
        chapter: 'meta',
        data: { ...doc.meta, game_type: 'RPG', positioning: '导出定位' }
      })

      const exported = []
      for (const format of ['markdown', 'html', 'docx', 'pptx', 'pdf', 'excel']) {
        exported.push(await api.ceshu.export({ id: created.ceshu_id, format, path: `${targetDir}/${format}` }))
      }
      return exported
    }, outDir)

    const summaries = results as CeshuExportResult[]
    expect(summaries).toHaveLength(6)
    expect(summaries.every((item) => item.bytes > 0)).toBe(true)
    expect(summaries.map((item) => item.format)).toEqual(['markdown', 'html', 'docx', 'pptx', 'pdf', 'excel'])

    // Markdown：lite 档（9 章）与内容
    const markdown = readFileSync(join(outDir, 'markdown.md'), 'utf-8')
    expect(markdown).toContain('# E2E 导出游戏')
    expect(markdown).toContain('9. [第九章·资源规划](#ch9)')
    expect(markdown).not.toContain('第十章·市场分析')

    // HTML：自包含
    const html = readFileSync(join(outDir, 'html.html'), 'utf-8')
    expect(html).toContain('<!doctype html>')
    expect(html).toContain('<title>E2E 导出游戏</title>')

    // docx / pptx：zip 魔数（结构断言见单测）
    expect(readFileSync(join(outDir, 'docx.docx')).subarray(0, 2).toString('latin1')).toBe('PK')
    expect(readFileSync(join(outDir, 'pptx.pptx')).subarray(0, 2).toString('latin1')).toBe('PK')

    // PDF：Chromium printToPDF 产出
    expect(readFileSync(join(outDir, 'pdf.pdf')).subarray(0, 5).toString('latin1')).toBe('%PDF-')

    // Excel：zip 魔数 + exceljs 回读（8 个 Sheet 与单元格内容）
    const xlsxBytes = readFileSync(join(outDir, 'excel.xlsx'))
    expect(xlsxBytes.subarray(0, 2).toString('latin1')).toBe('PK')
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.readFile(join(outDir, 'excel.xlsx'))
    expect(workbook.worksheets.map((sheet) => sheet.name)).toEqual([
      '概览',
      '系统配置',
      '数值表',
      '角色',
      '里程碑',
      '风险',
      '竞品',
      '校验报告'
    ])
    expect(workbook.getWorksheet('概览')?.getRow(2).getCell(2).value).toBe('E2E 导出游戏')
    expect(workbook.getWorksheet('概览')?.getRow(2).getCell(1).value).toBe('游戏名称')
  } finally {
    await app.close()
  }
})