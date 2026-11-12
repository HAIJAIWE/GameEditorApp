import { existsSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, libraryDir, waitReady } from './helpers/app'

/**
 * 看板「派这一份」端到端：看板某一行 → 该份派工单预填进输入框（不发送）。
 *
 * 与「让 AI 开工」的区别：那条要用户先选导出目录，这条**不弹目录框**——交接包不存在时
 * 主进程按 `<活跃库>/exports/<游戏名>-交接包` 当场导出一次。
 *
 * 断言三件事：
 * 1. 派工单里点名的是**我点的那一份**（不是自动挑的下一份）；
 * 2. 交接包就地导出到了库里（不弹框也能派）；
 * 3. 仍然只预填、不发送，且提示语说明包是从哪来的。
 */
test('施工看板「派这一份」：不选目录也能派指定那份', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-dispatch-'))
  const app = await launchApp(userDataDir)
  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 新建空白策划书：首页「新建」先开范围选择器，再选「游戏」=> 自动进编辑器
    await window.getByTestId('home-new-blank').click()
    await window.getByTestId('home-blank-game').click()
    await expect(window.getByTestId('ceshu-export')).toBeVisible()

    const messagesBefore = await window.getByTestId('digital-messages').textContent()

    await window.getByTestId('ceshu-more').click()
    await window.getByTestId('ceshu-work-board').click()
    await expect(window.getByTestId('workboard-panel')).toBeVisible({ timeout: 30_000 })

    // 挑**最后一份**（且不是「不适用」的）派——这样能证明派工单点名的是点出来的那份，
    // 而不是自动选择器永远会挑的第一份就绪文档。
    const entries = window.locator('[data-testid="workboard-entry"]')
    await expect(entries.first()).toBeVisible()
    const count = await entries.count()
    let index = count - 1
    while (index > 0) {
      const state = await entries.nth(index).getAttribute('data-state')
      if (state !== 'skip') break
      index -= 1
    }
    const picked = entries.nth(index)
    const pickedPath = await picked.locator('[data-testid="workboard-dispatch"]').getAttribute('data-path')
    expect(pickedPath).toBeTruthy()
    const autoNext = await window.getByTestId('workboard-next').textContent()
    // 证明「点名优先」真的生效：我点的这份确实不在自动选择器给的那份上。
    expect(autoNext).toContain('下一份')
    expect(autoNext).not.toContain(String(pickedPath))
    await picked.locator('[data-testid="workboard-dispatch"]').click()

    // 1. 派工单点名的是点出来的那份（不是自动选择器挑的下一份）
    const input = window.getByTestId('digital-input')
    await expect(input).toHaveValue(/派工单/, { timeout: 10_000 })
    await expect(input).toHaveValue(new RegExp('文档：`' + String(pickedPath).replace(/[/.]/g, '\\$&') + '`'))

    // 2. 交接包就地导出到库的 exports 下（没有目录选择框）
    const bundleDir = join(libraryDir(userDataDir), 'exports', '未命名游戏-交接包')
    await expect.poll(() => existsSync(join(bundleDir, 'README.md')), { timeout: 30_000 }).toBe(true)

    // 3. 没发送：消息列表内容不变
    await expect(window.getByTestId('digital-messages')).toHaveText(messagesBefore ?? '')

    // 4. 提示语说明包是当场导出的，并点名这份路径
    await expect(window.getByText(/这份还没导出过交接包，已就地导出到/)).toBeVisible()
    await expect(window.getByText(/派工单已填入右侧输入框/)).toBeVisible()
  } finally {
    await app.close()
  }
})
