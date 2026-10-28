# 插件架构与深层插件化迁移设计

> 状态：**B 方案 Slice 1–9 全部完成**（2026-10-28）：23/23 浮层、35/35 菜单动作、12/12 引导动作，**连菜单结构本身**都由插件声明。App 不再持有面板清单 / 标题表 / 动作实现 / 菜单树。
> 本文是插件系统的权威设计文档，也是「深层插件化」跨会话的交接文档。
> 相关代码：`desktop/src/shared/plugin/`、`desktop/src/renderer/src/plugins/`。

---

## 1. 目标与定位

把应用改造成 **dsh 式万物插件化**：产品能力（面板、菜单动作、服务）由插件自供给，
经统一 `PluginHost` 注册 / 发现 / 渲染，而不是硬编码在 `App.tsx` 的 switch 与 `MenuBar` 里。

**关键定位（用户拍板）**：dsh 只是**设计参考**，不是运行时、不 vendoring 源码。
契约必须**宿主无关**，未来其他项目（CLI / 游戏引擎 / 别的 Electron 应用）能复用同一接口。

两条硬约束：
1. **共享契约零框架依赖**：`shared/plugin/types.ts` 不 import React，UI 用可序列化 `UiNode`。
2. **富 React 组件外置**：经 `renderer/src/plugins/reactBindings.tsx` 的 `registerReactBinding` 注册，
   非 React 宿主回退到 `renderUiNode`（几十行即可实现）。

---

## 2. 分层架构

```
shared/plugin/types.ts     契约：PluginManifest + 四类能力（command / panel / service / view）
shared/plugin/host.ts      宿主：register / enable / disable / capabilities / openPanel / subscribe
                           —— 纯 TS，无 React，可在主进程或渲染进程实例化
renderer/src/plugins/
  reactBindings.tsx        React 绑定表：panel id → ComponentType<PanelBindingProps>；UiNode 渲染器
  HostPanel.tsx            宿主侧面板渲染器：优先 React 绑定，缺失回退 UiNode；下发打开参数
  appContext.tsx           应用级共享状态（面板自供给通道，见 §4）
  builtins.ts              pluginHost 单例 + 内置插件幂等注册
  ceshuPlugin.ts           受保护核心插件（暴露 readiness / route / health 三个 service）
  demoPlugin.tsx           命令/面板/服务三类端到端示例
  shortcutsPlugin.tsx      Slice 1：静态面板迁移样例
  statisticsPlugin.tsx     Slice 2：状态化面板迁移样例（appContext 自供给）
  referencesPlugin.tsx     Slice 3：带打开参数的面板迁移样例（宿主携带目标条目，见 §5）
  utilityPanelsPlugin.tsx  Slice 4：不依赖 App 状态的面板 bundle（8 个 panel 能力，见 §6 bundle 形态）
  dataPanelsPlugin.tsx     Slice 5：只依赖 types + handleJump 的面板 bundle（appContext 自供给）
  maintenancePanelsPlugin.tsx  Slice 6：依赖动作的面板 bundle（backup / clearAll）
  entryPanelsPlugin.tsx    Slice 7：带打开参数的面板 bundle（typeEditor / quickCreate / batch / importPreview）
  shellPanelsPlugin.tsx    Slice 8 前置：外壳面板（about 走参数 / plugins 自举）
  onboardingPlugin.tsx     快速入门 + 12 个 nav.* 引导命令（8d 后 App 不再持有分发逻辑）
  hostBridge.ts            宿主 UI 桥：notify / openPanel（含守卫）/ setHomeVisible / getActiveCeshuId
  appActionsPlugin.ts      Slice 8c/8e：应用级动作（窗口 / 焦点 / 退出 / 文件 I/O / 撤销重做）纯 command
  appActionsIo.ts          Slice 8e：文件 I/O 实现（从 useDataTransfer 搬出）+ 注入式端口
  menusPlugin.ts           Slice 9：6 个 menu 能力（文件/编辑/工具/视图/设置/帮助），菜单结构由插件声明
  menuState.ts             菜单禁用态通道（disabledWhen → undo/redo 可用性，App 注入）
  navigationPlugin.tsx     Slice 10：1 个 sidebar 能力（8 条目）+ nav.home / nav.agent 命令，侧栏结构由插件声明
```

### 2.1 契约（`types.ts`）

