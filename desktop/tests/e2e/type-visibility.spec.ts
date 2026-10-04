import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

test('类型可见性：默认显示全部，取消勾选「技能」后侧栏隐藏该类型', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-type-visibility-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()

    // 默认（未设置偏好）必须显示全部 12 个类型，否则会拖挂其他 E2E
    await expect(window.getByTestId('type-tab')).toHaveCount(12)

    await window.getByTestId('open-type-visibility').click()
    await expect(window.getByTestId('type-visibility-panel')).toBeVisible()

    // 取消勾选「技能 (skill)」（侧栏类型列表中的第 5 个）
    const skillCheck = window
      .locator('label.ai-gen-check', { hasText: '技能 (skill)' })
      .getByTestId('tv-check')
    await skillCheck.uncheck()
    await expect(window.getByTestId('tv-count')).toContainText('已选择 11/12 个类型')

    await window.getByTestId('tv-confirm').click()
    await expect(window.getByTestId('type-visibility-panel')).toBeHidden()
    await expect(window.getByTestId('type-tab')).toHaveCount(11)
  } finally {
    await app.close()
  }
})
