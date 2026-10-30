import {
  CHAPTER_LABELS,
  chapterAnchorOf,
  type CeshuDocument,
  type ChapterKey,
  type SystemEntry
} from '../reference/ceshuConstants'
import { GENRE_REVIEW_PROFILES, resolveGenreProfileKey, type GenreProfileKey } from '../prompts/ceshuAiData'
import { CESHU_CHAPTER_FIELDS, fieldColumns, fieldLabelOf } from '../fields/ceshuFields'
import { deriveRulesetId, getGddScope, isFilledValue } from '../model/ceshuModel'
import { column, toRowStrings } from './ceshuPipeRows'
import { SYSTEM_CONFIG_SCHEMA } from '../model/systemConfigSchema'
import { validateCeshu } from '../validation/ceshuValidation'
import { resolveValidationChapter } from '../validation/ceshuValidationJump'
import { computeReadiness } from '../readiness/ceshuReadiness'
import { findCouplingGaps } from './ceshuCoupling'

/**
 * **开发交接包·分卷 + 分文档模型**（2026-10-27 第二轮改造）。
 *
 * ## 为什么从「6 个平铺 md」改成「卷文件夹 + 编号文档」
 * 用户的判断：每份设计文档只干一件事（装备怎么设计、数值怎么搞、词条怎么搞），
 * 按顺序开发，文件名开头用数字标顺序；一个游戏一个文件夹，打开是**卷文件夹**，再打开是文档。
 *
 * 对实现方更友好：一次只需读一份 100–200 行的文档，而不是 1300 行的大章。
 * 但**不能拆到一个字段一份**（340 个文件没人看得完）。这里的粒度是
 * **一个能独立验收的施工单元**：一份文档 = 一条规则 / 一个系统。
 *
 * ## 结构
 * ```
 * <游戏>-交接包/
 *   README.md                施工总纲（目录树 + 门禁）
 *   00-架构/README.md        卷内目录（打开文件夹先看它）
 *   00-架构/01-范围与平台.md
 *   00-架构/02-引擎与技术栈.md
 *   ...
 * ```
 *
 * ## 不变量
 * - 卷的 `keyFields` **由文档派生**（不手写第二份，避免文档与卷口径漂移）；
 * - 文档里的字段 key 必须真实存在于 schema（守卫 `tests/unit/ceshuHandoff.test.ts`）；
 * - 纯函数：不碰文件系统、不读系统时间；`doc` 显式传参（无模块级可变状态）。
 */

export type HandoffVolumeId =
  | 'architecture'
  | 'core_loop'
  | 'content'
  | 'systems'
  | 'interface'
  | 'polish'
  | 'engineering'

/** 文档里必须写死的一个字段 */
export interface HandoffDocField {
  chapter: ChapterKey
  field: string
  /** 为什么这份文档必须写清它（缺了会怎样） */
  why: string
}

/** 文档里必须写清的一个游戏系统（`systems` 章的配置块） */
export interface HandoffDocSystem {
  /** 系统 id：battle / equipment / item / growth …（见 `SYSTEM_CONFIG_SCHEMA`） */
  key: string
  why: string
}

/**
 * 条件文档的触发条件（**任一满足**即出现）。
 *
 * 与品类裁剪的分工：`genres` 管「这个玩法要不要」，`when` 管「这个项目有没有这件事」
 * （有没有音频引擎、联不联机）。两者独立，可叠加。
 */
export type HandoffDocCondition =
  | { kind: 'field'; chapter: ChapterKey; field: string }
  | { kind: 'system'; key: string }
  | { kind: 'fieldOneOf'; chapter: ChapterKey; field: string; values: string[] }

/**
 * 文档层级（对应「先通用、后玩法变化」的顺序）：
 * - `baseline` 通用基线：任何游戏都要做；
 * - `genre` 品类专属：由 `game_type` / `game_type_tags` 决定增减；
 * - `conditional` 条件文档：由项目事实（音频引擎、联机形态）决定出现与否。
 */
export type HandoffDocLayer = 'baseline' | 'genre' | 'conditional'

/**
 * 验收条目的判定方式：
 * - `assertion`：挂 `contract.json` 的断言（机器可判，复算通过才算过）；
 * - `test`：自动化测试（脚本/单测）；
 * - `manual`：人工判定（缺省）。
 *
 * 为什么要有：只有自然语言验收时，编码智能体只能「觉得自己做完了」。
 * 标了判定方式，它才知道该跑断言、跑测试，还是交给人看。
 */
export type HandoffAcceptanceCheck = 'assertion' | 'test' | 'manual'

/**
 * 验收条目：字符串 = 人工判定（保持既有写法不变）；对象 = 显式标注判定方式。
 * 兼容两种形态是为了不让 30 多份文档的 `acceptance` 一次性重写——新写的用对象，老的不用动。
 */
export type HandoffAcceptance = string | { text: string; check?: HandoffAcceptanceCheck }

/** 验收条目的文字（两种形态统一取文本） */
export function acceptanceText(item: HandoffAcceptance): string {
  return typeof item === 'string' ? item : item.text
}

/** 验收条目的判定方式（字符串缺省人工） */
export function acceptanceCheck(item: HandoffAcceptance): HandoffAcceptanceCheck {
  return typeof item === 'string' ? 'manual' : (item.check ?? 'manual')
}

/**
 * 冲突裁决优先级（README 与 `index.json` 共用同一份，顺序即优先级）。
 *
 * 为什么要写死：交接包里同一个事实可能在两处出现（如伤害公式在交接文档与 contract 都有）。
 * 编码智能体遇到矛盾时若靠猜，十次有九次猜错——必须给它一条确定的链。
 */
export const HANDOFF_PRECEDENCE: readonly string[] = [
  'contract.json —— 规则 / 参数 / 断言 / 验收旅程；与任何文档冲突时以它为准',
  'data/snapshot.json（结构见 schema.json）—— 内容行的唯一来源，代码里不许硬编码',
  '交接文档（00-架构 … 06-研发）—— 施工步骤与验收',
  'gdd.md —— 背景、理由、完整叙述；与上面冲突时以上面为准',
  'prototype/demo.html —— 手感参考；代码结构不照抄'
]

/** 一份设计文档（= 一个可独立验收的施工单元） */
export interface HandoffDoc {
  /** 稳定 id（测试与路径都按它来） */
  id: string
  volumeId: HandoffVolumeId
  /** 卷内顺序（1 起）：文件名前缀就是它 */
  order: number
  title: string
  /** 这份文档要解决什么（一句话，派工用） */
  purpose: string
  fields: HandoffDocField[]
  /**
   * 仅这些品类适用（缺省 = 所有品类通用）。
   * 组合品类按并集命中：`game_type=SLG` + 标签 `卡牌` ⇒ strategy 与 card 两套专属文档都出现。
   */
  genres?: GenreProfileKey[]
  /** 条件文档的触发条件（缺省 = 无条件出现） */
  when?: HandoffDocCondition[]
  /** 需要附上的系统配置块（可为空） */
  systems?: HandoffDocSystem[]
  /** 可判定的验收条目（字符串=人工判定；对象=显式判定方式） */
  acceptance: HandoffAcceptance[]
  /** 明确不做（缺省沿用卷级） */
  outOfScope?: string[]
}

export interface HandoffVolume {
  id: HandoffVolumeId
  index: number
  /** 文件夹名用的短名（`00-架构`） */
  folder: string
  title: string
  outcome: string
  requires: HandoffVolumeId[]
  /** 附在卷目录末尾的章节（正文摘录） */
  chapters: ChapterKey[]
  /** 本卷全部文档涉及的字段（**由文档派生**） */
  keyFields: HandoffDocField[]
  acceptance: HandoffAcceptance[]
  outOfScope: string[]
  scale: string
}

/* ------------------------------------------------------------------ */
/* 卷与文档目录                                                        */
/* ------------------------------------------------------------------ */

interface VolumeMeta {
  id: HandoffVolumeId
  index: number
  folder: string
  title: string
  outcome: string
  requires: HandoffVolumeId[]
  chapters: ChapterKey[]
  acceptance: HandoffAcceptance[]
  outOfScope: string[]
  scale: string
}

const VOLUME_META: readonly VolumeMeta[] = [
  {
    id: 'architecture',
    index: 0,
    folder: '架构',
    title: '架构卷（骨架）',
    outcome: '工程能启动、能按数据表建库并载入、能按状态机在场景间切换、能存读档；还没有玩法内容。',
    requires: [],
    chapters: ['meta', 'tech', 'gameplay'],
    acceptance: [
      '工程可编译运行，进主菜单不崩',
      '按数据表建表，并能从数据文件载入（不是硬编码）',
      '状态机能走完一圈：主菜单 → 游戏 → 结算 → 回主菜单',
      '存档能写能读；删掉存档后能回到初始状态'
    ],
    outOfScope: ['具体关卡与敌人', '战斗/玩法数值', '美术与音频资源', '联网与付费'],
    scale: '骨架工程 + 1 个空场景'
  },
  {
    id: 'core_loop',
    index: 1,
    folder: '核心玩法',
    title: '核心玩法卷（第一条可玩链路）',
    outcome: '能完整玩一局：进入 → 操作 → 反馈 → 结算 → 再来一局，数值来自参数表。',
    requires: ['architecture'],
    chapters: ['gameplay', 'combat', 'numeric'],
    acceptance: [
      '一局能从头玩到尾，不卡死、不空转',
      '所有玩法数值来自参数表常量，代码里没有魔法数字',
      { text: 'numeric_assertions 逐条复算通过（允许容差内）', check: 'assertion' },
      '操作 1 秒内有可见反馈'
    ],
    outOfScope: ['多关卡内容', '成长与经济系统', '完整 UI 皮肤'],
    scale: '1 个可玩场景 + 1 套结算'
  },
  {
    id: 'content',
    index: 2,
    folder: '内容',
    title: '内容卷（关卡与敌人）',
    outcome: '全部关卡可按配置表生成，难度曲线与配置一致，不需要为每关改代码。',
    requires: ['core_loop'],
    chapters: ['level_design', 'story'],
    acceptance: [
      '新增一关只改数据表，不改代码',
      '每关的敌人编队/奖励与配置表逐项一致',
      '难度系数与 difficulty_curve 同向（首关最低、Boss 最高）'
    ],
    outOfScope: ['新玩法机制', '剧情演出与配音', '活动/赛季内容'],
    scale: '按 content_estimate 的关卡数批量生产'
  },
  {
    id: 'systems',
    index: 3,
    folder: '系统',
    title: '系统卷（装备、成长、经济）',
    outcome: '装备/成长/经济三套系统能独立跑通，资源闭环可复算，词条与强化有明确规则。',
    requires: ['core_loop'],
    chapters: ['systems', 'economy', 'numeric'],
    acceptance: [
      '每个启用的系统都有配置表且能被代码读取',
      '新手前 10 分钟的收支与账本一致（误差在容差内）',
      '装备/词条的数值来源可追到参数表'
    ],
    outOfScope: ['付费与商业化', '赛季重置', '跨服交易'],
    scale: '1 套经济闭环 + 1 条成长线 + 1 套装备规则'
  },
  {
    id: 'interface',
    index: 4,
    folder: '界面',
    title: '界面卷（UI 与交互）',
    outcome: '每个核心流程都能在界面上走通，反馈符合规范，不出现「点了没反应」。',
    requires: ['core_loop'],
    chapters: ['uiux', 'accessibility'],
    acceptance: [
      'core_flows 每条流程都能从头走到出口',
      '所有 ≥3 秒的等待都有可见进度或倒计时',
      '破坏性操作 100% 有二次确认',
      '色盲模式下关键信息不丢（不只靠颜色区分）'
    ],
    outOfScope: ['视觉皮肤与动效打磨', '多语言文案翻译'],
    scale: '按 core_flows 的流程数排期'
  },
  {
    id: 'polish',
    index: 5,
    folder: '打磨',
    title: '打磨卷（性能、埋点、本地化）',
    outcome: '在目标机型上达标，可出包；埋点能回答「玩家卡在哪」。',
    requires: ['content', 'systems', 'interface'],
    chapters: ['performance', 'analytics', 'accessibility'],
    acceptance: [
      '目标机型最低档稳定达标（帧率/内存不超预算）',
      '关键埋点可在日志里看到，字段与表一致',
      '首发语言的界面无截断、无乱码'
    ],
    outOfScope: ['长线运营活动', '海外发行合规（另立专项）'],
    scale: '按 target_devices 的机型数 × 场景数'
  },
  {
    id: 'engineering',
    index: 6,
    folder: '研发',
    title: '研发实施卷（落地任务）',
    outcome: '把前面所有设计翻译成可执行的研发任务清单：按阶段排期，每条任务带依赖、交付物与验收，程序照单施工。',
    requires: ['architecture', 'core_loop', 'content', 'systems', 'interface', 'polish'],
    chapters: [],
    acceptance: [
      '任务按「框架 → 玩法 → 系统 → 内容 → 界面 → 打磨」排序，每阶段可独立验收',
      '每条任务都有依赖、交付物与可判定验收',
      '每条任务都能追到一份设计文档'
    ],
    outOfScope: ['具体代码实现细节（模块/接口由程序定）', '人力与预算排期（见资源章）'],
    scale: '按阶段数（6 段）× 每段任务数'
  }
] as const

/** 有战斗/敌人概念的品类（决定「敌人与 Boss」「技能与 Buff」两份文档是否出现） */
const COMBAT_GENRES: GenreProfileKey[] = [
  'action',
  'strategy',
  'defense',
  'card',
  'roguelike',
  'survival',
  'open_world',
  'party'
]

/**
 * 设计文档目录（通用 21 份 + 品类专属 5 份）。
 *
 * ⚠️ `fields[].field` 必须真实存在于 `CESHU_CHAPTER_FIELDS`（守卫测试逐个校验），
 * 否则交接包里会出现一条永远「未填写」的假字段。
 */