`PluginManifest` 关键字段：
- `id / name / version / description`
- `meta?: { label, icon, description }` —— 管理面展示（dsh bundle 具名风格）
- `source?: string` —— 来源标记
- `protected?: boolean` —— 受保护核心，不可禁用（如 ceshu）
- `engines?: { host?: string }` —— 宿主主版本门禁
- `activate?: () => void | Promise<void>` —— 启动钩子；**抛错非致命**（标 `status:'error'`，宿主不崩）
- `capabilities: PluginCapability[]` —— 六类能力：
  - `command`：`{ id, label, run() }` 可执行动作
  - `panel`：`{ id, title, ui: UiNode | (() => UiNode) }` 可挂载视图
  - `service`：`{ id, invoke(...args) }` 供其他插件调用
  - `menu`：`{ id, menu, order, items }` 往宿主某顶层菜单塞条目（`PluginMenuItem.command` 指向命令；
    `disabledWhen` 只写**判定键**，状态由宿主注入——manifest 保持可序列化）
  - `sidebar`：`{ id, order, items }` 往宿主左侧主导航栏塞条目（`PluginSidebarItem` 二选一：
    `command` 执行命令 / `panel` 打开面板并高亮；`key` 作 E2E 锚点 `sidebar-<key>`）
  - `view`：声明式视图

`UiNode`：`text | button | input | container`，完全可序列化，供非 React 宿主解析。

### 2.2 宿主（`host.ts`）

- `register(manifest)`：重复 id 抛错；`engines.host` 主版本高于宿主则拒绝；按持久化覆写决定初始启停；
  执行 `activate`，失败标 `status:'error'` 且 `enabled:false`。
- `enable / disable`：`disable` 受保护插件抛错；**只关闭该插件自己打开的面板**（`panelOwner` 精确匹配）。
- `capabilities(kind)`：只返回 `status==='enabled'` 插件的能力（禁用/坏插件不参与分发）。
- `openPanel(id, params?)` / `closePanel()` / `activePanel()` / `subscribe(fn)`。
- `menus()`：启用插件的 `menu` 能力，按 `order` 升序（同标题由 `MenuBar` 合并）。
- `sidebarItems()`：合并启用插件的 `sidebar` 能力（按 `order` 升序拼接，`key` 去重，先到者为准）。
- `setPanelParams(id, params)` / `panelParams(id)`：面板**打开参数**通道（Slice 3，见 §5）。
- `PluginPersistence`：启用/禁用覆写持久化接口（宿主注入，核心不碰 IO）；**只记录被显式禁用的 id**。

### 2.3 渲染链

```
App.renderPanel()
  └─ <HostPanel host={pluginHost} panelId="xxx.panel" onClose={...} />
       ├─ useSyncExternalStore(host.subscribe, () => host.panelParams(id))  ── 参数快照
       ├─ host.panels().find(id)  ── 未命中 → return null（注意 find 返回 undefined，不是 null）
       ├─ getReactBinding(id)     ── 有 → <BoundPanel component={Bound} onClose params />
       └─ 无                       ── renderUiNode(uiOf(panel), onAction)
```

`BoundPanel` 是**模块级稳定组件**，把绑定组件作为 prop 传入再渲染。
目的：规避 `react-hooks/static-components`（渲染期赋值组件变量会被判「动态创建组件」而报错）。

---

## 3. 迁移策略：垂直切片

整轮估算 ~60–90 dev-days。**不一次性重写**，按垂直切片推进，每片可运行、四道闸绿、可回滚。

| 切片 | 内容 | 状态 |
|---|---|---|
| Slice 1 | 静态面板（快捷键参考）经 `HostPanel` 渲染，打通「面板经宿主渲染」通路 | ✅ 完成 |
| Slice 2 | `appContext` store + 状态化面板（数据统计）自供给 `types`，解耦 App props | ✅ 完成 |
| Slice 3 | `openPanel(id, params)` 承载面板打开参数；引用面板迁出 App 的 `refTarget` state | ✅ 完成 |
| Slice 4 | 不依赖 App 状态的面板批迁（8 个，`utility-panels` bundle：5 零 props + 3 仅 onClose） | ✅ 完成 |
| Slice 5 | 只依赖 `types + handleJump` 的面板（高级搜索 / 关系图 / 属性图表，`data-panels` bundle） | ✅ 完成 |
| Slice 6 | 依赖动作的面板（备份 refreshUndo / 清空 handleDataCleared）→ `maintenance-panels` bundle；`onboarding` 的 action 分发改归 Slice 8 | ✅ 完成 |
| Slice 7 | 带打开参数的面板（类型编辑器 / 快速创建 / 批量编辑 / 导入预览）→ `entry-panels` bundle；App 里 4 份专用 state 全部删除 | ✅ 完成 |
| Slice 8 | `MenuBar` 35 个菜单动作 → `command` 能力，App 不再持有动作清单 | ✅ 完成（8a 浮层塌缩 / 8b 导航 / 8c+8e 应用动作 / 8d 引导） |
| Slice 9 | **菜单结构本身** → `menu` 能力：`MenuBar` 从 `host.menus()` 渲染，App 的 35 项 `MenuActions` 表删除 | ✅ 完成 |
| Slice 10 | **侧栏结构本身** → `sidebar` 能力：`Sidebar` 消费 `PluginSidebarItem[]`，App 的 `SIDEBAR_ITEMS` 常量与 `handleSidebar` 三分支删除；`home`/`agent` 收编为 `nav.*` 命令 | ✅ 完成 |

