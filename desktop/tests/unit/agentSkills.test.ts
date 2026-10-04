import { describe, expect, it } from 'vitest'

import { SkillDispatcher } from '../../src/main/agent/dispatcher'
import { createAskUserSkill } from '../../src/main/agent/skills/askUserSkill'
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
    deleteItem: async (id: string): Promise<boolean> => {
      for (const [type, items] of store) {
        const index = items.findIndex((item) => item.id === id)
        if (index >= 0) {
          store.set(
            type,
            items.filter((_item, at) => at !== index)
          )
          return true
        }
      }
      return false
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

/** 内存版 CeshuManager：覆盖 list/get/create/saveChapter */
function makeCeshuManager(list: Array<{ id: string; gameName: string }>): CeshuManager {
  type Doc = { ceshu_id: string; version_label: string; meta: Record<string, unknown> }
  const docs = new Map<string, Doc>(
    list.map((item) => [item.id, { ceshu_id: item.id, version_label: 'v1.0', meta: { game_name: item.gameName } }])
  )
  let seq = list.length
  return {
    list: () =>
      [...docs.values()].map((doc) => ({
        id: doc.ceshu_id,
        gameName: typeof doc.meta.game_name === 'string' ? doc.meta.game_name : '',
        versionLabel: doc.version_label
      })),
    get: (id: string): Doc => {
      const doc = docs.get(id)
      if (doc === undefined) throw new Error('策划书不存在，可能已被删除')
      return doc
    },
    create: async (options: { scope: string; name?: string }): Promise<Doc> => {
      const id = `new-${++seq}`
      const doc: Doc = {
        ceshu_id: id,
        version_label: 'v1.0',
        meta: { game_name: options.name ?? '', gdd_scope: options.scope }
      }
      docs.set(id, doc)
      return doc
    },
    remove: async (id: string): Promise<boolean> => docs.delete(id),
    saveChapter: async (id: string, _chapter: string, data: Record<string, unknown>): Promise<Doc> => {
      const doc = docs.get(id)
      if (doc === undefined) throw new Error('策划书不存在，可能已被删除')
      const updated: Doc = { ...doc, meta: { ...doc.meta, ...data } }
      docs.set(id, updated)
      return updated
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

  it('delete：未确认时返回 confirm 交互（不删数据），确认后真正删除', async () => {
    const dataService = makeDataService({ [ROLE.id]: [{ name: '法师' }, { name: '战士' }] })
    const skill = createGameDataSkill({ dataService, typeSchemaStore: makeSchemaStore() })

    const pending = await skill.execute({ action: 'delete', data_type: 'role', name: '法师' }, {})
    expect(pending.success).toBe(false)
    expect(pending.error).toBe(`[WARN] 确认删除${ROLE.name}【法师】？此操作不可撤销。`)
    expect(pending.interaction).toEqual({
      kind: 'confirm',
      prompt: `确认删除${ROLE.name}【法师】？此操作不可撤销。`
    })
    // 未确认 → 数据没动
    expect(dataService.listItems(ROLE.id)).toHaveLength(2)

    const done = await skill.execute({ action: 'delete', data_type: 'role', name: '法师', confirm: true }, {})
    expect(done.success).toBe(true)
    expect(done.message).toBe(`已删除${ROLE.name}【法师】（id=role-1）`)
    expect(dataService.listItems(ROLE.id).map((item) => item.data.name)).toEqual(['战士'])
  })

  it('delete：按 item_id；条目不存在 / 未给定位条件时给中文错误', async () => {
    const dataService = makeDataService({ [ROLE.id]: [{ name: '法师' }] })
    const skill = createGameDataSkill({ dataService, typeSchemaStore: makeSchemaStore() })

    expect(await skill.execute({ action: 'delete' }, {})).toEqual({
      success: false,
      error: "找不到要删除的条目。请提供 name 参数（如 'name':'火系法师'）或 item_id 参数。",
      message: ''
    })
    expect(await skill.execute({ action: 'delete', item_id: 'nope', confirm: true }, {})).toEqual({
      success: false,
      error: '条目 nope 不存在',
      message: ''
    })
    // item_id + confirm 直接删
    const byId = await skill.execute({ action: 'delete', item_id: 'role-1', confirm: true }, {})
    expect(byId.success).toBe(true)
    expect(dataService.listItems(ROLE.id)).toHaveLength(0)
  })
})

describe('tool.ask_user 技能（参数澄清）', () => {
  it('返回 question 交互（含候选选项）', async () => {
    const skill = createAskUserSkill()
    const result = await skill.execute({ action: 'ask', question: '用哪个职业？', options: ['战士', '', '法师'] }, {})
    expect(result.success).toBe(true)
    expect(result.interaction).toEqual({
      kind: 'question',
      prompt: '用哪个职业？',
      options: [{ label: '战士' }, { label: '法师' }]
    })
  })

  it('多问题（Python questions 形态）：兼容 {question, options:[{label,description}], multiSelect}', async () => {
    const skill = createAskUserSkill()
    const result = await skill.execute(
      {
        action: 'ask',
        questions: [
          { question: '用哪个职业？', options: [{ label: '战士', description: '近战' }, '法师'] },
          { prompt: '要哪些流派？', options: [{ label: '普攻流' }, { label: 'CD 流' }], multiSelect: true },
          { question: '' } // 无效项应被丢弃
        ]
      },
      {}
    )

    expect(result.success).toBe(true)
    expect(result.interaction?.prompt).toBe('请回答以下 2 个问题')
    expect(result.interaction?.questions).toEqual([
      { prompt: '用哪个职业？', options: [{ label: '战士', description: '近战' }, { label: '法师' }] },
      { prompt: '要哪些流派？', options: [{ label: '普攻流' }, { label: 'CD 流' }], multiSelect: true }
    ])
  })

  it('多问题：全部无效时明确报错', async () => {
    const skill = createAskUserSkill()
    const result = await skill.execute({ action: 'ask', questions: [{ question: '' }, 123] }, {})
    expect(result).toEqual({
      success: false,
      error: 'questions 里没有有效问题（每项需有 question 或 prompt）',
      message: ''
    })
  })

  it('无选项时不带 options 字段；缺 question / 未知动作报错', async () => {
    const skill = createAskUserSkill()
    expect((await skill.execute({ action: 'ask', question: '继续吗' }, {})).interaction).toEqual({
      kind: 'question',
      prompt: '继续吗'
    })
    expect(await skill.execute({ action: 'ask' }, {})).toEqual({
      success: false,
      error: '缺少 question 参数（或改用 questions 数组）',
      message: ''
    })
    expect(await skill.execute({ action: 'nope', question: 'x' }, {})).toEqual({
      success: false,
      error: '未知动作: nope',
      message: ''
    })
  })

  it('经调度器可被「提问」别名解析（READ_ONLY，不需危险确认）', async () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(createAskUserSkill())
    const result = await dispatcher.execute('提问', { action: 'ask', question: '用哪个职业？' })
    expect(result.success).toBe(true)
    expect(result.interaction?.kind).toBe('question')
  })
})

describe('system.ceshu 技能（A1-5 写操作）', () => {
  const docs = [{ id: 'c1', gameName: '仙侠 RPG' }]

  it('create：按档位建库；带 meta 时合并写入并回报名称', async () => {
    const skill = createCeshuSkill({ ceshuManager: makeCeshuManager(docs) })

    const plain = await skill.execute({ action: 'create' }, {})
    expect(plain.success).toBe(true)
    expect(plain.message).toContain('已创建策划书（v1.0，工业级档位，id=')
    expect((plain.data as { meta: Record<string, unknown> }).meta.gdd_scope).toBe('full')

    const lite = await skill.execute({ action: 'create', scope: 'lite', name: '小项目' }, {})
    expect(lite.success).toBe(true)
    expect(lite.message).toContain('基础档位')

    const named = await skill.execute(
      { action: 'create', scope: 'full', name: '原始名', meta: { game_name: '改后的名', tags: ['a'] } },
      {}
    )
    expect(named.success).toBe(true)
    expect(named.message).toContain('已创建策划书「改后的名」')
    expect((named.data as { meta: Record<string, unknown> }).meta.tags).toEqual(['a'])
  })

  it('update：写入指定章节；缺 ceshu_id / 未知章节 / 缺 data 给出中文错误', async () => {
    const skill = createCeshuSkill({ ceshuManager: makeCeshuManager(docs) })

    const noId = await skill.execute({ action: 'update', data: { game_name: 'x' } }, {})
    expect(noId).toEqual({ success: false, error: '缺少 ceshu_id 参数', message: '' })

    const badChapter = await skill.execute({ action: 'update', ceshu_id: 'c1', chapter: 'nope', data: {} }, {})
    expect(badChapter.success).toBe(false)
    expect(badChapter.error).toContain('未知章节: nope。可用章节: meta, vision')

    const noData = await skill.execute({ action: 'update', ceshu_id: 'c1', chapter: 'meta' }, {})
    expect(noData).toEqual({
      success: false,
      error: '缺少 data 对象（要写入该章节的字段）',
      message: ''
    })

    // 默认章节 meta
    const ok = await skill.execute({ action: 'update', ceshu_id: 'c1', data: { game_name: '改名了' } }, {})
    expect(ok.success).toBe(true)
    expect(ok.message).toBe('已更新策划书「改名了」的「第一章·项目元信息」')
  })

  it('update：文档不存在时透出存储层中文错误', async () => {
    const skill = createCeshuSkill({ ceshuManager: makeCeshuManager(docs) })
    const result = await skill.execute({ action: 'update', ceshu_id: 'nope', data: { a: 1 } }, {})
    expect(result).toEqual({ success: false, error: '策划书不存在，可能已被删除', message: '' })
  })

  it('delete：未确认时返回 confirm 交互（不删），确认后真正删除', async () => {
    const ceshuManager = makeCeshuManager(docs)
    const skill = createCeshuSkill({ ceshuManager })

    const pending = await skill.execute({ action: 'delete', ceshu_id: 'c1' }, {})
    expect(pending.success).toBe(false)
    expect(pending.interaction).toEqual({
      kind: 'confirm',
      prompt: '确认删除策划书「仙侠 RPG」？此操作不可撤销。'
    })
    expect(ceshuManager.list()).toHaveLength(1)

    const done = await skill.execute({ action: 'delete', ceshu_id: 'c1', confirm: true }, {})
    expect(done.success).toBe(true)
    expect(done.message).toBe('已删除策划书「仙侠 RPG」（id=c1）')
    expect(ceshuManager.list()).toHaveLength(0)
  })

  it('delete：缺 ceshu_id / 文档不存在', async () => {
    const skill = createCeshuSkill({ ceshuManager: makeCeshuManager(docs) })
    expect(await skill.execute({ action: 'delete' }, {})).toEqual({
      success: false,
      error: '缺少 ceshu_id 参数',
      message: ''
    })
    expect(await skill.execute({ action: 'delete', ceshu_id: 'nope', confirm: true }, {})).toEqual({
      success: false,
      error: '策划书不存在，可能已被删除',
      message: ''
    })
  })

  it('export：未注入导出管道时明确报错；注入后导出并回报路径与字节数', async () => {
    const disabled = createCeshuSkill({ ceshuManager: makeCeshuManager(docs) })
    expect(await disabled.execute({ action: 'export', ceshu_id: 'c1' }, {})).toEqual({
      success: false,
      error: '导出功能未启用',
      message: ''
    })

    const calls: Array<{ format: string; path: string }> = []
    const skill = createCeshuSkill({
      ceshuManager: makeCeshuManager(docs),
      exportDir: 'D:/exports',
      exportDocument: async (_doc, format, targetPath) => {
        calls.push({ format, path: targetPath })
        return { filePath: `${targetPath}.md`, format, bytes: 128 }
      }
    })

    const result = await skill.execute({ action: 'export', ceshu_id: 'c1' }, {})
    expect(result.success).toBe(true)
    // 默认格式 markdown；文件名安全化 + 落到注入的导出目录
    expect(calls[0]?.format).toBe('markdown')
    // 注意：path.join 在 Windows 产出反斜杠，断言前统一成正斜杠
    expect(calls[0]?.path.replace(/\\/gu, '/')).toMatch(/^D:\/exports\/仙侠 RPG-[a-z0-9]+$/u)
    expect(result.message.replace(/\\/gu, '/')).toContain('已导出「仙侠 RPG」到 D:/exports/')
    expect(result.message).toContain('markdown，128 字节')
  })

  it('export：显式路径与格式优先；非法格式回落默认', async () => {
    const seen: string[] = []
    const skill = createCeshuSkill({
      ceshuManager: makeCeshuManager(docs),
      exportDir: 'D:/exports',
      exportDocument: async (_doc, format, targetPath) => {
        seen.push(`${format}|${targetPath}`)
        return { filePath: targetPath, format, bytes: 1 }
      }
    })

    await skill.execute({ action: 'export', ceshu_id: 'c1', format: 'excel', path: 'D:/out/书' }, {})
    await skill.execute({ action: 'export', ceshu_id: 'c1', format: '不存在的格式' }, {})
    const normalized = seen.map((entry) => entry.replace(/\\/gu, '/'))
    expect(normalized[0]).toBe('excel|D:/out/书')
    expect(normalized[1]?.startsWith('markdown|D:/exports/')).toBe(true)
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
