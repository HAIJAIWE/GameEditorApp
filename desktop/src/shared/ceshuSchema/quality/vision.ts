/**
 * 章节 `vision` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件（字段 / 契约 / 拆分 / 默认 / 模板），改一个字段只碰这一处。
 */
import type { ChapterTemplate } from '../../ceshu/reference'
import type { ChapterSchema } from '../core'
import type { CeshuFieldDef, ChapterData } from '../../ceshu/reference'

export const VISION_FIELDS: CeshuFieldDef[] = [
  {
    key: 'design_vision',
    label: '设计愿景',
    kind: 'textarea',
    placeholder: '阐述设计理念和愿景',
    aiHint: '先一句愿景（要做成什么样的游戏），再给三条支撑理由；不要写与竞品的对比',
    reviewHint: '是否具体、可判断，而不是口号；与「差异化优势」不重复'
  },
  {
    key: 'user_personas.primary',
    label: '主要用户',
    kind: 'textarea',
    aiHint: '年龄 / 使用场景 / 核心痛点，各一句',
    reviewHint: '痛点是否具体到场景（不是「想放松」）；是否与游戏类型、平台对得上；能否据此判断一个功能要不要做'
  },
  {
    key: 'user_personas.secondary',
    label: '次要用户',
    kind: 'textarea',
    aiHint: '与主要用户的具体差异，不要复述',
    reviewHint: '差异是否具体（不是「也有年轻人」）；是否说明为何值得一并服务；是否与主要用户画像重叠'
  },
  {
    key: 'differentiation',
    label: '差异化优势',
    kind: 'textarea',
    aiHint: '与 2-3 个竞品的具体差异，给出可验证的例子；不要复述设计愿景',
    reviewHint: '是否说得出「玩家凭什么选你」；与「设计愿景」不重复'
  },
  {
    key: 'business_model',
    label: '商业模式',
    kind: 'textarea',
    aiDraftable: false,
    reviewHint: '是商业决策而非玩法描述：谁付钱、为什么付、与付费模式章是否一致'
  },
  {
    key: 'competitive_analysis',
    label: '竞品对比要点',
    kind: 'stringList',
    aiHint: '3-5 条竞品对比结论，每条一句话点出「与谁比、差在哪或强在哪」；完整竞品清单（名称/类型/数据/差异）在第十一章，此处只写对比要点',
    reviewHint: '是否点明对比对象与具体维度（不是「玩法更丰富」这类空话）；是否与第十一章竞品表自洽；是否落到可执行的差异方向'
  },
  {
    key: 'design_pillars',
    label: '设计支柱',
    kind: 'pipeList',
    columns: [
      { key: 'pillar', label: '支柱' },
      { key: 'ruling', label: '裁决' },
      { key: 'anti', label: '反例（明确不做）' }
    ],
    placeholder: '支柱|裁决|反例（明确不做）',
    aiHint: '每条支柱给「裁决」（坚持什么，最好有数字或规则支撑）+「反例」（因此明确不做什么功能）；3-4 条，反例必须是具体功能而不是态度',
    reviewHint: '支柱是否可判断（有数字/规则支撑）；反例是否真实砍掉了功能，而非正确的废话'
  },
  {
    key: 'design_assumptions',
    label: '关键假设',
    kind: 'pipeList',
    placeholder: '假设|影响|验证方法与调参阈值',
    aiHint: '登记「没验证过的设计判断」：影响程度、怎么验证、验证不通过时调什么参数（如「首转生集中在 40+ 层则下调微光步长」）；没有不确定的判断就留空',
    reviewHint: '假设是否可被证伪；验证方法是否能在 Demo/试玩里执行；调参阈值是否具体'
  }
]

export const VISION_DEFAULTS: ChapterData = {
  design_vision: '',
  user_personas: {
    primary: '',
    secondary: ''
  },
  competitive_analysis: [],
  differentiation: '',
  business_model: ''
}

export const VISION_TEMPLATES: ChapterTemplate[] = [
  {
    name: '仙侠沉浸式愿景',
    description: '强调东方美学与剧情沉浸的设计愿景',
    tags: [
      '仙侠',
      '剧情',
      '美学'
    ],
    data: {
      design_vision: '以东方仙侠美学为核心，构建一个有温度、有诗意的修真世界。玩家在云海、剑阁、幽谷间体验修仙者的修行、情劫与抉择，用现代游戏语言重新讲述中国古典文化中的\'道\'与\'人\'。',
      user_personas: {
        primary: '25-35 岁，偏好剧情向 RPG 的国产单机/MMO 玩家，对仙侠文化有认同感',
        secondary: '18-24 岁，受动漫/网文影响接触仙侠题材的年轻玩家',
        potential: '海外对中国文化感兴趣的玩家（需本地化适配）'
      },
      differentiation: '1) 独创\'剑心\'系统：玩家抉择影响剑道走向\n2) 国风美术：实机渲染 + 水墨滤镜\n3) 剧情分支：双主角多结局，重玩价值高',
      business_model: 'F2P + 外观付费 + 季票，避免 P2W'
    }
  },
  {
    name: '竞技 PVP 愿景',
    description: '公平竞技为核心的产品愿景',
    tags: [
      'PVP',
      '竞技',
      '公平'
    ],
    data: {
      design_vision: '打造 5v5 战术竞技场，强调团队配合与战术深度。通过严格的平衡性设计与反外挂机制，提供公平、深度的竞技体验。',
      user_personas: {
        primary: '20-30 岁竞技游戏爱好者，追求操作与策略深度',
        secondary: '电竞观众转化玩家',
        potential: '职业电竞选手与战队'
      },
      differentiation: '1) 全英雄免费，仅外观付费\n2) Ban/Pick 阶段加入地形可变机制\n3) 赛季制排名 + 俱乐部联赛',
      business_model: 'F2P + 战令 + 外观 + 赛事赞助'
    }
  },
  {
    name: '休闲治愈愿景',
    description: '面向女性向与轻度玩家的治愈系愿景',
    tags: [
      '休闲',
      '治愈',
      '女性向'
    ],
    data: {
      design_vision: '用柔和色彩与治愈音效，营造一个可以慢下来的小镇世界。玩家经营店铺、结交 NPC、收集故事，体验\'慢生活\'的温度。',
      user_personas: {
        primary: '20-35 岁女性玩家，偏好模拟经营与社交',
        secondary: '学生党，碎片化时间游玩',
        potential: '海外治愈系游戏爱好者'
      },
      differentiation: '1) 真实季节系统，节日活动持续全年\n2) NPC 自主生活 AI，每天有不同故事\n3) 跨平台同步，手机/PC 进度互通',
      business_model: 'F2P + 月卡 + 限定外观 + DLC'
    }
  }
]

export const VISION_SCHEMA: ChapterSchema = {
  fields: VISION_FIELDS,
  splits: [],
  splitHints: undefined,
  defaults: VISION_DEFAULTS,
  templates: VISION_TEMPLATES
}
