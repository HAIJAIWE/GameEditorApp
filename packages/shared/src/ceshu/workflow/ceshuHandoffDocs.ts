import type { GenreProfileKey } from '../prompts'
import type { HandoffDoc, HandoffVolumeId } from './ceshuHandoffTypes'

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
      { text: '能一句话说清本作不做什么', check: 'field', fields: [{ chapter: 'meta', field: 'non_goals' }] },
      {
        text: '目标平台与输入方式（键鼠/手柄/触屏）已确定',
        check: 'field',
        fields: [{ chapter: 'meta', field: 'platform' }]
      },
      {
        text: '关键决策写清了被放弃方案的代价（不是「经过考虑」）',
        check: 'field',
        fields: [{ chapter: 'meta', field: 'alternatives' }]
      }
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
    acceptance: [
      { text: '工程骨架可编译运行', check: 'test', how: '真跑构建 + 起空场景；出包失败或起不来即未过' },
      {
        text: '模块边界与文档一致（不多也不少）',
        check: 'manual',
        how: '对照 tech.core_architecture 逐个模块核对目录与依赖：多出来的模块要么补进文档、要么删掉'
      }
    ]
  },
  {
    id: 'arch-data',
    volumeId: 'architecture',
    order: 3,
    title: '数据表与内容管线',
    purpose: '说清要建哪些表、关键字段是什么、期望多少条——内容从数据来，不从代码来。',
    fields: [{ chapter: 'tech', field: 'data_tables', why: '表名/用途/关键字段/期望条数，决定数据层形状' }],
    acceptance: [
      { text: '每张表都能按 `data/snapshot.json` 建出来', check: 'data' },
      {
        text: '代码里没有硬编码的装备/敌人/关卡数据',
        check: 'manual',
        how: '在代码里搜装备名/敌人名/关卡号：命中即未过（数据只能从数据文件读）'
      },
      {
        text: '新增一条内容只需改数据文件',
        check: 'manual',
        how: '真的加一条内容，只改 data 文件、不改代码、不重编译，看能不能生效'
      }
    ]
  },
  {
    id: 'arch-state',
    volumeId: 'architecture',
    order: 4,
    title: '状态机与场景流程',
    purpose: '把游戏有哪些状态、什么事件触发、切过去要重置什么写死——骨架的主干。',
    fields: [{ chapter: 'gameplay', field: 'state_machine', why: '状态/事件/结算/新状态，一条转移一行' }],
    acceptance: [
      { text: '状态机可完整走一圈', check: 'test', how: '自动化脚本按 gameplay.state_machine 的转移逐条跑，跑不通即未过' },
      {
        text: '每次转移的结算效果与文档一致',
        check: 'manual',
        how: '对照 gameplay.state_machine 的「结算」列逐条核对代码里的转移处理'
      },
      { text: '不存在无法退出的状态', check: 'test', how: '穷举状态表里每个状态，确认都有出边' }
    ]
  },
  {
    id: 'arch-save',
    volumeId: 'architecture',
    order: 5,
    title: '存档与兼容',
    purpose: '定死存什么、什么类型、什么时候写、旧档怎么读——升级后读不出旧档是常见事故。',
    fields: [{ chapter: 'tech', field: 'save_format', why: '存档项/类型/写入时机/迁移策略' }],
    acceptance: [
      { text: '存档能写能读', check: 'test', how: '写档 → 重启 → 读档，进度与写档时一致' },
      { text: '删档回到初始状态', check: 'test', how: '删掉存档再启动，游戏回到初始状态、不崩' },
      { text: '缺字段的旧档能按默认值读出', check: 'test', how: '手造一份缺字段的旧档，读入不崩且缺的项取默认值' }
    ]
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
      {
        text: '每个模块都有明确的对外接口（输入 / 输出 / 依赖）',
        check: 'field',
        fields: [{ chapter: 'tech', field: 'core_architecture' }]
      },
      {
        text: '模块间无循环依赖（数据层 ← 玩法层 ← 界面层）',
        check: 'manual',
        how: '画一次依赖图（或跑依赖检查脚本），出现环即未过'
      },
      {
        text: '关键数据结构有字段与类型（不只是表名）',
        check: 'field',
        fields: [{ chapter: 'tech', field: 'data_tables' }]
      },
      { text: '错误码 / 异常约定统一', check: 'manual', how: '翻一遍抛错处：错误码是否都来自同一张表、文案是否统一' }
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
      { text: '工程可编译运行（空场景能进）', check: 'test', how: '真跑构建 + 起空场景，出包或启动失败即未过' },
      {
        text: '目录按模块边界划分，无循环依赖（数据层 ← 玩法层 ← 界面层）',
        check: 'manual',
        how: '对照 tech.core_architecture 的模块清单核对目录，并检查依赖方向只有一个'
      },
      { text: '入口点明确（GameMode / Scene / Main）', check: 'manual', how: '从仓库根按 README 的启动说明能一路找到入口文件' },
      { text: '数值与配置走数据驱动（不写死在代码里）', check: 'data' }
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
    acceptance: [
      { text: '一局能从头玩到尾', check: 'test', how: '真跑一局从进场景到结算再回主菜单，中途不卡死不空转' },
      {
        text: '120 秒走读的每一步都能在实机复现',
        check: 'test',
        how: '照 gameplay.playthrough_120s 的步骤逐条在实机复现，缺一步即未过'
      }
    ]
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
    acceptance: [
      {
        text: '所有操作都有明确输入源',
        check: 'field',
        fields: [{ chapter: 'gameplay', field: 'control_scheme' }]
      },
      {
        text: '胜负判定可复现（不是「感觉输了」）',
        check: 'field',
        fields: [{ chapter: 'gameplay', field: 'win_lose_conditions' }]
      }
    ]
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
      { text: '伤害计算与公式逐项一致', check: 'assertion', match: '伤害' },
      {
        text: '元素克制有正反例',
        check: 'manual',
        how: '对每种克制关系各跑一场（克制/被克制各一次），系数与 combat.element_system 一致'
      },
      {
        text: '单场时长落在目标区间',
        check: 'test',
        how: '同配置跑 10 场取平均，落在 combat.combat_pace 的目标区间内'
      }
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
      {
        text: '所有玩法数值来自参数表，代码里没有魔法数字',
        check: 'manual',
        how: '在玩法代码里搜数字字面量：除 0/1 这类结构常量外，命中即未过'
      },
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
    acceptance: [
      { text: '新增一关只改数据表', check: 'data', match: '关卡' },
      { text: '每关配置与文档逐项一致', check: 'data', match: '关卡' },
      {
        text: '首关最简单、Boss 最高',
        check: 'manual',
        how: '照 level_table 的难度系数列排序核对：首关最小、Boss 关最大'
      }
    ]
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
    acceptance: [
      {
        text: '难度整体递增且每段有缓冲',
        check: 'field',
        fields: [{ chapter: 'level_design', field: 'difficulty_curve_points' }]
      },
      {
        text: '前 3 关各只教一件事',
        check: 'field',
        fields: [{ chapter: 'level_design', field: 'first_levels' }]
      }
    ]
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
    acceptance: [
      { text: '每种敌人有可区分的行为', check: 'field', fields: [{ chapter: 'story', field: 'enemy_types' }] },
      {
        text: 'Boss 有阶段与弱点，且可被反制',
        check: 'field',
        fields: [{ chapter: 'combat', field: 'boss_mechanics' }]
      }
    ]
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
      {
        text: '装备槽位与品质等级可配置',
        check: 'field',
        fields: [
          { chapter: 'systems', field: 'equipment.config.slot_count' },
          { chapter: 'systems', field: 'item.config.rarity_levels' }
        ]
      },
      {
        text: '强化/镶嵌/附魔规则有明确数值与上限',
        check: 'field',
        fields: [
          { chapter: 'systems', field: 'equipment.config.enhance_max' },
          { chapter: 'systems', field: 'equipment.config.enhance_material' }
        ]
      },
      {
        text: '词条来源可追到参数表，不散落在代码里',
        check: 'field',
        fields: [{ chapter: 'economy', field: 'production_chain' }]
      }
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
    acceptance: [
      {
        text: '升级能带来可感知的提升',
        check: 'field',
        fields: [{ chapter: 'numeric', field: 'growth_curves' }]
      },
      // 断崖只能靠复算：曲线单调性写成断言（contract.json）才能机判
      { text: '满级前不出现数值断崖/爆炸', check: 'assertion', match: '成长' }
    ]
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
    acceptance: [
      { text: '新手前 10 分钟收支与账本一致', check: 'field', fields: [{ chapter: 'economy', field: 'ledger' }] },
      {
        text: '不存在只产出不回收的资源（或已注明）',
        check: 'manual',
        how: '照 economy.ledger 的产出/回收两列逐项配对：每个产出项都要有回收项，或文档里显式注明「本作不做回收」'
      }
    ]
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
    acceptance: [
      {
        text: '技能数量与获取路径与文档一致',
        check: 'field',
        fields: [{ chapter: 'combat', field: 'skill_system' }]
      },
      {
        text: 'Buff 可叠加/可驱散的规则明确',
        check: 'field',
        fields: [{ chapter: 'combat', field: 'buff_debuff' }]
      }
    ]
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
    acceptance: [
      { text: 'core_flows 每条都能走到出口', check: 'field', fields: [{ chapter: 'uiux', field: 'core_flows' }] },
      {
        text: '核心操作 ≤3 步完成',
        check: 'manual',
        how: '照 uiux.core_flows 数每个流程从进入到完成的步数：超过 3 步即未过（或文档里写明为什么必须更多）'
      }
    ]
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
    acceptance: [
      { text: '所有 ≥3 秒等待有可见进度', check: 'field', fields: [{ chapter: 'uiux', field: 'feedback_rules' }] },
      {
        text: '破坏性操作 100% 二次确认',
        check: 'field',
        fields: [{ chapter: 'uiux', field: 'usability_standards' }]
      },
      { text: '关键数字首屏可见', check: 'field', fields: [{ chapter: 'uiux', field: 'key_screens' }] }
    ]
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
      {
        text: '最低档机型稳定达标',
        check: 'test',
        how: '在 target_devices 的最低机型上跑 performance_budget 里 method 列的测法，连续 10 分钟不掉帧'
      },
      { text: '包体不超预算', check: 'test', how: '出正式包后量包体，与 performance_budget 的包体上限比' },
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
    acceptance: [
      { text: '关键事件能在日志里看到', check: 'test', how: '跑一遍核心流程，在日志里逐个找到 event_tracking 里的事件名' },
      {
        text: '指标口径与埋点字段对得上',
        check: 'field',
        fields: [
          { chapter: 'analytics', field: 'metric_system' },
          { chapter: 'analytics', field: 'event_tracking' }
        ]
      }
    ]
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
    acceptance: [
      {
        text: '首发语言界面无截断/乱码',
        check: 'test',
        how: '用 language_list 里的首发语言把所有界面走一遍，截图比对是否有截断、乱码、溢出'
      },
      {
        text: '色盲模式下关键信息不丢',
        check: 'test',
        how: '开色盲模式（或灰度滤镜）后逐屏检查：关键信息不能只靠颜色区分'
      }
    ]
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
    acceptance: [
      {
        text: '每个结局都有可达路径（无死路）',
        check: 'field',
        fields: [{ chapter: 'story', field: 'branch_endings' }]
      },
      {
        text: '关键抉择有真实代价，不是伪分支',
        check: 'manual',
        how: '挑 3 个关键抉择，各走两遍不同选项：结果必须真的不同（不同结局/不同可达内容），只是换文案不算'
      }
    ]
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
    acceptance: [
      // 系数一致只能复算：离线收益写成断言才机判
      { text: '离线收益系数与在线口径一致（可复算）', check: 'assertion', match: '离线' },
      {
        text: '回归时能立刻看到下一步目标',
        check: 'manual',
        how: '挂机 8 小时后回归，进游戏 10 秒内界面上必须能看到「下一步做什么」'
      }
    ]
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
    acceptance: [
      // 概率与保底写进 contract.json 的断言（期望抽数、保底触发）才能机判
      { text: '概率与保底可复算（含期望值）', check: 'assertion', match: '抽' },
      {
        text: '免费玩家的获取节奏明确',
        check: 'field',
        fields: [{ chapter: 'monetization', field: 'iap_design' }]
      }
    ]
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
    acceptance: [
      {
        text: '联盟权限与协作流程明确',
        check: 'field',
        fields: [{ chapter: 'systems', field: 'social.config.guild_max_members' }]
      },
      {
        text: '匹配与结算结果可复现',
        check: 'manual',
        how: '同样的 MMR 与同一批对手跑 3 次匹配，段位变化与赛季奖励要和 competitive.config 里的规则一致'
      }
    ]
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
    acceptance: [
      // 通胀/枯竭只能复算：把产出与消耗速率写成断言（contract.json）才机判
      { text: '数十小时不出现通胀或枯竭', check: 'assertion', match: '产出' },
      {
        text: '阶段目标逐级递进',
        check: 'field',
        fields: [{ chapter: 'economy', field: 'economic_goals' }]
      }
    ]
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
      {
        text: '每类任务有接取条件、追踪上限与奖励规则',
        check: 'field',
        fields: [
          { chapter: 'systems', field: 'quest.config.quest_types' },
          { chapter: 'systems', field: 'quest.config.quest_track_limit' },
          { chapter: 'systems', field: 'quest.config.reward_rule' }
        ]
      },
      {
        text: '剧情 / 支线任务可被数据配置（不写死）',
        check: 'manual',
        how: '真的加一条支线任务：只改数据文件、不改代码，能接取能完成'
      },
      {
        text: '新手引导能走通到首个核心循环',
        check: 'test',
        how: '新号从建号一路跑到第一次核心循环（不靠跳引导），全程无卡点'
      }
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
      {
        text: '关卡总数与内容量估算一致',
        check: 'field',
        fields: [{ chapter: 'systems', field: 'content.config.stage_count' }]
      },
      {
        text: '体力上限 / 恢复速率与付费设计自洽',
        check: 'field',
        fields: [
          { chapter: 'systems', field: 'content.config.energy_cap' },
          { chapter: 'systems', field: 'content.config.energy_regen' }
        ]
      },
      {
        text: '扫荡 / 星级规则可配置',
        check: 'field',
        fields: [
          { chapter: 'systems', field: 'content.config.sweep_enabled' },
          { chapter: 'systems', field: 'content.config.star_rating' }
        ]
      }
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
      {
        text: '外观槽位与可换部件明确',
        check: 'field',
        fields: [{ chapter: 'systems', field: 'customization.config.appearance_slots' }]
      },
      {
        text: '外观付费不提供数值优势',
        check: 'manual',
        how: '逐个外观付费点核对：只改外观/表现，不改任何战斗或经济数值'
      },
      {
        text: '资产规格与美术章一致',
        check: 'field',
        fields: [{ chapter: 'art', field: 'asset_spec' }]
      }
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
    acceptance: [
      // 逐波复算就是断言：每波总血量 vs 可用 DPS 写成 contract 断言才机判
      { text: '每波总血量与可用 DPS 可达（逐波复算）', check: 'assertion', match: '波' },
      {
        text: '漏怪代价与容错明确',
        check: 'field',
        fields: [{ chapter: 'combat', field: 'combat_pace' }]
      },
      {
        text: '塔位布局有取舍（没有一种塔通吃）',
        check: 'manual',
        how: '用同一套塔位打 3 张不同地图，确认不存在「一种塔位/一种塔打穿全部」的解法'
      }
    ]
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
    acceptance: [
      {
        text: '资源循环闭合（采集-消耗-再生产）',
        check: 'field',
        fields: [{ chapter: 'economy', field: 'source_sink' }]
      },
      {
        text: '生存压力随进度上升，不是恒定',
        check: 'manual',
        how: '照 production_chain 的时间轴各阶段跑一次，量压力指标（敌人强度/资源缺口）必须随阶段上升'
      }
    ]
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
    acceptance: [
      {
        text: '兴趣点密度能撑起宣称时长',
        check: 'manual',
        how: '按 level_table 的兴趣点数量除以宣称时长，算出每分钟几个兴趣点；低于同期同类作品即未过'
      },
      {
        text: '不存在「最优跑图顺序」让其余内容作废',
        check: 'manual',
        how: '找 3 个不同路线的通关记录对比：不能出现一条路线让别的区域完全没必要去'
      }
    ]
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
      {
        text: '权威端明确（服务端说了算，客户端不改关键数值）',
        check: 'field',
        fields: [{ chapter: 'tech', field: 'online_mode' }]
      },
      {
        text: '断线与重连有明确行为（幂等，不会刷资源）',
        check: 'field',
        fields: [{ chapter: 'tech', field: 'sync_model' }]
      },
      {
        text: '排行榜/对战的数据一致性可复算',
        check: 'manual',
        how: '同一局结果在客户端与服务端各算一遍，数值必须一致（不一致以服务端为准）'
      },
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
      {
        text: '每个交互都能对到一条音效（事件 → 音效）',
        check: 'field',
        fields: [{ chapter: 'audio', field: 'sfx_events' }]
      },
      {
        text: '同时播放上限与优先级明确，不会爆音',
        check: 'field',
        fields: [{ chapter: 'audio', field: 'sfx_list' }]
      },
      {
        text: '切场景时音乐淡入淡出符合规范',
        check: 'field',
        fields: [{ chapter: 'audio', field: 'dynamic_audio' }]
      },
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
      {
        text: '每种资产类型都有尺寸与格式（缺失即视为未定，实现方只能自己定）',
        check: 'field',
        fields: [{ chapter: 'art', field: 'asset_spec' }]
      },
      {
        text: '命名规则可机读（前缀+用途+序号，不靠中文名找文件）',
        check: 'manual',
        how: '抽查 10 个资产文件，文件名必须符合 asset_spec 的前缀+用途+序号规则（出现中文名即未过）'
      },
      {
        text: '导入设置写明（压缩/Atlas/最大尺寸），换平台不重新对一遍',
        check: 'field',
        fields: [
          { chapter: 'art', field: 'multi_resolution' },
          { chapter: 'performance', field: 'performance_budget' }
        ]
      }
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
      {
        text: '任务按「框架 → 玩法 → 系统 → 内容 → 界面 → 打磨」排序',
        check: 'field',
        fields: [{ chapter: 'tech', field: 'milestones' }]
      },
      {
        text: '每条任务标注依赖与可判定交付物',
        check: 'manual',
        how: '逐条任务检查：依赖列不能为空，交付物必须能被别人验收（不是「已完成」这种自述）'
      },
      {
        text: '每条任务能追到一份设计文档',
        check: 'field',
        fields: [{ chapter: 'gameplay', field: 'state_machine' }]
      }
    ]
  }
] as const

/** 某卷的文档（按 order 排序） */
export function docsOfVolume(volumeId: HandoffVolumeId): HandoffDoc[] {
  return HANDOFF_DOCS.filter((doc) => doc.volumeId === volumeId).sort((left, right) => left.order - right.order)
}
