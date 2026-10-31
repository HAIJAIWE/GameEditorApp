import { describe, expect, it } from 'vitest'

import {
  ACTION_ALIASES,
  DEFAULT_MAX_ALLOWED_RISK,
  DEFAULT_TOOL_RISK,
  RISK_LEVEL,
  TOOL_RISK_MAP,
  checkPermission,
  fixParams,
  getToolCatalogLine,
  getToolDescription,
  inferAction,
  normalizeSkillResult,
  isBulkLlmCall,
  llmConfirmReason,
  resolveRiskLevel,
  toFunctionCallingTools,
  toJsonSchema,
  LLM_BULK_COUNT_THRESHOLD,
  type SkillProtocol
} from '../../src/shared/agent/config'

describe('agent 协议：风险等级与权限', () => {
  it('风险等级数值与 旧版 RiskLevel 一致', () => {
    expect(RISK_LEVEL.READ_ONLY).toBe(0)
    expect(RISK_LEVEL.DATA_WRITE).toBe(1)
    expect(RISK_LEVEL.FILE_SYSTEM).toBe(2)
    expect(RISK_LEVEL.NETWORK).toBe(3)
    expect(RISK_LEVEL.SYSTEM).toBe(4)
    expect(DEFAULT_MAX_ALLOWED_RISK).toBe(RISK_LEVEL.FILE_SYSTEM)
    expect(DEFAULT_TOOL_RISK).toBe(RISK_LEVEL.DATA_WRITE)
  })

  it('resolveRiskLevel：按 action 细分，未登记回退 DATA_WRITE', () => {
    expect(resolveRiskLevel('system.game_data', 'list')).toBe(RISK_LEVEL.READ_ONLY)
    expect(resolveRiskLevel('system.game_data', 'query')).toBe(RISK_LEVEL.READ_ONLY)
    expect(resolveRiskLevel('system.game_data', 'list_types')).toBe(RISK_LEVEL.READ_ONLY)
    expect(resolveRiskLevel('system.game_data', 'create')).toBe(RISK_LEVEL.DATA_WRITE)
    expect(resolveRiskLevel('system.game_data', 'update')).toBe(RISK_LEVEL.DATA_WRITE)
    // 整体登记为固定等级的工具
    expect(resolveRiskLevel('system.shell', '')).toBe(RISK_LEVEL.SYSTEM)
    expect(resolveRiskLevel('system.shell', 'exec')).toBe(RISK_LEVEL.SYSTEM)
    expect(resolveRiskLevel('system.ceshu', '')).toBe(RISK_LEVEL.DATA_WRITE)
    // 表内缺该 action / 表内缺该工具 → 回退默认
    expect(resolveRiskLevel('system.game_data', 'not_an_action')).toBe(DEFAULT_TOOL_RISK)
    expect(resolveRiskLevel('unknown.tool', '')).toBe(DEFAULT_TOOL_RISK)
  })

  it('checkPermission：全局上限拦截 SYSTEM 级工具，危险操作标记需确认', () => {
    // 默认上限 FILE_SYSTEM：SYSTEM 级工具被拦
    const shell = checkPermission('system.shell', 'exec')
    expect(shell.allowed).toBe(false)
    expect(shell.risk).toBe(RISK_LEVEL.SYSTEM)

    // 只读/写数据在允许范围内，且不需要确认
    const read = checkPermission('system.game_data', 'list')
    expect(read).toEqual({ allowed: true, risk: RISK_LEVEL.READ_ONLY, needsConfirmation: false })
    const write = checkPermission('system.game_data', 'create')
    expect(write).toEqual({ allowed: true, risk: RISK_LEVEL.DATA_WRITE, needsConfirmation: false })

    // 放行上限后可执行，但仍需二次确认
    const shellAllowed = checkPermission('system.shell', 'exec', { maxAllowedRisk: RISK_LEVEL.SYSTEM })
    expect(shellAllowed).toEqual({ allowed: true, risk: RISK_LEVEL.SYSTEM, needsConfirmation: true })
  })

  it('checkPermission：显式禁止的工具/操作优先于风险判定', () => {
    const blockedTool = checkPermission('system.game_data', 'list', {
      blockedTools: new Set(['system.game_data'])
    })
    expect(blockedTool.allowed).toBe(false)

    const blockedAction = checkPermission('system.game_data', 'create', {
      blockedActions: new Set(['system.game_data/create'])
    })
    expect(blockedAction.allowed).toBe(false)

    // 只禁 create 时 list 仍可用
    const listStillOk = checkPermission('system.game_data', 'list', {
      blockedActions: new Set(['system.game_data/create'])
    })
    expect(listStillOk.allowed).toBe(true)
  })

  it('TOOL_RISK_MAP 覆盖 旧版 表中的关键工具', () => {
    for (const toolId of [
      'system.game_data',
      'system.file_ops',
      'system.shell',
      'system.code',
      'system.web_search',
      'system.ceshu',
      'system.export_doc',
      'system.schema_edit',
      'system.pdf_parse',
      'system.git',
      'system.ask_user'
    ]) {
      expect(TOOL_RISK_MAP[toolId]).toBeDefined()
    }
  })
})

