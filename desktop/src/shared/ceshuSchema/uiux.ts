/**
 * 章节 `uiux` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshu/ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshu/ceshuConstants'

export const UIUX_FIELDS: CeshuFieldDef[] = [
  {
    key: 'design_principles',
    label: '设计原则',
    kind: 'textarea',
    aiHint: '一段概述：UI/UX 设计的总体原则与取向；逐条原则及界面体现走「要点」字段，本体勿罗列',
    reviewHint: '本体是否只讲总体取向；要点是否逐条可核对；是否与流程、界面说明矛盾'
  },
  {
    key: 'design_principles_points',
    label: '设计原则·要点',
    kind: 'stringList',
    aiHint: '3-5 条原则，每条一句：原则 + 在界面上的具体体现',
    reviewHint: '每条是否「原则+体现」两要素齐全；体现是否可核对；与本体是否重复'
  },
  {
    key: 'design_principles_notes',
    label: '设计原则·补充',
    kind: 'textarea',
    aiHint: '原则之外的补充说明（如参考依据、取舍记录），可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  {
    key: 'information_architecture',
    label: '信息架构',
    kind: 'textarea',
    aiHint: '界面层级与导航结构：有哪些界面、从属关系、主导航形态与各入口规则',
    reviewHint: '层级是否成树；导航形态是否明确；入口是否与核心流程对得上'
  },
  {
    key: 'core_flows',
    label: '核心界面流程',
    kind: 'pipeList',
    columns: [
      {
        key: 'name',
        label: '流程名称'
      },
      {
        key: 'steps',
        label: '步骤'
      },
      {
        key: 'exit',
        label: '出口'
      }
    ],
    aiHint: '每行一个核心流程：流程名称|步骤|出口；步骤按先后写，出口写清返回或跳转目标',
    reviewHint: '步骤是否有先后顺序；出口是否明确；流程是否与信息架构所列界面一一对应'
  },
  {
    key: 'key_screens',
    label: '关键界面说明',
    kind: 'stringList',
    aiHint: '每行一个关键界面：名称+核心元素+交互方式；元素写界面里实际存在的东西',
    reviewHint: '每行是否三要素齐全；元素是否具体；是否与信息架构所列界面一致'
  },
  {
    key: 'feedback_rules',
    label: '交互反馈规范',
    kind: 'pipeList',
    columns: [
      {
        key: 'trigger',
        label: '触发操作'
      },
      {
        key: 'feedback',
        label: '反馈形式'
      },
      {
        key: 'timing',
        label: '时机'
      }
    ],
    aiHint: '每行一条反馈规则：触发操作|反馈形式|时机；须覆盖点击、加载、错误、奖励场景',
    reviewHint: '每条是否操作与反馈对应；是否覆盖错误与加载场景；时机是否可感知'
  },
  {
    key: 'usability_standards',
    label: '可用性标准',
    kind: 'stringList',
    aiHint: '每行一条可量化验收线（如「任意功能 ≤3 步到达」）；必须带数字或明确判定条件',
    reviewHint: '每条是否可量化；是否覆盖核心流程；步数上限与流程步骤数是否自洽'
  }
]

export const UIUX_DEFAULTS: ChapterData = {
  design_principles: '',
  design_principles_points: [],
  design_principles_notes: '',
  information_architecture: '',
  core_flows: [],
  key_screens: [],
  feedback_rules: [],
  usability_standards: []
}

/**
 * 内置模板（2026-10-26 补 P2 章节的「填满样例」）：
 * 空模板对「信息架构」「交互反馈」这类字段等于让人对着空框想象，
 * 这里给两份可直接改的真实样例（数字与判定线都写实）。
 */
