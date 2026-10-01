import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

test('引用关系：被谁引用 / 引用了谁 / 相似数据与跳转', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-references-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    // 1) 技能：创建「火球术」（随后取完整 id 供角色引用）
    await window.getByTestId('type-tab').filter({ hasText: '技能' }).click()
    await window.getByRole('button', { name: '新增测试条目' }).click()
    await window.getByTestId('field-name').fill('火球术')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect(window.getByTestId('item-row').filter({ hasText: '火球术' })).toBeVisible()

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
    // 新建后表单会切换到新条目：先等名称不再是上一条的值，避免把输入填进旧表单
    const createRole = async (name: string, previousName: string): Promise<void> => {
      await window.getByRole('button', { name: '新增测试条目' }).click()
      await expect(window.getByTestId('field-name')).not.toHaveValue(previousName)
      await window.getByTestId('field-name').fill(name)
      await window.getByTestId('field-skills').fill(skillId)
      await window.getByTestId('field-job').selectOption('战士')
      await window.getByTestId('field-race').selectOption('人类')
      await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
      await expect(window.getByTestId('item-row').filter({ hasText: name })).toBeVisible()
    }
    await window.getByTestId('type-tab').filter({ hasText: '角色' }).click()
    await createRole('艾尔文', '火球术')
    await createRole('希尔瓦', '艾尔文')

    // 3) 技能条目：被谁引用（2 条，来自两个角色）
    await window.getByTestId('type-tab').filter({ hasText: '技能' }).click()
    await window.getByTestId('item-row').first().click()
    await window.getByTestId('open-references').click()
    await expect(window.getByTestId('references-panel')).toBeVisible()
    await expect(window.getByTestId('ref-tab-referencedBy')).toContainText('（2）')
    await expect(window.getByTestId('ref-row')).toHaveCount(2)
    await expect(window.getByTestId('ref-row').first()).toContainText('艾尔文')
    await expect(window.getByTestId('ref-row').first()).toContainText('字段 skills')

    // 4) 跳转到引用方（角色 · 艾尔文）：类型切换 + 面板继续可用
    await window.getByTestId('ref-row').filter({ hasText: '艾尔文' }).click()
    await expect(window.getByTestId('references-panel')).toContainText('艾尔文')
    await expect(window.getByTestId('type-tab').filter({ hasText: '角色' })).toHaveClass(/active/)

    // 5) 引用了谁（解析回技能名）
    await window.getByTestId('ref-tab-references').click()
    await expect(window.getByTestId('ref-tab-references')).toContainText('（1）')
    await expect(window.getByTestId('ref-row')).toContainText('火球术')

    // 6) 相似数据（另一个角色，共同字段 4 个 → 100%）
    await window.getByTestId('ref-tab-similar').click()
    await expect(window.getByTestId('ref-row')).toContainText('希尔瓦')
    await expect(window.getByTestId('ref-row')).toContainText('相似度 100%')

    // 7) 关闭面板 → 回到该条目编辑表单
    await window.getByTestId('references-close').click()
    await expect(window.getByTestId('item-editor')).toContainText('艾尔文')
  } finally {
    await app.close()
  }
})