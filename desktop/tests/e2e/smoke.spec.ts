import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test, type Page } from '@playwright/test'

import type { ImportSummary } from '../../src/shared/types'

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

test('启动应用并完成「新增 → 删除 → 旧数据导入」全链路验证', async () => {
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

  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    // 等待 schema 下发的 12 个类型加载完成，并明确选中「技能」
    await expect(window.getByTestId('type-tab')).toHaveCount(12)
    await window.getByTestId('type-tab').filter({ hasText: '技能' }).click()

    await window.getByRole('button', { name: '新增测试条目' }).click()
    await expect(window.getByTestId('item-row')).toHaveCount(1)

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
  } finally {
    await app.close()
  }
})