/**
 * 章节 `resources` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件；旧 ceshuFieldHints/ceshuFieldSplits 仅做 re-export 兜底。
 * 改一个字段只碰这一处。
 */
import type { ChapterSchema } from './types'
import type { CeshuFieldDef } from '../ceshuConstants'

export const RESOURCES_FIELDS: CeshuFieldDef[] = [
  {
    key: 'budget.summary',
    label: '预算概算',
    kind: 'text',
    reviewHint: '概算是否含总额与分项（人力/外包/软件/市场）；数字是否与 team_structure 规模自洽；是否注明币种与估算口径',
    aiDraftable: false
  },
  {
    key: 'risk_matrix',
    label: '风险评估',
    kind: 'stringList',
    placeholder: '每行一条风险',
    aiHint: '资源视角的 TOP 3-5 条风险概要，每行：风险 + 概率/影响 + 应对方向；完整矩阵与负责人分派在第十三章，此处勿展开',
    reviewHint: '是否只列 TOP 几条而未展开完整矩阵；每条是否三要素齐全；与第十三章矩阵是否自洽不矛盾'
  },
  {
    key: 'ip',
    label: '知识产权',
    kind: 'text',
    reviewHint: '是否区分自研/授权/第三方资产；授权项是否注明授权范围与期限；是否有侵权风险项未处置',
    aiDraftable: false
  },
  {
    key: 'art_assets',
    label: '美术资源清单',
    kind: 'pipeList',
    placeholder: '类别|数量|规格'
  },
  {
    key: 'audio_assets',
    label: '音频资源清单',
    kind: 'pipeList',
    placeholder: '类别|数量|说明'
  },
  {
    key: 'localization',
    label: '本地化资源',
    kind: 'pipeList',
    placeholder: '语言|阶段|文本量'
  },
  {
    key: 'outsourcing',
    label: '外包计划',
    kind: 'pipeList',
    placeholder: '事项|方式|预算'
  },
  {
    key: 'contingency_plan',
    label: '应急预案',
    kind: 'textarea'
  },
  {
    key: 'appendix',
    label: '附录',
    kind: 'textarea'
  }
]

export const RESOURCES_SCHEMA: ChapterSchema = {
  fields: RESOURCES_FIELDS,
  splits: [
  'contingency_plan',
  'appendix'
],
  splitHints: undefined
}
