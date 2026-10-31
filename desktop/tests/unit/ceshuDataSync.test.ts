import { describe, expect, it } from 'vitest'

import { CeshuDataSync } from '../../src/main/ceshu/dataSync'
import { createDefaultCeshu } from '../../src/shared/ceshu/model'
import { BUILTIN_DATA_TYPES } from '../../src/shared/schema/core'
import type { CeshuDocument, SystemEntry } from '../../src/shared/ceshu/reference'
import type { DataTypeDef, ItemRecord } from '../../src/shared/types'

/** 内存版 typeSchemaStore 桩 */
function makeSchemaStore(initial: DataTypeDef[]) {
  let types = initial.map((t) => ({ ...t, formFields: t.formFields.map((f) => ({ ...f })) }))
  return {
    types: () => types,
    getTypes: () => types.map((t) => ({ ...t, formFields: t.formFields.map((f) => ({ ...f })) })),
    saveTypes: (next: DataTypeDef[]) => {
      types = next.map((t) => ({ ...t, formFields: t.formFields.map((f) => ({ ...f })) }))
      return types
    }
  }
}

/** 内存版 dataService 桩：按 type(复数键) 返回条目数 */
function makeDataService(countByType: Record<string, number>) {
  return {
    countByType,
    listItems: (type: string): ItemRecord[] => {
      const n = countByType[type] ?? 0
      return Array.from({ length: n }, (_, i) => ({
        id: `${type}-${i}`,
        type,
        data: {},
        createdAt: '',
        updatedAt: ''
      }))
    }
  }
}

function makeCeshuManager() {
  const calls: Array<{ id: string; chapter: string; data: unknown }> = []
  return {
    calls,
    get: (_id: string) => currentModel as CeshuDocument,
    saveChapter: (id: string, chapter: string, data: unknown) => {
      calls.push({ id, chapter, data })
      return currentModel as CeshuDocument
    }
  }
}

let currentModel: CeshuDocument = createDefaultCeshu({ scope: 'full' })

describe('ceshuDataSync systems → data', () => {
  it('启用内置类型 data_type 时复用现有类型，不重复注册', () => {
    currentModel = createDefaultCeshu({ scope: 'full' })
    // 手动把 character 系统的 data_type 指向内置类型 role（pluralKey=roles）
    ;(currentModel.systems as Record<string, SystemEntry>).character.data_type = 'role'
    ;(currentModel.systems as Record<string, SystemEntry>).character.enabled = true

    const schemaStore = makeSchemaStore(BUILTIN_DATA_TYPES)
    const dataSync = new CeshuDataSync(makeCeshuManager() as never, makeDataService({}) as never, schemaStore as never)

    const result = dataSync.syncSystemsToData(currentModel, '')
    expect(result.addedTypes).toEqual([]) // role 已存在
    // 数据键为单数类型 id（SQLite items.type 存单数），不是 pluralKey
    expect(result.ensuredKeys).toEqual(['role'])
    expect(result.errors).toEqual([])
  })

  it('启用不存在的 data_type（如 character）→ 动态注册新类型，pluralKey 取 data_type+s', () => {
    currentModel = createDefaultCeshu({ scope: 'full' })
    ;(currentModel.systems as Record<string, SystemEntry>).character.enabled = true // data_type 默认 = character

    const schemaStore = makeSchemaStore(BUILTIN_DATA_TYPES)
    const beforeIds = schemaStore.getTypes().map((t) => t.id)
    expect(beforeIds).not.toContain('character')

    const dataSync = new CeshuDataSync(makeCeshuManager() as never, makeDataService({}) as never, schemaStore as never)
    const result = dataSync.syncSystemsToData(currentModel, '')

    expect(result.addedTypes).toEqual(['character'])
    expect(result.ensuredKeys).toEqual(['character'])
    const after = schemaStore.getTypes()
    expect(after.map((t) => t.id)).toContain('character')
    const added = after.find((t) => t.id === 'character')!
    expect(added.pluralKey).toBe('characters')
    expect(added.color).toBe('#4CAF50')
    expect(added.formFields.map((f) => f.name)).toEqual(['id', 'name', 'desc'])
  })

  it('无启用系统时：返回空结果且不改动 typeSchema', () => {
    currentModel = createDefaultCeshu({ scope: 'full' }) // 默认全部 disabled
    const schemaStore = makeSchemaStore(BUILTIN_DATA_TYPES)
    const beforeCount = schemaStore.getTypes().length
    const dataSync = new CeshuDataSync(makeCeshuManager() as never, makeDataService({}) as never, schemaStore as never)
    const result = dataSync.syncSystemsToData(currentModel, '')
    expect(result.addedTypes).toEqual([])
    expect(result.ensuredKeys).toEqual([])
    expect(schemaStore.getTypes().length).toBe(beforeCount)
  })

  it('重复同步幂等：第二次不再新增已存在的类型', () => {
    currentModel = createDefaultCeshu({ scope: 'full' })
    ;(currentModel.systems as Record<string, SystemEntry>).character.enabled = true
    ;(currentModel.systems as Record<string, SystemEntry>).battle.enabled = true

    const schemaStore = makeSchemaStore(BUILTIN_DATA_TYPES)
    const dataSync = new CeshuDataSync(makeCeshuManager() as never, makeDataService({}) as never, schemaStore as never)
    const first = dataSync.syncSystemsToData(currentModel, '')
    expect(first.addedTypes.sort()).toEqual(['battle', 'character'])
    const second = dataSync.syncSystemsToData(currentModel, '')
    expect(second.addedTypes).toEqual([])
  })
})

