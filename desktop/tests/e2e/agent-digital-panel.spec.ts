import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/**
 * A1-4 智能体面板端到端验收：
 * Ollama `/api/chat` 桩服务驱动一轮「思考 → 工具 → 结果」，断言
 * 对话气泡、流式文本、折叠步骤、任务列表与状态文案。
 *
 * 危险操作确认的端到端拦截由 `system.code`（SYSTEM 级，A1-5 接入）承载：
 * 拒绝路径断言沙箱**没有被执行**，批准路径断言代码真的跑了。
 */

interface OllamaChatStub {
  host: string
  /** 已收到的 `/api/chat` 请求数：取消类用例靠它确认「请求真的在途」而非空转 */
  hits: () => number
  close: () => Promise<void>
}

interface StubOptions {
  /** 第一轮要求调用的工具 */
  toolName?: string
  toolArgs?: Record<string, unknown>
  /** 第二轮流式终稿分片 */
  finalChunks?: string[]
  /**
   * 首次响应前的人为延迟（毫秒）。**不是**为了模拟慢模型，而是为了消除断言竞态：
   * 本机桩服务零延迟时，整轮「思考 → 工具 → 终稿」可在 React 提交一帧之前跑完，
   * 面板的 `思考中…` 瞬态态永远来不及渲染 —— Playwright 只能看到已完成的终态。
   * 实测：重构前后（HEAD 30d88b6）均稳定失败于此，属用例自身的竞态，与实现无关。
   */
  delayMs?: number
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
        const isFirst = call === 1
        const paced = options.delayMs !== undefined && options.delayMs > 0
        // 客户端可能已被取消（`fetch` abort 掉 socket）：此时再写会抛 ERR_STREAM_DESTROYED，
        // 而异常发生在 setTimeout 里不会被用例捕获，会直接带崩 worker
        const dead = (): boolean => res.destroyed || res.writableEnded
        res.on('error', () => undefined)

        // 首轮：一次性回 tool_call（可延迟，给面板留出渲染 `思考中…` 的时间窗）
        const emitToolCall = (): void => {
          if (dead()) return
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
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
        }

        // 次轮：终稿。`paced` 时**逐片写出并留间隔**，否则一次性写完。
        // 为什么必须分片：`digital-streaming` 区域在终稿落地后即清空，
        // 零延迟时「流式文本可见」与「已完成」之间没有可观测窗口。
        const emitFinal = (): void => {
          if (dead()) return
          res.writeHead(200, { 'Content-Type': 'application/x-ndjson' })
          if (!paced) {
            res.end(
              lines([
                ...finalChunks.map((text) => ({ message: { role: 'assistant', content: text }, done: false })),
                { message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }
              ])
            )
            return
          }
          let index = 0
          const step = (): void => {
            if (dead()) return
            if (index < finalChunks.length) {
              res.write(lines([{ message: { role: 'assistant', content: finalChunks[index] }, done: false }]))
              index += 1
              setTimeout(step, 600)
              return
            }
            res.write(lines([{ message: { role: 'assistant', content: '' }, done: true, done_reason: 'stop' }]))
            res.end()
          }
          step()
        }

        const emit = (): void => (isFirst ? emitToolCall() : emitFinal())
        if (isFirst && paced) {
          setTimeout(emit, options.delayMs)
          return
        }
        emit()
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
    hits: () => call,
    close: () => new Promise<void>((resolve) => server.close(() => resolve()))
  }
}

