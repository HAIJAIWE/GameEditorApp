import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

test('快速创建：打开面板 → 选模板 → 创建（字段初始值来自模板）→ 换类型清空选中', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-quick-create-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    // 打开快速创建面板（默认类型 = 当前活跃类型 role）
    await window.getByTestId('open-quick-create').click()
    await expect(window.getByTestId('qc-panel')).toBeVisible()

    // 未选模板时「创建」禁用（避免空模板落库）
    await expect(window.getByTestId('qc-create')).toBeDisabled()

    // 选「战士」模板：创建按钮解禁，预览显示模板初始值
    await window.getByTestId('qc-card-战士').click()
    await expect(window.getByTestId('qc-create')).toBeEnabled()
    await expect(window.getByTestId('qc-panel')).toContainText('新战士')

    // 创建 → 提示含模板名与条目名，列表 +1
    await window.getByTestId('qc-create').click()
    await expect(window.locator('.notice-banner')).toContainText('已按模板「战士」创建')
    await expect(window.getByTestId('qc-panel')).toHaveCount(0)
    await expect(window.getByTestId('item-row')).toHaveCount(1)
    await expect(window.getByTestId('item-row').first()).toContainText('新战士')

    // 换类型：选中被清空（旧选中不属于新类型），创建按钮重新禁用
    await window.getByTestId('open-quick-create').click()
    await expect(window.getByTestId('qc-panel')).toBeVisible()
    await expect(window.getByTestId('qc-create')).toBeDisabled()
    await window.getByTestId('qc-type').selectOption('skill')
    await expect(window.getByTestId('qc-card-单体攻击')).toBeVisible()
    await expect(window.getByTestId('qc-card-战士')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
