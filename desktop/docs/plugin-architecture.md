# 插件架构（万物插件化）

> ⚠️ **本文是早期草案，已被 `docs/plugin-architecture.md` 取代**（那份是权威版本：分层架构 / 契约 /
> 渲染链 / 切片路线图 / 面板迁移清单 / 不变量与坑）。改动请只改权威版本，避免两份分叉。

> 落地于 2026-10-28。用户要求「把项目改造成 dsh 的万物插件化，未来其他项目都以插件化当接口」。

## 为什么是自研宿主，而不是依赖 dsh/cordis

dsh（DeepSeek Harness）的插件模型确实成熟，我们研究过它的实现：

- 一个插件 = **cordis 插件 + npm bundle**，`package.json` 的 `dsh.bundle` 声明自己，并通过 `cordis.patch.yml` 列出要插入的插件行（`id` / `name` / `disabled` / `config`）。
- 生命周期：`install → load → activate → disable`；补丁层可写 `disabled:` 关闭单个插件。
- 能力面覆盖 CLI 命令 / Host IPC 服务（Typert 远程）/ React 视图（`dsh.client`）/ cordis 服务。
- 安全：核心包签名（`sha512` integrity + pnpm override 锁死 registry）；第三方插件不签名，仅靠 `engines.dsh` 兼容门禁 + 崩溃恢复时整体禁用第三方插件（`PROTECTED_PLUGINS` 受保护不可禁）。

**但我们没有把 `mb-desktop` 变成 dsh 的插件**，原因只有一个且致命：

> 用户说「未来其他项目我都以插件化当做接口」。如果接口 = dsh 的 cordis 运行时，那所有未来项目都必须活在 dsh 里。这把「接口」绑死在了一个第三方宿主上，反而丧失了「接口」的意义。

所以我们**借 dsh 的哲学，自研一个运行时无关的宿主**。契约在 `src/shared/plugin/types.ts`，宿主在 `src/shared/plugin/host.ts`。任何项目（包括未来的非 dsh 项目）只要产出符合本契约的 `PluginManifest`，就能被同一宿主加载。dsh 只是参考，不是依赖。

## 契约（PluginManifest）—— 宿主无关核心

规范形态 = **可 JSON 序列化的 `PluginManifest`**。本 TS 类型只是参考绑定之一；Unity 用同构 C# 类、CLI 用 Go struct，字段一一对应即可。共享层（`src/shared/plugin/types.ts`）**零框架依赖**，不 import React。

```ts
interface PluginManifest {
  id: string            // 全局唯一；重复注册抛错
  name: string
  version: string
  description?: string
  engines?: { host?: string }   // 要求宿主最低主版本（类比 dsh engines.dsh）
  protected?: boolean          // 受保护：禁用列表与崩溃恢复都不可禁（类比 dsh PROTECTED_PLUGINS）
  capabilities: PluginCapability[]   // 四类能力
}
```

UI 用可序列化的 `UiNode` 描述（最低公共分母），任何宿主实现一个几十行的小渲染器即可画：

```ts
type UiNode =
  | { type: 'text'; text: string }
  | { type: 'button'; label: string; action?: string }   // action = 点击触发的 command 能力 id
  | { type: 'input'; name: string; label?: string; value?: string }
  | { type: 'container'; children: UiNode[] }
```

能力四类，对齐 dsh 的能力面：

| kind | 类比 dsh | 用途 | 宿主无关？ |
|---|---|---|---|
| `command` | CLI 命令 | 菜单/按钮可触发的动作（`run`） | ✅ 纯逻辑 |
| `panel` | React 视图（`dsh.client`） | 宿主可打开的独立浮层，用 `ui` 声明式描述 | ✅ `ui` 可序列化；富 UI 走可选绑定 |
| `service` | Host IPC / Typert 远程 | 可被其他插件调用的纯函数（`invoke(input)`） | ✅ 纯逻辑 |
| `view` | 主视图 | 宿主级主视图（如编辑器），用 `ui` 声明式描述 | ✅ 同上 |

> **富 UI（React 等）是可选绑定，不进契约**：React 宿主侧 `renderer/src/plugins/reactBindings.tsx` 用 `registerReactBinding(id, Component)` 把富组件挂到 panel id 上；非 React 宿主忽略绑定，直接渲染 `ui`。这正是 dsh 把「注册（cordis）」与「UI 模块（dsh.client）」分开的做法。

## 宿主生命周期（PluginHost）

