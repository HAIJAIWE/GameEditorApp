/**
 * 章节 `art` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件；旧 ceshuFieldHints/ceshuFieldSplits 仅做 re-export 兜底。
 * 改一个字段只碰这一处。
 */
import type { ChapterSchema } from './types'
import type { CeshuFieldDef } from '../ceshuConstants'

export const ART_FIELDS: CeshuFieldDef[] = [
  {
    key: 'art_style',
    label: '美术风格',
    kind: 'textarea',
    aiHint: '产出美术风格描述：整体风格定位 + 表现手法（像素/水墨/写实3D等）+ 关键视觉特征；须具体到可验收',
    reviewHint: '是否有明确风格定位词；是否含表现手法与关键特征；是否出现「精致」「好看」等空话'
  },
  {
    key: 'color_system',
    label: '色彩体系',
    kind: 'textarea',
    aiHint: '产出色彩体系：主色/辅助色/强调色/背景色四类，每类给色名或色值，附使用比例或场景',
    reviewHint: '是否覆盖主/辅/强调/背景四类；每类是否给色名或色值；有无使用场景或比例说明'
  },
  {
    key: 'typography',
    label: '字体排版',
    kind: 'textarea',
    aiHint: '一段概述：字体排版的整体风格与选型原则；各场景字体与授权情况走「要点」逐条列',
    reviewHint: '是否按标题/正文/UI 分场景给具体字体名；是否提及授权风险；理由是否与 art_style 匹配'
  },
  {
    key: 'vfx',
    label: '特效风格',
    kind: 'textarea',
    aiHint: '一段概述：特效的整体风格定位；各特效类型与视觉语言走「要点」逐条列',
    reviewHint: '是否列出特效类型清单；每类是否有视觉语言描述；是否与整体美术风格一致'
  },
  {
    key: 'character_design',
    label: '角色设计要点',
    kind: 'stringList'
  },
  {
    key: 'environment_design',
    label: '场景设计要点',
    kind: 'stringList'
  },
  {
    key: 'ui_design_language',
    label: 'UI 设计语言',
    kind: 'textarea'
  },
  {
    key: 'animation',
    label: '动画规格',
    kind: 'stringList'
  },
  {
    key: 'multi_resolution',
    label: '多分辨率适配',
    kind: 'textarea'
  }
]

export const ART_SPLIT_HINTS: ChapterSchema['splitHints'] = {
  typography: {
    points: {
      aiHint: '3-6 条：每条一个用途场景（标题/正文/UI）+ 具体字体名 + 授权情况',
      reviewHint: '是否按场景给到具体字体名；是否提及授权；理由是否与 art_style 匹配'
    },
    notes: {
      aiHint: '要点之外的补充说明：备用字体或本地化字形兼容问题，可留空',
      reviewHint: '补充是否与要点重复；字形兼容问题是否写清'
    }
  },
  vfx: {
    points: {
      aiHint: '3-6 条：每条一类特效 + 视觉语言（粒子/光效/材质）+ 触发场景',
      reviewHint: '每类是否有视觉语言与触发场景；是否与整体美术风格一致；有无「炫酷」这类空话'
    },
    notes: {
      aiHint: '要点之外的补充说明：性能预算或特效管线工具，可留空',
      reviewHint: '补充是否与要点重复；性能预算是否给出量级'
    }
  }
}

export const ART_SCHEMA: ChapterSchema = {
  fields: ART_FIELDS,
  splits: [
  'typography',
  'vfx',
  'ui_design_language',
  'multi_resolution'
],
  splitHints: ART_SPLIT_HINTS
}
