# CeshuView / App 拆分依据分析（Wave 3 前置）

> 目的：**用数据决定怎么拆，而不是拍脑袋**。本文只做度量与推导，不动代码。
> 度量时间：2026-10-19，基线 `628a8bd`。方法：脚本提取 `useState` / 渲染点 / 读写行号
> （命令见文末「复现」），再人工核对语义。

---

## 0. 结论先行

1. **两个文件比文档记录的更小**：`CeshuView` 780 行（文档写 926，W0 删面板后已缩）、
   `App` 681 行（文档写 838）。行数不是主要矛盾。
2. **~~真正的阻塞点不是「组件太大」，是 12 份重复的 `busy + error` 模板~~ —— 本条已被
   实测推翻（2026-10-19 补正）**：12 处 `try/catch` **共享同一个 catch 尾巴，但前置与收尾
   有 5 种形态**，真正逐字同构的只有 5 处（见 §5）。按 S1 抽象后**净行数是 +8**
   （注释 30 行 > 去重省下的 21 行）。⇒ **「拆之前必须先收敛模板」这个论断不成立**，
   收敛它带来的收益是「`finally` 不再被漏写」，不是行数，也不足以支撑后续拆分。
3. **`doc` 是唯一真正的跨面板共享数据**（57 读 / 9 写），但 9 个写入点**全部在 handler 内**，
   没有一处散落在 JSX 里 ⇒ 可以整体收进一个 hook。
4. **13 个策划书面板 + 21 个浮层彼此零交叉引用**：每个面板只吃 `doc` 的切片和自己的数据。
   这说明「拆面板」不成立（它们已经是独立组件），成立的是「**把面板路由搬出去**」。
5. 推荐顺序：**先收敛模板 → 再抽数据 hook → 再搬面板路由**。反过来做会把耦合放大。

---

## 1. 度量基线

| 指标 | CeshuView.tsx | App.tsx |
|---|---|---|
| 行数 | 780 | 681 |
| `useState` | 14 | 15 |
| `useEffect` | 2 | 7 |
| `useCallback` | 3 | 4 |
| 顶层 handler | 20 | 20 |
| 渲染分支 | 13 路互斥 ternary | 21 个 panel 的 switch |
| 最大单块 | render 区 L469–780（约 310 行） | `renderPanel` L455–680（226 行） |
| 子组件（同目录） | 15 个面板 | 21 个浮层 |

---

## 2. CeshuView 状态清单（14 个）

| 状态 | 行 | 读 | 写 | 类别 | 消费方 |
|---|---|---|---|---|---|
| `doc` | 93 | 57 | 9 | **共享数据** | 10 个面板 + 默认三栏 + 工具栏标题/进度 |
| `panel` | 101 | 15 | 28 | **路由** | 13 路 ternary + 工具栏 |
| `error` | 95 | 10 | 25 | **全局 chrome** | 错误条 |
| `notice` | 96 | 4 | 19 | **全局 chrome** | 提示条 |
| `busy` | 97 | 11 | 17 | **全局 chrome** | 工具栏禁用 + ChapterForm |
| `activeChapter` | 94 | 6 | 4 | 章节局部 | 导航高亮 / ChapterForm / TemplateEditorPanel |
| `changelog` | 117 | 14 | 2 | 面板私有 | ChangelogPanel |
| `validateErrors` | 118 | 4 | 2 | 面板私有 | ValidatePanel |
| `score` | 119 | 10 | 2 | 面板私有 | ScorePanel |
| `aiGenTarget` | 123 | 2 | 3 | **跨面板入参** | CeshuDataPreview → AiDataGenPanel |
| `exportFormat` | 98 | 4 | 2 | 工具栏局部 | 导出格式下拉 |
| `moreOpen` | 121 | 5 | 5 | 工具栏局部 | 「更多」下拉 |
| `deriveOpen` | 99 | 2 | 5 | 派生局部 | 派生面板开合 |
| `deriveNote` | 100 | 3 | 3 | 派生局部 | 派生说明输入 |

**读法**：只有前 5 行是「拆到哪都要带着走」的。中间 5 行各归一个面板，天然可以跟着面板走。
后 4 行是局部 UI，搬不搬都行。

`doc` 的 9 个写入点：L151（加载）、L180（保存章节）、L298（设为激活）、
L426 / L433 / L448 / L461 / L468（五个 `onApplied` 回调）—— **全在 handler 里**。

