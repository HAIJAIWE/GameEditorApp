# 插件化架构总览（快速参考）

> 详细设计/切片记录见 [`plugin-architecture.md`](./plugin-architecture.md)；本文是**一页速查**：能力类型、挂载点、插件清单、怎么加新插件。

## 1. 一句话定位

产品的一切可插拔 UI（**面板 / 菜单 / 浮层 / 内联弹层 / 侧栏 / 产出物页签**）都由插件通过 `PluginManifest` 声明，宿主（`PluginHost`）负责发现、渲染、启停。**契约零框架依赖**（不 import React），可被 dsh / 游戏引擎 / CLI / 其他项目复用。

## 2. 契约：六类能力

| 能力 | 形态 | 关键字段 | 谁渲染 |
|---|---|---|---|
| `command` | 可执行动作 | `{ id, label, run() }` | 菜单 / 侧栏 / 快捷键 / 其他插件派发 |
| `panel` | **宿主级浮层**（打开替换 App 主区） | `{ id, title, ui }` | `HostPanel`（App 主区） |
| `service` | 供其他插件调用的函数 | `{ id, invoke() }` | 任意（纯逻辑） |
| `menu` | 菜单条目 | `{ id, menu, order, mount?, items }` | `MenuBar`（App 顶栏）/ `MenuMount`（编辑器下拉） |
| `sidebar` | 左侧主导航条目 | `{ id, order, items }` | `Sidebar` |
| `view` | **挂载点视图** | `{ id, label, mount, order, ui }` | `ViewMount`（浮层/内容槽/内联/产出物） |

**`ui` 一律是可序列化的 `UiNode`**（`text/button/input/container`）；富 React 组件作为**可选绑定**在宿主侧注册（`registerReactBinding(id, Component)`），缺失则回退 `renderUiNode`。

## 3. 挂载点地图

| 挂载点 | 语义 | 渲染器 | 视图数 |
|---|---|---|---|
| `app`（menu 默认） | App 顶栏菜单 | `MenuBar` | 6 个菜单 / 35 项 |
| `ceshu.overlay` | 编辑器**浮层**（叠在编辑器上，不卸载编辑器） | `ViewMount` | 7（路线/体检/影响面/迁移/消费/审阅/导入） |
| `ceshu.content` | 编辑器**内容槽**（激活替换内容区） | `ViewMount` | 13（版本对比/时间线/报告/AI/预设…） |
| `ceshu.toolbar` | 工具栏**内联弹层** | `ViewMount` | 1（派生新版本） |
| `ceshu.chapterNav` | 章节列表旁**内联气泡** | `ViewMount` | 1（系统模块勾选） |
| `ceshu.artifact` | 左栏**产出物页签** | `ViewMount` | 3（原型/数据/任务） |

> `panel` vs `view` 的分界：**`panel` 打开会替换 App 主区（卸载编辑器）**；`view` 挂在宿主内部、**编辑器保持挂载**。编辑器内的东西必须用 `view`。

## 4. 内置插件清单（16 个）

| 插件 | 贡献 |
|---|---|
| `ceshu` | **受保护核心**：暴露 `readiness / route / health` 三个 service |
| `demo` | 端到端示例（command + panel + service） |
| `shortcuts` | 快捷键参考面板 |
| `statistics` | 数据统计面板 |
| `references` | 引用关系面板（走打开参数） |
| `utility-panels` | 8 个不依赖 App 状态的面板（生图/数据对比/数据预览…） |
| `data-panels` | 高级搜索 / 关系图 / 属性图表 |
| `maintenance-panels` | 备份 / 清空所有数据 |
| `entry-panels` | 类型编辑器 / 快速创建 / 批量 / 导入预览 |
| `shell-panels` | 关于 / 插件中心（自举） |
| `onboarding` | 引导面板 + 12 个 `nav.*` 命令 |
| `app-actions` | 窗口 / 焦点 / 退出 / 文件 I/O / 撤销重做（`app.io.*`） |
| `menus` | 6 个 App 顶层菜单（35 项） |
| `navigation` | 侧栏 8 条目 + `nav.home` / `nav.agent` |
| `ceshu-views` | **25 个编辑器内 view** |
| `ceshu-menus` | 编辑器「更多」菜单（18 项） |

## 5. 迁移账本（Slice 1–17）

| 切片 | 内容 |
|---|---|
| 1–3 | 打通「面板经宿主渲染」+ `appContext` + 面板打开参数 |
| 4–7 | 面板批迁（utility / data / maintenance / entry 四个 bundle） |
| 8a–8e | 浮层塌缩到 `panel` 能力 + 菜单动作/引导/文件 I/O 命令化 |
| 9 | **菜单结构** → `menu` 能力（`MenuBar` 从 `host.menus()` 渲染） |
| 10 | **侧栏结构** → `sidebar` 能力（`Sidebar` 从 `host.sidebarItems()` 渲染） |
| 11 | **编辑器内浮层** → `view` 能力 + 挂载点（路线/体检/影响面） |
| 12 | **内容槽**（版本对比/时间线） |
| 13 | 11 个 `panel` 变体全迁内容槽，`panel` 三元链归零 |
| 14 | 4 个内联浮层抽出（审阅/迁移/导入/消费提示词） |
| 15 | 派生新版本 / 系统模块气泡（内联挂载点） |
| 16 | **编辑器「更多」菜单** → `menu` 能力（`mount: 'ceshu.toolbar'`） |
| 17 | **左栏产出物页签** → `ceshu.artifact` 视图 |

> 不做：**App 主区 6 个核心视图**（首页/编辑器/数据/代码/浏览器/智能体）——它们是**持久化 pane**（`hidden` 切换、保草稿），`view` 是挂载/卸载语义，硬转会丢草稿；且是产品本体、不复用。

## 6. 怎么加一个新插件

**第一步**：写 manifest（`plugins/myPlugin.tsx`）：

```tsx
export function defineMyPlugin(host: PluginHost): PluginManifest {
  // 可选：给面板注册富 React 绑定（缺省走 UiNode 声明式渲染）
  registerReactBinding('my.panel', MyPanelBound)

  return {
    id: 'my-plugin',
    name: 'my-plugin',
    version: '0.1.0',
    meta: { label: '我的插件', icon: '🧩' },
    capabilities: [
      { kind: 'command', id: 'my.open', label: '打开', run: () => host.openPanel('my.panel') },
      { kind: 'panel', id: 'my.panel', title: '我的面板', ui: { type: 'text', text: 'hello' } }
    ]
  }
}
```

**第二步**：在 `plugins/builtins.ts` 注册：

```ts
pluginHost.register(defineMyPlugin(pluginHost))
```

**要点**：
- 面板绑定签名 `PanelBindingProps = { params, onClose, close }`；`onClose` 只关、`close` 关并清参数。
- 需要编辑器状态（`doc`/`types`/动作）的视图，用 `useCeshuView()`；需要 App 状态的面板，用 `useAppContext()`。
- `manifest` 必须可 JSON 序列化：**运行时状态不进 manifest**（`disabledWhen` 只写判定键，状态由宿主注入）。

## 7. 验证（四道闸 + e2e，均在 `desktop/`）

```bash
npm run typecheck                 # tsc × 3（node / web / test-dom）
npx eslint <改动文件>
npx vitest run                    # 单元 + DOM 组件测试
env -u NODE_OPTIONS npm run build # 生产构建
npx playwright test               # e2e（需先 build）
```
