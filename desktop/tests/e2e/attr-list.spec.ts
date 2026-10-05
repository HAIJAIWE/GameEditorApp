import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, openCeshuFromHome, openDataEditor, seedCeshu } from './helpers/ceshuData'

test('条目属性列表：增删行 → 计算预览 → 保存 → 重启后保持', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-attr-list-e2e-'))
  const title = 'E2E 属性列表'
  // 新 IA：数据编辑内嵌在策划书预览面板，标签由「已启用系统」派生。
  // 播种一份启用「职业」系统的策划书（data_type=job，其 attr_list 为 attrtable），启动后点卡片进入。
  seedCeshu(userDataDir, {
    title,
    systems: [{ key: 'job', label: '职业', dataType: 'job' }]
  })
  const launch = (): ReturnType<typeof launchApp> =>
    launchApp(userDataDir)

  const app = await launch()
  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '职业')

    // 进入「职业」数据编辑器并新建条目
    await createDataItem(window)
    await expect(window.getByTestId('ceshu-data-item-row')).toHaveCount(1)
    await window.getByTestId('ceshu-data-item-row').first().click()
    await expect(window.getByTestId('item-editor')).toBeVisible()

    // 属性列表以表格（非 JSON 文本框）渲染；初始为空，预览提示添加行
    await expect(window.getByTestId('field-attr_list')).toBeVisible()
    await expect(window.getByTestId('field-attr_list-calc')).toContainText('添加属性行')

    // 第 1 行「力量 = 20」→ HP = 20*10 + 0 + 0 = 200（未提供的属性按 0 输入）
    await window.getByTestId('field-attr_list-add').click()
    await window.getByTestId('field-attr_list-name-0').fill('力量')
    await window.getByTestId('field-attr_list-value-0').fill('20')
    await expect(window.getByTestId('field-attr_list-calc-力量')).toHaveText('20')
    await expect(window.getByTestId('field-attr_list-calc-HP')).toHaveText('200')

    // 第 2 行「体质 = 10」→ HP = 200 + 200 + 0 = 400
    await window.getByTestId('field-attr_list-add').click()
    await window.getByTestId('field-attr_list-name-1').fill('体质')
    await window.getByTestId('field-attr_list-value-1').fill('10')
    await expect(window.getByTestId('field-attr_list-calc-HP')).toHaveText('400')

    // 第 3 行「幸运」未被属性系统收录：单独提示且不参与计算，删除后提示消失
    await window.getByTestId('field-attr_list-add').click()
    await window.getByTestId('field-attr_list-name-2').fill('幸运')
    await window.getByTestId('field-attr_list-value-2').fill('5')
    await expect(window.getByTestId('field-attr_list-calc-unknown')).toContainText('幸运')
    await window.getByTestId('field-attr_list-remove-2').click()
    await expect(window.getByTestId('field-attr_list-calc-unknown')).toBeHidden()

    // 保存：表单按保存结果重渲染，行值与预览保持
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.locator('.notice-banner')).toContainText('已保存')
    await expect(window.getByTestId('field-attr_list-name-0')).toHaveValue('力量')
    await expect(window.getByTestId('field-attr_list-value-1')).toHaveValue('10')
    await expect(window.getByTestId('field-attr_list-calc-HP')).toHaveText('400')

    // 存储形态与 Python 一致：[{name, value}]（数值为数字）
    const jobs = await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: { data: { listItems: (req: { type: string }) => Promise<unknown> } }
        }
      ).mbApi
      return api.data.listItems({ type: 'job' })
    })
    const stored = (jobs as Array<{ data: Record<string, unknown> }>)[0]
    expect(stored?.data['attr_list']).toEqual([
      { name: '力量', value: 20 },
      { name: '体质', value: 10 }
    ])
  } finally {
    await app.close()
  }

  // 重启（同一 userData 目录）：数据与计算预览保持
  const app2 = await launch()
  try {
    const window = await app2.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '职业')
    await window.getByTestId('ceshu-data-item-row').first().click()
    await expect(window.getByTestId('field-attr_list-name-0')).toHaveValue('力量')
    await expect(window.getByTestId('field-attr_list-name-1')).toHaveValue('体质')
    await expect(window.getByTestId('field-attr_list-value-0')).toHaveValue('20')
    await expect(window.getByTestId('field-attr_list-calc-HP')).toHaveText('400')
  } finally {
    await app2.close()
  }
})
