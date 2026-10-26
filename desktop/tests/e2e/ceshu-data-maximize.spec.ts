import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { createDataItem, openCeshuFromHome, openDataEditor, seedCeshu } from './helpers/ceshuData'

/**
 * 数据编辑器「整窗展开」+ 标签列 QFormLayout 语义。
 *
 * 背景：旧版 参考的数据编辑器是**整窗 tab**（实测表单区约占窗宽 78%：列表 ~190 + 表单 ~840
 * @1080 窗），而 TS 内嵌预览只有 44%（再切 200px 列表后表单仅 311px @1184 窗，拉宽窗口也
 * 吃不到红利）—— 这是「字段编辑器没复刻」的真正落点。
 */
test('数据编辑器：展开为整窗 → 字段表单显著变宽；标签列贴合最宽标签且控件起始线对齐', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-data-maximize-'))
  const title = 'E2E 展开数据编辑器'
  seedCeshu(userDataDir, { title, systems: [{ key: 'skill', label: '技能', dataType: 'skill' }] })
  const app = await launchApp(userDataDir)

  const measure = (scope: string) =>
    app.firstWindow().then((window) =>
      window.evaluate((sel) => {
        const root = document.querySelector(sel)
        const form = document.querySelector(`${sel} [data-testid="item-editor"]`)
        const labels = [...document.querySelectorAll(`${sel} .editor-body .form-row .form-label`)]
        // 只取每行的**直接**控件（`.form-row > [data-testid^="field-"]`）：
        // 复杂字段（desc/image/image_tags/ref-drop）内部还有嵌套的 field-*，算进去会误判。
        // ⚠️ 2026-10-19 起字段行在**分区卡**里（折叠分区回归），故选择器多一层
        // `[data-testid="form-section-body"]`；控件起始线按分区各自对齐（分区内 QFormLayout 语义）。
        const controls = [
          ...document.querySelectorAll(
            `${sel} [data-testid="form-section-body"] > .form-row > [data-testid^="field-"]`
          )
        ]
        const lefts = new Set(controls.map((el) => Math.round(el.getBoundingClientRect().left)))
        return {
          present: root !== null && form !== null,
          formW: form ? Math.round(form.getBoundingClientRect().width) : -1,
          labelW: labels.length > 0 ? Math.round(Math.max(...labels.map((el) => el.getBoundingClientRect().width))) : -1,
          labelCount: labels.length,
          controlLefts: [...lefts]
        }
      }, scope)
    )

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    await openCeshuFromHome(window, title)
    await openDataEditor(window, '技能')
    await createDataItem(window)
    await expect(window.getByTestId('item-editor').first()).toBeVisible()

    // 内嵌态：18 行字段，标签列不再是写死的 120px，控件起始线唯一（QFormLayout 等宽标签列）
    const embedded = await measure('.ceshu-preview-body')
    expect(embedded.present).toBe(true)
    expect(embedded.labelCount).toBe(18)
    expect(embedded.labelW).toBeLessThan(100)
    expect(embedded.controlLefts).toHaveLength(1)

    // 展开 → 整窗覆盖层
    await window.getByTestId('ceshu-preview-expand').click()
    const overlay = window.getByTestId('ceshu-data-overlay')
    await expect(overlay).toBeVisible()
    // 覆盖层是新实例：新建一条以渲染字段表单
    await overlay.getByTestId('ceshu-data-create').click()
    await expect(overlay.getByTestId('item-editor')).toBeVisible()

    const maximized = await measure('[data-testid="ceshu-data-overlay"]')
    expect(maximized.present).toBe(true)
    expect(maximized.labelCount).toBe(18)
    // 表单宽度量级跃迁：内嵌 311px 级 → 整窗 700px+
    expect(maximized.formW).toBeGreaterThan(700)
    expect(maximized.formW).toBeGreaterThan(embedded.formW * 2)
    expect(maximized.controlLefts).toHaveLength(1)

    // 收起 → 覆盖层移除，内嵌态仍在
    await window.getByTestId('ceshu-data-overlay-close').click()
    await expect(overlay).toHaveCount(0)
    // 内嵌态仍在（覆盖层收起即销毁，不影响原面板）
    await expect(window.locator('.ceshu-preview-body [data-testid="item-editor"]')).toBeVisible()
  } finally {
    await app.close()
  }
})