---

## 4. `appContext`：面板自供给通道（Slice 2 落地）

### 4.1 契约

```ts
interface AppContextValue {
  types: DataTypeDef[]                                        // 当前类型定义（编辑态）
  setTypes: (next: DataTypeDef[]) => void                     // 字段结构编辑器保存回写
  handleJump: (type: string, itemId: string, name: string) => void  // 条目跳转
  refreshUndo: () => void                                     // 撤销栈刷新（备份恢复后）
  handleDataCleared: (deleted: number) => void                // 整库清空后的收尾（Slice 6）
  afterMutation: (notice: string) => void                     // 数据被改过的通用收尾：提示 + 刷撤销栈（Slice 7）
}
```

`useAppContext()` 必须在 `<AppContextProvider>` 内调用，缺失即抛错（避免静默拿到空数据）。

### 4.2 放置位置

`App.tsx` 只在**面板渲染子树**外包 Provider，不包整棵树：

```tsx
<div className="panel-overlay-body">
  <AppContextProvider value={appContextValue}>{renderPanel()}</AppContextProvider>
</div>
```

`appContextValue` 刻意**不 memo**：`handleJump` 是普通函数、每次渲染新建，memo 不会命中；
面板数量少，重渲染可接受。（后续若要优化，应先把 `handleJump` 等包成 `useCallback`，再 memo。）

### 4.3 范围纪律

- **只放**被多个面板共用的稳定数据/动作。
- **不放**面板专属打开参数（`refTarget` / `importPreview` / `quickCreateTarget` / `typeEditorTarget`）。
  这些走宿主的 `openPanel(id, params)` / `setPanelParams`（Slice 3 已落地，见 §5），否则 context 会膨胀成「第二个 App」。
- `onClose` **不进 context**：它是面板生命周期契约，由 `HostPanel` 统一以 prop 下发。

### 4.4 已迁移面板示例（`StatisticsPanel`）

```tsx
// 迁移前：App 下发 props
<StatisticsPanel types={types} onClose={() => setPanel(null)} />

// 迁移后：types 自供给，onClose 仍由宿主下发
const { types } = useAppContext()
```

插件侧绑定必须**转发 onClose**：

```tsx
registerReactBinding('statistics.panel', ({ onClose }) => <StatisticsPanel onClose={onClose} />)
```

---

## 5. 打开参数：面板上下文由宿主携带（Slice 3 落地）

### 5.1 问题

「引用关系」面板要知道**看哪一条**。Slice 2 之前这份上下文是 App 的 `refTarget` state，
面板再由 props 收下——于是 App 里堆了一串「某个面板专用」的状态
（`refTarget` / `typeEditorTarget` / `quickCreateTarget` / `importPreview`…），
每加一个面板就要改 App，正是要拆掉的耦合。

### 5.2 契约

```ts
host.openPanel(id, params?)      // 打开 + 写参数（省略 params = 沿用上次预置）
host.setPanelParams(id, params)  // 只预置参数、不打开；传 undefined 即清除
host.panelParams(id): unknown    // 读参数；未预置为 undefined
```

绑定拿到的两个关闭入口（`PanelBindingProps`）：

| prop | 行为 | 用在 |
|---|---|---|
| `onClose()` | 只关浮层，**参数留在宿主** | 参数可复用（引用面板：关掉后从菜单重开仍指向同一条） |
| `close()` | 清掉本面板参数 + 关浮层 | 参数是**一次性大对象**（导入预览的整份预览数据），用完必须清，否则一直挂在宿主内存 |

三条纪律：

1. **契约只认 `unknown`**：共享契约不引入任何业务类型（`ReferenceTarget` 之类留在渲染层）。
   面板绑定自行断言（`asReferenceTarget(params)`），形状不对就 `return null`，不画空壳、不崩。
2. **省略 `params` = 沿用**：因为菜单入口是「用上次定位到的目标打开」；
   要清空必须显式 `setPanelParams(id, undefined)`。
