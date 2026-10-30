import { describe, expect, it } from 'vitest'

import { RISK_LEVEL, type JsonObjectSchema } from '../../src/shared/agent/config/protocol'
import {
  CONFIRM_THRESHOLD,
  NAMESPACE_LABELS,
  RISK_LABELS,
  actionNamesOf,
  buildActionViews,
  buildParamViews,
  buildToolCatalog,
  buildToolView,
  emptyToolCatalog,
  filterToolViews,
  needsConfirmation,
  riskLabel,
  summarizeCatalog,
  toolNamespace,
  toolShortName,
  type ToolListEntry
} from '../../src/shared/agent/ui/agentEditor'

/** 构造一份最小可用的参数 schema */
function schema(
  properties: JsonObjectSchema['properties'],
  required?: readonly string[]
): JsonObjectSchema {
  return required === undefined ? { type: 'object', properties } : { type: 'object', properties, required }
}

/** 与 `main/agent/skills/gameDataSkill.ts:17` 的 ACTIONS 对齐 */
const GAME_DATA_ACTIONS = ['list_types', 'list', 'query', 'create', 'update', 'delete'] as const

function gameDataEntry(): ToolListEntry {
  return {
    name: 'system.game_data',
    description: '游戏数据表的增删改查',
    parameters: schema(
      {
        action: { type: 'string', enum: [...GAME_DATA_ACTIONS], description: '操作类型' },
        type: { type: 'string', description: '数据类型 id' },
        limit: { type: 'integer', description: '返回条数上限', default: 20 }
      },
      ['action']
    )
  }
}

function codeEntry(): ToolListEntry {
  return {
    name: 'system.code',
    description: '执行代码',
    parameters: schema({ action: { type: 'string', enum: ['execute'] }, code: { type: 'string' } }, ['action', 'code'])
  }
}

describe('agentEditor：风险等级文案', () => {
  it('RISK_LABELS 覆盖全部五个等级且互不重复', () => {
    expect(Object.keys(RISK_LABELS).length).toBe(5)
    expect(new Set(Object.values(RISK_LABELS)).size).toBe(5)
    expect(riskLabel(RISK_LEVEL.READ_ONLY)).toBe('只读')
    expect(riskLabel(RISK_LEVEL.SYSTEM)).toBe('系统级')
  })

  it('RISK_LABELS 的键与 RISK_LEVEL 的数值一一对应（新增等级时不会被漏掉）', () => {
    expect(Object.keys(RISK_LABELS).map(Number).sort((a, b) => a - b)).toEqual([
      RISK_LEVEL.READ_ONLY,
      RISK_LEVEL.DATA_WRITE,
      RISK_LEVEL.FILE_SYSTEM,
      RISK_LEVEL.NETWORK,
      RISK_LEVEL.SYSTEM
    ])
  })

  it('riskLabel 对越界数值回退「未知」而不抛错', () => {
    expect(riskLabel(99 as (typeof RISK_LEVEL)['SYSTEM'])).toBe('未知')
  })

  it('needsConfirmation 的阈值与调度器一致（>= SYSTEM）', () => {
    expect(CONFIRM_THRESHOLD).toBe(RISK_LEVEL.SYSTEM)
    expect(needsConfirmation(RISK_LEVEL.NETWORK)).toBe(false)
    expect(needsConfirmation(RISK_LEVEL.SYSTEM)).toBe(true)
  })
})

describe('agentEditor：工具 id 分类', () => {
  it('按前缀识别命名空间', () => {
    expect(toolNamespace('system.game_data')).toBe('system')
    expect(toolNamespace('tool.ask_user')).toBe('tool')
    expect(toolNamespace('mcp.something')).toBe('other')
    expect(toolNamespace('bare')).toBe('other')
    expect(toolNamespace('.leading')).toBe('other')
  })

  it('短名去掉命名空间前缀；无前缀时原样返回', () => {
    expect(toolShortName('system.game_data')).toBe('game_data')
    expect(toolShortName('bare')).toBe('bare')
  })

  it('NAMESPACE_LABELS 三个分类都有中文名', () => {
    expect(NAMESPACE_LABELS.system).toBe('系统工具')
    expect(NAMESPACE_LABELS.tool).toBe('交互工具')
    expect(NAMESPACE_LABELS.other).toBe('其他工具')
  })
})

