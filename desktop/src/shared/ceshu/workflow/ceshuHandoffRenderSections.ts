import type { CeshuDocument } from '../reference'
import { isFilledValue } from '../model'
import { readPath } from './ceshuHandoffPaths'

/**
 * 少数文档的**专属附加章节**：脚手架、研发拆解、接口契约、性能排查。
 *
 * 这些内容只在对应文档里出现（`arch-scaffold` / `eng-wbs` / `arch-api` / `polish-perf`），
 * 与通用正文无关，单独放在这里，避免把单份文档的渲染函数撑大。
 */

/** 脚手架文档的引擎分支指令（编码 AI 拿到后第一步做什么） */
type EngineFamily = 'ue5' | 'unity' | 'godot' | 'custom' | 'unknown'

function detectEngineFamily(engine: string): EngineFamily {
  const e = engine.toLowerCase()
  if (e.includes('unreal') || /\bue\s?\d/.test(e) || e.includes('虚幻')) return 'ue5'
  if (e.includes('unity') || e.includes('团结')) return 'unity'
  if (e.includes('godot')) return 'godot'
  if (e.includes('自研') || e.includes('custom') || e.includes('cocos') || e.includes('laya') || e.includes('egret')) return 'custom'
  return 'unknown'
}

export function renderScaffoldSection(doc: CeshuDocument): string {
  const engine = readPath(doc.tech, 'engine')
  const engineText = isFilledValue(engine) ? String(engine) : ''
  const family = detectEngineFamily(engineText)
  const lines: string[] = []
  lines.push('## 工程脚手架（按引擎分支，编码 AI 照做）')
  lines.push('')
  if (family === 'unknown') {
    lines.push('> ⚠️ `tech.engine` 未填写或无法识别，无法给出确定脚手架。先回「引擎与技术栈」定引擎，再生成本段。')
    lines.push('')
    lines.push(
      '通用底线（无论什么引擎都成立）：① 目录按「数据层 ← 玩法层 ← 界面层」单向划分；② 数值与配置走数据驱动文件（不写死在代码）；③ 入口点唯一；④ 先落「状态机骨架 + 存档 + 最小可玩循环」，再铺系统。'
    )
    lines.push('')
    return lines.join('\n')
  }
  const blocks: Record<EngineFamily, { create: string; layout: string; entry: string; build: string }> = {
    ue5: {
      create:
        '基于 Lyra 样板新建 C++ 项目（或空白 C++ 模板），启用插件 **Gameplay Ability System** 与 **Enhanced Input**；在 `.uproject` 的 `Plugins` 里确认 GAS 已开。',
      layout:
        '`Source/<项目>/AbilitySystem/`（技能/属性）、`Source/<项目>/Gameplay/`（状态机/循环）、`Source/<项目>/UI/`（UMG）、`Content/` 放 `DataTable`/`DataAsset`；配置走 `DataTable`，代码只读取。',
      entry:
        '默认地图的 `AGameModeBase` + `APlayerController` 为入口；首个可玩场景挂 `GameState` 驱动核心循环；数值从 `DataTable` 加载，不写死。',
      build: '编辑器 **Play** 即跑；出包用 `RunUAT BuildCookRun`（Win64/Mac/IOS/Android）。CI 用 `UnrealBuildTool` 编译。'
    },
    unity: {
      create: 'Unity 2022 LTS 新建项目，渲染管线选 **URP** 或 **HDRP**；通过 Package Manager 装 `Addressables`、`Input System`；按需装 `DOTS(ECS)`/`YooAsset`。',
      layout:
        '`Assets/Scripts/Core/`（配置/存档）、`Assets/Scripts/Gameplay/`（状态机/循环）、`Assets/Scripts/UI/`（UGUI）、`Assets/Data/` 放 `ScriptableObject` 数值表；资源走 Addressables。',
      entry: '启动 `Scene` 挂 `GameManager`（单例）为入口；核心循环由 `GameManager` 状态机驱动；数值从 `ScriptableObject` 读取，不写死。',
      build: '编辑器 **Play** 即跑；出包用 **Build Settings / Addressables Build**；CI 用 `Unity -batchmode -buildTarget`。'
    },
    godot: {
      create: 'Godot 4.x 新建项目，渲染用兼容后端（GL/Vulkan）；脚本语言按团队选 C# 或 GDScript。',
      layout:
        '`res://core/`（配置/存档）、`res://gameplay/`（状态机/循环）、`res://ui/`（Control 场景）、`res://data/` 放 `Resource` 数值表；数值走 `Resource`/`JSON`。',
      entry: '`Main` 场景的 `GameManager`（Node）为入口；`SceneTree` 管理状态切换；数值从 `Resource` 读取，不写死。',
      build: '编辑器 **F5 / Run Project** 即跑；出包用 **Project → Export**；CI 用 `godot --headless --export-release`。'
    },
    custom: {
      create:
        '自研/指定引擎：先定语言与构建系统（如 C++ + CMake / Rust + cargo / TS + Vite），建可空跑的 `main` 入口；把 `third_party_deps` 列的依赖接进构建。',
      layout: '按 `core_architecture` 的模块边界建目录（数据层 ← 玩法层 ← 界面层），每层一个 `src/<module>`；配置走 JSON/自定义格式，代码只读。',
      entry: '唯一 `main`/`index` 入口；核心循环由自写状态机驱动；数值从配置文件加载，不写死。',
      build: '用选定构建系统编译运行（如 `cmake --build` / `cargo run` / `vite dev`）；出包走对应 target。'
    },
    unknown: { create: '', layout: '', entry: '', build: '' }
  }
  const b = blocks[family]
  lines.push(`> 检测到引擎：**${engineText}** → 走 **${family.toUpperCase()}** 脚手架。`)
  lines.push('')
  lines.push('### 1. 建工程')
  lines.push('')
  lines.push(b.create)
  lines.push('')
  lines.push('### 2. 目录布局')
  lines.push('')
  lines.push(b.layout)
  lines.push('')
  lines.push('### 3. 入口点')
  lines.push('')
  lines.push(b.entry)
  lines.push('')
  lines.push('### 4. 构建 / 运行')
  lines.push('')
  lines.push(b.build)
  lines.push('')
  lines.push('### 5. 首批落地（顺序）')
  lines.push('')
  lines.push('- 先把「架构卷·状态机」的转移写成代码骨架（空行为即可，逻辑后续填）')
  lines.push('- 接「存档与兼容」的读写（哪怕只存一个关卡进度）')
  lines.push('- 跑通「核心玩法卷·核心循环」的最小一局（进入 → 操作 → 结算 → 再来一次）')
  lines.push('- 以上三条跑通前，不要铺任何系统（装备/技能/经济）——它们在后面卷，顺序做。')
  lines.push('')
  return lines.join('\n')
}

