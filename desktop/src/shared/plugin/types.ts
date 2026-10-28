/**
 * 插件契约（宿主无关核心）。
 *
 * 生态定位：本文件是**跨项目共享的集成层标准**——dsh、游戏引擎、用户的各个项目、其他应用
 * 都通过同一份 `PluginManifest` 互相接入。因此本契约**零框架依赖**：
 * - 不 import React；UI 能力用可序列化的 `UiNode` 描述，任何宿主用自己的渲染器画。
 * - 富 UI（如 React 组件）作为**可选绑定**放在宿主侧（见 `renderer/src/plugins/reactBindings.tsx`），
 *   不进契约本体。缺省走 `UiNode`，保证 CLI / 引擎 / 非前端宿主也能接。
 *
 * 规范形态 = 可 JSON 序列化的 `PluginManifest`；本 TS 类型只是参考绑定之一
 * （Unity 用同构 C# 类、CLI 用 Go struct，字段一一对应即可）。
 */

/**
 * 可序列化的 UI 描述树（最低公共分母）。
 * 任何宿主实现一个几十行的小渲染器就能画：React→JSX、CLI→文本、引擎 IMGUI→控件、webview→HTML。
 */
export type UiNode =
  | { type: 'text'; text: string }
  | { type: 'button'; label: string; /** 点击触发某 command 能力 id；省略则仅展示 */ action?: string }
  | { type: 'input'; name: string; label?: string; value?: string }
  | { type: 'container'; children: UiNode[] }

/** 命令能力：类比 dsh 的 CLI 命令，宿主菜单/快捷键/CLI 可触发 `run`。纯逻辑，完全宿主无关。 */
export interface PluginCommandCapability {
  kind: 'command'
  id: string
  label: string
  run: () => void | Promise<void>
}

/** 面板能力：宿主可打开的独立浮层。用 `ui`（声明式）描述；富 UI 由宿主侧 React 绑定提供。 */
export interface PluginPanelCapability {
  kind: 'panel'
  id: string
  title: string
  ui: UiNode | (() => UiNode)
}

/** 服务能力：可被其他插件/宿主调用的纯函数（类比 dsh 的 Host IPC / Typert 远程）。完全宿主无关。 */
export interface PluginServiceCapability {
  kind: 'service'
  id: string
  invoke: (input?: unknown) => unknown | Promise<unknown>
}

/**
 * 菜单项（可序列化）。宿主据此画菜单，点击时执行 `command` 指向的 command 能力。
 *
 * - 省略 `command` 且省略 `items` ⇒ 分隔符；
 * - `disabledWhen` 是**宿主判定键**（如 `undo` / `redo`）：契约不认识具体状态，
 *   由宿主注册的判定函数决定禁用——这样「撤销是否可用」这类状态不必进 manifest。
 */
export interface PluginMenuItem {
  label: string
  command?: string
  items?: PluginMenuItem[]
  /** 稳定测试锚点（E2E 用） */
  testid?: string
  disabledWhen?: string
}

/**
 * 菜单能力：往宿主某个顶层菜单里塞条目（类比 dsh 的 command 注册进菜单）。
 *
 * 同一 `menu` 标题的多个能力会**合并**到同一菜单；`order` 决定顶层菜单顺序。
 * 这样「文件/编辑/工具…」的结构由插件声明，App 不再持有一张 35 项的动作映射表。
 */
export interface PluginMenuCapability {
  kind: 'menu'
  id: string
  /** 顶层菜单标题（如「文件」）；同名合并 */
  menu: string
  /** 顶层菜单排序，小在前 */
  order: number
  /**
   * 挂载点：省略 = App 顶栏（默认 `'app'`）。
   * 编辑器内下拉菜单用别的挂载点（如 `'ceshu.toolbar'`），由宿主在对应位置渲染。
   */
  mount?: string
  items: PluginMenuItem[]
}

/**
 * 视图能力：挂在宿主某个**挂载点**上的视图（如编辑器内部浮层）。
 *
 * 与 `panel` 的关键区别：`panel` 是宿主级浮层，打开时**替换主区**（编辑器会被卸载）；
 * `view` 挂在宿主指定的位置（如 `'ceshu.overlay'`，由编辑器在自己的 DOM 内渲染），
 * 因此**不会卸载编辑器**——编辑器内的只读浮层（开发路线 / 体检 / 影响面）必须用 view。
 *
 * 宿主在 `mount` 对应的挂载点渲染当前激活的 view；未声明 `mount` 的 view 不被渲染。
 */
export interface PluginViewCapability {
  kind: 'view'
  id: string
  label: string
  /** 挂载点名称（如 `'ceshu.overlay'`）；省略 = 未指定挂载点，宿主不渲染 */
  mount?: string
  /** 同一挂载点内的排序，小在前 */
  order?: number
  ui: UiNode | (() => UiNode)
}