describe('agentEditor：参数 schema 摊平', () => {
  it('标出 required、抽取 enum、保留描述', () => {
    const params = buildParamViews(gameDataEntry().parameters)
    expect(params).toHaveLength(3)
    const action = params.find((p) => p.name === 'action')
    expect(action?.required).toBe(true)
    expect(action?.enumValues).toEqual([...GAME_DATA_ACTIONS])
    expect(action?.description).toBe('操作类型')
    const limit = params.find((p) => p.name === 'limit')
    expect(limit?.required).toBe(false)
    expect(limit?.enumValues).toEqual([])
  })

  it('properties 缺失 / 为 null 时返回空数组', () => {
    expect(buildParamViews(undefined)).toEqual([])
    expect(buildParamViews(null)).toEqual([])
    expect(buildParamViews({ type: 'object' } as unknown as JsonObjectSchema)).toEqual([])
  })

  it('脏属性（缺 type / 缺 description）回退为 unknown 与空串', () => {
    const params = buildParamViews(schema({ weird: {} as never }))
    expect(params[0].type).toBe('unknown')
    expect(params[0].description).toBe('')
  })

  it('actionNamesOf 只取 action 参数的枚举；无 action 返回空数组', () => {
    expect(actionNamesOf(buildParamViews(gameDataEntry().parameters))).toEqual([...GAME_DATA_ACTIONS])
    expect(actionNamesOf(buildParamViews(schema({ type: { type: 'string' } })))).toEqual([])
  })
})

describe('agentEditor：逐动作风险', () => {
  it('system.game_data 的读动作只读、写动作数据写入（与 TOOL_RISK_MAP 一致）', () => {
    const params = buildParamViews(gameDataEntry().parameters)
    const actions = buildActionViews('system.game_data', params)
    const byName = Object.fromEntries(actions.map((a) => [a.action, a]))

    expect(byName.query.risk).toBe(RISK_LEVEL.READ_ONLY)
    expect(byName.list.risk).toBe(RISK_LEVEL.READ_ONLY)
    expect(byName.create.risk).toBe(RISK_LEVEL.DATA_WRITE)
    expect(byName.delete.risk).toBe(RISK_LEVEL.DATA_WRITE)
    expect(actions.some((a) => a.needsConfirmation)).toBe(false)
  })

  it('system.code 为系统级，全部动作都需二次确认', () => {
    const actions = buildActionViews('system.code', buildParamViews(codeEntry().parameters))
    expect(actions).toHaveLength(1)
    expect(actions[0]).toEqual({
      action: 'execute',
      risk: RISK_LEVEL.SYSTEM,
      riskLabel: '系统级',
      needsConfirmation: true
    })
  })

  it('schema 无 action 枚举时返回空数组，不伪造动作', () => {
    expect(buildActionViews('system.game_data', buildParamViews(schema({ q: { type: 'string' } })))).toEqual([])
  })
})

describe('agentEditor：单工具视图', () => {
  it('取动作最大值作为工具最高风险', () => {
    const view = buildToolView(gameDataEntry())
    expect(view.id).toBe('system.game_data')
    expect(view.shortName).toBe('game_data')
    expect(view.namespace).toBe('system')
    expect(view.highestRisk).toBe(RISK_LEVEL.DATA_WRITE)
    expect(view.highestRiskLabel).toBe('数据写入')
    expect(view.needsConfirmation).toBe(false)
  })

  it('无动作轴时用工具级判定（system.code → 系统级）', () => {
    const view = buildToolView({
      name: 'tool.rollback_ai_changes',
      description: '撤销',
      parameters: schema({ session: { type: 'string' } })
    })
    // 未登记工具 → DEFAULT_TOOL_RISK(DATA_WRITE)
    expect(view.actions).toEqual([])
    expect(view.highestRisk).toBe(RISK_LEVEL.DATA_WRITE)
  })

  it('描述缺失时为空串（不编造占位文案进数据层）', () => {
    const view = buildToolView({
      name: 'tool.ask_user',
      description: undefined as unknown as string,
      parameters: schema({})
    })
    expect(view.description).toBe('')
  })
})

