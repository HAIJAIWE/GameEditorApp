import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, openCeshuFromHome, openDataEditor, seedCeshu } from './helpers/ceshuData'

/**
 * 删除二次确认（对齐 旧版 `_on_delete_clicked` 的确认框）。
 *
 * 背景：删除入口（表单底部「删除」/ 右键菜单「删除」）原本是**无确认直删**；
 * 现改为先弹内联确认条，确认后才落盘——避免误删。本规格锁两条路径 + 取消不删。
 */
test('数据编辑器：表单「删除」先弹二次确认，确认才落盘', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-data-del-'))
  const title = 'E2E 删除二次确认'
  seedCeshu(userDataDir, { title, systems: [{ key: 'skill', label: '技能', dataType: 'skill' }] })
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '技能')
    await createDataItem(window)
    await expect(window.getByTestId('item-editor').first()).toBeVisible()

    const rows = window.locator('[data-testid="ceshu-data-item-row"]')
    await expect(rows).toHaveCount(1)

    // 点「删除」→ 弹确认条，且此时尚未删除（行数仍为 1）
    await window.getByTestId('item-form-delete').click()
    const confirm = window.getByTestId('ceshu-data-delete-confirm')
    await expect(confirm).toBeVisible()
    await expect(rows).toHaveCount(1)

    // 「取消」→ 确认条消失，条目保留
    await window.getByTestId('ceshu-data-delete-confirm-no').click()
    await expect(confirm).toHaveCount(0)
    await expect(rows).toHaveCount(1)

    // 再次「删除」→ 确认 → 真正落盘，行数归零
    await window.getByTestId('item-form-delete').click()
    await expect(confirm).toBeVisible()
    await window.getByTestId('ceshu-data-delete-confirm-yes').click()
    await expect(confirm).toHaveCount(0)
    await expect(rows).toHaveCount(0)
  } finally {
    await app.close()
  }
})

test('数据编辑器：右键菜单「删除」同样走二次确认', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-data-del-menu-'))
  const title = 'E2E 右键删除确认'
  seedCeshu(userDataDir, { title, systems: [{ key: 'skill', label: '技能', dataType: 'skill' }] })
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '技能')
    await createDataItem(window)
    await expect(window.getByTestId('item-editor').first()).toBeVisible()

    const rows = window.locator('[data-testid="ceshu-data-item-row"]')
    await expect(rows).toHaveCount(1)

    // 右键条目 → 菜单「删除」→ 弹确认条（未删）
    await rows.first().click({ button: 'right' })
    await window.getByTestId('ceshu-data-menu-delete').click()
    const confirm = window.getByTestId('ceshu-data-delete-confirm')
    await expect(confirm).toBeVisible()
    await expect(rows).toHaveCount(1)

    // 确认 → 落盘
    await window.getByTestId('ceshu-data-delete-confirm-yes').click()
    await expect(confirm).toHaveCount(0)
    await expect(rows).toHaveCount(0)
  } finally {
    await app.close()
  }
})
