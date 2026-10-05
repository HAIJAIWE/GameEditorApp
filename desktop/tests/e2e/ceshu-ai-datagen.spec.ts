import { mkdtempSync } from 'node:fs'
import { createServer } from 'node:http'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

interface OllamaStub {
  host: string
  /** 收到的 prompt 列表（用于断言提示词组装） */
  prompts: string[]
  close: () => Promise<void>
}

/** 启动一个最小 Ollama 桩服务：/api/tags 返回一个模型，/api/generate 返回固定 JSON 文本 */
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
        let prompt: string
        try {
          prompt = String((JSON.parse(body) as { prompt?: string }).prompt ?? '')
        } catch {
          prompt = ''
        }
        prompts.push(prompt)
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

test('AI 生成数据（离线）：面板结构完整 + 本地服务不可用时中文提示', async () => {
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

    await window.getByTestId('mode-ceshu').click()
    await window.getByTestId('ceshu-row').filter({ hasText: '数据生成离线E2E' }).click()
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

    // 离线路径：错误提示含 Ollama 与 ollama serve
    await window.getByTestId('datagen-generate').click()
    await expect(window.getByTestId('datagen-error')).toContainText('Ollama')
    await expect(window.getByTestId('datagen-error')).toContainText('ollama serve')
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

    await window.getByTestId('mode-ceshu').click()
    await window.getByTestId('ceshu-row').filter({ hasText: '数据生成E2E' }).click()
    await window.getByTestId('ceshu-ai-datagen').click()

    // 只勾选「角色 / 技能」（其余取消），每类 2 条 + 补充要求
    const typeCount = await window.getByTestId('datagen-type').count()
    for (let index = 0; index < typeCount; index += 1) {
      await window.getByTestId('datagen-type').nth(index).uncheck()
    }
    const typeCheckbox = (label: string) =>
      window.getByTestId('datagen-types').locator('label').filter({ hasText: label }).locator('input')
    await typeCheckbox('角色').check()
    await typeCheckbox('技能').check()
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
    expect(stored.roles[0]?.data).toEqual({ name: '云海剑客', job: '战士', level: 1 })
    expect(stored.roles[0]?.id).not.toBe('ai-1')
    expect(stored.skills).toHaveLength(1)
    expect(stored.skills[0]?.data).toEqual({ name: '御剑术', cooldown: 8, desc: '剑气纵横' })
    expect(stored.monsters).toHaveLength(0)

    await window.getByTestId('datagen-close').click()
    await expect(window.getByTestId('datagen-panel')).toHaveCount(0)
  } finally {
    await app.close()
    await stub.close()
  }
})