/**
 * 研发任务拆解：把架构卷 + 各系统章的设计翻译成分阶段任务清单。
 * 从 `doc` 现算（表数/状态数/关卡数/流程数/启用系统），不写死——设计变了清单跟着变。
 */
export function renderEngineeringWbsSection(doc: CeshuDocument): string {
  const count = (value: unknown): number => (Array.isArray(value) ? value.length : 0)
  const tableCount = count(doc.tech.data_tables)
  const stateCount = count(doc.gameplay.state_machine)
  const levelCount = count(doc.level_design.level_table)
  const flowCount = count(doc.uiux.core_flows)
  const langCount = count(doc.accessibility.language_list)

  const enabledSystems: string[] = []
  for (const [key, entry] of Object.entries(doc.systems ?? {})) {
    const item = entry as { enabled?: boolean; name?: string } | null
    if (item !== null && typeof item === 'object' && item.enabled === true) {
      enabledSystems.push(`${key}（${item.name ?? key}）`)
    }
  }

  const lines: string[] = []
  lines.push('## 研发任务拆解（按阶段，程序照单施工）')
  lines.push('')
  lines.push(
    '> 本清单从架构卷 + 各系统章派生：每阶段独立验收，顺序不可跳（框架 → 玩法 → 系统 → 内容 → 界面 → 打磨）。每条任务的验收列是可判定锚点。'
  )
  lines.push('')

  const table = (rows: string[]): void => {
    lines.push('| # | 任务 | 依赖 | 交付物 | 验收 |')
    lines.push('| --- | --- | --- | --- | --- |')
    lines.push(...rows)
    lines.push('')
  }

  lines.push('### M1 · 框架骨架（先跑起来，不写玩法）')
  lines.push('')
  table([
    '| 1.1 | 建工程（照 `00-架构/06-工程脚手架`） | — | 空场景可编译运行 | 进主菜单不崩 |',
    `| 1.2 | 数据表加载管线 | 1.1 | 读数据文件建库（${tableCount || '全部'} 张表） | 改数据不改代码即生效 |`,
    `| 1.3 | 状态机骨架 | 1.1 | ${stateCount || '全部'} 条转移的空实现 | 主菜单→游戏→结算→回主菜单 |`,
    '| 1.4 | 存档读写 | 1.2 | 存/读/删档 + 版本迁移 | 删档回初始态 |'
  ])

  lines.push('### M2 · 核心玩法（第一条可玩链路）')
  lines.push('')
  table([
    '| 2.1 | 核心循环 | 1.3 | 一局可玩 | 从头玩到尾不卡死 |',
    '| 2.2 | 伤害公式（战斗章唯一源） | 1.2 | 战斗结算 | 与「战斗·伤害公式」逐条一致 |',
    '| 2.3 | 数值参数表 | 1.2 | 参数常量 | 无魔法数字，数值断言复算通过 |'
  ])

  lines.push('### M3 · 系统（按已启用系统逐条做）')
  lines.push('')
  if (enabledSystems.length === 0) {
    lines.push('- （当前没有启用系统；先在「文档信息 → 游戏系统」启用，再做本阶段）')
    lines.push('')
  } else {
    table(
      enabledSystems.map(
        (name, index) => `| 3.${index + 1} | 系统 · ${name} | 2.1 | 配置读取 + 规则实现 | 配置表能读、数值可追到参数表 |`
      )
    )
  }

  lines.push('### M4 · 内容（关卡与敌人）')
  lines.push('')
  table([
    `| 4.1 | 关卡表批量生产（${levelCount || '按内容量'} 关） | 2.1 | 数据驱动关卡 | 新增一关只改数据 |`,
    '| 4.2 | 难度曲线校验 | 4.1 | 首关最低、Boss 最高 | 与难度曲线同向 |'
  ])

  lines.push('### M5 · 界面（UI 与交互）')
  lines.push('')
  table([
    `| 5.1 | 信息架构与流程（${flowCount || '全部'} 条流程） | 2.1 | 每个流程可走通 | 从入口到出口无断点 |`,
    '| 5.2 | 反馈规则 | 5.1 | 等待/失败/成功反馈 | ≥3 秒等待有可见进度；破坏性操作二次确认 |'
  ])

  lines.push('### M6 · 打磨（性能 / 埋点 / 本地化）')
  lines.push('')
  table([
    '| 6.1 | 性能达标 | 5.1 | 目标机型最低档达标 | 帧率/内存不超预算 |',
    '| 6.2 | 埋点接入 | 2.1 | 关键事件上报 | 日志字段与埋点表一致 |',
    `| 6.3 | 本地化（${langCount || '首发'} 语言） | 5.1 | 界面无截断/乱码 | 首发语言全链路可读 |`
  ])

  lines.push('> 排期与人力见「资源规划」；里程碑见「技术·开发里程碑」。本清单只定「做什么、什么顺序、怎么验收」，不含具体工时。')
  lines.push('')
  return lines.join('\n')
}