3. **快照返回同一引用**：`panelParams()` 返回宿主 Map 里存的那个对象，
   所以 `useSyncExternalStore` 的快照身份稳定（换参数→变、不换→不变，不会每渲染都判「变了」）。

### 5.3 参数怎么传到面板

`HostPanel` 订阅宿主，参数变化即重渲染，再以 `params` prop 交给绑定：

```tsx
const params = useSyncExternalStore(subscribe, () => host.panelParams(panelId))
// 绑定侧
function ReferencesPanelBound({ onClose, params }: PanelBindingProps) {
  const { types, handleJump } = useAppContext()   // 共享状态仍走 context
  const target = asReferenceTarget(params)        // 打开参数走 params
  if (target === null) return null
  return <ReferencesPanel target={target} types={types} onJump={handleJump} onClose={onClose} />
}
```

**为什么要订阅**：面板已打开时再对另一条数据打开（`setPanel` 同值不会触发 App 重渲染），
只有宿主这一层能感知参数替换。这条已由 `referencesPlugin.test.tsx` 用例锁死。

### 5.4 App 侧的净效果

- 删除 `const [refTarget, setRefTarget] = useState<ReferenceTarget | null>(null)`
- `handleJump` → `pluginHost.setPanelParams('references.panel', { type, id, name })`（预置，不打开）
- 菜单守卫 → `pluginHost.panelParams('references.panel') === undefined` 才引导去高级搜索
- 条目「更多 ▸ 查看引用」→ `pluginHost.openPanel('references.panel', target)` 再 `setPanel('references')`
  （原先要绕开 `openPanel` 的守卫，因为同批次 `setRefTarget` 还没生效；现在参数随打开动作同步写入，绕行理由消失）
- `case 'references'` → `<HostPanel panelId="references.panel" />`，删掉对 `ReferencesPanel` 的直接 import

---

## 6. 面板迁移清单

来源：`App.tsx::renderPanel()` 的 `switch (panel)`。

| OverlayPanel | 组件 | 依赖 | 迁移难度 | 状态 |
|---|---|---|---|---|
| `shortcuts` | ShortcutsPanel | 无 | 低 | ✅ |
| `stats` | StatisticsPanel | `types` | 低 | ✅ |
| `attrSystem` | AttrSystemPanel | `onClose` | 低 | ✅ |
| `dataDiff` | DataDiffPanel | `onClose` | 低 | ✅ |
| `settings` | SettingsPanel | 无 | 低 | ✅ |
| `cleanupImages` | CleanupImagesPanel | 无 | 低 | ✅ |
| `keywordTemplates` | KeywordTemplatePanel | 无 | 低 | ✅ |
| `agentEditor` | AgentEditorPanel | 无 | 低 | ✅ |
| `imageGen` | ImageGenPanel | `onClose` | 低 | ✅ |
| `gameDataPreview` | GameDataPreviewPanel | 无 | 低 | ✅ |
| `about` | AboutPanel | 打开参数 `{ version }` | 中 | ✅ |
| `attributeChart` | AttributeChartPanel | `types` | 中 | ✅ |
| `relationGraph` | RelationGraphPanel | `types` + `handleJump` | 中 | ✅ |
| `advancedSearch` | AdvancedSearchPanel | `types` + `handleJump` | 中 | ✅ |
| `backup` | BackupPanel | `refreshUndo` | 中 | ✅ |
| `clearAll` | ClearAllPanel | `handleDataCleared` | 中 | ✅ |
| `onboarding` | OnboardingPanel | `types` + `handleOnboardingAction`（过渡） | 中 | ✅（8d 改发 command） |
| `references` | ReferencesPanel | 打开参数（目标条目）+ `types` + `handleJump` | 高 | ✅ |
| `typeEditor` | TypeEditorPanel | `typeEditorTarget` 参数 + `types` + `setTypes` | 高 | ✅ |
| `quickCreate` | QuickCreatePanel | `quickCreateTarget` 参数 + `types` | 高 | ✅ |
| `batch` | BatchEditPanel | `firstType` 参数 + `types` | 高 | ✅ |
| `importPreview` | ImportPreviewPanel | `previewId` / `preview` 参数 + `types` | 高 | ✅ |
| `plugins` | PluginsPanel | `host`（define 闭包捕获） | 已插件管理面 | ✅ 自举 |

> 注：`onClose` 是通用契约，不计入「依赖」。

