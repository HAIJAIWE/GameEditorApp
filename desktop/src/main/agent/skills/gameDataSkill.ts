/**
 * `system.game_data` 内置技能（对应 Python `core/agent/skills/game_data_skill.py` 的最小集）。
 *
 * A1-1 只实现「读 + 写」两条最小通路：`list_types` / `list` / `query` / `create` / `update`。
 * **未移植**（属 A1-5 业务接线范畴）：`delete` / `batch_create` / `batch_update` /
 * `switch_tab` / `switch_library` / `load_library` —— 它们都依赖 PyQt 主窗口或库管理器。
 *
 * 文案约定：与 Python 能对齐的（`缺少 data_type 参数`、`找不到名称「x」对应的条目…`）逐字对齐；
 * Python 里依赖 `dm.data` 字典形态的消息（如 `可用类型: <复数键>`）在本侧按 TS 类型表重写。
 */

import type { SkillExecutionContext, SkillProtocol, SkillResult } from '../../../shared/agent/protocol'
import type { DataService } from '../../data/service'
import type { TypeSchemaStore } from '../../schema/store'
import type { ItemRecord } from '../../../shared/types'

const ACTIONS = ['list_types', 'list', 'query', 'create', 'update', 'delete'] as const

const DEFAULT_LIMIT = 20

interface ResolvedType {
  /**
   * 数据表实际存储键 = `DataTypeDef.id`（**单数**，如 `role`）。
   * 注意：不是 `pluralKey`（`roles`）——SQLite 里 `items.type` 存的是单数 id
   * （`legacyImport` 把旧复数键映射为 `typeDef.id`，渲染层也用 `activeType = type.id`）。
   */
  key: string
  label: string
}

