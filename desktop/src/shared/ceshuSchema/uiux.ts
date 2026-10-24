/**
 * 章节 `uiux` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshuConstants'

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

export const UIUX_TEMPLATES: ChapterTemplate[] = []

export const UIUX_SCHEMA: ChapterSchema = {
  fields: UIUX_FIELDS,
  splits: [],
  splitHints: undefined,
  defaults: UIUX_DEFAULTS,
  templates: UIUX_TEMPLATES
}
