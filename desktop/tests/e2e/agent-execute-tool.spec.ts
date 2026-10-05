import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { expect, test } from '@playwright/test'
import { launchApp, waitReady } from './helpers/app'

/** 技能执行结果（IPC 解包后） */
interface SkillResultShape {
  success: boolean
  message: string
  error?: string
  data?: unknown
}

interface AgentApi {
  agent: {
    listTools: () => Promise<{
      description: string
      tools: Array<{ name: string; description: string; parameters: unknown }>
    }>
    executeTool: (req: { tool: string; params: Record<string, unknown> }) => Promise<SkillResultShape>
  }
  data: {
    createItem: (req: { type: string; data: Record<string, unknown> }) => Promise<{ id: string }>
  }
}

/**
 * A1-1 技能调度器端到端验收：
 * listTools 元数据 + 只读技能执行（含中文模糊别名）+ 结构化错误（未知工具 / 参数缺失 / 未知动作）。
 * 危险操作确认门由单测覆盖（本批次未注册 SYSTEM 级技能）。
 */
test('Agent 技能调度：listTools + 只读技能执行 + 结构化错误', async () => {
  const userDataDir = mkdtempSync(join(tmpdir(), 'mb-agent-tool-e2e-'))
  const app = await launchApp(userDataDir)

  try {
    const window = await app.firstWindow()
    await waitReady(window)

    // 1) listTools：两个内置技能 + 提示词描述
    const meta = (await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: AgentApi }).mbApi
      return api.agent.listTools()
    })) as { description: string; tools: Array<{ name: string }> }
    expect(meta.tools.map((tool) => tool.name).sort()).toEqual(['system.ceshu', 'system.game_data'])
    expect(meta.description).toContain('- system.game_data:')
    expect(meta.description).toContain('- system.ceshu:')
    expect(meta.description).toContain('*action:')

    // 2) 只读技能：列数据类型
    const types = (await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: AgentApi }).mbApi
      return api.agent.executeTool({ tool: 'system.game_data', params: { action: 'list_types' } })
    })) as SkillResultShape
    expect(types.success).toBe(true)
    expect(types.message).toContain('可用数据类型（')
    expect(types.message).toContain('角色 role')

    // 3) 空库 list（经中文别名解析 → 参数别名 type→data_type）
    const emptyList = (await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: AgentApi }).mbApi
      return api.agent.executeTool({ tool: '角色', params: { action: 'list', type: 'role' } })
    })) as SkillResultShape
    expect(emptyList.success).toBe(true)
    expect(emptyList.message).toMatch(/^共 0 条.+数据$/)

    // 4) 建一条数据后 list 命中（数据表以单数类型 id 为键）
    await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: AgentApi }).mbApi
      await api.data.createItem({ type: 'role', data: { name: '法师' } })
    })
    const afterCreate = (await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: AgentApi }).mbApi
      return api.agent.executeTool({ tool: 'system.game_data', params: { action: 'list', data_type: 'role' } })
    })) as SkillResultShape
    expect(afterCreate.success).toBe(true)
    expect(afterCreate.message).toMatch(/^共 1 条.+数据$/)

    // 5) 策划书只读技能（中文别名 → system.ceshu）
    const ceshu = (await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: AgentApi }).mbApi
      return api.agent.executeTool({ tool: '策划书', params: { action: 'list' } })
    })) as SkillResultShape
    expect(ceshu.success).toBe(true)
    expect(ceshu.message).toBe('共 0 份策划书')

    // 6) 结构化错误：未知工具 / 参数缺失 / 未知动作
    const unknown = (await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: AgentApi }).mbApi
      return api.agent.executeTool({ tool: '压根不存在的工具', params: {} })
    })) as SkillResultShape
    expect(unknown).toEqual({ success: false, message: '', error: '未知工具: 压根不存在的工具' })

    const missingParam = (await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: AgentApi }).mbApi
      return api.agent.executeTool({ tool: 'system.game_data', params: { action: 'list' } })
    })) as SkillResultShape
    expect(missingParam).toEqual({ success: false, message: '', error: '缺少 data_type 参数' })

    const badAction = (await window.evaluate(async () => {
      const api = (globalThis as unknown as { mbApi: AgentApi }).mbApi
      return api.agent.executeTool({ tool: 'system.ceshu', params: { action: 'ai_generate' } })
    })) as SkillResultShape
    expect(badAction).toEqual({ success: false, message: '', error: '未知动作: ai_generate' })
  } finally {
    await app.close()
  }
})