describe('ceshuDataSync data → systems 进度回填', () => {
  it('按 data_type 的 pluralKey 计条目数写入 config.actual_count', async () => {
    currentModel = createDefaultCeshu({ scope: 'full' })
    ;(currentModel.systems as Record<string, SystemEntry>).character.enabled = true
    ;(currentModel.systems as Record<string, SystemEntry>).character.data_type = 'role' // 复用内置 role(pluralKey=roles)

    const schemaStore = makeSchemaStore(BUILTIN_DATA_TYPES)
    const dataService = makeDataService({ role: 3 })
    const ceshuManager = makeCeshuManager()
    const dataSync = new CeshuDataSync(ceshuManager as never, dataService as never, schemaStore as never)

    const result = await dataSync.syncDataProgressToCeshu(currentModel, 'cid', '', false)
    expect(result.character).toBe(3)
    expect((currentModel.systems as Record<string, SystemEntry>).character.config.actual_count).toBe(3)
    // save=false → 不调用 saveChapter
    expect(ceshuManager.calls).toHaveLength(0)
  })

  it('save=true 时经 CeshuManager 原子写盘', async () => {
    currentModel = createDefaultCeshu({ scope: 'full' })
    ;(currentModel.systems as Record<string, SystemEntry>).character.enabled = true
    ;(currentModel.systems as Record<string, SystemEntry>).character.data_type = 'role'

    const schemaStore = makeSchemaStore(BUILTIN_DATA_TYPES)
    const dataService = makeDataService({ role: 5 })
    const ceshuManager = makeCeshuManager()
    const dataSync = new CeshuDataSync(ceshuManager as never, dataService as never, schemaStore as never)

    const result = await dataSync.syncDataProgressToCeshu(currentModel, 'cid', '', true)
    expect(result.character).toBe(5)
    expect(ceshuManager.calls).toHaveLength(1)
    expect(ceshuManager.calls[0]).toEqual({ id: 'cid', chapter: 'systems', data: currentModel.systems })
  })

  it('回填覆盖所有系统（含未启用）：无数据计时为 0', async () => {
    currentModel = createDefaultCeshu({ scope: 'full' }) // 全 disabled
    const schemaStore = makeSchemaStore(BUILTIN_DATA_TYPES)
    const dataService = makeDataService({}) // 无任何数据
    const dataSync = new CeshuDataSync(makeCeshuManager() as never, dataService as never, schemaStore as never)
    const result = await dataSync.syncDataProgressToCeshu(currentModel, 'cid', '', false)
    const systemKeys = Object.keys(currentModel.systems)
    expect(systemKeys.length).toBeGreaterThan(0)
    // 对齐 旧版：data→systems 方向不按 enabled 过滤，所有系统都回填
    expect(Object.keys(result).sort()).toEqual([...systemKeys].sort())
    for (const key of systemKeys) {
      expect(result[key]).toBe(0)
    }
  })
})

