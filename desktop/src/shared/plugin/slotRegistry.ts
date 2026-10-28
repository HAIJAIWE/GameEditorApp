/**
 * Slot 注册表（借 dsh `ui-slots` 的 typed slot 内核，零框架依赖、可纯逻辑单测）。
 *
 * 与 dsh 的对应关系：
 * - `declare(key, spec)` = 父级/根声明 slot；**声明即认领**（同一 key 只有一个 declarer）。
 * - `register(input)` = 往已声明 slot 注册一个条目；`children` 在注册时声明子 slot。
 * - 四类基数：`single`(单占位) / `list`(有序列表) / `keyed`(按 key 分发) / `chain`(选举)。
 * - **遮蔽**：同 cell 多条目按 `priority` 升序，最低者渲染（同优先级先注册者胜）。
 * - **disposer**：移除条目并**递归释放**它声明的子 slot（一个生命周期轴，无悬挂状态）。
 * - **store seat**：每条注册可挂一个 `SlotStoreDecl`，懒创建独立 store 实例。
 *
 * 与 dsh 的差异（诚实）：MVP 只做 `scope: 'root'` 的渲染读；`session` 作用域预留未接线。
 * 纯函数层不做 React——渲染由宿主侧 `<SlotOutlet>` 消费 `entriesOfSlot()` 完成。
 */

import type { SlotKind, SlotScope, SlotSpec, SlotStoreDecl } from './types'

/** Slot 相关错误基类 */
export class SlotError extends Error {}

/** 声明类错误：注册进未声明 slot / 重复声明同一 key */
export class SlotDeclarationError extends SlotError {}

/** 注册类错误：kind 约束不满足（list 缺 entryId / keyed 缺 entryKey / chain 缺 select） */
export class SlotRegistrationError extends SlotError {}

/** 一条已注册的 slot 条目（宿主/渲染层只读消费） */
export interface SlotEntry {
  readonly id: string
  readonly key: string
  readonly kind: SlotKind
  readonly scope: SlotScope
  readonly priority: number
  readonly order: number
  /** list 的条目 id / keyed 的分派键 */
  readonly entryKey?: string
  /** 归属插件 id（禁用时清理用） */
  readonly ownerId?: string
  /** 展示体（`slot` 能力是 UiNode；`sidebar` 桥接时是 `PluginSidebarItem`——故为 unknown，由消费者收窄） */
  readonly payload: unknown
  readonly select?: (owner: unknown) => unknown | null | undefined
  readonly store?: SlotStoreDecl
  /** 该条目声明（并认领）的子 slot key 列表 */
  readonly declaredChildren: readonly string[]
  /** 注册顺序（稳定排序兜底） */
  readonly registrationOrder: number
  /** 懒创建的 store 实例（首次 storeOf 时赋值） */
  storeInstance?: SlotStoreInstance
}

/** store seat 实例：读快照 / 订阅 / 动作（供 uSES 消费） */
export interface SlotStoreInstance<S = unknown> {
  getSnapshot(): S
  subscribe(listener: () => void): () => void
  actions: Record<string, (...args: unknown[]) => void>
}

/** 注册输入（由 `PluginSlotCapability` 映射而来） */
export interface SlotRegistrationInput {
  key: string
  kind?: SlotKind
  priority?: number
  order?: number
  entryKey?: string
  ownerId?: string
  payload: unknown
  select?: (owner: unknown) => unknown | null | undefined
  store?: SlotStoreDecl
  children?: Record<string, SlotSpec>
}

/** chain 选举结果 */
export interface ChainOutcome {
  entry: SlotEntry
  matched: unknown
}

/** 根声明：应用已知的顶层 slot（由宿主在构造时注入，作为「根 shell 的声明」）。 */
export const ROOT_SLOT_DECLARATIONS: ReadonlyArray<{ key: string; spec: SlotSpec }> = [
  { key: 'app.header', spec: { kind: 'single' } },
  { key: 'app.sidebar', spec: { kind: 'list' } },
  { key: 'app.main', spec: { kind: 'single' } },
  { key: 'app.rightPanel', spec: { kind: 'single' } },
  { key: 'app.statusbar', spec: { kind: 'list' } },
  { key: 'conversation.composer', spec: { kind: 'chain' } },
  { key: 'tool.call.toolview', spec: { kind: 'keyed' } }
]

