import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

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

  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 等待 schema 下发的 12 个类型加载完成，并明确选中「技能」
    await expect(window.getByTestId('type-tab')).toHaveCount(12)
    await window.getByTestId('type-tab').filter({ hasText: '技能' }).click()

    await window.getByRole('button', { name: '新增测试条目' }).click()
    await expect(window.getByTestId('item-row')).toHaveCount(1)

    // 选中条目并编辑保存：动态表单 → updateItem → 列表回显
    await window.getByTestId('item-row').first().click()
    await expect(window.getByTestId('item-editor')).toBeVisible()
    await window.getByTestId('field-name').fill('改后的技能名')
    await window.getByRole('button', { name: '保存' }).click()
    await expect(window.getByTestId('item-row')).toContainText('改后的技能名')

    await window.getByRole('button', { name: '新增测试条目' }).click()
    await expect(window.getByTestId('item-row')).toHaveCount(2)

    await window.getByTestId('item-row').first().getByRole('button', { name: '删除' }).click()
    await expect(window.getByTestId('item-row')).toHaveCount(1)

    // 旧数据导入：渲染层 IPC → 主进程 → 真实 SQLite upsert
    const summary = await importViaIpc(window, legacyFilePath)
    expect(summary.imported).toBe(2)
    expect(summary.updated).toBe(0)
    expect(summary.byType['skill']).toBe(2)

    // 切走再切回「技能」触发重新加载，导入数据应出现在列表中
    await window.getByTestId('type-tab').filter({ hasText: '角色' }).click()
    await window.getByTestId('type-tab').filter({ hasText: '技能' }).click()
    await expect(window.getByTestId('item-row')).toHaveCount(3)
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