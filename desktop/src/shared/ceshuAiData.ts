/**
 * 策划书 AI 生成 —— 定义层（与 ceshuAi.ts 的求值/组装逻辑分离）：
 * 子智能体路由表、风格术语表、整章/全量生成提示词片段、全量生成表单枚举、
 * 风格/类型标签映射、章节生成提示、审阅维度枚举。
 * 纯数据 / 常量，无求值逻辑；逻辑层 ceshuAi.ts 导入此处常量并 re-export 公共 API。
 *
 * ---- 提示词登记表（改文案前先看这里，确认「唯一来源」在哪） ----
 * 本文件是**提示词文本的唯一来源**：写作规范、禁编造条款、章节生成提示、
 * 审阅维度枚举都在这里；逻辑层只做组装，不得再写一份同类文案。
 *   · 章节起草 / 全量生成 / 审阅      → ceshuAi.ts（buildChapterPrompt / buildChapterPrompts / buildReviewPrompts）
 *   · 机读包消费（draft / review）    → ceshuBundlePrompt.ts（buildBundleConsumePrompt）
 *   · 数据表批量生成（角色/技能等）   → ceshuDataGen.ts（buildDataGenPrompt）
 *   · 文档 → 可玩 Demo（单文件 HTML） → ceshuDemoPrompt.ts（buildDemoPrompt，形态不同，刻意独立）
 * 审阅维度的 key/label 同时被 UI（AiReviewPanel）与提示词消费，故必须从
 * REVIEW_DIMENSION_KEYS / REVIEW_DIMENSION_LABELS 派生，禁止在提示词里手写。
 */

import type { ChapterKey } from './ceshuConstants'

/* ---- 子智能体路由（匹平 Python AgentRouter，文档信息 + 16 章完整映射） ---- */

export const CHAPTER_AGENT_MAP: Record<ChapterKey, string> = {
  meta: '通用策划助手',
  vision: '通用策划助手',
  story: 'content_writer',
  gameplay: '通用策划助手',
  systems: 'game_designer',
  numeric: 'data_analyst',
  art: '通用策划助手',
  tech: 'code_assistant',
  resources: '通用策划助手',
  market_analysis: 'data_analyst',
  combat: 'game_designer',
  economy: 'data_analyst',
  monetization: '通用策划助手',
  mvp: 'code_assistant',
  risk_handling: '通用策划助手',
  audio: '通用策划助手',
  accessibility: '通用策划助手',
  // P2 扩展设计 7 章（2026-10-23）：均走通用策划助手（与 vision/gameplay 等大多数章一致）
  uiux: '通用策划助手',
  level_design: '通用策划助手',
  live_ops: '通用策划助手',
  analytics: '通用策划助手',
  qa: '通用策划助手',
  publishing: '通用策划助手',
  performance: '通用策划助手'
}

export const AGENT_DISPLAY: Record<string, string> = {
  game_designer: '策划专家',
  content_writer: '文案写手',
  data_analyst: '数据分析师',
  code_assistant: '代码助手',
  通用策划助手: '通用策划助手'
}

export const CHAPTER_AGENT_PROMPTS: Record<ChapterKey, string> = {
  meta: '请根据当前项目元信息，补充游戏名称和类型建议。',
  vision: '请分析市场定位和竞品，给出差异化建议。',
  story: '请为世界观与角色设定提出创意构思，或设计主角／NPC／反派／Boss 并给出背景与成长弧线。',
  gameplay: '请分析核心玩法设计，提出改进建议。',
  systems: '请设计或审查游戏系统规则和参数。',
  numeric: '请分析数值框架，提供平衡性建议。',
  art: '请提供美术风格方向和配色方案建议。',
  tech: '请提供技术选型、架构方案和开发计划建议。',
  resources: '请协助规划资源清单和风险评估。',
  market_analysis: '请分析目标市场、竞品和用户画像，提供市场定位建议。',  combat: '请设计战斗机制、技能系统、伤害公式和平衡策略。',
  economy: '请设计货币体系、产出回收机制和通胀控制策略。',
  monetization: '请设计付费模式、定价档位和运营策略，平衡免费与付费体验。',
  mvp: '请规划 MVP 范围、里程碑和验收标准，确保核心玩法可验证。',
  risk_handling: '请识别技术/市场/团队/进度风险，制定应对和监控策略。',
  audio: '请设计音乐风格、音效清单和音频技术规格。',
  accessibility: '请规划多语言支持、无障碍特性和分级认证。',
  // P2 扩展设计 7 章（2026-10-23）
  uiux: '请分析界面布局与交互流程，指出信息架构与操作路径上的问题。',
  level_design: '请分析关卡节奏与内容消耗曲线，提出关卡模板与难度曲线建议。',
  live_ops: '请分析运营活动节奏，提出活动排期与留存提升方案。',
  analytics: '请分析数据埋点与指标体系，指出关键漏斗上缺失的埋点。',
  qa: '请分析测试策略，提出用例覆盖范围与风险优先级建议。',
  publishing: '请分析上线发行计划，指出渠道与合规风险。',
  performance: '请分析性能预算与适配策略，指出指标缺口。'
}

