/**
 * 章节 `meta` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../ceshuTemplates'
import type { ChapterSchema } from './types'
import type { CeshuFieldDef, ChapterData } from '../ceshuConstants'

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
    ],
    reviewHint: '类型是否与核心玩法一致（不是题材分类）；是否与平台、目标用户对得上'
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
    aiDraftable: false,
    reviewHint: '是否与团队实际能力、操作方案一致；多平台是否真的都能兼顾'
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
    aiHint: '3-5 个具体标签，避免「好玩」「有趣」这类空泛词',
    reviewHint: '标签是否具体到能用于商店分类与搜索；是否与玩法/题材一致；有无互相重复的同义标签'
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
    },
    reviewHint: '状态是否与实际进度相符（评审中却还有大量空缺就该退回草稿）'
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
    },
    reviewHint: '是否与分享对象匹配（对外演示用公开/内部，涉未公开玩法用保密）'
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
    },
    reviewHint: '档位是否与项目阶段匹配（立项期用标准版，进入研发再切专业版）'
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
    aiDraftable: false,
    reviewHint: '是否为最近一次实质修改的日期（对外发出前记得更新）'
  }
]

export const META_DEFAULTS: ChapterData = {
  game_name: '',
  game_type: '',
  platform: [],
  positioning: '',
  tags: [],
  version: '0.1.0',
  date: '2026-10-24',
  confidentiality: 'internal',
  status: 'draft'
}

export const META_TEMPLATES: ChapterTemplate[] = [
  {
    name: '仙侠 RPG 项目样板',
    description: '国产仙侠题材 RPG 项目元信息，含 PC + 移动双平台定位',
    tags: [
      '仙侠',
      'RPG',
      '国产',
      '双平台'
    ],
    data: {
      game_name: '云海仙踪',
      game_type: 'RPG',
      platform: [
        'PC',
        '移动端'
      ],
      positioning: '3D 仙侠开放世界 RPG，重剧情 + 轻社交',
      tags: [
        '仙侠',
        '开放世界',
        '剧情向',
        '国产'
      ],
      status: 'draft',
      confidentiality: 'internal'
    }
  },
  {
    name: '科幻射击样板',
    description: '近未来科幻 TPS 射击游戏项目元信息',
    tags: [
      '科幻',
      'TPS',
      'PC'
    ],
    data: {
      game_name: '裂隙边境',
      game_type: 'TPS',
      platform: [
        'PC',
        '主机'
      ],
      positioning: '近未来科幻 TPS，强调战术配合与可破坏场景',
      tags: [
        '科幻',
        '射击',
        'PVP',
        '战术'
      ],
      status: 'draft',
      confidentiality: 'confidential'
    }
  },
  {
    name: '休闲放置样板',
    description: '放置挂机类休闲游戏，移动端为主',
    tags: [
      '休闲',
      '放置',
      '移动端'
    ],
    data: {
      game_name: '晨光小镇',
      game_type: '放置',
      platform: [
        '移动端'
      ],
      positioning: '治愈系放置经营，主打碎片化时间 + 收集养成',
      tags: [
        '休闲',
        '放置',
        '治愈',
        '收集'
      ],
      status: 'draft',
      confidentiality: 'internal'
    }
  }
]

export const META_SCHEMA: ChapterSchema = {
  fields: META_FIELDS,
  splits: [],
  splitHints: undefined,
  defaults: META_DEFAULTS,
  templates: META_TEMPLATES
}
