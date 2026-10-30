import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { AgentBrainService } from '../../src/main/agent/brainService'
import type { AgentSessionStore } from '../../src/main/agent/sessionStore'
import { SkillDispatcher } from '../../src/main/agent/dispatcher'
import type {
  BrainInbox,
  BrainLlmRequest,
  BrainLlmTransport,
  BrainToolRunner,
  SubAgentProvider
} from '../../src/shared/agent/brain'
import type { SkillProtocol } from '../../src/shared/agent/protocol'
import { DEFAULT_LLM_CONFIG, type StoredLlmConfig } from '../../src/shared/config/llmConfig'

/**
 * M3 档位路由的**装配层**集成测试（brainService）。
 *
 * 验证三处接线一次到位：
 * 1. `options.config` → `resolveLlmTier` → 生效档位；
 * 2. 档位 → **工具面**（`buildToolFace`）→ 注入提示词的 `## 可用工具` 段 + 请求的 `tools`；
 * 3. 档位 → 循环（`runBrainLoop({ tier })`）→ `result.stats.tier`。
 *
 * 传输层在此注入脚本化桩（不触网），故可纯逻辑验证装配。
 */

function makeSkill(id: string, description: string): SkillProtocol {
  return { id, description, version: '1.0.0', execute: () => ({ success: true, message: 'ok' }) }
}

function makeDispatcher(): SkillDispatcher {
  const dispatcher = new SkillDispatcher()
  dispatcher.register(makeSkill('system.game_data', '查询/增删改游戏数据'))
  dispatcher.register(makeSkill('system.ceshu', '读取与编辑策划书'))
  dispatcher.register(makeSkill('system.code', '在沙箱执行代码'))
  return dispatcher
}

/** 脚本化传输层：记录每次请求，并回一个无工具调用的终稿 */
function capturingTransport(): { transport: BrainLlmTransport; requests: BrainLlmRequest[] } {
  const requests: BrainLlmRequest[] = []
  return {
    requests,
    transport: {
      complete: async (request: BrainLlmRequest) => {
        requests.push(request)
        return {
          content: '好的',
          toolCalls: [],
          finishReason: 'stop',
          model: 'stub',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
        }
      }
    }
  }
}

function cloudConfig(overrides: Partial<StoredLlmConfig> = {}): StoredLlmConfig {
  return { ...DEFAULT_LLM_CONFIG, enabled: true, provider: 'deepseek', model: 'deepseek-chat', ...overrides }
}

function systemText(request: BrainLlmRequest): string {
  return request.messages
    .filter((message) => message.role === 'system')
    .map((message) => message.content)
    .join('\n')
}