**bundle 形态（Slice 4/5 采用）**：同类面板不拆成「一个面板一个插件文件」，而是打包成一个
manifest（`utility-panels` 8 个面板、`data-panels` 3 个面板），这是 dsh 的 bundle 概念——
省掉重复样板，启用/禁用粒度对这类工具面板够用。

- **用 bundle**：面板之间无独立开关需求、都不带参数、代码都只是「渲染一个零 props 组件」。
- **仍一片一插件**：需要按面板单独启停（如 `references`）、或需要注入打开参数的。

---

## 7. 新增一个插件面板的标准步骤

1. **写插件文件** `plugins/xxxPlugin.tsx`：
   ```tsx
   export function defineXxxPlugin(host: PluginHost): PluginManifest {
     registerReactBinding('xxx.panel', ({ onClose }) => <XxxPanel onClose={onClose} />)
     return {
       id: 'xxx', name: 'xxx', version: '0.1.0',
       meta: { label: 'X', icon: '🔧' },
       capabilities: [
         { kind: 'command', id: 'xxx.open', label: 'X', run: () => host.openPanel('xxx.panel') },
         { kind: 'panel', id: 'xxx.panel', title: 'X', ui: { type: 'text', text: 'X' } }
       ]
     }
   }
   ```
2. **注册**到 `plugins/builtins.ts::registerBuiltinPlugins()`。
3. **面板消费共享状态**：用 `useAppContext()`，不要新增 App props。数据被改过后的收尾用
   `afterMutation(message)`（提示 + 刷撤销栈），关面板自己调 `onClose()`/`close()`。
4. **需要打开参数的面板**：不要新增 App state，走 `host.openPanel(id, params)`；绑定里断言参数形状（见 §5）。
5. **App 侧改渲染**：对应 `case` 改 `<HostPanel host={pluginHost} panelId="xxx.panel" onClose={() => setPanel(null)} />`，删除直接 import。
6. **加 DOM 测试**（`tests/unit/dom/xxxPlugin.test.tsx`）：证明经宿主渲染 + 数据自供给（带参数的还要证明换参数会刷新）。
7. **跑四道闸**。

---

## 8. 不变量与坑（务必遵守）

1. **`find` 返回 `undefined` 不是 `null`**：`host.panels().find(...)` 未命中必须判 `=== undefined`，否则空面板崩渲染链。
2. **`react-hooks/static-components`**：渲染期把查到的组件赋给变量再当 JSX 标签会报错。用模块级 `BoundPanel` 包装、组件作为 prop 传入。
3. **绑定必须转发 `onClose`**：面板签名 `{ onClose }` 时，绑定写 `({ onClose }) => <Panel onClose={onClose} />`，不能写 `() => <Panel />`（tsc 会报缺 prop）。
4. **保留既有 `data-testid`**：迁移只换渲染通道，不改 DOM 契约，否则既有测试与用户脚本断。
5. **Provider 必须包住 `HostPanel` 渲染处**：否则 `useAppContext()` 抛错。
6. **打开参数只认 `unknown`**：契约里出现业务类型（`ReferenceTarget` 等）就破坏了「任意宿主可接」。
   断言写在绑定里，形状不对返回 `null`，不要抛错（坏参数不该炸整个渲染链）。
7. **`panelParams` 必须返回宿主保存的同一引用**：`useSyncExternalStore` 拿它当快照，
   每次新建对象会触发「快照不稳定」的无限重渲染。
8. **`openPanel(id)` 省略参数 = 沿用**，不是清空；要清空显式 `setPanelParams(id, undefined)`。
9. **`onClose` 与 `close` 别混**：`onClose` 保留参数（可复用上下文），`close` 清参数（一次性大对象）。
   参数是整份预览/大数组的面板必须用 `close`，否则宿主内存里一直挂着。
10. **菜单入口要显式清参**：`openPanel(kind)` 对 `typeEditor`/`quickCreate`/`batch` 会先
    `setPanelParams(id, undefined)`，否则「上次从条目表单打开时选中的类型」会粘住下一次菜单打开。
11. **绑定里用 hook 必须写具名函数组件**：内联箭头 `({onClose}) => { useAppContext() … }` 会被
    `react-hooks/rules-of-hooks` 判为「hook 不在组件内」。
12. **插件要发提示/做导航，走 `hostBridge`**（`notify` / `openPanel` / `setHomeVisible` / `getActiveCeshuId`）；
    别自己 import App，也别在插件里复制守卫逻辑。注入的 effect 必须声明在 `openPanel` 之后。
