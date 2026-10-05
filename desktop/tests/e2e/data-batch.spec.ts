import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

test('批量操作与搜索：搜索过滤 → 批量改值 → 非数值跳过计数 → 二次确认批量删除', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-data-batch-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 新建 3 条角色（名称自动为「角色 1..3」）
    const createButton = window.getByRole('button', { name: '新增测试条目' })
    for (let index = 0; index < 3; index++) {
      await createButton.click()
    }
    await expect(window.getByTestId('item-row')).toHaveCount(3)
    await expect(window.getByTestId('list-count')).toHaveText('显示 3 / 3 条')

    // 首条改名为唯一中文名（避免与随机 UUID 撞词），供搜索断言使用
    await window.getByTestId('item-row').first().click()
    await window.getByTestId('field-name').fill('艾尔文')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.locator('.notice-banner')).toContainText('已保存')

    // 搜索：命中 1 条；无匹配给出空态；清除后恢复
    await window.getByTestId('search-input').fill('艾尔文')
    await expect(window.getByTestId('item-row')).toHaveCount(1)
    await expect(window.getByTestId('list-count')).toHaveText('显示 1 / 3 条')
    await window.getByTestId('search-input').fill('不存在的名字')
    await expect(window.getByTestId('search-empty')).toBeVisible()
    await window.getByTestId('search-clear').click()
    await expect(window.getByTestId('item-row')).toHaveCount(3)

    // 全选 → 批量设置字段值（name → 批量改名）
    await window.getByTestId('select-all').check()
    await expect(window.getByTestId('open-batch-edit')).toHaveText('批量操作（3）')
    await window.getByTestId('open-batch-edit').click()
    await expect(window.getByTestId('batch-panel')).toBeVisible()
    await window.getByTestId('batch-value').fill('批量改名')
    await window.getByTestId('batch-apply').click()
    await expect(window.locator('.notice-banner')).toContainText('已处理 3 项')
    await expect(window.getByTestId('item-row').first()).toContainText('批量改名')

    // 数值增减作用于文本字段：全部跳过并给出计数（与 Python continue 语义一致）
    await window.getByTestId('select-all').check()
    await window.getByTestId('open-batch-edit').click()
    await window.getByTestId('batch-op').selectOption('adjust_number')
    await window.getByTestId('batch-field').selectOption('name')
    await window.getByTestId('batch-apply').click()
    await expect(window.locator('.notice-banner')).toContainText('已处理 0 项，3 项非数值已跳过')

    // 批量删除：需二次确认
    await window.getByTestId('select-all').check()
    await window.getByTestId('open-batch-edit').click()
    await window.getByTestId('batch-op').selectOption('delete_selected')
    await window.getByTestId('batch-delete').click()
    await window.getByTestId('batch-delete-confirm').click()
    await expect(window.locator('.notice-banner')).toContainText('已删除 3 项')
    await expect(window.getByTestId('item-row')).toHaveCount(0)
    await expect(window.locator('.list .empty')).toContainText('暂无数据')
  } finally {
    await app.close()
  }
})