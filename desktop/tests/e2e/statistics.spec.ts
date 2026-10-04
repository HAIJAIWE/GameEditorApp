import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

test('数据统计：概览计数与占比 → 平衡性分析（按 schema 数值字段自动发现）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-statistics-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    // 默认活跃类型 role（schema 里 role 无扁平数值字段，属性在 attr_list）
    const createButton = window.getByRole('button', { name: '新增测试条目' })
    for (let index = 0; index < 2; index++) {
      await createButton.click()
    }
    await expect(window.getByTestId('item-row')).toHaveCount(2)

    // 打开统计：概览显示总数与角色占比
    await window.getByTestId('open-stats').click()
    await expect(window.getByTestId('stats-panel')).toBeVisible()
    await expect(window.getByTestId('stats-total')).toContainText('总数据量：2 项')
    await expect(window.getByTestId('stats-row')).toHaveCount(1)
    await expect(window.getByTestId('stats-row').first()).toContainText('角色')
    await expect(window.getByTestId('stats-row').first()).toContainText('100.0%')

    // 平衡性分析：默认选到第一个有数值字段的类型（schema 里 role 没有，故是 job），无数据
    await window.getByTestId('stats-tab-balance').click()
    await expect(window.getByTestId('stats-no-items')).toContainText('没有职业数据')

    // 切到技能并造两条带数值的数据，再回来应能算出均值
    await window.getByTestId('stats-panel').getByRole('button', { name: '关闭' }).click()
    await window.getByTestId('type-tab').filter({ hasText: '技能' }).click()
    await createButton.click()
    await window.getByTestId('item-row').first().click()
    await window.getByTestId('field-value').fill('10')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.locator('.notice-banner')).toContainText('已保存')

    await window.getByTestId('open-stats').click()
    await expect(window.getByTestId('stats-panel')).toBeVisible()
    await expect(window.getByTestId('stats-total')).toContainText('总数据量：3 项')
    await window.getByTestId('stats-tab-balance').click()
    await window.getByTestId('stats-balance-type').selectOption('skill')
    await expect(window.getByTestId('stats-summary').first()).toContainText('基础数值')
    await expect(window.getByTestId('stats-avg').first()).toHaveText('10.00')
    await expect(window.getByTestId('stats-verdict').first()).toContainText('平衡性评估')
  } finally {
    await app.close()
  }
})
