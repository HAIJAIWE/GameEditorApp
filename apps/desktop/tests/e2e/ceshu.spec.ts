import { existsSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, libraryDir, waitReady } from './helpers/app'
import { CHAPTER_KEYS, DEFAULT_DISABLED_MODULE_CHAPTERS } from '@mobai/shared/ceshu/reference'

test('策划书：读取旧版文件 → 新建 → 编辑保存章节 → 磁盘落盘', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-e2e-'))
  const ceshuDir = join(libraryDir(userDataDir), 'ceshu')
  mkdirSync(ceshuDir, { recursive: true })

  // 旧版 旧版 格式样本：章节字段与当前默认不同、缺章节、含未知顶层键
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
    await expect(window.getByTestId('home-card').first()).toContainText

    // 新建空白策划书 → 自动进入编辑器。
    // 章节数**不写死**：专业版可见章 = `CHAPTER_KEYS` − 新建时默认关闭的发行期三章；
    // 且编辑器默认按「立项阶段」筛选只显示 7 章，故先切「全部阶段」再数。
    await window.getByTestId('home-new-blank').click()
    await window.getByTestId('stage-filter-all').click()
    await expect(window.getByTestId('chapter-tab')).toHaveCount(CHAPTER_KEYS.length - DEFAULT_DISABLED_MODULE_CHAPTERS.length)
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
    const combatTab = window.getByTestId('chapter-tab').filter({ hasText: '战斗系统设计' })
    await combatTab.click()
    await window.getByTestId('ceshu-field-damage_formula').fill('伤害 = 攻击 - 防御')
    await window.getByTestId('chapter-save').click()
    await expect(combatTab).toContainText('50%')

    // 第四章（游戏系统）：启用「战斗」并保存。
    // 注意：从首页重进编辑器时 `stageFilter` 会重置回「立项阶段」，而第四章归研发阶段 ⇒ 需再切一次全部。
    await window.getByTestId('stage-filter-all').click()
    await window.getByTestId('chapter-tab').filter({ hasText: '游戏系统设计' }).click()
    await window.getByTestId('system-toggle-battle').check()
    await expect(window.getByTestId('system-field-battle-turn_mode')).toBeVisible()
    await window.getByTestId('chapter-save').click()
    await expect(window.getByText('已保存：4. 游戏系统设计')).toBeVisible()

    // 磁盘落盘校验：新文档落成**项目文件夹**（config.json + design/*.md + data/*.json）。
    // 旧版 `<id>.json` 单文件仍可读，但新建不再产生 ⇒ 用「含 config.json 且游戏名匹配的目录」定位新文档。
    const newFolder = readdirSync(ceshuDir, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .map((entry) => entry.name)
      .find((name) => {
        const configPath = join(ceshuDir, name, 'config.json')
        if (!existsSync(configPath)) return false
        const config = JSON.parse(readFileSync(configPath, 'utf-8')) as { game_name?: string }
        return config.game_name === 'E2E 测试游戏'
      })
    expect(newFolder).toBeDefined()
    const folderPath = join(ceshuDir, newFolder as string)

    const config = JSON.parse(readFileSync(join(folderPath, 'config.json'), 'utf-8')) as Record<string, unknown>
    expect(config['ceshu_id']).toMatch(/^[0-9a-f]{8}$/)
    expect(typeof config['created_at']).toBe('string')
    expect(config['gdd_scope']).toBe('full')
    expect(config['game_name']).toBe('E2E 测试游戏')

    // 章节数据与配置分离：文字字段进 design/<章>.md，结构化字段进 data/<章>.json
    const combatFiles = ['design/combat.md', 'data/combat.json']
      .map((relative) => join(folderPath, relative))
      .filter((path) => existsSync(path))
    expect(combatFiles.some((path) => readFileSync(path, 'utf-8').includes('伤害 = 攻击 - 防御'))).toBe(true)
    const systems = JSON.parse(readFileSync(join(folderPath, 'data', 'systems.json'), 'utf-8')) as Record<
      string,
      Record<string, unknown>
    >
    expect((systems['battle'] ?? {})['enabled']).toBe(true)

    // 原子写不残留临时文件（含子目录）
    expect(readdirSync(ceshuDir, { recursive: true }).filter((entry) => String(entry).endsWith('.tmp'))).toHaveLength(0)
  } finally {
    await app.close()
  }
})