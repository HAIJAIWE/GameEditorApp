import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, openCeshuFromHome, openDataEditor, seedCeshu } from './helpers/ceshuData'

import type { ExportSummary, ImportSummary } from '../../src/shared/types'

/** 通过页面上下文走完整导出链路（保存对话框仅能人工操作，E2E 直接传路径） */
async function exportViaIpc(page: Page, filePath: string): Promise<ExportSummary> {
  const summary = await page.evaluate((path) => {
    const api = (
      globalThis as unknown as {
        mbApi: { data: { exportLegacy: (req: { path: string }) => Promise<unknown> } }
      }
    ).mbApi
    return api.data.exportLegacy({ path })
  }, filePath)
  return summary as ExportSummary
}

/** 通过页面上下文走完整导入链路（文件选择对话框仅能人工操作，E2E 直接传路径） */
async function importViaIpc(page: Page, filePath: string): Promise<ImportSummary> {
  const summary = await page.evaluate((path) => {
    const api = (
      globalThis as unknown as {
        mbApi: { data: { importLegacy: (req: { path: string }) => Promise<unknown> } }
      }
    ).mbApi
    return api.data.importLegacy({ path })
  }, filePath)
  return summary as ImportSummary
}

test('启动应用并完成「新增 → 编辑 → 删除 → 导入 → 导出」全链路验证', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-desktop-e2e-'))
  const fixtureDir = mkdtempSync(join(tmpdir(), 'mb-e2e-fixture-'))
  const legacyFilePath = join(fixtureDir, 'legacy.json')
  writeFileSync(
    legacyFilePath,
    JSON.stringify({
      skills: [
        { id: 'E2E_SKILL_1', name: '导入技能A' },
        { id: 'E2E_SKILL_2', name: '导入技能B' }
      ]
    }),
    'utf-8'
  )

  const title = 'E2E 全链路'
  // 新 IA：数据编辑在策划书预览面板的「技能」/「角色」标签里；两者都启用以便切换标签触发重载
  seedCeshu(userDataDir, {
    title,
    systems: [
      { key: 'skill', label: '技能', dataType: 'skill' },
      { key: 'role', label: '角色', dataType: 'role' }
    ]
  })
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)

    // 进入「技能」数据编辑器
    await openDataEditor(window, '技能')

    await createDataItem(window)
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(1)

    // 选中条目并编辑保存：动态表单 → updateItem → 列表回显
    await window.getByTestId('ceshu-data-item-row').first().click()
    await expect(window.getByTestId('item-editor')).toBeVisible()
    await window.getByTestId('field-name').fill('改后的技能名')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.getByTestId('ceshu-data-item-row')).toContainText('改后的技能名')

    await createDataItem(window)
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(2)

    // 删除入口已从行内图标移至表单底部操作栏（对齐 PyQt）：先选中首行，再点「删除」
    await window.getByTestId('ceshu-data-item-row').first().click()
    await window.getByTestId('item-form-delete').click()
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(1)

    // 旧数据导入：渲染层 IPC → 主进程 → 真实 SQLite upsert
    const summary = await importViaIpc(window, legacyFilePath)
    expect(summary.imported).toBe(2)
    expect(summary.updated).toBe(0)
    expect(summary.byType['skill']).toBe(2)

    // 切走再切回「技能」触发重新加载，导入数据应出现在列表中
    await openDataEditor(window, '角色')
    await openDataEditor(window, '技能')
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(3)
    await expect(window.getByText('导入技能A')).toBeVisible()

    // 导出回旧版 JSON：渲染层 IPC → 主进程 → 原子写入文件
    const exportPath = join(fixtureDir, 'exported.json')
    const exportSummary = await exportViaIpc(window, exportPath)
    expect(exportSummary.totalItems).toBe(3)

    const exported = JSON.parse(readFileSync(exportPath, 'utf-8')) as Record<string, Array<{ id: string }>>
    expect(exported['skills']).toHaveLength(3)
    expect(exported['skills']?.some((item) => item.id === 'E2E_SKILL_1')).toBe(true)
    expect(Object.keys(exported).length).toBeGreaterThanOrEqual(12)
  } finally {
    await app.close()
  }
})