describe('agentEditor：工具目录聚合', () => {
  it('按风险降序排序：system.code 应排在只读工具之前', () => {
    const catalog = buildToolCatalog([
      gameDataEntry(),
      { name: 'tool.ask_user', description: '提问', parameters: schema({ action: { type: 'string', enum: ['ask'] } }) },
      codeEntry()
    ])
    expect(catalog.tools.map((t) => t.id)).toEqual(['system.code', 'system.game_data', 'tool.ask_user'])
  })

  it('统计口径：工具数 / 动作数 / 需确认数 / 各风险计数 / 峰值风险', () => {
    const catalog = buildToolCatalog([
      gameDataEntry(), // 6 动作，DATA_WRITE，不需确认
      { name: 'tool.ask_user', description: '提问', parameters: schema({ action: { type: 'string', enum: ['ask'] } }) }, // READ_ONLY
      codeEntry() // 1 动作，SYSTEM，需确认
    ])
    expect(catalog.toolCount).toBe(3)
    expect(catalog.actionCount).toBe(8)
    expect(catalog.confirmationCount).toBe(1)
    expect(catalog.peakRisk).toBe(RISK_LEVEL.SYSTEM)
    expect(catalog.riskCounts[RISK_LEVEL.SYSTEM]).toBe(1)
    expect(catalog.riskCounts[RISK_LEVEL.DATA_WRITE]).toBe(1)
    expect(catalog.riskCounts[RISK_LEVEL.READ_ONLY]).toBe(1)
    expect(catalog.riskCounts[RISK_LEVEL.NETWORK]).toBe(0)
  })

  it('空输入 / null / undefined / 全脏数据都归一到空目录', () => {
    expect(buildToolCatalog([])).toEqual(emptyToolCatalog())
    expect(buildToolCatalog(null)).toEqual(emptyToolCatalog())
    expect(buildToolCatalog(undefined)).toEqual(emptyToolCatalog())
    expect(buildToolCatalog([null as unknown as ToolListEntry, { name: '', description: '', parameters: schema({}) }])).toEqual(
      emptyToolCatalog()
    )
  })

  it('同风险时按 id 升序，顺序完全确定', () => {
    const build = (): string[] =>
      buildToolCatalog([
        gameDataEntry(),
        { name: 'system.ceshu', description: '策划书', parameters: schema({}) },
        { name: 'system.aaa', description: 'x', parameters: schema({}) }
      ]).tools.map((t) => t.id)
    expect(build()).toEqual(['system.aaa', 'system.ceshu', 'system.game_data'])
    expect(build()).toEqual(build())
  })
})

describe('agentEditor：检索过滤', () => {
  const views = buildToolCatalog([gameDataEntry(), codeEntry(), { name: 'tool.ask_user', description: '向用户提问', parameters: schema({ action: { type: 'string', enum: ['ask'] } }) }]).tools

  it('空查询 + 无开关 → 原样返回全部', () => {
    expect(filterToolViews(views)).toHaveLength(3)
    expect(filterToolViews(views, { query: '   ' })).toHaveLength(3)
  })

  it('命中 id / 短名 / 描述 / 动作名，大小写不敏感', () => {
    expect(filterToolViews(views, { query: 'GAME_DATA' }).map((t) => t.id)).toEqual(['system.game_data'])
    expect(filterToolViews(views, { query: 'game_data' }).map((t) => t.id)).toEqual(['system.game_data'])
    expect(filterToolViews(views, { query: '向用户' }).map((t) => t.id)).toEqual(['tool.ask_user'])
    expect(filterToolViews(views, { query: 'list_types' }).map((t) => t.id)).toEqual(['system.game_data'])
  })

  it('onlyRisky 只留需二次确认的工具', () => {
    expect(filterToolViews(views, { onlyRisky: true }).map((t) => t.id)).toEqual(['system.code'])
    expect(filterToolViews(views, { query: 'code', onlyRisky: true })).toHaveLength(1)
    expect(filterToolViews(views, { query: 'ceshu', onlyRisky: true })).toHaveLength(0)
  })

  it('过滤不修改入参（不原地 splice）', () => {
    const before = views.map((t) => t.id)
    filterToolViews(views, { query: 'code' })
    expect(views.map((t) => t.id)).toEqual(before)
  })
})

describe('agentEditor：标题摘要', () => {
  it('空目录给出「没有注册任何技能」', () => {
    expect(summarizeCatalog(emptyToolCatalog())).toBe('调度器当前没有注册任何技能')
  })

  it('无高危工具时说明「均无需二次确认」', () => {
    const catalog = buildToolCatalog([gameDataEntry()])
    expect(summarizeCatalog(catalog)).toBe('1 个工具 · 6 个动作 · 均无需二次确认')
  })

  it('有高危工具时带上数量与峰值风险', () => {
    const catalog = buildToolCatalog([gameDataEntry(), codeEntry()])
    expect(summarizeCatalog(catalog)).toBe('2 个工具 · 7 个动作 · 1 个需二次确认（最高 系统级）')
  })
})
