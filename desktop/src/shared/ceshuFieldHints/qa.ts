import type { ChapterFieldHints } from './types'

/**
 * 第二十一章·测试与质量保障的字段契约（P2，2026-10-23）。
 *
 * 与字段设计的对应关系见 `ceshuChapterFields/qa.ts` 文件头：
 * 分层三件套、用例/缺陷列结构与验收条款的判定口径，在这里落成
 * 「AI 产出物 + 人审检查点」。test_env 涉及设备采购预算，为人定字段，
 * 只给人审要点、不给 aiHint。
 */
export const QA_FIELD_HINTS: ChapterFieldHints = {
  test_strategy: {
    aiHint: '一段概述：功能/兼容/性能/体验分层测试策略与自动化边界；各层重点走「要点」字段',
    reviewHint: '本体是否只讲策略与自动化边界；要点是否覆盖四层且给出各层重点'
  },
  test_strategy_points: {
    aiHint: '4 层：功能、兼容、性能、体验，每行一层，含测试重点与自动化比例',
    reviewHint: '条目是否可逐条核对；四层是否齐全；自动化比例是否合理可行'
  },
  test_strategy_notes: {
    aiHint: '自动化工具链、测试左移与准入准出规则等补充说明，可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  test_cases: {
    aiHint: '每行一个模块，按模块/用例数/优先级三列填写；覆盖核心玩法、战斗、经济、UI 等模块',
    reviewHint: '模块是否覆盖主要系统；用例数是否与优先级匹配、量级是否合理'
  },
  acceptance_criteria: {
    aiHint: '3-6 条可判定条款，每行一条，必须含数值阈值或明确通过条件，如「新手引导完成率 ≥ 80%」',
    reviewHint: '每条是否可判定；是否含数值阈值；是否与数据分析章指标体系对得上'
  },
  defect_management: {
    aiHint: '每行一个缺陷级别，按级别/定义/响应 SLA/修复时限四列填写；一般 3-4 级',
    reviewHint: '分级定义是否互不重叠；SLA 是否明确到小时/天；是否含回归验证要求'
  },
  test_env: {
    reviewHint: '机型与系统覆盖是否匹配目标平台；设备采购预算是否人核；网络环境是否含弱网',
    aiDraftable: false
  }
}