/**
 * 主区视图能力：App **主区本身**的页签视图（Slice 22）。
 *
 * 与 `view` 的区别：`view` 挂在宿主**内部**某个挂载点（如编辑器浮层），是主区里的子视图；
 * `mainView` 就是主区——宿主用页签条在多个 mainView 之间切换，并保持
 * 「**常驻挂载、hidden 切换**」语义：切走不卸载，草稿/滚动/选中态都不丢。
 *
 * 富 React 组件同 `panel`/`view` 一样经 `registerReactBinding` 外置；`ui` 只是可序列化占位，
 * 供非 React 宿主回退渲染。
 */
export interface PluginMainViewCapability {
  kind: 'mainView'
  id: string
  /** 页签短标签（顶部空间有限） */
  label: string
  /** 悬浮说明 */
  title?: string
  /** 页签顺序，小在前 */
  order?: number
  /** 首访才挂载（重视图，如代码/浏览器）；缺省 false = 常驻挂载 */
  lazy?: boolean
  ui: UiNode | (() => UiNode)
}

/**
 * 侧栏条目（可序列化）。宿主据此画左侧主导航，点击时：
 * - 有 `command` ⇒ 执行该 command 能力（home/agent 等导航动作都收编成 command）；
 * - 否则有 `panel` ⇒ 打开该 panel 能力，并在其激活时高亮（见下方 `isActive` 判定）。
 *
 * 与 `menu` 能力同源思路：侧栏结构由插件声明，`App` 不再持有一张硬编码条目表。
 * `icon` 是 emoji 或图标名，宿主自行解释（CLI 可忽略）。
 */
export interface PluginSidebarItem {
  /** 稳定 id：用作 E2E 锚点 `sidebar-<key>` 与「当前浮层高亮」判定 */
  key: string
  label: string
  icon: string
  /** 点击触发的 command 能力 id（如 `nav.home`）。与 `panel` 二选一 */
  command?: string
  /** 点击打开的 panel 能力 id（如 `statistics.panel`）。与 `command` 二选一 */
  panel?: string
  /** 稳定测试锚点（E2E 用）；省略回落到 `sidebar-<key>` */
  testid?: string
}

/**
 * 侧栏能力：往宿主左侧主导航栏提供条目（类比 dsh 的 command 注册进侧栏）。
 * 同一插件通常只声明一个；多个插件的条目按 `order` 拼接（同名 key 以先到者为准）。
 */
export interface PluginSidebarCapability {
  kind: 'sidebar'
  id: string
  /** 排序，小在前 */
  order: number
  items: PluginSidebarItem[]
}

/**
 * 工具视图能力（keyed slot，P2）：为**某个工具**提供结果渲染视图。
 *
 * 与 `view`/`mainView` 的区别：那些是「独立浮层/页签」；`toolView` 是「数字员工执行步骤里，
 * 某工具的结果长什么样」的**按 key 分派**视图——即 dsh `ui-slots` 的 keyed slot 思路。
 *
 * `tool` 是工具 id（如 `system.game_data` / `mcp.fs.read`），精确匹配；同 tool 多个时 `order` 大者胜。
 * 富 React 组件经渲染层 `registerToolViewBinding(id)` 外置（与 panel/view 同一套「契约宿主无关、
 * React 绑定外置」原则）；`ui` 只是声明式回退，供非 React 宿主。
 */
export interface PluginToolViewCapability {
  kind: 'toolView'
  id: string
  /** 绑定的工具 id（精确匹配） */
  tool: string
  /** 同 tool 多视图时的优先级，大者胜（缺省 0） */
  order?: number
  ui: UiNode | (() => UiNode)
}

/* ---- Slot 内核（借 dsh ui-slots 的 typed slot 模型） ---- */

/** Slot 基数：单占位 / 有序列表 / 按 key 分发 / 选择器选举。 */
export type SlotKind = 'single' | 'list' | 'keyed' | 'chain'

/** Slot 作用域：全局 / 会话绑定（MVP 仅 `root` 落地，`session` 预留）。 */
export type SlotScope = 'root' | 'session'

/** 一个 slot 的声明规格（由根或父级 slot 的 `children` 声明）。 */
export interface SlotSpec {
  kind: SlotKind
  scope?: SlotScope
}

/**
 * store seat 声明：每条注册得到**独立** store 实例（懒创建）。
 * 动作接收当前 state 与调用参数，返回新 state（返回 `void` 表示原地修改）。
 */
export interface SlotStoreDecl<S = unknown> {
  init: S | (() => S)
  actions?: Record<string, (state: S, ...args: unknown[]) => S | void>
}

/**
 * Slot 能力：往**已声明**的 slot 注册一个展示体（借 dsh `ctx.slots.register`）。
 *
 * - `key` 必须已由根声明或父级 slot 的 `children` 声明，否则注册失败（**声明即认领**）；
 * - `children` 在注册时声明子 slot——同一 key 只能有一个 declarer；
 * - 遮蔽：同 cell（single=自身 / keyed=同 key / list=同 id）按 `priority` 升序，最低者渲染；
 * - 富 UI 后续经绑定扩展；此处 `ui` 为声明式 `UiNode`，非 React 宿主可回退渲染。
 */
