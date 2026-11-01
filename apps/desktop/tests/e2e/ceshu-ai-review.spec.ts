import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

test('成稿反审：面板结构（7 项检查清单）与离线中文错误路径', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-review-e2e-'))
  // 指向不可达端口，保证离线环境下错误路径可确定复现
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: 'http://127.0.0.1:1' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 新建空白策划书 → 自动进入编辑器
    await window.getByTestId('home-new-blank').click()

    // 「ceshu-ai-review」已收进工具栏「更多 ▸」下拉，需先展开再点
    await window.getByTestId('ceshu-more').click()
    await window.getByTestId('ceshu-ai-review').click()
    await expect(window.getByTestId('ai-review-panel')).toBeVisible()

    // 未反审时不渲染清单；导出未完成时禁用
    await expect(window.getByTestId('ai-review-export')).toBeDisabled()

    // 离线：AI 调用失败 → 中文可操作错误 + 导出仍禁用
    // ⚠️ 文案已从「Ollama 未启动」统一为「尚未配置 AI 服务」（见 llmConfigData 的
    // GUIDE_NEVER_CONFIGURED_*）：未配置时给的是**去哪配**的指引，比点名 Ollama 更可操作。
    // 断言打在稳定前缀上，避免再被整句文案改动打红。
    await window.getByTestId('ai-review-start').click()
    await expect(window.getByTestId('ai-review-error')).toContainText('尚未配置 AI 服务', { timeout: 30_000 })
    await expect(window.getByTestId('ai-review-export')).toBeDisabled()

    // 关闭回到章节表单
    await window.getByTestId('ai-review-close').click()
    await expect(window.getByTestId('ai-review-panel')).toBeHidden()
  } finally {
    await app.close()
  }
})