test('智能体面板：桩服务驱动一轮「思考 → 工具 → 结果」并渲染步骤与任务', async () => {
  // delayMs 让 `思考中…` 瞬态态可观测（否则零延迟桩会在首帧前跑完整轮，断言必竞态）
  const stub = await startOllamaChatStub({ delayMs: 600 })
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-agent-panel-e2e-'))
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: stub.host, MB_OLLAMA_MODEL: 'stub:latest' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 新 IA 下 AI 助手（智能体）面板常驻右栏——`App.tsx` 的 `.ai-dock` 无条件渲染，
    // 侧栏与 `mode-digital` 切换入口已随 IA 重写删除，故无需再点击进入。
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

    // 执行步骤：每来一个 step_start / step_done 事件就追加一条（见 `shared/agent/panel.ts`）。
    // 本轮为「两次 LLM 调用 + 一次工具执行」⇒ think(0) → 并行1工具(0) → system.game_data → think(1) = 4 条。
    // ⚠️ 旧值写的是 3（只有一次 llm_think 的年代），属陈旧断言；此处按事件流实际形状修正，
    // 并额外断言**顺序**，避免以后再把「多一轮思考」当成单纯的数字变化糊过去。
    await expect(window.getByTestId('digital-step')).toHaveCount(4)
    await expect(window.getByTestId('digital-step').nth(0)).toContainText('llm_think')
    await expect(window.getByTestId('digital-step').nth(1)).toContainText('并行1工具')
    const toolStep = window.getByTestId('digital-step').nth(2)
    await expect(toolStep).toContainText('system.game_data')
    await expect(toolStep).toContainText('可用数据类型（')
    await expect(window.getByTestId('digital-step').nth(3)).toContainText('llm_think')

    // 折叠步骤
    await window.getByTestId('digital-steps-toggle').click()
    await expect(window.getByTestId('digital-step')).toHaveCount(0)
    await window.getByTestId('digital-steps-toggle').click()
    await expect(window.getByTestId('digital-step')).toHaveCount(4)

    // 任务列表由工具步骤派生
    await expect(window.getByTestId('digital-task')).toHaveCount(1)
    await expect(window.getByTestId('digital-task').first()).toContainText('system.game_data')
  } finally {
    await app.close()
    await stub.close()
  }
})

