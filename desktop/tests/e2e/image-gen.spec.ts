import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

/**
 * AI 生图面板（迁移 `features/_ai_image.py` 的 UI 能力）。
 *
 * 覆盖**不需要真实云 API** 的链路：面板打开、字段渲染、前置校验（缺 Key / 缺目录 / 缺描述）、
 * 配置持久化（localStorage，跨重载）。
 *
 * 真实云端调用（需 API Key + 计费）**不在 E2E 范围**——由人工/CI 带 Key 验证。
 */
test('AI 生图：面板打开 → 前置校验 → 配置持久化', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-imagegen-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    // 打开生图面板
    await window.getByTestId('open-image-gen').click()
    await expect(window.getByTestId('image-gen-panel')).toBeVisible()
    await expect(window.getByTestId('image-gen-provider')).toBeVisible()
    await expect(window.getByTestId('image-gen-prompt')).toBeVisible()

    // 1) 缺描述 → 提示（字段校验先于 Key/目录）
    await window.getByTestId('image-gen-generate').click()
    await expect(window.getByTestId('image-gen-error')).toContainText('请先填写图片描述')

    // 2) 有描述但缺 Key → 提示 Key
    await window.getByTestId('image-gen-prompt').fill('一只赛博朋克风格的猫')
    await window.getByTestId('image-gen-generate').click()
    await expect(window.getByTestId('image-gen-error')).toContainText('请先填写 API Key')

    // 3) 有 Key 但未选目录 → 提示目录（不发起真实云请求）
    await window.getByTestId('image-gen-apikey').fill('sk-e2e-not-a-real-key')
    await window.getByTestId('image-gen-generate').click()
    await expect(window.getByTestId('image-gen-error')).toContainText('请先选择保存目录')

    // 4) 配置持久化：换 provider + 填 model，重载后仍在
    await window.getByTestId('image-gen-provider').selectOption('qwen')
    await window.getByTestId('image-gen-model').fill('qwen-vl-max')
    await window.getByTestId('image-gen-prompt').fill('')
    await window.reload()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    await window.getByTestId('open-image-gen').click()
    await expect(window.getByTestId('image-gen-provider')).toHaveValue('qwen')
    await expect(window.getByTestId('image-gen-model')).toHaveValue('qwen-vl-max')
    await expect(window.getByTestId('image-gen-apikey')).toHaveValue('sk-e2e-not-a-real-key')
  } finally {
    await app.close()
  }
})
