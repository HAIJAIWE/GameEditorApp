import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * 字段 ID 生成（中文显示名 → 英文字段 ID）。
 *
 * 核心是把这个**已实证的 Python 缺陷**做成端到端回归锁：
 * Python 的 `_translate_game_terms` 把 ASCII 逐字拆开，实测 `HP上限` → `h_p_max`、`HP` → `h_p`，
 * 连本身就是合法 ID 的 `hp_max` 都被打成 `h_p_m_a_x`。本用例断言产出的是 `hp_max`。
 *
 * 注：本沙箱 Electron 起不来（`Process failed to launch!`，既有 E2E 同样失败，属环境限制），
 * 本用例按既有模式写就、待 CI 实跑。
 */
test('字段 ID 生成：术语表命中 / 未收录如实提示 / 重名加后缀 / 保存重启保持', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-field-id-e2e-'))
  const launch = (): ReturnType<typeof launchApp> =>
    launchApp(userDataDir)

  const app = await launch()
  try {
    const window = await app.firstWindow()
    await waitReady(window)

    await window.getByTestId('open-type-editor').click()
    await expect(window.getByTestId('type-editor-panel')).toBeVisible()
    await window.getByTestId('te-type-tab').filter({ hasText: '职业' }).click()

    const lastName = window.locator('[data-testid^="te-field-name-"]').last()
    const lastLabel = window.locator('[data-testid^="te-field-label-"]').last()
    const lastGenerate = window.locator('[data-testid^="te-field-generate-"]').last()
    const lastApply = window.locator('[data-testid^="te-id-suggest-apply-"]').last()

    // —— 1) 术语表命中 + ASCII 不再被打碎 ——
    await window.getByTestId('te-add-field').click()
    await lastLabel.fill('HP上限')
    await lastGenerate.click()
    await expect(lastApply).toHaveText('hp_max')
    // 回归锁：Python 产出的是 'h_p_max'
    await expect(lastApply).not.toHaveText('h_p_max')
    // 未命中提示不应出现（两个词都在术语表内）
    await expect(window.locator('[data-testid^="te-id-suggest-skipped-"]')).toHaveCount(0)
    await lastApply.click()
    await expect(lastName).toHaveValue('hp_max')

    // —— 2) 未收录的中文：如实提示，不给候选 ——
    await window.getByTestId('te-add-field').click()
    await lastLabel.fill('斗能')
    await lastGenerate.click()
    // Python 实测这里会产出词典垃圾 'abbr_surname'
    await expect(window.locator('[data-testid^="te-id-suggest-error-"]').last()).toContainText('未收录')
    // 未收录时不给候选（此时上一个面板已因「应用」关闭，故候选按钮应为 0）
    await expect(window.locator('[data-testid^="te-id-suggest-apply-"]')).toHaveCount(0)
    await lastGenerate.click() // 收起
    await expect(window.locator('[data-testid^="te-id-suggest-"]')).toHaveCount(0)

    // —— 3) 部分未收录：给候选但明确标出缺失片段 ——
    await window.getByTestId('te-add-field').click()
    await lastLabel.fill('攻击力道行')
    await lastGenerate.click()
    await expect(lastApply).toHaveText('atk')
    await expect(window.locator('[data-testid^="te-id-suggest-skipped-"]').last()).toContainText('道行')
    await lastApply.click()
    await expect(lastName).toHaveValue('atk')

    // —— 4) 重名规避：再加一个「生命值」→ hp；再来一个 → hp_2 ——
    await window.getByTestId('te-add-field').click()
    await lastLabel.fill('生命值')
    await lastGenerate.click()
    await expect(lastApply).toHaveText('hp')
    await lastApply.click()

    await window.getByTestId('te-add-field').click()
    await lastLabel.fill('生命值')
    await lastGenerate.click()
    await expect(lastApply).toHaveText('hp_2')
    await expect(window.locator('[data-testid^="te-id-suggest-renamed-"]').last()).toContainText('原为 hp')
    await lastApply.click()
    await expect(lastName).toHaveValue('hp_2')

    // 保存
    await window.getByTestId('te-save').click()
    await expect(window.getByTestId('te-notice')).toContainText('已保存')

    const saved = await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            schema: {
              list: () => Promise<Array<{ id: string; formFields: Array<{ name: string }> }>>
            }
          }
        }
      ).mbApi
      return api.schema.list()
    })
    const job = saved.find((def) => def.id === 'job')
    const names = (job?.formFields ?? []).map((field) => field.name)
    for (const expected of ['hp_max', 'atk', 'hp', 'hp_2']) {
      expect(names, `保存后应含字段 ${expected}`).toContain(expected)
    }
    // 回归锁：绝不应出现被逐字打碎的形态
    expect(names).not.toContain('h_p_max')
    expect(names).not.toContain('h_p')

    await window.getByTestId('te-close').click()
    await expect(window.getByTestId('type-editor-panel')).toBeHidden()
  } finally {
    await app.close()
  }

  // 重启（同一 userData 目录）：生成的字段名持久化
  const app2 = await launch()
  try {
    const window = await app2.firstWindow()
    await waitReady(window)
    await window.getByTestId('open-type-editor').click()
    await window.getByTestId('te-type-tab').filter({ hasText: '职业' }).click()
    await expect(window.locator('[data-testid^="te-field-name-"]').last()).toHaveValue('hp_2')
    const allNames = await window
      .locator('[data-testid^="te-field-name-"]')
      .evaluateAll((nodes) => nodes.map((node) => (node as unknown as { value: string }).value))
    expect(allNames).toContain('hp_max')
    expect(allNames).toContain('atk')
  } finally {
    await app2.close()
  }
})
