import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

test('策划书：读取旧版文件 → 新建 → 编辑保存章节 → 磁盘落盘（Python 兼容格式）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-e2e-'))
  const ceshuDir = join(userDataDir, 'ceshu')
  mkdirSync(ceshuDir, { recursive: true })

  // 旧版 Python 格式样本：章节字段与当前默认不同、缺章节、含未知顶层键
  writeFileSync(
    join(ceshuDir, '1a2b3c4d.json'),
    JSON.stringify({
      version: '5.0',
      ceshu_id: '1a2b3c4d',
      created_at: '2026-09-09 03:33:39',
      updated_at: '2026-09-09 03:33:39',
      meta: { game_name: '旧版策划书', game_type: 'RPG角色扮演游戏', gdd_scope: 'full' },
      story: { protagonist: {}, npc_list: [] },
      enabled_editors: []
    }),
    'utf-8'
  )

  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 默认落在策划书首页：首页卡片能读到旧版文件
    await expect(window.getByTestId('home-card')).toHaveCount(1)
    await expect(window.getByTestId('home-card').first()).toContainText('旧版策划书')

    // 新建空白策划书（默认专业版 = 文档信息 + 16 章）→ 自动进入编辑器
    await window.getByTestId('home-new-blank').click()
    await expect(window.getByTestId('chapter-tab')).toHaveCount(17)
    await expect(window.getByTestId('chapter-form')).toContainText('文档信息')

    // 编辑文档信息并保存
    await window.getByTestId('ceshu-field-game_name').fill('E2E 测试游戏')
    await window.getByTestId('ceshu-field-positioning').fill('一句话定位')
    await window.getByTestId('chapter-save').click()
    await expect(window.getByText('已保存：文档信息')).toBeVisible()
    // 新 IA 无侧栏列表：返回首页核对卡片标题已随保存更新，再打开该卡片继续编辑
    await window.getByTestId('ceshu-back').click()
    await expect(window.getByTestId('home-card')).toHaveCount(2)
    await expect(window.getByTestId('home-card').filter({ hasText: 'E2E 测试游戏' })).toBeVisible()
    await window
      .getByTestId('home-card')
      .filter({ hasText: 'E2E 测试游戏' })
      .getByTestId('home-card-open')
      .click()

    // 编辑第五章（战斗）并保存：进度从 0% → 50%
    const combatTab = window.getByTestId('chapter-tab').filter({ hasText: '第五章·战斗系统设计' })
    await combatTab.click()
    await window.getByTestId('ceshu-field-damage_formula').fill('伤害 = 攻击 - 防御')
    await window.getByTestId('chapter-save').click()
    await expect(combatTab).toContainText('50%')

    // 第四章（游戏系统）：启用「战斗」并保存
    await window.getByTestId('chapter-tab').filter({ hasText: '第四章·游戏系统设计' }).click()
    await window.getByTestId('system-toggle-battle').check()
    await expect(window.getByTestId('system-field-battle-turn_mode')).toBeVisible()
    await window.getByTestId('chapter-save').click()
    await expect(window.getByText('已保存：第四章·游戏系统设计')).toBeVisible()

    // 磁盘落盘校验：新文件为 Python 兼容格式
    const files = readdirSync(ceshuDir).filter((file) => file.endsWith('.json'))
    expect(files).toHaveLength(2)
    const savedPath = files.map((file) => join(ceshuDir, file)).find((path) => {
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as { meta?: { game_name?: string } }
      return raw.meta?.game_name === 'E2E 测试游戏'
    })
    expect(savedPath).toBeDefined()
    expect(existsSync(savedPath as string)).toBe(true)

    const saved = JSON.parse(readFileSync(savedPath as string, 'utf-8')) as Record<string, unknown>
    expect(saved['ceshu_id']).toMatch(/^[0-9a-f]{8}$/)
    expect(typeof saved['created_at']).toBe('string')
    expect((saved['meta'] as Record<string, unknown>)['gdd_scope']).toBe('full')
    expect((saved['meta'] as Record<string, unknown>)['game_name']).toBe('E2E 测试游戏')
    expect((saved['combat'] as Record<string, unknown>)['damage_formula']).toBe('伤害 = 攻击 - 防御')
    expect(((saved['systems'] as Record<string, Record<string, unknown>>)['battle'] ?? {})['enabled']).toBe(true)
    // 原子写不残留临时文件
    expect(files.filter((file) => file.endsWith('.tmp'))).toHaveLength(0)
  } finally {
    await app.close()
  }
})