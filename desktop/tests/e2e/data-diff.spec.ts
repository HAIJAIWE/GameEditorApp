import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, openCeshuFromHome, openDataEditor, openMenuItem, seedCeshu } from './helpers/ceshuData'

/**
 * 数据对比面板：设基线 → 改数据并保存 → 重开 → 与基线对比，应报告「修改」。
 * 新 IA 下入口从工具栏迁到「工具」菜单（`menuitem-tools-dataDiff`）。
 */
test('数据对比：设定基线后修改数据 → 与基线对比应报告修改', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-data-diff-e2e-'))
  const title = 'E2E 数据对比'
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

    // 建 2 条角色
    await createDataItem(window)
    await createDataItem(window)
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(2)

    // 打开数据对比，设当前为基线，然后关闭
    await openMenuItem(window, 'tools', 'dataDiff')
    const panel = window.getByTestId('data-diff-panel')
    await expect(panel).toBeVisible()
    await expect(window.getByTestId('dd-counts')).toContainText('当前条目数：2')
    await window.getByTestId('dd-set-baseline').click()
    await expect(window.getByTestId('dd-notice')).toContainText('已设当前 2 条数据为基线')
    await panel.getByRole('button', { name: '关闭' }).click()
    await expect(panel).toHaveCount(0)

    // 改一条角色数据并保存
    await window.getByTestId('ceshu-data-item-row').first().click()
    await window.getByTestId('field-name').fill('改动后的角色名')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.locator('.notice-banner')).toContainText('已保存')

    // 重开数据对比 → 与基线对比
    await openMenuItem(window, 'tools', 'dataDiff')
    const reopened = window.getByTestId('data-diff-panel')
    await expect(reopened).toBeVisible()
    // 有基线时按钮可用
    await expect(window.getByTestId('dd-run')).toBeEnabled()
    await window.getByTestId('dd-run').click()

    await expect(window.getByTestId('dd-summary')).toContainText('修改')
    await expect(window.getByTestId('dd-row').first()).toBeVisible()
    await expect(window.getByTestId('dd-row').first()).toContainText('data.name')
    await expect(window.getByTestId('dd-identical')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