describe('AgentBrainService：M3 档位路由装配', () => {
  it('云端配置 → tier=cloud，提示词与工具面按云端口径（可软路由 / ≤15）', async () => {
    const { transport, requests } = capturingTransport()
    const service = new AgentBrainService({ dispatcher: makeDispatcher(), transport })

    const result = await service.chat('有哪些数据表', { config: cloudConfig() })

    expect(result.stats.tier).toBe('cloud')
    expect(requests[0]?.tools).toHaveLength(3)
    // ⚠️ 线格式守卫（回归锁）：下发给模型的必须是 `{type:'function', function:{…}}`，
    // 而不是 `toJsonSchema()` 的**内层**对象。之前漏了这层包装 ⇒ 云端回
    // `400 InvalidParameter: input.tools.0.type must be one of ['function']`、本地 Ollama 静默失效。
    const wire = requests[0]?.tools as Array<{ type?: string; function?: { name?: string } }>
    expect(wire[0]?.type).toBe('function')
    expect(wire.map((tool) => tool.function?.name)).toEqual([
      'system.game_data',
      'system.ceshu',
      'system.code'
    ])
    const text = systemText(requests[0] as BrainLlmRequest)
    expect(text).toContain('## 可用工具')
    expect(text).toContain('云端档工具面')
    expect(text).toContain('自动挑选')
    // 分组标题（按场景）
    expect(text).toContain('### 数据编辑')
    expect(text).toContain('### 策划书创作')
  })

  // F7（2026-10-18）：未配置档如实记为 `unconfigured`（不再伪装 local）；
  // 工具面仍按最保守的本地预算处理（`faceLimitFor`），故提示词口径保持本地。
  it('未配置 → tier=unconfigured（工具面按本地预算），提示词按本地口径（只使用清单内工具）', async () => {
    const { transport, requests } = capturingTransport()
    const service = new AgentBrainService({ dispatcher: makeDispatcher(), transport })

    const result = await service.chat('你好')

    expect(result.stats.tier).toBe('unconfigured')
    const text = systemText(requests[0] as BrainLlmRequest)
    expect(text).toContain('本地档工具面')
    expect(text).toContain('只使用这份清单')
  })

  it('显式选择工具（DD-4）→ 工具面收窄，请求只带该工具', async () => {
    const { transport, requests } = capturingTransport()
    const service = new AgentBrainService({ dispatcher: makeDispatcher(), transport })

    await service.chat('只改策划书', { config: cloudConfig(), explicitTools: ['system.ceshu'] })

    expect(requests[0]?.tools).toHaveLength(1)
    const wire = requests[0]?.tools as Array<{ type?: string; function?: { name?: string } }>
    expect(wire[0]?.type).toBe('function')
    expect(wire[0]?.function?.name).toBe('system.ceshu')
    const text = systemText(requests[0] as BrainLlmRequest)
    expect(text).toContain('system.ceshu')
    expect(text).not.toContain('system.game_data')
  })

  it('本地档（未配置）也走同一条线格式转换（本地 Ollama 与 OpenAI 同形）', async () => {
    const { transport, requests } = capturingTransport()
    const service = new AgentBrainService({ dispatcher: makeDispatcher(), transport })

    await service.chat('你好')

    const wire = requests[0]?.tools as Array<{ type?: string; function?: { name?: string } }>
    expect(wire).toHaveLength(3)
    expect(wire.every((tool) => tool.type === 'function')).toBe(true)
    expect(wire[0]?.function?.name).toBe('system.game_data')
    // 内层必须仍在 `function` 下（摊平即 Ollama 静默失效）
    expect(wire[0]).not.toHaveProperty('parameters')
  })

  it('智能体预设（agent-preset）注入角色定位 system prompt；未知 id 静默忽略', async () => {
    const { transport, requests } = capturingTransport()
    const service = new AgentBrainService({ dispatcher: makeDispatcher(), transport })

    await service.chat('帮我看看战斗系统', { preset: 'game_designer' })
    const text = systemText(requests[0] as BrainLlmRequest)
    expect(text).toContain('【智能体预设】')
    expect(text).toContain('资深游戏系统设计师')

    // 未知 preset：不注入、不报错（不污染默认通用助手行为）
    await service.chat('随便聊聊', { preset: 'no-such-agent' })
    const text2 = systemText(requests[1] as BrainLlmRequest)
    expect(text2).not.toContain('【智能体预设】')
  })

  it('本轮目标（GoalBar）注入系统提示词「【本轮目标】…」；空串/未传不注入', async () => {
    const { transport, requests } = capturingTransport()
    const service = new AgentBrainService({ dispatcher: makeDispatcher(), transport })

    await service.chat('帮我看看战斗系统', { goal: '把战斗公式收敛到 3 个可调参数' })
    const text = systemText(requests[0] as BrainLlmRequest)
    expect(text).toContain('【本轮目标】')
    expect(text).toContain('把战斗公式收敛到 3 个可调参数')

    // 空串视为未填，不注入目标段（保持提示词干净）
    await service.chat('随便聊聊', { goal: '   ' })
    const text2 = systemText(requests[1] as BrainLlmRequest)
    expect(text2).not.toContain('【本轮目标】')
  })

  it('会话附件注入系统提示词「【附件】…」（文件名/路径/大小）', async () => {
    const { transport, requests } = capturingTransport()
    const service = new AgentBrainService({ dispatcher: makeDispatcher(), transport })

    await service.chat('看看这份设计', {
      attachments: [{ name: 'design.md', path: '/lib/attachments/design.md', mime: 'text/markdown', bytes: 2048 }]
    })
    const text = systemText(requests[0] as BrainLlmRequest)
    expect(text).toContain('【附件】')
    expect(text).toContain('design.md')
    expect(text).toContain('/lib/attachments/design.md')
    expect(text).toContain('2.0 KB')
  })

  it('文本类附件内联内容；二进制附件只给路径（不读内容）', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-attach-'))
    const textPath = join(dir, 'notes.md')
    writeFileSync(textPath, '# 战斗公式\n伤害 = 攻击 - 防御')
    const binPath = join(dir, 'pic.png')
    writeFileSync(binPath, Buffer.from([0x89, 0x50, 0x4e, 0x47]))

    const { transport, requests } = capturingTransport()
    const service = new AgentBrainService({ dispatcher: makeDispatcher(), transport })

    await service.chat('看看附件', {
      attachments: [
        { name: 'notes.md', path: textPath, mime: 'text/markdown', bytes: 20 },
        { name: 'pic.png', path: binPath, mime: 'image/png', bytes: 4 }
      ]
    })
    const text = systemText(requests[0] as BrainLlmRequest)
    // 文本附件：内容内联
    expect(text).toContain('伤害 = 攻击 - 防御')
    expect(text).toContain('notes.md')
    // 二进制附件：只给路径
    expect(text).toContain('pic.png')
    // 只有文本附件会内联内容：整段只出现一次「内容：」
    expect((text.match(/内容：/g) ?? []).length).toBe(1)
  })

  it('会话落盘：附件元数据挂到本轮 user 消息（恢复时才能重放）', async () => {
    const saved: Array<Array<Record<string, unknown>>> = []
    const appended: Array<Array<Record<string, unknown>>> = []
    const sessionStore = {
      readTurns: () => [],
      save: async (messages: Array<Record<string, unknown>>) => {
        saved.push(messages)
      },
      recordRunStats: async () => undefined,
      recordEvents: async () => undefined,
      appendTurn: async (_sessionId: string, messages: Array<Record<string, unknown>>) => {
        appended.push(messages)
      }
    } as unknown as AgentSessionStore

    const { transport } = capturingTransport()
    const service = new AgentBrainService({ dispatcher: makeDispatcher(), transport, sessionStore })
    const file = { name: 'a.md', path: '/lib/attachments/a.md', mime: 'text/markdown', bytes: 10 }
    await service.chat('看看附件', { attachments: [file] })

    expect(saved[0]?.find((message) => message.role === 'user')).toMatchObject({ attachments: [file] })
    // 增量（turns.jsonl，供 resumeHistory）也带附件
    expect(appended[0]?.find((message) => message.role === 'user')).toMatchObject({ attachments: [file] })
  })
})