/* ---- 风格术语表（匹平 Python _STYLE_GLOSSARIES） ---- */

export const STYLE_GLOSSARIES: Record<string, string> = {
  xianxia:
    '气血=HP, 灵力=MP, 修为=经验, 渡劫=升级关键节点\n境界划分: 练气→筑基→金丹→元婴→化神→渡劫→大乘→飞升\n宗门/门派系统, 法宝=装备, 丹药=消耗品, 功法=技能\n灵石=货币, 天地人=品质分级, 仙魔妖=阵营',
  wuxia:
    '气血=HP, 内力=MP, 经验=阅历\n境界: 三流→二流→一流→后天→先天→宗师→大成\n门派/帮派系统, 兵器=装备, 秘籍=技能书\n银两=货币, 武功=技能, 经脉=属性系统',
  'sci-fi':
    'HP=生命值, MP=能量/护盾, 经验=数据/经验值\n等级=军衔/阶级, 装备=武器/护甲/模块\n货币=信用点/星币, 阵营=联邦/帝国/自由联盟\n技能=战术模块, 消耗品=医疗包/能量电池',
  fantasy:
    'HP=生命值, MP=魔法值, 经验=经验值\n种族: 人类/精灵/矮人/兽人/龙裔\n职业: 战士/法师/牧师/盗贼/游侠/圣骑士\n装备=武器/护甲/饰品, 货币=金币/银币/铜币\n魔法=元素: 火/水/土/风/光/暗',
  post_apoc:
    'HP=生命值, 辐射值=Radiation, 饥饿度/口渴度\n资源= scrap(废料)/弹药/食物/水/燃料\n装备=武器/护甲/防毒面具, 阵营=幸存者/掠夺者/军方\n技能=生存技能, 消耗品=治疗针/抗辐射药',
  realistic:
    'HP=生命值, 体力=Stamina, 经验=经验值\n装备=武器/护甲/配件, 货币=游戏币/真实货币\n等级=军衔/段位, 技能=主动/被动技能'
}

/* ---- 整章提示词片段（匹平 Python _ai_fill_chapter） ---- */

/**
 * 策划书写作规范：同时服务于「AI 可解析」与「人可读、简单易懂」。
 *
 * 为什么写进提示词而不是只做校验：AI 生成是内容的主要来源，**在生成时就约束**
 * 比事后报错更省事；校验只能挑毛病，规范能让初稿就接近可用。
 *
 * 三条硬约束（也是可机器检查的）：
 * - 列表统一 `- ` 开头、每行一个要点 ⇒ AI 逐条可解析，导出也易转结构化；
 * - 先结论后理由、单句 ≤40 字 ⇒ 人扫读成本低；
 * - 禁用无信息量套话（丰富多样/深度融合/极致体验）⇒ 逼出具体名词与数字。
 */
export const CESHU_WRITING_STANDARD = [
  '写作规范（人读得懂，AI 也好解析）：',
  '1. 先给结论或要点，再补一句理由，不要绕。',
  '2. 一句话只说一件事，单句尽量不超过 40 字，避免长复合句。',
  '3. 用具体名词、数字、例子；不要写「丰富多样」「深度融合」「极致体验」这类空话。',
  '4. 列表统一用「- 」开头，每行一个要点，便于程序解析与快速扫读。',
  '5. 术语首次出现时用一句白话解释（例：CD＝技能冷却时间）。',
  '6. 不重复上下文里已有的信息，只补新内容。'
].join('\n')

