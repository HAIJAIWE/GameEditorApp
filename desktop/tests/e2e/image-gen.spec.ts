import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * AI 生图面板（迁移 `features/_ai_image.py` 的 UI 能力）。
 *
 * 覆盖**不需要真实云 API** 的链路：面板打开、字段渲染、前置校验（缺 Key / 缺目录 / 缺描述）、
 * API Key 存进系统钥匙串（`safeStorage`，跨重载仍在）、**localStorage 里不再有明文**。
 *
 * 真实云端调用（需 API Key + 计费）**不在 E2E 范围**——由人工/CI 带 Key 验证。
 */
test('AI 生图：面板打开 → 前置校验 → Key 进钥匙串且本地无明文', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-imagegen-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 打开生图面板
    await window.getByTestId('open-image-gen').click()
    await expect(window.getByTestId('image-gen-panel')).toBeVisible()
    await expect(window.getByTestId('image-gen-provider')).toBeVisible()
    await expect(window.getByTestId('image-gen-prompt')).toBeVisible()
    // 初始未配置过钥匙串
    await expect(window.getByTestId('image-gen-secret-state')).toContainText('未配置')

    // 1) 缺描述 → 提示（字段校验先于 Key/目录）
    await window.getByTestId('image-gen-generate').click()
    await expect(window.getByTestId('image-gen-error')).toContainText('请先填写图片描述')

    // 2) 有描述但没存进钥匙串 → 提示先配置（在输入框里填了也不算）
    await window.getByTestId('image-gen-prompt').fill('一只赛博朋克风格的猫')
    await window.getByTestId('image-gen-apikey').fill('sk-e2e-not-a-real-key')
    await window.getByTestId('image-gen-generate').click()
    await expect(window.getByTestId('image-gen-error')).toContainText('请先配置 API Key')

    // 3) 保存到钥匙串 → 输入框被清空、状态变「已配置」
    await window.getByTestId('image-gen-save-apikey').click()
    await expect(window.getByTestId('image-gen-secret-state')).toContainText('已配置')
    await expect(window.getByTestId('image-gen-apikey')).toHaveValue('')

    // 4) 已存 Key 但未选目录 → 提示目录（不发起真实云请求）
    await window.getByTestId('image-gen-generate').click()
    await expect(window.getByTestId('image-gen-error')).toContainText('请先选择保存目录')

    // 5) 非敏感表单持久化 + Key 跨重载仍在钥匙串；**localStorage 里不得有 apiKey 明文**
    await window.getByTestId('image-gen-provider').selectOption('qwen')
    await window.getByTestId('image-gen-model').fill('qwen-vl-max')
    await window.getByTestId('image-gen-prompt').fill('')
    await window.reload()
    await waitReady(window)

    await window.getByTestId('open-image-gen').click()
    await expect(window.getByTestId('image-gen-provider')).toHaveValue('qwen')
    await expect(window.getByTestId('image-gen-model')).toHaveValue('qwen-vl-max')
    // 重载后仍显示「已配置」→ Key 真进了 safeStorage，不是内存里的假象
    await expect(window.getByTestId('image-gen-secret-state')).toContainText('已配置')

    const storedConfig = await window.evaluate(() => window.localStorage.getItem('mb.imageGenConfig'))
    expect(storedConfig ?? '').not.toContain('apiKey')
    expect(storedConfig ?? '').not.toContain('sk-e2e-not-a-real-key')

    // 6) 清除钥匙串里的 Key → 状态回到「未配置」
    await window.getByTestId('image-gen-delete-apikey').click()
    await expect(window.getByTestId('image-gen-secret-state')).toContainText('未配置')
  } finally {
    await app.close()
  }
})