/** 比较优先级：越小越优先；同优先级先注册者胜（返回 <0 表示 a 更优） */
function comparePriority(a: SlotEntry, b: SlotEntry): number {
  if (a.priority !== b.priority) return a.priority - b.priority
  return a.registrationOrder - b.registrationOrder
}

function createStore<S>(decl: SlotStoreDecl<S>): SlotStoreInstance<S> {
  let state: S = typeof decl.init === 'function' ? (decl.init as () => S)() : decl.init
  const listeners = new Set<() => void>()
  const actions: Record<string, (...args: unknown[]) => void> = {}
  for (const [name, fn] of Object.entries(decl.actions ?? {})) {
    actions[name] = (...args: unknown[]): void => {
      const next = (fn as (state: S, ...rest: unknown[]) => S | void)(state, ...args)
      if (next !== undefined) state = next
      for (const listener of listeners) listener()
    }
  }
  return {
    getSnapshot: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    actions
  }
}

export class SlotRegistry {
  private readonly declarations = new Map<string, { spec: SlotSpec; declaredBy: string }>()
  private readonly entriesByKey = new Map<string, SlotEntry[]>()
  private readonly listeners = new Set<(key: string) => void>()
  private readonly keyListeners = new Map<string, Set<() => void>>()
  private readonly versions = new Map<string, number>()
  private seq = 0

  constructor(rootDeclarations: ReadonlyArray<{ key: string; spec: SlotSpec }> = ROOT_SLOT_DECLARATIONS) {
    for (const { key, spec } of rootDeclarations) this.declare(key, spec, '(root)')
  }

  /** 声明一个 slot key（声明即认领；重复声明抛错）。 */
  declare(key: string, spec: SlotSpec, declaredBy = '(root)'): void {
    const prev = this.declarations.get(key)
    if (prev !== undefined) {
      throw new SlotDeclarationError(`slot "${key}" is already declared by ${prev.declaredBy}`)
    }
    this.declarations.set(key, { spec, declaredBy })
    this.bump(key)
  }

  isDeclared(key: string): boolean {
    return this.declarations.has(key)
  }

  specOf(key: string): SlotSpec | undefined {
    return this.declarations.get(key)?.spec
  }

  /** 注册一个条目；返回幂等 disposer（移除条目 + 递归释放其声明的子 slot）。 */
  register(input: SlotRegistrationInput): () => void {
    const decl = this.declarations.get(input.key)
    if (decl === undefined) {
      throw new SlotDeclarationError(`slot "${input.key}" is not declared (a parent's children table must declare it)`)
    }
    const kind = input.kind ?? decl.spec.kind
    if (kind === 'list' && input.entryKey === undefined) {
      throw new SlotRegistrationError(`list slot "${input.key}" requires entryId`)
    }
    if (kind === 'keyed' && input.entryKey === undefined) {
      throw new SlotRegistrationError(`keyed slot "${input.key}" requires entryKey`)
    }
    if (kind === 'chain' && typeof input.select !== 'function') {
      throw new SlotRegistrationError(`chain slot "${input.key}" requires select`)
    }

    // 声明子 slot（声明即认领）——失败则回滚已声明的子 slot
    const declaredChildren: string[] = []
    try {
      for (const [childKey, childSpec] of Object.entries(input.children ?? {})) {
        this.declare(childKey, childSpec, `slot "${input.key}"`)
        declaredChildren.push(childKey)
      }
    } catch (error) {
      for (const childKey of declaredChildren) this.declarations.delete(childKey)
      throw error
    }

    const registrationOrder = ++this.seq
    const entry: SlotEntry = {
      id: `${input.key}#${registrationOrder}`,
      key: input.key,
      kind,
      scope: decl.spec.scope ?? 'root',
      priority: input.priority ?? 0,
      order: input.order ?? 0,
      ...(input.entryKey !== undefined ? { entryKey: input.entryKey } : {}),
      ...(input.ownerId !== undefined ? { ownerId: input.ownerId } : {}),
      payload: input.payload,
      ...(input.select !== undefined ? { select: input.select } : {}),
      ...(input.store !== undefined ? { store: input.store } : {}),
      declaredChildren,
      registrationOrder
    }
    const list = this.entriesByKey.get(input.key)
    if (list === undefined) this.entriesByKey.set(input.key, [entry])
    else list.push(entry)
    this.bump(input.key)

    let disposed = false
    return () => {
      if (disposed) return
      disposed = true
      const current = this.entriesByKey.get(input.key)
      if (current !== undefined) {
        const index = current.indexOf(entry)
        if (index >= 0) current.splice(index, 1)
        if (current.length === 0) this.entriesByKey.delete(input.key)
      }
      for (const childKey of declaredChildren) this.releaseKey(childKey)
      this.bump(input.key)
    }
  }

