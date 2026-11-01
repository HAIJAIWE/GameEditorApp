import { describe, expect, it } from 'vitest'

import {
  AGENT_RULES,
  DEFAULT_IDENTITY,
  PROMPT_CORE_MAX_LINES,
  buildSystemPrompts,
  checkPromptBudget,
  countPromptLines
} from '@mobai/shared/agent/ui'
import {
  TOOL_CATALOG_SUMMARY_MAX_CHARS,
  getToolCatalogLine,
  type SkillProtocol
} from '@mobai/shared/agent/config'
import { SkillDispatcher } from '@mobai/agent-core/execution/dispatcher'

function makeSkill(id: string, description = '示例技能'): SkillProtocol {
  return {
    id,
    description,
    version: '1.0.0',
    parametersSchema: {
      type: 'object',
      properties: { action: { type: 'string', description: '操作类型' } },
      required: ['action']
    },
    execute: () => ({ success: true, message: 'ok' })
  }
}

describe('prompts：M2 提示词预算门（DD-6）', () => {
  it('PROMPT_CORE_MAX_LINES 为 30（两档同源闸：本地=硬闸 / 云端=目标）', () => {
    expect(PROMPT_CORE_MAX_LINES).toBe(30)
  })

  it('countPromptLines：忽略空行（含纯空白行）', () => {
    expect(countPromptLines(['a\n\nb', '', 'c'])).toBe(3)
    expect(countPromptLines(['  \n ', ''])).toBe(0)
  })

  it('checkPromptBudget：不抛异常，返回 ok/lines/maxLines；可自定义上限', () => {
    expect(checkPromptBudget(['a', 'b'])).toEqual({ ok: true, lines: 2, maxLines: 30 })
    const over = checkPromptBudget(Array.from({ length: 31 }, (_, i) => `l${i}`))
    expect(over).toEqual({ ok: false, lines: 31, maxLines: 30 })
    expect(checkPromptBudget(['a', 'b', 'c'], 2).ok).toBe(false)
  })

  it('核心提示词（身份 + 规则，不含工具/记忆）≤ 30 行', () => {
    const core = [DEFAULT_IDENTITY, `## 规则\n${AGENT_RULES}`]
    const result = checkPromptBudget(core)
    expect(result.ok).toBe(true)
    expect(result.lines).toBeLessThanOrEqual(PROMPT_CORE_MAX_LINES)
  })

  it('buildSystemPrompts：身份缺省内置；能力目录进 `## 可用工具`；extraBlocks 顺序拼接', () => {
    const prompts = buildSystemPrompts({
      capabilityCatalog: '- system.a: 甲',
      extraBlocks: ['## 相关记忆\n- 记忆一']
    })
    expect(prompts[0]).toBe(DEFAULT_IDENTITY)
    expect(prompts[1]).toContain('## 规则')
    expect(prompts[1]).toContain('## 可用工具\n- system.a: 甲')
    expect(prompts[1]).toContain('## 相关记忆\n- 记忆一')
  })

  it('buildSystemPrompts：目录为空时不注入 `## 可用工具` 段', () => {
    const prompts = buildSystemPrompts({ capabilityCatalog: '   ' })
    expect(prompts[1]).not.toContain('## 可用工具')
  })

  it('buildSystemPrompts：自定义身份覆盖内置', () => {
    const prompts = buildSystemPrompts({ capabilityCatalog: '', identity: '自定义身份' })
    expect(prompts[0]).toBe('自定义身份')
  })
})

describe('prompts：M2 工具目录渐进披露（G7）', () => {
  it('getToolCatalogLine：`- id: 摘要`，折叠空白成单行，超长截断到上限', () => {
    expect(getToolCatalogLine(makeSkill('system.a', '甲'))).toBe('- system.a: 甲')
    expect(getToolCatalogLine(makeSkill('system.b', '多\n行   描述'))).toBe('- system.b: 多 行 描述')
    const long = getToolCatalogLine(makeSkill('system.c', 'x'.repeat(200)))
    expect(long.startsWith('- system.c: ')).toBe(true)
    expect(long.endsWith('…')).toBe(true)
    // 总长 = 前缀 + 摘要上限（末尾省略号占 1 个字符）
    expect(long.length).toBe('- system.c: '.length + TOOL_CATALOG_SUMMARY_MAX_CHARS)
  })

  it('toolCatalog()：每工具恰一行且不含参数明细（与全量 toolsDescription 区分）', () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(makeSkill('system.a', '甲'))
    dispatcher.register(makeSkill('system.b', '乙'))
    const catalog = dispatcher.toolCatalog()
    expect(catalog.split('\n')).toEqual(['- system.a: 甲', '- system.b: 乙'])
    // 全量版仍保留参数行（`agent:listTools` 的 UI 编辑器在用）
    expect(dispatcher.toolsDescription()).toContain('*action: 操作类型')
    // 目录里绝不能出现参数行（前导缩进 + 参数名）
    expect(catalog).not.toMatch(/\n\s+\*?action:/)
  })
})

describe('prompts：M2 八类典型请求的能力覆盖', () => {
  // 8 类典型请求 → 期望命中的工具 id（对齐生产已注册的 5 个工具）
  const SCENARIOS: Array<{ request: string; tool: string }> = [
    { request: '列出所有角色数据', tool: 'system.game_data' },
    { request: '新建一个怪物条目', tool: 'system.game_data' },
    { request: '查一下已有哪些数据类型', tool: 'system.game_data' },
    { request: '生成一份策划书', tool: 'system.ceshu' },
    { request: '把策划书导出为 Word', tool: 'system.ceshu' },
    { request: '这两个选项我该选哪个？', tool: 'tool.ask_user' },
    { request: '算一下这些数值的总和', tool: 'system.code' },
    { request: '撤销刚才 AI 的改动', tool: 'tool.rollback_ai_changes' }
  ]

  it('每个场景的期望工具都在目录里有一行（防过度瘦身丢工具），且整段提示词在预算内', () => {
    const dispatcher = new SkillDispatcher()
    for (const tool of [
      'system.game_data',
      'system.ceshu',
      'tool.ask_user',
      'system.code',
      'tool.rollback_ai_changes'
    ]) {
      dispatcher.register(makeSkill(tool, `${tool} 的说明`))
    }
    const catalog = dispatcher.toolCatalog()
    for (const { request, tool } of SCENARIOS) {
      expect(catalog, `场景「${request}」应命中 ${tool}`).toContain(`- ${tool}: `)
    }
    // 身份 + 规则 + 目录 + 一段记忆，整段仍 ≤ 预算
    const prompts = buildSystemPrompts({
      capabilityCatalog: catalog,
      extraBlocks: ['## 相关记忆\n- 记忆一']
    })
    expect(checkPromptBudget(prompts).ok).toBe(true)
  })
})
