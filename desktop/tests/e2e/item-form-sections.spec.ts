import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test, type Page } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, openCeshuFromHome, openDataEditor, seedCeshu } from './helpers/ceshuData'

/**
 * 条目编辑器表单：**折叠分区**（2026-10-19 恢复，源自 旧版 `FIELD_GROUPS`）。
 *
 * ## 结构沿革（两次反转，都以用户要求为准）
 * - 2026-10-04：从更新版 旧版 `FIELD_GROUPS` 迁入分区卡片（含双列 grid + emoji 前缀）。
 * - 2026-10-13：用户对照**旧版 旧版 截图**明确满意扁平一列 ⇒ 整体拉平，分区代码删除。
 * - 2026-10-19：用户再对照**分区版截图**要求恢复 ⇒ 分区回归，
 *   **但双列 grid 与 `STAT_LABELS` emoji 前缀仍不恢复**（目标截图里是单列 + 原始标签）。
 *
 * 锁四件事：
 * 1. 结构：按类型的 `FORM_GROUPS` 产出分区，标题/顺序正确；**默认全部展开**（不藏字段）；
 * 2. 顺序：分区**内**按分区定义顺序（≠ schema 顺序，旧版 亦如此），一个字段不丢不重；
 * 3. 标签：字段自身 label（经术语替换），**无** emoji 前缀（📊/⏱️ 仍是 grid 时代产物）；
 * 4. 保存链路仍然正确（控件挂载方式变了，这是结构改动的真实风险）。
 *
 * ⚠️ 折叠分区**不渲染**子内容（不是 CSS 隐藏）：一旦有分区被折叠，其字段的
 * `getByTestId` 会拿到 0 个元素。默认全展开就是为免此坑 —— 数据编辑器里
 * 「打开条目却看不到要改的字段」比滚动长一点更难接受。
 */

/** 点表头切换某个分区的折叠态 */
async function toggleSection(page: Page, title: string): Promise<void> {
  await page.locator(`[data-testid="form-section-head"][data-section="${title}"]`).click()
}

/** role 的分区定义（`shared/formSections.ts::FORM_GROUPS.role`，与实现同源维护） */
const ROLE_SECTIONS: ReadonlyArray<{ title: string; fields: readonly string[] }> = [
  { title: '基础信息', fields: ['id', 'name', 'job', 'race', 'faction', 'category'] },
  { title: '属性面板 (RPG三层体系)', fields: ['attr_list'] },
  { title: '技能 & 天赋', fields: ['skills', 'talents', 'buffs'] },
  { title: '特殊机制', fields: ['mechanism'] },
  { title: '描述 & 图片', fields: ['tags', 'template', 'desc', 'image', 'image_desc', 'image_tags'] }
]

/** role 的字段标签（按 role 分区定义顺序展平） */
const ROLE_LABELS: readonly string[] = [
  'ID:',
  '角色名称:',
  '职业:',
  '种族:',
  '势力:',
  '分类:',
  '属性列表:',
  '技能列表:',
  '天赋列表:',
  'Buff列表:',
  '特殊机制:',
  '标签:',
  '描述模板:',
  '描述:',
  '图片:',
  '图片描述:',
  '图片标签:'
]

