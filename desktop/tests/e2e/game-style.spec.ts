import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

/**
 * 术语风格（迁移自 Python `core/style_manager.py`）。
 *
 * 覆盖两件事：
 * 1. 工具栏「术语风格」下拉按风格替换条目表单的字段标签（`resolve_field_label` 的 user-visible 效果）
 *    —— 用 Python docstring 的原例：仙侠下 `生命加成%:` → `气血加成%:`、`法力加成%:` → `灵力加成%:`
 * 2. 选择结果持久化（localStorage `mb.gameStyle`），重载后仍生效
 *
 * Python 侧唯一的触发是「打开策划书时由 meta 推断风格」；TS 保留该链路（`resolveDocGameStyle`），
 * 并额外提供本下拉作为手工入口（Python 无此入口）。
 */
test('术语风格：字段标签按风格替换并可持久化', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-game-style-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    // 默认：原始术语（无活跃风格 → resolveLabel 原样返回，与 Python 默认行为等价）
    const styleSelect = window.getByTestId('game-style')
    await expect(styleSelect).toHaveValue('')

    // 职业（job）的「武器 & 加成」是双列网格分区，字段标签即 Python docstring 的例子
    await window.getByTestId('type-tab').filter({ hasText: '职业' }).click()
    await window.getByRole('button', { name: '新增测试条目' }).click()

    const hpLabel = window.locator('label[for="field-hp_bonus"]')
    const mpLabel = window.locator('label[for="field-mp_bonus"]')
    await expect(hpLabel).toHaveText('生命加成%:')
    await expect(mpLabel).toHaveText('法力加成%:')

    // 切到仙侠：术语替换生效
    await styleSelect.selectOption('xianxia')
    await expect(hpLabel).toHaveText('气血加成%:')
    await expect(mpLabel).toHaveText('灵力加成%:')

    // 非网格分区（单列表单）同样替换：角色的「技能列表:」→「功法列表:」
    await window.getByTestId('type-tab').filter({ hasText: '角色' }).click()
    await window.getByRole('button', { name: '新增测试条目' }).click()
    await expect(window.locator('label[for="field-skills"]')).toHaveText('功法列表:')

    // 持久化：重载后仍是仙侠，标签仍被替换
    await window.reload()
    await expect(window.getByTestId('game-style')).toHaveValue('xianxia')
    await window.getByTestId('type-tab').filter({ hasText: '角色' }).click()
    await window.getByRole('button', { name: '新增测试条目' }).click()
    await expect(window.locator('label[for="field-skills"]')).toHaveText('功法列表:')

    // 切回「原始术语」应立刻还原
    await window.getByTestId('game-style').selectOption('')
    await expect(window.locator('label[for="field-skills"]')).toHaveText('技能列表:')
  } finally {
    await app.close()
  }
})
