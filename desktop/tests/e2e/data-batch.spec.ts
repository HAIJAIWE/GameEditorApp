import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import {
  createDataItem,
  openCeshuFromHome,
  openDataEditor,
  openMenuItem,
  readItems,
  seedCeshu
} from './helpers/ceshuData'

/**
 * 批量操作面板（新 IA）。
 *
 * 语义变化：旧版是「在数据表里勾选若干行 → 批量」，勾选/列表计数等 testid 已随顶层数据表视图删除。
 * 新面板是**自持作用域**（`BatchEditPanel.tsx`：选类型 → 作用于该类型**全部**条目），
 * 从「工具」菜单打开，不依赖任何外部勾选。故本用例按新语义重写为：
 * 选类型 → 断言条目数提示 → 应用 → **回读数据层**确认真的改了。
 */
test('批量操作（自选作用范围）：按类型批量改值 → 数值增减跳过非数值 → 二次确认批量删除', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-data-batch-e2e-'))
  const title = 'E2E 批量操作'
  seedCeshu(userDataDir, {
    title,
    systems: [{ key: 'role', label: '角色', dataType: 'role' }]
  })
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '角色')

    // 新建 3 条角色（名称自动为「角色 1..3」）
    await createDataItem(window)
    await createDataItem(window)
    await createDataItem(window)
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(3)

    // 首条改名为唯一中文名（避免与随机 UUID 撞词）。
    // 落盘校验代替原 `.notice-banner` + 「已保存」断言（保存反馈走 toast、不走 App 级 notice，
    // 该断言为既有失败；见 attr-formula-builder.spec.ts 踩坑记录）
    await window.getByTestId('ceshu-data-item-row').first().click()
    await window.getByTestId('field-name').fill('艾尔文')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect
      .poll(async () => {
        const roles = await readItems(window, 'role')
        return roles[0]?.data['name']
      })
      .toBe('艾尔文')

    // 打开批量面板（工具菜单）：默认作用类型 = 首个 schema 类型 role，提示该类型全部条目数
    await openMenuItem(window, 'tools', 'batchEdit')
    await expect(window.getByTestId('batch-panel')).toBeVisible()
    await expect(window.getByTestId('batch-type')).toHaveValue('role')
    await expect(window.getByTestId('batch-scope-hint')).toContainText('该类型共 3 项')

    // 批量设置字段值：name → 批量改名（作用于该类型全部 3 条）
    await window.getByTestId('batch-field').selectOption('name')
    await window.getByTestId('batch-value').fill('批量改名')
    await window.getByTestId('batch-apply').click()
    await expect(window.locator('.notice-banner')).toContainText('已处理 3 项')

    // 面板关闭后策划书编辑器重挂载并重载列表 → DOM 与数据层都应反映改名
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(3)
    await expect(window.getByTestId('ceshu-data-item-row').first()).toContainText('批量改名')
    const renamed = await readItems(window, 'role')
    expect(renamed).toHaveLength(3)
    expect(renamed.every((item) => item.data['name'] === '批量改名')).toBe(true)

    // 数值增减作用于文本字段：全部跳过并给出计数（与 Python continue 语义一致）
    await openMenuItem(window, 'tools', 'batchEdit')
    await window.getByTestId('batch-op').selectOption('adjust_number')
    await window.getByTestId('batch-field').selectOption('name')
    await window.getByTestId('batch-apply').click()
    await expect(window.locator('.notice-banner')).toContainText('已处理 0 项，3 项非数值已跳过')

    // 批量删除：需二次确认
    await openMenuItem(window, 'tools', 'batchEdit')
    await expect(window.getByTestId('batch-scope-hint')).toContainText('该类型共 3 项')
    await window.getByTestId('batch-op').selectOption('delete_selected')
    await window.getByTestId('batch-delete').click()
    await window.getByTestId('batch-delete-confirm').click()
    await expect(window.locator('.notice-banner')).toContainText('已删除 3 项')

    // 回读数据层：3 条已全部删除
    await expect.poll(async () => (await readItems(window, 'role')).length).toBe(0)
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(0)
    await expect(window.getByTestId('ceshu-data-empty')).toBeVisible()
  } finally {
    await app.close()
  }
})
