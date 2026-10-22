import type { ChapterFieldHints } from './types'

/**
 * 第十六章·可访问性与本地化的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：AI 起草可访问性易堆名词不落地，
 * 契约要求每项特性对应具体功能与验收标准；分级认证只认官方机构，防止臆造标准。
 */
export const ACCESSIBILITY_FIELD_HINTS: ChapterFieldHints = {
  language_list: {
    aiHint: '每行一个支持语言，标注首发还是后续版本，并注明对应目标市场',
    reviewHint: '是否区分首发与后续；语言是否与目标市场匹配'
  },
  localization_strategy: {
    aiHint: '说明文本抽取、翻译流程、QA 回归与更新机制；含字体与排版适配',
    reviewHint: '是否覆盖更新与回归流程；是否含字体排版适配'
  },
  cultural_adaptation: {
    aiHint: '列出各目标市场的适配项：敏感元素、节日、审美偏好与法规红线',
    reviewHint: '是否逐市场列适配项；是否含法规红线；有无凭空臆测'
  },
  accessibility_features: {
    aiHint: '每行一个无障碍特性，注明对应的功能入口；只列本项目会做的项',
    reviewHint: '每条是否可落地为功能；是否与字号/色盲等专项重复'
  },
  subtitle_design: {
    aiHint: '说明字幕字号、描边、安全区与语速；含说话人标识与关键音效提示',
    reviewHint: '是否含字号与安全区规范；是否标识说话人；是否覆盖音效提示'
  },
  color_blind_support: {
    aiHint: '说明色盲模式类型、覆盖场景与替代信息传达；关键信息不只靠颜色传递',
    reviewHint: '是否覆盖全部 UI 场景；关键信息是否有非颜色通道；模式是否可选'
  },
  motor_accessibility: {
    aiHint: '说明按键自定义、辅助瞄准、连发与操作简化选项；覆盖手柄操作',
    reviewHint: '是否支持按键自定义；是否有简化操作选项；是否覆盖手柄'
  },
  cognitive_accessibility: {
    aiHint: '说明难度选项、提示系统、节奏控制与防眩晕设计；提示可关闭',
    reviewHint: '难度是否可调；提示是否可关闭；是否含防眩晕'
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
