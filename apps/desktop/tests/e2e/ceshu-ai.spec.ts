import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

// ⚠️ 本文件的错误文案断言在 M0（DD-0「默认档位纠正」）后**前提已变**：
// 未配置时 `LlmClient.generate` 在**任何网络请求之前**就抛 `LLM_MESSAGES.notConfigured`，
// 不再回落到「探本地 Ollama」。故断言从「Ollama / ollama serve」改为「尚未配置 AI 服务」。
//
// ⚠️ 之所以能走到「未配置」这条路，**靠的是本文件用 `mkdtempSync` 新建的全新 userDataDir
// （localStorage 为空）**，而不是「渲染层不推配置」——
// 渲染层现在**确实**在启动时推（`llmBootstrap.ts::pushLlmConfigMirror`，且带
// `hasStoredLlmConfig()` 守卫），只是空配置时**主动跳过**，让主进程镜像保持 `null`。
// 判据链：空 localStorage ⇒ `hasStored === false` ⇒ 不推 ⇒ `llmConfigMirror === null`
//        ⇒ `config === undefined` ⇒ 抛 `notConfigured`。
// ⚠️ 若哪天守卫被删（改回无条件推送），本文件会因「镜像非 null」而改收
// 「未启用 API」而**整片转红** —— 这是刻意的：那正是守卫被误删的信号。
//
// `MB_OLLAMA_HOST: 'http://127.0.0.1:1'` 保留为**第二道保险**：万一镜像非 null
// （如上所述的回归），它也能保证本地档不可达，不会真的发出云端请求。
test('AI 生成：按钮存在；未配置 AI 服务时给出可执行的中文指引（不发任何请求）', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-ai-e2e-'))
  // 指向不可达端口，保证离线环境下错误路径可确定复现
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: 'http://127.0.0.1:1' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 新建空白策划书 → 自动进入编辑器
    await window.getByTestId('home-new-blank').click()

    // 章节表单（非 systems 章）应出现两个 AI 按钮
    await expect(window.getByTestId('ai-generate-chapter')).toBeVisible()
    await expect(window.getByTestId('ai-fill-empty')).toBeVisible()

    // 生成失败：未配置 ⇒ 表单内错误提示给出「去哪配置 / 可一键保密」的指引
    await window.getByTestId('ai-generate-chapter').click()
    await expect(window.getByTestId('chapter-form-error')).toBeVisible()
    await expect(window.getByTestId('chapter-form-error')).toContainText('尚未配置 AI 服务')
    await expect(window.getByTestId('chapter-form-error')).toContainText('设置 → AI 模型服务')
    // 不该出现「启动本地服务」这类指引：用户还没配过，谈不上本地服务没起
    await expect(window.getByTestId('chapter-form-error')).not.toContainText('ollama serve')

    // 切换章节后表单重建，AI 按钮仍在
    await window.getByTestId('chapter-tab').filter({ hasText: '战斗系统设计' }).click()
    await expect(window.getByTestId('ai-fill-empty')).toBeVisible()
    await window.getByTestId('ai-fill-empty').click()
    await expect(window.getByTestId('chapter-form-error')).toContainText('尚未配置 AI 服务')
  } finally {
    await app.close()
  }
})

test('AI 一键生成：未配置时首章失败即中断并给出错误汇总，后续章节保持待生成', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-ai-full-e2e-'))
  // 指向不可达端口，保证离线环境下错误路径可确定复现
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: 'http://127.0.0.1:1' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 新建空白策划书 → 自动进入编辑器
    await window.getByTestId('home-new-blank').click()

    // 打开一键生成面板：进度列表按依赖顺序展示（meta 在前）
    await window.getByTestId('ceshu-ai-full').click()
    await expect(window.getByTestId('ai-full-panel')).toBeVisible()
    await expect(window.getByTestId('ai-full-status-meta')).toContainText('待生成')

    // 未填简要描述直接开始 → 面板提示必填
    await window.getByTestId('ai-full-start').click()
    await expect(window.getByTestId('ai-full-error')).toContainText('简要描述')

    // 填写描述后开始生成：未配置 ⇒ 首章（meta）失败即中断
    // ⚠️ 面板是**两段式**：首次点「开始生成」只是进入成本确认（`confirming`），
    // 必须再点 `ai-full-confirm-yes` 才真正跑。旧用例只点了 start，故一直停在 pending。
    await window.getByTestId('ai-full-desc').fill('一款仙侠题材的开放世界 RPG，玩家扮演修真者探索三界。')
    await window.getByTestId('ai-full-start').click()
    await window.getByTestId('ai-full-confirm-yes').click()
    await expect(window.getByTestId('ai-full-status-meta')).toContainText('失败', { timeout: 30_000 })
    await expect(window.getByTestId('ai-full-status-meta')).toContainText('尚未配置 AI 服务')
    await expect(window.getByTestId('ai-full-summary')).toContainText('生成中断')

    // 中止策略：后续章节未再调用 LLM，保持待生成；无结果时不可应用
    await expect(window.getByTestId('ai-full-status-vision')).toContainText('待生成')
    await expect(window.getByTestId('ai-full-apply')).toBeDisabled()
    await expect(window.getByTestId('ai-full-retry')).toBeEnabled()
  } finally {
    await app.close()
  }
})