export const HANDOFF_DOCS: readonly HandoffDoc[] = [
  /* ---- 00 架构 ---- */
  {
    id: 'arch-scope',
    volumeId: 'architecture',
    order: 1,
    title: '范围与平台',
    purpose: '先把「做什么 / 不做什么 / 跑在哪」定死，并记下关键决策为什么这么定——后面所有文档都受它约束。',
    fields: [
      { chapter: 'meta', field: 'platform', why: '平台决定输入方式、性能基线与包体策略' },
      { chapter: 'meta', field: 'non_goals', why: '不写「明确不做」，实现方会自己加需求' },
      { chapter: 'meta', field: 'alternatives', why: '记下被否掉的方案与代价，否则实现方会把它们「好心」换回来' }
    ],
    acceptance: [
      '能一句话说清本作不做什么',
      '目标平台与输入方式（键鼠/手柄/触屏）已确定',
      '关键决策写清了被放弃方案的代价（不是「经过考虑」）'
    ]
  },
  {
    id: 'arch-stack',
    volumeId: 'architecture',
    order: 2,
    title: '引擎与技术栈',
    purpose: '确定引擎版本、模块边界与通信方式——选错这里，后面全部返工。',
    fields: [
      { chapter: 'tech', field: 'engine', why: '引擎/框架与版本' },
      { chapter: 'tech', field: 'core_architecture', why: '模块划分与它们怎么通信' }
    ],
    acceptance: ['工程骨架可编译运行', '模块边界与文档一致（不多也不少）']
  },
  {
    id: 'arch-data',
    volumeId: 'architecture',
    order: 3,
    title: '数据表与内容管线',
    purpose: '说清要建哪些表、关键字段是什么、期望多少条——内容从数据来，不从代码来。',
    fields: [{ chapter: 'tech', field: 'data_tables', why: '表名/用途/关键字段/期望条数，决定数据层形状' }],
    acceptance: [
      '每张表都能按 `data/snapshot.json` 建出来',
      '代码里没有硬编码的装备/敌人/关卡数据',
      '新增一条内容只需改数据文件'
    ]
  },
  {
    id: 'arch-state',
    volumeId: 'architecture',
    order: 4,
    title: '状态机与场景流程',
    purpose: '把游戏有哪些状态、什么事件触发、切过去要重置什么写死——骨架的主干。',
    fields: [{ chapter: 'gameplay', field: 'state_machine', why: '状态/事件/结算/新状态，一条转移一行' }],
    acceptance: ['状态机可完整走一圈', '每次转移的结算效果与文档一致', '不存在无法退出的状态']
  },
  {
    id: 'arch-save',
    volumeId: 'architecture',
    order: 5,
    title: '存档与兼容',
    purpose: '定死存什么、什么类型、什么时候写、旧档怎么读——升级后读不出旧档是常见事故。',
    fields: [{ chapter: 'tech', field: 'save_format', why: '存档项/类型/写入时机/迁移策略' }],
    acceptance: ['存档能写能读', '删档回到初始状态', '缺字段的旧档能按默认值读出']
  },
  /*
   * 2026-10-27 补：前面讲了「模块边界」（arch-stack）和「从哪下手」（arch-scaffold），
   * 但没把边界落成「模块之间怎么交互」——编码 AI 知道要写战斗结算，却不知道战斗模块
   * 对外暴露什么函数、依赖谁、错误怎么抛。这份给模块接口工作表 + 统一约定。
   */
  {
    id: 'arch-api',
    volumeId: 'architecture',
    order: 6,
    title: '模块接口契约',
    purpose:
      '把模块边界落成可实现的接口清单：每个模块对外暴露什么、依赖谁、数据结构与错误码——编码 AI 不用自己拍模块怎么交互。',
    fields: [
      { chapter: 'tech', field: 'core_architecture', why: '模块划分与通信方式，决定接口清单' },
      { chapter: 'tech', field: 'data_tables', why: '表结构决定跨模块的数据契约' }
    ],
    acceptance: [
      '每个模块都有明确的对外接口（输入 / 输出 / 依赖）',
      '模块间无循环依赖（数据层 ← 玩法层 ← 界面层）',
      '关键数据结构有字段与类型（不只是表名）',
      '错误码 / 异常约定统一'
    ]
  },
  /*
   * 2026-10-28 审计补的文档：前面几份架构文档讲了「做什么」（模块边界 / 状态机 / 存档），
   * 但没讲「从哪下手写代码」——编码 AI 拿到文档后第一件事是建工程、定目录、找入口、跑起来。
   * 没有这一份，AI 只能自己拍目录结构，最容易出现「生成出来跑不起来」。按引擎分支给可执行起步指令。
   */
  {
    id: 'arch-scaffold',
    volumeId: 'architecture',
    order: 7,
    title: '工程脚手架',
    purpose: '编码 AI 拿到这份文档后的第一步：建什么工程、文件放哪、入口是哪个、怎么构建运行——没有它，AI 只能自己拍目录结构，最容易跑不起来。',
    fields: [
      { chapter: 'tech', field: 'engine', why: '引擎决定工程模板与构建方式' },
      { chapter: 'tech', field: 'core_architecture', why: '模块边界决定目录划分' },
      { chapter: 'tech', field: 'third_party_deps', why: '依赖决定要装什么' }
    ],
    acceptance: [
      '工程可编译运行（空场景能进）',
      '目录按模块边界划分，无循环依赖（数据层 ← 玩法层 ← 界面层）',
      '入口点明确（GameMode / Scene / Main）',
      '数值与配置走数据驱动（不写死在代码里）'
    ]
  },

  /* ---- 01 核心玩法 ---- */
  {
    id: 'core-loop',
    volumeId: 'core_loop',
    order: 1,
    title: '核心循环',
    purpose: '一条能玩通的循环：玩家做什么、系统给什么反馈、什么推动他再来一次。',
    fields: [
      { chapter: 'gameplay', field: 'core_loop_points', why: '循环每一步都要能在代码里找到对应' },
      { chapter: 'gameplay', field: 'playthrough_120s', why: '第一分钟是验收基准，写不清就做不出手感' }
    ],
    acceptance: ['一局能从头玩到尾', '120 秒走读的每一步都能在实机复现']
  },
  {
    id: 'core-input',
    volumeId: 'core_loop',
    order: 2,
    title: '操作与胜负',
    purpose: '输入怎么映射、什么算赢、什么算输——玩家与系统交互的边界。',
    fields: [
      { chapter: 'gameplay', field: 'control_scheme', why: '键鼠/手柄/触屏的具体映射' },
      { chapter: 'gameplay', field: 'win_lose_conditions', why: '胜负与失败条件决定结算逻辑' }
    ],
    acceptance: ['所有操作都有明确输入源', '胜负判定可复现（不是「感觉输了」）']
  },
  {
    id: 'core-combat',
    volumeId: 'core_loop',
    order: 3,
    title: '战斗与伤害公式',
    genres: COMBAT_GENRES,
    purpose: '战斗结算的唯一公式（全文档只此一处），含元素克制与节奏目标。',
    fields: [
      { chapter: 'combat', field: 'damage_formula', why: '伤害结算的唯一来源，别在别处再写一遍' },
      { chapter: 'combat', field: 'element_system', why: '克制关系与系数' },
      { chapter: 'combat', field: 'combat_pace', why: '一场战斗的目标时长，决定数值密度' },
      { chapter: 'combat', field: 'hit_detection', why: '判定形状/无敌帧/霸体——手感的地基，不是物理引擎参数' }
    ],
    acceptance: [
      // 这条能机判：contract.json 的参数表 + 断言复算会直接给结论，不用人肉核对
      { text: '伤害计算与公式逐项一致', check: 'assertion' },
      '元素克制有正反例',
      '单场时长落在目标区间'
    ]
  },
  {
    id: 'core-numeric',
    volumeId: 'core_loop',
    order: 4,
    title: '数值参数与断言',
    purpose: '所有可调数值进常量表，并用可复算断言证明没走样。',
    fields: [
      { chapter: 'numeric', field: 'numeric_parameters', why: '参数/当前值/合法范围，代码里只读这里' },
      { chapter: 'numeric', field: 'numeric_assertions', why: '可复算断言，跑通即证明数值没走样' }
    ],
    acceptance: [
      '所有玩法数值来自参数表，代码里没有魔法数字',
      { text: '每条断言都能复算通过（容差内）', check: 'assertion' }
    ]
  },

  /* ---- 02 内容 ---- */
  {
    id: 'content-levels',
    volumeId: 'content',
    order: 1,
    title: '关卡配置表',
    purpose: '逐关配置（敌人编队/奖励/难度系数/解锁条件）——加关只改表，不改代码。',
    fields: [{ chapter: 'level_design', field: 'level_table', why: '关卡/敌人编队/奖励/难度系数/解锁条件' }],
    acceptance: ['新增一关只改数据表', '每关配置与文档逐项一致', '首关最简单、Boss 最高']
  },
  {
    id: 'content-curve',
    volumeId: 'content',
    order: 2,
    title: '难度曲线与首关',
    purpose: '难度怎么起伏、前三关教什么——决定玩家会不会在 10 分钟内流失。',
    fields: [
      { chapter: 'level_design', field: 'difficulty_curve_points', why: '按阶段递进的难度点' },
      { chapter: 'level_design', field: 'first_levels', why: '首关/前几关的教学目标' }
    ],
    acceptance: ['难度整体递增且每段有缓冲', '前 3 关各只教一件事']
  },
  {
    id: 'content-enemy',
    volumeId: 'content',
    order: 3,
    title: '敌人与 Boss',
    genres: COMBAT_GENRES,
    purpose: '敌人种类、行为差异、Boss 分阶段机制——内容差异化的来源。',
    fields: [
      { chapter: 'story', field: 'enemy_types', why: '敌人种类与行为差异' },
      { chapter: 'combat', field: 'boss_mechanics', why: 'Boss 的阶段与弱点机制' }
    ],
    acceptance: ['每种敌人有可区分的行为', 'Boss 有阶段与弱点，且可被反制']
  },

  /* ---- 03 系统 ---- */
  {
    id: 'sys-equipment',
    volumeId: 'systems',
    order: 1,
    title: '装备与词条',
    purpose: '装备槽、品质、强化、套装、镶嵌、附魔与词条规则——玩家最常改的东西。',
    systems: [
      { key: 'equipment', why: '槽位/品质/强化上限/套装/镶嵌/附魔/分解/评分' },
      { key: 'item', why: '物品分类/稀有度/堆叠/绑定/掉落系统' }
    ],
    fields: [{ chapter: 'economy', field: 'production_chain', why: '材料 → 装备 → 强化 的生产链' }],
    acceptance: [
      '装备槽位与品质等级可配置',
      '强化/镶嵌/附魔规则有明确数值与上限',
      '词条来源可追到参数表，不散落在代码里'
    ]
  },
  {
    id: 'sys-growth',
    volumeId: 'systems',
    order: 2,
    title: '角色成长与属性',
    purpose: '等级、属性、成长曲线——决定「练级有没有意义」。',
    systems: [
      { key: 'character', why: '角色属性维度与初始值' },
      { key: 'growth', why: '成长方式（等级/天赋/突破）' }
    ],
    fields: [
      { chapter: 'numeric', field: 'growth_curves', why: '等级-属性/经验-等级等曲线形状' },
      { chapter: 'numeric', field: 'core_formulas', why: '成长相关公式（经验需求等）' }
    ],
    acceptance: ['升级能带来可感知的提升', '满级前不出现数值断崖/爆炸']
  },
  {
    id: 'sys-economy',
    volumeId: 'systems',
    order: 3,
    title: '经济与掉落',
    purpose: '货币种类、产出回收、掉落概率与保底——经济一崩，游戏就没了。',
    systems: [{ key: 'economy', why: '经济系统开关与配置' }],
    fields: [
      { chapter: 'economy', field: 'currency_types', why: '货币种类与兑换关系' },
      { chapter: 'economy', field: 'ledger', why: '一笔具体交易的初始/交易/期末，验证闭环' },
      { chapter: 'numeric', field: 'drop_tables', why: '掉落概率与保底' }
    ],
    acceptance: ['新手前 10 分钟收支与账本一致', '不存在只产出不回收的资源（或已注明）']
  },
  {
    id: 'sys-skill',
    volumeId: 'systems',
    order: 4,
    title: '技能与 Buff',
    genres: COMBAT_GENRES,
    purpose: '技能体系、Buff/Debuff 规则——战斗深度的来源。',
    systems: [
      { key: 'skill', why: '技能类型/数量/升级方式' },
      { key: 'battle', why: '战斗模式与结算方式' }
    ],
    fields: [
      { chapter: 'combat', field: 'skill_system', why: '技能构成与获取/升级路径' },
      { chapter: 'combat', field: 'buff_debuff', why: 'Buff/Debuff 的效果与叠加规则' }
    ],
    acceptance: ['技能数量与获取路径与文档一致', 'Buff 可叠加/可驱散的规则明确']
  },

  /* ---- 04 界面 ---- */
  {
    id: 'ui-flow',
    volumeId: 'interface',
    order: 1,
    title: '信息架构与流程',
    purpose: '界面层级、每个流程的步骤与出口——点得进去也要出得来。',
    fields: [
      { chapter: 'uiux', field: 'information_architecture', why: '界面层级与常驻入口' },
      { chapter: 'uiux', field: 'core_flows', why: '每个流程的步骤与出口' }
    ],
    acceptance: ['core_flows 每条都能走到出口', '核心操作 ≤3 步完成']
  },
  {
    id: 'ui-feedback',
    volumeId: 'interface',
    order: 2,
    title: '反馈与可用性',
    purpose: '什么操作给什么反馈、多久内给；等待可见、破坏性操作二次确认。',
    fields: [
      { chapter: 'uiux', field: 'feedback_rules', why: '触发/反馈形式/时机' },
      { chapter: 'uiux', field: 'usability_standards', why: '可用性硬指标' },
      { chapter: 'uiux', field: 'key_screens', why: '每屏必须有的元素' }
    ],
    acceptance: ['所有 ≥3 秒等待有可见进度', '破坏性操作 100% 二次确认', '关键数字首屏可见']
  },

  /* ---- 05 打磨 ---- */
  {
    id: 'polish-perf',
    volumeId: 'polish',
    order: 1,
    title: '性能预算',
    purpose: '分场景的帧率/内存/包体预算与达标机型——决定能不能出包。',
    fields: [
      { chapter: 'performance', field: 'performance_budget', why: '分场景的帧率/内存/包体预算' },
      { chapter: 'performance', field: 'quality_tiers', why: '低/中/高档各降什么——渲染分支的取舍依据，缺了程序只能自己拍' },
      { chapter: 'performance', field: 'target_devices', why: '达标机型的下限' }
    ],
    acceptance: [
      '最低档机型稳定达标',
      '包体不超预算',
      // 能机判：跑 performance_budget 的 method 列那套测法，拿数字比目标值
      { text: '按预算表的测量方法实测，各画质档位达到对应帧率目标', check: 'test' }
    ]
  },
  {
    id: 'polish-analytics',
    volumeId: 'polish',
    order: 2,
    title: '埋点与指标',
    purpose: '关键事件埋点表与指标定义——上线后靠它回答「玩家卡在哪」。',
    fields: [
      { chapter: 'analytics', field: 'event_tracking', why: '关键事件与字段' },
      { chapter: 'analytics', field: 'metric_system', why: '指标口径（留存/漏斗/付费）' }
    ],
    acceptance: ['关键事件能在日志里看到', '指标口径与埋点字段对得上']
  },
  {
    id: 'polish-l10n',
    volumeId: 'polish',
    order: 3,
    title: '本地化与无障碍',
    purpose: '首发语言、字幕、色盲与键位——决定能卖给谁。',
    fields: [
      { chapter: 'accessibility', field: 'language_list', why: '首发语言决定文案量与字体' },
      { chapter: 'accessibility', field: 'accessibility_features', why: '字幕/色盲/键位等硬要求' }
    ],
    acceptance: ['首发语言界面无截断/乱码', '色盲模式下关键信息不丢']
  },

  /* ---- 品类专属（按 game_type / game_type_tags 命中才出现） ---- */
  {
    id: 'content-branch',
    volumeId: 'content',
    order: 4,
    title: '剧情分支与结局',
    genres: ['narrative'],
    purpose: '分支怎么分、每个结局怎么达成、信息怎么给——叙事品类的核心内容。',
    fields: [
      { chapter: 'story', field: 'branch_endings', why: '每个结局的达成条件' },
      { chapter: 'story', field: 'character_network', why: '角色关系决定哪些分支可用' }
    ],
    acceptance: ['每个结局都有可达路径（无死路）', '关键抉择有真实代价，不是伪分支']
  },
  {
    id: 'content-idle',
    volumeId: 'content',
    order: 5,
    title: '离线收益与回归',
    genres: ['idle'],
    purpose: '离线怎么算、回来给什么——放置品类的核心循环。',
    fields: [
      { chapter: 'numeric', field: 'growth_curves', why: '离线收益的增长形状（线性还是指数）' },
      { chapter: 'economy', field: 'economic_goals', why: '回归后的目标与节奏' }
    ],
    acceptance: ['离线收益系数与在线口径一致（可复算）', '回归时能立刻看到下一步目标']
  },
  {
    id: 'sys-gacha',
    volumeId: 'systems',
    order: 5,
    title: '抽卡与卡池',
    genres: ['card'],
    purpose: '卡池结构、概率与保底——卡牌品类的养成与付费入口。',
    systems: [{ key: 'gacha', why: '卡池类型/概率/保底规则' }],
    fields: [{ chapter: 'monetization', field: 'iap_design', why: '付费档位与抽卡资源的对应关系' }],
    acceptance: ['概率与保底可复算（含期望值）', '免费玩家的获取节奏明确']
  },
  {
    id: 'sys-social',
    volumeId: 'systems',
    order: 6,
    title: '联盟与对抗',
    genres: ['strategy'],
    purpose: '联盟协作与竞技匹配的规则——策略品类的长期留存来源。',
    systems: [
      { key: 'social', why: '联盟/好友的规则与权限' },
      { key: 'competitive', why: '排位、匹配与结算' }
    ],
    fields: [],
    acceptance: ['联盟权限与协作流程明确', '匹配与结算结果可复现']
  },
  {
    id: 'sys-sim',
    volumeId: 'systems',
    order: 7,
    title: '经营循环',
    genres: ['sim'],
    purpose: '产出/消耗速率与长线节奏——模拟经营的核心。',
    fields: [
      { chapter: 'economy', field: 'source_sink', why: '资源产出与回收的结构' },
      { chapter: 'economy', field: 'economic_goals', why: '阶段目标与长线节奏' }
    ],
    acceptance: ['数十小时不出现通胀或枯竭', '阶段目标逐级递进']
  },
  /*
   * 2026-10-27 补：`quest` / `content` / `customization` 三个系统原先没有任何交接文档，
   * 配置只躺在 gdd.md 里、且空配置不被门禁抓。补上后「一个启用系统 = 一份可施工文档」闭合。
   */
  {
    id: 'sys-quest',
    volumeId: 'systems',
    order: 8,
    title: '任务与引导',
    purpose: '任务类型、接取/追踪/交付规则与新手引导——玩家靠它知道「下一步做什么」，避免进了游戏不知道干嘛。',
    systems: [{ key: 'quest', why: '任务类型 / 日常周常上限 / 剧情与分支 / 奖励规则' }],
    fields: [],
    acceptance: [
      '每类任务有接取条件、追踪上限与奖励规则',
      '剧情 / 支线任务可被数据配置（不写死）',
      '新手引导能走通到首个核心循环'
    ]
  },
  {
    id: 'sys-content',
    volumeId: 'systems',
    order: 9,
    title: '关卡内容与体力',
    purpose: '关卡总数、难度档次、星级、扫荡与体力规则——决定「内容怎么铺、玩家每天玩多久」。',
    systems: [{ key: 'content', why: '关卡总数 / 难度档次 / 星级 / 扫荡 / 体力' }],
    fields: [],
    acceptance: [
      '关卡总数与内容量估算一致',
      '体力上限 / 恢复速率与付费设计自洽',
      '扫荡 / 星级规则可配置'
    ]
  },
  {
    id: 'sys-customization',
    volumeId: 'systems',
    order: 10,
    title: '外观与个性化',
    purpose: '外观槽位、染色、坐骑、称号、宠物——付费点与自我表达的载体，不能只写「有皮肤」。',
    systems: [{ key: 'customization', why: '外观槽位 / 染色 / 坐骑 / 称号 / 宠物' }],
    fields: [],
    acceptance: [
      '外观槽位与可换部件明确',
      '外观付费不提供数值优势',
      '资产规格与美术章一致'
    ]
  },
  {
    id: 'content-waves',
    volumeId: 'content',
    order: 6,
    title: '波次与塔位',
    genres: ['defense'],
    purpose: '每波来什么、塔放哪、漏怪代价多少——塔防的核心节奏。',
    fields: [
      { chapter: 'level_design', field: 'level_table', why: '波次编队与奖励' },
      { chapter: 'combat', field: 'combat_pace', why: '单波时长决定节奏' }
    ],
    acceptance: ['每波总血量与可用 DPS 可达（逐波复算）', '漏怪代价与容错明确', '塔位布局有取舍（没有一种塔通吃）']
  },
  {
    id: 'content-build',
    volumeId: 'content',
    order: 7,
    title: '采集与建造',
    genres: ['survival'],
    purpose: '资源从哪来、建造消耗什么、生存压力怎么递增——生存建造的循环。',
    fields: [
      { chapter: 'economy', field: 'source_sink', why: '采集产出与建造/消耗的对应' },
      { chapter: 'economy', field: 'production_chain', why: '材料 → 部件 → 建筑的加工链' }
    ],
    acceptance: ['资源循环闭合（采集-消耗-再生产）', '生存压力随进度上升，不是恒定']
  },
  {
    id: 'content-map',
    volumeId: 'content',
    order: 8,
    title: '地图与兴趣点',
    genres: ['open_world'],
    purpose: '地图怎么分、兴趣点密度多少——开放世界撑时长的地方。',
    fields: [
      { chapter: 'story', field: 'geography', why: '区域划分与地形' },
      { chapter: 'level_design', field: 'level_table', why: '兴趣点/据点的配置' }
    ],
    acceptance: ['兴趣点密度能撑起宣称时长', '不存在「最优跑图顺序」让其余内容作废']
  },

  /* ---- 条件文档（由项目事实决定是否出现） ---- */
  {
    id: 'tech-server',
    volumeId: 'architecture',
    order: 8,
    title: '服务端与联机',
    when: [{ kind: 'fieldOneOf', chapter: 'tech', field: 'online_mode', values: ['leaderboard', 'co_op', 'mmo'] }],
    purpose: '谁是权威端、断线怎么办、数据怎么一致——联机项目最容易低估的一块。',
    fields: [
      { chapter: 'tech', field: 'online_mode', why: '联机形态决定架构与成本' },
      { chapter: 'tech', field: 'net_protocol', why: '消息/方向/频率/权威端——客户端与服务端对接的合同' },
      { chapter: 'tech', field: 'sync_model', why: '同步模型/权威端/回滚/断线恢复——定晚了整个网络层返工' },
      { chapter: 'tech', field: 'core_architecture', why: '网络层在架构里的位置' },
      { chapter: 'tech', field: 'third_party_deps', why: '网络/热更/监控依赖' }
    ],
    acceptance: [
      '权威端明确（服务端说了算，客户端不改关键数值）',
      '断线与重连有明确行为（幂等，不会刷资源）',
      '排行榜/对战的数据一致性可复算',
      // 能机判：本地多进程 + 弱网注入（200ms RTT / 5% 丢包）跑重连脚本
      { text: '弱网（200 ms RTT / 5% 丢包）下能重连并续局，不刷资源', check: 'test' }
    ]
  },
  {
    id: 'audio-impl',
    volumeId: 'polish',
    order: 4,
    title: '音频实现',
    when: [
      { kind: 'field', chapter: 'audio', field: 'audio_engine' },
      { kind: 'field', chapter: 'audio', field: 'sfx_list' }
    ],
    purpose: '哪个交互播哪个音、并发上限多少、切场景怎么过渡——音频不是「给个清单」就完了。',
    fields: [
      { chapter: 'audio', field: 'audio_engine', why: '引擎决定事件绑定方式' },
      { chapter: 'audio', field: 'sfx_events', why: '事件 → 音效的映射表，程序照它接' },
      { chapter: 'audio', field: 'sfx_list', why: '音效类别与数量' },
      { chapter: 'audio', field: 'dynamic_audio', why: '动态分层与切换规则' }
    ],
    acceptance: [
      '每个交互都能对到一条音效（事件 → 音效）',
      '同时播放上限与优先级明确，不会爆音',
      '切场景时音乐淡入淡出符合规范',
      // 能机判：打日志统计并发数，跟 sfx_events 的 concurrency 列比
      { text: '同屏并发音效数不超过 sfx_events 的并发上限，无爆音', check: 'test' }
    ]
  },
  {
    id: 'art-asset',
    volumeId: 'polish',
    order: 5,
    title: '资产规格与导入',
    when: [{ kind: 'field', chapter: 'art', field: 'art_style' }],
    purpose: '每种资产的尺寸/格式/命名/导入设置——美术交付、程序加载、引擎导入都照这张表，不然一换平台或接外包就乱。',
    fields: [
      { chapter: 'art', field: 'asset_spec', why: '类型|尺寸|格式|命名|备注——美术与程序之间的交付合同' },
      { chapter: 'art', field: 'multi_resolution', why: '分辨率档位决定各档尺寸' },
      { chapter: 'performance', field: 'performance_budget', why: '包体/内存预算约束单资产上限' }
    ],
    acceptance: [
      '每种资产类型都有尺寸与格式（缺失即视为未定，实现方只能自己定）',
      '命名规则可机读（前缀+用途+序号，不靠中文名找文件）',
      '导入设置写明（压缩/Atlas/最大尺寸），换平台不重新对一遍'
    ]
  },

  /* ---- 06 研发（把设计翻成任务清单） ---- */
  {
    id: 'eng-wbs',
    volumeId: 'engineering',
    order: 1,
    title: '研发任务拆解',
    purpose:
      '把架构卷与各系统章的设计翻译成按阶段排期的研发任务清单，每条带依赖、交付物与验收——程序（或 AI 代理）照单施工，不用自己再拆 backlog。',
    fields: [
      { chapter: 'tech', field: 'milestones', why: '里程碑是排期骨架，任务按它分段' },
      { chapter: 'gameplay', field: 'state_machine', why: '框架阶段先落状态机骨架（空实现）' },
      { chapter: 'tech', field: 'data_tables', why: '数据层任务从表清单派生' }
    ],
    acceptance: [
      '任务按「框架 → 玩法 → 系统 → 内容 → 界面 → 打磨」排序',
      '每条任务标注依赖与可判定交付物',
      '每条任务能追到一份设计文档'
    ]
  }
] as const