---

## 3. App 状态清单（15 个）

| 状态 | 行 | 读 | 写 | 类别 | 消费方 |
|---|---|---|---|---|---|
| `types` | 101 | 25 | 3 | **共享数据** | 12 个浮层 + CeshuView + 状态栏 |
| `panel` | 107 | 10 | 28 | **路由** | `renderPanel` 的 switch |
| `notice` | 103 | 6 | 15 | 全局 chrome | 提示条 |
| `error` | 102 | 4 | 7 | 全局 chrome | 错误条 |
| `ceshuHomeVisible` | 125 | 2 | 7 | **视图切换** | 首页 ↔ 编辑器 |
| `activeCeshuId` | 123 | 4 | 5 | **视图切换** | 同上 + 首页高亮 |
| `ceshuList` | 122 | 2 | 3 | 首页数据 | CeshuHomePanel |
| `theme` | 109 | 7 | 2 | 全局偏好 | 状态栏切换 + `applyTheme` |
| `gameStyle` | 136 | 4 | 2 | 全局偏好 | CeshuView → 数据预览 |
| `refTarget` | 138 | 7 | 4 | **跨面板入参** | → ReferencesPanel |
| `typeEditorTarget` | 140 | 2 | 4 | **跨面板入参** | → TypeEditorPanel |
| `quickCreateTarget` | 145 | 3 | 3 | **跨面板入参** | → QuickCreatePanel |
| `jumpTarget` | 147 | 4 | 3 | **跨面板入参** | → CeshuView → CeshuDataPreview |
| `dataEpoch` | 153 | 3 | 3 | **数据纪元** | CeshuView → 数据预览 key |
| `info` | 100 | 6 | 2 | 应用元信息 | 关于面板 + 状态栏 |

**读法**：`types` 是 App 侧的 `doc` 等价物。四个 `*Target` 是同一类东西 ——
「A 处触发 → 写一个入参 → 开 B 面板 → B 消费完回调清空」。它们**不是共享状态**，
是**一次性传参**，只是借用了 state 而已。这一区分很重要：拆分时它们该跟着「打开面板」的
那个动作走，而不是留在顶层当共享状态。

---

## 4. 面板依赖矩阵

### 4.1 CeshuView（13 个分支）

| 面板 | 依赖 | 回调 |
|---|---|---|
| AiReviewPanel | `doc.ceshu_id` | onClose |
| AiFullGeneratePanel | `doc` | onApplied, onClose |
| VersionDiffPanel | `doc.ceshu_id` | onClose |
| VersionTimelinePanel | `doc.ceshu_id` | onSelect, onClose |
| AiDataGenPanel | `doc.ceshu_id` + `aiGenTarget` | onClose |
| PresetMarketPanel | `doc.ceshu_id` | onApplied, onClose |
| SystemConfirmPanel | `doc.ceshu_id` | onApplied, onClose |
| TemplateEditorPanel | `doc` + `activeChapter` | onApplied, onClose |
| ChapterNotesPanel | `doc.ceshu_id` | onClose |
| CeshuDataRefsPanel | `doc` + `types` | — |
| ChangelogPanel | `changelog` | onExport, onClose |
| ValidatePanel | `validateErrors` | onExport, onClose |
| ScorePanel | `score` | onExport, onClose |
| **ChapterForm**（默认布局） | `doc[activeChapter]` + `busy` | onSave, onAiGenerate, onAiGenerateField |
| **CeshuDataPreview**（默认布局） | `doc` + `types`/`gameStyle`/`dataEpoch`/`jumpTarget` | 6 个 |

**关键事实**：13 个面板里 **7 个只吃 `doc.ceshu_id` 一个字段**；3 个（Changelog/Validate/Score）
连 `doc` 都不需要，只吃自己的数据。**没有任何面板读另一个面板的状态。**

### 4.2 App（21 个浮层）

| 依赖 | 数量 | 面板 |
|---|---|---|
| 不需要任何共享状态 | **11** | attrSystem, dataDiff, backup, imageGen, gameDataPreview, shortcuts, clearAll, settings, cleanupImages, keywordTemplates, agentEditor |
| 只需 `types` | 5 | stats, advancedSearch, relationGraph, attributeChart, onboarding |
| `types` + 入参 | 4 | quickCreate(`quickCreateTarget`), batch(`firstType`), references(`refTarget`), typeEditor(`typeEditorTarget`) |
| 其它 | 1 | about(`info`) |

