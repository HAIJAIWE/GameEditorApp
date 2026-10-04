import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

test('自定义字段模板：保存 → 出现在下拉 → 应用还原完整定义 → 删除', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-field-tpl-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    await window.getByTestId('open-type-editor').click()
    await expect(window.getByTestId('type-editor-panel')).toBeVisible()
    await window.getByTestId('te-type-tab').filter({ hasText: '职业' }).click()

    // 改出一个可辨识的字段集：删掉最后一个字段，便于验证「应用模板」能还原
    const nameInputs = window.locator('[data-testid^="te-field-name-"]')
    const beforeCount = await nameInputs.count()
    await window.getByTestId('te-delete-field').last().click()
    await expect(nameInputs).toHaveCount(beforeCount - 1)

    // 保存为自定义模板
    await window.getByTestId('te-template-name').fill('我的模板')
    await window.getByTestId('te-save-template').click()
    await expect(window.getByTestId('te-notice')).toContainText('模板「我的模板」已保存')

    // 自定义模板出现在下拉里（optgroup）
    const select = window.getByTestId('te-template')
    await expect(select.locator('optgroup[label="自定义模板"] option')).toHaveCount(1)

    // 应用内置模板（替换全部字段）→ 字段数变化
    await select.selectOption({ index: 0 })
    await window.getByTestId('te-apply-template').click()
    await expect(window.getByTestId('te-notice')).toContainText('已应用模板')

    // 再应用自定义模板，应还原到保存时的字段数
    await select.selectOption('我的模板')
    await window.getByTestId('te-apply-template').click()
    await expect(nameInputs).toHaveCount(beforeCount - 1)

    // 删除：内置模板禁用删除按钮；切到自定义模板后可删
    await select.selectOption({ index: 0 })
    await expect(window.getByTestId('te-delete-template')).toBeDisabled()
    await select.selectOption('我的模板')
    await expect(window.getByTestId('te-delete-template')).toBeEnabled()
    await window.getByTestId('te-delete-template').click()
    await expect(window.getByTestId('te-notice')).toContainText('已删除')
    await expect(select.locator('optgroup[label="自定义模板"] option')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
