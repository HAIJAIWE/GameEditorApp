import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

test('AI 生成：按钮存在；本地服务不可用时给出中文可操作提示（含 ollama 指引）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-ai-e2e-'))
  // 指向不可达端口，保证离线环境下错误路径可确定复现
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: 'http://127.0.0.1:1' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)

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

test('AI 一键生成：离线时首章失败即中断并给出错误汇总，后续章节保持待生成', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-ai-full-e2e-'))
  // 指向不可达端口，保证离线环境下错误路径可确定复现
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: 'http://127.0.0.1:1' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    await window.getByTestId('mode-ceshu').click()
    await window.getByTestId('ceshu-create').click()

    // 打开一键生成面板：进度列表按依赖顺序展示（meta 在前）
    await window.getByTestId('ceshu-ai-full').click()
    await expect(window.getByTestId('ai-full-panel')).toBeVisible()
    await expect(window.getByTestId('ai-full-status-meta')).toContainText('待生成')

    // 未填简要描述直接开始 → 面板提示必填
    await window.getByTestId('ai-full-start').click()
    await expect(window.getByTestId('ai-full-error')).toContainText('简要描述')

    // 填写描述后开始生成：本地服务不可达 → 首章（meta）失败即中断
    await window.getByTestId('ai-full-desc').fill('一款仙侠题材的开放世界 RPG，玩家扮演修真者探索三界。')
    await window.getByTestId('ai-full-start').click()
    await expect(window.getByTestId('ai-full-status-meta')).toContainText('失败', { timeout: 30_000 })
    await expect(window.getByTestId('ai-full-status-meta')).toContainText('Ollama')
    await expect(window.getByTestId('ai-full-summary')).toContainText('生成中断')

    // 中止策略：后续章节未再调用 LLM，保持待生成；无结果时不可应用
    await expect(window.getByTestId('ai-full-status-vision')).toContainText('待生成')
    await expect(window.getByTestId('ai-full-apply')).toBeDisabled()
    await expect(window.getByTestId('ai-full-retry')).toBeEnabled()
  } finally {
    await app.close()
  }
})