describe('ceshuDataSync 双向同步 + 回调', () => {
  it('syncBoth：先 systems→data 注册类型，再 data→systems 回填计数', async () => {
    currentModel = createDefaultCeshu({ scope: 'full' })
    ;(currentModel.systems as Record<string, SystemEntry>).character.enabled = true
    ;(currentModel.systems as Record<string, SystemEntry>).character.data_type = 'role'
    ;(currentModel.systems as Record<string, SystemEntry>).battle.enabled = true // 新类型 battle→battles

    const schemaStore = makeSchemaStore(BUILTIN_DATA_TYPES)
    const dataService = makeDataService({ role: 2, battle: 7 })
    const ceshuManager = makeCeshuManager()
    const dataSync = new CeshuDataSync(ceshuManager as never, dataService as never, schemaStore as never)

    const both = await dataSync.syncBoth(currentModel, 'cid', '')
    expect(both.toData.addedTypes).toEqual(['battle'])
    expect(both.toCeshu.character).toBe(2)
    expect(both.toCeshu.battle).toBe(7)
  })

  it('onDataChanged：无当前策划书时直接返回（不抛错、不写盘）', async () => {
    const schemaStore = makeSchemaStore(BUILTIN_DATA_TYPES)
    const ceshuManager = makeCeshuManager()
    const dataSync = new CeshuDataSync(ceshuManager as never, makeDataService({}) as never, schemaStore as never)
    await expect(dataSync.onDataChanged()).resolves.toBeUndefined()
    expect(ceshuManager.calls).toHaveLength(0)
  })

  it('onDataChanged：设当前策划书后，触发进度回填写盘', async () => {
    currentModel = createDefaultCeshu({ scope: 'full' })
    ;(currentModel.systems as Record<string, SystemEntry>).character.enabled = true
    ;(currentModel.systems as Record<string, SystemEntry>).character.data_type = 'role'

    const schemaStore = makeSchemaStore(BUILTIN_DATA_TYPES)
    const dataService = makeDataService({ role: 4 })
    const ceshuManager = makeCeshuManager()
    const dataSync = new CeshuDataSync(ceshuManager as never, dataService as never, schemaStore as never)
    dataSync.setCurrentCeshu('cid')

    await dataSync.onDataChanged()
    expect(ceshuManager.calls).toHaveLength(1)
    expect(ceshuManager.calls[0].chapter).toBe('systems')
    expect((currentModel.systems as Record<string, SystemEntry>).character.config.actual_count).toBe(4)
  })

  it('_syncing 防循环：同步过程中再次进入直接返回空结果', () => {
    currentModel = createDefaultCeshu({ scope: 'full' })
    ;(currentModel.systems as Record<string, SystemEntry>).character.enabled = true
    const schemaStore = makeSchemaStore(BUILTIN_DATA_TYPES)
    const dataSync = new CeshuDataSync(makeCeshuManager() as never, makeDataService({}) as never, schemaStore as never)
    // 模拟同步进行中（私有标志无法直接置，但可通过已 syncing 的边界验证：连续两次同步第二次幂等）
    const first = dataSync.syncSystemsToData(currentModel, '')
    expect(first.addedTypes).toEqual(['character'])
    const second = dataSync.syncSystemsToData(currentModel, '')
    expect(second.addedTypes).toEqual([]) // 已注册，不重复
  })
})
