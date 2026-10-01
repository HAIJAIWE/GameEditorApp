import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

test('AI 生成：按钮存在；本地服务不可用时给出中文可操作提示（含 ollama 指引）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-ai-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    // 指向不可达端口，保证离线环境下错误路径可确定复现
    env: { ...process.env, MB_USER_DATA_DIR: userDataDir, MB_OLLAMA_HOST: 'http://127.0.0.1:1' }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    await window.getByTestId('mode-ceshu').click()
    await window.getByTestId('ceshu-create').click()

    // 章节表单（非 systems 章）应出现两个 AI 按钮
    await expect(window.getByTestId('ai-generate-chapter')).toBeVisible()
    await expect(window.getByTestId('ai-fill-empty')).toBeVisible()

    // 生成失败：本地服务不可达 → 表单内错误提示含 Ollama 指引
    await window.getByTestId('ai-generate-chapter').click()
    await expect(window.getByTestId('chapter-form-error')).toBeVisible()
    await expect(window.getByTestId('chapter-form-error')).toContainText('Ollama')
    await expect(window.getByTestId('chapter-form-error')).toContainText('ollama serve')

    // 切换章节后表单重建，AI 按钮仍在
    await window.getByTestId('chapter-tab').filter({ hasText: '第十二章·战斗系统设计' }).click()
    await expect(window.getByTestId('ai-fill-empty')).toBeVisible()
    await window.getByTestId('ai-fill-empty').click()
    await expect(window.getByTestId('chapter-form-error')).toContainText('Ollama')
  } finally {
    await app.close()
  }
})