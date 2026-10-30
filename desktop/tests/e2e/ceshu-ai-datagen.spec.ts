import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'
import { confidentialLocalLlmConfig } from './helpers/llmConfig'

interface OllamaStub {
  host: string
  /** 收到的 prompt 列表（用于断言提示词组装） */
  prompts: string[]
  close: () => Promise<void>
}

/** 启动一个最小 Ollama 桩服务：/api/tags 返回一个模型，/api/generate 返回固定 JSON 文本 */
async function startOllamaStub(responseText: string, options: { delayMs?: number } = {}): Promise<OllamaStub> {
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
        let prompt: string
        try {
          prompt = String((JSON.parse(body) as { prompt?: string }).prompt ?? '')
        } catch {
          prompt = ''
        }
        prompts.push(prompt)
        /*
         * `delayMs` 用来让「生成中」这一瞬间可观测（取消用例必须赶在响应之前点停止）。
         * 客户端可能已 abort：此时 res 已 destroy，写会抛 ERR_STREAM_DESTROYED，
         * 而异常发生在 setTimeout 里不会归到用例上，会直接带崩 worker。
         */
        const respond = (): void => {
          if (res.destroyed || res.writableEnded) return
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
        }
        const delay = options.delayMs ?? 0
        if (delay > 0) setTimeout(respond, delay)
        else respond()
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

test('AI 生成数据（未配置）：面板结构完整 + 未配置时给出可执行的中文指引', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-datagen-offline-'))
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: 'http://127.0.0.1:1' })

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: { ceshu: { create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string }> } }
        }
      ).mbApi
      await api.ceshu.create({ name: '数据生成离线E2E', scope: 'full' })
    })

    // 文档经 IPC 旁路创建 → 重载首页列表后打开对应卡片
    await window.reload()
    await waitReady(window)
    await window.getByTestId('home-card').filter({ hasText: '数据生成离线E2E' }).getByTestId('home-card-open').click()
    await window.getByTestId('ceshu-ai-datagen').click()
    await expect(window.getByTestId('datagen-panel')).toBeVisible()

    // 面板结构：12 类默认全选、每类数量默认 5、未生成时展示占位状态
    await expect(window.getByTestId('datagen-type')).toHaveCount(12)
    for (const index of [0, 5, 11]) {
      await expect(window.getByTestId('datagen-type').nth(index)).toBeChecked()
    }
    await expect(window.getByTestId('datagen-count')).toHaveValue('5')
    await expect(window.getByTestId('datagen-status')).toHaveText('尚未生成。选择类型后点击「生成候选」开始。')
    await expect(window.getByTestId('datagen-types')).toContainText('角色')

    // 未配置路径：M0（DD-0）后未配置**不再回落到探本地 Ollama**，
    // 而是在发请求前抛「尚未配置 AI 服务」并给出可执行指引。
    // ⚠️ 前提是本用例用 `mkdtempSync` 新建的空 userDataDir（localStorage 为空）
    // ⇒ `llmBootstrap` 的 `hasStoredLlmConfig()` 守卫跳过推送 ⇒ 主进程镜像保持 null。
    // 渲染层**是**会启动推送的，别再写成「渲染层不推」（那是守卫落地前的旧状态）。
    await window.getByTestId('datagen-generate').click()
    await expect(window.getByTestId('datagen-error')).toContainText('尚未配置 AI 服务')
    await expect(window.getByTestId('datagen-error')).toContainText('设置 → AI 模型服务')
    await expect(window.getByTestId('datagen-import')).toHaveCount(0)

    // 一种类型都没勾选 → 前端直接拦截（不发起请求）
    for (let index = 0; index < 12; index += 1) {
      await window.getByTestId('datagen-type').nth(index).uncheck()
    }
    await window.getByTestId('datagen-generate').click()
    await expect(window.getByTestId('datagen-error')).toContainText('请至少选择一种数据类型')
  } finally {
    await app.close()
  }
})