`register`（install）→ `enable`（activate）→ `disable`。映射关系：

- `register` 重复 id 抛错；`engines.host` 要求的主版本高于宿主当前版本则拒绝（兼容性门禁）。
- `disable` 受保护插件抛错；禁用正打开面板的插件会一并关掉面板，避免悬空浮层。
- `capabilities(kind)` 只返回**已启用**插件的能力（禁用的不参分发，类比 dsh 的 `disabled` 行）。
- `subscribe(fn)` 订阅 register/enable/disable/面板开关，返回取消订阅函数（供管理面 reactivity）。

## 当前落地

- `src/shared/plugin/types.ts`：契约（**零框架依赖**，不 import React；UI 用 `UiNode` 声明式）。
- `src/shared/plugin/host.ts`：宿主（纯 TS，无 React 运行时依赖）。
- `src/renderer/src/plugins/reactBindings.tsx`：React 可选绑定层（`registerReactBinding` + `renderUiNode` + `uiOf`），宿主相关，不进共享契约。
- `src/renderer/src/plugins/ceshuPlugin.ts`：策划书子系统作为**受保护核心插件**注册，把已有的完备度/开发路线/开发体检分析以 `service` 形式暴露，供未来插件在拿到 `doc` 时调用。
- `src/renderer/src/plugins/demoPlugin.tsx`：示例插件，manifest **零框架依赖**（panel 用 `ui`），富 React 组件通过 `registerReactBinding` 外置；证明 `command`/`panel`/`service` 三类能力端到端可用（含「禁用本插件」按钮走通 disable 生命周期）。**未来项目照抄此模板即可**。
- `src/renderer/src/plugins/builtins.ts`：导出 `pluginHost` 单例，import 时幂等注册内置插件。
- `src/renderer/src/components/PluginsPanel.tsx`：插件中心（状态栏「插件」按钮 → `plugins` 浮层），列出已注册插件、启用/禁用、打开面板/运行命令/调用服务；优先 React 绑定，缺失回退到 `renderUiNode`。

## 任意宿主怎么实现（生态接入）

因为规范形态是可 JSON 序列化的 manifest，任何宿主接入都只做三件事（见 `host.ts`，本身零 React）：

1. **生命周期**：`register / enable / disable / list / subscribe` —— 拷过去即用。
2. **按 kind 分发**：`command`/`service` 直接调；`panel`/`view` 用宿主自己的 `UiNode` 渲染器画（参考 `renderUiNode`）。
3. **可选富绑定**：React 宿主额外提供 `registerReactBinding`；其他宿主用 `ui`。

具体宿主的接入方式（都是薄适配层，不改契约）：

| 宿主 | 接入做法 |
|---|---|
| **我们的 mb-desktop（React）** | 直接用 `pluginHost` + `reactBindings`；`PluginsPanel` 渲染。已落地。 |
| **dsh** | 写一个 dsh bundle：`cordis.patch.yml` 注册 manifest 的能力，`dsh.client` 模块用 `renderUiNode` 思路渲染 `ui`（或把富组件绑定作为 client 模块）。薄适配。 |
| **游戏引擎（Unity/C++/Rust…）** | 宿主侧解析同一份 JSON manifest；`command`/`service` 直调；`panel`/`view` 的 `UiNode` 用引擎 IMGUI/UMG/webview 画。跨语言只需同构字段。 |
| **CLI / 服务端（Go/Python…）** | 只消费 `command`/`service` + 把 `ui` 渲染成文本/JSON；不实现面板渲染也行（面板能力在 CLI 宿主里不分发）。 |
| **其他应用** | 任意能解析 JSON + 跑 JS/TS 的运行时，照 `PluginHost` 实现一个宿主即可。 |

> 契约是**生态的集成层标准**：dsh、游戏引擎、你的各个项目、其他应用，都通过同一份 `PluginManifest` 互相接入。新增一个项目 = 产出符合契约的 manifest，可选挂一个宿主侧富绑定。

## 这不是「把 ceshu 拆成 40 个插件」

CeshuView 内部 40 个菜单动作仍是硬编码单体（刻意保留，避免一次性重写破坏既有 3000+ 测试）。本架构是**脊柱**：新能力走 `pluginHost.register(manifest)` 即可被宿主发现与管理，无需再动 App/MenuBar。ceshu 已作为第一个插件「在宿主里挂号」，后续可增量把它的动作逐步上提为 capability。