describe('agent 协议：结果归一化', () => {
  it('标准结果原样保留，且不产出 _raw', () => {
    const result = normalizeSkillResult({ success: false, message: '', error: '出错了' })
    expect(result).toEqual({ success: false, message: '', error: '出错了' })
    expect('_raw' in result).toBe(false)
  })

  it('缺 success/message 的对象补默认值', () => {
    // 回退 message 走 JS 字符串化
    expect(normalizeSkillResult({ data: [1, 2] })).toEqual({ success: true, message: '1,2', data: [1, 2] })
    expect(normalizeSkillResult({ message: '只有消息' })).toEqual({
      success: true,
      message: '只有消息',
      data: undefined
    })
  })

  it('非对象结果包成成功结果（字符串原样作为 message）', () => {
    expect(normalizeSkillResult('纯文本')).toEqual({ success: true, message: '纯文本', data: null })
    expect(normalizeSkillResult(null)).toEqual({ success: true, message: 'null', data: null })
  })

  it('缺 boolean success 但带 interaction：交互请求不能被静默丢弃', () => {
    // 修复前该分支不返回 interaction ⇒ Brain 的 isSkillInteraction 拿不到它，
    // 用户永远收不到确认/提问弹窗
    const interaction = { kind: 'confirm' as const, prompt: '确认删除？' }
    expect(normalizeSkillResult({ message: '需要确认', interaction })).toEqual({
      success: true,
      message: '需要确认',
      data: undefined,
      interaction
    })
    // 非法 interaction 仍按结构校验丢弃（不因补齐而放松）
    expect(normalizeSkillResult({ message: 'x', interaction: { kind: 'bad' } })).toEqual({
      success: true,
      message: 'x',
      data: undefined
    })
  })
})

describe('agent 协议：参数修正', () => {
  it('ACTION_ALIASES 含中英文别名', () => {
    expect(ACTION_ALIASES.create_item).toBe('create')
    expect(ACTION_ALIASES['新增']).toBe('create')
    expect(ACTION_ALIASES['搜索']).toBe('query')
    expect(ACTION_ALIASES['修改']).toBe('update')
  })

  it('fixParams：action 别名归一（大小写不敏感）', () => {
    expect(fixParams('system.game_data', { action: 'ADD_ITEM' }).action).toBe('create')
    expect(fixParams('system.game_data', { action: '查询' }).action).toBe('query')
    expect(fixParams('system.game_data', { action: 'List' }).action).toBe('list')
  })

  it('inferAction：按工具与参数形态推断', () => {
    expect(inferAction('system.game_data', { keyword: '火' })).toBe('query')
    expect(inferAction('system.game_data', { data_type: 'role' })).toBe('list')
    expect(inferAction('system.game_data', { data_type: 'role', name: '法师' })).toBe('create')
    expect(inferAction('system.game_data', { data_type: 'role', field: 'atk', value: 1 })).toBe('update')
    expect(inferAction('system.game_data', { item_id: 'r1' })).toBe('update')
    expect(inferAction('system.ceshu', { ceshu_id: 'c1' })).toBe('get')
    expect(inferAction('system.ceshu', {})).toBe('list')
    expect(inferAction('unknown.tool', {})).toBe('')
  })

  it('fixParams：缺失 action 时按工具推断补上', () => {
    expect(fixParams('system.game_data', { keyword: '火系' }).action).toBe('query')
    expect(fixParams('system.ceshu', {}).action).toBe('list')
    // 已有 action 时不被推断覆盖
    expect(fixParams('system.game_data', { action: 'create', keyword: 'x' }).action).toBe('create')
  })

  it('fixParams：参数别名收敛到规范名并删除旧键', () => {
    const fixed = fixParams('system.game_data', { type: 'role', search: '火', top: 5 })
    expect(fixed.data_type).toBe('role')
    expect(fixed.keyword).toBe('火')
    expect(fixed.limit).toBe(5)
    expect('type' in fixed).toBe(false)
    expect('search' in fixed).toBe(false)
    expect('top' in fixed).toBe(false)
  })

  it('fixParams：规范名已存在时不覆盖，且不改动入参', () => {
    const input = { data_type: 'role', type: 'skill' }
    const fixed = fixParams('system.game_data', input)
    expect(fixed.data_type).toBe('role')
    expect(input).toEqual({ data_type: 'role', type: 'skill' })
  })

  it('fixParams：空入参不抛错', () => {
    expect(fixParams('system.game_data', undefined)).toEqual({})
  })
})