export interface PluginSlotCapability {
  kind: 'slot'
  id: string
  /** 目标 slot key（须已声明） */
  key: string
  /** 覆盖声明里的 kind（一般省略，用声明 kind） */
  slotKind?: SlotKind
  /** 遮蔽优先级：越小越优先（同 cell 最低者渲染） */
  priority?: number
  /** list 条目 id（kind=list 必填） */
  entryId?: string
  /** list 排序（小在前） */
  order?: number
  /** keyed 分派键（kind=keyed 必填） */
  entryKey?: string
  /** chain 选举：返回非 null/undefined 即胜出（kind=chain 必填） */
  select?: (owner: unknown) => unknown | null | undefined
  /** store seat（懒创建，生命周期随注册） */
  store?: SlotStoreDecl
  /** 声明子 slot（声明即认领） */
  children?: Record<string, SlotSpec>
  /** 展示体（声明式；惰性函数形式与 panel/view 一致） */
  ui: UiNode | (() => UiNode)
}

export type PluginCapability =
  | PluginCommandCapability
  | PluginPanelCapability
  | PluginServiceCapability
  | PluginMenuCapability
  | PluginViewCapability
  | PluginMainViewCapability
  | PluginSidebarCapability
  | PluginToolViewCapability
  | PluginSlotCapability

export type PluginCapabilityKind = PluginCapability['kind']

/**
 * 展示元数据（类比 dsh bundle 的 `meta`：本地化 label/icon/描述，供 GUI 清单消费）。
 * 与 `name`/`description` 解耦：机器名保持稳定，展示名可随宿主语言切换。
 */
export interface PluginManifestMeta {
  /** 清单展示短名；省略回退到 `name` */
  label?: string
  /** 清单展示描述；省略回退到 `description` */
  description?: string
  /** 图标标识（emoji 或图标名）；宿主自行解释，缺失则不画图标 */
  icon?: string
}

export interface PluginManifest {
  /** 全局唯一 id；重复注册抛错 */
  id: string
  name: string
  version: string
  description?: string
  /** 展示元数据：清单 UI 消费（图标/短名/描述） */
  meta?: PluginManifestMeta
  /**
   * 生态分发源（仅元数据，不影响加载）：如 `link:../other-project`、`registry:@scope/bundle`、git 地址。
   * 用途：未来「项目联动」时，宿主能据此把一个插件解析为可安装的 bundle（借 dsh `source` 字段）。
   */
  source?: string
  /** 宿主最低主版本门槛（类比 dsh `engines.dsh`）；不达标拒绝注册 */
  engines?: { host?: string }
  /** 受保护插件：禁用列表与崩溃恢复都不可禁（类比 dsh PROTECTED_PLUGINS） */
  protected?: boolean
  /**
   * 可选启动钩子（类比 dsh 的 activate）。注册时同步执行一次；
   * 抛错则标记 `status:'error'` 并**不崩溃宿主**（借 dsh "A broken bundle cannot be enabled"）。
   */
  activate?: () => void | Promise<void>
  capabilities: PluginCapability[]
}

/**
 * 插件分发源（借 dsh `source` 字段语义，扩展为可解析的加载协议，Slice 44）。
 *
 * - `factory:<id>`：映射到已打包的工厂函数（静态构建内可用，无需外部 bundle）
 * - `link:<path>` / `file:<abs>`：运行时动态 `import()` 本地/项目 bundle
 * - `registry:@scope/name`：从注册中心 HTTP 拉取 manifest+bundleUrl 再动态 `import()`
 */
export type PluginSource = string

/**
 * 插件加载器（宿主无关接口）：把 `PluginSource` 解析为可注册的 `PluginManifest`。
 * 实现见 `shared/plugin/loader.ts`；契约只认接口不认实现，CLI/引擎宿主可替换。
 */
export interface PluginLoader {
  load(source: PluginSource): Promise<PluginManifest>
}

/** 市场元数据条目（供「插件市场」UI 消费；与 `PluginManifest` 解耦，展示层专用）。 */
export interface PluginMarketEntry {
  /** 与 manifest.id 对齐 */
  id: string
  name: string
  version: string
  description?: string
  /** 分发源（market UI 据此调用 loader 安装） */
  source: PluginSource
  /** 分层：核心 / 可选 / 实验（借 dsh 的 tiers） */
  tier: 'core' | 'optional' | 'experimental'
  /** 是否已在当前构建打包（false = 即将推出 / 未就绪，UI 不提供安装） */
  ready: boolean
  /** 推荐位（dsh plugin-recommendations 思路） */
  recommended?: boolean
  /** 图标（emoji 或图标名） */
  icon?: string
}
