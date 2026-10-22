import type { ChapterFieldHints } from './types'

/**
 * 第十七章·UI/UX 交互设计的字段契约（P2，2026-10-23）。
 *
 * 本章要点：UI/UX 是「看起来好写」的章，AI 最易交差——原则不可核对、
 * 界面与流程对不上、验收线没有数字。契约逐字段钉死产出结构：
 * 流程/界面/反馈用 pipeList/stringList 的列约束最小信息单元，
 * 原则三件套把「逐条可核对」写进 aiHint，可用性标准强制量化。
 *
 * `design_principles_points` / `design_principles_notes` 的契约随本体一并给出，
 * 与字段定义中的手工三件套对应，无需拆分配置自动生成。
 */
export const UIUX_FIELD_HINTS: ChapterFieldHints = {
  design_principles: {
    aiHint: '一段概述：UI/UX 设计的总体原则与取向；逐条原则及界面体现走「要点」字段，本体勿罗列',
    reviewHint: '本体是否只讲总体取向；要点是否逐条可核对；是否与流程、界面说明矛盾'
  },
  design_principles_points: {
    aiHint: '3-5 条原则，每条一句：原则 + 在界面上的具体体现',
    reviewHint: '每条是否「原则+体现」两要素齐全；体现是否可核对；与本体是否重复'
  },
  design_principles_notes: {
    aiHint: '原则之外的补充说明（如参考依据、取舍记录），可留空',
    reviewHint: '是否只放补充信息，没有把要点又抄一遍'
  },
  information_architecture: {
    aiHint: '界面层级与导航结构：有哪些界面、从属关系、主导航形态与各入口规则',
    reviewHint: '层级是否成树；导航形态是否明确；入口是否与核心流程对得上'
  },
  core_flows: {
    aiHint: '每行一个核心流程：流程名称|步骤|出口；步骤按先后写，出口写清返回或跳转目标',
    reviewHint: '步骤是否有先后顺序；出口是否明确；流程是否与信息架构所列界面一一对应'
  },
  key_screens: {
    aiHint: '每行一个关键界面：名称+核心元素+交互方式；元素写界面里实际存在的东西',
    reviewHint: '每行是否三要素齐全；元素是否具体；是否与信息架构所列界面一致'
  },
  feedback_rules: {
    aiHint: '每行一条反馈规则：触发操作|反馈形式|时机；须覆盖点击、加载、错误、奖励场景',
    reviewHint: '每条是否操作与反馈对应；是否覆盖错误与加载场景；时机是否可感知'
  },
  usability_standards: {
    aiHint: '每行一条可量化验收线（如「任意功能 ≤3 步到达」）；必须带数字或明确判定条件',
    reviewHint: '每条是否可量化；是否覆盖核心流程；步数上限与流程步骤数是否自洽'
  }
}
