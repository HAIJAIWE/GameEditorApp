/**
 * 章节 `meta` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../../ceshu/reference'
import type { ChapterSchema } from '../core'
import type { CeshuFieldDef, ChapterData } from '../../ceshu/reference'
import { GDD_SCOPE_LABELS } from '../../ceshu/reference'

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
  /*
   * 2026-10-27 交接包品类适配补的字段：`game_type` 是单选，装不下「SLG + 卡牌 + Roguelike」
   * 这类**组合玩法**。加一个多选标签，交接包按它做**品类并集**（多出对应系统的设计文档），
   * AI 审阅也按它下发多套追问 —— 否则组合品类只能落进单一档案，生成出来的规格会漏系统。
   */
  {
    key: 'game_type_tags',
    label: '玩法标签（可多选）',
    kind: 'multiCombo',
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
    aiDraftable: false,
    reviewHint: '是否只重复了「游戏类型」；组合玩法（如 SLG+卡牌）是否真的都实现了，还是只做了主类型'
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
    key: 'non_goals',
    label: '范围与非目标',
    kind: 'stringList',
    placeholder: '每行一条「明确不做」',
    aiHint: '3-5 条明确不做的功能/范围，每条说清「不做什么」，必要时补一句「要做到什么程度才算够」；禁止写成「暂不做」这类没有边界的表述',
    reviewHint: '是否与设计支柱的反例一致；是否真的砍掉了功能边界；有无「什么都做」式的伪非目标'
  },
  /*
   * 方案取舍（Alternatives considered）。
   *
   * 为什么放在文档信息而不是某章：关键决策（引擎、付费、核心循环、联机形态）跨章，
   * 挂到任何单章都会让别的章「看不到自己那条」。Google 设计文档范式把它列为独立一节，
   * 交接包把它挂在「范围与平台」——实现方开工前先知道**哪些路已经被否了**，
   * 否则最容易「好心」把被放弃的方案换回来。
   */
  {
    key: 'alternatives',
    label: '方案取舍',
    kind: 'pipeList',
    columns: [
      { key: 'decision', label: '决策' },
      { key: 'option', label: '候选方案' },
      { key: 'rejected', label: '为什么不选' },
      { key: 'chosen', label: '结论' }
    ],
    placeholder: '每行一条：决策|候选方案|为什么不选|结论',
    aiHint:
      '3-6 条关键决策的取舍：写清「考虑过什么、为什么不选、最后选了什么」。只写「经过考虑」不算，必须给出被放弃方案的具体代价（成本/风险/上限）',
    reviewHint:
      '是否覆盖了会引发返工的决策（引擎、付费模式、核心循环、联机形态）；每条是否真的给了放弃理由，而不是复述结论'
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
      lite: GDD_SCOPE_LABELS.lite,
      full: GDD_SCOPE_LABELS.full
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
  game_type_tags: [],
  platform: [],
  positioning: '',
  tags: [],
  non_goals: [],
  alternatives: [],
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
