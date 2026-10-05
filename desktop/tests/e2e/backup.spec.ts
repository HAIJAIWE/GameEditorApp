import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

test('数据备份：创建 → 列表可见 → 删除（软删除）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-backup-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 造两条数据再备份（否则备份内容为空，看不出差别）
    const createButton = window.getByRole('button', { name: '新增测试条目' })
    for (let index = 0; index < 2; index++) {
      await createButton.click()
    }
    await expect(window.getByTestId('item-row')).toHaveCount(2)

    // 打开备份面板：初始应为空
    await window.getByTestId('open-backup').click()
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
