import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

test('属性系统：改公式示例值实时更新 → 非法公式/悬空依赖被拒 → 保存 → 重启后持久化', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-attr-system-e2e-'))
  const launch = (): ReturnType<typeof launchApp> =>
    launchApp(userDataDir)

  const app = await launch()
  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 新 IA 无侧栏入口：工具菜单 → 属性系统编辑器
    await window.getByTestId('menu-title-tools').click()
    await window.getByTestId('menuitem-tools-attrSystem').click()
    await expect(window.getByTestId('attr-system-panel')).toBeVisible()

    // 默认集第 5 行是 HP（前 4 行为基础属性）：默认基础值 10 → 350
    await expect(window.getByTestId('attr-name-4')).toHaveValue('HP')
    await expect(window.getByTestId('attr-preview-4')).toHaveText('350')

    // 改公式 → 示例值实时更新（力量*12 → 120+200+50）
    await window.getByTestId('attr-formula-4').fill('= 力量*12 + 体质*20 + 敏捷*5')
    await expect(window.getByTestId('attr-preview-4')).toHaveText('370')

    // 非法公式：行内提示 + 保存被拒
    await window.getByTestId('attr-formula-4').fill('= 力量*')
    await expect(window.getByTestId('attr-invalid-4')).toBeVisible()
    await window.getByTestId('attr-save').click()
    await expect(window.getByTestId('attr-errors')).toContainText('公式无法解析')

    // 依赖不存在的属性：保存被拒
    await window.getByTestId('attr-formula-4').fill('= 不存在*2')
    await window.getByTestId('attr-save').click()
    await expect(window.getByTestId('attr-errors')).toContainText('依赖了不存在的属性')

    // 修正后保存成功
    await window.getByTestId('attr-formula-4').fill('= 力量*12 + 体质*20 + 敏捷*5')
    await window.getByTestId('attr-save').click()
    await expect(window.getByTestId('attr-notice')).toContainText('已保存')
    await expect(window.getByTestId('attr-preview-4')).toHaveText('370')

    await window.getByTestId('attr-close').click()
    await expect(window.getByTestId('attr-system-panel')).toBeHidden()
  } finally {
    await app.close()
  }

  // 重启（同一 userData 目录）：从 attr_system.json 加载，公式与示例值保留
  const app2 = await launch()
  try {
    const window = await app2.firstWindow()
    await waitReady(window)
    // 新 IA 无侧栏入口：工具菜单 → 属性系统编辑器
    await window.getByTestId('menu-title-tools').click()
    await window.getByTestId('menuitem-tools-attrSystem').click()
    await expect(window.getByTestId('attr-formula-4')).toHaveValue('= 力量*12 + 体质*20 + 敏捷*5')
    await expect(window.getByTestId('attr-preview-4')).toHaveText('370')
  } finally {
    await app2.close()
  }
})