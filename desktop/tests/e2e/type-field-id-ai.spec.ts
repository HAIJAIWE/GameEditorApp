import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * 字段 ID 的 **AI 候选**（术语表未收录时的第二级兜底）。
 *
 * 锁三件事：
 * 1. AI 只提案、点选后才写入（且候选项带 `data-source="ai"` 可与规则候选区分）；
 * 2. 发给模型的提示词确实带上了「显示名 + 已有字段名 + 语义优先不用拼音」；
 * 3. 本地 Ollama 不可用时给**中文错误提示**，不是静默失败。
 *
 * 注：本沙箱 Electron 起不来（`Process failed to launch!`，既有 E2E 同样失败，属环境限制），
 * 本用例按既有模式写就、待 CI 实跑；桩服务写法照抄 `ceshu-ai-datagen.spec.ts`。
 */

interface OllamaStub {
  host: string
  /** 收到的 prompt 列表（用于断言提示词组装） */
  prompts: string[]
  close: () => Promise<void>
}

/** 最小 Ollama 桩服务：`/api/tags` 报一个模型，`/api/generate` 返回固定文本（照抄 W30 写法） */
async function startOllamaStub(responseText: string): Promise<OllamaStub> {
  const prompts: string[] = []
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(
        JSON.stringify({
          models: [
            { name: 'stub:latest', model: 'stub:latest', modified_at: '2026-01-01T00:00:00Z', size: 1, digest: 'stub' }
          ]
        })
      )
      return
    }
    if (req.method === 'POST' && req.url === '/api/generate') {
      let body = ''
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString('utf-8')
      })
      req.on('end', () => {
        try {
          prompts.push(String((JSON.parse(body) as { prompt?: string }).prompt ?? ''))
        } catch {
          prompts.push('')
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            model: 'stub:latest',
            created_at: '2026-01-01T00:00:00Z',
            response: responseText,
            done: true,
            done_reason: 'stop',
            context: [],
            total_duration: 1,
            load_duration: 1,
            prompt_eval_count: 1,
            prompt_eval_duration: 1,
            eval_count: 1,
            eval_duration: 1
          })
        )
      })
      return
    }
    res.writeHead(404, { 'Content-Type': 'application/json' })
    res.end('{}')
  })
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  const port = typeof address === 'object' && address ? address.port : 0
  return {
    host: `http://127.0.0.1:${port}`,
    prompts,
    close: () => new Promise((resolve) => server.close(() => resolve()))
  }
}

test('AI 候选：未收录词由 AI 给候选，点选后才写入字段名（桩服务）', async () => {
  const stub = await startOllamaStub('{"candidates": ["combat_energy", "fight_energy", "energy"]}')
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-field-id-ai-e2e-'))
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: stub.host })

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    // 新 IA 无侧栏入口：工具菜单 → 字段结构编辑器
    await window.getByTestId('menu-title-tools').click()
    await window.getByTestId('menuitem-tools-fieldEditor').click()
    await window.getByTestId('te-type-tab').filter({ hasText: '职业' }).click()

    // 「斗能」不在术语表内 → 规则层如实报未收录、不给候选
    await window.getByTestId('te-add-field').click()
    const lastLabel = window.locator('[data-testid^="te-field-label-"]').last()
    const lastName = window.locator('[data-testid^="te-field-name-"]').last()
    const lastGenerate = window.locator('[data-testid^="te-field-generate-"]').last()
    await lastLabel.fill('斗能')
    await lastGenerate.click()
    await expect(window.locator('[data-testid^="te-id-suggest-error-"]').last()).toContainText('未收录')
    await expect(window.locator('[data-testid^="te-id-suggest-apply-"]')).toHaveCount(0)

    // 点「AI 候选」→ 出现 3 个候选，且来源标记为 ai
    const lastAi = window.locator('[data-testid^="te-id-suggest-ai-"]').last()
    await lastAi.click()
    const applies = window.locator('[data-testid^="te-id-suggest-apply-"]')
    await expect(applies).toHaveCount(3)
    await expect(applies.first()).toHaveText('combat_energy')
    await expect(applies.first()).toHaveAttribute('data-source', 'ai')

    // AI 只提案：未点选前字段名不变
    await expect(lastName).toHaveValue(/^field_\d+$/)

    // 点选后写入
    await applies.first().click()
    await expect(lastName).toHaveValue('combat_energy')

    // 提示词确实带上了显示名、已有字段名与命名规范
    expect(stub.prompts).toHaveLength(1)
    const sent = stub.prompts[0] ?? ''
    expect(sent).toContain('显示名：斗能')
    expect(sent).toContain('已有字段名（不得重复）')
    expect(sent).toContain('语义优先')
    expect(sent).toContain('不要用拼音')
  } finally {
    await app.close()
    await stub.close()
  }
})

test('AI 候选：本地 Ollama 不可用时给中文错误提示，不静默失败', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-field-id-ai-offline-e2e-'))
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: 'http://127.0.0.1:1' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    // 新 IA 无侧栏入口：工具菜单 → 字段结构编辑器
    await window.getByTestId('menu-title-tools').click()
    await window.getByTestId('menuitem-tools-fieldEditor').click()
    await window.getByTestId('te-type-tab').filter({ hasText: '职业' }).click()

    await window.getByTestId('te-add-field').click()
    await window.locator('[data-testid^="te-field-label-"]').last().fill('斗能')
    await window.locator('[data-testid^="te-field-generate-"]').last().click()
    await window.locator('[data-testid^="te-id-suggest-ai-"]').last().click()

    // 错误提示必须出现且是中文（llmClient 自身的文案）
    const aiError = window.locator('[data-testid^="te-id-suggest-ai-error-"]').last()
    await expect(aiError).toBeVisible()
    await expect(aiError).toContainText('Ollama')
    // 未写入任何内容
    await expect(window.locator('[data-testid^="te-field-name-"]').last()).toHaveValue(/^field_\d+$/)
  } finally {
    await app.close()
  }
})
