import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, openCeshuFromHome, openDataEditor, seedCeshu } from './helpers/ceshuData'

interface CsvExportProbe {
  files: string[]
  totalItems: number
  byType: Record<string, number>
}

interface ExcelExportProbe {
  filePath: string
  totalItems: number
}

interface ImportProbe {
  totalItems: number
  imported: number
  updated: number
  skipped: number
}

/**
 * E19/E20 回归：游戏数据 CSV / Excel 导入导出（迁移 features/export.py）。
 *
 * 原生文件对话框无法由 Playwright 驱动 → 直接调 action IPC 并传显式路径（与 attr-system-json.spec 同法），
 * 断言「落盘文件结构（BOM/表头/文件名）」+「导入 upsert 语义」+「菜单入口」。
 *
 * 入口迁移：原为顶层数据表工具栏的 CSV / Excel 导入导出按钮，已随顶层数据页删除；
 * 能力仍在，入口改到「文件」菜单的「导入 / 导出」子菜单（`menuitem-file-importCsv` 等）。
 */
test('游戏数据 CSV / Excel：导出文件结构 + 往返 upsert + 菜单入口', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-data-io-e2e-'))
  const csvDir = mkdtempSync(join(tmpdir(), 'mb-csv-out-'))
  const xlsxDir = mkdtempSync(join(tmpdir(), 'mb-xlsx-out-'))
  const title = 'E2E 数据 IO'

  seedCeshu(userDataDir, {
    title,
    systems: [{ key: 'role', label: '角色', dataType: 'role' }]
  })
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '角色')

    // 1) 建一个角色（保证至少有一条已知数据参与导出）
    await createDataItem(window)
    await window.getByTestId('field-name').fill('E2E导出角色')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.getByTestId('ceshu-data-item-row').filter({ hasText: 'E2E导出角色' })).toBeVisible()

    const roleId = await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            data: {
              listItems: (req: {
                type: string
              }) => Promise<Array<{ id: string; data: Record<string, unknown> }>>
            }
          }
        }
      ).mbApi
      const list = await api.data.listItems({ type: 'role' })
      return list.find((item) => item.data['name'] === 'E2E导出角色')?.id ?? ''
    })
    expect(roleId).not.toBe('')

    // 2) 导出 CSV（按类型分文件）与 Excel（单工作簿）
    const exported = await window.evaluate(
      async (args: { csvDir: string; xlsxDir: string }) => {
        const api = (
          globalThis as unknown as {
            mbApi: {
              data: {
                exportCsv: (req: { dir: string }) => Promise<CsvExportProbe>
                exportExcel: (req: { dir: string }) => Promise<ExcelExportProbe>
              }
            }
          }
        ).mbApi
        const csv = await api.data.exportCsv({ dir: args.csvDir })
        const xlsx = await api.data.exportExcel({ dir: args.xlsxDir })
        return { csv, xlsx }
      },
      { csvDir, xlsxDir }
    )

    expect(exported.csv.totalItems).toBeGreaterThan(0)
    expect(exported.csv.files.some((file) => file.endsWith('roles.csv'))).toBe(true)
    expect(existsSync(join(csvDir, 'roles.csv'))).toBe(true)
    expect(exported.xlsx.filePath).toBe(join(xlsxDir, 'game_data.xlsx'))
    expect(existsSync(join(xlsxDir, 'game_data.xlsx'))).toBe(true)

    // 3) CSV 文件结构：UTF-8 BOM（Excel 中文友好）+ 表头含 name + 含该角色
    const csvRaw = readFileSync(join(csvDir, 'roles.csv'), 'utf-8')
    expect(csvRaw.startsWith('\uFEFF')).toBe(true)
    const csvBody = csvRaw.slice(1)
    const headerLine = csvBody.split(/\r?\n/)[0] ?? ''
    expect(headerLine.split(',')).toContain('name')
    expect(csvBody).toContain('E2E导出角色')

    // 4) 改 CSV 里的名称后导入 → upsert（同 id 更新，不新增）
    writeFileSync(join(csvDir, 'roles.csv'), csvBody.replace('E2E导出角色', 'E2E改名角色'), 'utf-8')
    const csvImport = (await window.evaluate(async (path: string) => {
      const api = (
        globalThis as unknown as { mbApi: { data: { importCsv: (req: { path: string }) => Promise<ImportProbe> } } }
      ).mbApi
      return api.data.importCsv({ path })
    }, join(csvDir, 'roles.csv'))) as ImportProbe

    expect(csvImport.updated).toBeGreaterThan(0)
    expect(csvImport.imported).toBe(0)

    const renamed = await window.evaluate(async (id: string) => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            data: {
              listItems: (req: {
                type: string
              }) => Promise<Array<{ id: string; data: Record<string, unknown> }>>
            }
          }
        }
      ).mbApi
      const list = await api.data.listItems({ type: 'role' })
      return list.find((item) => item.id === id)?.data['name'] ?? ''
    }, roleId)
    expect(renamed).toBe('E2E改名角色')

    // 5) 原样导回 Excel → 全部已存在 → updated、无新增
    const xlsxImport = (await window.evaluate(async (path: string) => {
      const api = (
        globalThis as unknown as {
          mbApi: { data: { importExcel: (req: { path: string }) => Promise<ImportProbe> } }
        }
      ).mbApi
      return api.data.importExcel({ path })
    }, join(xlsxDir, 'game_data.xlsx'))) as ImportProbe

    expect(xlsxImport.totalItems).toBeGreaterThan(0)
    expect(xlsxImport.imported).toBe(0)

    // 6) 菜单入口在位（能力仍在，入口从工具栏迁到「文件」菜单的导入/导出子菜单）
    await window.getByTestId('menu-title-file').click()
    await expect(window.getByTestId('menuitem-file-exportCsv')).toBeVisible()
    await expect(window.getByTestId('menuitem-file-importCsv')).toBeVisible()
    await expect(window.getByTestId('menuitem-file-exportExcel')).toBeVisible()
    await expect(window.getByTestId('menuitem-file-importExcel')).toBeVisible()
  } finally {
    await app.close()
  }
})
