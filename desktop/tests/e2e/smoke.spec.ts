import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

test('启动应用并完成一次「新增 → 列表 → 删除」IPC 闭环', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-desktop-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    await window.getByRole('button', { name: '新增测试条目' }).click()
    await expect(window.getByTestId('item-row')).toHaveCount(1)

    await window.getByRole('button', { name: '新增测试条目' }).click()
    await expect(window.getByTestId('item-row')).toHaveCount(2)

    await window.getByTestId('item-row').first().getByRole('button', { name: '删除' }).click()
    await expect(window.getByTestId('item-row')).toHaveCount(1)
  } finally {
    await app.close()
  }
})