import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, openCeshuFromHome, openDataEditor, openMenuItem, seedCeshu } from './helpers/ceshuData'

test('数据备份：创建 → 列表可见 → 删除（软删除）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-backup-e2e-'))
  const title = 'E2E 数据备份'
  // 新 IA：数据编辑在策划书预览面板；「备份管理」从「文件」菜单打开
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

    // 造两条数据再备份（否则备份内容为空，看不出差别）
    await createDataItem(window)
    await createDataItem(window)
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(2)

    // 打开备份面板：初始应为空
    await openMenuItem(window, 'file', 'backup')
    await expect(window.getByTestId('backup-panel')).toBeVisible()
    await expect(window.getByTestId('backup-empty')).toBeVisible()

    // 创建备份 → 列表出现一行，通知含「已创建备份」
    await window.getByTestId('backup-label').fill('e2e')
    await window.getByTestId('backup-create').click()
    await expect(window.getByTestId('backup-notice')).toContainText('已创建备份')
    await expect(window.getByTestId('backup-row')).toHaveCount(1)
    await expect(window.getByTestId('backup-row')).toContainText('backup_')

    // 删除走二次确认（软删除）
    await window.getByTestId('backup-delete').click()
    await expect(window.getByTestId('backup-confirm')).toBeVisible()
    await window.getByTestId('backup-confirm-no').click()
    await expect(window.getByTestId('backup-confirm')).toHaveCount(0)
    await expect(window.getByTestId('backup-row')).toHaveCount(1)

    await window.getByTestId('backup-delete').click()
    await window.getByTestId('backup-confirm-yes').click()
    await expect(window.getByTestId('backup-empty')).toBeVisible()
  } finally {
    await app.close()
  }
})