/* ---- 子智能体注册表（Slice 40 继续对话：send / stop） ---- */

/** 第一次回 spawn 工具调用，之后一律回终稿 */
function spawnThenFinalTransport(): { transport: BrainLlmTransport } {
  const requests: BrainLlmRequest[] = []
  return {
    transport: {
      complete: async (request: BrainLlmRequest) => {
        requests.push(request)
        if (requests.length === 1) {
          return {
            content: '',
            toolCalls: [{ id: 's1', name: 'tool.spawn_subagent', arguments: { task: '子任务' } }],
            finishReason: 'tool_calls',
            model: 'stub',
            usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
          }
        }
        return {
          content: '最终答复',
          toolCalls: [],
          finishReason: 'stop',
          model: 'stub',
          usage: { promptTokens: 1, completionTokens: 1, totalTokens: 2 }
        }
      }
    }
  }
}

describe('AgentBrainService：子智能体注册表（继续对话）', () => {
  it('chat 运行中可 send 插话 / stop 停止；完成后 send 返回 false', async () => {
    // 用 holder 对象承接闭包内赋值（`let x: T | null = null` 会被 TS 的 CFA 误判为恒 null）
    const captured: { signal: AbortSignal | null; inbox: BrainInbox | null } = { signal: null, inbox: null }
    let notifySpawned: (() => void) | null = null
    const spawned = new Promise<void>((resolve) => {
      notifySpawned = resolve
    })
    // provider 挂起直到被 abort：模拟「运行中」的子智能体
    const provider: SubAgentProvider = {
      id: 'stub',
      run: ({ signal, inbox }) =>
        new Promise((resolve) => {
          captured.signal = signal
          captured.inbox = inbox
          signal.addEventListener('abort', () => resolve({ text: '子智能体已停止', success: false }), { once: true })
        })
    }
    const runner: BrainToolRunner = {
      resolve: (name) => (name === 'tool.spawn_subagent' ? name : null),
      needsConfirmation: () => false,
      execute: async () => ({ success: true, message: 'ok' })
    }
    const { transport } = spawnThenFinalTransport()
    const service = new AgentBrainService({
      dispatcher: makeDispatcher(),
      transport,
      runner,
      subAgentProvider: provider
    })

    let spawnedId: string | null = null
    const chatPromise = service.chat('x', {
      onEvent: (event) => {
        if (event.type === 'subagent_started') {
          spawnedId = event.id
          notifySpawned?.()
        }
      }
    })
    await spawned
    expect(spawnedId).toBe('sub_1')

    // 插话：push 进子智能体收件箱
    expect(service.sendToSubagent('sub_1', '补充要求')).toBe(true)
    expect(captured.inbox?.drain()).toEqual(['补充要求'])

    // 单独停止：只 abort 子级 signal
    expect(service.stopSubagent('sub_1')).toBe(true)
    expect(captured.signal?.aborted).toBe(true)

    const result = await chatPromise
    expect(result.completed).toBe(true)
    expect(result.stopReason).toBe('final')

    // 完成后从注册表摘除：再 send/stop 返回 false（不是错误）
    expect(service.sendToSubagent('sub_1', '再来')).toBe(false)
    expect(service.stopSubagent('sub_1')).toBe(false)
  })

  it('未知 id：send/stop 返回 false（不抛）', () => {
    const { transport } = spawnThenFinalTransport()
    const service = new AgentBrainService({ dispatcher: makeDispatcher(), transport })
    expect(service.sendToSubagent('nope', 'x')).toBe(false)
    expect(service.stopSubagent('nope')).toBe(false)
  })
})
