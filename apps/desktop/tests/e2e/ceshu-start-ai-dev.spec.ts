
import { existsSync, mkdtempSync, readdirSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * 「让 AI 开工」端到端：菜单 -> 导出交接包 -> 生成派工单 -> 预填进智能体输入框。
 *
 * 原生目录选择框无法在无头环境点，所以这里在主进程把 dialog.showOpenDialog
 * 换成直接返回固定目录（Playwright 的 app.evaluate 拿到的正是被测应用的 electron 模块）。
 *
 * 断言三件事：
 * 1. 交接包真的落盘（目录里有 README.md / index.json）；
 * 2. 派工单**只预填、不发送**（输入框有内容，消息列表一条不加）；
 * 3. 提示语给了「导出到哪 + 适用/已完成份数」。
 */
test('让 AI 开工：导出交接包 + 派工单预填（不自动发送）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-aidev-'))
  const outDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-aidev-out-'))
  const app = await launchApp(userDataDir)
  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 主进程替换原生目录选择框：点「让 AI 开工」后直接拿到 outDir
    await app.evaluate(({ dialog }, dir) => {
      dialog.showOpenDialog = (async () => ({ canceled: false, filePaths: [dir] })) as never
    }, outDir)

    // 新建空白策划书：首页「新建」先开范围选择器，再选「游戏」=> 自动进编辑器
    await window.getByTestId('home-new-blank').click()
    await window.getByTestId('home-blank-game').click()
    await expect(window.getByTestId('ceshu-export')).toBeVisible()

    const messagesBefore = await window.getByTestId('digital-messages').textContent()
    await window.getByTestId('ceshu-more').click()
    await window.getByTestId('ceshu-start-ai-dev').click()

    // 1. 交接包落盘（顶层有 README.md 与 index.json）
    await expect
      .poll(() => existsSync(join(outDir, '未命名游戏-交接包', 'README.md')), { timeout: 30_000 })
      .toBe(true)
    const bundleDir = join(outDir, '未命名游戏-交接包')
    expect(readdirSync(bundleDir)).toContain('index.json')

    // 2. 派工单预填进输入框（等一拍，预填在 setTimeout(0) 后写入）
    const input = window.getByTestId('digital-input')
    await expect(input).toHaveValue(/派工单/, { timeout: 10_000 })
    await expect(input).toHaveValue(/交接包（只读，不要改它）/)
    await expect(input).toHaveValue(/本次任务（只做这一份）/)
    await expect(input).toHaveValue(/进度.md/)

    // 3. 没发送：消息列表内容不变
    await expect(window.getByTestId('digital-messages')).toHaveText(messagesBefore ?? '')

    // 4. 提示语说明导出位置与份数（提示条在编辑器内，无固定 testid）
    await expect(window.getByText(/派工单已填入右侧输入框/)).toBeVisible()
  } finally {
    await app.close()
  }
})