/**
 * 禁编造约束（2026-10-23 配置体检后新增）。
 *
 * 为什么单列：体检发现**最危险的生成场景是「竞品/市场数字/引擎名」**——
 * 模型对这些事实毫无把握却会流畅地编（编造竞品名、编造市场规模、编造销量），
 * 而人审时很难逐条核实。与其依赖人抓，不如在生成时就关掉这条路。
 * 与各字段的 aiHint 里的禁编造要求同源，这里是全局兜底。
 */
export const CESHU_NO_FABRICATION = [
  '禁编造（硬约束）：',
  '1. 竞品名、已上线游戏、引擎、IP、公司名必须是真实存在的；不确定就不要写具体名字。',
  '2. 市场规模、销量、排名、收入等外部数字，给出处（如「据 SensorGrid 2025 报告」）；',
  '   没有可靠出处时写「待确认」，不要编数字。',
  '3. 时间与人数类承诺给区间（如「6-8 周」「3-5 人」），不给精确到日/精确到人的假精确。',
  '4. 拿不准的事实性内容，宁可写「待确认」也不要猜——「待确认」是可接受的答案。'
].join('\n')

export const REQUIREMENTS_ONLY_EMPTY = [
  '要求：',
  '1. 只输出上面字段列表中列出的空字段，已填字段一律不要输出',
  '2. 字段值要具体、专业、符合游戏类型和风格',
  '3. 字符串字段生成 50-300 字的专业内容',
  '4. 列表字段生成 2-5 个元素的列表',
  '5. 数字字段生成合理的整数值',
  '6. 只输出 JSON，不要加任何解释',
  '',
  CESHU_NO_FABRICATION,
  '',
  CESHU_WRITING_STANDARD
].join('\n')

export const REQUIREMENTS_FULL = [
  '要求：',
  '1. 必须为字段列表中的每个字段都生成内容（即使是空字符串也要包含键）',
  '2. 字段值要具体、专业、符合游戏类型和风格',
  '3. 字符串字段生成 50-300 字的专业内容',
  '4. 列表字段生成 2-5 个元素的列表',
  '5. 数字字段生成合理的整数值',
  '6. 只输出 JSON，不要加任何解释',
  '',
  CESHU_NO_FABRICATION,
  '',
  CESHU_WRITING_STANDARD
].join('\n')

/* ---- 全量生成表单枚举（匹平 Python ai_full_generate_dialog） ---- */

export const FULL_GEN_GAME_TYPES = [
  'RPG',
  'MMORPG',
  'ARPG',
  'MOBA',
  'FPS',
  'SLG',
  '休闲',
  '放置',
  '卡牌',
  '塔防',
  'Roguelike',
  '策略'
]

export const FULL_GEN_STYLES = [
  '仙侠',
  '武侠',
  '科幻',
  '现代',
  '奇幻',
  '末日',
  '历史',
  '二次元',
  '暗黑',
  '赛博朋克',
  '蒸汽朋克'
]

export const FULL_GEN_BUSINESS_MODELS = ['F2P', 'P2P', 'Buyonce', '混合']

export const FULL_GEN_PLATFORMS = ['PC', '移动端', '主机', 'Web']

export const STYLE_LABEL_TO_KEY: Record<string, string> = {
  仙侠: 'xianxia',
  武侠: 'wuxia',
  科幻: 'sci-fi',
  现代: 'realistic',
  奇幻: 'fantasy',
  末日: 'post_apoc',
  历史: 'realistic',
  二次元: 'anime',
  暗黑: 'dark',
  赛博朋克: 'cyberpunk',
  蒸汽朋克: 'steampunk'
}

export const TYPE_LABEL_TO_KEY: Record<string, string> = {
  RPG: 'rpg',
  MMORPG: 'mmorpg',
  ARPG: 'arpg',
  MOBA: 'moba',
  FPS: 'fps',
  SLG: 'slg',
  休闲: 'casual',
  放置: 'casual',
  卡牌: 'card',
  塔防: 'tower_defense',
  Roguelike: 'roguelike',
  策略: 'strategy'
}

/* ---- 章节生成提示（照抄 Python chapter_hint，供全量生成逐章追加提示） ---- */

