/**
 * 章节 `gameplay` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../../ceshu/reference'
import type { ChapterSchema } from '../core'
import type { CeshuFieldDef, ChapterData } from '../../ceshu/reference'

export const GAMEPLAY_FIELDS: CeshuFieldDef[] = [
  {
    key: 'core_loop',
    label: '核心循环',
    kind: 'textarea',
    placeholder: '如: 探索→战斗→获取→养成→更强探索',
    aiHint: '闭环叙事：做什么→得到什么→为何想继续；须首尾成环，每步写具体行为，禁「体验内容」空话；步骤归「核心循环·步骤」，勿重复',
    reviewHint: '能否闭环；每一步是否具体可玩；与「核心循环·步骤」是否重复'
  },
  {
    key: 'core_loop_points',
    label: '核心循环·步骤',
    kind: 'stringList',
    placeholder: '每行一个步骤',
    aiHint: '3-6 个步骤，按顺序每行一个',
    reviewHint: '步骤是否可玩（动词开头，不是「体验内容」）；是否首尾成环；与本体是否重复'
  },
  {
    key: 'core_loop_notes',
    label: '核心循环·补充',
    kind: 'textarea',
    aiHint: '循环之外的补充说明，可留空',
    reviewHint: '是否只放补充信息、没有把步骤又抄一遍；该留空时是否确实留空'
  },
  {
    key: 'loop_three_layers',
    label: '三层循环',
    kind: 'pipeList',
    columns: [
      { key: 'layer', label: '层级' },
      { key: 'question', label: '关注问题' },
      { key: 'action', label: '玩家动作' },
      { key: 'system', label: '系统变化' },
      { key: 'feedback', label: '反馈' },
      { key: 'carrier', label: '传递物' }
    ],
    placeholder: '层级|关注问题|玩家动作|系统变化|反馈|传递物',
    aiHint: '三层各一行：①瞬时（秒级，一次操作的手感与即时反馈）②单局（分钟级，一局的起承转合）③长线（小时级以上，跨局的成长/解锁）。每行写清「玩家动作→系统变化→反馈」，并指出向下一层传递什么（经验/资源/解锁/叙事钩子）',
    reviewHint: '三层是否都在；层级间是否有明确的「传递物」（不是各玩各的）；反馈是否即时可感知；与核心循环是否一致'
  },
  {
    key: 'game_modes',
    label: '游戏模式',
    kind: 'stringList',
    placeholder: '每行一个',
    aiHint: '2-4 个模式，每个一行：名称 + 一句话玩法差异',
    reviewHint: '是否为 2-4 个模式；每行是否「名称+一句差异」；差异句能否区分模式而非套话'
  },
  {
    key: 'first_30_min',
    label: '新手体验(前30分钟)',
    kind: 'textarea',
    aiHint: '一段概述：前 30 分钟的设计目标与节奏安排；按 0-2/2-10/10-30 分段的具体动作与反馈条目走「要点」字段，勿在本体罗列',
    reviewHint: '是否覆盖 0-2/2-10/10-30 三段；每段是否有具体动作与反馈；是否出现首个目标/高潮点'
  },
  {
    key: 'playthrough_120s',
    label: '120 秒走读',
    kind: 'textarea',
    aiHint: '连续走读一个 60–120 秒的真实片段（不是分段罗列）：进入看到什么→第一眼注意到什么→做第一个选择→这个选择的代价→代价如何恢复（或不可恢复）。要写成一条时间线，含具体数值与界面元素；用来验证「第一分钟是否留得住人」',
    reviewHint: '是否是一条连续时间线（而非分段清单）；是否包含代价与恢复；是否有具体数值/界面元素；与「新手体验(前30分钟)」是否重复'
  },
  {
    key: 'control_scheme',
    label: '操作方案',
    kind: 'text',
    aiHint: '一套操作方案：平台与输入方式 + 核心操作映射（移动/攻击/技能/交互）+ 键位或手势；多平台时写清差异',
    reviewHint: '是否覆盖全部核心操作；键位是否冲突；是否与目标平台（文档信息 platform）一致'
  },
  {
    key: 'win_lose_conditions',
    label: '胜负条件',
    kind: 'textarea',
    aiHint: '写清胜利条件（达成什么即胜）与失败条件（什么情况即败），各 1-3 条且可机器判定；单局与整体战役两个层级都要有',
    reviewHint: '条件是否可判定；是否存在「不可能输」的漏洞；是否与分支结局的达成条件冲突'
  },
  {
    key: 'tutorial_design',
    label: '新手引导设计',
    kind: 'textarea',
    aiHint: '新手引导：分几步、每步教什么机制、用什么场景承载、多久完成；给出「首次进入 3 分钟内理解核心循环」这类可验证目标',
    reviewHint: '是否只教操作不教目标；是否可跳过/重看；是否与首关设计（第十九章）重复或冲突'
  },
  {
    key: 'state_machine',
    label: '核心状态机',
    kind: 'pipeList',
    placeholder: '状态|触发事件|结算效果|新状态',
    aiHint: '只描述核心循环涉及的状态与转移；每行一次转移，结算效果写清「什么被重置、什么被保留」；怀疑重复结算的地方写明「每次只结算一次」；AI 全量生成时必填 5-8 条转移（覆盖主菜单/对局中/暂停/结算/失败/重开），禁止留空',
    reviewHint: '转移是否覆盖异常路径（资源不足/误触/刷新重进）；重置与保留的边界是否明确'
  }
]

export const GAMEPLAY_SPLIT_HINTS: ChapterSchema['splitHints'] = {
  first_30_min: {
    points: {
      aiHint: '按 0-2/2-10/10-30 分钟分段，每段一行：玩家动作 + 即时反馈 + 本段目标',
      reviewHint: '三段是否齐全；每行是否有「动作+反馈+目标」三要素；反馈是否即时可感知'
    },
    notes: {
      aiHint: '新手引导的补充说明（如容错设计、跳过条件），可留空',
      reviewHint: '是否与「要点」的时间线段落重复'
    }
  }
}

export const GAMEPLAY_DEFAULTS: ChapterData = {
  core_loop: '',
  control_scheme: '',
  first_30_min: '',
  game_modes: [],
  win_lose_conditions: '',
  tutorial_design: '',
  loop_three_layers: [],
  playthrough_120s: ''
}

export const GAMEPLAY_TEMPLATES: ChapterTemplate[] = [
  {
    name: '仙侠开放世界玩法',
    description: '开放世界 + 修真养成 + 剧情分支的核心循环',
    tags: [
      '仙侠',
      '开放世界',
      '养成'
    ],
    data: {
      core_loop: '探索地图 → 完成剧情/支线 → 获取资源 → 修炼突破 → 解锁新区域 → 循环',
      control_scheme: '键鼠：WASD 移动 + 鼠标视角 + 数字键技能；手柄：左摇杆移动 + 右摇杆视角 + ABXY 技能',
      first_30_min: '1) 开场 CG（5min）2) 角色创建（5min）3) 新手村教学（15min）4) 第一个剧情分支（5min）',
      game_modes: [
        '主线剧情',
        '支线任务',
        '秘境副本',
        'PVP 竞技场',
        '师门系统'
      ],
      win_lose_conditions: '无传统胜负，以剧情结局为目标；PVP 模式以击杀/积分判胜',
      tutorial_design: '情境式教学：融入新手村日常任务，玩家在\'采药→炼丹→御剑\'中自然学习操作'
    }
  },
  {
    name: '竞技场 5v5 玩法',
    description: '5v5 战术竞技场核心循环',
    tags: [
      'PVP',
      '竞技',
      '5v5'
    ],
    data: {
      core_loop: '匹配 → Ban/Pick → 对线 → 团战 → 推塔 → 胜负判定 → 结算 → 循环',
      control_scheme: '鼠标右键移动 + QWER 技能 + D/F 召唤师技能；视角锁定可切换',
      first_30_min: '1) 新手教程（10min）2) 人机对战（15min）3) 解锁排位赛（5min）',
      game_modes: [
        '快速匹配',
        '排位赛',
        '自定义房间',
        '训练模式',
        '观战模式'
      ],
      win_lose_conditions: '摧毁对方核心水晶判胜；投降或时间到按积分判胜',
      tutorial_design: '互动式教学：每个英雄有专属教程关卡，玩家操作中学习技能连招'
    }
  },
  {
    name: '模拟经营玩法',
    description: '店铺经营 + NPC 社交的核心循环',
    tags: [
      '模拟经营',
      '休闲',
      '社交'
    ],
    data: {
      core_loop: '开店营业 → 接待 NPC → 收集故事 → 升级店铺 → 解锁新商品 → 循环',
      control_scheme: '纯点击操作，移动端单手可玩；PC 端支持鼠标拖拽',
      first_30_min: '1) 故事开场（5min）2) 店铺教学（10min）3) 第一位 NPC 故事（10min）4) 解锁第二件商品（5min）',
      game_modes: [
        '经营模式',
        '故事模式',
        '节日活动',
        '好友互访'
      ],
      win_lose_conditions: '无传统胜负，以收集度与故事进度为目标',
      tutorial_design: '引导式教学：NPC 对话中提示操作，玩家自然学习经营机制'
    }
  }
]

export const GAMEPLAY_SCHEMA: ChapterSchema = {
  fields: GAMEPLAY_FIELDS,
  splits: [
  'first_30_min'
],
  splitHints: GAMEPLAY_SPLIT_HINTS,
  defaults: GAMEPLAY_DEFAULTS,
  templates: GAMEPLAY_TEMPLATES
}
