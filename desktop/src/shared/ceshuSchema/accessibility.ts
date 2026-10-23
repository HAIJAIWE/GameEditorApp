/**
 * 章节 `accessibility` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件；旧 ceshuFieldHints/ceshuFieldSplits 仅做 re-export 兜底。
 * 改一个字段只碰这一处。
 */
import type { ChapterSchema } from './types'
import type { CeshuFieldDef } from '../ceshuConstants'

export const ACCESSIBILITY_FIELDS: CeshuFieldDef[] = [
  {
    key: 'language_list',
    label: '支持语言',
    kind: 'stringList',
    placeholder: '每行一个，如: 简体中文、English',
    aiHint: '每行一个支持语言，标注首发还是后续版本，并注明对应目标市场',
    reviewHint: '是否区分首发与后续；语言是否与目标市场匹配'
  },
  {
    key: 'localization_strategy',
    label: '本地化策略',
    kind: 'textarea',
    aiHint: '一段概述：本地化的总体策略与流程框架；文本抽取、翻译、QA 等各环节细节走「要点」字段',
    reviewHint: '是否覆盖更新与回归流程；是否含字体排版适配'
  },
  {
    key: 'cultural_adaptation',
    label: '文化适配',
    kind: 'textarea',
    aiHint: '一段概述：文化适配的原则与重点市场；各目标市场的适配项走「要点」字段',
    reviewHint: '是否逐市场列适配项；是否含法规红线；有无凭空臆测'
  },
  {
    key: 'accessibility_features',
    label: '无障碍特性',
    kind: 'stringList',
    placeholder: '每行一个，如: 色盲模式、字幕',
    aiHint: '每行一个无障碍特性，注明对应的功能入口；只列本项目会做的项',
    reviewHint: '每条是否可落地为功能；是否与字号/色盲等专项重复'
  },
  {
    key: 'subtitle_design',
    label: '字幕设计',
    kind: 'textarea',
    aiHint: '一段概述：字幕设计的总体规范；字号、描边、安全区、说话人标识等细节走「要点」字段',
    reviewHint: '是否含字号与安全区规范；是否标识说话人；是否覆盖音效提示'
  },
  {
    key: 'color_blind_support',
    label: '色盲支持',
    kind: 'textarea',
    aiHint: '一段概述：色盲支持的设计原则；模式类型、覆盖场景与替代信息传达走「要点」字段',
    reviewHint: '是否覆盖全部 UI 场景；关键信息是否有非颜色通道；模式是否可选'
  },
  {
    key: 'motor_accessibility',
    label: '运动无障碍',
    kind: 'textarea',
    aiHint: '一段概述：操作无障碍的目标与原则；按键自定义、简化选项等细节走「要点」字段',
    reviewHint: '是否支持按键自定义；是否有简化操作选项；是否覆盖手柄'
  },
  {
    key: 'cognitive_accessibility',
    label: '认知无障碍',
    kind: 'textarea',
    aiHint: '一段概述：认知无障碍的设计原则；难度、提示、节奏与防眩晕细节走「要点」字段',
    reviewHint: '难度是否可调；提示是否可关闭；是否含防眩晕'
  },
  {
    key: 'rating_certification',
    label: '分级认证',
    kind: 'stringList',
    placeholder: '每行一个，如 ESRB/PEGI',
    aiHint: '每行一个目标分级机构与目标等级，如 ESRB/PEGI；注明送审时间',
    reviewHint: '机构是否覆盖目标市场；目标等级是否匹配内容；是否注明送审时间'
  },
  {
    key: 'compliance_notes',
    label: '合规备注',
    kind: 'textarea',
    aiHint: '列出各市场合规要求：付费披露、概率公示、儿童保护与数据合规',
    reviewHint: '是否覆盖概率公示与儿童保护；是否逐市场列出；有无引用过期法规'
  }
]

export const ACCESSIBILITY_SPLIT_HINTS: ChapterSchema['splitHints'] = {
  localization_strategy: {
    points: {
      aiHint: '3-6 条：文本抽取、翻译流程、QA 回归、更新机制与字体排版适配',
      reviewHint: '是否覆盖抽取到更新全流程；每条是否可落地为环节；是否含字体排版'
    },
    notes: {
      aiHint: '本地化供应商选型与术语库管理等要点之外的补充说明，可留空',
      reviewHint: '补充是否与要点重复；是否提及术语管理'
    }
  },
  cultural_adaptation: {
    points: {
      aiHint: '3-6 条：逐市场列适配项——敏感元素、节日、审美偏好与法规红线',
      reviewHint: '是否逐市场列出；是否含法规红线；有无凭空臆测'
    },
    notes: {
      aiHint: '文化风险案例与审查机制等要点之外的补充说明，可留空',
      reviewHint: '是否给出具体市场；有无凭空臆测'
    }
  },
  subtitle_design: {
    points: {
      aiHint: '3-6 条：字号、描边、安全区、语速、说话人标识与关键音效提示',
      reviewHint: '是否给出具体数值规范而非「清晰易读」；是否标识说话人；是否覆盖音效提示'
    },
    notes: {
      aiHint: '字幕字体选型与多行换行规则等要点之外的补充说明，可留空',
      reviewHint: '补充是否可执行；是否与要点重复'
    }
  },
  color_blind_support: {
    points: {
      aiHint: '3-6 条：色盲模式类型、覆盖的 UI 场景与替代信息传达方式',
      reviewHint: '是否给出具体模式而非只说「支持」；关键信息是否有非颜色通道；模式是否可选'
    },
    notes: {
      aiHint: '色盲模拟测试与验证方式等要点之外的补充说明，可留空',
      reviewHint: '是否说明验证方式；是否覆盖全部场景'
    }
  },
  motor_accessibility: {
    points: {
      aiHint: '3-6 条：按键自定义、辅助瞄准、连发、操作简化选项与手柄支持',
      reviewHint: '是否支持按键自定义；是否有简化操作选项；是否覆盖手柄；每条是否可落地'
    },
    notes: {
      aiHint: '输入设备适配与摇杆灵敏度等要点之外的补充说明，可留空',
      reviewHint: '补充是否具体；是否与要点重复'
    }
  },
  cognitive_accessibility: {
    points: {
      aiHint: '3-6 条：难度选项、提示系统、节奏控制与防眩晕设计',
      reviewHint: '难度是否可调；提示是否可关闭；是否含防眩晕；是否给出具体选项'
    },
    notes: {
      aiHint: '阅读障碍友好与教程重放等要点之外的补充说明，可留空',
      reviewHint: '补充是否可落地；是否与要点重复'
    }
  }
}

export const ACCESSIBILITY_SCHEMA: ChapterSchema = {
  fields: ACCESSIBILITY_FIELDS,
  splits: [
  'localization_strategy',
  'cultural_adaptation',
  'subtitle_design',
  'color_blind_support',
  'motor_accessibility',
  'cognitive_accessibility'
],
  splitHints: ACCESSIBILITY_SPLIT_HINTS
}
