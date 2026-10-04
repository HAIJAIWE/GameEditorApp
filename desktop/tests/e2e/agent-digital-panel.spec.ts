import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { _electron as electron, expect, test } from '@playwright/test'

/**
 * A1-4 数字员工面板端到端验收：
 * Ollama `/api/chat` 桩服务驱动一轮「思考 → 工具 → 结果」，断言
 * 对话气泡、流式文本、折叠步骤、任务列表与状态文案。
 *
 * 注：**危险操作审批的端到端拦截**需要 SYSTEM 级技能（本批次只注册了 DATA_WRITE 级的
 * `system.game_data` / `system.ceshu`），故审批链路由单测三层覆盖
 * （`agentBrain` 循环门 / `agentPanel` 归约 / `agentApprovalBroker` 中转），
 * 端到端用例待 A1-5 接入 SYSTEM 级技能后补。
 */

interface OllamaChatStub {
  host: string
  close: () => Promise<void>
}

/** 第 1 次请求返回 tool_call，第 2 次返回流式终稿 */
async function startOllamaChatStub(): Promise<OllamaChatStub> {
  let call = 0
  const lines = (rows: unknown[]): string => rows.map((row) => `${JSON.stringify(row)}\n`).join('')
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url === '/api/tags') {
      res.writeHead(200, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ models: [{ name: 'stub:latest', model: 'stub:latest', size: 1, digest: 'stub' }] }))
      return
    }
    if (req.method === 'POST' && req.url === '/api/chat') {
      req.on('data', () => undefined)
      req.on('end', () => {
        call += 1
        res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
        if (call === 1) {
          res.end(
            lines([
              {
                message: {
                  role: 'assistant',
                  content: '',
                  tool_calls: [{ function: { name: 'system.game_data', arguments: { action: 'list_types' } } }]
                },
                done: false
              },
              { message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }
            ])
          )
          return
        }
        res.end(
          lines([
            { message: { role: 'assistant', content: '共' }, done: false },
            { message: { role: 'assistant', content: ' 13 种数据类型' }, done: false },
            { message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }
          ])
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
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

test('数字员工面板：桩服务驱动一轮「思考 → 工具 → 结果」并渲染步骤与任务', async () => {
  const stub = await startOllamaChatStub()
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-agent-panel-e2e-'))
  const app = await electron.launch({
    args: ['.'],
    cwd: join(__dirname, '..', '..'),
    env: {
      ...process.env,
      MB_USER_DATA_DIR: userDataDir,
      MB_OLLAMA_HOST: stub.host,
      MB_OLLAMA_MODEL: 'stub:latest'
    }
  })

  try {
    const window = await app.firstWindow()
    await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()

    await window.getByTestId('mode-digital').click()
    await expect(window.getByTestId('digital-panel')).toBeVisible()
    await expect(window.getByTestId('digital-status')).toHaveText('待命')

    // 发送一轮请求
    await window.getByTestId('digital-input').fill('看看有哪些数据类型')
    await window.getByTestId('digital-send').click()

    // 用户气泡立即出现，状态进入思考
    await expect(window.getByTestId('digital-message').filter({ hasText: '看看有哪些数据类型' })).toHaveCount(1)
    await expect(window.getByTestId('digital-status')).toHaveText('思考中…')

    // 流式文本出现（第二轮分片）
    await expect(window.getByTestId('digital-streaming')).toContainText('共', { timeout: 15_000 })

    // 终稿落到助手气泡，流式区清空，状态完成
    await expect(
      window.getByTestId('digital-message').filter({ hasText: '共 13 种数据类型' })
    ).toHaveCount(1, { timeout: 15_000 })
    await expect(window.getByTestId('digital-streaming')).toHaveCount(0)
    await expect(window.getByTestId('digital-status')).toHaveText('已完成')

    // 执行步骤：思考轮 + 工具批 + 工具执行
    await expect(window.getByTestId('digital-step')).toHaveCount(3)
    await expect(window.getByTestId('digital-step').first()).toContainText('llm_think')
    await expect(window.getByTestId('digital-step').nth(1)).toContainText('并行1工具')
    const toolStep = window.getByTestId('digital-step').nth(2)
    await expect(toolStep).toContainText('system.game_data')
    await expect(toolStep).toContainText('可用数据类型（')

    // 折叠步骤
    await window.getByTestId('digital-steps-toggle').click()
    await expect(window.getByTestId('digital-step')).toHaveCount(0)
    await window.getByTestId('digital-steps-toggle').click()
    await expect(window.getByTestId('digital-step')).toHaveCount(3)

    // 任务列表由工具步骤派生
    await expect(window.getByTestId('digital-task')).toHaveCount(1)
    await expect(window.getByTestId('digital-task').first()).toContainText('system.game_data')
  } finally {
    await app.close()
    await stub.close()
  }
})

test('数字员工面板：上一轮会话落盘后，重新启动可看到「恢复上次会话」提示并回填历史', async () => {
  const stub = await startOllamaChatStub()
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-agent-panel-session-e2e-'))
  const launch = (): ReturnType<typeof electron.launch> =>
    electron.launch({
      args: ['.'],
      cwd: join(__dirname, '..', '..'),
      env: {
        ...process.env,
        MB_USER_DATA_DIR: userDataDir,
        MB_OLLAMA_HOST: stub.host,
        MB_OLLAMA_MODEL: 'stub:latest'
      }
    })

  try {
    // 第一次启动：跑一轮对话让会话落盘
    const first = await launch()
    try {
      const firstWindow = await first.firstWindow()
      await expect(firstWindow.getByRole('heading', { name: '数据表预览' })).toBeVisible()
      await firstWindow.getByTestId('mode-digital').click()
      await firstWindow.getByTestId('digital-input').fill('看看有哪些数据类型')
      await firstWindow.getByTestId('digital-send').click()
      await expect(
        firstWindow.getByTestId('digital-message').filter({ hasText: '共 13 种数据类型' })
      ).toHaveCount(1, { timeout: 15_000 })
    } finally {
      await first.close()
    }

    // 第二次启动（同一 userDataDir）：应提示可恢复上次会话
    const second = await launch()
    try {
      const window = await second.firstWindow()
      await expect(window.getByRole('heading', { name: '数据表预览' })).toBeVisible()
      await window.getByTestId('mode-digital').click()
      await expect(window.getByTestId('digital-session-prompt')).toBeVisible()
      await expect(window.getByTestId('digital-session-prompt')).toContainText('检测到上次会话')

      await window.getByTestId('digital-session-restore').click()
      await expect(window.getByTestId('digital-session-prompt')).toHaveCount(0)
      await expect(window.getByTestId('digital-message').filter({ hasText: '看看有哪些数据类型' })).toHaveCount(1)
    } finally {
      await second.close()
    }
  } finally {
    await stub.close()
  }
})
