import type { PluginCapability, PluginCapabilityKind, PluginManifest } from './types'

/**
 * 插件宿主：管理插件的注册与生命周期（dsh 风格 install → activate → disable）。
 *
 * 纯 TS、无 React 依赖，可在主进程或渲染进程实例化。UI 能力（panel/command/view）
 * 由渲染进程宿主解读；service 能力可在任意进程提供，供其他插件调用。
 *
 * 设计取舍（借 dsh 的成熟模式，不含其 pnpm 包市场 machinery）：
 * - **非致命激活**：`activate` 钩子抛错只把插件标 `status:'error'`，宿主照常跑；
 *   坏插件在清单里可见、不可启用（dsh "A broken bundle cannot be enabled"）。
 * - **声明式持久化**：启用/禁用只记录「偏离默认（禁用）」的覆写，重启保留。
 *   持久化通过注入的 `PluginPersistence` 解耦（宿主决定落地 localStorage / IPC / 文件）。
 */

/** 宿主当前版本；插件 `engines.host` 与之比对（只比主版本，避免无谓的破坏性门槛）。 */
export const HOST_VERSION = '0.1.0'

/** 插件运行时状态：启用 / 禁用 / 激活失败（坏插件） */
export type PluginStatus = 'enabled' | 'disabled' | 'error'

/** 启用/禁用持久化接口（宿主注入；宿主无关核心不碰 IO）。 */
export interface PluginPersistence {
  /** 返回 id→disabled 的覆写表；无持久化返回 null */
  load(): Record<string, boolean> | null
  /** 落盘覆写表（仅记录被显式禁用的 id） */
  save(map: Record<string, boolean>): void
}

export interface PluginHostOptions {
  persistence?: PluginPersistence
}

export interface RegisteredPlugin {
  manifest: PluginManifest
  enabled: boolean
  status: PluginStatus
  registeredAt: number
  /** 最近一次激活（enable）时间戳；禁用/错误后为 null */
  activatedAt: number | null
  /** 激活失败时的错误信息；status==='error' 时存在 */
  error?: string
}

function majorOf(version: string): number | null {
  const value = Number.parseInt(version.split('.')[0] ?? '', 10)
  return Number.isNaN(value) ? null : value
}

export class PluginHost {
  private readonly plugins = new Map<string, RegisteredPlugin>()
  private readonly listeners = new Set<() => void>()
  private activePanelId: string | null = null
  /**
   * 面板打开参数：panelId → params（Slice 3）。
   * 契约只认 `unknown`——宿主无关核心不引入任何业务类型，类型断言留给面板绑定（渲染层）。
   */
  private readonly paramsByPanel = new Map<string, unknown>()
  private readonly persistence: PluginPersistence | null
  /** 覆写表：id → 是否禁用（true=禁用）。仅记录偏离默认的项 */
  private readonly overrides: Record<string, boolean>

  constructor(options: PluginHostOptions = {}) {
    this.persistence = options.persistence ?? null
    this.overrides = this.persistence?.load() ?? {}
  }

  /**
   * 注册插件（dsh 的 install）。重复 id 抛错；`engines.host` 要求的主版本高于宿主则拒绝。
   * 若存在持久化覆写且标记为禁用，则初始为 disabled；否则 enabled。
   * 若 manifest 声明 `activate`，同步执行一次——失败仅标 error，不影响宿主。
   */
  register(manifest: PluginManifest): void {
    if (this.plugins.has(manifest.id)) {
      throw new Error(`plugin "${manifest.id}" already registered`)
    }
    const required = majorOf(manifest.engines?.host ?? '')
    const current = majorOf(HOST_VERSION)
    if (required !== null && current !== null && required > current) {
      throw new Error(
        `plugin "${manifest.id}" requires host v${manifest.engines?.host} but running v${HOST_VERSION}`
      )
    }

    const overriddenDisabled = this.overrides[manifest.id] === true
    const record: RegisteredPlugin = {
      manifest,
      enabled: !overriddenDisabled,
      status: overriddenDisabled ? 'disabled' : 'enabled',
      registeredAt: Date.now(),
      activatedAt: overriddenDisabled ? null : Date.now()
    }
    this.plugins.set(manifest.id, record)
    this.emit()

    // 启动钩子：失败标 error，宿主不崩（dsh 风格非致命激活）
    if (manifest.activate !== undefined) {
      try {
        void manifest.activate()
      } catch (err) {
        record.status = 'error'
        record.error = err instanceof Error ? err.message : String(err)
        record.enabled = false
        record.activatedAt = null
        this.emit()
      }
    }
  }

  enable(id: string): void {
    const plugin = this.require(id)
    if (plugin.status === 'error') {
      throw new Error(`plugin "${id}" is broken (status=error) and cannot be enabled`)
    }
    if (!plugin.enabled) {
      plugin.enabled = true
      plugin.status = 'enabled'
      plugin.activatedAt = Date.now()
      this.saveOverrides()
      this.emit()
    }
  }

