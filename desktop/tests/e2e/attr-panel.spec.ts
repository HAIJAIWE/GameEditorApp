import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, openCeshuFromHome, openDataEditor, seedCeshu } from './helpers/ceshuData'

test('角色属性面板：默认模板 → 模板切换/改值联动 → 快速添加与错误提示 → 保存 → 重启保持', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-attr-panel-e2e-'))
  const title = 'E2E 角色属性面板'
  // 播种启用「角色」系统的策划书（data_type=role，其 attr_list 为 attrpanel，默认载入「新手」模板）
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
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(1)
    await window.getByTestId('ceshu-data-item-row').first().click()
    await expect(window.getByTestId('item-editor')).toBeVisible()

    // 新条目默认载入「新手」模板：HP = 5*10 + 5*20 + 5*5 = 175.0
    await expect(window.getByTestId('field-attr_list-name-0')).toHaveValue('力量')
    await expect(window.getByTestId('field-attr_list-category-0')).toHaveValue('基础')
    await expect(window.getByTestId('field-attr_list-formula-4')).toHaveValue('=力量*10+体质*20+敏捷*5')
    await expect(window.getByTestId('field-attr_list-result-4')).toHaveText('175.0')

    // 切换模板「战士」：整体替换，HP = 12*10 + 10*20 + 5*5 = 345.0
    await window.getByTestId('field-attr_list-template').selectOption('战士')
    await expect(window.getByTestId('field-attr_list-formula-0')).toHaveValue('12')
    await expect(window.getByTestId('field-attr_list-result-4')).toHaveText('345.0')

    // 切回「新手」并改基础值：力量 5 → 15 → HP = 150 + 100 + 25 = 275.0
    await window.getByTestId('field-attr_list-template').selectOption('新手')
    await window.getByTestId('field-attr_list-formula-0').fill('15')
    await expect(window.getByTestId('field-attr_list-result-4')).toHaveText('275.0')

    // 快速添加「经验值」（奖励，=0）→ 第 18 行；改公式 =敏捷*2 → 10.0
    await window.getByTestId('field-attr_list-quick').selectOption('经验值')
    await expect(window.getByTestId('field-attr_list-name-17')).toHaveValue('经验值')
    await expect(window.getByTestId('field-attr_list-category-17')).toHaveValue('奖励')
    await expect(window.getByTestId('field-attr_list-result-17')).toHaveText('0.0')
    await window.getByTestId('field-attr_list-formula-17').fill('=敏捷*2')
    await expect(window.getByTestId('field-attr_list-result-17')).toHaveText('10.0')

    // 添加行 + 错误提示：=不存在*2 → 未定义名称提示、结果按 0 展示；修正后 15*3 + 275 = 320.0
    await window.getByTestId('field-attr_list-add').click()
    await window.getByTestId('field-attr_list-name-18').fill('战力')
    await window.getByTestId('field-attr_list-formula-18').fill('=不存在*2')
    await expect(window.getByTestId('field-attr_list-error-18')).toContainText('未定义的属性名')
    await expect(window.getByTestId('field-attr_list-result-18')).toHaveText('0')
    await window.getByTestId('field-attr_list-formula-18').fill('=力量*3+HP')
    await expect(window.getByTestId('field-attr_list-result-18')).toHaveText('320.0')

    // 删除「战力」行（不落盘）
    await window.getByTestId('field-attr_list-remove-18').click()
    await expect(window.getByTestId('field-attr_list-name-18')).toHaveCount(0)

    // 保存 → 落盘校验（保存反馈走 toast，不走 App 级 notice——同 attr-formula-builder 踩坑记录；
    // 原 `.notice-banner` + 「已保存」断言为既有失败，2026-10-13 拉平条目表单时一并修正）
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect
      .poll(async () => {
        const roles = await window.evaluate(async () => {
          const api = (
            globalThis as unknown as {
              mbApi: { data: { listItems: (req: { type: string }) => Promise<unknown> } }
            }
          ).mbApi
          return api.data.listItems({ type: 'role' })
        })
        const stored = (roles as Array<{ data: Record<string, unknown> }>)[0]
        const attrList = stored?.data['attr_list'] as Array<Record<string, unknown>> | undefined
        return attrList !== undefined && attrList.length === 18 && attrList[0]?.['formula'] === '15'
      })
      .toBe(true)
    // 表单按保存结果重渲染
    await expect(window.getByTestId('field-attr_list-formula-0')).toHaveValue('15')
    await expect(window.getByTestId('field-attr_list-result-4')).toHaveText('275.0')

    // 存储形态与 Python 一致：[{name, category, formula}]；长度 18（模板 17 + 经验值），战力已删除
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
    expect(attrList).toHaveLength(18)
    expect(attrList[0]).toEqual({ name: '力量', category: '基础', formula: '15' })
    expect(attrList.find((row) => row['name'] === '经验值')).toEqual({
      name: '经验值',
      category: '奖励',
      formula: '=敏捷*2'
    })
    expect(attrList.some((row) => row['name'] === '战力')).toBe(false)
  } finally {
    await app.close()
  }

  // 重启（同一 userData 目录）：属性面板与结果保持
  const app2 = await launch()
  try {
    const window = await app2.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '角色')
    await window.getByTestId('ceshu-data-item-row').first().click()
    await expect(window.getByTestId('field-attr_list-formula-0')).toHaveValue('15')
    await expect(window.getByTestId('field-attr_list-name-17')).toHaveValue('经验值')
    await expect(window.getByTestId('field-attr_list-result-4')).toHaveText('275.0')
  } finally {
    await app2.close()
  }
})

test('怪物属性面板：新条目默认载入「小怪」模板并联动计算', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-attr-panel-monster-e2e-'))
  const title = 'E2E 怪物属性面板'
  // 播种启用「怪物」系统的策划书（data_type=monster，默认载入「小怪」模板）
  seedCeshu(userDataDir, {
    title,
    systems: [{ key: 'monster', label: '怪物', dataType: 'monster' }]
  })
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '怪物')
    await createDataItem(window)
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(1)
    await window.getByTestId('ceshu-data-item-row').first().click()

    await expect(window.getByTestId('field-attr_list-name-0')).toHaveValue('力量')
    await expect(window.getByTestId('field-attr_list-formula-0')).toHaveValue('3')
    // HP = 3*10 + 4*20 + 3*5 = 125.0
    await expect(window.getByTestId('field-attr_list-result-4')).toHaveText('125.0')
  } finally {
    await app.close()
  }
})