**关键事实**：**11 个浮层零共享依赖** —— 这是整个仓库里风险最低的拆分切入点，
可以拿它们验证「面板宿主」这套机制，再动有依赖的那些。

---

## 5. 重复模板：实测分类（**推翻初版结论**）

初版本文写「12 份逐字同构」，**这是错的**。逐行核对后是 5 种形态：

| 形态 | handler | 前置 | 收尾 | 能否共用 |
|---|---|---|---|---|
| **S1** | derive / setActive / showChangelog / validate / score | `setError(null)` + `setBusy(true)` 在 try 内 | `finally setBusy(false)` | ✅ 5 处，已抽 `runBusy` |
| **S2** | save / autoFill | `setBusy(true)` 在 try **外** | 成功时 `setError(null)` | ❌ 清错时机相反 |
| **S3** | exportScore / exportValidation / exportChangelog | `setError(null)` + `setNotice(null)` | **无 busy、无 finally** | ❌ 套进来会凭空让按钮变灰 |
| **S4** | export | 清错清提示 → 选文件 → **才** `setBusy(true)` | `finally` | ❌ 刻意不在系统对话框期间灰界面 |
| **S5** | aiGenerate / aiGenerateField | 无 try | 直接 throw 给表单 | ❌ 不捕获 |

实测计数：`setError(null)` ×12、`setError(toErrorMessage)` ×12、`setBusy(true/false)` ×8 对 ——
**「共享 catch 尾巴」是真的，「逐字同构」是假的**。

### 落地结果（S1 抽象后）

- 5 处 handler 从各 ~14 行降到 ~7 行（代码净 −21 行）；
- `runBusy` 含注释 +29 行 ⇒ **文件净 +8 行**；
- 真正的收益：`finally` 不会再被漏写（漏写 = 按钮永久变灰且无任何提示）。

⇒ **结论修正**：这一步值得做，但它是「防一类 bug」，不是「减行数」，更**不足以**成为
后续拆分的理由。原先「不收敛模板就拆 = 各自接 3 个 setter」的说法随之失效 ——
因为本来就只有 5 处能收敛，剩下 7 处拆分后仍会各带自己的 try/catch。

## 6. 由数据推出的接缝（含耦合度）

| 接缝 | 内容 | 需要穿过的状态 | 耦合度 | 风险 |
|---|---|---|---|---|
| **A. UI 反馈模板** | 12 份 `busy+error` → `useUiFeedback()` 的 `run()` | 无（内部持有） | 低 | 时序：`setError(null)` 与 `setBusy(true)` 的先后、`finally` 的解忙 |
| **B. 文档数据** | `doc` + 9 个写入点 → `useCeshuDocument(ceshuId)` | 返回 `{doc, loading, error, actions}` | 中 | 加载失败路径（W2 刚修过，有测试） |
| **C. CeshuView 面板路由** | 13 路 ternary → `CeshuPanelHost` | `doc`/`aiGenTarget`/`activeChapter`/3 个报告数据 + 5 个回调 | 中 | 分支顺序与 `key={doc.ceshu_id}` 的重挂载语义 |
| **D. App 面板路由** | `renderPanel` 226 行 switch → `AppPanelHost` | `panel`/`types`/4 个入参 + 5 个回调 | 低-中 | 无状态耦合，纯入参；先抽 9 个零依赖面板验证 |
| **E. App 启动引导** | 7 个 effect → `useAppBootstrap()` | 返回 `info`/`types`/`ceshuList`/`theme` 等 | 中 | 启动顺序与 `library:changed` 广播的时序 |

**顺序依赖**：A → B → C；D 可独立并行；E 最后（它写的是 `info`/`types`，会被 D 消费）。

> ⚠️ **A 完成后需重新评估 B/C 是否值得做**：A 的实测收益远低于初版预期（净 +8 行，
> 且只覆盖 5/12 处）。原计划把 A 当作「拆分前置」的前提已不成立 ——
> 剩余 7 处形态各异的 try/catch 不会因为 A 而变整齐。继续 B/C 前应先确认：
> **拆开之后，`doc` 与 3 个 UI 状态真的会更清楚吗，还是只是换了个地方写？**