test('智能体面板：上一轮会话落盘后，重新启动可看到「恢复上次会话」提示并回填历史', async () => {
  const stub = await startOllamaChatStub()
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-agent-panel-session-e2e-'))
  const launch = (): ReturnType<typeof launchApp> =>
    launchApp(userDataDir, { MB_OLLAMA_HOST: stub.host, MB_OLLAMA_MODEL: 'stub:latest' })

  try {
    // 第一次启动：跑一轮对话让会话落盘
    const first = await launch()
    try {
      const firstWindow = await first.firstWindow()
      await waitReady(firstWindow)
      // AI 面板常驻右栏，无需切换入口
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
      await waitReady(window)
      // AI 面板常驻右栏，无需切换入口
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

test('智能体面板：运行中点「停止」→ 打断在途调用、给出诚实提示、不报成故障', async () => {
  /*
   * 首轮响应压后 5s：给「思考中…」留出稳定窗口，也保证点停止时请求**确实在途**
   * （改前 `wallClockMs` 只在轮次间检查，这种挂住的单次调用根本出不来）。
   */
  const stub = await startOllamaChatStub({ delayMs: 5000 })
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-agent-cancel-e2e-'))
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: stub.host, MB_OLLAMA_MODEL: 'stub:latest' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    await window.getByTestId('digital-input').fill('看看有哪些数据类型')
    await window.getByTestId('digital-send').click()
    await expect(window.getByTestId('digital-status')).toHaveText('思考中…')

    // 先确认桩已收到请求：否则「停止」会扑空成 cancelled:false，用例就成了空转
    await expect.poll(() => stub.hits(), { timeout: 10_000 }).toBeGreaterThan(0)
    await expect(window.getByTestId('digital-stop')).toBeVisible()
    await window.getByTestId('digital-stop').click()

    /*
     * 用**短于桩延迟**的超时断 terminated：这才能证明是「abort 打断了在途请求」，
     * 而不是等桩在 5s 后正常回包。若取消链路断了，这里会超时失败。
     */
    await expect(window.getByTestId('digital-terminated')).toContainText('已按要求停止', { timeout: 4000 })
    // 取消不是故障：状态落「已完成」而不是「出错」
    await expect(window.getByTestId('digital-status')).toHaveText('已完成', { timeout: 4000 })
    await expect(window.getByTestId('digital-status')).not.toHaveText('出错')
    // 运行中才有的「停止」按钮随之收起
    await expect(window.getByTestId('digital-stop')).toHaveCount(0)
  } finally {
    await app.close()
    await stub.close()
  }
})

test('智能体面板：等待危险确认时点「停止」→ 立刻中止，不必等 120s 交互超时', async () => {
  /*
   * 这条钉的是一个用户可感知的洞：取消只 abort 了 fetch，而「等用户点批准」不走 fetch。
   * 改前在「等待确认」态点停止**毫无反应** —— 得等 `DEFAULT_INTERACTION_TIMEOUT_MS`
   * （120 秒）到点后，下一轮开头的取消闸才发现。故这里的 4s 超时就是断言本体。
   */
  const stub = await startOllamaChatStub({
    toolName: 'system.code',
    toolArgs: { action: 'execute', code: 'return 40 + 2' },
    finalChunks: ['不应到达']
  })
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-agent-cancel-approval-e2e-'))
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: stub.host, MB_OLLAMA_MODEL: 'stub:latest' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    await window.getByTestId('digital-input').fill('帮我算 40+2')
    await window.getByTestId('digital-send').click()
    // 先到「等待确认」：说明循环正卡在答复 promise 上
    await expect(window.getByTestId('digital-approval')).toBeVisible({ timeout: 15_000 })
    await expect(window.getByTestId('digital-status')).toHaveText('等待确认')

    await expect(window.getByTestId('digital-stop')).toBeVisible()
    await window.getByTestId('digital-stop').click()

    await expect(window.getByTestId('digital-terminated')).toContainText('已按要求停止', { timeout: 4000 })
    await expect(window.getByTestId('digital-status')).toHaveText('已完成', { timeout: 4000 })
    // 确认框收起，且代码**没有**被执行（取消 ≠ 隐式放行）
    await expect(window.getByTestId('digital-approval')).toHaveCount(0)
    const steps = (await window.getByTestId('digital-step').allInnerTexts()).join('\n')
    expect(steps).not.toContain('执行成功')
    expect(steps).toContain('[STOP]')
  } finally {
    await app.close()
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
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: stub.host, MB_OLLAMA_MODEL: 'stub:latest' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    // AI 面板常驻右栏，无需切换入口

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

test('智能体面板：SYSTEM 级技能触发危险确认，拒绝后不执行代码', async () => {
  const { stepTexts } = await runDangerousRound('reject')
  const joined = stepTexts.join('\n')
  expect(joined).toContain('system.code')
  expect(joined).toContain('[STOP] 用户未确认危险操作: system.code')
  // 沙箱没有被执行：不应出现任何「执行成功」
  expect(joined).not.toContain('执行成功')
})

test('智能体面板：SYSTEM 级技能获批后在沙箱执行并回灌结果', async () => {
  const { stepTexts } = await runDangerousRound('approve')
  const joined = stepTexts.join('\n')
  expect(joined).toContain('system.code')
  expect(joined).toContain('执行成功: 42')
  expect(joined).not.toContain('[STOP]')
})

test('智能体面板：多问题提问逐题作答后一次性提交，答复按序号回灌', async () => {
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
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: stub.host, MB_OLLAMA_MODEL: 'stub:latest' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    // AI 面板常驻右栏，无需切换入口
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

test('智能体面板：删除条目走「操作确认」交互，确认后真正删除', async () => {
  const stub = await startOllamaChatStub({
    toolName: 'system.game_data',
    toolArgs: { action: 'delete', data_type: 'role', name: '待删法师' },
    finalChunks: ['已删除']
  })
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-agent-delete-confirm-'))
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: stub.host, MB_OLLAMA_MODEL: 'stub:latest' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    // 先造一条待删数据
    await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: { data: { createItem: (req: unknown) => Promise<unknown> } } })
        .mbApi
      await api.data.createItem({ type: 'role', data: { name: '待删法师' } })
    })

    // AI 面板常驻右栏，无需切换入口
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

test('智能体面板：ask_user 提问走「需要你澄清」交互，答复回灌为工具结果', async () => {
  const stub = await startOllamaChatStub({
    toolName: 'tool.ask_user',
    toolArgs: { action: 'ask', question: '用哪个职业？', options: ['战士', '法师'] },
    finalChunks: ['收到']
  })
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-agent-ask-user-'))
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: stub.host, MB_OLLAMA_MODEL: 'stub:latest' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)
    // AI 面板常驻右栏，无需切换入口
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
