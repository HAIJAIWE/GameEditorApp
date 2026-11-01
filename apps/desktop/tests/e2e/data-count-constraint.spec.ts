import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, dataRows, openCeshuFromHome, openDataEditor, seedCeshu } from './helpers/ceshuData'

/**
 * E51 新增能力的端到端契约网（对齐 旧版 `ui/data_tab::_check_count_constraint` /
 * `_on_rename_item` 与 `ui/components/virtual_list::_show_context_menu`）。
 *
 * 注意：本 spec 无法在本机沙箱执行（Electron `Process failed to launch!`，环境限制），
 * 期望值来自 `desktop/preview/verify-e51.mjs` 在**真实 Chromium** 里跑通的同一组断言，
 * 不是凭代码臆测的。
 */

test('数据条目数量上限：超限先确认 —— 取消不创建，继续才创建', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-count-limit-e2e-'))
  const title = 'E2E 数量上限'
  // 第四章「技能」系统写上限 2（`skill_count` 是 dataCountConstraint 的第二个候选字段）
  seedCeshu(userDataDir, {
    title,
    systems: [{ key: 'skill', label: '技能', dataType: 'skill', config: { skill_count: 2 } }]
  })
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '技能')

    // 先造满 2 条（上限之内不打扰）
    await createDataItem(window)
    await createDataItem(window)
    await expect(dataRows(window)).toHaveCount(2)
    await expect(window.getByTestId('ceshu-data-count-warning')).toHaveCount(0)

    // 第 3 条：拦下，且**不直接创建**
    await createDataItem(window)
    const warning = window.getByTestId('ceshu-data-count-warning')
    await expect(warning).toBeVisible()
    await expect(warning).toContainText('策划书「技能」规定数量上限为 2')
    await expect(warning).toContainText('当前已有 2 个，正在创建第 3 个。')
    await expect(dataRows(window)).toHaveCount(2)

    // 取消 → 横幅收起、条数不变
    await window.getByTestId('ceshu-data-count-cancel').click()
    await expect(warning).toBeHidden()
    await expect(dataRows(window)).toHaveCount(2)

    // 再来一次并「继续创建」→ 才真正落盘
    await createDataItem(window)
    await expect(warning).toBeVisible()
    await window.getByTestId('ceshu-data-count-continue').click()
    await expect(dataRows(window)).toHaveCount(3)
  } finally {
    await app.close()
  }
})

test('条目右键菜单四项 + 重命名（去空白提交 / 空白名视为取消）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-rename-e2e-'))
  const title = 'E2E 条目重命名'
  // 不写上限：同时验证「无约束不打扰」
  seedCeshu(userDataDir, { title, systems: [{ key: 'skill', label: '技能', dataType: 'skill' }] })
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '技能')

    // 无约束时直接创建，不出现数量横幅
    await createDataItem(window)
    await expect(window.getByTestId('ceshu-data-count-warning')).toHaveCount(0)

    const rows = dataRows(window)
    await expect(rows).toHaveCount(1)
    await expect(rows.first()).toContainText('技能 1')

    // 右键 → 菜单四项，顺序同 旧版 virtual_list:217-231
    await rows.first().click({ button: 'right' })
    const menu = window.getByTestId('ceshu-data-menu')
    await expect(menu).toBeVisible()
    await expect(menu.getByTestId('ceshu-data-menu-rename')).toBeVisible()
    await expect(menu.getByTestId('ceshu-data-menu-edit')).toBeVisible()
    await expect(menu.getByTestId('ceshu-data-menu-copy')).toBeVisible()
    await expect(menu.getByTestId('ceshu-data-menu-delete')).toBeVisible()

    // 重命名：输入框自动聚焦（对齐 QInputDialog 的模态抢焦点），提交时去首尾空白
    await menu.getByTestId('ceshu-data-menu-rename').click()
    const input = window.getByTestId('ceshu-data-rename-input')
    await expect(input).toBeVisible()
    await expect(input).toBeFocused()
    await input.fill('  改后的技能名  ')
    await input.press('Enter')
    await expect(input).toBeHidden()
    await expect(rows.first()).toContainText('改后的技能名')

    // F2 进入重命名；空白名回车 = 取消
    await window.getByTestId('ceshu-data-list').focus()
    await window.keyboard.press('F2')
    await expect(input).toBeVisible()
    await expect(input).toHaveValue('改后的技能名')
    await input.fill('   ')
    await input.press('Enter')
    await expect(input).toBeHidden()
    await expect(rows.first()).toContainText('改后的技能名')
  } finally {
    await app.close()
  }
})