  /**
   * 禁用插件（dsh 的 disable + 崩溃恢复保护）。受保护插件抛错。
   * 仅当被禁用的插件正打开面板时才关闭该浮层，避免误关其它插件的面板。
   */
  disable(id: string): void {
    const plugin = this.require(id)
    if (plugin.manifest.protected === true) {
      throw new Error(`plugin "${id}" is protected and cannot be disabled`)
    }
    if (plugin.enabled) {
      plugin.enabled = false
      plugin.status = 'disabled'
      plugin.activatedAt = null
      const active = this.activePanel()
      if (active !== null && this.panelOwner(active.id) === id) {
        this.activePanelId = null
      }
      this.saveOverrides()
      this.emit()
    }
  }

  list(): RegisteredPlugin[] {
    return [...this.plugins.values()]
  }

  get(id: string): RegisteredPlugin | undefined {
    return this.plugins.get(id)
  }

  /** 仅返回 status==='enabled' 插件中指定 kind 的能力（禁用/坏插件的能力不参与分发，类比 dsh 的 disabled 行）。 */
  capabilities<K extends PluginCapabilityKind>(kind: K): Extract<PluginCapability, { kind: K }>[] {
    const out: PluginCapability[] = []
    for (const plugin of this.plugins.values()) {
      if (plugin.status !== 'enabled') continue
      for (const capability of plugin.manifest.capabilities) {
        if (capability.kind === kind) out.push(capability)
      }
    }
    return out as Extract<PluginCapability, { kind: K }>[]
  }

  commands(): Extract<PluginCapability, { kind: 'command' }>[] {
    return this.capabilities('command')
  }

  panels(): Extract<PluginCapability, { kind: 'panel' }>[] {
    return this.capabilities('panel')
  }

  services(): Extract<PluginCapability, { kind: 'service' }>[] {
    return this.capabilities('service')
  }

  /**
   * 打开某面板能力（仅已启用的 panel 可打开）；重复打开同一面板幂等。
   *
   * `params` 是**打开参数**（如「要看哪一条的引用关系」）：宿主原样保存，面板绑定自行断言类型。
   * 省略 `params` = 沿用上一次预置的参数（`setPanelParams` 写入的），便于「先定位、后从菜单打开」
   * 这类流程；确实要清空时显式调 `setPanelParams(id, undefined)`。
   */
  openPanel(id: string, params?: unknown): void {
    if (!this.panels().some((panel) => panel.id === id)) {
      throw new Error(`no enabled panel capability "${id}"`)
    }
    this.activePanelId = id
    if (params !== undefined) this.paramsByPanel.set(id, params)
    this.emit()
  }

  /**
   * 预置面板参数但**不打开**面板（Slice 3）。
   *
   * 场景：搜索跳转时记住「当前定位到的条目」，用户随后从菜单打开引用面板即可直接看到它——
   * 这类上下文属于面板的打开参数，不该再让 App 各持一份 `useState`。
   * 传 `undefined` 即清除（面板下次打开时按「无参数」处理）。
   */
  setPanelParams(id: string, params: unknown): void {
    if (params === undefined) this.paramsByPanel.delete(id)
    else this.paramsByPanel.set(id, params)
    this.emit()
  }

  /**
   * 取面板打开参数；未预置返回 `undefined`。
   * 返回的是宿主保存的**同一引用**，故可安全用作 `useSyncExternalStore` 的快照
   * （换参数时引用变化触发重渲染，未换时身份稳定不抖动）。
   */
  panelParams(id: string): unknown {
    return this.paramsByPanel.get(id)
  }

  closePanel(): void {
    if (this.activePanelId !== null) {
      this.activePanelId = null
      this.emit()
    }
  }

  /** 当前打开的面板能力；无则 null。 */
  activePanel(): Extract<PluginCapability, { kind: 'panel' }> | null {
    if (this.activePanelId === null) return null
    return this.panels().find((panel) => panel.id === this.activePanelId) ?? null
  }

  /** 订阅变更（注册/启用/禁用/面板开关）；返回取消订阅函数。 */
  subscribe(fn: () => void): () => void {
    this.listeners.add(fn)
    return () => {
      this.listeners.delete(fn)
    }
  }

  private require(id: string): RegisteredPlugin {
    const plugin = this.plugins.get(id)
    if (plugin === undefined) throw new Error(`plugin "${id}" not registered`)
    return plugin
  }

  /** 某个 panel 能力归属哪个插件（用于禁用时精确关闭其浮层） */
  private panelOwner(panelId: string): string | null {
    for (const plugin of this.plugins.values()) {
      for (const capability of plugin.manifest.capabilities) {
        if (capability.kind === 'panel' && capability.id === panelId) return plugin.manifest.id
      }
    }
    return null
  }

  /** 落盘覆写表（仅记录被显式禁用的 id） */
  private saveOverrides(): void {
    if (this.persistence === null) return
    const map: Record<string, boolean> = {}
    for (const plugin of this.plugins.values()) {
      if (plugin.status === 'disabled') map[plugin.manifest.id] = true
    }
    this.persistence.save(map)
  }

  private emit(): void {
    for (const fn of this.listeners) fn()
  }
}