/** 某卷的文档（按 order 排序） */
export function docsOfVolume(volumeId: HandoffVolumeId): HandoffDoc[] {
  return HANDOFF_DOCS.filter((doc) => doc.volumeId === volumeId).sort((left, right) => left.order - right.order)
}

/** 卷定义：`keyFields` 由文档派生，不手写第二份 */
export const HANDOFF_VOLUMES: readonly HandoffVolume[] = VOLUME_META.map((meta) => {
  const seen = new Set<string>()
  const keyFields: HandoffDocField[] = []
  for (const doc of docsOfVolume(meta.id)) {
    for (const item of doc.fields) {
      const id = `${item.chapter}.${item.field}`
      if (seen.has(id)) continue
      seen.add(id)
      keyFields.push(item)
    }
  }
  return { ...meta, keyFields }
})

/* ------------------------------------------------------------------ */
/* 品类适配：game_type + game_type_tags → 命中的档案集合                */
/* ------------------------------------------------------------------ */

/** 品类解析结果（用于交接包裁剪与文档头展示） */
export interface HandoffGenreResolution {
  /** 主类型档案 */
  primary: GenreProfileKey
  primaryLabel: string
  /** 组合玩法标签（原样，可能为空） */
  tags: string[]
  /**
   * 命中的全部档案：primary 在前，标签追加去重。
   * 组合品类（SLG+卡牌）会同时命中 strategy 与 card ⇒ 两套专属文档都出现。
   */
  profiles: GenreProfileKey[]
  /** 是否组合品类（命中 >1 个档案） */
  composite: boolean
}

/**
 * 解析文档的品类集合。
 *
 * `meta.game_type` 是单选，装不下「SLG + 卡牌」这类组合玩法；`meta.game_type_tags`
 * 是多选标签，两者取**并集**。未知/自由文本走 `resolveGenreProfileKey` 的包含匹配，
 * 完全没命中则回落 `generic`（只出通用文档，不瞎补系统）。
 */
