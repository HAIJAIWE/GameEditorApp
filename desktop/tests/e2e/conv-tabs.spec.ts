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
