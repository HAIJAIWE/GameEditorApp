import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, openCeshuFromHome, openDataEditor, openMenuItem, seedCeshu } from './helpers/ceshuData'

test('高级搜索：跨类型 + 按字段检索 + 结果跳转', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-adv-search-e2e-'))
  const title = 'E2E 高级搜索'
  // 新 IA：数据编辑在策划书预览面板的「角色」/「技能」标签；高级搜索从「工具」菜单打开
  seedCeshu(userDataDir, {
    title,
    systems: [
      { key: 'role', label: '角色', dataType: 'role' },
      { key: 'skill', label: '技能', dataType: 'skill' }
    ]
  })
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)

    // 角色：造 2 条（名称自动为「角色 1 / 角色 2」）
    await openDataEditor(window, '角色')
    await createDataItem(window)
    await createDataItem(window)
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(2)

    // 切到技能再造 1 条，形成「当前类型是技能，但库里还有角色」的跨类型场景
    await openDataEditor(window, '技能')
    await createDataItem(window)
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(1)

    // 打开高级搜索（工具菜单）：未输入关键词时只显示提示
    await openMenuItem(window, 'tools', 'advancedSearch')
    await expect(window.getByTestId('advanced-search-panel')).toBeVisible()
    await expect(window.getByTestId('adv-search-hint')).toBeVisible()

    // 跨类型搜索（TS 增强）：类型=全部类型，关键词「角色」→ 命中 2 条角色（当前类型是技能也不影响）
    await window.getByTestId('adv-search-keyword').fill('角色')
    await expect(window.getByTestId('adv-search-count')).toContainText('命中 2 条')
    await expect(window.getByTestId('adv-search-row')).toHaveCount(2)
    await expect(window.getByTestId('adv-search-row').first()).toContainText('角色')

    // 限定类型为技能 → 同样的词无结果
    await window.getByTestId('adv-search-type').selectOption('skill')
    await expect(window.getByTestId('adv-search-count')).toContainText('命中 0 条')
    await expect(window.getByTestId('adv-search-empty')).toBeVisible()

    // 类型切回全部 → 恢复 2 条，点击结果行跳转到该条目
    await window.getByTestId('adv-search-type').selectOption('__all__')
    await expect(window.getByTestId('adv-search-row')).toHaveCount(2)
    await window.getByTestId('adv-search-row').first().click()

    // 跳转后落在目标条目：预览面板切到角色且该行处于选中态
    const selectedRow = window.locator('[data-testid="ceshu-data-item-row"].selected')
    await expect(selectedRow).toHaveCount(1)
    await expect(selectedRow).toContainText('角色')
  } finally {
    await app.close()
  }
})