export function resolveHandoffGenre(doc: CeshuDocument): HandoffGenreResolution {
  const primary = resolveGenreProfileKey(doc.meta.game_type)
  const rawTags = Array.isArray(doc.meta.game_type_tags) ? (doc.meta.game_type_tags as unknown[]) : []
  const tags = rawTags.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  const profiles: GenreProfileKey[] = [primary]
  for (const tag of tags) {
    const key = resolveGenreProfileKey(tag)
    if (!profiles.includes(key)) profiles.push(key)
  }
  return {
    primary,
    primaryLabel: GENRE_REVIEW_PROFILES[primary].label,
    tags,
    profiles,
    composite: profiles.length > 1
  }
}

/** 一份「已规划」的文档：编号已按品类裁剪后重排，路径可直接用 */
export interface PlannedHandoffDoc {
  def: HandoffDoc
  volume: HandoffVolume
  /** 卷内显示序号（过滤后从 1 连续，保证「按编号做」不断号） */
  number: number
  /** 层级：通用基线 / 品类专属 / 条件文档 */
  layer: HandoffDocLayer
  /** 相对路径：`00-架构/01-范围与平台.md` */
  path: string
}

/** 文档层级：条件文档 > 品类专属 > 通用基线 */
export function docLayer(def: HandoffDoc): HandoffDocLayer {
  if ((def.when ?? []).length > 0) return 'conditional'
  if ((def.genres ?? []).length > 0) return 'genre'
  return 'baseline'
}

/** 条件文档的触发判定（任一条件满足即可） */
function conditionMatches(doc: CeshuDocument, condition: HandoffDocCondition): boolean {
  if (condition.kind === 'field') {
    return isFilledValue(readPath(doc[condition.chapter], condition.field))
  }
  if (condition.kind === 'fieldOneOf') {
    const value = readPath(doc[condition.chapter], condition.field)
    return typeof value === 'string' && condition.values.includes(value)
  }
  const entry = readPath(doc.systems, condition.key) as SystemEntry | undefined
  return entry !== undefined && entry.enabled === true
}

/**
 * 该文档在当前文档下是否出现。
 *
 * 两道闸：① 品类（`genres`，未知品类 `generic` 时全出，宁可多给不漏规格）；
 * ② 条件（`when`，按项目事实决定，如「有音频引擎」「联机形态不是纯单机」）。
 */
function docAppliesTo(doc: CeshuDocument, def: HandoffDoc, profiles: GenreProfileKey[]): boolean {
  if ((def.when ?? []).length > 0 && !(def.when ?? []).some((condition) => conditionMatches(doc, condition))) {
    return false
  }
  if (def.genres === undefined) return true
  if (profiles.includes('generic')) return true
  return def.genres.some((genre) => profiles.includes(genre))
}

/**
 * 按品类裁剪并**重排编号**：过滤掉不适用的文档后，卷内序号从 1 连续。
 *
 * 为什么要重排：用户要的是「文件名开头的数字 = 开发顺序」。如果直接沿用目录里的
 * `order`，视觉小说品类会因为跳过「敌人与 Boss」而出现 `01, 02, 04` 这种断号。
 */
export function planHandoffDocs(doc: CeshuDocument): PlannedHandoffDoc[] {
  const { profiles } = resolveHandoffGenre(doc)
  const planned: PlannedHandoffDoc[] = []
  for (const volume of HANDOFF_VOLUMES) {
    const docs = docsOfVolume(volume.id).filter((def) => docAppliesTo(doc, def, profiles))
    docs.forEach((def, index) => {
      const number = index + 1
      planned.push({
        def,
        volume,
        number,
        layer: docLayer(def),
        path: `${handoffVolumeFolderName(volume)}/${String(number).padStart(2, '0')}-${def.title}.md`
      })
    })
  }
  return planned
}

/* ------------------------------------------------------------------ */
/* 门禁                                                                */
/* ------------------------------------------------------------------ */

/** 单份文档的门禁 */
export interface HandoffDocStatus {
  doc: HandoffDoc
  /** 卷内显示序号（裁剪后重排） */
  number: number
  /** 相对路径 */
  path: string
  /** 层级：通用基线 / 品类专属 / 条件文档 */
  layer: HandoffDocLayer
  fieldTotal: number
  fieldFilled: number
  /** 还没写的字段（点名到章/字段） */
  missing: Array<{ chapter: ChapterKey; field: string; label: string }>
  /** 已启用的系统 id（未启用的系统不算缺，只是本作不做） */
  systemsEnabled: string[]
  /** 已启用系统的配置填写进度（部分空告警用；0/0 表示本文档不涉及系统配置） */
  configFieldFilled: number
  configFieldTotal: number
  /**
   * 本文档是否适用：带系统的文档在「相关系统全未启用」时视为不适用
   * （本作不做装备 → 「装备与词条」这份文档没有要实现的东西，不该标 ✅ 更不该标 ⏳）
   */
  applicable: boolean
  /** 与该文档相关的校验问题 */
  blockers: string[]
  ready: boolean
}

/** 单卷门禁（聚合其文档） */
export interface HandoffVolumeStatus {
  volume: HandoffVolume
  docs: HandoffDocStatus[]
  keyFieldTotal: number
  keyFieldFilled: number
  missing: Array<{ chapter: ChapterKey; field: string; label: string }>
  blockers: string[]
  ready: boolean
}

/** 读点路径（`user_personas.primary`）；非对象节点返回 undefined */
function readPath(source: unknown, path: string): unknown {
  let node: unknown = source
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}

/** 该文档涉及的章节（字段所属章 + 系统章） */
function docChapters(def: HandoffDoc): Set<ChapterKey> {
  const set = new Set<ChapterKey>()
  for (const item of def.fields) set.add(item.chapter)
  if ((def.systems ?? []).length > 0) set.add('systems')
  return set
}

/** 归属判定的共享上下文（每章第一份文档 + 已被文档引用的字段集合） */
interface BlockerContext {
  firstDocOfChapter: Map<ChapterKey, string>
  /** `章.字段`：被某份文档显式引用的字段 */
  coveredFields: Set<string>
}

/**
 * 校验问题归属哪份文档。
 *
 * ① 文案点名的字段被某份文档显式引用 → **只归那一份**（不重复报）；
 * ② 点名的字段没被任何文档引用（例如 story.protagonist）→ 归「该章第一份文档」，
 *    否则问题会在交接包里凭空消失，实现方永远看不到；
 * ③ 系统配置问题（`systems.<key>`）→ 归包含该系统的文档；
 * ④ 章节级问题（不点名字段）→ 同样归该章第一份文档。
 */
function blockerBelongsTo(def: HandoffDoc, message: string, context: BlockerContext): boolean {
  const chapter = resolveValidationChapter(message)
  const quoted = /字段\s*['"]([^'"]+)['"]/.exec(message)?.[1]
  if (quoted !== undefined) {
    if (chapter !== null && context.coveredFields.has(`${chapter}.${quoted}`)) {
      return def.fields.some((item) => item.chapter === chapter && item.field === quoted)
    }
    return chapter !== null && context.firstDocOfChapter.get(chapter) === def.id
  }
  for (const system of def.systems ?? []) {
    if (message.includes(`systems.${system.key}`)) return true
  }
  if (chapter === null) return false
  return context.firstDocOfChapter.get(chapter) === def.id
}

/** 构建归属上下文（每章第一份文档 + 已被引用的字段）；只统计**当前品类会出现**的文档 */
function buildBlockerContext(planned: readonly PlannedHandoffDoc[]): BlockerContext {
  const firstDocOfChapter = new Map<ChapterKey, string>()
  const coveredFields = new Set<string>()
  for (const item of planned) {
    for (const field of item.def.fields) coveredFields.add(`${field.chapter}.${field.field}`)
    for (const chapter of docChapters(item.def)) {
      if (!firstDocOfChapter.has(chapter)) firstDocOfChapter.set(chapter, item.def.id)
    }
  }
  return { firstDocOfChapter, coveredFields }
}

