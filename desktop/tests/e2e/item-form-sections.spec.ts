import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * 条目编辑器分区布局（对应 Python `DynamicFormWidget` + `FIELD_GROUPS`）。
 *
 * 锁三件事：
 * 1. 分区结构/图标/默认折叠照抄 Python；
 * 2. `attribute_panel` 分区绑定 `attr_list` 且**只渲染一次**（修正 Python 的重复渲染）；
 * 3. 分区化重构后**保存链路仍然正确**（控件挂载方式变了，这是本次改动的真实风险）。
 *
 * 注：本沙箱 Electron 起不来（`Process failed to launch!`，既有 E2E 同样失败，属环境限制），
 * 本用例按既有模式写就、待 CI 实跑。
 */
test('条目编辑器分区：结构/折叠/双列标签 + attrpanel 不重复渲染 + 保存往返', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-form-sections-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // —— 角色：5 个分区，属性面板分区在第 1 个 ——
    await window.getByTestId('type-tab').filter({ hasText: '角色' }).click()
    await window.getByRole('button', { name: '新增测试条目' }).click()
    await window.getByTestId('item-row').first().click()
    await expect(window.getByTestId('item-editor')).toBeVisible()

    await expect(window.getByTestId('form-section-0')).toContainText('基础信息')
    await expect(window.getByTestId('form-section-1')).toContainText('属性面板 (RPG三层体系)')
    await expect(window.getByTestId('form-section-2')).toContainText('技能 & 天赋')
    await expect(window.getByTestId('form-section-3')).toContainText('特殊机制')
    await expect(window.getByTestId('form-section-4')).toContainText('描述 & 图片')
    await expect(window.getByTestId('form-section-5')).toHaveCount(0)

    // 属性面板分区承载 attr_list，且全表只有一份（Python 会渲染两个控件）
    await expect(window.getByTestId('form-section-1').getByTestId('field-attr_list')).toHaveCount(1)
    await expect(window.getByTestId('field-attr_list')).toHaveCount(1)

    // 默认折叠分区：body 不渲染（Python collapsed=True 的分区）
    await expect(window.getByTestId('field-mechanism')).toHaveCount(0)
    await expect(window.getByTestId('form-section-3-toggle')).toHaveAttribute('aria-expanded', 'false')
    await window.getByTestId('form-section-3-toggle').click()
    await expect(window.getByTestId('field-mechanism')).toHaveCount(1)
    await expect(window.getByTestId('form-section-3-toggle')).toHaveAttribute('aria-expanded', 'true')

    // 展开后编辑 + 保存：验证分区化后保存链路仍正确
    await window.getByTestId('field-mechanism').fill('血量低于 30% 时获得减伤')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.locator('.notice-banner')).toContainText('已保存')

    const roles = await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: { data: { listItems: (req: { type: string }) => Promise<unknown> } }
        }
      ).mbApi
      return api.data.listItems({ type: 'role' })
    })
    const stored = (roles as Array<{ data: Record<string, unknown> }>)[0]
    expect(stored?.data['mechanism']).toBe('血量低于 30% 时获得减伤')
    // 折叠分区未改动过的字段仍按默认载入，未被清空（新条目默认名 = 「角色 N」）
    await expect(window.getByTestId('field-name')).toHaveValue('角色 1')

    // —— 技能：数值配置为双列 grid，标签用 STAT_LABELS 覆盖 ——
    await window.getByTestId('type-tab').filter({ hasText: '技能' }).click()
    await window.getByRole('button', { name: '新增测试条目' }).click()
    await window.getByTestId('item-row').first().click()
    const grid = window.getByTestId('form-section-1')
    await expect(grid).toContainText('数值配置')
    await expect(window.getByTestId('form-section-1-grid')).toBeVisible()
    // value → '📊 数值'、cd → '⏱️ CD'（照抄 Python STAT_LABELS，仅 grid 分区生效）
    await expect(grid).toContainText('📊 数值')
    await expect(grid).toContainText('⏱️ CD')
    // 非 grid 分区用字段自身 label（技能「基础信息」里的「技能名称:」）
    await expect(window.getByTestId('form-section-0')).toContainText('技能名称:')

    // —— 职业：7 个分区，后三个默认折叠 ——
    await window.getByTestId('type-tab').filter({ hasText: '职业' }).click()
    await window.getByRole('button', { name: '新增测试条目' }).click()
    await window.getByTestId('item-row').first().click()
    await expect(window.getByTestId('form-section-6')).toContainText('进阶 & 标签')
    await expect(window.getByTestId('form-section-7')).toHaveCount(0)
    await expect(window.getByTestId('form-section-4-toggle')).toHaveAttribute('aria-expanded', 'false')
    await expect(window.getByTestId('form-section-5-toggle')).toHaveAttribute('aria-expanded', 'false')
    // 「属性列表」分区（job 的 attr_list 是 attrtable，走普通分区字段）
    await expect(window.getByTestId('form-section-3')).toContainText('属性列表')
  } finally {
    await app.close()
  }
})

test('条目编辑器分区：未归组字段走兜底，一个都不丢（talent 的 schema 差异）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-form-sections-ungrouped-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await window.getByTestId('type-tab').filter({ hasText: '天赋' }).click()
    await window.getByRole('button', { name: '新增测试条目' }).click()
    await window.getByTestId('item-row').first().click()

    // talent 的 FIELD_GROUPS 引用了 TS schema 里不存在的 5 个字段 →
    // 「数值配置」只剩 value，其余字段必须以平铺行的形式保留
    await expect(window.getByTestId('form-section-1')).toContainText('数值配置')
    await expect(window.getByTestId('field-value')).toHaveCount(1)
    for (const name of ['owner', 'level', 'rarity', 'effect_type', 'unlock_condition']) {
      await expect(window.getByTestId(`field-${name}`), `兜底字段 ${name} 不应消失`).toHaveCount(1)
    }
  } finally {
    await app.close()
  }
})
