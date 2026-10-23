/**
 * 章节 `vision` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件；旧 ceshuFieldHints/ceshuFieldSplits 仅做 re-export 兜底。
 * 改一个字段只碰这一处。
 */
import type { ChapterSchema } from './types'
import type { CeshuFieldDef } from '../ceshuConstants'

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
    aiHint: '年龄 / 使用场景 / 核心痛点，各一句'
  },
  {
    key: 'user_personas.secondary',
    label: '次要用户',
    kind: 'textarea',
    aiHint: '与主要用户的具体差异，不要复述'
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
    aiDraftable: false
  },
  {
    key: 'competitive_analysis',
    label: '竞品对比要点',
    kind: 'stringList'
  },
  {
    key: 'design_pillars',
    label: '设计支柱',
    kind: 'pipeList',
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

export const VISION_SCHEMA: ChapterSchema = {
  fields: VISION_FIELDS,
  splits: [],
  splitHints: undefined
}
