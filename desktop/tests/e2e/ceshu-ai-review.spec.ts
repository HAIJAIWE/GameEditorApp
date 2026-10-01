import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

test('AI 审阅：面板结构（5 维度）与离线中文错误路径', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-review-e2e-'))
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

    await window.getByTestId('ceshu-ai-review').click()
    await expect(window.getByTestId('ai-review-panel')).toBeVisible()

    // 5 维度结构（初始 0 / 10），导出未完成时禁用
    for (const key of ['completeness', 'consistency', 'market', 'technical', 'creativity']) {
      await expect(window.getByTestId(`ai-review-score-${key}`)).toHaveText('0 / 10')
    }
    await expect(window.getByTestId('ai-review-export')).toBeDisabled()

    // 离线：AI 调用失败 → 中文可操作错误（含 Ollama 指引），导出仍禁用
    await window.getByTestId('ai-review-start').click()
    await expect(window.getByTestId('ai-review-error')).toContainText('Ollama', { timeout: 30_000 })
    await expect(window.getByTestId('ai-review-export')).toBeDisabled()

    // 关闭回到章节表单
    await window.getByTestId('ai-review-close').click()
    await expect(window.getByTestId('ai-review-panel')).toBeHidden()
  } finally {
    await app.close()
  }
})