/**
 * 策划书 ↔ 游戏数据 双向同步协调器。
 *
 * 迁移要点：
 *  - 旧版 用全局 EventBus（data_changed / ceshu_changed / library_switched）；TS 侧无全局事件总线，
 *    改为在相关 IPC 处理里显式调用 `onDataChanged` / `onCeshuChanged`（见 main/ipc.ts）。
 *  - 旧版 的「确保 default.json 有复数键数组」在 TS 的 SQLite 数据层是隐式的（按 type 查表，无行即空），
 *    故 `_ensure_data_keys` 仅产出复数键清单（保证 typeSchemaStore 已含该类型即可），不做数据写入。
 *  - 其余语义（systems→data 注册类型、data→systems 回填 actual_count、_syncing 防循环）逐条对齐。
 *
 * 设计原则：
 *  - 策划书优先：systems 配置不被数据覆盖，但可创建空白数据结构（此处为空白类型）；
 *  - 不自动创建具体数据条目（避免污染用户数据）；
 *  - 失败不抛异常，仅记录日志（同步是辅助功能，不应阻塞主流程）。
 *
 * 注：`library` 参数保留以对齐 旧版 签名与未来多库支持；TS 各 store 已按 userData 路径隔离，
 * 当前实现不依赖该参数（以 `_` 前缀标记未使用）。
 */

import type { CeshuDocument, ChapterData, SystemEntry } from '../../shared/ceshu/reference/ceshuConstants'
import { SYSTEM_LABELS } from '../../shared/ceshu/reference/ceshuConstants'
import { isPlainObject } from '../../shared/ceshu/model/ceshuModel'
import type { CeshuManager } from './manager'
import type { DataService } from '../data/service'
import type { TypeSchemaStore } from '../schema/store'
import type { DataTypeDef } from '../../shared/types'

/** systems→data 同步结果 */
export interface SyncToDataResult {
  /** 新增注册到 type_schema 的数据类型 id */
  addedTypes: string[]
  /** 已确保存在的数据键（**单数类型 id** 清单，与 DataService.listItems 入参一致） */
  ensuredKeys: string[]
  /** 过程中的错误信息（不抛出） */
  errors: string[]
}

/** data→systems 同步结果：系统键 → 实际条目数 */
export type SyncToCeshuResult = Record<string, number>

/** 单个启用系统解析出的（data_type, 展示名, 复数键）三元组 */
interface EnabledType {
  key: string
  dataType: string
  displayName: string
  pluralKey: string
}

/** 新建类型的默认配色 */
const DEFAULT_NEW_TYPE_COLOR = '#4CAF50'

export class CeshuDataSync {
  private syncing = false
  private currentCeshuId: string | null = null
  private currentLibrary = ''

  constructor(
    private readonly ceshuManager: CeshuManager,
    private readonly dataService: DataService,
    private readonly typeSchemaStore: TypeSchemaStore
  ) {}

  /** 设置当前活跃策划书（用于精确响应数据变更事件） */
  setCurrentCeshu(ceshuId: string, library = ''): void {
    this.currentCeshuId = ceshuId
    this.currentLibrary = library
  }

  /** 库切换 → 重置当前策划书上下文 */
  clearCurrentCeshu(): void {
    this.currentCeshuId = null
    this.currentLibrary = ''
  }

  /**
   * 方向 1：策划书 systems → 游戏数据结构。
   * 确保启用系统对应的 data_type 已注册进 typeSchemaStore，并产出对应的复数键清单。
   */
  syncSystemsToData(model: CeshuDocument, _library = ''): SyncToDataResult {
    const result: SyncToDataResult = { addedTypes: [], ensuredKeys: [], errors: [] }
    if (this.syncing) return result
    this.syncing = true
    try {
      const enabledTypes = this.collectEnabledTypes(model)
      if (enabledTypes.length === 0) return result

      result.addedTypes = this.ensureTypeSchema(enabledTypes)
      result.ensuredKeys = this.ensureDataKeys(enabledTypes)
    } catch (error) {
      result.errors.push(error instanceof Error ? error.message : String(error))
    } finally {
      this.syncing = false
    }
    return result
  }

