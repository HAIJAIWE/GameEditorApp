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
  items: PluginMenuItem[]
}

/** 视图能力：宿主级主视图（如编辑器）。由宿主决定挂载，用 `ui` 声明式描述。 */
export interface PluginViewCapability {
  kind: 'view'
  id: string
  label: string
  ui: UiNode | (() => UiNode)
}

export type PluginCapability =
  | PluginCommandCapability
  | PluginPanelCapability
  | PluginServiceCapability
  | PluginMenuCapability
  | PluginViewCapability

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
