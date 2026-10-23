/**
 * 章节 `meta` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件；旧 ceshuFieldHints/ceshuFieldSplits 仅做 re-export 兜底。
 * 改一个字段只碰这一处。
 */
import type { ChapterSchema } from './types'
import type { CeshuFieldDef } from '../ceshuConstants'

export const META_FIELDS: CeshuFieldDef[] = [
  {
    key: 'game_name',
    label: '游戏名称',
    kind: 'text',
    aiDraftable: false,
    reviewHint: '确认名称是否最终确定'
  },
  {
    key: 'game_type',
    label: '游戏类型',
    kind: 'combo',
    aiDraftable: false,
    values: [
      'RPG',
      'MMORPG',
      'ARPG',
      '战棋',
      'SLG',
      'RTS',
      'MOBA',
      'FPS',
      'TPS',
      '格斗',
      '大逃杀',
      '非对称竞技',
      '卡牌',
      '塔防',
      '模拟经营',
      '开放世界',
      'Roguelike',
      '生存建造',
      '视觉小说',
      '放置',
      '派对',
      '休闲益智'
    ]
  },
  {
    key: 'platform',
    label: '平台',
    kind: 'multiCombo',
    values: [
      'PC',
      '移动端',
      '主机'
    ],
    aiDraftable: false
  },
  {
    key: 'positioning',
    label: '一句话定位',
    kind: 'text',
    placeholder: '一句话描述你的游戏',
    aiHint: '一句话说清「给谁玩、玩什么、和谁不一样」',
    reviewHint: '是否一句话能讲清，且不与竞品同质'
  },
  {
    key: 'tags',
    label: '特色标签',
    kind: 'stringList',
    separator: 'comma',
    placeholder: '用逗号分隔，如: 剧情向,开放世界,多人联机',
    aiHint: '3-5 个具体标签，避免「好玩」「有趣」这类空泛词'
  },
  {
    key: 'status',
    label: '文档状态',
    kind: 'combo',
    aiDraftable: false,
    values: [
      'draft',
      'in_progress',
      'review',
      'final'
    ],
    optionLabels: {
      draft: '草稿',
      in_progress: '进行中',
      review: '评审中',
      final: '定稿'
    }
  },
  {
    key: 'confidentiality',
    label: '保密级别',
    kind: 'combo',
    aiDraftable: false,
    values: [
      'internal',
      'confidential',
      'strictly_confidential',
      'public'
    ],
    optionLabels: {
      internal: '内部',
      confidential: '保密',
      strictly_confidential: '严格保密',
      public: '公开'
    }
  },
  {
    key: 'gdd_scope',
    label: '策划档位',
    kind: 'combo',
    aiDraftable: false,
    values: [
      'lite',
      'full'
    ],
    optionLabels: {
      lite: '标准版（文档信息 + 9 章）',
      full: '专业版（文档信息 + 16 章）'
    }
  },
  {
    key: 'version',
    label: '版本号',
    kind: 'text',
    aiDraftable: false,
    reviewHint: '与 version_label 区分：这是数据结构版本'
  },
  {
    key: 'date',
    label: '日期',
    kind: 'text',
    aiDraftable: false
  }
]

export const META_SCHEMA: ChapterSchema = {
  fields: META_FIELDS,
  splits: [],
  splitHints: undefined
}