  /**
   * 方向 2：游戏数据条目数 → 策划书 systems 配置。
   * 将各类型的实际条目数回填到 model.systems[key].config.actual_count。
   * save=true 时经 CeshuManager 原子写盘（需提供 ceshuId）。
   */
  async syncDataProgressToCeshu(
    model: CeshuDocument,
    ceshuId: string | null,
    _library = '',
    save = false
  ): Promise<SyncToCeshuResult> {
    const result: SyncToCeshuResult = {}
    if (this.syncing) return result
    this.syncing = true
    try {
      for (const [key, entryRaw] of Object.entries(model.systems)) {
        if (!isSystemEntry(entryRaw)) continue
        const entry = entryRaw as SystemEntry
        // 数据表以**单数类型 id**（如 role）为键，不是 pluralKey（roles）——
        // SQLite 的 items.type 存单数 id（legacyImport 把旧复数键映射为 typeDef.id）
        const dataType = typeof entry.data_type === 'string' && entry.data_type ? entry.data_type : key
        const count = this.dataService.listItems(dataType).length

        if (!isPlainObject(entry.config)) entry.config = {}
        entry.config.actual_count = count
        result[key] = count
      }

      if (save && ceshuId) {
        await this.ceshuManager.saveChapter(ceshuId, 'systems', model.systems as ChapterData)
      }
    } catch {
      // 同步是辅助功能，失败不阻塞主流程
    } finally {
      this.syncing = false
    }
    return result
  }

  /** 双向同步：先 systems→data，再 data→systems 进度回填 */
  async syncBoth(
    model: CeshuDocument,
    ceshuId: string | null,
    library = ''
  ): Promise<{ toData: SyncToDataResult; toCeshu: SyncToCeshuResult }> {
    const toData = this.syncSystemsToData(model, library)
    const toCeshu = await this.syncDataProgressToCeshu(model, ceshuId, library, true)
    return { toData, toCeshu }
  }

  /** 数据变更回调：回填进度到当前策划书 */
  async onDataChanged(): Promise<void> {
    if (this.syncing) return
    if (!this.currentCeshuId) return
    try {
      const model = this.ceshuManager.get(this.currentCeshuId)
      await this.syncDataProgressToCeshu(model, this.currentCeshuId, this.currentLibrary, true)
    } catch {
      // 同步是辅助功能，失败不阻塞主流程
    }
  }

  /** 策划书变更回调：确保数据结构存在 */
  onCeshuChanged(ceshuId: string, library = ''): void {
    if (this.syncing) return
    try {
      const model = this.ceshuManager.get(ceshuId)
      this.syncSystemsToData(model, library)
    } catch {
      // 同步是辅助功能，失败不阻塞主流程
    }
  }

  /** 解析启用系统的 (data_type, 展示名, 复数键) */
  private collectEnabledTypes(model: CeshuDocument): EnabledType[] {
    const types = this.typeSchemaStore.getTypes()
    const pluralById = new Map(types.map((type) => [type.id, type.pluralKey]))
    const result: EnabledType[] = []

    for (const [key, entryRaw] of Object.entries(model.systems)) {
      if (!isSystemEntry(entryRaw)) continue
      const entry = entryRaw as SystemEntry
      if (entry.enabled !== true) continue
      const dataType = typeof entry.data_type === 'string' && entry.data_type ? entry.data_type : key
      const displayName = typeof entry.name === 'string' && entry.name ? entry.name : SYSTEM_LABELS[key] ?? key
      const pluralKey = pluralById.get(dataType) ?? `${dataType}s`
      result.push({ key, dataType, displayName, pluralKey })
    }
    return result
  }

  /** 确保启用的 data_type 已注册进 type_schema（动态注册缺失类型） */
  private ensureTypeSchema(enabledTypes: EnabledType[]): string[] {
    const types = this.typeSchemaStore.getTypes()
    const existingIds = new Set(types.map((type) => type.id))
    const toAdd: DataTypeDef[] = []

    for (const { dataType, displayName, pluralKey } of enabledTypes) {
      if (existingIds.has(dataType)) continue
      toAdd.push({
        id: dataType,
        name: displayName,
        pluralKey,
        color: DEFAULT_NEW_TYPE_COLOR,
        formFields: [
          { name: 'id', label: 'ID:', type: 'entry', editable: false },
          { name: 'name', label: `${displayName}名称:`, type: 'entry', editable: true },
          { name: 'desc', label: '描述:', type: 'desc', editable: true }
        ]
      })
      existingIds.add(dataType)
    }

    if (toAdd.length === 0) return []
    this.typeSchemaStore.saveTypes([...types, ...toAdd])
    return toAdd.map((type) => type.id)
  }

  /**
   * 确保数据层存在对应类型键（TS 数据层按单数 id 隐式存在，仅产出清单）。
   * 键取**单数类型 id**，与 `DataService.listItems` 的入参口径一致。
   */
  private ensureDataKeys(enabledTypes: EnabledType[]): string[] {
    const ensured: string[] = []
    for (const { dataType } of enabledTypes) {
      if (!ensured.includes(dataType)) ensured.push(dataType)
    }
    return ensured
  }
}

function isSystemEntry(value: unknown): value is SystemEntry {
  return isPlainObject(value)
}
