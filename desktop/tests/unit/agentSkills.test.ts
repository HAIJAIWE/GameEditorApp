import { describe, expect, it } from 'vitest'

import { SkillDispatcher } from '../../src/main/agent/dispatcher'
import { createCeshuSkill } from '../../src/main/agent/skills/ceshuSkill'
import { createGameDataSkill } from '../../src/main/agent/skills/gameDataSkill'
import type { CeshuManager } from '../../src/main/ceshu/manager'
import type { DataService } from '../../src/main/data/service'
import type { TypeSchemaStore } from '../../src/main/schema/store'
import { BUILTIN_DATA_TYPES } from '../../src/shared/typeSchema'
import type { DataTypeDef, ItemRecord } from '../../src/shared/types'

const ROLE = BUILTIN_DATA_TYPES.find((type) => type.id === 'role') as DataTypeDef
const TYPE_COUNT = BUILTIN_DATA_TYPES.length

function makeSchemaStore(): TypeSchemaStore {
  return { getTypes: () => BUILTIN_DATA_TYPES } as unknown as TypeSchemaStore
}

/** 内存版 DataService：只实现技能用到的 4 个方法 */
function makeDataService(seed: Record<string, Array<Record<string, unknown>>> = {}): DataService {
  const store = new Map<string, ItemRecord[]>(
    Object.entries(seed).map(([type, rows]) => [
      type,
      rows.map((row, index) => ({
        id: `${type}-${index + 1}`,
        type,
        data: row,
        createdAt: '',
        updatedAt: ''
      }))
    ])
  )
  let seq = 100
  return {
    listItems: (type: string): ItemRecord[] => store.get(type) ?? [],
    listAllItems: (): ItemRecord[] => [...store.values()].flat(),
    createItem: async (input: { type: string; data: Record<string, unknown> }): Promise<ItemRecord> => {
      const item: ItemRecord = {
        id: `${input.type}-${++seq}`,
        type: input.type,
        data: input.data,
        createdAt: '',
        updatedAt: ''
      }
      store.set(input.type, [...(store.get(input.type) ?? []), item])
      return item
    },
    updateItem: async (id: string, data: Record<string, unknown>): Promise<ItemRecord> => {
      for (const items of store.values()) {
        const index = items.findIndex((item) => item.id === id)
        if (index >= 0) {
          const merged = { ...items[index]!, data }
          items[index] = merged
          return merged
        }
      }
      throw new Error(`条目 ${id} 不存在`)
    }
  } as unknown as DataService
}

function makeCeshuManager(list: Array<{ id: string; gameName: string }>): CeshuManager {
  return {
    list: () => list,
    get: (id: string) => {
      const target = list.find((item) => item.id === id)
      if (target === undefined) throw new Error('策划书不存在，可能已被删除')
      return { ceshu_id: target.id, version_label: 'v1.0', meta: { game_name: target.gameName } }
    }
  } as unknown as CeshuManager
}

