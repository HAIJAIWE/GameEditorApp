import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, openCeshuFromHome, openDataEditor, seedCeshu } from './helpers/ceshuData'

/**
 * 系数公式编辑器（对应 Python `FormulaBuilderDialog`）。
 *
 * 本用例的核心价值是**把 Python 的两个缺陷做成端到端回归锁**：
 * 1. 打开编辑器必须回填原公式真实系数（Python 实测传 `=智力*5` 会显示 `=力量*2+敏捷*1`，点确定即覆盖原公式）；
 * 2. 不可回填的公式必须给出警告且不改动原文（不静默覆盖）。
 *
 * 注：本沙箱 Electron 起不来（`Process failed to launch!`，既有 E2E 同样失败，属环境限制），
 * 本用例按既有模式写就、待 CI 实跑。
 */
test('系数公式编辑器：回填原公式 → 改系数联动 → 应用落盘 → 不可回填时警告且不覆盖', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-formula-builder-e2e-'))
  const title = 'E2E 系数公式编辑器'
  // 播种启用「角色」系统的策划书：`field-attr_list-formula-builder-*` 由 attrpanel 渲染（role.attr_list）
  seedCeshu(userDataDir, {
    title,
    systems: [{ key: 'role', label: '角色', dataType: 'role' }]
  })
  const launch = (): ReturnType<typeof launchApp> =>
    launchApp(userDataDir)

  const app = await launch()
  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '角色')

    await createDataItem(window)
    await window.getByTestId('ceshu-data-item-row').first().click()
    await expect(window.getByTestId('item-editor')).toBeVisible()

    // 新手模板行序：0=力量 1=智力 2=敏捷 3=体质 4=HP；HP = 5*10 + 5*20 + 5*5 = 175.0
    await expect(window.getByTestId('field-attr_list-formula-4')).toHaveValue('=力量*10+体质*20+敏捷*5')
    await expect(window.getByTestId('field-attr_list-result-4')).toHaveText('175.0')

    // —— 回归锁 1：打开编辑器回填原公式的真实系数（而非默认系数表）——
    await window.getByTestId('field-attr_list-formula-builder-toggle-4').click()
    await expect(window.getByTestId('field-attr_list-formula-builder-4-panel')).toBeVisible()
    await expect(window.getByTestId('field-attr_list-formula-builder-4-coeff-0')).toHaveValue('10')
    await expect(window.getByTestId('field-attr_list-formula-builder-4-coeff-1')).toHaveValue('0')
    await expect(window.getByTestId('field-attr_list-formula-builder-4-coeff-2')).toHaveValue('5')
    await expect(window.getByTestId('field-attr_list-formula-builder-4-coeff-3')).toHaveValue('20')
    // 无可回填内容时才显示警告；此处应无警告
    await expect(window.getByTestId('field-attr_list-formula-builder-4-warning')).toHaveCount(0)
    // 预览按属性列表顺序归一（与 Python 一致）
    await expect(window.getByTestId('field-attr_list-formula-builder-4-preview')).toHaveText(
      '=力量*10+敏捷*5+体质*20'
    )

    // —— 改系数联动预览：力量系数 10 → 20 ——
    await window.getByTestId('field-attr_list-formula-builder-4-coeff-0').fill('20')
    await expect(window.getByTestId('field-attr_list-formula-builder-4-preview')).toHaveText(
      '=力量*20+敏捷*5+体质*20'
    )

    // 清空 → 预览 =0；取消 → 原文不受影响
    await window.getByTestId('field-attr_list-formula-builder-4-clear').click()
    await expect(window.getByTestId('field-attr_list-formula-builder-4-preview')).toHaveText('=0')
    await window.getByTestId('field-attr_list-formula-builder-4-cancel').click()
    await expect(window.getByTestId('field-attr_list-formula-builder-4-panel')).toHaveCount(0)
    await expect(window.getByTestId('field-attr_list-formula-4')).toHaveValue(
      '=力量*10+体质*20+敏捷*5'
    )

    // —— 应用：公式写回 + 结果重算（5*20 + 5*5 + 5*20 = 225.0）——
    await window.getByTestId('field-attr_list-formula-builder-toggle-4').click()
    await window.getByTestId('field-attr_list-formula-builder-4-coeff-0').fill('20')
    await window.getByTestId('field-attr_list-formula-builder-4-apply').click()
    await expect(window.getByTestId('field-attr_list-formula-builder-4-panel')).toHaveCount(0)
    await expect(window.getByTestId('field-attr_list-formula-4')).toHaveValue(
      '=力量*20+敏捷*5+体质*20'
    )
    await expect(window.getByTestId('field-attr_list-result-4')).toHaveText('225.0')

    // —— 再次打开：回填的是刚应用的公式，而不是被默认值重置 ——
    await window.getByTestId('field-attr_list-formula-builder-toggle-4').click()
    await expect(window.getByTestId('field-attr_list-formula-builder-4-coeff-0')).toHaveValue('20')
    await expect(window.getByTestId('field-attr_list-formula-builder-4-coeff-1')).toHaveValue('0')
    await window.getByTestId('field-attr_list-formula-builder-4-cancel').click()

    // —— 回归锁 2：不可回填的公式给出警告，且取消后原文分毫未动 ——
    await window.getByTestId('field-attr_list-formula-4').fill('=(力量+体质)*2')
    await window.getByTestId('field-attr_list-formula-builder-toggle-4').click()
    await expect(window.getByTestId('field-attr_list-formula-builder-4-warning')).toContainText(
      '=(力量+体质)*2'
    )
    await expect(window.getByTestId('field-attr_list-formula-builder-4-warning')).toContainText(
      '无法用系数编辑器表示'
    )
    // 系数全 0（不伪造），且此时确定不会悄悄写回默认值
    await expect(window.getByTestId('field-attr_list-formula-builder-4-coeff-0')).toHaveValue('0')
    await window.getByTestId('field-attr_list-formula-builder-4-cancel').click()
    await expect(window.getByTestId('field-attr_list-formula-4')).toHaveValue('=(力量+体质)*2')

    // 恢复为可回填的公式后保存
    await window.getByTestId('field-attr_list-formula-4').fill('=力量*20+敏捷*5+体质*20')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.locator('.notice-banner')).toContainText('已保存')

    // 落盘校验：存储里 HP 行即编辑器产出的式子
    const roles = await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: { data: { listItems: (req: { type: string }) => Promise<unknown> } }
        }
      ).mbApi
      return api.data.listItems({ type: 'role' })
    })
    const stored = (roles as Array<{ data: Record<string, unknown> }>)[0]
    const attrList = stored?.data['attr_list'] as Array<Record<string, unknown>>
    expect(attrList.find((row) => row['name'] === 'HP')).toEqual({
      name: 'HP',
      category: '派生',
      formula: '=力量*20+敏捷*5+体质*20'
    })
  } finally {
    await app.close()
  }

  // 重启（同一 userData 目录）：系数编辑器仍能回填保存后的公式
  const app2 = await launch()
  try {
    const window = await app2.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '角色')
    await window.getByTestId('ceshu-data-item-row').first().click()
    await expect(window.getByTestId('field-attr_list-result-4')).toHaveText('225.0')
    await window.getByTestId('field-attr_list-formula-builder-toggle-4').click()
    await expect(window.getByTestId('field-attr_list-formula-builder-4-coeff-0')).toHaveValue('20')
    await expect(window.getByTestId('field-attr_list-formula-builder-4-coeff-3')).toHaveValue('20')
  } finally {
    await app2.close()
  }
})

test('系数公式编辑器：纯常量公式（=100）同样拒绝回填并给警告', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-formula-builder-const-e2e-'))
  const title = 'E2E 纯常量公式'
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
    await createDataItem(window)
    await window.getByTestId('ceshu-data-item-row').first().click()

    await window.getByTestId('field-attr_list-formula-4').fill('=100')
    await window.getByTestId('field-attr_list-formula-builder-toggle-4').click()
    await expect(window.getByTestId('field-attr_list-formula-builder-4-warning')).toContainText(
      '纯常量'
    )
    await expect(window.getByTestId('field-attr_list-formula-builder-4-preview')).toHaveText('=0')
    await window.getByTestId('field-attr_list-formula-builder-4-cancel').click()
    await expect(window.getByTestId('field-attr_list-formula-4')).toHaveValue('=100')
  } finally {
    await app.close()
  }
})
