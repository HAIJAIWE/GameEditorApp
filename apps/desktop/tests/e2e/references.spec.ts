import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, openCeshuFromHome, openDataEditor, openMenuItem, seedCeshu } from './helpers/ceshuData'

test('引用关系：被谁引用 / 引用了谁 / 相似数据与跳转', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-references-e2e-'))
  const title = 'E2E 引用关系'
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

    // 1) 技能：创建「火球术」（随后取完整 id 供角色引用）
    await openDataEditor(window, '技能')
    await createDataItem(window)
    await window.getByTestId('field-name').fill('火球术')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.getByTestId('ceshu-data-item-row').filter({ hasText: '火球术' })).toBeVisible()

    const skillId = await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            data: {
              listItems: (req: { type: string }) => Promise<Array<{ id: string; data: Record<string, unknown> }>>
            }
          }
        }
      ).mbApi
      const list = await api.data.listItems({ type: 'skill' })
      return list.find((item) => item.data['name'] === '火球术')?.id ?? ''
    })
    expect(skillId).not.toBe('')

    // 2) 两个角色引用该技能（同时填相同职业/种族，构造相似数据）
    await openDataEditor(window, '角色')
    const createRole = async (name: string, previousName: string): Promise<void> => {
      await createDataItem(window)
      // 新建后表单会切换到新条目：先等名称不再是上一条的值，避免把输入填进旧表单
      await expect(window.getByTestId('field-name')).not.toHaveValue(previousName)
      await window.getByTestId('field-name').fill(name)
      // 引用表编辑器：+ 添加技能 → 在选库面板选中该技能 → 确定
      await window.getByTestId('reftable-skills-add').click()
      await window.getByTestId(`reftable-skills-option-${skillId}`).click()
      await window.getByTestId('reftable-skills-confirm').click()
      await window.getByTestId('field-job').selectOption('战士')
      await window.getByTestId('field-race').selectOption('人类')
      await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
      await expect(window.getByTestId('ceshu-data-item-row').filter({ hasText: name })).toBeVisible()
    }
    await createRole('艾尔文', '火球术')
    await createRole('希尔瓦', '艾尔文')

    // 3) 新 IA 下引用面板需要一个「引用目标」：先经「高级搜索」定位「火球术」并跳转
    //    （跳转会写入 refTarget，之后菜单里的「数据关联预览」才会打开该条目的引用关系）
    await openMenuItem(window, 'tools', 'advancedSearch')
    await window.getByTestId('adv-search-keyword').fill('火球术')
    await expect(window.getByTestId('adv-search-row')).toHaveCount(1)
    await window.getByTestId('adv-search-row').first().click()
    await expect(window.getByTestId('item-editor')).toContainText('火球术')

    // 4) 打开引用面板：技能条目被谁引用（2 条，来自两个角色）
    await openMenuItem(window, 'tools', 'references')
    await expect(window.getByTestId('references-panel')).toBeVisible()
    await expect(window.getByTestId('ref-tab-referencedBy')).toContainText('（2）')
    await expect(window.getByTestId('ref-row')).toHaveCount(2)
    await expect(window.getByTestId('ref-row').first()).toContainText('艾尔文')
    await expect(window.getByTestId('ref-row').first()).toContainText('字段 skills')

    // 5) 点击引用方（角色 · 艾尔文）：跳转到该条目（面板关闭、预览面板切到角色）
    await window.getByTestId('ref-row').filter({ hasText: '艾尔文' }).click()
    await expect(window.getByTestId('item-editor')).toContainText('艾尔文')
    await expect(window.getByTestId('ceshu-preview-tab').filter({ hasText: '角色' })).toHaveClass(/active/)

    // 6) 重新打开引用面板（refTarget 已指向 角色 · 艾尔文）：引用了谁（解析回技能名）
    await openMenuItem(window, 'tools', 'references')
    await expect(window.getByTestId('references-panel')).toBeVisible()
    await window.getByTestId('ref-tab-references').click()
    await expect(window.getByTestId('ref-tab-references')).toContainText('（1）')
    await expect(window.getByTestId('ref-row')).toContainText('火球术')

    // 7) 相似数据（另一个角色，共同字段 ≥2 → 100%）
    await window.getByTestId('ref-tab-similar').click()
    await expect(window.getByTestId('ref-row')).toContainText('希尔瓦')
    await expect(window.getByTestId('ref-row')).toContainText('相似度 100%')

    // 8) 关闭面板 → 回到该条目编辑表单
    await window.getByTestId('references-close').click()
    await expect(window.getByTestId('references-panel')).toHaveCount(0)
    await expect(window.getByTestId('item-editor')).toContainText('艾尔文')
  } finally {
    await app.close()
  }
})