describe('system.game_data 技能（A1-1 最小集）', () => {
  it('list_types：列出全部数据类型（名称 + 单数键）', async () => {
    const skill = createGameDataSkill({ dataService: makeDataService(), typeSchemaStore: makeSchemaStore() })
    const result = await skill.execute({ action: 'list_types' }, {})
    expect(result.success).toBe(true)
    expect(result.message).toBe(
      `可用数据类型（${TYPE_COUNT} 种）：${BUILTIN_DATA_TYPES.map((type) => `${type.name} ${type.id}`).join('、')}`
    )
    expect(Array.isArray(result.data)).toBe(true)
  })

  it('list：缺 data_type → 缺少 data_type 参数', async () => {
    const skill = createGameDataSkill({ dataService: makeDataService(), typeSchemaStore: makeSchemaStore() })
    const result = await skill.execute({ action: 'list' }, {})
    expect(result).toEqual({ success: false, error: '缺少 data_type 参数', message: '' })
  })

  it('list：按复数据键取名并给出条数', async () => {
    const dataService = makeDataService({ [ROLE.id]: [{ name: '法师' }, { name: '战士' }] })
    const skill = createGameDataSkill({ dataService, typeSchemaStore: makeSchemaStore() })
    const result = await skill.execute({ action: 'list', data_type: 'role' }, {})
    expect(result.success).toBe(true)
    expect(result.message).toBe(`共 2 条${ROLE.name}数据`)
  })

  it('list：也接受复数键；未知类型给出可用类型清单', async () => {
    const skill = createGameDataSkill({ dataService: makeDataService(), typeSchemaStore: makeSchemaStore() })
    const byPlural = await skill.execute({ action: 'list', data_type: ROLE.pluralKey }, {})
    expect(byPlural.success).toBe(true)

    const unknown = await skill.execute({ action: 'list', data_type: 'nope' }, {})
    expect(unknown.success).toBe(false)
    expect(unknown.error).toBe(
      `未知数据类型: nope。可用类型: ${BUILTIN_DATA_TYPES.map((type) => type.id).join(', ')}`
    )
  })

  it('query：按名称不区分大小写匹配', async () => {
    const dataService = makeDataService({ [ROLE.id]: [{ name: 'Fire Mage' }, { name: '战士' }] })
    const skill = createGameDataSkill({ dataService, typeSchemaStore: makeSchemaStore() })
    const result = await skill.execute({ action: 'query', data_type: 'role', keyword: 'fire' }, {})
    expect(result.message).toBe(`找到 1 条匹配「fire」的${ROLE.name}数据`)
  })

  it('create：缺 data_type / 未知类型 / 重名 / 成功', async () => {
    const dataService = makeDataService({ [ROLE.id]: [{ name: '法师' }] })
    const skill = createGameDataSkill({ dataService, typeSchemaStore: makeSchemaStore() })

    const missing = await skill.execute({ action: 'create' }, {})
    expect(missing.success).toBe(false)
    expect(missing.error).toContain('缺少 data_type 参数。可用类型: ')

    const duplicate = await skill.execute({ action: 'create', data_type: 'role', name: '法师' }, {})
    expect(duplicate.success).toBe(false)
    expect(duplicate.error).toBe(`已存在名为【法师】的${ROLE.name}条目（id=role-1），请用 action=update 而不是 create。`)

    const created = await skill.execute(
      { action: 'create', data_type: 'role', name: '牧师', data: { atk: 10 } },
      {}
    )
    expect(created.success).toBe(true)
    expect(created.message).toContain(`已创建${ROLE.name}【牧师】（id=`)
    // 已落库
    expect(dataService.listItems(ROLE.id).map((item) => item.data.name)).toContain('牧师')
  })

  it('update：缺 patch / 按 item_id / 条目不存在 / 按名称找不到', async () => {
    const dataService = makeDataService({ [ROLE.id]: [{ name: '法师' }] })
    const skill = createGameDataSkill({ dataService, typeSchemaStore: makeSchemaStore() })

    const noPatch = await skill.execute({ action: 'update', item_id: 'role-1' }, {})
    expect(noPatch).toEqual({
      success: false,
      error: '缺少要修改的字段名 (field 参数) 或 data 对象',
      message: ''
    })

    const byId = await skill.execute({ action: 'update', item_id: 'role-1', data: { atk: 99 } }, {})
    expect(byId.success).toBe(true)
    expect(byId.message).toBe(`已修改${ROLE.name}【法师】（id=role-1）`)

    const missingItem = await skill.execute({ action: 'update', item_id: 'nope-1', data: { atk: 1 } }, {})
    expect(missingItem).toEqual({ success: false, error: '条目 nope-1 不存在', message: '' })

    const notFound = await skill.execute({ action: 'update', name: '不存在的名字', data: { atk: 1 } }, {})
    expect(notFound.error).toBe(
      '找不到名称「不存在的名字」对应的条目。请检查名称是否正确，或提供 data_type 缩小范围。'
    )
  })

  it('update：field + value 形式', async () => {
    const dataService = makeDataService({ [ROLE.id]: [{ name: '法师' }] })
    const skill = createGameDataSkill({ dataService, typeSchemaStore: makeSchemaStore() })
    const result = await skill.execute(
      { action: 'update', data_type: 'role', name: '法师', field: 'hp', value: 500 },
      {}
    )
    expect(result.success).toBe(true)
    expect(dataService.listItems(ROLE.id)[0]?.data.hp).toBe(500)
  })

  it('未知动作 → 未知动作: {action}', async () => {
    const skill = createGameDataSkill({ dataService: makeDataService(), typeSchemaStore: makeSchemaStore() })
    const result = await skill.execute({ action: 'explode' }, {})
    expect(result).toEqual({ success: false, error: '未知动作: explode', message: '' })
  })
})

describe('system.ceshu 技能（只读子集）', () => {
  const docs = [
    { id: 'c1', gameName: '仙侠 RPG' },
    { id: 'c2', gameName: '射击游戏' }
  ]

  it('list：全部 / 按关键词过滤', async () => {
    const skill = createCeshuSkill({ ceshuManager: makeCeshuManager(docs) })
    expect((await skill.execute({ action: 'list' }, {})).message).toBe('共 2 份策划书')
    expect((await skill.execute({ action: 'list', keyword: '仙侠' }, {})).message).toBe(
      '找到 1 份匹配「仙侠」的策划书'
    )
  })

  it('get：缺 ceshu_id / 正常获取 / 不存在时透出存储错误', async () => {
    const skill = createCeshuSkill({ ceshuManager: makeCeshuManager(docs) })
    expect(await skill.execute({ action: 'get' }, {})).toEqual({
      success: false,
      error: '缺少 ceshu_id 参数',
      message: ''
    })

    const found = await skill.execute({ action: 'get', ceshu_id: 'c1' }, {})
    expect(found.message).toBe('已获取策划书「仙侠 RPG」（v1.0）')

    const missing = await skill.execute({ action: 'get', ceshu_id: 'nope' }, {})
    expect(missing).toEqual({ success: false, error: '策划书不存在，可能已被删除', message: '' })
  })

  it('未知动作 → 未知动作: {action}', async () => {
    const skill = createCeshuSkill({ ceshuManager: makeCeshuManager(docs) })
    const result = await skill.execute({ action: 'ai_generate' }, {})
    expect(result).toEqual({ success: false, error: '未知动作: ai_generate', message: '' })
  })
})

describe('调度器 + 真实技能的端到端（等价 IPC 路径）', () => {
  it('中文别名解析 → 参数修正 → 执行成功', async () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(
      createGameDataSkill({
        dataService: makeDataService({ [ROLE.id]: [{ name: '法师' }] }),
        typeSchemaStore: makeSchemaStore()
      })
    )
    dispatcher.register(createCeshuSkill({ ceshuManager: makeCeshuManager([{ id: 'c1', gameName: '仙侠' }]) }))

    const byAlias = await dispatcher.execute('角色', { action: 'list', type: 'role' })
    expect(byAlias.success).toBe(true)
    expect(byAlias.message).toBe(`共 1 条${ROLE.name}数据`)

    const ceshu = await dispatcher.execute('策划书', { action: 'list' })
    expect(ceshu.success).toBe(true)
    expect(ceshu.message).toBe('共 1 份策划书')

    const missingParam = await dispatcher.execute('system.game_data', { action: 'list' })
    expect(missingParam.success).toBe(false)
    expect(missingParam.error).toBe('缺少 data_type 参数')
  })
})
