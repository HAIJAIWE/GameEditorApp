import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * 字段 ID · 拼音层。
 *
 * 与 `type-field-id.spec.ts`（术语表层）**正交**，本用例锁四件事：
 * 1. 术语表**未收录**的词（`斗能`）也能出确定拼音候选 `dou_neng` —— 这正是拼音层存在的理由
 *    ；
 * 2. 两层可**同时在场**且互不遮蔽：`攻击力` → 术语层 `atk`、拼音层 `gong_ji_li`；
 * 3. 候选仍需**点选**才写入（沿用「只提案不写入」，展开候选不覆盖字段名）；
 * 4. 新建类型的类型 ID 随中文名自动填拼音，**用户手改 ID 后不再覆盖**，既有类型 ID 永不被改。
 *
 * 注：本沙箱 Electron 起不来（`Process failed to launch!`，既有 E2E 同样失败，属环境限制），
 * 本用例按既有模式写就、待 CI 实跑；同一批断言已在 `preview/verify-e58.mjs`（真渲染 bundle）跑通 14/14。
 */
test('字段 ID 拼音层：未收录词可转拼音 / 两层对照 / 点选才写入 / 类型 ID 自动填', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-field-id-pinyin-e2e-'))
  const app = await launchApp(userDataDir)
  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 新 IA 无侧栏入口：工具菜单 → 字段结构编辑器
    await window.getByTestId('menu-title-tools').click()
    await window.getByTestId('menuitem-tools-fieldEditor').click()
    await expect(window.getByTestId('type-editor-panel')).toBeVisible()
    await window.getByTestId('te-type-tab').filter({ hasText: '职业' }).click()

    const lastName = window.locator('[data-testid^="te-field-name-"]').last()
    const lastLabel = window.locator('[data-testid^="te-field-label-"]').last()
    const lastPinyin = window.locator('[data-testid^="te-field-pinyin-"]').last()
    const lastGenerate = window.locator('[data-testid^="te-field-generate-"]').last()
    const pinyinChip = window.locator('[data-testid^="te-id-suggest-apply-"][data-source="pinyin"]').last()
    const termChip = window.locator('[data-testid^="te-id-suggest-apply-"][data-source="term"]').last()

    // —— 1) 术语表未收录的词，拼音层仍给确定候选 ——
    await window.getByTestId('te-add-field').click()
    await lastLabel.fill('斗能')
    await lastGenerate.click()
    await expect(window.locator('[data-testid^="te-id-suggest-error-"]').last()).toContainText('未收录')
    await lastPinyin.click()
    await expect(pinyinChip).toHaveText('dou_neng')
    // 展开候选不自动覆盖字段名
    await expect(lastName).toHaveValue(/^field_\d+$/)
    await pinyinChip.click()
    await expect(lastName).toHaveValue('dou_neng')

    // —— 2) 两层对照：术语层 atk / 拼音层 gong_ji_li 同时在场 ——
    await window.getByTestId('te-add-field').click()
    await lastLabel.fill('攻击力')
    await lastGenerate.click()
    await expect(termChip).toHaveText('atk')
    await lastPinyin.click()
    await expect(pinyinChip).toHaveText('gong_ji_li')
    await expect(termChip).toHaveText('atk') // 拼音层加入后术语层候选仍在

    // —— 3) 新建类型：中文名 → 类型 ID 自动填拼音；手改后不再被覆盖 ——
    await window.getByTestId('te-new-type').click()
    await window.getByTestId('te-type-name').fill('卡牌')
    await expect(window.getByTestId('te-type-id')).toHaveValue('ka_pai')
    await window.getByTestId('te-type-id').fill('card')
    await window.getByTestId('te-type-name').fill('卡组')
    await expect(window.getByTestId('te-type-id')).toHaveValue('card')

    // —— 4) 既有类型 ID 不被中文名自动改动 ——
    await window.getByTestId('te-type-tab').filter({ hasText: '职业' }).click()
    await window.getByTestId('te-type-name').fill('职业改名')
    await expect(window.getByTestId('te-type-id')).toHaveValue('job')
  } finally {
    await app.close()
  }
})