13. **词汇纪律**：策划书=章（阅读序）；交接包=卷 + 编号文档（开发序）。插件化文档不混用。
13. **四道闸**（在 `desktop/`）：
   - `npx vitest run`
   - `npx tsc --noEmit -p tsconfig.node.json --composite false`（+ `tsconfig.web.json` + `tsconfig.test-dom.json`）
   - `npx eslint <改动文件>`（或 `src tests/unit/dom`）
   - `env -u NODE_OPTIONS npm run build`

---

## 9. 结果与后续（Slice 8 完成后）

### 9.1 账本（2026-10-28 收口）

| 面 | 结果 |
|---|---|
| 浮层面板 | **23 / 23**（12 个插件、24 个 `panel` 能力含 demo 示例） |
| 菜单动作 | **35 / 35** 走 `host.commands()`（其中引擎导出 5 条、快照导出 2 条各成命令） |
| 快速入门引导动作 | **12 / 12**（`nav.*`） |
| 侧边栏入口 | 6 / 6 走 panel 能力 id |
| App 里已删除 | `type OverlayPanel`、`PANEL_TITLES`、`renderPanel()` 的 23-case switch、`handleOnboardingAction`、`useDataTransfer` hook、`handleQuit` |

### 9.2 三件使能件（后续新面板/新动作只需用它们，不必改 App）

1. **宿主渲染**：`<HostPanel panelId>` + `host.activePanel()` 单一来源。
2. **共享状态**：`useAppContext()`（types / setTypes / handleJump / refreshUndo / handleDataCleared / afterMutation）。
3. **打开参数 + 宿主 UI 桥**：`host.openPanel(id, params)` / `setPanelParams` / `panelParams`；
   `hostBridge`（`notify` / `openPanel` 含守卫 / `setHomeVisible` / `getActiveCeshuId`）；
   `appActionsIo` 的端口（提示 / 报错 / 刷撤销 / 开预览 / 撤销重做）。

### 9.3 8e 的做法（最后 8 个动作）

- `useDataTransfer` 的 8 个实现搬进 `plugins/appActionsIo.ts`，只依赖**注入端口**（`setAppIoPort`）：
  `{ notify, error, refreshUndo, openPreview, undo, redo }`。hook 版本**已删除**（不留两份实现）。
- 注册为 `app.io.*` 命令；`run()` 不带参数 ⇒ **引擎导出按引擎各成一条**（`app.io.engineExport.unity`…）、
  快照按格式各成一条（`app.io.snapshot.csv`），App 侧只做 `runCommand(`app.io.engineExport.${engine}`)`。
- 撤销/重做：**实现仍住在 `useUndoRedo`**（撤销态是它的 state），命令经端口转交；`undoUi.canUndo/canRedo`
  仍由 App 传给 `MenuBar` 决定禁用态——状态留在 React，动作走命令。

### 9.4 后续可选（都不阻塞当前架构）

1. ~~`MenuBar` 从 `host.commands()` 生成菜单项~~ → **Slice 9 已完成**（`menu` 能力 + `MenuBar` 从 `host.menus()` 渲染）。
2. **`CeshuView` 内部面板**（报告 / 体检 / 路线 / 影响面）：不在本次范围（编辑器内视图，非浮层），
   若要插件化需要新能力类型（如 `view` 的挂载点声明）。
3. ~~`Sidebar` 数据驱动~~ → **Slice 10 已完成**（`sidebar` 能力 + `navigationPlugin`，App 的 `SIDEBAR_ITEMS` 常量删除）。
4. **插件市场 / `source` 字段落地**：契约已留 `source`，尚未有安装流程。

## 10. 文件改动索引

Slice 1：
- `renderer/src/plugins/shortcutsPlugin.tsx`（新增）
- `renderer/src/plugins/HostPanel.tsx`（新增）
- `renderer/src/plugins/builtins.ts`（注册）
- `renderer/src/App.tsx`（`shortcuts` case → HostPanel，删直接 import）
- `tests/unit/dom/shortcutsPlugin.test.tsx`（新增）

Slice 2：
- `renderer/src/plugins/appContext.tsx`（新增）
- `renderer/src/plugins/statisticsPlugin.tsx`（新增）
- `renderer/src/plugins/builtins.ts`（注册）
- `renderer/src/components/StatisticsPanel.tsx`（`types` 改 `useAppContext()`）
- `renderer/src/App.tsx`（`stats` case → HostPanel，删直接 import，加 Provider + `appContextValue`）
- `tests/unit/dom/statisticsPlugin.test.tsx`（新增）