test('条目编辑器表单：折叠分区结构 + 分区内顺序 + 控件不重复 + 保存往返', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-form-sections-e2e-'))
  const title = 'E2E 分区表单'
  seedCeshu(userDataDir, {
    title,
    systems: [{ key: 'role', label: '角色', dataType: 'role' }]
  })
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '角色')
    await createDataItem(window)
    await window.getByTestId('ceshu-data-item-row').first().click()
    await expect(window.getByTestId('item-editor')).toBeVisible()

    // ① 分区标题与顺序 = FORM_GROUPS.role
    const sectionTitles = await window.$$eval('[data-testid="form-section-head"] .form-section-title', (nodes) =>
      nodes.map((node) => node.textContent ?? '')
    )
    expect(sectionTitles).toEqual(ROLE_SECTIONS.map((section) => section.title))

    // ② 默认**全部展开**（数据编辑器里不给用户藏字段），每个分区都有 body
    await expect(window.locator('[data-testid="form-section-head"]')).toHaveCount(ROLE_SECTIONS.length)
    await expect(window.locator('[data-testid="form-section-head"][aria-expanded="true"]')).toHaveCount(
      ROLE_SECTIONS.length
    )
    await expect(window.locator('[data-testid="form-section-body"]')).toHaveCount(ROLE_SECTIONS.length)

    // ③ 逐个字段断言控件恰一份（attrpanel 曾被 旧版 分区缺陷渲染两遍）
    for (const name of ROLE_SECTIONS.flatMap((section) => section.fields)) {
      await expect(window.getByTestId(`field-${name}`), `字段 ${name} 应恰有一个控件`).toHaveCount(1)
    }

    // ④ 分区内标签顺序 = 分区定义顺序（注意 category 从 schema 第 11 位被提到基础信息末尾）
    const labels = await window.$$eval('[data-testid="form-section-body"] .form-row .form-label', (nodes) =>
      nodes.map((node) => node.textContent ?? '')
    )
    expect(labels).toEqual([...ROLE_LABELS])
    await expect(window.locator('[data-testid="form-section-body"] .form-row')).toHaveCount(
      ROLE_SECTIONS.flatMap((section) => section.fields).length
    )

    // ⑤ 点击表头可折叠，且折叠后子内容**不渲染**（不是 CSS 隐藏）
    await toggleSection(window, '描述 & 图片')
    await expect(window.locator('[data-testid="form-section-head"][aria-expanded="false"]')).toHaveCount(1)
    await expect(window.getByTestId('field-desc')).toHaveCount(0)
    // 再点展开，字段回来
    await toggleSection(window, '描述 & 图片')
    await expect(window.getByTestId('field-desc')).toHaveCount(1)

    // ⑥ 保存链路：分区化后仍正确。判据用「存储真的落盘」而非 notice（保存反馈走 toast）
    await window.getByTestId('field-mechanism').fill('血量低于 30% 时获得减伤')
    await window.getByTestId('item-editor').getByRole('button', { name: '保存' }).click()
    await expect
      .poll(async () => {
        const roles = await window.evaluate(async () => {
          const api = (
            globalThis as unknown as {
              mbApi: { data: { listItems: (req: { type: string }) => Promise<unknown> } }
            }
          ).mbApi
          return api.data.listItems({ type: 'role' })
        })
        const stored = (roles as Array<{ data: Record<string, unknown> }>)[0]
        return stored?.data['mechanism']
      })
      .toBe('血量低于 30% 时获得减伤')
  } finally {
    await app.close()
  }
})

test('条目编辑器表单：标签用字段原始 label（无 STAT_LABELS emoji 前缀）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-form-sections-labels-e2e-'))
  const title = 'E2E 分区表单标签'
  seedCeshu(userDataDir, {
    title,
    systems: [{ key: 'skill', label: '技能', dataType: 'skill' }]
  })
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '技能')
    await createDataItem(window)
    await window.getByTestId('ceshu-data-item-row').first().click()

    // value → 「基础数值:」而不是「📊 数值」；cd → 「冷却:」而不是「⏱️ CD」
    await expect(window.locator('.form-label', { hasText: '基础数值:' })).toHaveCount(1)
    await expect(window.locator('.form-label', { hasText: '冷却:' })).toHaveCount(1)
    // STAT_LABELS 的 8 个 emoji 前缀一个都不许出现（grid 版式仍未恢复）
    for (const emoji of ['📊', '⏱️', '❤️', '💧', '⚔️', '🛡️', '⭐', '✖️']) {
      await expect(
        window.locator('.form-label', { hasText: emoji }),
        `不应出现 ${emoji} 前缀`
      ).toHaveCount(0)
    }
    // skill 18 个字段全部就位（分区只是重新分组，不丢字段）
    await expect(window.locator('[data-testid="form-section-body"] .form-row')).toHaveCount(18)
  } finally {
    await app.close()
  }
})

test('条目编辑器表单：talent 全字段一个都不丢（分区定义不含的字段也有去处）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-form-sections-talent-e2e-'))
  const title = 'E2E 分区表单天赋'
  seedCeshu(userDataDir, {
    title,
    systems: [{ key: 'talent', label: '天赋', dataType: 'talent' }]
  })
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '天赋')
    await createDataItem(window)
    await window.getByTestId('ceshu-data-item-row').first().click()

    // talent 的 16 个字段全部归入分区（分区定义未覆盖的 owner/level/rarity/
    // effect_type 被并入第一个分区，而非渲染到分区外）——一个都不许消失
    for (const name of ['id', 'name', 'owner', 'type', 'level', 'rarity', 'effect_type', 'value', 'unlock_condition', 'category', 'tags', 'template', 'desc', 'image', 'image_desc', 'image_tags']) {
      await expect(window.getByTestId(`field-${name}`), `字段 ${name} 不应消失`).toHaveCount(1)
    }
    const labels = await window.$$eval('[data-testid="form-section-body"] .form-row .form-label', (nodes) =>
      nodes.map((node) => node.textContent ?? '')
    )
    expect(labels).toEqual([
      'ID:',
      '天赋名称:',
      '归属角色:',
      '天赋类型:',
      '天赋等级:',
      '稀有度:',
      '分类:',
      '数值:',
      '效果类型:',
      '解锁条件:',
      '标签:',
      '描述模板:',
      '描述:',
      '图片:',
      '图片描述:',
      '图片标签:'
    ])
  } finally {
    await app.close()
  }
})
