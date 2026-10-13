import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, openCeshuFromHome, openDataEditor, seedCeshu } from './helpers/ceshuData'

/**
 * 条目编辑器表单：**扁平一列**（对齐 PyQt `ui/widgets/dynamic_form.py::_build_form` 的 `QFormLayout`）。
 *
 * ## 为什么拉平（2026-10-13，用户拍板）
 * TS 早期照抄的是**更新版** Python 的 `FIELD_GROUPS`：可折叠分区卡片 + 双列 grid +
 * `attribute_panel` 专属区 + `STAT_LABELS` emoji 前缀。而用户最满意、两次截图实证的参考版是
 * **扁平一列**：标签在左、控件在右，按 schema 顺序一行一个字段，一列看全、不用展开分区。
 * 本次拉平后，分区相关代码（`shared/formSections.ts` / `FormSectionCard.tsx` / `.form-grid`）
 * 已整体删除——本规格即其结构契约。
 *
 * 锁四件事：
 * 1. 结构：`form-section-*` 不存在；每个 schema 字段恰一行，顺序 = schema 顺序（一个不丢、不重复）；
 * 2. 标签：字段自身 label（经术语替换），**无** `STAT_LABELS` emoji 前缀（📊/⏱️ 是 grid 分区时代产物）；
 * 3. 复杂控件（attrpanel）在扁平行里只渲染一次（Python 曾把它渲染两遍，修正不复发）；
 * 4. 保存链路仍然正确（控件挂载方式变了，这是结构改动的真实风险）。
 */

/** role 的 schema 字段名（`typeSchemaData.ts`，共 17 个；数组顺序即 schema 顺序） */
const ROLE_FIELDS: readonly string[] = [
  'id',
  'name',
  'job',
  'race',
  'faction',
  'attr_list',
  'skills',
  'talents',
  'buffs',
  'mechanism',
  'category',
  'tags',
  'template',
  'desc',
  'image',
  'image_desc',
  'image_tags'
]

/** role 的 schema 字段标签（与 ROLE_FIELDS 一一对应） */
const ROLE_LABELS: readonly string[] = [
  'ID:',
  '角色名称:',
  '职业:',
  '种族:',
  '势力:',
  '属性列表:',
  '技能列表:',
  '天赋列表:',
  'Buff列表:',
  '特殊机制:',
  '分类:',
  '标签:',
  '描述模板:',
  '描述:',
  '图片:',
  '图片描述:',
  '图片标签:'
]

/** talent 的 schema 字段名（`typeSchemaData.ts`，共 16 个；旧分区配置只认 value，其余走兜底） */
const TALENT_FIELDS: readonly string[] = [
  'id',
  'name',
  'owner',
  'type',
  'level',
  'rarity',
  'effect_type',
  'value',
  'unlock_condition',
  'category',
  'tags',
  'template',
  'desc',
  'image',
  'image_desc',
  'image_tags'
]

test('条目编辑器表单：扁平一列 + schema 顺序 + 复杂控件不重复 + 保存往返', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-form-flat-e2e-'))
  const title = 'E2E 扁平表单'
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

    // ① 无分区卡片：拉平的核心断言（分区/折叠/双列整体不存在）
    await expect(window.locator('[data-testid^="form-section"]')).toHaveCount(0)

    // ② 一行一个字段，顺序 = schema 顺序（role 17 个字段）
    const labels = await window.$$eval('.editor-body .form-row .form-label', (nodes) =>
      nodes.map((node) => node.textContent ?? '')
    )
    expect(labels).toEqual([...ROLE_LABELS])
    await expect(window.locator('.editor-body .form-row')).toHaveCount(ROLE_FIELDS.length)

    // ③ 每个字段控件恰一份（attrpanel 曾被 Python 分区缺陷渲染两遍）
    for (const name of ROLE_FIELDS) {
      await expect(window.getByTestId(`field-${name}`), `字段 ${name} 应恰有一个控件`).toHaveCount(1)
    }

    // ④ 编辑 + 保存：扁平化后保存链路仍正确。
    // 判据用「存储真的落盘」而非 `.notice-banner`——保存反馈走 toast，App 级 notice
    // 只服务撤销/重做/清空等（见 attr-formula-builder.spec.ts 同款踩坑记录）。
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
    // 未编辑字段仍按默认载入，未被清空（新条目默认名 = 「角色 1」）
    await expect(window.getByTestId('field-name')).toHaveValue('角色 1')
  } finally {
    await app.close()
  }
})

test('条目编辑器表单：标签用字段原始 label（无 STAT_LABELS emoji 前缀）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-form-flat-labels-e2e-'))
  const title = 'E2E 扁平表单标签'
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
    await expect(window.locator('.editor-body .form-label', { hasText: '基础数值:' })).toHaveCount(1)
    await expect(window.locator('.editor-body .form-label', { hasText: '冷却:' })).toHaveCount(1)
    // STAT_LABELS 的 8 个 emoji 前缀一个都不许出现（grid 分区已删除）
    for (const emoji of ['📊', '⏱️', '❤️', '💧', '⚔️', '🛡️', '⭐', '✖️']) {
      await expect(
        window.locator('.editor-body .form-label', { hasText: emoji }),
        `不应出现 ${emoji} 前缀`
      ).toHaveCount(0)
    }
    // 扁平行数 = schema 字段数（skill 18 个）
    await expect(window.locator('.editor-body .form-row')).toHaveCount(18)
  } finally {
    await app.close()
  }
})

test('条目编辑器表单：talent 全字段平铺（schema 差异类型一个都不丢）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-form-flat-talent-e2e-'))
  const title = 'E2E 扁平表单天赋'
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

    // 旧分区配置只认 talent 的 value，其余 15 个字段靠「未归组兜底」保留；
    // 扁平后全部同构平铺——一个字段都不许消失
    for (const name of TALENT_FIELDS) {
      await expect(window.getByTestId(`field-${name}`), `兜底字段 ${name} 不应消失`).toHaveCount(1)
    }
    const labels = await window.$$eval('.editor-body .form-row .form-label', (nodes) =>
      nodes.map((node) => node.textContent ?? '')
    )
    expect(labels).toHaveLength(TALENT_FIELDS.length)
  } finally {
    await app.close()
  }
})
