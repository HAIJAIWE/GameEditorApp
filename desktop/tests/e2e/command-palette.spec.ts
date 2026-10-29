import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * 命令面板（⌘K）E2E。
 *
 * 单测只能覆盖展示层与纯逻辑；这里验的是**真实 Electron 键盘路径**：
 * 全局 keydown → 面板挂到 `app.overlay` slot → 过滤 → Enter 执行 → 关闭。
 * 之所以用 `Control+k`：CI 是 Linux/Windows，Playwright 的 `Control` 对两条平台都生效
 * （面板本身也接受 `metaKey`，Mac 手测走 ⌘K）。
 */
test('命令面板：Ctrl+K 打开 → 过滤 → Esc 关闭', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-palette-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 未按快捷键时不该有面板（slot 空渲染，也不该挡住其它点击）
    await expect(window.getByTestId('command-palette')).toHaveCount(0)

    await window.keyboard.press('Control+k')
    await expect(window.getByTestId('command-palette')).toBeVisible()

    // 条目来自宿主能力清单：插件中心是内置面板，必然在列
    await expect(window.getByTestId('command-palette-item').first()).toBeVisible()
    const total = await window.getByTestId('command-palette-item').count()
    expect(total).toBeGreaterThan(10)

    // 过滤：输入「插件」应缩到少量命中，且命中项文本含「插件」
    await window.getByTestId('command-palette-input').fill('插件')
    await expect(window.getByTestId('command-palette-item').first()).toContainText('插件')

    // 底部提示行读的是对话 store（跨插件读状态的实证）
    await expect(window.getByTestId('command-palette')).toContainText('对话：')

    await window.keyboard.press('Escape')
    await expect(window.getByTestId('command-palette')).toHaveCount(0)
  } finally {
    await app.close()
  }
})

/**
 * 从命令面板切主区页签（`host.openMainView` → `mainView.state` 根级 store）。
 *
 * 这条用例锁的是**外部切页真的生效**：面板与页签条共享同一个 store，
 * 不是「点了没反应」。判定用页签的 `aria-current`（`MainViewMount` 的激活语义）。
 */
test('命令面板：搜索「数据编辑」并执行 → 主区切到数据编辑页签', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-palette-tab-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 默认停在策划书页签
    await expect(window.getByTestId('middle-tab-editor.mainView')).toHaveAttribute('aria-current', 'true')

    await window.keyboard.press('Control+k')
    await window.getByTestId('command-palette-input').fill('数据编辑')
    // 页签组的第一条就是「数据编辑」（mainView 能力，非面板）
    await window.keyboard.press('Enter')

    await expect(window.getByTestId('command-palette')).toHaveCount(0)
    await expect(window.getByTestId('middle-tab-data.mainView')).toHaveAttribute('aria-current', 'true')
    await expect(window.getByTestId('middle-tab-editor.mainView')).toHaveAttribute('aria-current', 'false')
  } finally {
    await app.close()
  }
})
