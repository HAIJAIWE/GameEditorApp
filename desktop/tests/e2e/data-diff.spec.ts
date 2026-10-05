import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * 数据对比面板：设基线 → 改数据并保存 → 重开 → 与基线对比，应报告「修改」。
 * 依赖父代理在工具条接线的 testid `open-data-diff`（本切片不接线）。
 */
test('数据对比：设定基线后修改数据 → 与基线对比应报告修改', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-data-diff-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 建 2 条角色（默认活跃类型为 role）
    const createButton = window.getByRole('button', { name: '新增测试条目' })
    await createButton.click()
    await createButton.click()
    await expect(window.getByTestId('item-row')).toHaveCount(2)

    // 打开数据对比，设当前为基线，然后关闭
    await window.getByTestId('open-data-diff').click()
    const panel = window.getByTestId('data-diff-panel')
    await expect(panel).toBeVisible()
    await expect(window.getByTestId('dd-counts')).toContainText('当前条目数：2')
    await window.getByTestId('dd-set-baseline').click()
    await expect(window.getByTestId('dd-notice')).toContainText('已设当前 2 条数据为基线')
    await panel.getByRole('button', { name: '关闭' }).click()
    await expect(panel).toHaveCount(0)

    // 改一条角色数据并保存
    await window.getByTestId('item-row').first().click()
    await window.getByTestId('field-name').fill('改动后的角色名')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.locator('.notice-banner')).toContainText('已保存')

    // 重开数据对比 → 与基线对比
    await window.getByTestId('open-data-diff').click()
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
