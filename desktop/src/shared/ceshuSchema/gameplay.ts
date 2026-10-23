/**
 * 章节 `gameplay` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件；旧 ceshuFieldHints/ceshuFieldSplits 仅做 re-export 兜底。
 * 改一个字段只碰这一处。
 */
import type { ChapterSchema } from './types'
import type { CeshuFieldDef } from '../ceshuConstants'

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
    aiHint: '3-6 个步骤，按顺序每行一个'
  },
  {
    key: 'core_loop_notes',
    label: '核心循环·补充',
    kind: 'textarea',
    aiHint: '循环之外的补充说明，可留空'
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
    key: 'control_scheme',
    label: '操作方案',
    kind: 'text'
  },
  {
    key: 'win_lose_conditions',
    label: '胜负条件',
    kind: 'textarea'
  },
  {
    key: 'tutorial_design',
    label: '新手引导设计',
    kind: 'textarea'
  },
  {
    key: 'state_machine',
    label: '核心状态机',
    kind: 'pipeList',
    placeholder: '状态|触发事件|结算效果|新状态',
    aiHint: '只描述核心循环涉及的状态与转移；每行一次转移，结算效果写清「什么被重置、什么被保留」；怀疑重复结算的地方写明「每次只结算一次」',
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

export const GAMEPLAY_SCHEMA: ChapterSchema = {
  fields: GAMEPLAY_FIELDS,
  splits: [
  'first_30_min'
],
  splitHints: GAMEPLAY_SPLIT_HINTS
}