Slice 3：
- `shared/plugin/host.ts`（`openPanel(id, params?)` + `setPanelParams` + `panelParams` + 参数 Map）
- `renderer/src/plugins/reactBindings.tsx`（`PanelBindingProps`：`onClose` + `params?: unknown`）
- `renderer/src/plugins/HostPanel.tsx`（`useSyncExternalStore` 订阅宿主，参数下发绑定）
- `renderer/src/plugins/referencesPlugin.tsx`（新增；`asReferenceTarget` 断言在渲染层）
- `renderer/src/plugins/builtins.ts`（注册 references 插件）
- `renderer/src/App.tsx`（删 `refTarget` state；守卫与跳转改读宿主参数；`references` case → HostPanel）
- `tests/unit/pluginHost.test.ts`（+3：参数同一引用 / 预置与沿用 / 变更通知）
- `tests/unit/dom/referencesPlugin.test.tsx`（新增 4 条：参数下发 / 换参数刷新 / 坏参数不崩 / 命令沿用预置）

Slice 4（8 个不依赖 App 状态的面板）：
- `renderer/src/plugins/utilityPanelsPlugin.tsx`（新增；bundle 形态，8 panel + 8 command）
- `renderer/src/plugins/builtins.ts`（注册）
- `renderer/src/App.tsx`（8 个 case → HostPanel，删 8 个直接 import）
- `tests/unit/dom/utilityPanelsPlugin.test.tsx`（3 条：能力清单 / testid 保留 / 禁用后不再渲染）

Slice 10（侧栏结构插件化）：
- `shared/plugin/types.ts`（新增 `PluginSidebarCapability` / `PluginSidebarItem`，能力扩到六类）
- `shared/plugin/host.ts`（`sidebarItems()`：仅启用插件、按 `order` 升序拼接、`key` 去重）
- `renderer/src/plugins/navigationPlugin.tsx`（新增；1 个 sidebar 能力含 8 条目 + `nav.home` / `nav.agent` 命令）
- `renderer/src/components/Sidebar.tsx`（重写：消费 `PluginSidebarItem[]`，删 `SidebarAction`/`SidebarItem` 类型；高亮按 `item.panel===activePanel`）
- `renderer/src/App.tsx`（删 `SIDEBAR_ITEMS` 常量与 `handleSidebar` 三分支；改为订阅 `sidebarItems` 快照 + `handleSidebarItem` 统一派发）
- `renderer/src/plugins/builtins.ts`（注册 navigation 插件）
- `tests/unit/dom/navigationPlugin.test.tsx`（7 条：结构顺序 / command-panel 互斥 / 合并去重 / nav.home 关浮层 / nav.agent 聚焦 / 不可用提示 / 死链守卫）

Slice 9（菜单结构插件化）：
- `shared/plugin/types.ts`（新增 `PluginMenuCapability` / `PluginMenuItem`，能力扩到五类）
- `shared/plugin/host.ts`（`menus()`：仅启用插件、按 `order` 升序）
- `renderer/src/plugins/menusPlugin.ts`（新增；6 个 menu 能力，35 项 + 子菜单 + 分隔符，testid 原样保留）
- `renderer/src/plugins/menuState.ts`（新增；`disabledWhen` 判定通道，App 注入 undo/redo 可用性）
- `renderer/src/components/MenuBar.tsx`（重写：props 只剩 `host`；从 `host.menus()` 合并渲染；点击派发命令）
- `renderer/src/App.tsx`（删 35 项 `MenuActions` 映射表；注入 `setMenuStateProvider`）
- `tests/unit/menusPlugin.test.ts`（6 条，含「菜单引用的命令都存在」的死链守卫）
- `tests/unit/dom/menuBar.behavior.test.tsx`（重写 9 条：结构来自插件 / 派发命令 / 置灰不派发 / 角部件走命令）

Slice 8e（文件 I/O + 撤销重做命令化）：
- `renderer/src/plugins/appActionsIo.ts`（新增；8 个 I/O 实现 + `setAppIoPort` 注入式端口）
- `renderer/src/plugins/appActionsPlugin.ts`（+17 条命令：`app.io.*` 15 条 + `app.undo`/`app.redo`）
- `renderer/src/hooks/useAppActions.ts`（删 `useDataTransfer`，只留 `useUndoRedo`）
- `renderer/src/App.tsx`（删 `useDataTransfer` 调用；注入 I/O 端口；菜单 35 项全走 `runCommand`）
- `tests/unit/dom/appActionsIo.test.tsx`（10 条：导入/导出/取消/预览/引擎/快照/报错/撤销重做/无端口不抛）

