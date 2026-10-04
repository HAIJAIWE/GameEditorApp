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
 * 危险操作确认的端到端拦截由 `system.code`（SYSTEM 级，A1-5 接入）承载：
 * 拒绝路径断言沙箱**没有被执行**，批准路径断言代码真的跑了。
 */

interface OllamaChatStub {
  host: string
  close: () => Promise<void>
}

interface StubOptions {
  /** 第一轮要求调用的工具 */
  toolName?: string
  toolArgs?: Record<string, unknown>
  /** 第二轮流式终稿分片 */
  finalChunks?: string[]
}

/** 第 1 次请求返回 tool_call，第 2 次返回流式终稿 */
async function startOllamaChatStub(options: StubOptions = {}): Promise<OllamaChatStub> {
  const toolName = options.toolName ?? 'system.game_data'
  const toolArgs = options.toolArgs ?? { action: 'list_types' }
  const finalChunks = options.finalChunks ?? ['共', ' 13 种数据类型']
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
                  tool_calls: [{ function: { name: toolName, arguments: toolArgs } }]
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
            ...finalChunks.map((text) => ({ message: { role: 'assistant', content: text }, done: false })),
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

/** 危险操作确认（A1-4 遗留项）：SYSTEM 级技能必须经用户批准才执行 */
async function runDangerousRound(decision: 'approve' | 'reject'): Promise<{
  approvalVisible: boolean
  stepTexts: string[]
  finalText: string
}> {
  const stub = await startOllamaChatStub({
    toolName: 'system.code',
    toolArgs: { action: 'execute', code: 'return 40 + 2' },
    finalChunks: ['已按你的要求处理']
  })
  const userDataDir = mkdtempSync(join(tmpdir(), `mb-agent-approval-${decision}-`))
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

    await window.getByTestId('digital-input').fill('帮我算 40+2')
    await window.getByTestId('digital-send').click()

    // 危险操作模态：显示工具与操作
    await expect(window.getByTestId('digital-approval')).toBeVisible({ timeout: 15_000 })
    await expect(window.getByTestId('digital-approval')).toContainText('system.code')
    await expect(window.getByTestId('digital-approval')).toContainText('execute')
    await expect(window.getByTestId('digital-status')).toHaveText('等待确认')

    const buttonId = decision === 'approve' ? 'digital-approval-approve' : 'digital-approval-reject'
    await window.getByTestId(buttonId).click()

    // 模态关闭 + 终稿到达
    await expect(window.getByTestId('digital-approval')).toHaveCount(0)
    await expect(
      window.getByTestId('digital-message').filter({ hasText: '已按你的要求处理' })
    ).toHaveCount(1, { timeout: 15_000 })

    const stepTexts = await window.getByTestId('digital-step').allInnerTexts()
    const finalText = await window.getByTestId('digital-message').filter({ hasText: '已按你的要求处理' }).innerText()
    return { approvalVisible: true, stepTexts, finalText }
  } finally {
    await app.close()
    await stub.close()
  }
}

test('数字员工面板：SYSTEM 级技能触发危险确认，拒绝后不执行代码', async () => {
  const { stepTexts } = await runDangerousRound('reject')
  const joined = stepTexts.join('\n')
  expect(joined).toContain('system.code')
  expect(joined).toContain('[STOP] 用户未确认危险操作: system.code')
  // 沙箱没有被执行：不应出现任何「执行成功」
  expect(joined).not.toContain('执行成功')
})

test('数字员工面板：SYSTEM 级技能获批后在沙箱执行并回灌结果', async () => {
  const { stepTexts } = await runDangerousRound('approve')
  const joined = stepTexts.join('\n')
  expect(joined).toContain('system.code')
  expect(joined).toContain('执行成功: 42')
  expect(joined).not.toContain('[STOP]')
})