export const UIUX_TEMPLATES: ChapterTemplate[] = [
  {
    name: '移动端界面体系（交互范式示例）',
    description: '一块主屏 + 三级下钻的信息架构范式，强调「等待时间可见」；示例名词可按品类替换（主城→核心基地、大地图→主场景、联盟→社交系统）',
    tags: ['界面体系', '信息架构', '示例'],
    data: {
      design_principles: '一块主屏 + 三级下钻；任何需要等待的操作都必须显示剩余时间与加速花费。',
      design_principles_points: [
        '一眼可读：主界面常驻 4 个关键数字（资源、队列、战力、社交状态）',
        '等待可见：任何 ≥30 秒的操作都显示倒计时与加速价格',
        '点击可逆：破坏性操作二次确认，其余操作一步返回',
        '信息不重叠：同一数字只在一处显示，跨界面只引用不复制'
      ],
      design_principles_notes: '参考范式：同类产品的「基地 / 主场景分屏 + 等待可见」交互；本模板为交互范式示范，不代表具体品类，落地时请按实际游戏替换名词（示例假设基地与主场景分屏，实际是否同屏按品类定）。',
      information_architecture:
        '核心基地（建筑/队列）→ 主场景（区域/行进）→ 社交（成员/集结）三级下钻；底部 4 个常驻入口；设置与背包从右上角头像进入。（示例名词，按实际品类替换）',
      core_flows: [
        {
          name: '升级设施',
          steps: '核心基地 → 点建筑 → 看耗时与花费 → 确认',
          exit: '回基地，队列条显示倒计时'
        },
        {
          name: '发起行动',
          steps: '主场景 → 选目标 → 选队伍 → 看行进时间与预估战损 → 确认',
          exit: '回主场景，行进线动画 + 队伍面板倒计时'
        },
        {
          name: '组队集结',
          steps: '社交 → 集结列表 → 加入 → 等发起人开战',
          exit: '战斗结算页 → 返回社交'
        }
      ],
      key_screens: [
        '核心基地：4 座核心建筑 + 1 条队列条 + 资源栏 4 项',
        '主场景：区域色块 + 迷雾遮罩 + 单位图标，缩放 3 档',
        '战报页：双方兵力 / 战损 / 克制加成，可分享到社交频道'
      ],
      feedback_rules: [
        { trigger: '点击升级', feedback: '按钮变倒计时条 + 队列占用提示', timing: '立即' },
        { trigger: '资源不足', feedback: '缺口数字标红 + 跳转获取途径', timing: '点击时' },
        { trigger: '行进到达', feedback: '推送 + 主场景对应格闪烁', timing: '到达瞬间' }
      ],
      usability_standards: [
        '核心操作（升级/行动/集结）≤3 步完成',
        '主界面 4 个关键数字首屏可见，无需滚动',
        '所有 ≥30 秒的等待都有可见倒计时',
        '破坏性操作 100% 有二次确认'
      ]
    }
  },
  {
    name: '移动端 SLG 界面体系',
    description: '城建 + 大地图 + 联盟三屏结构，强调「等待时间可见」，适合 SLG / 模拟经营',
    tags: ['SLG', '移动端', '界面体系', '信息架构'],
    data: {
      design_principles: '一块主屏 + 三级下钻；任何需要等待的操作都必须显示剩余时间与加速花费。',
      design_principles_points: [
        '一眼可读：主界面常驻 4 个数字（资源、队列、部队、联盟状态）',
        '等待可见：任何 ≥30 秒的操作都显示倒计时与加速价格',
        '点击可逆：破坏性操作二次确认，其余操作一步返回',
        '信息不重叠：同一数字只在一处显示，跨界面只引用不复制'
      ],
      design_principles_notes: '参考依据：同类 SLG 的建造队列与大地图双屏切换；本作不做主城与大地图同屏。',
      information_architecture:
        '主城（建筑/队列）→ 大地图（州郡/行军）→ 联盟（成员/集结）三级下钻；底部 4 个常驻入口：主城、大地图、联盟、邮件；设置与背包从右上角头像进入。',
      core_flows: [
        {
          name: '升级建筑',
          steps: '主城 → 点建筑 → 看耗时与花费 → 确认',
          exit: '回主城，队列条显示倒计时'
        },
        {
          name: '发起出征',
          steps: '大地图 → 选目标格 → 选部队 → 看行军时间与预估战损 → 确认',
          exit: '回大地图，行军线动画 + 部队面板倒计时'
        },
        {
          name: '联盟集结',
          steps: '联盟 → 集结列表 → 加入 → 等发起人开战',
          exit: '战斗结算页 → 返回联盟'
        }
      ],
      key_screens: [
        '主城：4 座核心建筑 + 1 条队列条 + 资源栏 4 项',
        '大地图：州郡色块 + 迷雾遮罩 + 部队图标，缩放 3 档',
        '战报页：双方兵力 / 战损 / 克制加成，可分享到联盟频道'
      ],
      feedback_rules: [
        { trigger: '点击升级', feedback: '按钮变倒计时条 + 队列占用提示', timing: '立即' },
        { trigger: '资源不足', feedback: '缺口数字标红 + 跳转获取途径', timing: '点击时' },
        { trigger: '行军到达', feedback: '推送 + 大地图对应格闪烁', timing: '到达瞬间' }
      ],
      usability_standards: [
        '核心操作（升级/出征/集结）≤3 步完成',
        '主界面 4 个关键数字首屏可见，无需滚动',
        '所有 ≥30 秒的等待都有可见倒计时',
        '破坏性操作 100% 有二次确认'
      ]
    }
  },
  {
    name: 'Roguelike 单局界面',
    description: '单局一屏到底，战斗 / 奖励 / 地图三级循环，适合卡牌 Roguelike 与回合制',
    tags: ['Roguelike', '卡牌', '单局循环', '战斗界面'],
    data: {
      design_principles: '单局一屏到底：状态、手牌、敌人都同屏，切屏即中断心流。',
      design_principles_points: [
        '一屏原则：战斗界面不切屏，所需信息全部同屏',
        '数字优先：血量、费用、层数用大字号，描述性文字次要',
        '一次点击：出牌与结束回合都是单次点击，不依赖长按或拖拽',
        '死亡可读：结算页给出死亡原因与至少一条可改进项'
      ],
      design_principles_notes: '拖拽出牌作为可选增强保留，但不得成为唯一操作方式（触屏误触率高）。',
      information_architecture:
        '战斗屏 → 奖励屏（三选一）→ 地图屏（选下一节点）三级循环；牌库 / 遗物 / 状态从战斗屏底部抽屉查看，不离开当前局。',
      core_flows: [
        {
          name: '单回合战斗',
          steps: '抽牌 → 出牌（消耗费用）→ 结束回合 → 敌人行动',
          exit: '敌人全灭进奖励屏；玩家死亡进结算页'
        },
        {
          name: '战后选牌',
          steps: '奖励屏 → 三选一 → 确认',
          exit: '回地图屏选下一节点'
        },
        {
          name: '查看牌库',
          steps: '战斗屏底部抽屉 → 牌库 / 遗物 / 状态',
          exit: '关闭抽屉回到战斗'
        }
      ],
      key_screens: [
        '战斗屏：手牌 5 张 + 费用球 + 敌人血条 + 意图图标',
        '地图屏：节点分叉图（战斗/精英/商店/休息）+ 已走路径',
        '结算页：死亡回合 + 主要原因（伤害溢出/费用不足）+ 立即重开'
      ],
      feedback_rules: [
        { trigger: '出牌', feedback: '卡牌飞向目标 + 伤害数字上浮', timing: '≤100ms' },
        { trigger: '费用不足', feedback: '卡牌抖动 + 费用球闪红', timing: '点击时' },
        { trigger: '敌人意图变化', feedback: '意图图标切换，长按显示具体数值', timing: '敌人回合结束后' }
      ],
      usability_standards: [
        '出牌到结算 ≤2 次点击',
        '敌人意图在玩家行动前 100% 可见',
        '任意界面返回上一层 ≤1 步',
        '结算页至少给出 1 条可改进项'
      ]
    }
  }
]

export const UIUX_SCHEMA: ChapterSchema = {
  fields: UIUX_FIELDS,
  splits: [],
  splitHints: undefined,
  defaults: UIUX_DEFAULTS,
  templates: UIUX_TEMPLATES
}
