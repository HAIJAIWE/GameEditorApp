import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

test('实时预览：基础值/装备/Buff 联动 → 计算过程 → 重置数值', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-attr-live-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()
    await window.getByTestId('open-attr-system').click()
    await expect(window.getByTestId('attr-system-panel')).toBeVisible()

    // 切到实时预览：默认基础值 10 → HP = 350
    await window.getByTestId('attr-view-live').click()
    await expect(window.getByTestId('attr-live')).toBeVisible()
    await expect(window.getByTestId('live-base-力量')).toHaveValue('10')
    await expect(window.getByTestId('live-result-HP')).toHaveText('350')

    // 基础值 力量 20 → HP = 20*10 + 10*20 + 10*5 = 450
    await window.getByTestId('live-base-力量').fill('20')
    await expect(window.getByTestId('live-result-HP')).toHaveText('450')

    // 装备固定加成 +5 → 25 → 500
    await window.getByTestId('live-equip-力量').fill('5')
    await expect(window.getByTestId('live-result-HP')).toHaveText('500')

    // Buff 百分比 +20% → (20 + 5) × 1.2 = 30 → HP = 550
    await window.getByTestId('live-buff-力量').fill('20')
    await expect(window.getByTestId('live-result-HP')).toHaveText('550')

    // 计算过程：基础段 + 装备/Buff 段 + 公式与结果
    await expect(window.getByTestId('live-process')).toContainText('─── 基础属性 ───')
    await expect(window.getByTestId('live-process')).toContainText('力量 = 30')
    await expect(window.getByTestId('live-process')).toContainText('─── 装备加成 ───')
    await expect(window.getByTestId('live-process')).toContainText('力量 +5')
    await expect(window.getByTestId('live-process')).toContainText('─── Buff加成 ───')
    await expect(window.getByTestId('live-process')).toContainText('力量 +20%')
    await expect(window.getByTestId('live-process')).toContainText('HP = 力量*10 + 体质*20 + 敏捷*5')
    await expect(window.getByTestId('live-process')).toContainText('→ 550.0')

    // 战斗属性同链路计算：暴击率 = 敏捷*0.4 + 5 = 9
    await expect(window.getByTestId('live-result-暴击率')).toHaveText('9')

    // 重置数值 → 默认值与零加成
    await window.getByTestId('live-reset').click()
    await expect(window.getByTestId('live-base-力量')).toHaveValue('10')
    await expect(window.getByTestId('live-equip-力量')).toHaveValue('0')
    await expect(window.getByTestId('live-buff-力量')).toHaveValue('0')
    await expect(window.getByTestId('live-result-HP')).toHaveText('350')
  } finally {
    await app.close()
  }
})