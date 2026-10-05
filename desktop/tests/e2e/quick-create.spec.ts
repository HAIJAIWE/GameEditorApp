import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { openCeshuFromHome, openDataEditor, openMenuItem, seedCeshu } from './helpers/ceshuData'

test('快速创建：打开面板 → 选模板 → 创建（字段初始值来自模板）→ 换类型清空选中', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-quick-create-e2e-'))
  const title = 'E2E 快速创建'
  // 默认作用类型 = schema 首个类型 role（内置 schema 顺序），故需启用「角色」；
  // 「技能」用于后半段换类型断言（qc-type → skill）
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
    await openDataEditor(window, '角色')

    // 打开快速创建面板（工具菜单；默认类型 = 当前活跃类型 role）
    await openMenuItem(window, 'tools', 'quickCreate')
    await expect(window.getByTestId('qc-panel')).toBeVisible()

    // 未选模板时「创建」禁用（避免空模板落库）
    await expect(window.getByTestId('qc-create')).toBeDisabled()

    // 选「战士」模板：创建按钮解禁，预览显示模板初始值
    await window.getByTestId('qc-card-战士').click()
    await expect(window.getByTestId('qc-create')).toBeEnabled()
    await expect(window.getByTestId('qc-panel')).toContainText('新战士')

    // 创建 → 提示含模板名与条目名；面板关闭后策划书编辑器重挂载并重载列表 → 列表 +1
    await window.getByTestId('qc-create').click()
    await expect(window.locator('.notice-banner')).toContainText('已按模板「战士」创建')
    await expect(window.getByTestId('qc-panel')).toHaveCount(0)
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(1)
    await expect(window.getByTestId('ceshu-data-item-row').first()).toContainText('新战士')

    // 换类型：选中被清空（旧选中不属于新类型），创建按钮重新禁用
    await openMenuItem(window, 'tools', 'quickCreate')
    await expect(window.getByTestId('qc-panel')).toBeVisible()
    await expect(window.getByTestId('qc-create')).toBeDisabled()
    await window.getByTestId('qc-type').selectOption('skill')
    await expect(window.getByTestId('qc-card-单体攻击')).toBeVisible()
    await expect(window.getByTestId('qc-card-战士')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