  /** 移除某 key 下全部条目并递归释放其声明的子 slot 与声明本身。 */
  private releaseKey(key: string): void {
    const list = this.entriesByKey.get(key)
    if (list !== undefined) {
      const children = list.flatMap((entry) => entry.declaredChildren)
      this.entriesByKey.delete(key)
      for (const childKey of children) this.releaseKey(childKey)
    }
    this.declarations.delete(key)
    this.bump(key)
  }

  /** 某 key 的全部条目（未遮蔽，按注册顺序）。 */
  entriesOf(key: string): SlotEntry[] {
    return [...(this.entriesByKey.get(key) ?? [])]
  }

  /**
   * 渲染读：按 kind 投影出「该渲染的条目」。
   * - `single`：最低优先级一条；
   * - `list`：每个 `entryKey`（id）的最低优先级一条，按 `order` 升序；
   * - `keyed`：每个 `entryKey` 的最低优先级一条；
   * - `chain`：全部（由 `chainWinner` 选举）。
   */
  entriesOfSlot(key: string): SlotEntry[] {
    const all = this.entriesOf(key)
    if (all.length === 0) return []
    const kind = all[0]?.kind ?? 'single'
    if (kind === 'chain') return all.slice().sort(comparePriority)
    const byCell = new Map<string, SlotEntry>()
    for (const entry of all) {
      const cell = kind === 'list' || kind === 'keyed' ? (entry.entryKey ?? '') : ''
      const prev = byCell.get(cell)
      if (prev === undefined || comparePriority(entry, prev) < 0) byCell.set(cell, entry)
    }
    const winners = [...byCell.values()]
    if (kind === 'list') {
      winners.sort((a, b) => a.order - b.order || a.registrationOrder - b.registrationOrder)
    } else {
      winners.sort((a, b) => a.registrationOrder - b.registrationOrder)
    }
    return winners
  }

  /** chain 选举：按优先级升序，第一个 `select` 返回非 null/undefined 者胜出。 */
  chainWinner(key: string, owner: unknown): ChainOutcome | null {
    for (const entry of this.entriesOfSlot(key)) {
      if (typeof entry.select !== 'function') continue
      const matched = entry.select(owner)
      if (matched !== null && matched !== undefined) return { entry, matched }
    }
    return null
  }

  /** 取某条目的 store 实例（懒创建）；未声明 store 返回 undefined。 */
  storeOf(entry: SlotEntry): SlotStoreInstance | undefined {
    if (entry.store === undefined) return undefined
    if (entry.storeInstance === undefined) entry.storeInstance = createStore(entry.store)
    return entry.storeInstance
  }

  /** 某 key 的单调版本号（供 uSES 作稳定快照）。 */
  versionOf(key: string): number {
    return this.versions.get(key) ?? 0
  }

  /** 订阅任意 key 变更。 */
  subscribe(listener: (key: string) => void): () => void {
    this.listeners.add(listener)
    return () => {
      this.listeners.delete(listener)
    }
  }

  /** 订阅单个 key 变更。 */
  subscribeKey(key: string, listener: () => void): () => void {
    let set = this.keyListeners.get(key)
    if (set === undefined) {
      set = new Set()
      this.keyListeners.set(key, set)
    }
    set.add(listener)
    return () => {
      set?.delete(listener)
    }
  }

  /** 清空全部条目与声明（测试/重建用）。 */
  clear(): void {
    this.entriesByKey.clear()
    this.declarations.clear()
    this.versions.clear()
  }

  private bump(key: string): void {
    this.versions.set(key, (this.versions.get(key) ?? 0) + 1)
    const keySet = this.keyListeners.get(key)
    if (keySet !== undefined) for (const listener of keySet) listener()
    for (const listener of this.listeners) listener(key)
  }
}
