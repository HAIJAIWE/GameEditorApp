import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, openCeshuFromHome, openDataEditor, openMenuItem, seedCeshu } from './helpers/ceshuData'

test('字段结构：新增字段 → 保存 → 数据表表单联动 → 重启后持久化', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-type-editor-e2e-'))
  const title = 'E2E 字段结构'
  // 后续要在「职业」数据编辑器里验证新字段联动，故启用 job 系统
  seedCeshu(userDataDir, {
    title,
    systems: [{ key: 'job', label: '职业', dataType: 'job' }]
  })
  const launch = (): ReturnType<typeof launchApp> =>
    launchApp(userDataDir)

  const app = await launch()
  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)

    // 打开字段结构编辑器（工具菜单），选中「职业」类型（既有类型）
    await openMenuItem(window, 'tools', 'fieldEditor')
    await expect(window.getByTestId('type-editor-panel')).toBeVisible()
    await window.getByTestId('te-type-tab').filter({ hasText: '职业' }).click()

    // 校验路径：清空中文名后保存 → 领域校验错误提示
    await window.getByTestId('te-type-name').fill('')
    await window.getByTestId('te-save').click()
    await expect(window.getByTestId('te-errors')).toContainText('名称不能为空')

    // 恢复名称并新增字段（默认排在末尾）
    await window.getByTestId('te-type-name').fill('职业')
    await window.getByTestId('te-add-field').click()
    await window.locator('[data-testid^="te-field-name-"]').last().fill('test_field')
    await window.locator('[data-testid^="te-field-label-"]').last().fill('测试字段:')
    await window.getByTestId('te-save').click()
    await expect(window.getByTestId('te-notice')).toContainText('已保存')

    await window.getByTestId('te-close').click()
    await expect(window.getByTestId('type-editor-panel')).toBeHidden()

    // 表单联动：切到职业类型，新增条目 → 表单出现新字段，填写并保存
    await openDataEditor(window, '职业')
    await createDataItem(window)
    await expect(window.getByTestId('field-test_field')).toBeVisible()
    await window.getByTestId('field-test_field').fill('hello')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.locator('.notice-banner')).toBeVisible()
  } finally {
    await app.close()
  }

  // 重启（同一 userData 目录）：schema 从 type_schema.json 加载，新字段与条目值均保留
  const app2 = await launch()
  try {
    const window = await app2.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '职业')
    await window.getByTestId('ceshu-data-item-row').first().click()
    await expect(window.getByTestId('field-test_field')).toHaveValue('hello')
  } finally {
    await app2.close()
  }
})