---

## 7. 推荐做法与验证

| 步 | 动作 | 验证方式 | 预期收益（按当前行数推算） |
|---|---|---|---|
| 1 | ✅ **已完成**：`runBusy`（S1 五处归一） | DOM 14 条 + e2e 整包 73/2/0 | 代码 −21 行 / 含注释净 **+8 行**；防 `finally` 漏写 |
| 2 | 抽 `useCeshuDocument`（接缝 B） | 同上 + 加载失败路径已有测试 | 加载 effect（30 行）+ 5 个 `onApplied` 写回迁出，CeshuView −约 100 行 |
| 3 | 抽 `CeshuPanelHost`（接缝 C） | e2e 面板开关全量（版本对比/时间线/笔记/模板…） | render 区约 310 行迁出，主组件余约 300 行 |
| 4 | 抽 `AppPanelHost`（接缝 D），**先只搬 11 个零依赖面板** | e2e 对应面板 + 新增 DOM 测试 | `renderPanel` 226 行迁出，App 余约 450 行，且零行为风险 |
| 5 | 抽 `useAppBootstrap`（接缝 E） | 启动类 e2e（library-bar / smoke / onboarding） | 7 个启动 effect（约 200 行）迁出，App 余约 250 行 |

> 收益列是**推算值**（当前行数 − 迁出行数），不是承诺。每步落地后按实际 diff 校准。

**每一步单独提交、单独跑四道门 + e2e 整包**。任一步 e2e 出现新增红灯即回滚该步。

---

## 8. 明确不推荐的做法

| 做法 | 为什么数据不支持 |
|---|---|
| **按渲染层拆**（header / content / footer 三个文件） | `doc` 的 57 个读取点会被劈成两半（工具栏要标题/进度，内容区要数据），结果是同一个 `doc` 从两处传入，props 反而变多 |
| **按行数硬切**（前 400 行一个文件、后 380 行一个文件） | 切点落在 handler 中间，会切出「半个 handler」，语义不成立 |
| **先拆面板组件** | 13 个面板**已经是独立组件**（各 100–300 行），再拆没有收益；要动的是「谁来决定渲染哪个」 |
| **引入状态管理库（zustand/redux）替代 props** | 当前只有 1 个真正共享状态（`doc`）和 1 个（`types`），引入全局 store 是拿新依赖换更差的可见性；`doc` 的写入点只有 9 个，hook 足够 |
| **一次性拆完再验证** | 接缝 A–E 有顺序依赖（A 是 B/C 的前置），一次拆完无法定位是哪步引入的回归 |

---

## 9. 数据没有回答的问题（诚实边界）

1. **`busy` 是否真的需要全局一个**：`ChapterForm` 与工具栏共用同一个 `busy`，
   但用户可能希望「导出时仍能编辑」。这是产品决策，不是结构问题 —— 拆之前得先定。
2. **`panel` 是 13 个字符串还是应该带参数的对象**：`aiGenTarget` 的存在说明
   「打开某面板时携带参数」已经出现了，未来若再加两个，字符串枚举会不够用。
   现在只有 1 个，**不建议提前抽象**。
3. **`dataEpoch` 的语义**：它靠递增触发 `key` 重挂载，属于「用 key 强制刷新」的隐式契约。
   拆分时容易被漏掉（漏了就是「清空数据后预览不刷新」）。这条已写进本文，别再靠记忆。

---

## 10. 复现（度量命令）

```bash
cd desktop
# 状态清单与读写次数
node -e 'const fs=require("fs");const s=fs.readFileSync("src/renderer/src/components/CeshuView.tsx","utf8");
const re=/const \[([A-Za-z0-9_]+),\s*(set[A-Za-z0-9_]+)\]\s*=\s*useState/g;let m;
while((m=re.exec(s))){const n=m[1],t=m[2];
console.log(n, "reads="+(s.match(new RegExp("\\b"+n+"\\b","g"))||[]).length,
"writes="+(s.match(new RegExp("\\b"+t+"\\b","g"))||[]).length)}'
# 重复模板计数
grep -c "setError(null)" src/renderer/src/components/CeshuView.tsx
grep -c "setBusy(true)" src/renderer/src/components/CeshuView.tsx
# 面板分支
grep -c "panel === '" src/renderer/src/components/CeshuView.tsx
```