describe('agent 协议：JSON Schema 与工具描述', () => {
  const stub: SkillProtocol = {
    id: 'system.demo',
    description: '演示技能',
    version: '1.0.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['go', 'stop'], description: '操作类型' },
        count: { type: 'integer', description: '次数', default: 1 }
      },
      required: ['action']
    },
    execute: () => ({ success: true, message: 'ok' })
  }

  it('toJsonSchema：优先使用 parametersSchema', () => {
    const schema = toJsonSchema(stub)
    expect(schema.name).toBe('system.demo')
    expect(schema.description).toBe('演示技能')
    expect(Object.keys(schema.parameters.properties)).toEqual(['action', 'count'])
    expect(schema.parameters.required).toEqual(['action'])
  })

  it('toJsonSchema：无 parametersSchema 时由 parameters 列表生成', () => {
    const fromList: SkillProtocol = {
      id: 'system.list',
      description: '列表式',
      version: '1.0.0',
      parameters: [
        { name: 'name', type: 'string', description: '名称', required: true },
        { name: 'limit', type: 'integer', description: '上限', default: 10, minimum: 1, maximum: 100 }
      ],
      execute: () => ({ success: true, message: 'ok' })
    }
    const schema = toJsonSchema(fromList)
    expect(schema.parameters.required).toEqual(['name'])
    expect(schema.parameters.properties.limit).toMatchObject({
      type: 'integer',
      default: 10,
      minimum: 1,
      maximum: 100
    })
  })

  it('toFunctionCallingTools：补 `{type:"function"}` 外层，且不改动内层字段', () => {
    const single = toFunctionCallingTools([toJsonSchema(stub)])
    expect(single).toEqual([{ type: 'function', function: toJsonSchema(stub) }])
    expect(single[0]?.type).toBe('function')
    expect(single[0]?.function.name).toBe('system.demo')
    // 线格式契约：**不允许**把内层字段摊平到顶层（云端会回 400「tools.0.type must be one of ['function']」）
    expect(single[0]).not.toHaveProperty('name')
    expect(single[0]).not.toHaveProperty('parameters')
    expect(toFunctionCallingTools([])).toEqual([])
  })

  it('getToolDescription：首行 `- id: 描述`，参数行带必填星号与约束', () => {
    const text = getToolDescription(stub)
    const lines = text.split('\n')
    expect(lines[0]).toBe('- system.demo: 演示技能')
    expect(lines[1]).toBe('    *action: 操作类型 (type=string, enum=[go|stop])')
    expect(lines[2]).toBe('    count: 次数 (type=integer, default=1)')
  })

  it('getToolCatalogLine（M2/G7）：只有一行 `- id: 摘要`，不含参数明细', () => {
    const line = getToolCatalogLine(stub)
    expect(line).toBe('- system.demo: 演示技能')
    expect(line).not.toContain('action')
    expect(line.split('\n')).toHaveLength(1)
  })
})

describe('策划书 / 数据域云端 LLM 调用的确认门（v0.5 DD-17）', () => {
  /**
   * 为什么要有这一套：`ceshu:aiGenerate*` / `ceshu:aiReview` 走的**不是** agent 技能通路
   * （渲染层直连，`window.mbApi.ceshu.*` 53 处 vs `window.mbApi.agent` 1 处），
   * 所以 `TOOL_RISK_MAP` 与 `approvalBroker` 对它们**不生效**。
   * 本套判定让两条通路**共用同一个"要不要先问用户"的口径**，而不新造机制。
   */
  it('单次调用无需确认', () => {
    expect(isBulkLlmCall({})).toBe(false)
    expect(llmConfirmReason({})).toBeNull()
  })

  it('整篇 / 一键生成需确认', () => {
    expect(isBulkLlmCall({ bulk: true })).toBe(true)
    expect(llmConfirmReason({ bulk: true })).toContain('连续多次调用云端模型')
  })

  it('批量条数 ≤ 阈值无需确认（默认 5 条属于常规操作）', () => {
    expect(LLM_BULK_COUNT_THRESHOLD).toBe(10)
    expect(isBulkLlmCall({ count: LLM_BULK_COUNT_THRESHOLD })).toBe(false)
    expect(llmConfirmReason({ count: 5 })).toBeNull()
  })

  it('批量条数 > 阈值需确认，且原因里带出条数', () => {
    const reason = llmConfirmReason({ count: 12 })
    expect(reason).not.toBeNull()
    expect(reason).toContain('12')
    expect(reason).toContain('token')
  })

  it('非法 / 非数字 count 不误判为批量', () => {
    expect(llmConfirmReason({ count: Number.NaN })).toBeNull()
    expect(llmConfirmReason({ count: undefined })).toBeNull()
    expect(llmConfirmReason({ count: Number.POSITIVE_INFINITY })).toBeNull()
  })

  it('bulk 优先于 count（两者都给时按整篇的文案）', () => {
    expect(llmConfirmReason({ bulk: true, count: 12 })).toContain('整篇')
  })

  it('判定与文案同源：isBulkLlmCall 与 llmConfirmReason 永不矛盾', () => {
    const cases = [{}, { bulk: true }, { count: 5 }, { count: 11 }, { bulk: false, count: 11 }]
    for (const scope of cases) {
      expect(isBulkLlmCall(scope), JSON.stringify(scope)).toBe(llmConfirmReason(scope) !== null)
    }
  })
})
