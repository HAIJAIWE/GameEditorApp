import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

test('高级搜索：跨类型 + 按字段检索 + 结果跳转', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-adv-search-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 默认活跃类型 role：造 2 条角色
    const createButton = window.getByRole('button', { name: '新增测试条目' })
    for (let index = 0; index < 2; index++) {
      await createButton.click()
    }
    await expect(window.getByTestId('item-row')).toHaveCount(2)

    // 切到技能再造 1 条，形成「当前类型是技能，但库里还有角色」的跨类型场景
    await window.getByTestId('type-tab').filter({ hasText: '技能' }).click()
    await createButton.click()
    await expect(window.getByTestId('item-row')).toHaveCount(1)

    // 打开高级搜索：未输入关键词时只显示提示
    await window.getByTestId('open-advanced-search').click()
    await expect(window.getByTestId('advanced-search-panel')).toBeVisible()
    await expect(window.getByTestId('adv-search-hint')).toBeVisible()

    // 跨类型搜索（TS 增强）：类型=全部类型，关键词「角色」→ 命中 2 条角色（当前类型是技能也不影响）
    await window.getByTestId('adv-search-keyword').fill('角色')
    await expect(window.getByTestId('adv-search-count')).toContainText('命中 2 条')
    await expect(window.getByTestId('adv-search-row')).toHaveCount(2)
    await expect(window.getByTestId('adv-search-row').first()).toContainText('角色')

    // 限定类型为技能 → 同样的词无结果（验证 Python 的单类型语义仍可复现）
    await window.getByTestId('adv-search-type').selectOption('skill')
    await expect(window.getByTestId('adv-search-count')).toContainText('命中 0 条')
    await expect(window.getByTestId('adv-search-empty')).toBeVisible()

    // 类型切回全部 → 恢复 2 条，点击结果行跳转到该条目
    await window.getByTestId('adv-search-type').selectOption('__all__')
    await expect(window.getByTestId('adv-search-row')).toHaveCount(2)
    await window.getByTestId('adv-search-row').first().click()

    // 跳转后落在目标条目：列表切到角色类型且该行处于选中态
    await expect(window.locator('.item-row.selected')).toHaveCount(1)
    await expect(window.locator('.item-row.selected')).toContainText('角色')
  } finally {
    await app.close()
  }
})