export function createGameDataSkill(deps: {
  dataService: DataService
  typeSchemaStore: TypeSchemaStore
}): SkillProtocol {
  const { dataService, typeSchemaStore } = deps

  /** 单数/复数类型名 → {key(单数 id), label}；无法识别返回 null */
  function resolveType(raw: string): ResolvedType | null {
    const needle = raw.toLowerCase().trim()
    if (needle === '') return null
    const types = typeSchemaStore.getTypes()
    const byId = types.find((type) => type.id === needle)
    if (byId) return { key: byId.id, label: byId.name }
    const byPlural = types.find((type) => type.pluralKey === needle)
    if (byPlural) return { key: byPlural.id, label: byPlural.name }
    return null
  }

  function availableSingles(): string {
    return typeSchemaStore
      .getTypes()
      .map((type) => type.id)
      .join(', ')
  }

  function resolveLimit(params: Record<string, unknown>): number {
    const raw = params.limit
    const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
    if (!Number.isFinite(value) || value <= 0) return DEFAULT_LIMIT
    return Math.trunc(value)
  }

  function itemName(item: { data: Record<string, unknown>; id: string }): string {
    const name = item.data.name
    return typeof name === 'string' && name !== '' ? name : item.id
  }

  function fail(error: string): SkillResult {
    return { success: false, error, message: '' }
  }

  function listTypes(): SkillResult {
    const types = typeSchemaStore.getTypes()
    const summary = types.map((type) => `${type.name} ${type.id}`).join('、')
    return {
      success: true,
      message: `可用数据类型（${types.length} 种）：${summary}`,
      data: types.map((type) => ({ id: type.id, name: type.name, pluralKey: type.pluralKey }))
    }
  }

  function listItems(params: Record<string, unknown>): SkillResult {
    const rawType = typeof params.data_type === 'string' ? params.data_type : ''
    if (rawType === '') return fail('缺少 data_type 参数')
    const resolved = resolveType(rawType)
    if (resolved === null) {
      return fail(`未知数据类型: ${rawType}。可用类型: ${availableSingles()}`)
    }
    const items = dataService.listItems(resolved.key).slice(0, resolveLimit(params))
    return {
      success: true,
      message: `共 ${items.length} 条${resolved.label}数据`,
      data: items
    }
  }

  function queryItems(params: Record<string, unknown>): SkillResult {
    const rawType = typeof params.data_type === 'string' ? params.data_type : ''
    if (rawType === '') {
      return fail(`缺少 data_type 参数。可用类型: ${availableSingles()}`)
    }
    const resolved = resolveType(rawType)
    if (resolved === null) {
      return fail(`未知数据类型: ${rawType}。可用类型: ${availableSingles()}`)
    }
    const keyword = typeof params.keyword === 'string' ? params.keyword.trim().toLowerCase() : ''
    const all = dataService.listItems(resolved.key)
    const matched = keyword === ''
      ? all
      : all.filter((item) => itemName(item).toLowerCase().includes(keyword))
    const limited = matched.slice(0, resolveLimit(params))
    return {
      success: true,
      message:
        keyword === ''
          ? `共 ${limited.length} 条${resolved.label}数据`
          : `找到 ${limited.length} 条匹配「${params.keyword as string}」的${resolved.label}数据`,
      data: limited
    }
  }

  function createItem(params: Record<string, unknown>): SkillResult | Promise<SkillResult> {
    const rawType = typeof params.data_type === 'string' ? params.data_type : ''
    if (rawType === '') {
      return fail(`缺少 data_type 参数。可用类型: ${availableSingles()}`)
    }
    const resolved = resolveType(rawType)
    if (resolved === null) {
      return fail(`未知数据类型: ${rawType}。可用类型: ${availableSingles()}`)
    }
    const rawName = typeof params.name === 'string' ? params.name.trim() : ''
    const name = rawName === '' ? resolved.label : rawName
    const patch = params.data !== null && typeof params.data === 'object' && !Array.isArray(params.data)
      ? (params.data as Record<string, unknown>)
      : {}

    const existing = dataService.listItems(resolved.key)
    const duplicate = existing.find((item) => itemName(item) === name)
    if (duplicate !== undefined) {
      return fail(`已存在名为【${name}】的${resolved.label}条目（id=${duplicate.id}），请用 action=update 而不是 create。`)
    }

    // createItem 是异步写；技能允许返回 Promise
    return createItemAsync(resolved, name, patch)
  }

  async function createItemAsync(
    resolved: ResolvedType,
    name: string,
    patch: Record<string, unknown>
  ): Promise<SkillResult> {
    const item = await dataService.createItem({ type: resolved.key, data: { ...patch, name } })
    return {
      success: true,
      message: `已创建${resolved.label}【${name}】（id=${item.id}）`,
      data: item
    }
  }

  function updateItem(params: Record<string, unknown>): SkillResult | Promise<SkillResult> {
    const patch: Record<string, unknown> =
      params.data !== null && typeof params.data === 'object' && !Array.isArray(params.data)
        ? { ...(params.data as Record<string, unknown>) }
        : {}
    if (typeof params.field === 'string' && params.field !== '') {
      patch[params.field] = params.value
    }
    if (Object.keys(patch).length === 0) {
      return fail('缺少要修改的字段名 (field 参数) 或 data 对象')
    }

    const itemId = typeof params.item_id === 'string' ? params.item_id.trim() : ''
    const name = typeof params.name === 'string' ? params.name.trim() : ''
    const rawType = typeof params.data_type === 'string' ? params.data_type : ''
    const resolved = rawType !== '' ? resolveType(rawType) : null
    if (rawType !== '' && resolved === null) {
      return fail(`未知数据类型: ${rawType}。可用类型: ${availableSingles()}`)
    }

    if (itemId !== '') {
      const target = dataService.listAllItems().find((item) => item.id === itemId)
      if (target === undefined) return fail(`条目 ${itemId} 不存在`)
      return updateItemAsync(itemId, target.type, patch, itemName(target))
    }

    if (name === '') {
      return fail('无法确定要修改的数据类型。请提供 data_type 参数（如 role/skill/item 等）')
    }

    // 按名称定位：限定 data_type 时只查该类型，否则跨全部类型查
    const candidates = resolved !== null
      ? dataService.listItems(resolved.key)
      : dataService.listAllItems()
    const found = candidates.find((item) => itemName(item) === name)
    if (found === undefined) {
      return fail(`找不到名称「${name}」对应的条目。请检查名称是否正确，或提供 data_type 缩小范围。`)
    }
    return updateItemAsync(found.id, found.type, patch, name)
  }

  async function updateItemAsync(
    id: string,
    type: string,
    patch: Record<string, unknown>,
    displayName: string
  ): Promise<SkillResult> {
    const updated = await dataService.updateItem(id, patch)
    const label = typeSchemaStore.getTypes().find((entry) => entry.id === type)?.name ?? type
    return {
      success: true,
      message: `已修改${label}【${displayName}】（id=${id}）`,
      data: updated
    }
  }

  /**
   * 删除条目：**破坏性动作，未带 `confirm: true` 时返回 confirm 交互**（对齐 Python
   * `game_data_skill.py:413` 的 `needs_confirm`，但 TS 侧该标志真的有消费者——Brain 会暂停询问，
   * 批准后带 `confirm: true` 重执行）。
   */
  function deleteItem(params: Record<string, unknown>): SkillResult | Promise<SkillResult> {
    const itemId = typeof params.item_id === 'string' ? params.item_id.trim() : ''
    const name = typeof params.name === 'string' ? params.name.trim() : ''
    const rawType = typeof params.data_type === 'string' ? params.data_type : ''
    const resolved = rawType !== '' ? resolveType(rawType) : null
    if (rawType !== '' && resolved === null) {
      return fail(`未知数据类型: ${rawType}。可用类型: ${availableSingles()}`)
    }

    let target: ItemRecord | undefined
    if (itemId !== '') {
      target = dataService.listAllItems().find((item) => item.id === itemId)
      if (target === undefined) return fail(`条目 ${itemId} 不存在`)
    } else if (name !== '') {
      const candidates = resolved !== null ? dataService.listItems(resolved.key) : dataService.listAllItems()
      target = candidates.find((item) => itemName(item) === name)
      if (target === undefined) {
        return fail(`找不到名称「${name}」对应的条目。请检查名称是否正确，或提供 data_type 缩小范围。`)
      }
    } else {
      return fail('找不到要删除的条目。请提供 name 参数（如 \'name\':\'火系法师\'）或 item_id 参数。')
    }

    const label = typeSchemaStore.getTypes().find((entry) => entry.id === target?.type)?.name ?? target.type
    const displayName = itemName(target)

    if (params.confirm !== true) {
      const prompt = `确认删除${label}【${displayName}】？此操作不可撤销。`
      return {
        success: false,
        message: '',
        error: `[WARN] ${prompt}`,
        interaction: { kind: 'confirm', prompt }
      }
    }

    return deleteItemAsync(target.id, label, displayName)
  }

  async function deleteItemAsync(id: string, label: string, displayName: string): Promise<SkillResult> {
    const deleted = await dataService.deleteItem(id)
    if (!deleted) return fail(`条目 ${id} 不存在`)
    return { success: true, message: `已删除${label}【${displayName}】（id=${id}）`, data: null }
  }

  function run(params: Record<string, unknown>, _ctx: SkillExecutionContext): SkillResult | Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    switch (action) {
      case 'list_types':
        return listTypes()
      case 'list':
        return listItems(params)
      case 'query':
        return queryItems(params)
      case 'create':
        return createItem(params)
      case 'update':
        return updateItem(params)
      case 'delete':
        return deleteItem(params)
      default:
        return fail(`未知动作: ${action}`)
    }
  }

  return {
    id: 'system.game_data',
    description: '游戏数据增删改查操作（列表/查询/创建/修改游戏条目）。',
    version: '1.0.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ACTIONS,
          description:
            '操作类型: list_types=列出数据类型, list=列出条目, query=按名称查询, create=创建条目, update=修改条目, delete=删除条目（需用户确认）'
        },
        data_type: {
          type: 'string',
          description: '数据类型英文键（单数或复数）: role/skill/monster/item/equip 等'
        },
        item_id: { type: 'string', description: '条目 ID（update 时使用）' },
        name: { type: 'string', description: '条目名称（create/update 时使用）' },
        keyword: { type: 'string', description: '查询关键词（query 时使用）' },
        data: { type: 'object', description: '数据属性对象，如 {"attack":100,"defense":50}' },
        field: { type: 'string', description: '要修改的字段名（update 时使用）' },
        value: { type: 'string', description: '字段新值（update 配合 field 使用）' },
        confirm: { type: 'boolean', description: '删除确认标记（delete 时由系统在用户确认后置为 true）' },
        limit: { type: 'integer', description: '返回条数上限', default: DEFAULT_LIMIT }
      },
      required: ['action']
    },
    execute: run
  }
}
