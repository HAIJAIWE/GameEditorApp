import { describe, expect, it } from 'vitest'

import { AgentBrainService } from '../../src/main/agent/brainService'
import { SkillDispatcher } from '../../src/main/agent/dispatcher'
import type { BrainLlmRequest, BrainLlmTransport } from '../../src/shared/agent/brain'
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

  it('未配置 → tier=local，提示词按本地口径（只使用清单内工具）', async () => {
    const { transport, requests } = capturingTransport()
    const service = new AgentBrainService({ dispatcher: makeDispatcher(), transport })

    const result = await service.chat('你好')

    expect(result.stats.tier).toBe('local')
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
})
