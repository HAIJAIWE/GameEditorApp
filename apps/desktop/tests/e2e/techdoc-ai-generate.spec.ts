/**
 * 技术设计文档「按节 AI 生成」端到端。
 *
 * ## 为什么要有这条
 * 这是本次新增链路的**唯一真实入口**：TDD 面板 → `techDoc:generate` IPC → 主进程
 * `generateTechDocSectionTask`（`runAiTask` 编排）→ 模型 → `sanitizeSectionBody` → 回填编辑器。
 * 单测覆盖了编排与清洗，但「按钮真的接上了、素材真的送出去了、正文真的回到编辑器」只有真起进程能证明。
 *
 * ## 桩的口径
 * 走本地 Ollama 档（`POST /api/generate`，非流式），响应体是**模型会返回的那种形态**：
 * 自带节标题 + 开场白 + 正文。这样 `sanitizeSectionBody` 的剥离逻辑也在 e2e 里被真实执行一次，
 * 而不是只靠单测的构造字符串。
 */

import { createServer } from 'node:http'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'

import { launchApp, seedLocalLlmConfig, waitReady } from './helpers/app'

/** 模型返回体：故意带「自报节标题 + 客套开场白」，验证清洗不是纸面功能 */
const MODEL_RESPONSE = [
  '## 2. 架构总览',
  '',
  '好的，以下是本节内容。',
  '',
  '### 分层与依赖方向',
  '',
  '表现层只依赖用例层，用例层只依赖领域层；反向依赖一律视为架构违规。',
  '',
  '### 时钟与随机源',
  '',
  '战斗结算统一从 `Clock.now()` 取时间，随机数统一走 `RandomSource` 接口，便于回放。'
].join('\n')

async function startOllamaStub(): Promise<{ host: string; prompts: string[]; close: () => Promise<void> }> {
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
          const parsed = JSON.parse(body) as { prompt?: string; system?: string }
          prompts.push(String(parsed.prompt ?? ''))
        } catch {
          prompts.push('')
        }
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(
          JSON.stringify({
            model: 'stub:latest',
            created_at: '2026-01-01T00:00:00Z',
            response: MODEL_RESPONSE,
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
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

test('技术设计文档：按节 AI 生成把正文回填编辑器（不自动保存）', async () => {
  const stub = await startOllamaStub()
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-techdoc-ai-e2e-'))
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: stub.host })

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    // 仅设 MB_OLLAMA_HOST 会让应用停在 unconfigured 档，必须播种 localStorage 配置并 reload
    await seedLocalLlmConfig(window, stub.host)

    await window.getByTestId('middle-tab-techDoc.mainView').click()
    await expect(window.getByTestId('techdoc')).toBeVisible()

    // 新建一篇：走 tech_doc 的 outline 动作（纯模板，不调模型）
    await window.getByTestId('techdoc-new-name').fill('技术设计')
    await window.getByTestId('techdoc-create').click()
    await expect(window.getByTestId('techdoc-title')).toContainText('技术设计')

    // 选第二节「架构总览」（默认是第一节，显式切一次即验证 select 的接线）
    await window.getByTestId('techdoc-gen-section').selectOption('architecture')
    await window.getByTestId('techdoc-gen-run').click()

    const textarea = window.getByTestId('techdoc-textarea')
    await expect(textarea).toContainText('表现层只依赖用例层')

    // 清洗后不应留下自报节标题与客套开场白
    const value = await textarea.inputValue()
    expect(value).not.toContain('好的，以下是本节内容')
    // 大纲产出的标题带序号（「## 2. 架构总览」），替换时保留原标题形态
    expect(value).toMatch(/##\s*(?:\d+[.、]\s*)?架构总览/)
    expect(value).toContain('### 分层与依赖方向')

    // 生成只标脏、不自动落盘：人要先看一眼
    await expect(window.getByTestId('techdoc-dirty')).toHaveAttribute('data-dirty', 'true')
    await expect(window.getByTestId('techdoc-notice')).toContainText('已生成')

    // 提示词真的带上了节标题、素材回落与长度下限（这是这次改动的核心诉求）
    expect(stub.prompts).toHaveLength(1)
    const sent = stub.prompts[0] ?? ''
    expect(sent).toContain('架构总览')
    expect(sent).toContain('长度下限')
    expect(sent).toContain('本节暂无 GDD 素材')
  } finally {
    await app.close()
    await stub.close()
  }
})