test('数字员工面板：多问题提问逐题作答后一次性提交，答复按序号回灌', async () => {
  const stub = await startOllamaChatStub({
    toolName: 'tool.ask_user',
    toolArgs: {
      action: 'ask',
      questions: [
        { question: '用哪个职业？', options: ['战士', '法师'] },
        { question: '要哪些流派？', options: ['普攻流', 'CD 技能流'], multiSelect: true }
      ]
    },
    finalChunks: ['收到']
  })
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-agent-multi-ask-'))
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
    await window.getByTestId('digital-input').fill('帮我设计一个角色')
    await window.getByTestId('digital-send').click()

    // 多问题表单：两题 + 未答完时不可提交
    await expect(window.getByTestId('digital-multi-form')).toBeVisible({ timeout: 15_000 })
    await expect(window.getByTestId('digital-multi-question')).toHaveCount(2)
    await expect(window.getByTestId('digital-multi-submit')).toBeDisabled()

    // 第 1 题单选「法师」
    await window.getByTestId('digital-multi-question').nth(0).getByText('法师').click()
    await expect(window.getByTestId('digital-multi-submit')).toBeDisabled()

    // 第 2 题多选两项
    const second = window.getByTestId('digital-multi-question').nth(1)
    await second.getByText('普攻流').click()
    await second.getByText('CD 技能流').click()
    await expect(window.getByTestId('digital-multi-submit')).toBeEnabled()

    await window.getByTestId('digital-multi-submit').click()
    await expect(window.getByTestId('digital-multi-form')).toHaveCount(0)
    await expect(
      window.getByTestId('digital-step').filter({ hasText: '用哪个职业？ → 法师' })
    ).toHaveCount(1, { timeout: 15_000 })
    await expect(
      window.getByTestId('digital-step').filter({ hasText: '要哪些流派？ → 普攻流、CD 技能流' })
    ).toHaveCount(1)
  } finally {
    await app.close()
    await stub.close()
  }
})

test('数字员工面板：删除条目走「操作确认」交互，确认后真正删除', async () => {
  const stub = await startOllamaChatStub({
    toolName: 'system.game_data',
    toolArgs: { action: 'delete', data_type: 'role', name: '待删法师' },
    finalChunks: ['已删除']
  })
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-agent-delete-confirm-'))
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
    // 先造一条待删数据
    await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: { data: { createItem: (req: unknown) => Promise<unknown> } } })
        .mbApi
      await api.data.createItem({ type: 'role', data: { name: '待删法师' } })
    })

    await window.getByTestId('mode-digital').click()
    await window.getByTestId('digital-input').fill('删掉待删法师')
    await window.getByTestId('digital-send').click()

    // 删除确认模态（confirm 类交互）
    await expect(window.getByTestId('digital-interaction')).toBeVisible({ timeout: 15_000 })
    await expect(window.getByTestId('digital-interaction-prompt')).toContainText('确认删除')
    await expect(window.getByTestId('digital-interaction-prompt')).toContainText('待删法师')

    await window.getByTestId('digital-interaction-approve').click()
    await expect(window.getByTestId('digital-interaction')).toHaveCount(0)
    await expect(window.getByTestId('digital-step').filter({ hasText: '已删除' })).toHaveCount(1, {
      timeout: 15_000
    })

    // 数据确实被删掉
    const remaining = (await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: { data: { listItems: (req: unknown) => Promise<unknown[]> } } })
        .mbApi
      return api.data.listItems({ type: 'role' })
    })) as unknown[]
    expect(remaining).toHaveLength(0)
  } finally {
    await app.close()
    await stub.close()
  }
})

test('数字员工面板：ask_user 提问走「需要你澄清」交互，答复回灌为工具结果', async () => {
  const stub = await startOllamaChatStub({
    toolName: 'tool.ask_user',
    toolArgs: { action: 'ask', question: '用哪个职业？', options: ['战士', '法师'] },
    finalChunks: ['收到']
  })
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-agent-ask-user-'))
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
    await window.getByTestId('digital-input').fill('帮我建个角色')
    await window.getByTestId('digital-send').click()

    await expect(window.getByTestId('digital-interaction')).toBeVisible({ timeout: 15_000 })
    await expect(window.getByTestId('digital-interaction-prompt')).toHaveText('用哪个职业？')
    await expect(window.getByTestId('digital-interaction-option')).toHaveCount(2)

    // 点候选选项（法师）→ 答复回灌
    await window.getByTestId('digital-interaction-option').filter({ hasText: '法师' }).click()
    await expect(window.getByTestId('digital-interaction')).toHaveCount(0)
    await expect(window.getByTestId('digital-step').filter({ hasText: '用户回答：法师' })).toHaveCount(1, {
      timeout: 15_000
    })
  } finally {
    await app.close()
    await stub.close()
  }
})
