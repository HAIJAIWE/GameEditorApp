import type { ChapterFieldHints } from './types'

/**
 * 第十六章·可访问性与本地化的字段契约（P0 补契约，2026-10-23；P1 三件套拆分，2026-10-23）。
 *
 * 本章要点：AI 起草可访问性易堆名词不落地，
 * 契约要求每项特性对应具体功能与验收标准；分级认证只认官方机构，防止臆造标准。
 *
 * P1 拆分（三件套）：localization_strategy / cultural_adaptation / subtitle_design /
 * color_blind_support / motor_accessibility / cognitive_accessibility 六个本体保留概述，
 * 逐条可核对的细节归 `xxx_points`，其余说明归 `xxx_notes`。
 * 注：compliance_notes 的 key 以 `_notes` 结尾属拆分产物，守卫禁拆，维持 P0 契约不动。
 */
export const ACCESSIBILITY_FIELD_HINTS: ChapterFieldHints = {
  language_list: {
    aiHint: '每行一个支持语言，标注首发还是后续版本，并注明对应目标市场',
    reviewHint: '是否区分首发与后续；语言是否与目标市场匹配'
  },
  localization_strategy: {
    aiHint: '一段概述：本地化的总体策略与流程框架；文本抽取、翻译、QA 等各环节细节走「要点」字段',
    reviewHint: '是否覆盖更新与回归流程；是否含字体排版适配'
  },
  localization_strategy_points: {
    aiHint: '3-6 条：文本抽取、翻译流程、QA 回归、更新机制与字体排版适配',
    reviewHint: '是否覆盖抽取到更新全流程；每条是否可落地为环节；是否含字体排版'
  },
  localization_strategy_notes: {
    aiHint: '本地化供应商选型与术语库管理等要点之外的补充说明，可留空',
    reviewHint: '补充是否与要点重复；是否提及术语管理'
  },
  cultural_adaptation: {
    aiHint: '一段概述：文化适配的原则与重点市场；各目标市场的适配项走「要点」字段',
    reviewHint: '是否逐市场列适配项；是否含法规红线；有无凭空臆测'
  },
  cultural_adaptation_points: {
    aiHint: '3-6 条：逐市场列适配项——敏感元素、节日、审美偏好与法规红线',
    reviewHint: '是否逐市场列出；是否含法规红线；有无凭空臆测'
  },
  cultural_adaptation_notes: {
    aiHint: '文化风险案例与审查机制等要点之外的补充说明，可留空',
    reviewHint: '是否给出具体市场；有无凭空臆测'
  },
  accessibility_features: {
    aiHint: '每行一个无障碍特性，注明对应的功能入口；只列本项目会做的项',
    reviewHint: '每条是否可落地为功能；是否与字号/色盲等专项重复'
  },
  subtitle_design: {
    aiHint: '一段概述：字幕设计的总体规范；字号、描边、安全区、说话人标识等细节走「要点」字段',
    reviewHint: '是否含字号与安全区规范；是否标识说话人；是否覆盖音效提示'
  },
  subtitle_design_points: {
    aiHint: '3-6 条：字号、描边、安全区、语速、说话人标识与关键音效提示',
    reviewHint: '是否给出具体数值规范而非「清晰易读」；是否标识说话人；是否覆盖音效提示'
  },
  subtitle_design_notes: {
    aiHint: '字幕字体选型与多行换行规则等要点之外的补充说明，可留空',
    reviewHint: '补充是否可执行；是否与要点重复'
  },
  color_blind_support: {
    aiHint: '一段概述：色盲支持的设计原则；模式类型、覆盖场景与替代信息传达走「要点」字段',
    reviewHint: '是否覆盖全部 UI 场景；关键信息是否有非颜色通道；模式是否可选'
  },
  color_blind_support_points: {
    aiHint: '3-6 条：色盲模式类型、覆盖的 UI 场景与替代信息传达方式',
    reviewHint: '是否给出具体模式而非只说「支持」；关键信息是否有非颜色通道；模式是否可选'
  },
  color_blind_support_notes: {
    aiHint: '色盲模拟测试与验证方式等要点之外的补充说明，可留空',
    reviewHint: '是否说明验证方式；是否覆盖全部场景'
  },
  motor_accessibility: {
    aiHint: '一段概述：操作无障碍的目标与原则；按键自定义、简化选项等细节走「要点」字段',
    reviewHint: '是否支持按键自定义；是否有简化操作选项；是否覆盖手柄'
  },
  motor_accessibility_points: {
    aiHint: '3-6 条：按键自定义、辅助瞄准、连发、操作简化选项与手柄支持',
    reviewHint: '是否支持按键自定义；是否有简化操作选项；是否覆盖手柄；每条是否可落地'
  },
  motor_accessibility_notes: {
    aiHint: '输入设备适配与摇杆灵敏度等要点之外的补充说明，可留空',
    reviewHint: '补充是否具体；是否与要点重复'
  },
  cognitive_accessibility: {
    aiHint: '一段概述：认知无障碍的设计原则；难度、提示、节奏与防眩晕细节走「要点」字段',
    reviewHint: '难度是否可调；提示是否可关闭；是否含防眩晕'
  },
  cognitive_accessibility_points: {
    aiHint: '3-6 条：难度选项、提示系统、节奏控制与防眩晕设计',
    reviewHint: '难度是否可调；提示是否可关闭；是否含防眩晕；是否给出具体选项'
  },
  cognitive_accessibility_notes: {
    aiHint: '阅读障碍友好与教程重放等要点之外的补充说明，可留空',
    reviewHint: '补充是否可落地；是否与要点重复'
  },
  rating_certification: {
    aiHint: '每行一个目标分级机构与目标等级，如 ESRB/PEGI；注明送审时间',
    reviewHint: '机构是否覆盖目标市场；目标等级是否匹配内容；是否注明送审时间'
  },
  compliance_notes: {
    aiHint: '列出各市场合规要求：付费披露、概率公示、儿童保护与数据合规',
    reviewHint: '是否覆盖概率公示与儿童保护；是否逐市场列出；有无引用过期法规'
  }
}
