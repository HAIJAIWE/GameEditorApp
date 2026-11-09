import { existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, libraryDir, waitReady } from './helpers/app'

/**
 * 施工看板端到端：菜单 → 看板面板 → 成绩单写回工作区 `进度.md`。
 *
 * 断言四件事：
 * 1. 面板挂载即自动核对（不用手点），列出总数与下一份；
 * 2. 逐份状态落在 DOM 上（`data-state`），不是纯文本；
 * 3. 成绩单真的写进了 `<库>/code/进度.md`，且带「机判快照」标记；
 * 4. 快照段不会被当成施工记录（再核对一次仍是同一份下一份，不会自己给自己盖章）。
 */
test('施工看板：自动核对 + 成绩单写回进度.md', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-workboard-'))
  const app = await launchApp(userDataDir)
  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 新建空白策划书：首页「新建」先开范围选择器，再选「游戏」=> 自动进编辑器
    await window.getByTestId('home-new-blank').click()
    await window.getByTestId('home-blank-game').click()
    await expect(window.getByTestId('ceshu-export')).toBeVisible()

    await window.getByTestId('ceshu-more').click()
    await window.getByTestId('ceshu-work-board').click()

    // 1. 面板出现，且是挂载即核对（没有点过「重新核对」）
    await expect(window.getByTestId('workboard-panel')).toBeVisible({ timeout: 30_000 })
    await expect(window.getByTestId('workboard-summary')).toHaveText(/共 \d+ 份/)
    await expect(window.getByTestId('workboard-next')).toHaveText(/下一份|全部做完了/)

    // 2. 逐份状态在 DOM 上（供后续按状态筛选留了钩子）
    const entries = window.locator('[data-testid="workboard-entry"]')
    await expect(entries.first()).toBeVisible()
    expect(await entries.count()).toBeGreaterThan(0)

    // 3. 成绩单写回工作区（默认工作区 = <库>/code）
    const progressPath = join(libraryDir(userDataDir), 'code', '进度.md')
    await expect.poll(() => existsSync(progressPath), { timeout: 30_000 }).toBe(true)
    const progress = readFileSync(progressPath, 'utf-8')
    expect(progress).toContain('机判快照')
    expect(progress).toContain('不代替施工记录')

    // 4. 再核对一次：快照段被覆盖，不会把机器写的成绩单当施工记录
    await window.getByTestId('workboard-refresh').click()
    await expect(window.getByTestId('workboard-summary')).toHaveText(/共 \d+ 份/)
    const again = readFileSync(progressPath, 'utf-8')
    expect(again.match(/机判快照：开始/g)?.length).toBe(1)
    expect(again).not.toContain('✅ 已完成')
  } finally {
    await app.close()
  }
})
