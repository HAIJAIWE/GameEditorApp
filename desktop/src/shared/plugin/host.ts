import type { PluginCapability, PluginCapabilityKind, PluginLoader, PluginManifest, PluginSidebarItem, PluginSource } from './types'

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

/** 插件运行时状态：启用 / 禁用 / 激活失败（坏插件）/ 加载中（经 loader 异步安装，Slice 44） */
export type PluginStatus = 'enabled' | 'disabled' | 'error' | 'loading'

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
  /**
   * 视图状态（Slice 11）：挂载点 → 当前激活的 view id。
   * 与 `activePanelId` 同构，但按**挂载点**分区——一个挂载点同时只显示一个视图
   * （如编辑器内的路线/体检/影响面互斥），不同挂载点互不影响。
   */
  private readonly activeViewByMount = new Map<string, string>()
  /** 视图打开参数：viewId → params（语义同 panelParams，只认 `unknown`） */
  private readonly viewParamsByView = new Map<string, unknown>()
  private readonly persistence: PluginPersistence | null
  /** 覆写表：id → 是否禁用（true=禁用）。仅记录偏离默认的项 */
  private readonly overrides: Record<string, boolean>
  /** 变更版本号（每次 emit +1），供外部做稳定快照 */
  private version = 0

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

  /**
   * 经加载器异步注册插件（cordis 式运行时加载，Slice 44）。
   *
   * 流程：`source` → 先放一个 `status:'loading'` 占位（id 暂用 source 串）→ `loader.load(source)`
   * 拿到 manifest → 置换占位为真实记录并跑 `activate`（非致命）→ 置 enabled/error。
   * 加载失败只把占位标 `status:'error'`，宿主不崩（与 `register` 同定力）。
   *
   * 用于「插件市场」按需安装外部/可选 bundle；静态内置插件仍走同步 `register`。
   */
  async loadPlugin(loader: PluginLoader, source: PluginSource): Promise<void> {
    if (this.plugins.has(source)) {
      const existing = this.plugins.get(source)
      if (existing?.status === 'loading') return
      throw new Error(`plugin "${source}" already registered`)
    }
    const placeholder: RegisteredPlugin = {
      manifest: { id: source, name: source, version: '0.0.0', capabilities: [] },
      enabled: false,
      status: 'loading',
      registeredAt: Date.now(),
      activatedAt: null
    }
    this.plugins.set(source, placeholder)
    this.emit()
    try {
      const manifest = await loader.load(source)
      if (manifest.id !== source) {
        if (this.plugins.has(manifest.id)) {
          this.plugins.delete(source)
          throw new Error(`plugin "${manifest.id}" already registered`)
        }
        this.plugins.delete(source)
        this.plugins.set(manifest.id, { ...placeholder, manifest })
      } else {
        placeholder.manifest = manifest
      }
      const record = this.plugins.get(manifest.id)
      if (record === undefined) return
      const overriddenDisabled = this.overrides[manifest.id] === true
      record.enabled = !overriddenDisabled
      record.status = overriddenDisabled ? 'disabled' : 'enabled'
      record.activatedAt = overriddenDisabled ? null : Date.now()
      // 启动钩子：失败标 error，宿主不崩（dsh 风格非致命激活）
      if (manifest.activate !== undefined) {
        try {
          void manifest.activate()
        } catch (err) {
          record.status = 'error'
          record.error = err instanceof Error ? err.message : String(err)
          record.enabled = false
          record.activatedAt = null
        }
      }
      this.emit()
    } catch (err) {
      const rec = this.plugins.get(source)
      if (rec !== undefined) {
        rec.status = 'error'
        rec.error = err instanceof Error ? err.message : String(err)
        rec.enabled = false
        rec.activatedAt = null
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
      // 关闭该插件拥有的已打开视图（挂载点内浮层）
      for (const [mount, viewId] of [...this.activeViewByMount]) {
        if (this.viewOwner(viewId) === id) this.activeViewByMount.delete(mount)
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
   * 菜单能力（按 `order` 升序；同标题的条目由宿主合并渲染）。
   * `mount` 默认 `'app'`（App 顶栏）；编辑器内菜单用别的挂载点过滤。
   */
  menus(mount = 'app'): Extract<PluginCapability, { kind: 'menu' }>[] {
    return this.capabilities('menu')
      .filter((menu) => (menu.mount ?? 'app') === mount)
      .sort((left, right) => left.order - right.order)
  }

  /** 某挂载点下启用的 view 能力（按 `order` 升序；未声明 `mount` 的不参与） */
  views(mount: string): Extract<PluginCapability, { kind: 'view' }>[] {
    return this.capabilities('view')
      .filter((view) => view.mount === mount)
      .sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
  }

  /** 主区视图能力（按 `order` 升序；App 主区页签条据此渲染，Slice 22） */
  mainViews(): Extract<PluginCapability, { kind: 'mainView' }>[] {
    return this.capabilities('mainView').sort((left, right) => (left.order ?? 0) - (right.order ?? 0))
  }

  /**
   * 工具视图能力（keyed slot，P2）：按 `tool` 精确匹配；同 tool 多个时 `order` 大者在前。
   * 数字员工面板据此把「某工具的结果」交给插件提供的视图渲染（缺省走内置 text/code/json）。
   */
  toolViews(): Extract<PluginCapability, { kind: 'toolView' }>[] {
    return this.capabilities('toolView').sort((left, right) => (right.order ?? 0) - (left.order ?? 0))
  }

  /**
   * 变更版本号（单调递增）。供 `useSyncExternalStore` 作**稳定快照**：
   * `mainViews()`/`sidebarItems()` 这类返回**新数组**的读取不能直接当快照（每次身份都变→无限重渲染），
   * 订阅版本号、在 render 里再算列表即可。
   */
  getVersion(): number {
    return this.version
  }

  /**
   * 打开某视图（挂在其 `mount` 挂载点上；同一挂载点同时只显示一个）。
   * 能力不存在或未声明 `mount` ⇒ 抛错（与 `openPanel` 一致，暴露误用）。
   * 调用方（编辑器）自行 try/catch，插件被禁用时静默，不让入口崩。
   */
  openView(id: string, params?: unknown): void {
    const view = this.capabilities('view').find((capability) => capability.id === id)
    if (view === undefined || view.mount === undefined) {
      throw new Error(`no enabled view capability "${id}" with a mount point`)
    }
    if (params !== undefined) this.viewParamsByView.set(id, params)
    this.activeViewByMount.set(view.mount, id)
    this.emit()
  }

  /** 关闭某挂载点上的视图（无则无操作） */
  closeView(mount: string): void {
    if (this.activeViewByMount.delete(mount)) this.emit()
  }

  /** 某挂载点当前打开的 view（无则 null） */
  activeView(mount: string): Extract<PluginCapability, { kind: 'view' }> | null {
    const id = this.activeViewByMount.get(mount)
    if (id === undefined) return null
    return this.views(mount).find((view) => view.id === id) ?? null
  }

  /**
   * 取视图打开参数；未预置返回 `undefined`。
   * 与 `panelParams` 一样返回宿主保存的**同一引用**，可安全作 `useSyncExternalStore` 快照。
   */
  viewParams(id: string): unknown {
    return this.viewParamsByView.get(id)
  }

  /** 预置/清除视图打开参数但**不打开**（传 `undefined` 即清除） */
  setViewParams(id: string, params: unknown): void {
    if (params === undefined) this.viewParamsByView.delete(id)
    else this.viewParamsByView.set(id, params)
    this.emit()
  }

  /**
   * 侧栏条目（合并所有启用的 `sidebar` 能力，按 capability `order` 升序拼接；
   * 同名 `key` 以先到者为准，后到者丢弃）。被禁用/坏插件的能力不参与。
   */
  sidebarItems(): PluginSidebarItem[] {
    const ordered = [...this.capabilities('sidebar')].sort((left, right) => left.order - right.order)
    const out: PluginSidebarItem[] = []
    const seen = new Set<string>()
    for (const capability of ordered) {
      for (const item of capability.items) {
        if (seen.has(item.key)) continue
        seen.add(item.key)
        out.push(item)
      }
    }
    return out
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

  /** 某个 view 能力归属哪个插件（用于禁用时精确关闭其挂载点视图） */
  private viewOwner(viewId: string): string | null {
    for (const plugin of this.plugins.values()) {
      for (const capability of plugin.manifest.capabilities) {
        if (capability.kind === 'view' && capability.id === viewId) return plugin.manifest.id
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
    this.version += 1
    for (const fn of this.listeners) fn()
  }
}