export const CHAPTER_GENERATION_HINTS: Record<ChapterKey, string> = {
  meta: '请生成项目元信息：游戏名称、类型、市场定位（一句话）、标签列表（3-5个）。',
  vision: '请生成产品愿景：设计愿景、差异化卖点、用户画像（主/次/潜在）、商业模式。',
  market_analysis: '请生成市场分析：目标市场、市场容量、用户画像、竞品列表、市场定位、进入壁垒、市场趋势、KPI预测。',
  story: '请生成世界观与角色：世界观架构、历史时代、阵营列表、地理设定、主线剧情、分支结局、角色关系网；主角设定、主要NPC数量与列表、反派设计、Boss设计、敌人类型、同伴系统、角色成长弧线。',
  gameplay: '请生成核心玩法：核心循环、操作方案、首30分钟体验、游戏模式、胜负条件、新手引导。',
  combat: '请生成战斗系统：战斗模式、伤害公式、技能系统、Buff机制、元素系统、战斗节奏、PVP/PVE设计、Boss机制。',
  systems: '请生成游戏系统：基于玩法需求推荐应启用的游戏系统及配置（保留 systems 结构中 enabled/config 字段）。',
  economy: '请生成经济系统：货币类型、产出与回收机制、掉落表、生产链、市场设计、通胀控制、经济目标。',
  monetization: '请生成商业化设计：付费模式、定价档位、内购设计、广告策略、订阅制、赛季通行证、VIP系统、收入预测。',
  numeric: '请生成数值设计：核心公式、成长曲线、掉落表、经济模型、平衡原则。',
  art: '请生成美术设计：美术风格、角色设计、环境设计、UI设计语言、色彩系统、字体、特效、动画、多分辨率。',
  audio: '请生成音频设计：音乐风格、音效数量、配乐清单、音效清单、配音设计、音频引擎、动态音频、音频预算。',
  tech: '请生成技术规格：引擎选型、核心架构、第三方依赖、性能目标、里程碑、团队结构、QA计划。',
  risk_handling: '请生成风险控制：风险矩阵、应急预案、技术风险、市场风险、团队风险、法律风险、进度风险、监控机制。',
  mvp: '请生成MVP规划：MVP范围、时间线、核心特性、暂缓特性、原型特性、里程碑、成功标准、团队规模、预算估算。',
  resources: '请生成资源规划：美术资产、音频资产、本地化、外包、预算、风险矩阵、应急预案、IP、附录。',
  accessibility: '请生成可访问性与本地化：支持语言列表、本地化策略、文化适配、无障碍特性、字幕设计、色盲支持、分级认证。',
  // P2 扩展设计 7 章（2026-10-23）
  uiux: '请生成 UI/UX 交互设计：设计原则、信息架构、核心界面流程、关键界面说明、交互反馈规范、可用性标准。',
  level_design: '请生成关卡与内容设计：关卡设计原则、难度曲线、关卡模板、首关体验、内容量估算、编辑器需求。',
  live_ops: '请生成运营与活动：运营目标、活动体系、活动日历、留存与拉回手段、社区运营、版本运营节奏。',
  analytics: '请生成数据埋点与指标：指标体系、关键漏斗、埋点清单、数据看板、异常监控、分析工具。',
  qa: '请生成测试与质量保障：测试策略、用例范围、自动化方案、体验验收标准、缺陷管理、测试环境。',
  publishing: '请生成上线与发行：发行计划、渠道策略、合规要求、市场宣传、软启动方案、上线检查单。',
  performance: '请生成性能与适配：性能预算、目标机型、内存与包体、网络适配、发热与耗电、兼容测试矩阵。'
}

/* ---- 审阅维度枚举（固定规范顺序；Python 用 set 遍历、顺序不稳定，已修正） ---- */

export const REVIEW_DIMENSION_KEYS = ['completeness', 'consistency', 'market', 'technical', 'creativity'] as const
export type ReviewDimensionKey = (typeof REVIEW_DIMENSION_KEYS)[number]

export const REVIEW_DIMENSION_LABELS: Record<ReviewDimensionKey, string> = {
  completeness: '内容完整性',
  consistency: '逻辑一致性',
  market: '市场可行性',
  technical: '技术可行性',
  creativity: '创意度'
}
