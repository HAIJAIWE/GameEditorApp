import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * 点「应用模板」，若出现失联确认则确认替换。
 *
 * 2026-10-19 起：模板缺少当前类型已有字段时，会先出确认条（那些字段的已填数据会留在
 * 文件里但界面上不再显示）。这条规格原本直接点应用就生效，现在必须走确认。
 *
 * ⚠️ 内置模板是同步替换，自定义模板要等 `schema:getFieldTemplate` 的 IPC 回来才出确认条 ——
 * 所以这里不能用「点完立刻 count()」，必须给确认条一个出现的机会。
 */
async function applyTemplateAndConfirm(window: Page): Promise<void> {
  await window.getByTestId('te-apply-template').click()
  try {
    await window.getByTestId('te-template-confirm-apply').click({ timeout: 3000 })
  } catch {
    // 没有失联字段 ⇒ 直接生效，没有确认条可点
  }
}

test('自定义字段模板：保存 → 出现在下拉 → 应用还原完整定义 → 删除', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-field-tpl-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 新 IA 无侧栏入口：工具菜单 → 字段结构编辑器
    await window.getByTestId('menu-title-tools').click()
    await window.getByTestId('menuitem-tools-fieldEditor').click()
    await expect(window.getByTestId('type-editor-panel')).toBeVisible()
    await window.getByTestId('te-type-tab').filter({ hasText: '职业' }).click()

    // 改出一个可辨识的字段集：删掉最后一个字段，便于验证「应用模板」能还原
    const nameInputs = window.locator('[data-testid^="te-field-name-"]')
    const beforeCount = await nameInputs.count()
    // 字段行删除按钮已随编辑器重写改为 per-row testid（前缀 `te-field-remove-`，含行索引）
    await window.locator('[data-testid^="te-field-remove-"]').last().click()
    await expect(nameInputs).toHaveCount(beforeCount - 1)

    // 保存为自定义模板
    await window.getByTestId('te-template-name').fill('我的模板')
    await window.getByTestId('te-save-template').click()
    await expect(window.getByTestId('te-notice')).toContainText('模板「我的模板」已保存')

    // 自定义模板出现在下拉里（optgroup）
    const select = window.getByTestId('te-template')
    await expect(select.locator('optgroup[label="自定义模板"] option')).toHaveCount(1)

    // 应用内置模板（替换全部字段）→ 先出失联确认，确认后字段数变化
    await select.selectOption({ index: 0 })
    await window.getByTestId('te-apply-template').click()
    await expect(window.getByTestId('te-template-confirm')).toBeVisible()
    await window.getByTestId('te-template-confirm-apply').click()
    await expect(window.getByTestId('te-notice')).toContainText('已应用模板')

    // 再应用自定义模板，应还原到保存时的字段数
    await select.selectOption('我的模板')
    await applyTemplateAndConfirm(window)
    await expect(nameInputs).toHaveCount(beforeCount - 1)

    // 删除：内置模板禁用删除按钮；切到自定义模板后可删
    await select.selectOption({ index: 0 })
    await expect(window.getByTestId('te-delete-template')).toBeDisabled()
    await select.selectOption('我的模板')
    await expect(window.getByTestId('te-delete-template')).toBeEnabled()
    await window.getByTestId('te-delete-template').click()
    await expect(window.getByTestId('te-notice')).toContainText('已删除')
    await expect(select.locator('optgroup[label="自定义模板"] option')).toHaveCount(0)
  } finally {
    await app.close()
  }
})
