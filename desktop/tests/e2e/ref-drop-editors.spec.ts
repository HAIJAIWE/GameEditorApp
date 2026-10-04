import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

/**
 * E17/E18 回归：引用表字段（multiselect，原 JSON/逗号串降级）与掉落表字段（droptable，原恒 JSON 降级）
 * 改为专用表格编辑器后的端到端行为。
 *
 * 覆盖：内联选库 → 名称解析显示 → 等级/掉率/数量编辑 → 保存落盘（id 引用 + level；name+rate+count_min/max）
 *      → 重新打开持久化 → 删除选中。
 *
 * 名称用 E2E 前缀唯一化，避免与首启种子数据撞名导致选项错位。
 */
test('引用表 / 掉落表编辑器：选库添加 + 数值编辑 + 保存持久化 + 删除', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ref-drop-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    const findId = async (type: string, name: string): Promise<string> =>
      window.evaluate(
        async ({ type, name }) => {
          const api = (
            globalThis as unknown as {
              mbApi: {
                data: {
                  listItems: (req: {
                    type: string
                  }) => Promise<Array<{ id: string; data: Record<string, unknown> }>>
                }
              }
            }
          ).mbApi
          const list = await api.data.listItems({ type })
          return list.find((item) => item.data['name'] === name)?.id ?? ''
        },
        { type, name }
      )

    const readField = async (type: string, name: string, field: string): Promise<unknown> =>
      window.evaluate(
        async ({ type, name, field }) => {
          const api = (
            globalThis as unknown as {
              mbApi: {
                data: {
                  listItems: (req: {
                    type: string
                  }) => Promise<Array<{ id: string; data: Record<string, unknown> }>>
                }
              }
            }
          ).mbApi
          const list = await api.data.listItems({ type })
          const item = list.find((entry) => entry.data['name'] === name)
          return item ? item.data[field] : null
        },
        { type, name, field }
      )

    // 1) 建一个技能（供角色引用）
    await window.getByTestId('type-tab').filter({ hasText: '技能' }).click()
    await window.getByRole('button', { name: '新增测试条目' }).click()
    await window.getByTestId('field-name').fill('E2E技能火球')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.getByTestId('item-row').filter({ hasText: 'E2E技能火球' })).toBeVisible()
    const skillId = await findId('skill', 'E2E技能火球')
    expect(skillId).not.toBe('')

    // 2) 建一个装备（供怪物掉落引用）
    await window.getByTestId('type-tab').filter({ hasText: '装备' }).click()
    await window.getByRole('button', { name: '新增测试条目' }).click()
    await window.getByTestId('field-name').fill('E2E装备铁剑')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.getByTestId('item-row').filter({ hasText: 'E2E装备铁剑' })).toBeVisible()

    // 3) 角色：引用表编辑器添加技能引用（等级 5）
    await window.getByTestId('type-tab').filter({ hasText: '角色' }).click()
    await window.getByRole('button', { name: '新增测试条目' }).click()
    await window.getByTestId('field-name').fill('E2E角色甲')
    await expect(window.getByTestId('reftable-skills-empty')).toBeVisible()
    await window.getByTestId('reftable-skills-add').click()
    await expect(window.getByTestId('reftable-skills-picker')).toBeVisible()
    await window.getByTestId('reftable-skills-search').fill('E2E技能火球')
    await window.getByTestId(`reftable-skills-option-${skillId}`).click()
    await window.getByTestId('reftable-skills-picker-level').fill('5')
    await window.getByTestId('reftable-skills-confirm').click()
    await expect(window.getByTestId('reftable-skills-name-0')).toContainText('E2E技能火球')
    await expect(window.getByTestId('reftable-skills-level-0')).toHaveValue('5')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.getByTestId('item-row').filter({ hasText: 'E2E角色甲' })).toBeVisible()

    // 落盘：仅 id + level，无冗余字段
    expect(await readField('role', 'E2E角色甲', 'skills')).toEqual([{ id: skillId, level: 5 }])

    // 4) 重新打开条目 → 引用仍在（持久化 + 名称解析）
    await window.getByTestId('item-row').filter({ hasText: 'E2E角色甲' }).click()
    await expect(window.getByTestId('reftable-skills-name-0')).toContainText('E2E技能火球')

    // 5) 删除选中 → 保存 → 落盘为空数组
    await window.getByTestId('reftable-skills-row-0').click()
    await window.getByTestId('reftable-skills-remove').click()
    await expect(window.getByTestId('reftable-skills-empty')).toBeVisible()
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    expect(await readField('role', 'E2E角色甲', 'skills')).toEqual([])

    // 6) 怪物：掉落表编辑器添加装备掉落（掉率 20 / 2~3）
    await window.getByTestId('type-tab').filter({ hasText: '怪物' }).click()
    await window.getByRole('button', { name: '新增测试条目' }).click()
    await window.getByTestId('field-name').fill('E2E怪物甲')
    await window.getByTestId('droptable-equip_drops-add').click()
    await expect(window.getByTestId('droptable-equip_drops-picker')).toBeVisible()
    await window.getByTestId('droptable-equip_drops-search').fill('E2E装备铁剑')
    await window.getByTestId('droptable-equip_drops-option-0').click()
    await window.getByTestId('droptable-equip_drops-picker-rate').fill('20')
    await window.getByTestId('droptable-equip_drops-picker-min').fill('2')
    await window.getByTestId('droptable-equip_drops-picker-max').fill('3')
    await window.getByTestId('droptable-equip_drops-confirm').click()
    await expect(window.getByTestId('droptable-equip_drops-name-0')).toContainText('E2E装备铁剑')
    await expect(window.getByTestId('droptable-equip_drops-rate-0')).toHaveValue('20')
    await expect(window.getByTestId('droptable-equip_drops-min-0')).toHaveValue('2')
    await expect(window.getByTestId('droptable-equip_drops-max-0')).toHaveValue('3')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.getByTestId('item-row').filter({ hasText: 'E2E怪物甲' })).toBeVisible()

    // 落盘：仅 name + rate + count_min + count_max（与 Python 数据格式一致）
    expect(await readField('monster', 'E2E怪物甲', 'equip_drops')).toEqual([
      { name: 'E2E装备铁剑', rate: 20, count_min: 2, count_max: 3 }
    ])

    // 7) 重新打开 → 掉落行仍在
    await window.getByTestId('item-row').filter({ hasText: 'E2E怪物甲' }).click()
    await expect(window.getByTestId('droptable-equip_drops-name-0')).toContainText('E2E装备铁剑')
  } finally {
    await app.close()
  }
})