/** 系统 config 是否为空（没有键，或所有值都空） */
function systemConfigEmpty(entry: SystemEntry | undefined): boolean {
  if (entry === undefined) return true
  const config = (entry.config ?? {}) as Record<string, unknown>
  for (const value of Object.values(config)) {
    if (value === '' || value === null || value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    return false
  }
  return true
}

/** 系统配置填写进度：schema 字段总数 vs 已填数（只统计启用系统） */
function systemConfigStats(key: string, entry: SystemEntry | undefined): { filled: number; total: number } {
  const schema = SYSTEM_CONFIG_SCHEMA[key] ?? {}
  const total = Object.keys(schema).length
  const config = (entry?.config ?? {}) as Record<string, unknown>
  let filled = 0
  for (const fieldKey of Object.keys(schema)) {
    const value = config[fieldKey]
    if (value === '' || value === null || value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    filled += 1
  }
  return { filled, total }
}

/** 单份文档门禁 */
function buildDocStatus(
  doc: CeshuDocument,
  planned: PlannedHandoffDoc,
  errors: readonly string[],
  context: BlockerContext
): HandoffDocStatus {
  const def = planned.def
  let filled = 0
  const missing: HandoffDocStatus['missing'] = []
  for (const item of def.fields) {
    const value = readPath(doc[item.chapter], item.field)
    if (isFilledValue(value)) filled += 1
    else missing.push({ chapter: item.chapter, field: item.field, label: fieldLabelOf(item.chapter, item.field) })
  }
  const systemsEnabled = (def.systems ?? [])
    .filter((item) => {
      const entry = readPath(doc.systems, item.key) as SystemEntry | undefined
      return entry !== undefined && entry.enabled === true
    })
    .map((item) => item.key)
  const blockers = errors.filter((message) => blockerBelongsTo(def, message, context))
  // 系统启用但配置为空：交接包会渲染成「(无配置)」，实现方只能自己编参数——必须显式标红。
  for (const system of def.systems ?? []) {
    const entry = readPath(doc.systems, system.key) as SystemEntry | undefined
    if (entry !== undefined && entry.enabled === true && systemConfigEmpty(entry)) {
      blockers.push(
        `系统「${entry.name ?? system.key}」已启用但配置为空——实现方只能自己编参数，请先在「文档信息 → 游戏系统」补配置`
      )
    }
  }
  const hasSystems = (def.systems ?? []).length > 0
  const applicable = !hasSystems || systemsEnabled.length > 0
  let configFieldFilled = 0
  let configFieldTotal = 0
  for (const system of def.systems ?? []) {
    const entry = readPath(doc.systems, system.key) as SystemEntry | undefined
    if (entry === undefined || entry.enabled !== true) continue
    const stats = systemConfigStats(system.key, entry)
    configFieldTotal += stats.total
    configFieldFilled += stats.filled
  }
  return {
    doc: def,
    number: planned.number,
    path: planned.path,
    layer: planned.layer,
    fieldTotal: def.fields.length,
    fieldFilled: filled,
    missing,
    systemsEnabled,
    configFieldFilled,
    configFieldTotal,
    applicable,
    blockers,
    ready: applicable && filled === def.fields.length && blockers.length === 0
  }
}

/** 单卷门禁（聚合其文档；字段按 `章.字段` 去重） */
/**
 * 导出时的预计算结果：`buildHandoffFiles` 算一次，传给每份文档/卷目录的渲染，
 * 避免「每份文档都重跑 validateCeshu + planHandoffDocs」的 O(N²) 浪费。
 */
export interface HandoffRenderContext {
  plan: HandoffVolumeStatus[]
  planned: PlannedHandoffDoc[]
}

export function buildHandoffPlan(doc: CeshuDocument): HandoffVolumeStatus[] {
  const errors = validateCeshu(doc)
  const planned = planHandoffDocs(doc)
  const context = buildBlockerContext(planned)
  return HANDOFF_VOLUMES.map((volume) => {
    const docs = planned
      .filter((item) => item.volume.id === volume.id)
      .map((item) => buildDocStatus(doc, item, errors, context))
    const seen = new Set<string>()
    const missing: HandoffVolumeStatus['missing'] = []
    let total = 0
    let filled = 0
    for (const status of docs) {
      for (const item of status.missing) {
        const id = `${item.chapter}.${item.field}`
        if (seen.has(id)) continue
        seen.add(id)
        missing.push(item)
      }
      total += status.fieldTotal
      filled += status.fieldFilled
    }
    const blockers = docs.flatMap((status) => status.blockers)
    return {
      volume,
      docs,
      keyFieldTotal: total,
      keyFieldFilled: filled,
      missing,
      blockers,
      ready: total > 0 && filled === total && blockers.length === 0
    }
  }).filter((status) => status.docs.length > 0)
}

/* ------------------------------------------------------------------ */
/* 实现单元：这份文档落地要做什么（规则/界面手写，数据自动派生）         */
/* ------------------------------------------------------------------ */

interface DocBuildUnits {
  /** 要实现的状态/公式/判定 */
  rules: string[]
  /** 要做的界面与交互 */
  ui?: string[]
}

/**
 * 每份文档的「实现单元」。
 *
 * 为什么要单独写：字段值告诉 AI「设计是什么」，但不告诉它「要写哪些代码」。
 * 补上规则/界面两条，能显著减少自由发挥（幻觉多来自「文档没说，但实现必须决定」的地方）。
 * 数据类不手写——从字段类型自动派生（表格字段 → 表，系统 → 配置表），避免两处漂移。
 */
const DOC_BUILD: Record<string, DocBuildUnits> = {
  'arch-scope': {
    rules: ['至少 3 条「明确不做」，实现方不得自行添加', '平台决定输入方式：触屏点击区 ≥44px，键鼠要可重映射'],
    ui: ['主菜单：开始 / 设置 / 退出']
  },
  'arch-stack': {
    rules: ['模块边界写成「谁调用谁」，禁止循环依赖', '数据层 ← 玩法层 ← 界面层 单向依赖']
  },
  'arch-data': {
    rules: ['每张表给主键 + 至少 3 个字段的类型', '表间引用用 id 字符串，不用嵌套对象']
  },
  'arch-state': {
    rules: ['每条转移写清：事件 → 结算 → 新状态', '切状态时说明哪些数据被重置、哪些保留', '不允许存在无法退出的状态']
  },
  'arch-save': {
    rules: ['写入时机与触发点一致（自动/手动）', '缺字段按默认值补齐，旧档不得崩溃']
  },
  'arch-scaffold': {
    rules: ['目录按模块边界划分，禁止循环依赖', '数值/配置走数据驱动，不写死在代码', '首批只落地「状态机骨架 + 存档 + 最小可玩循环」，不提前铺系统']
  },
  'core-loop': {
    rules: ['循环每一步都有 ≤1s 的可见反馈', '一局结束必须有结算页与「再来一次」'],
    ui: ['局内 HUD：资源 / 进度 / 退出']
  },
  'core-input': {
    rules: ['所有输入都有取消/返回路径', '胜负判定写成布尔表达式，可复现']
  },
  'core-combat': {
    rules: ['伤害只在**一处**计算，其余模块调用它', '元素克制系数进参数表', '单场时长按目标节奏校准']
  },
  'core-numeric': {
    rules: ['数值全部从参数表读取，禁止字面量', '每条断言必须可复算（含容差）']
  },
  'content-levels': {
    rules: ['关卡从数据表加载，不写死', '解锁条件按表判定'],
    ui: ['关卡选择页（含解锁状态）']
  },
  'content-curve': {
    rules: ['难度系数与曲线同向', '前 3 关各只引入一个机制']
  },
  'content-enemy': {
    rules: ['每种敌人有独立行为参数（不是换皮）', 'Boss 阶段切换有明确触发条件与提示']
  },
  'content-branch': {
    rules: ['每个结局至少一条可达路径', '关键抉择要改变后续可用选项']
  },
  'content-idle': {
    rules: ['离线收益按时间差计算，与在线同一公式', '回归弹窗给出收益明细与下一步目标']
  },
  'sys-equipment': {
    rules: ['槽位/品质/强化上限从配置读', '强化、镶嵌、附魔的数值进参数表', '词条生成有明确权重与数量上限']
  },
  'sys-growth': {
    rules: ['升级公式可复算', '属性成长单调，无断崖与爆炸点']
  },
  'sys-economy': {
    rules: ['每种货币都有产出与回收', '账本示例逐笔能对上（初始+交易=期末）']
  },
  'sys-skill': {
    rules: ['技能效果由数据驱动，不写死分支', 'Buff 叠加与驱散规则明确']
  },
  'sys-gacha': {
    rules: ['概率与保底可复算（含期望值）', '抽卡资源与付费档位一一对应']
  },
  'sys-social': {
    rules: ['联盟权限矩阵明确（谁能做什么）', '匹配与结算结果可复现']
  },
  'sys-sim': {
    rules: ['产出与消耗速率成对定义', '长线不出现通胀或枯竭']
  },
  'sys-quest': {
    rules: ['任务类型 / 上限 / 奖励走配置，不写死', '剧情与支线可数据配置', '引导链路能到首个核心循环']
  },
  'sys-content': {
    rules: ['关卡总数 / 难度档次走配置', '体力上限与恢复速率可调', '扫荡 / 星级规则可配置']
  },
  'sys-customization': {
    rules: ['外观槽位与可换部件可配置', '外观付费不提供数值优势', '资产规格与美术章一致']
  },
  'ui-flow': {
    rules: ['每条流程有明确出口', '核心操作 ≤3 步'],
    ui: ['主界面常驻入口（≤4 个）']
  },
  'ui-feedback': {
    rules: ['≥3 秒等待显示进度或倒计时', '破坏性操作二次确认']
  },
  'content-waves': {
    rules: ['逐波复算「总血量 ≤ 可用 DPS × 时间」', '漏怪扣血与失败条件写成可判定规则'],
    ui: ['波次倒计时与塔位高亮']
  },
  'content-build': {
    rules: ['采集速率与建造消耗成对定义', '建造前置（科技/材料）按数据判定']
  },
  'content-map': {
    rules: ['兴趣点按区域配置，密度可统计', '解锁顺序不得让其余内容失去意义']
  },
  'tech-server': {
    rules: ['权威端在服务端：客户端只做表现，关键数值服务端算', '断线重连幂等（重放不刷资源）', '协议版本号随客户端走，旧版本明确拒绝'],
    ui: ['断线提示与重连进度']
  },
  'audio-impl': {
    rules: ['音效由事件触发（事件 → 音效 id），不散写在界面里', '并发上限与优先级进配置，超限按优先级丢弃'],
    ui: ['设置页：主音量 / 音乐 / 音效 三档']
  },
  'art-asset': {
    rules: ['每种资产尺寸/格式/命名进一张表，缺失即视为未定', '命名可机读（前缀+用途+序号），不靠中文名找文件', '导入设置写明（压缩/Atlas/最大尺寸），换平台不重对']
  },
  'polish-perf': {
    rules: ['预算按场景拆分，超标即视为不达标']
  },
  'polish-analytics': {
    rules: ['事件名与字段与埋点表一致，不多不少']
  },
  'polish-l10n': {
    rules: ['文案走 key，不硬编码在界面里', '字体覆盖首发语言的全部字符']
  },
  'arch-api': {
    rules: [
      '每个模块至少定义一个对外接口：输入 / 输出 / 依赖 / 错误码',
      '模块单向依赖（数据层 ← 玩法层 ← 界面层），禁止反向调用',
      '错误码统一前缀（E_ / W_），错误不吞、不静默'
    ]
  },
  'eng-wbs': {
    rules: [
      '按 M1→M6 顺序施工，每阶段验收通过再进下一阶段',
      '每条任务都能追到一份设计文档（引用其路径）',
      '数值/关卡/系统配置全部走数据文件，不写死'
    ]
  }
}

/** 交接文档的**消费角色**（谁该读它、谁照着它干活） */
export type HandoffRole =
  | 'producer'
  | 'systems'
  | 'numeric'
  | 'content'
  | 'narrative'
  | 'tech'
  | 'art'
  | 'audio'
  | 'ui'
  | 'qa'
  | 'ops'

export const HANDOFF_ROLE_LABELS: Record<HandoffRole, string> = {
  producer: '制作人 / 主策',
  systems: '系统策划',
  numeric: '数值策划',
  content: '关卡与内容策划',
  narrative: '叙事策划',
  tech: '技术负责人',
  art: '美术',
  audio: '音频',
  ui: 'UI / 交互',
  qa: '测试',
  ops: '运营 / 本地化'
}

/**
 * 每份文档的负责角色。
 *
 * 为什么单独一张表：文档正文是「给 AI 读的规格」，角色是「给团队分派的归属」——
 * 两者会一起变但改动动机不同（加字段 ≠ 换负责人）。分开存，守卫测试保证每份文档都有归属，
 * 不会出现「没人认领的文档」（那种文档最后通常没人读）。
 */
const DOC_ROLES: Record<string, HandoffRole[]> = {
  'arch-scope': ['producer', 'tech'],
  'arch-stack': ['tech'],
  'arch-data': ['tech', 'systems'],
  'arch-state': ['tech', 'systems'],
  'arch-save': ['tech'],
  'arch-api': ['tech'],
  'arch-scaffold': ['tech'],
  'tech-server': ['tech', 'ops'],
  'core-loop': ['producer', 'systems', 'content'],
  'core-input': ['systems', 'ui'],
  'core-combat': ['systems', 'numeric'],
  'core-numeric': ['numeric'],
  'content-levels': ['content'],
  'content-curve': ['content', 'numeric'],
  'content-enemy': ['content', 'art'],
  'content-branch': ['narrative'],
  'content-idle': ['systems', 'numeric'],
  'content-waves': ['content', 'numeric'],
  'content-build': ['systems', 'content'],
  'content-map': ['content', 'art'],
  'sys-equipment': ['systems', 'numeric'],
  'sys-growth': ['systems', 'numeric'],
  'sys-economy': ['systems', 'numeric'],
  'sys-skill': ['systems', 'numeric'],
  'sys-gacha': ['systems', 'ops'],
  'sys-social': ['systems', 'ops'],
  'sys-sim': ['systems', 'numeric'],
  'sys-quest': ['systems', 'content'],
  'sys-content': ['content', 'systems'],
  'sys-customization': ['art', 'systems'],
  'ui-flow': ['ui', 'systems'],
  'ui-feedback': ['ui', 'qa'],
  'polish-perf': ['tech', 'qa'],
  'polish-analytics': ['ops', 'tech'],
  'polish-l10n': ['ops', 'ui'],
  'audio-impl': ['audio', 'tech'],
  'art-asset': ['art', 'tech'],
  'eng-wbs': ['tech', 'producer']
}

/**
 * 该文档要接哪些**品类追问**（来自 `GENRE_REVIEW_PROFILES`）。
 *
 * AI 审阅已经按品类下发不同追问；交接包沿用同一份文案，让「验收」也随品类变，
 * 而不是所有游戏共用一套检查点。`numeric` = 数值向追问，`choice` = 取舍向追问。
 */
const DOC_PROBES: Record<string, Array<'numeric' | 'choice'>> = {
  'core-loop': ['choice'],
  'core-input': ['choice'],
  'core-combat': ['numeric', 'choice'],
  'core-numeric': ['numeric'],
  'content-levels': ['numeric'],
  'content-curve': ['numeric'],
  'content-waves': ['numeric'],
  'sys-equipment': ['numeric'],
  'sys-growth': ['numeric'],
  'sys-economy': ['numeric'],
  'sys-gacha': ['numeric'],
  'sys-skill': ['choice'],
  'ui-flow': ['choice'],
  'ui-feedback': ['choice']
}

/** 数据类实现单元：从字段类型派生（表格字段 → 表；系统 → 配置表） */
function derivedDataItems(doc: CeshuDocument, def: HandoffDoc): string[] {
  const items: string[] = []
  for (const item of def.fields) {
    const fieldDef = (CESHU_CHAPTER_FIELDS[item.chapter] ?? []).find((field) => field.key === item.field)
    if (fieldDef?.kind === 'pipeList') items.push(`表：${fieldLabelOf(item.chapter, item.field)}`)
  }
  for (const system of def.systems ?? []) {
    const entry = readPath(doc.systems, system.key) as SystemEntry | undefined
    items.push(`配置：${entry?.name ?? system.key}（${system.key}）`)
  }
  return items
}

/* ------------------------------------------------------------------ */
/* 渲染                                                                */
/* ------------------------------------------------------------------ */

/** 单元格里的竖线会破坏表格：转义成 `\|` */
function escapeCell(value: string): string {
  return value.replace(/\|/g, '\\|')
}

function formatScalar(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return String(value)
  return `\`${JSON.stringify(value)}\``
}

/**
 * 渲染一个字段的值：有 `columns` 的 pipeList 出真表格，其余原样（列表/段落）。
 * 空值显式写成「（未填写）」——交接包里最怕的就是空着不说，实现方以为不用做。
 */
function renderValueOf(chapter: ChapterKey, fieldKey: string, value: unknown): string {
  if (!isFilledValue(value)) return '（未填写 —— 实现方只能自行决定，建议先补齐）'
  const columns = fieldColumns(chapter, fieldKey)
  if (columns.length > 0 && Array.isArray(value)) {
    const rows = toRowStrings(value, columns)
    const head = `| ${columns.map((item) => item.label).join(' | ')} |`
    const sep = `| ${columns.map(() => '---').join(' | ')} |`
    const body = rows.map((row) => `| ${columns.map((_item, index) => escapeCell(column(row, index))).join(' | ')} |`)
    return [head, sep, ...body].join('\n')
  }
  if (Array.isArray(value)) return value.map((item) => `- ${formatScalar(item)}`).join('\n')
  return formatScalar(value)
}

/** 读字段并渲染（`doc` 显式传入：不做模块级可变状态，渲染可重入） */
function renderField(doc: CeshuDocument, chapter: ChapterKey, fieldKey: string): string {
  return renderValueOf(chapter, fieldKey, readPath(doc[chapter], fieldKey))
}

/** 渲染一个系统配置块（启用时列配置表，未启用时说明「本作不做」） */
function renderSystemBlock(doc: CeshuDocument, system: HandoffDocSystem): string {
  const entry = readPath(doc.systems, system.key) as SystemEntry | undefined
  const lines: string[] = []
  lines.push(`### 系统 · ${entry?.name ?? system.key}（${system.key}）`)
  lines.push('')
  lines.push(`> 为什么必须写清：${system.why}`)
  lines.push('')
  if (entry === undefined || entry.enabled !== true) {
    lines.push('**未启用** —— 若本作不做这个系统，可整节跳过；若要做，先在「文档信息 → 游戏系统」里启用它。')
    lines.push('')
    return lines.join('\n')
  }
  const schema = SYSTEM_CONFIG_SCHEMA[system.key] ?? {}
  const config = (entry.config ?? {}) as Record<string, unknown>
  const rows: string[] = []
  for (const [key, raw] of Object.entries(config)) {
    if (raw === '' || raw === null || raw === undefined || (Array.isArray(raw) && raw.length === 0)) continue
    const def = schema[key]
    const value = Array.isArray(raw) ? raw.map((item) => String(item)).join('、') : formatScalar(raw)
    const range =
      def?.values !== undefined
        ? def.values.map((item) => def.optionLabels?.[item] ?? item).join(' / ')
        : def?.from !== undefined
          ? `${def.from}–${def.to}`
          : ''
    rows.push(`| ${def?.label ?? key} | ${escapeCell(value)} | ${escapeCell(range)} |`)
  }
  if (rows.length === 0) {
    lines.push('（配置全空 —— 该系统的规则还没定，实现方只能自己编）')
  } else {
    lines.push('| 配置项 | 值 | 可选范围 |')
    lines.push('| --- | --- | --- |')
    lines.push(...rows)
  }
  lines.push('')
  return lines.join('\n')
}

/** 「要实现什么（按类分）」：数据自动派生，规则/界面手写 */
function renderBuildSection(doc: CeshuDocument, def: HandoffDoc): string {
  const build = DOC_BUILD[def.id]
  const data = derivedDataItems(doc, def)
  const lines: string[] = []
  lines.push('## 要实现什么（按类分）')
  lines.push('')
  lines.push('### 数据')
  lines.push('')
  if (data.length === 0) lines.push('- （本文档不新增数据表；按现有 schema 读写）')
  else for (const item of data) lines.push(`- ${item}`)
  lines.push('')
  lines.push('### 规则')
  lines.push('')
  if (build === undefined || build.rules.length === 0) lines.push('- （见「规则与数据」）')
  else for (const item of build.rules) lines.push(`- ${item}`)
  lines.push('')
  if (build?.ui !== undefined && build.ui.length > 0) {
    lines.push('### 界面')
    lines.push('')
    for (const item of build.ui) lines.push(`- ${item}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** 文档里字段 + 系统块的正文 */
function renderDocBody(doc: CeshuDocument, def: HandoffDoc): string {
  const lines: string[] = []
  for (const item of def.fields) {
    lines.push(`### ${CHAPTER_LABELS[item.chapter]} · ${fieldLabelOf(item.chapter, item.field)}`)
    lines.push('')
    lines.push(`> 为什么必须写清：${item.why}`)
    lines.push('')
    lines.push(renderField(doc, item.chapter, item.field))
    lines.push('')
  }
  for (const system of def.systems ?? []) {
    lines.push(renderSystemBlock(doc, system))
  }
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* 对外：路径与渲染                                                    */
/* ------------------------------------------------------------------ */

/** 卷文件夹名：`00-架构` */
export function handoffVolumeFolderName(volume: HandoffVolume): string {
  return `${String(volume.index).padStart(2, '0')}-${volume.folder}`
}

/** 卷内目录文件名（打开文件夹先看它） */
export function handoffVolumeIndexPath(volume: HandoffVolume): string {
  return `${handoffVolumeFolderName(volume)}/README.md`
}

/** 该文档的负责角色（缺省空数组，守卫测试保证不会缺） */
export function docRoles(def: HandoffDoc): HandoffRole[] {
  return DOC_ROLES[def.id] ?? []
}

/** 角色 → 该角色要读的文档（按角色分派的索引） */
export interface HandoffRoleEntry {
  role: HandoffRole
  label: string
  docs: PlannedHandoffDoc[]
}

/**
 * 按角色分派：每个角色拿到自己该读的文档清单。
 *
 * 解决的是「文档有了，但没人知道自己该看哪几份」——美术只关心美术/敌人/地图，
 * 程序只关心架构/状态机/存档，测试只关心验收与性能。README 里给这张表，
 * 比让人从 26 份里挑要现实得多。
 */
export function buildRoleIndex(doc: CeshuDocument): HandoffRoleEntry[] {
  const planned = planHandoffDocs(doc)
  return (Object.keys(HANDOFF_ROLE_LABELS) as HandoffRole[]).map((role) => ({
    role,
    label: HANDOFF_ROLE_LABELS[role],
    docs: planned.filter((item) => docRoles(item.def).includes(role))
  }))
}

/**
 * 本作类型的额外检查点：把 `GENRE_REVIEW_PROFILES` 的追问接到该文档的验收里。
 * 组合品类会逐档案列出（SLG+卡牌 → 两套追问），不合并成一句含糊的话。
 */
function renderGenreProbes(doc: CeshuDocument, def: HandoffDoc): string {
  const kinds = DOC_PROBES[def.id]
  if (kinds === undefined || kinds.length === 0) return ''
  const { profiles } = resolveHandoffGenre(doc)
  const lines: string[] = []
  for (const key of profiles) {
    const profile = GENRE_REVIEW_PROFILES[key]
    const parts: string[] = []
    if (kinds.includes('numeric') && profile.numeric !== undefined) parts.push(`数值：${profile.numeric}`)
    if (kinds.includes('choice') && profile.choice !== undefined) parts.push(`取舍：${profile.choice}`)
    if (parts.length === 0) continue
    if (lines.length === 0) {
      lines.push('## 本作类型的额外检查点（做完连同验收一起过）')
      lines.push('')
    }
    lines.push(`**${profile.label}**`, '')
    for (const part of parts) lines.push(`- ${part}`)
    lines.push('')
  }
  return lines.join('\n')
}

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

function renderScaffoldSection(doc: CeshuDocument): string {
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
function renderEngineeringWbsSection(doc: CeshuDocument): string {
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
function renderApiContractSection(): string {
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
function renderPerfPlaybookSection(): string {
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

/** 渲染单份文档 */
export function renderHandoffDoc(
  doc: CeshuDocument,
  planned: PlannedHandoffDoc,
  generatedAt: string,
  context?: HandoffRenderContext
): string {
  const def = planned.def
  const volume = planned.volume
  const ctx = context ?? { plan: buildHandoffPlan(doc), planned: planHandoffDocs(doc) }
  const siblings = ctx.planned.filter((item) => item.volume.id === volume.id)
  const position = siblings.findIndex((item) => item.def.id === def.id) + 1
  const previous = position > 1 ? siblings[position - 2] : undefined
  const next = position < siblings.length ? siblings[position] : undefined
  const status = ctx.plan.flatMap((item) => item.docs).find((item) => item.doc.id === def.id)
  const genre = resolveHandoffGenre(doc)
  {
    const lines: string[] = []
    lines.push(`# ${String(volume.index).padStart(2, '0')}-${String(planned.number).padStart(2, '0')} · ${def.title}`)
    lines.push('')
    lines.push(
      `> 游戏：${String(doc.meta.game_name ?? '未命名')} ｜ 所属：${volume.title} ｜ 生成时间：${generatedAt}`
    )
    lines.push(
      `> 品类：${String(doc.meta.game_type ?? '未指定')}（${genre.primaryLabel}）${
        genre.composite ? ` ｜ 组合：${genre.tags.join(' + ')}` : ''
      }`
    )
    lines.push(`> 本卷共 ${siblings.length} 份文档，这是第 ${position} 份。**只实现本文档范围。**`)
    const roles = docRoles(def)
    if (roles.length > 0) lines.push(`> 负责角色：${roles.map((role) => HANDOFF_ROLE_LABELS[role]).join('、')}`)
    const layerLabel =
      planned.layer === 'baseline' ? '通用基线（任何游戏都要做）' : planned.layer === 'genre' ? '品类专属（由游戏类型决定）' : '条件文档（由项目事实决定）'
    lines.push(`> 层级：${layerLabel}`)
    /*
     * 来源回链：工程师按「要做的东西」找文档，但设计意图写在「章」里。
     * 没有这行，从 `03-系统/01-装备与词条.md` 回到「第六章·经济系统设计」要靠人肉翻 24 章；
     * 有这行，追溯成本是 0，且锚点与 gdd.md 目录共用 `chapterAnchorOf` 同一套口径。
     */
    const sourceChapters = [...docChapters(def)]
    if (sourceChapters.length > 0) {
      lines.push(`> 来源：${sourceChapters.map((key) => `${CHAPTER_LABELS[key]}（gdd.md#${chapterAnchorOf(key)}）`).join('、')}`)
    }
    lines.push('')
    lines.push('## 这份文档要解决什么')
    lines.push('')
    lines.push(def.purpose)
    lines.push('')
    lines.push('## 顺序与依赖')
    lines.push('')
    lines.push(previous === undefined ? '- 上游：无（本卷第一份）' : `- 上游：\`${previous.path}\`（须先完成）`)
    lines.push(next === undefined ? '- 下游：无（本卷最后一份）' : `- 下游：\`${next.path}\``)
    if (volume.requires.length > 0) {
      lines.push(
        `- 跨卷前置：${volume.requires
          .map((id) => {
            const required = HANDOFF_VOLUMES.find((item) => item.id === id)
            return required === undefined ? id : `${String(required.index).padStart(2, '0')} ${required.title}`
          })
          .join('、')}`
      )
    }
    /*
     * 最小上下文：上下文窗口有限，20+ 份文档全读会爆，也会让注意力被无关内容稀释。
     * 明确「只读这三份就能开工」，比让 agent 自己判断该读什么可靠得多。
     */
    lines.push(
      previous === undefined
        ? `- 开工只读：本文档 + \`${handoffVolumeIndexPath(volume)}\`（新卷先定位）+ \`contract.json\``
        : '- 开工只读：本文档 + `contract.json`（上游是上一轮刚做完的，不必重读）'
    )
    lines.push('')
    lines.push('## 门禁状态')
    lines.push('')
    if (status !== undefined) {
      lines.push(
        `本文档字段 ${status.fieldFilled}/${status.fieldTotal} 已填写；相关校验问题 ${status.blockers.length} 条。` +
          (status.ready ? ' **可以开工。**' : status.applicable ? ' **建议先补齐再开工。**' : '')
      )
      if (status.configFieldTotal > 0) {
        const configHint =
          status.configFieldFilled === 0
            ? '（全空，实现方只能自己编）'
            : status.configFieldFilled < status.configFieldTotal
              ? '（未填项可能是有意留空，请确认）'
              : ''
        lines.push('')
        lines.push(`系统配置：已填 ${status.configFieldFilled}/${status.configFieldTotal} 项${configHint}。`)
      }
      if (!status.applicable) {
        lines.push('')
        lines.push(
          '**本文档当前不适用**：它依赖的游戏系统全部未启用。本作不做这些系统的话可整份跳过；要做，先在「文档信息 → 游戏系统」里启用。'
        )
      }
      if (status.missing.length > 0) {
        lines.push('')
        lines.push(`还差：${status.missing.map((item) => `${CHAPTER_LABELS[item.chapter]}·${item.label}`).join('、')}`)
      }
      if (status.systemsEnabled.length > 0) {
        lines.push('')
        lines.push(`涉及系统：${status.systemsEnabled.join('、')}`)
      }
      if (status.blockers.length > 0) {
        lines.push('')
        for (const message of status.blockers.slice(0, 10)) lines.push(`- ${message}`)
        if (status.blockers.length > 10) lines.push(`- …… 其余 ${status.blockers.length - 10} 条见校验报告`)
      }
      lines.push('')
    }
    lines.push(renderBuildSection(doc, def))
    lines.push('## 规则与数据')
    lines.push('')
    lines.push(renderDocBody(doc, def))
    if (def.id === 'arch-scaffold') lines.push(renderScaffoldSection(doc))
    if (def.id === 'arch-api') lines.push(renderApiContractSection())
    if (def.id === 'polish-perf') lines.push(renderPerfPlaybookSection())
    if (def.id === 'eng-wbs') lines.push(renderEngineeringWbsSection(doc))
    lines.push('## 验收（做完逐条打勾）')
    lines.push('')
    for (const item of def.acceptance) {
      // 非人工判定才标出来：老文档（全字符串）渲染结果逐字不变，避免无意义 diff
      const check = acceptanceCheck(item)
      const tag = check === 'assertion' ? '（判定：contract.json 断言）' : check === 'test' ? '（判定：自动化测试）' : ''
      lines.push(`- [ ] ${acceptanceText(item)}${tag}`)
    }
    lines.push('')
    const probes = renderGenreProbes(doc, def)
    if (probes !== '') lines.push(probes)
    lines.push('## 明确不做')
    lines.push('')
    for (const item of def.outOfScope ?? volume.outOfScope) lines.push(`- ${item}`)
    lines.push('')
    return lines.join('\n')
  }
}

/** 渲染卷内目录（`00-架构/README.md`） */
export function renderHandoffVolumeIndex(
  doc: CeshuDocument,
  volume: HandoffVolume,
  generatedAt: string,
  context?: HandoffRenderContext
): string {
  const status = (context?.plan ?? buildHandoffPlan(doc)).find((item) => item.volume.id === volume.id)
  const genre = resolveHandoffGenre(doc)
  const lines: string[] = []
  lines.push(`# ${String(volume.index).padStart(2, '0')} · ${volume.title}`)
  lines.push('')
  lines.push(`> 生成时间：${generatedAt}`)
  lines.push(
    `> 品类：${String(doc.meta.game_type ?? '未指定')}（${genre.primaryLabel}）${
      genre.composite ? ` ｜ 组合：${genre.tags.join(' + ')}（已按并集追加对应文档）` : ''
    }`
  )
  lines.push('')
  lines.push('## 这一卷做完，游戏能做什么')
  lines.push('')
  lines.push(volume.outcome)
  lines.push('')
  lines.push(`**规模**：${volume.scale}`)
  lines.push('')
  lines.push(
    volume.requires.length === 0
      ? '**前置**：无（可直接开工）'
      : `**前置**：${volume.requires
          .map((id) => {
            const required = HANDOFF_VOLUMES.find((item) => item.id === id)
            return required === undefined ? id : `${String(required.index).padStart(2, '0')} ${required.title}`
          })
          .join('、')}`
  )
  lines.push('')
  lines.push('## 文档顺序（按编号做，不要跳）')
  lines.push('')
  lines.push('| 顺序 | 文档 | 做什么 | 字段 | 可开工 |')
  lines.push('| --- | --- | --- | --- | --- |')
  for (const item of status?.docs ?? []) {
    const file = item.path.split('/').pop() ?? ''
    const marker = item.applicable ? (item.ready ? '✅' : '⏳') : '—'
    lines.push(
      `| ${String(item.number).padStart(2, '0')} | [${escapeCell(item.doc.title)}](${encodeURI(file)}) | ${escapeCell(item.doc.purpose)} | ${item.fieldFilled}/${item.fieldTotal} | ${marker} |`
    )
  }
  lines.push('')
  if (status !== undefined && status.blockers.length > 0) {
    lines.push('## 本卷校验问题')
    lines.push('')
    for (const message of status.blockers.slice(0, 12)) lines.push(`- ${message}`)
    if (status.blockers.length > 12) lines.push(`- …… 其余 ${status.blockers.length - 12} 条见校验报告`)
    lines.push('')
  }
  lines.push('## 本卷验收（整卷做完逐条打勾）')
  lines.push('')
  for (const item of volume.acceptance) lines.push(`- [ ] ${acceptanceText(item)}`)
  lines.push('')
  lines.push('## 本卷明确不做')
  lines.push('')
  for (const item of volume.outOfScope) lines.push(`- ${item}`)
  lines.push('')
  return lines.join('\n')
}

/* ------------------------------------------------------------------ */
/* 并行度：哪些卷/文档可以同时开工                                       */
/* ------------------------------------------------------------------ */

export interface ParallelWave {
  index: number
  volumes: Array<{ id: HandoffVolumeId; folder: string; title: string }>
  /** 本波可开工的文档（相对路径，按卷顺序） */
  docs: string[]
}

export interface ParallelismPlan {
  /** 按卷依赖深度分波：同波可同时开工 */
  waves: ParallelWave[]
  /** 同波内共享字段的文档对：并行前先约定口径，否则两边各写一套 */
  conflicts: Array<{ a: string; b: string; fields: string[] }>
  /** 可并行的卷组合（同一波里多于一个卷） */
  parallelGroups: HandoffVolumeId[][]
  /** 最长依赖链（按文档数计；**没有工时数据，不叫关键路径**） */
  longestChain: string[]
}

/**
 * 算并行度。
 *
 * ## 为什么需要
 * `sequence` 是严格串行的一条链，但卷依赖图不是链：`内容 / 系统 / 界面` 三卷
 * 都只依赖核心玩法，彼此不依赖——完全可以同时开工。串行做完等于把工期拉长一倍。
 *
 * ## 判据
 * - **卷级**：`requires` 为空 = 第 1 波；否则 = 依赖里最深的波 + 1。同波可并行。
 * - **文档级**：同波内两份文档若共享字段（`章.字段`），并行前必须先约定口径，
 *   否则同一份数值两边各写一套，合并时才发现对不上。
 * - **最长链**：按文档数算（不是工时），用来回答「最短也要走几步」。
 */
export function analyzeParallelism(
  doc: CeshuDocument,
  context?: HandoffRenderContext
): ParallelismPlan {
  const planned = context?.planned ?? planHandoffDocs(doc)
  const presentVolumes = HANDOFF_VOLUMES.filter((volume) =>
    planned.some((item) => item.volume.id === volume.id)
  )
  const presentIds = new Set(presentVolumes.map((volume) => volume.id))
  const requiredOf = (volume: HandoffVolume): HandoffVolumeId[] =>
    volume.requires.filter((id) => presentIds.has(id))

  // 波次：反复取「依赖已全部就绪」的卷，直到没有可推进的（防环）
  const waveOf = new Map<HandoffVolumeId, number>()
  let pending = [...presentVolumes]
  for (let guard = 0; pending.length > 0 && guard < 20; guard += 1) {
    const ready = pending.filter((volume) => requiredOf(volume).every((id) => waveOf.has(id)))
    if (ready.length === 0) break
    for (const volume of ready) {
      const requires = requiredOf(volume)
      waveOf.set(
        volume.id,
        requires.length === 0 ? 0 : 1 + Math.max(...requires.map((id) => waveOf.get(id) ?? 0))
      )
    }
    pending = pending.filter((volume) => !waveOf.has(volume.id))
  }

  const waveCount = presentVolumes.reduce((max, volume) => Math.max(max, waveOf.get(volume.id) ?? 0), -1) + 1
  const waves: ParallelWave[] = []
  for (let index = 0; index < waveCount; index += 1) {
    const volumes = presentVolumes.filter((volume) => (waveOf.get(volume.id) ?? 0) === index)
    if (volumes.length === 0) continue
    waves.push({
      index,
      volumes: volumes.map((volume) => ({
        id: volume.id,
        folder: handoffVolumeFolderName(volume),
        title: volume.title
      })),
      docs: planned
        .filter((item) => (waveOf.get(item.volume.id) ?? 0) === index)
        .map((item) => item.path)
    })
  }

  // 冲突：同波内两份文档共享字段
  const conflicts: ParallelismPlan['conflicts'] = []
  for (const wave of waves) {
    const inWave = planned.filter((item) => wave.docs.includes(item.path))
    for (let i = 0; i < inWave.length; i += 1) {
      for (let j = i + 1; j < inWave.length; j += 1) {
        const left = inWave[i]
        const right = inWave[j]
        // 同卷内本来就是顺序关系（`next` 链），共享字段是预期行为，不算并行冲突
        if (left.volume.id === right.volume.id) continue
        const leftKeys = new Set(left.def.fields.map((item) => `${item.chapter}.${item.field}`))
        const shared = [
          ...new Set(
            right.def.fields
              .map((item) => `${item.chapter}.${item.field}`)
              .filter((key) => leftKeys.has(key))
          )
        ]
        if (shared.length > 0) conflicts.push({ a: left.path, b: right.path, fields: shared })
      }
    }
  }

  const parallelGroups = waves
    .filter((wave) => wave.volumes.length > 1)
    .map((wave) => wave.volumes.map((volume) => volume.id))

  // 最长链：同「就绪即推进」，取依赖链里文档数最多的一条
  const chainOf = new Map<HandoffVolumeId, string[]>()
  pending = [...presentVolumes]
  for (let guard = 0; pending.length > 0 && guard < 20; guard += 1) {
    const ready = pending.filter((volume) => requiredOf(volume).every((id) => chainOf.has(id)))
    if (ready.length === 0) break
    for (const volume of ready) {
      const own = planned.filter((item) => item.volume.id === volume.id).map((item) => item.path)
      let best: string[] = []
      for (const id of requiredOf(volume)) {
        const candidate = chainOf.get(id) ?? []
        if (candidate.length > best.length) best = candidate
      }
      chainOf.set(volume.id, [...best, ...own])
    }
    pending = pending.filter((volume) => !chainOf.has(volume.id))
  }
  const longestChain = [...chainOf.values()].sort((left, right) => right.length - left.length)[0] ?? []

  return { waves, conflicts, parallelGroups, longestChain }
}

/** 并行度 → Markdown（总纲与面板共用） */
export function renderParallelismMarkdown(plan: ParallelismPlan): string {
  const lines: string[] = []
  lines.push('### 并行机会（同波可同时开工）')
  lines.push('')
  if (plan.waves.length === 0) {
    lines.push('- 当前没有可开工的文档。')
    return lines.join('\n')
  }
  for (const wave of plan.waves) {
    const folders = wave.volumes.map((volume) => `\`${volume.folder}\``).join('、')
    lines.push(`- **第 ${wave.index + 1} 波**：${folders}（${wave.docs.length} 份文档）`)
  }
  lines.push('')
  if (plan.parallelGroups.length > 0) {
    lines.push('**可以并行的卷**：')
    lines.push('')
    for (const group of plan.parallelGroups) lines.push(`- ${group.join(' + ')}`)
    lines.push('')
  }
  if (plan.conflicts.length > 0) {
    lines.push('**并行前先约口径（同波跨卷共享字段）**')
    lines.push('')
    for (const conflict of plan.conflicts.slice(0, 8)) {
      lines.push(`- \`${conflict.a}\` ↔ \`${conflict.b}\`：${conflict.fields.join('、')}`)
    }
    if (plan.conflicts.length > 8) {
      lines.push(`- …另有 ${plan.conflicts.length - 8} 对，见 \`index.json\` 的 \`parallelism.conflicts\``)
    }
    lines.push('')
  } else if (plan.parallelGroups.length > 0) {
    lines.push('同波各卷没有共享字段，可以放心并行。')
    lines.push('')
  }
  return lines.join('\n')
}

/**
 * 开发交接体检：把「完整 + 路线清晰」凝成一张导出时快照。
 *
 * 直接服务产品判据——**拿到这份东西，能不能一路做完**。它不新增任何口径，
 * 只是把已存在的四个分析器（完备度 / 门禁 / 并行度 / 可开发性缺口）并排到一个视图里：
 * 设计填了多少、哪些文档能开工、哪些填了却交不了活、下一步先做什么。
 * README 与人看，逻辑与 `HealthPanel` 同源（后者只是同一组数据的结构化呈现）。
 */
export function renderHandoffHealthMarkdown(doc: CeshuDocument, context?: HandoffRenderContext): string {
  const readiness = computeReadiness(doc)
  const plan = context?.plan ?? buildHandoffPlan(doc)
  const planned = context?.planned ?? planHandoffDocs(doc)
  const parallelism = analyzeParallelism(doc, { plan, planned })
  const gaps = findCouplingGaps(doc)

  const stagePct = (filled: number, total: number): number =>
    total === 0 ? 100 : Math.round((filled / total) * 100)
  const conceptPct = stagePct(readiness.concept.required_filled, readiness.concept.required_total)
  const productionPct = stagePct(readiness.production.required_filled, readiness.production.required_total)
  const releasePct = stagePct(readiness.release.required_filled, readiness.release.required_total)
  const filled = readiness.total_required - readiness.total_missing
  const pct = Math.round(readiness.total_ratio * 100)

  const docs = plan.flatMap((volume) => volume.docs)
  const readyCount = docs.filter((item) => item.applicable && item.ready).length
  const blockedCount = docs.filter((item) => item.applicable && !item.ready).length
  const naCount = docs.filter((item) => !item.applicable).length
  const blocked = docs.filter((item) => item.applicable && !item.ready)

  const lines: string[] = []
  lines.push('## 开发体检（导出时快照）')
  lines.push('')
  lines.push('> 一句话判据：**这份包现在能不能一路做完**。')
  lines.push('')
  lines.push(
    `- **设计完成度**：${pct}%（必填 ${filled}/${readiness.total_required}；` +
      `立项 ${conceptPct}% ｜ 研发 ${productionPct}% ｜ 发行 ${releasePct}%）`
  )
  lines.push(
    `- **交接门禁**：${readyCount} 份可开工 ｜ ${blockedCount} 份待补 ｜ ${naCount} 份不适用`
  )
  lines.push(
    `- **并行机会**：${parallelism.waves.length} 波` +
      (parallelism.parallelGroups.length > 0
        ? `；可并行卷：${parallelism.parallelGroups.map((group) => group.join(' + ')).join('、')}`
        : '')
  )
  lines.push(`- **可开发性缺口**：${gaps.length} 个（填了却交不了活，必须补）`)
  lines.push('')

  if (blocked.length > 0) {
    lines.push('### 门禁拦路（待补文档，按编号顺序做）')
    lines.push('')
    for (const item of blocked.slice(0, 12)) {
      const reasons: string[] = []
      if (item.fieldFilled < item.fieldTotal) reasons.push(`缺 ${item.fieldTotal - item.fieldFilled} 字段`)
      if (item.blockers.length > 0) reasons.push(`问题 ${item.blockers.length}`)
      lines.push(`- ⏳ \`${item.path}\` — ${item.doc.title}（${reasons.join('，')}）`)
    }
    if (blocked.length > 12) {
      lines.push(`- …另有 ${blocked.length - 12} 份，见下方「目录与门禁」`)
    }
    lines.push('')
  }

  if (gaps.length > 0) {
    lines.push('### 可开发性缺口（先补这些：硬返工）')
    lines.push('')
    for (const gap of gaps) {
      lines.push(`- ${gap.because}已填，但「${gap.label}」为空——${gap.why}`)
    }
    lines.push('')
  }

  lines.push('### 下一步')
  lines.push('')
  const steps: string[] = []
  if (gaps.length > 0) steps.push('先补「可开发性缺口」（不补则程序只能自己编，必返工）')
  if (blocked.length > 0) steps.push('再补「门禁拦路」文档，按编号顺序做')
  if (parallelism.parallelGroups.length > 0) {
    steps.push(`可并行卷同时开工：${parallelism.parallelGroups.map((group) => group.join(' + ')).join('、')}`)
  }
  if (steps.length === 0) steps.push('设计齐备、门禁全过，可以进入编码——按 `index.json` 顺序做')
  steps.forEach((step, index) => lines.push(`${index + 1}. ${step}`))
  lines.push('')

  return lines.join('\n')
}

/**
 * 开发路线（独立文件 `开发路线.md`）：人进引擎前一眼看完的导航。
 *
 * 与 README 的区别：README 是「施工总纲」（目录树 + 门禁 + 横切 + 全局约束 + 非目标），
 * 这份是**只讲顺序与门禁的精简路线图**——导演照它进引擎，不必先读 1300 行总纲。
 * 数据同源：顺序来自 `planHandoffDocs`、并行来自 `analyzeParallelism`、门禁来自 `buildHandoffPlan`，
 * 不新增口径。
 */
export function renderHandoffRouteMarkdown(doc: CeshuDocument, context?: HandoffRenderContext): string {
  const plan = context?.plan ?? buildHandoffPlan(doc)
  const planned = context?.planned ?? planHandoffDocs(doc)
  const parallelism = analyzeParallelism(doc, { plan, planned })
  const statusById = new Map(plan.flatMap((volume) => volume.docs).map((status) => [status.doc.id, status]))

  const lines: string[] = []
  lines.push(`# ${String(doc.meta.game_name ?? '未命名')} · 开发路线`)
  lines.push('')
  lines.push(
    '> 进游戏引擎开发前，先看这份。它是**施工顺序 + 门禁 + 并行**的导航，不是详细规格——' +
      '详细规格在 `00-架构` … `06-研发` 的文档里，按编号顺序做。'
  )
  lines.push('')
  lines.push('## 施工顺序（一份一份做，做完验收再开下一份）')
  lines.push('')
  for (const item of planned) {
    const status = statusById.get(item.def.id)
    const mark = status === undefined ? '—' : !status.applicable ? '—' : status.ready ? '✅' : '⏳'
    lines.push(`- ${mark} \`${item.path}\` — ${item.def.title}`)
  }
  lines.push('')
  lines.push(renderParallelismMarkdown(parallelism))
  const blocked = plan.flatMap((volume) => volume.docs).filter((status) => status.applicable && !status.ready)
  if (blocked.length > 0) {
    lines.push('## 门禁拦路（先补这些，对应文档才能开工）')
    lines.push('')
    for (const status of blocked.slice(0, 12)) {
      const reasons: string[] = []
      if (status.fieldFilled < status.fieldTotal) reasons.push(`缺 ${status.fieldTotal - status.fieldFilled} 字段`)
      if (status.blockers.length > 0) reasons.push(`问题 ${status.blockers.length}`)
      lines.push(`- ⏳ \`${status.path}\` — ${status.doc.title}（${reasons.join('，')}）`)
    }
    lines.push('')
  }
  lines.push('## 怎么用')
  lines.push('')
  lines.push('- 按上面顺序，一份文档做完、验收通过，再开下一份；')
  lines.push('- 同波可并行的卷（见「并行机会」）可同时开工，跨卷共享字段先约口径；')
  lines.push('- 规则以 `contract.json` 为准，数据只从 `data/snapshot.json` 来，代码里禁止硬编码数值；')
  lines.push('- 设计完成度与可开发性缺口见 `README.md` 的「开发体检」。')
  lines.push('')
  return lines.join('\n')
}

/**
 * 机读清单（`index.json`）：给编码智能体**程序化调度**用。
 *
 * ## 为什么 README 不够
 * README 是给人看的 Markdown 表格。智能体要解析它才能知道「有哪些文档、依赖谁、门禁过没过」，
 * 解析失败就退回「凭感觉挑一份」——这是长任务跑偏的常见起点。清单把这些变成 JSON：
 * 每份文档的路径、层级、门禁、上游、**最小上下文**、验收条目（带稳定 id 与判定方式）全在里面。
 *
 * ## 与 README 的关系
 * 两者由同一份 `planHandoffDocs` + `buildHandoffPlan` 派生，不各写一套；README 给人，清单给机器。
 */
export function renderHandoffManifest(
  doc: CeshuDocument,
  generatedAt: string,
  context?: HandoffRenderContext
): string {
  const plan = context?.plan ?? buildHandoffPlan(doc)
  const planned = context?.planned ?? planHandoffDocs(doc)
  const genre = resolveHandoffGenre(doc)
  const parallelism = analyzeParallelism(doc, context)
  const statusById = new Map(plan.flatMap((item) => item.docs).map((status) => [status.doc.id, status]))

  const docs = planned.map((item, index) => {
    const status = statusById.get(item.def.id)
    const siblings = planned.filter((sibling) => sibling.volume.id === item.volume.id)
    const position = siblings.findIndex((sibling) => sibling.def.id === item.def.id)
    const upstream = position > 0 ? siblings[position - 1] : undefined
    return {
      id: item.def.id,
      path: item.path,
      title: item.def.title,
      volume: item.volume.id,
      number: item.number,
      layer: item.layer,
      purpose: item.def.purpose,
      applicable: status?.applicable ?? true,
      ready: status?.ready ?? false,
      fieldFilled: status?.fieldFilled ?? 0,
      fieldTotal: status?.fieldTotal ?? 0,
      blockers: status?.blockers ?? [],
      dependsOn: upstream === undefined ? [] : [upstream.path],
      // 全局下一份（跨卷也串起来）：顺序开发是整包一条链，不是每卷各走各的
      next: planned[index + 1]?.path ?? null,
      /*
       * 顺序开发：一次只做一份，**不要通读整个包**。
       * 开工只需要「本文档 + contract.json」；进入新卷时先读一次卷目录做定位。
       * 上游是上一轮刚做完的，不需要重读——这也是为什么它不在最小上下文里。
       */
      minimalContext: position === 0 ? [handoffVolumeIndexPath(item.volume), 'contract.json'] : ['contract.json'],
      roles: docRoles(item.def),
      acceptance: item.def.acceptance.map((entry, index) => ({
        id: `${item.def.id}-a${index + 1}`,
        text: acceptanceText(entry),
        check: acceptanceCheck(entry)
      }))
    }
  })

  const manifest = {
    schema: 'mb-handoff-index/1',
    generatedAt,
    /**
     * 顺序开发：不要一次读完整个包。按 `sequence` 逐个做，做完一份、验收通过，再下一份。
     * 这份清单的作用是「排队」和「查门禁」，不是「通读目录」。
     */
    readingPolicy: 'sequential',
    /** 第一份开工的文档（= sequence[0]） */
    start: planned[0]?.path ?? null,
    /** 开发顺序（相对路径数组，按卷 + 卷内编号排好） */
    sequence: planned.map((item) => item.path),
    game: {
      name: String(doc.meta.game_name ?? '未命名'),
      type: String(doc.meta.game_type ?? ''),
      scope: getGddScope(doc),
      rulesetId: deriveRulesetId(doc)
    },
    genre: {
      primary: genre.primary,
      primaryLabel: genre.primaryLabel,
      composite: genre.composite,
      tags: genre.tags
    },
    precedence: [...HANDOFF_PRECEDENCE],
    /** 并行度：同波可同时开工；`conflicts` 是并行前必须先约口径的共享字段 */
    parallelism: {
      waves: parallelism.waves.map((wave) => ({
        index: wave.index,
        volumes: wave.volumes.map((volume) => volume.id),
        docs: wave.docs
      })),
      parallelGroups: parallelism.parallelGroups,
      conflicts: parallelism.conflicts,
      longestChain: parallelism.longestChain
    },
    files: {
      readme: 'README.md',
      gdd: 'gdd.md',
      bundle: 'bundle.json',
      contract: 'contract.json',
      schema: 'schema.json',
      snapshot: 'data/snapshot.json',
      prototype: 'prototype/demo.html'
    },
    volumes: plan.map((item) => ({
      id: item.volume.id,
      index: item.volume.index,
      folder: handoffVolumeFolderName(item.volume),
      title: item.volume.title,
      outcome: item.volume.outcome,
      requires: item.volume.requires,
      gate: {
        fieldFilled: item.keyFieldFilled,
        fieldTotal: item.keyFieldTotal,
        blockers: item.blockers.length,
        ready: item.ready
      }
    })),
    docs
  }
  return `${JSON.stringify(manifest, null, 2)}\n`
}

/**
 * 渲染交接包总纲（README）。
 *
 * 给人和智能体都看的第一页：品类、目录树、门禁、数据源约定、横切关注点与全局约束。
 * 关键约定必须写死在这里，否则每份文档都要重复一遍、且迟早不一致。
 */
export function renderHandoffIndex(
  doc: CeshuDocument,
  generatedAt: string,
  context?: HandoffRenderContext
): string {
  const plan = context?.plan ?? buildHandoffPlan(doc)
  const genre = resolveHandoffGenre(doc)
  const lines: string[] = []
  lines.push(`# ${String(doc.meta.game_name ?? '未命名')} · 开发交接包`)
  lines.push('')
  lines.push(`> 生成时间：${generatedAt}`)
  lines.push(
    `> 定位：${String(doc.meta.positioning ?? '—')} ｜ 类型：${String(doc.meta.game_type ?? '—')} ｜ 平台：${
      Array.isArray(doc.meta.platform) ? doc.meta.platform.join('/') : String(doc.meta.platform ?? '—')
    }`
  )
  lines.push(
    `> 品类档案：${genre.primaryLabel}${genre.composite ? `；组合玩法：${genre.tags.join(' + ')}（取并集，共 ${genre.profiles.length} 套）` : ''}`
  )
  const plannedDocs = context?.planned ?? planHandoffDocs(doc)
  const layerCount = { baseline: 0, genre: 0, conditional: 0 }
  for (const item of plannedDocs) layerCount[item.layer] += 1
  lines.push(
    `> 文档构成：**通用基线 ${layerCount.baseline} 份**（先做这些）；品类专属 +${layerCount.genre} 份；条件文档 +${layerCount.conditional} 份`
  )
  lines.push(
    '> 施工顺序：先把**通用基线**全部做完（这部分与玩法无关，任何游戏都成立）；' +
      '再按标记补「品类专属」与「条件文档」——它们是**决策增量**，不是地基。'
  )
  lines.push('')
  lines.push(renderHandoffHealthMarkdown(doc, { plan, planned: plannedDocs }))
  lines.push('## 怎么用（给编码智能体）')
  lines.push('')
  lines.push('1. **按编号顺序做**：从 `00-架构/01-…` 开始，一份文档做完、验收通过，再打开下一份；')
  lines.push('2. **一次只读一份，按顺序做**：不要通读整个包；顺序见 `index.json` 的 `sequence`（或下面的目录编号）。每份 100–200 行，含「要解决什么 / 要实现什么 / 规则与数据 / 验收 / 明确不做」；')
  lines.push('3. **数据只从 `data/snapshot.json` 来**：那是唯一内容源（表结构 + 全部行），代码里不许硬编码数值；')
  lines.push('4. **规则以 `contract.json` 为准**：规则集标识、参数表、断言、验收旅程都在里面，冲突时以它为准；')
  lines.push('5. **`prototype/demo.html` 是参考实现**（若存在）：手感与反馈照它对齐，但不要照抄临时代码结构。')
  lines.push('')
  lines.push('### 冲突时听谁的（优先级从高到低）')
  lines.push('')
  HANDOFF_PRECEDENCE.forEach((item, index) => lines.push(`${index + 1}. ${item}`))
  lines.push('')
  lines.push('## 目录与门禁')
  lines.push('')
  for (const item of plan) {
    const volume = item.volume
    lines.push(`### ${handoffVolumeFolderName(volume)} ｜ ${volume.outcome}`)
    lines.push('')
    lines.push(
      `前置：${
        volume.requires.length === 0
          ? '无'
          : volume.requires
              .map((id) => {
                const required = HANDOFF_VOLUMES.find((candidate) => candidate.id === id)
                return required === undefined ? id : `${String(required.index).padStart(2, '0')} ${required.folder}`
              })
              .join('、')
      } ｜ 门禁：字段 ${item.keyFieldFilled}/${item.keyFieldTotal} ｜ 阻塞 ${item.blockers.length} ｜ ${item.ready ? '✅ 可开工' : '⏳ 待补'}`
    )
    lines.push('')
    for (const docStatus of item.docs) {
      const hasSystems = (docStatus.doc.systems ?? []).length > 0
      const notes: string[] = []
      if (docStatus.layer === 'genre') notes.push('品类专属')
      if (docStatus.layer === 'conditional') notes.push('条件文档')
      if (docStatus.blockers.length > 0) notes.push(`问题 ${docStatus.blockers.length}`)
      if (hasSystems && docStatus.systemsEnabled.length === 0) notes.push('系统未启用')
      const detail = notes.length > 0 ? `，${notes.join('，')}` : ''
      const marker = docStatus.applicable ? (docStatus.ready ? '✅' : '⏳') : '—'
      lines.push(
        `- ${marker} [\`${docStatus.path}\`](${encodeURI(docStatus.path)}) — ${docStatus.doc.title}（字段 ${docStatus.fieldFilled}/${docStatus.fieldTotal}${detail}）`
      )
    }
    lines.push('')
  }
  lines.push(renderParallelismMarkdown(analyzeParallelism(doc, { plan, planned: plannedDocs })))
  lines.push('## 按角色看（谁该读哪些文档）')
  lines.push('')
  for (const entry of buildRoleIndex(doc)) {
    if (entry.docs.length === 0) continue
    lines.push(`### ${entry.label}（${entry.docs.length} 份）`)
    lines.push('')
    for (const item of entry.docs) {
      lines.push(`- \`${item.path}\` — ${item.def.title}`)
    }
    lines.push('')
  }
  lines.push('## 横切关注点与全局约束（每一份文档都适用）')
  lines.push('')
  /*
   * 横切关注点为什么做成「索引」而不是「第 6 份文档」：
   * 性能 / 存档 / 本地化 / 联机 / 数据管线 已经各有独立文档（见下表）。再写一份汇总文档，
   * 同一字段就成了第二个真源，校验问题还会被重复归属到两份文档（`coveredFields` 判重会失真）。
   * 这里只回答「去哪看 + 每个功能要问什么」；路径从真实规划派生，条件文档没触发就不出现，不给死链。
   */
  lines.push('### 横切关注点（每个功能都要过一遍）')
  lines.push('')
  const crossCutting: Array<{ label: string; id: string; ask: string }> = [
    { label: '性能预算', id: 'polish-perf', ask: '这个功能在最低配机型上掉多少帧？预算里有没有它的份额？' },
    { label: '存档与兼容', id: 'arch-save', ask: '这个功能的状态存不存？旧档缺字段怎么读？' },
    { label: '本地化与无障碍', id: 'polish-l10n', ask: '文案是否全走本地化表？色盲 / 字幕 / 按键重映射覆盖了吗？' },
    { label: '服务端与联机', id: 'tech-server', ask: '这个功能是客户端判定还是服务端判定？掉线怎么恢复？' },
    { label: '数据表与内容管线', id: 'arch-data', ask: '这个功能的数据进表了吗？还是硬编码在代码里？' }
  ]
  const crossRows = crossCutting
    .map((item) => ({ ...item, path: plannedDocs.find((planned) => planned.def.id === item.id)?.path }))
    .filter((item) => item.path !== undefined)
  if (crossRows.length > 0) {
    lines.push('| 关注点 | 看哪份文档 | 每个功能都要问 |')
    lines.push('| --- | --- | --- |')
    for (const row of crossRows) lines.push(`| ${row.label} | \`${row.path ?? ''}\` | ${row.ask} |`)
    lines.push('')
  }
  lines.push('### 全局约束')
  lines.push('')
  lines.push('- 数值只从参数表读，禁止魔法数字；改数值只改数据文件；')
  lines.push('- 所有面向玩家的等待都要有可见进度；所有破坏性操作都要二次确认；')
  lines.push('- 单局可玩性优先于内容量：先让一局好玩，再批量做关卡；')
  lines.push('- 不实现文档「明确不做」里的东西；要加需求，先改策划书再改代码。')
  lines.push('')
  lines.push('## 明确不做（整包范围外）')
  lines.push('')
  const nonGoals = Array.isArray(doc.meta.non_goals) ? (doc.meta.non_goals as string[]) : []
  const cutFeatures = Array.isArray(doc.mvp.cut_features) ? (doc.mvp.cut_features as string[]) : []
  if (nonGoals.length === 0 && cutFeatures.length === 0) {
    lines.push('（策划书未写「范围与非目标」，建议补 `meta.non_goals`，否则实现方会自行扩大范围）')
  } else {
    for (const item of nonGoals) lines.push(`- ${item}`)
    for (const item of cutFeatures) lines.push(`- ${item}（MVP 暂缓）`)
  }
  lines.push('')
  lines.push('## 包内文件')
  lines.push('')
  lines.push('| 文件 | 作用 |')
  lines.push('| --- | --- |')
  lines.push('| `README.md` | 本文件：品类、目录树、门禁、横切关注点与全局约束 |')
  lines.push('| `开发路线.md` | 进引擎前的精简导航：施工顺序 + 门禁 + 并行（**先读这份再开引擎**） |')
  lines.push('| `index.json` | 机读清单：文档 / 依赖 / 门禁 / 最小上下文 / 验收 id（**给智能体调度用，不必解析本文件的表格**） |')
  {
    const firstVolume = HANDOFF_VOLUMES[0]
    const lastVolume = HANDOFF_VOLUMES[HANDOFF_VOLUMES.length - 1]
    const range =
      firstVolume !== undefined && lastVolume !== undefined
        ? `\`${handoffVolumeFolderName(firstVolume)}/\` … \`${handoffVolumeFolderName(lastVolume)}/\``
        : '卷文件夹'
    lines.push(`| ${range} | ${HANDOFF_VOLUMES.length} 个卷文件夹，内含按编号排序的设计文档 |`)
  }
  lines.push('| `gdd.md` | 完整策划书（人读，含所有章节） |')
  lines.push('| `bundle.json` | 机读字段 + 字段契约（给 AI 读） |')
  lines.push('| `contract.json` | 规则集 / 参数 / 断言 / 验收旅程（机器可判） |')
  lines.push('| `schema.json` | 数据表结构（字段名/类型/枚举/上下限；本库有数据表时才有） |')
  lines.push('| `data/snapshot.json` | 数据表全部行（唯一内容源；本库有数据表时才有） |')
  lines.push('| `prototype/demo.html` | 可玩原型（已生成原型时才有） |')
  lines.push('')
  return lines.join('\n')
}