Slice 8d（引导动作命令化）：
- `renderer/src/plugins/onboardingPlugin.tsx`（12 个 `nav.*` command + `COMMAND_BY_ACTION` 派发表）
- `renderer/src/plugins/hostBridge.ts`（新增；宿主 UI 桥）
- `renderer/src/App.tsx`（注入桥；删 `handleOnboardingAction`；`openPanel` 包 `useCallback` 并去掉自递归）
- `renderer/src/plugins/appContext.tsx`（删 `handleOnboardingAction` 过渡字段）
- `tests/unit/dom/onboardingPlugin.test.tsx`（7 条：命令清单 / 创建类带类型 / 导航类走守卫 / 提示类 / 数据设计两分支 / 面板渲染）

Slice 8c 第一批（7 个应用动作）：
- `renderer/src/plugins/appActionsPlugin.ts`（新增；`app-actions` 纯 command 插件 + `notify/setNotifier` 通道）
- `renderer/src/App.tsx`（注入 notifier；7 个菜单项改 `runCommand`；删 `handleQuit`）
- `tests/unit/dom/appActionsPlugin.test.tsx`（6 条：能力清单 / viewAction 派发 / 焦点两分支 / notify 未注入不抛 / 退出）

Slice 8a/8b（浮层塌缩 + 导航动作命令化）：
- `renderer/src/App.tsx`（删 `OverlayPanel` 类型 / `PANEL_TITLES` / `renderPanel()`；`panelId` 订阅宿主；
  `openPanel(panelId, params?)` + `closePanel()` + `runCommand(id)`；菜单 16 项改命令派发）
- `renderer/src/components/Sidebar.tsx`（`panel: string`，高亮按 panel id 比对）
- `renderer/src/plugins/onboardingPlugin.tsx`（新增；最后一个直连面板）
- `renderer/src/plugins/appContext.tsx`（`handleOnboardingAction` 过渡项）
- `tests/unit/dom/render.tsx`（`appContextValue()` 补新字段）

Slice 8 前置（外壳两件）：
- `renderer/src/plugins/shellPanelsPlugin.tsx`（新增；`shell-panels`：`about.panel` 走参数、`plugins.panel` 自举）
- `renderer/src/components/PluginsPanel.tsx`（`SELF_PANEL_ID` 守卫：自举后不能预览自己，否则无限递归 OOM）
- `renderer/src/App.tsx`（2 个 case → HostPanel；`openPanel('about')` 下发版本参数）
- `tests/unit/dom/shellPanelsPlugin.test.tsx`（4 条：能力清单 / 版本参数 / 无版本占位 / 自举列清单）

Slice 7（4 个带打开参数的面板）：
- `renderer/src/plugins/entryPanelsPlugin.tsx`（新增；`entry-panels` bundle，4 面板 + 3 命令）
- `renderer/src/plugins/reactBindings.tsx` / `HostPanel.tsx`（`PanelBindingProps` 加 `close`；HostPanel 实现「清参 + 关」）
- `renderer/src/plugins/appContext.tsx`（加 `afterMutation`）
- `renderer/src/components/PluginsPanel.tsx`（预览面板同步新 prop）
- `renderer/src/App.tsx`（删 3 份 state + 2 个同形回调；`openPanel` 菜单入口清参；4 个 case → HostPanel）
- `tests/unit/dom/entryPanelsPlugin.test.tsx`（5 条：能力清单 / 预选类型 / 无参回落第一个类型 / 快速创建带类型 / 导入预览参数与坏参数）

Slice 6（2 个依赖动作的面板）：
- `renderer/src/plugins/maintenancePanelsPlugin.tsx`（新增；`maintenance-panels` bundle）
- `renderer/src/plugins/appContext.tsx`（`AppContextValue` 加 `handleDataCleared`）
- `renderer/src/plugins/builtins.ts` / `renderer/src/App.tsx`（注册 / 2 个 case → HostPanel / context 值补字段）
- `tests/unit/dom/render.tsx`（新增 `appContextValue()` 工厂：context 加字段只改一处，不再改一圈测试）
- `tests/unit/dom/maintenancePanelsPlugin.test.tsx`（3 条：能力清单 / 清空走 context 动作 / 备份面板渲染）

Slice 5（3 个只依赖共享状态的面板）：
- `renderer/src/plugins/dataPanelsPlugin.tsx`（新增；`data-panels` bundle，绑定内 `useAppContext()`）
- `renderer/src/plugins/builtins.ts`（注册）
- `renderer/src/App.tsx`（3 个 case → HostPanel，删 3 个直接 import）
- `tests/unit/dom/dataPanelsPlugin.test.tsx`（3 条：能力清单 / types 经 context 注入 / 无 onClose 面板可挂）
