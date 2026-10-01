import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

test('装备预览：放装/卸下 → Buff 叠加/移除 → 属性对比差值 → 不可放置提示 → 基础值联动', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-equip-preview-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    // 准备数据：装备（base_attrs 力量 +10）、Buff（属性提升 +20 力量）、旧数据「饰品」部位（不可放置）
    await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: { data: { createItem: (req: { type: string; data: Record<string, unknown> }) => Promise<unknown> } }
        }
      ).mbApi
      await api.data.createItem({
        type: 'equip',
        data: { name: '测试剑', part: '武器', rare: '传说', base_attrs: { 力量: 10 } }
      })
      await api.data.createItem({ type: 'buff', data: { name: '力量祝福', type: '增益', effect_type: '属性提升', value: 20 } })
      await api.data.createItem({ type: 'equip', data: { name: '旧饰品', part: '饰品', rare: '普通' } })
    })

    await window.getByTestId('open-attr-system').click()
    await window.getByTestId('attr-view-equip').click()
    await expect(window.getByTestId('attr-equip')).toBeVisible()

    // 初始：无装备无 Buff，差值全 0（默认基础值 HP = 350）
    await expect(window.getByTestId('equip-compare-base-HP')).toHaveText('350')
    await expect(window.getByTestId('equip-compare-diff-HP')).toHaveText('0')

    // 点击装备放入武器槽：力量 10 → 20，HP 350 → 450（差值 +100）
    await window.locator('.equip-preview-item').filter({ hasText: '测试剑' }).click()
    await expect(window.getByTestId('equip-slot-武器')).toContainText('测试剑')
    await expect(window.getByTestId('equip-compare-final-力量')).toHaveText('20')
    await expect(window.getByTestId('equip-compare-diff-HP')).toHaveText('+100')

    // 切换 Buff 标签页，点击添加：力量 20 → 40，HP → 650（+300）
    await window.getByTestId('equip-tab-buff').click()
    await window.locator('.equip-preview-item').filter({ hasText: '力量祝福' }).click()
    await expect(window.getByTestId('equip-buff-0')).toContainText('力量祝福')
    await expect(window.getByTestId('equip-compare-diff-HP')).toHaveText('+300')

    // 重复点击叠加第二个 Buff：力量 60，HP → 850（+500）
    await window.locator('.equip-preview-item').filter({ hasText: '力量祝福' }).click()
    await expect(window.getByTestId('equip-buff-1')).toBeVisible()
    await expect(window.getByTestId('equip-compare-diff-HP')).toHaveText('+500')

    // 卸下武器：力量 50，HP → 750（+400）
    await window.getByTestId('equip-unequip-武器').click()
    await expect(window.getByTestId('equip-slot-武器')).toContainText('未装备')
    await expect(window.getByTestId('equip-compare-diff-HP')).toHaveText('+400')

    // 移除一个 Buff：力量 30，HP → 550（+200）
    await window.getByTestId('equip-buff-remove-0').click()
    await expect(window.getByTestId('equip-compare-diff-HP')).toHaveText('+200')

    // 不可放置：返回装备标签页点击「旧饰品」（部位不在槽位列表）
    await window.getByTestId('equip-tab-equip').click()
    await window.locator('.equip-preview-item').filter({ hasText: '旧饰品' }).click()
    await expect(window.getByTestId('equip-message')).toContainText('不在可放置槽位')

    // 基础值联动：力量基础 10 → 20，基础 HP = 450，最终（+20 Buff）力量 40 → HP 650
    await window.getByTestId('equip-base-力量').fill('20')
    await expect(window.getByTestId('equip-compare-base-HP')).toHaveText('450')
    await expect(window.getByTestId('equip-compare-diff-HP')).toHaveText('+200')
  } finally {
    await app.close()
  }
})