/**
 * 模块接口契约工作表：模块边界与数据契约见上文两字段，这里补「接口怎么定 + 统一约定」。
 * 不重渲染字段（避免和「规则与数据」重复），只给可填空的表与硬约束。
 */
export function renderApiContractSection(): string {
  return [
    '## 模块接口契约（工作表，程序填完再开工）',
    '',
    '> 模块边界见上「核心架构」，数据结构见上「数据表」。本表把边界落成可实现的接口——函数签名由程序补全，但**不能跳过不定义**。',
    '',
    '### 接口清单（每个模块至少一行）',
    '',
    '| 接口 | 输入 | 输出 | 依赖 | 错误码 |',
    '| --- | --- | --- | --- | --- |',
    '| 模块名.函数名 | 参数与类型 | 返回与类型 | 依赖模块 | 如 E_INVALID_INPUT |',
    '',
    '### 统一约定（必须遵守）',
    '',
    '- 模块单向依赖：数据层 ← 玩法层 ← 界面层，禁止反向调用',
    '- 跨模块只走公开接口，不直接读写对方内部状态',
    '- 错误码统一前缀（E_ 错误 / W_ 警告），错误不吞、不静默',
    '- 跨模块的数据结构有明确字段与类型（不只是表名）',
    ''
  ].join('\n')
}

/** 性能优化 playbook：超预算时按这个顺序砍，而不是一上来降画质 */
export function renderPerfPlaybookSection(): string {
  return [
    '## 超预算排查顺序（按这个顺序砍，别一上来降画质）',
    '',
    '1. **先定位**：用「性能预算」的测量方法逐项测，找出真正超标的项（帧率 / 内存 / 加载 / 包体）。',
    '2. **帧率超标**：先查 GC 与每帧对象创建 → 再查同屏单位数 → 再查特效与后处理 → 最后才降画质。',
    '3. **内存超标**：先查资源泄漏（切场景未释放）→ 再查贴图尺寸与 mipmap → 再查对象池。',
    '4. **加载超标**：先查同步 IO → 再查资源体积 → 再查分包与按需下载。',
    '5. **发热 / 耗电**：限帧（45→30）→ 降频 → 省电模式。',
    '6. **每次优化后复测**，记录优化前后对比，避免「优化了但没测」。',
    ''
  ].join('\n')
}
