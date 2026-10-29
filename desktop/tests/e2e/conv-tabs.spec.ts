import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * 中栏子页签（对齐 dsh 的 conversation 子页签）：对话 / 轨迹。
 *
 * 断言的是**行为**而不是像素：切到轨迹时消息区与输入区收起、轨迹区出现；
 * 切回对话后输入框仍在（`hidden` 不卸载，草稿不丢）。
 */
test('中栏子页签：对话 ↔ 轨迹 切换，输入区随视图显隐且草稿不丢', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-conv-tabs-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 默认在「对话」：无轨迹区，输入框可见
    await expect(window.getByTestId('conv-tab-chat')).toHaveAttribute('aria-current', 'page')
    await expect(window.getByTestId('conv-trajectory')).toHaveCount(0)
    await expect(window.getByTestId('digital-panel')).toBeVisible()

    // 先在输入框留一段草稿
    const composer = window.locator('.digital-input-row input, .digital-input-row textarea').first()
    await composer.fill('未发送的草稿')

    // 切到「轨迹」：轨迹区出现，消息区与输入区收起
    await window.getByTestId('conv-tab-trajectory').click()
    await expect(window.getByTestId('conv-tab-trajectory')).toHaveAttribute('aria-current', 'page')
    await expect(window.getByTestId('conv-trajectory')).toBeVisible()
    await expect(window.getByTestId('digital-messages')).toBeHidden()
    await expect(composer).toBeHidden()

    // 切回「对话」：输入框回来且草稿还在（未被卸载）
    await window.getByTestId('conv-tab-chat').click()
    await expect(window.getByTestId('conv-trajectory')).toHaveCount(0)
    await expect(composer).toBeVisible()
    await expect(composer).toHaveValue('未发送的草稿')
  } finally {
    await app.close()
  }
})

/**
 * 输入框左下「＋」：把本来就存在、但只能靠打字触发的两个能力摆到明面上。
 *
 * 断言的是「点完真的把触发符填进输入框且菜单收起」——不是「按钮能点」。
 * 这两个能力（@ 引用数据表 / / 斜杠命令）在别处已有用例覆盖，这里只验入口。
 */
test('输入框「＋」菜单：注入 @ 与 / 触发符并自动收起', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-composer-plus-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    const input = window.getByTestId('digital-input')
    await expect(window.getByTestId('digital-composer-menu')).toHaveCount(0)

    await window.getByTestId('digital-composer-add').click()
    await expect(window.getByTestId('digital-composer-menu')).toBeVisible()

    await window.getByTestId('composer-insert-reference').click()
    await expect(window.getByTestId('digital-composer-menu')).toHaveCount(0)
    await expect(input).toHaveValue('@')

    // 清空再试第二项，避免 @ 引用菜单挡着
    await input.fill('')
    await window.getByTestId('digital-composer-add').click()
    await window.getByTestId('composer-insert-command').click()
    await expect(input).toHaveValue('/')
  } finally {
    await app.close()
  }
})

/**
 * 输入框「模型」下拉：真下拉（对齐 dsh 的 conversation.input.model）。
 * 断言「点开列出可选模型 → 选中后菜单收起且 chip 文案更新」，而不是「按钮能点」——
 * 选中的模型会写回 localStorage + 推主进程镜像，后续 agent 调用即生效。
 */
test('输入框「模型」下拉：列出可选模型并切换生效', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-model-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    const trigger = window.getByTestId('digital-composer-model')
    await expect(window.getByTestId('digital-model-menu')).toHaveCount(0)

    await trigger.click()
    const menu = window.getByTestId('digital-model-menu')
    await expect(menu).toBeVisible()

    const items = window.getByTestId('digital-model-item')
    const count = await items.count()
    expect(count).toBeGreaterThan(0)

    const targetModel = (await items.nth(0).getAttribute('data-model')) ?? ''
    expect(targetModel).not.toBe('')
    await items.nth(0).click()

    await expect(menu).toHaveCount(0)
    await expect(trigger).toHaveText(new RegExp(targetModel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')))
  } finally {
    await app.close()
  }
})