test('AI 生成数据（桩服务）：提示词组装 → 候选预览 → 勾选 → 导入数据表', async () => {
  const stub = await startOllamaStub(
    JSON.stringify({
      roles: [
        { id: 'ai-1', name: '云海剑客', job: '战士', level: 1 },
        { name: '青丘弓手', job: '弓箭手', level: 1 }
      ],
      skills: [{ name: '御剑术', cooldown: 8, desc: '剑气纵横' }],
      monsters: [{ name: '迷雾妖兽' }]
    })
  )
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-datagen-e2e-'))
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: stub.host })

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: { ceshu: { create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string }> } }
        }
      ).mbApi
      await api.ceshu.create({ name: '数据生成E2E', scope: 'full' })
    })

    // 文档经 IPC 旁路创建 → 重载首页列表后打开对应卡片
    await window.reload()
    await waitReady(window)
    await window.getByTestId('home-card').filter({ hasText: '数据生成E2E' }).getByTestId('home-card-open').click()
    await window.getByTestId('ceshu-ai-datagen').click()

    /*
     * ⚠️ M0（DD-0）后必须**显式推一份配置**，桩服务才会被调用。
     *
     * 旧版这里能跑通，靠的是 `client.ts` 里那条「未配置 ⇒ 假定 `{enabled:true}` + 探
     * 本地 Ollama」的静默回落 —— 也就是「用户从没配过 AI，服务却已经跑起来了」。
     * M0 把那条路径删了（未配置 ⇒ 发请求前失败），所以桩服务用例必须先配置。
     *
     * 放在 `reload()` **之后**：`llmConfigMirror` 是主进程内存态（渲染层 reload 不清），
     * 但把它排在最后一次导航之后，读者不必去查「reload 会不会把镜像清掉」。
     *
     * `confidential: true` 走 DD-0b 保密模式（强制本地、无视 baseUrl），
     * 与「处理未发布设计稿要保密」的产品底线一致，也让本用例天然不碰任何云端地址。
     * 配置字段以 `helpers/llmConfig.ts` 的夹具为底 —— 全部字段由 `DEFAULT_LLM_CONFIG`
     * 自动补齐，不再手抄（手抄版曾因新增采样参数而静默失效）。
     */
    await window.evaluate(async (config) => {
      const api = (globalThis as unknown as { mbApi: { llm: { configure: (req: unknown) => Promise<unknown> } } })
        .mbApi
      await api.llm.configure({ config })
    }, confidentialLocalLlmConfig())

    /*
     * 只勾选「角色 / 技能」（其余取消），每类 2 条 + 补充要求。
     *
     * ⚠️ 必须先等勾选框出现：类型列表是 `schema.list()` 异步拉的，拉回那一刻 effect 会把
     * **全部类型**设为默认勾选（见 `AiDataGenPanel` 的 `setCheckedTypeIds(loaded.map(...))`）。
     * 抢在它之前跑「取消全选」会作用在空列表上 ⇒ 怪物仍然勾着，候选里就多出 monsters。
     */
    await expect(window.getByTestId('datagen-type').first()).toBeVisible()
    const typeCount = await window.getByTestId('datagen-type').count()
    for (let index = 0; index < typeCount; index += 1) {
      await window.getByTestId('datagen-type').nth(index).uncheck()
    }
    const typeCheckbox = (label: string) =>
      window.getByTestId('datagen-types').locator('label').filter({ hasText: label }).locator('input')
    await typeCheckbox('角色').check()
    await typeCheckbox('技能').check()
    // 勾选态收敛成「只剩两个」才允许生成 —— 这条断言就是上面那个竞态的守卫
    await expect(window.getByTestId('datagen-types').locator('input:checked')).toHaveCount(2)
    await window.getByTestId('datagen-count').fill('2')
    await window.getByTestId('datagen-instruction').fill('E2E 补充要求')
    await window.getByTestId('datagen-generate').click()

    // 候选：roles 2 条 + skills 1 条（monsters 未勾选 → 不进入结果）
    await expect(window.getByTestId('datagen-notice')).toContainText('已生成 3 条候选数据（roles:2、skills:1）')
    await expect(window.getByTestId('datagen-tab')).toHaveCount(2)
    await expect(window.getByTestId('datagen-tab').nth(0)).toContainText('roles（2）')
    await expect(window.getByTestId('datagen-tab').nth(1)).toContainText('skills（1）')
    await expect(window.getByTestId('datagen-item')).toHaveCount(2)
    // 摘要文案在勾选项的 label 上（input 自身无文本）
    await expect(window.getByTestId('datagen-list').locator('label').nth(0)).toContainText('云海剑客')
    await expect(window.getByTestId('datagen-list').locator('label').nth(1)).toContainText('青丘弓手')
    await expect(window.getByTestId('datagen-checked-count')).toHaveText('已勾选 3 条')

    // 提示词组装核对（桩服务收到的 prompt）
    expect(stub.prompts).toHaveLength(1)
    const prompt = stub.prompts[0] ?? ''
    expect(prompt).toContain('游戏名：数据生成E2E')
    expect(prompt).toContain('1. 每个类型生成 2 条数据。')
    expect(prompt).toContain('5. 补充要求：E2E 补充要求')
    expect(prompt).toContain('- 角色（键: roles）：建议字段 ')
    expect(prompt).toContain('- 技能（键: skills）：建议字段 ')
    expect(prompt).not.toContain('- 怪物（键: monsters）')

    // 取消全选 → 导入按钮禁用；再全选恢复
    await window.getByTestId('datagen-select-all').click()
    await expect(window.getByTestId('datagen-checked-count')).toHaveText('已勾选 0 条')
    await expect(window.getByTestId('datagen-import')).toBeDisabled()
    await window.getByTestId('datagen-select-all').click()
    await expect(window.getByTestId('datagen-checked-count')).toHaveText('已勾选 3 条')

    // 取消勾选第 2 条角色 → 导入 2 条（roles1 + skills1）
    await window.getByTestId('datagen-item').nth(1).uncheck()
    await expect(window.getByTestId('datagen-checked-count')).toHaveText('已勾选 2 条')
    await window.getByTestId('datagen-import').click()
    await expect(window.getByTestId('datagen-notice')).toContainText('已导入 2 条数据。')

    // 数据表核对：条目落库、id 由数据层生成（无 AI 传入的 ai-1）、单数键写入
    const stored = (await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: {
            data: {
              listItems: (req: { type: string }) => Promise<Array<{ id: string; type: string; data: Record<string, unknown> }>>
            }
          }
        }
      ).mbApi
      return {
        roles: await api.data.listItems({ type: 'role' }),
        skills: await api.data.listItems({ type: 'skill' }),
        monsters: await api.data.listItems({ type: 'monster' })
      }
    })) as {
      roles: Array<{ id: string; data: Record<string, unknown> }>
      skills: Array<{ id: string; data: Record<string, unknown> }>
      monsters: Array<{ id: string; data: Record<string, unknown> }>
    }
    expect(stored.roles).toHaveLength(1)
    // `data.id` 是**业务短 id**（`DataService.createItem` 在缺 id 时按类型分配下一个序号，
    // 见 `needsShortId` / `nextItemId`）—— 这是刻意的「任何来源入库都外显短 id」策略，
    // 与 `record.id`（uuid 主键）是两回事。旧断言没把 `id` 算进去，属该策略上线前的遗留。
    expect(stored.roles[0]?.data).toEqual({ name: '云海剑客', job: '战士', level: 1, id: '0' })
    // LLM 给的 id 必须被丢弃并重新分配（不是直接沿用 'ai-1'）
    expect(stored.roles[0]?.id).not.toBe('ai-1')
    expect(stored.roles[0]?.data.id).toBe('0')
    expect(stored.skills).toHaveLength(1)
    expect(stored.skills[0]?.data).toEqual({ name: '御剑术', cooldown: 8, desc: '剑气纵横', id: '0' })
    expect(stored.monsters).toHaveLength(0)

    await window.getByTestId('datagen-close').click()
    await expect(window.getByTestId('datagen-panel')).toHaveCount(0)
  } finally {
    await app.close()
    await stub.close()
  }
})
/*
 * 取消：单发 AI 生成改前**没有停止入口**（只有 180s 超时兜底），用户只能干等或重启。
 * 这条验证整条链路：面板按钮 → `task:cancel` → 通用取消表 → abort 在途 fetch，
 * 且「用户主动停止」不算故障（给提示、不报红）。
 */
test('AI 生成数据（桩服务）：生成中点「停止」→ 中断在途请求，给「已停止」提示而不是报错', async () => {
  // 响应压后 5s：保证点停止时请求确实在途
  const stub = await startOllamaStub('{"roles":[{"name":"不该出现"}]}', { delayMs: 5000 })
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-ceshu-datagen-cancel-'))
  const app = await launchApp(userDataDir, { MB_OLLAMA_HOST: stub.host })

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    await window.evaluate(async () => {
      const api = (
        globalThis as unknown as {
          mbApi: { ceshu: { create: (req: { name: string; scope: string }) => Promise<{ ceshu_id: string }> } }
        }
      ).mbApi
      await api.ceshu.create({ name: '取消生成E2E', scope: 'full' })
    })
    await window.reload()
    await waitReady(window)
    await window.getByTestId('home-card').filter({ hasText: '取消生成E2E' }).getByTestId('home-card-open').click()
    await window.getByTestId('ceshu-ai-datagen').click()
    await window.evaluate(async (config) => {
      const api = (globalThis as unknown as { mbApi: { llm: { configure: (req: unknown) => Promise<unknown> } } })
        .mbApi
      await api.llm.configure({ config })
    }, confidentialLocalLlmConfig())

    await window.getByTestId('datagen-count').fill('2')
    await window.getByTestId('datagen-generate').click()

    // 停止按钮只在生成中出现；它出现即说明请求已发出
    await expect(window.getByTestId('datagen-stop')).toBeVisible({ timeout: 15_000 })
    await window.getByTestId('datagen-stop').click()

    // 4s << 桩的 5s：只有真 abort 才可能在这个时限内看到提示
    await expect(window.getByTestId('datagen-notice')).toContainText('已停止本次生成', { timeout: 4000 })
    await expect(window.getByTestId('datagen-stop')).toHaveCount(0)
    // 取消不是故障：不该出现错误条
    await expect(window.getByTestId('datagen-error')).toHaveCount(0)
  } finally {
    await app.close()
    await stub.close()
  }
})
