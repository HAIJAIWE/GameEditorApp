/**
 * 策划书 AI 生成 —— 定义层（与 ceshuAi.ts 的求值/组装逻辑分离）：
 * 子智能体路由表、风格术语表、整章/全量生成提示词片段、全量生成表单枚举、
 * 风格/类型标签映射、章节生成提示、成稿反审清单（7 项 + 品类档案）。
 * 纯数据 / 常量，无求值逻辑；逻辑层 ceshuAi.ts 导入此处常量并 re-export 公共 API。
 *
 * ---- 提示词登记表（改文案前先看这里，确认「唯一来源」在哪） ----
 * 本文件是**提示词文本的唯一来源**：写作规范、禁编造条款、章节生成提示、
 * 成稿反审清单（7 项探针 + 品类档案）都在这里；逻辑层只做组装，不得再写一份同类文案。
 *   · 章节起草 / 全量生成 / 审阅      → ceshuAi.ts（buildChapterPrompt / buildChapterPrompts / buildReviewPrompts）
 *   · 机读包消费（draft / review）    → ceshuBundlePrompt.ts（buildBundleConsumePrompt）
 *   · 数据表批量生成（角色/技能等）   → ceshuDataGen.ts（buildDataGenPrompt）
 *   · 文档 → 可玩 Demo（单文件 HTML） → ceshuDemoPrompt.ts（buildDemoPrompt，形态不同，刻意独立）
 * 反审项的 key/label 同时被 UI（AiReviewPanel）与提示词消费，故必须从
 * ADVERSARIAL_CHECK_KEYS / ADVERSARIAL_CHECK_LABELS 派生，禁止在提示词里手写；
 * 「核心选择 / 数值与可达性」的追问按品类走 `reviewProbeFor()`，不得在逻辑层写死品类分支。
 */

import type { ChapterKey } from '../reference/ceshuConstants'

/* ---- 子智能体路由 ---- */

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

/* ---- 风格术语表 ---- */

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

/**
 * 风格关键词补遗（2026-10-28 全量生成补信号）：`STYLE_GLOSSARIES` 只覆盖
 * 仙侠/武侠/科幻/奇幻/末日/现代，剩下 二次元/暗黑/赛博朋克/蒸汽朋克 没有术语表。
 * 这里给这几类补一组可直接写进全量生成提示词的「风格关键词」，让一句话生成时
 * AI 也能拿到题材锚点（而不是只看到中文标签「赛博朋克」四个字）。
 */
export const STYLE_KEYWORD_HINTS: Record<string, string[]> = {
  anime: ['二次元美术：角色立绘 / Live2D / 表情差分', '日系声优配音与角色歌', '抽卡角色与限定卡池运营', '羁绊 / 好感度系统'],
  dark: ['暗黑基调：低饱和冷色、阴郁氛围', '道德灰度抉择（无绝对善恶）', '惩罚性失败 / 永久死亡可选', '克苏鲁 / 哥特意象'],
  cyberpunk: ['赛博朋克：义体改造 / 神经接驳', '数据入侵 / 黑客子系统', '企业霸权与底层反抗叙事', '霓虹夜城美术与合成波配乐'],
  steampunk: ['蒸汽朋克：蒸汽机械 / 齿轮传动', '差分机与发条科技树', '维多利亚美学与黄铜质感', '飞空艇 / 机械义肢']
}

/* ---- 整章提示词片段 ---- */

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
  '6. 不重复上下文里已有的信息，只补新内容。',
  // 2026-10-26 从 game-designer-pro 方法论补入的三条硬核（可判定 / 有失败 / 有取舍）
  '7. 可判定：目标、阈值、概率、时长、成本至少给一个量化锚点，并写清怎么判定达成（不写「体验流畅」，写「3 步内完成核心操作、帧率 ≥ 30」）。',
  '8. 有失败：涉及规则/系统/流程的内容，写清失败、边界与异常怎么处理、玩家怎么恢复，不只写成功路径。',
  '9. 有取舍：关键设计决策写一句「为什么不选另一种」，避免看起来像拍脑袋。'
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

/**
 * 「字符串字段写什么」——增量生成（`REQUIREMENTS_ONLY_EMPTY`）与全量生成
 * （`REQUIREMENTS_FULL`）共用的同一条要求，故单源在这里，改口径只改这里。
 *
 * 2026-10-26 去「字数指标」化：原文是「字符串字段生成 50-300 字的专业内容」，
 * 把长度当成质量目标，模型就会为凑字数注水（空话套话、长篇无数字）——
 * 而校验与完备度现在会点出这种内容（`contentQualityIssues`），提示词与检查必须同向，
 * 否则模型被两套标准拉扯。长度只保留为参考量级。
 */
export const REQUIREMENT_STRING_CONTENT =
  '3. 字符串字段写具体、可验证的内容（参考量级 50-300 字）：有数字、有实例、有取舍理由；宁可短而实，不要为凑字数注水——空话套话（如「丰富多样」「沉浸式体验」）和长篇却没有数字的段落会被判为内容质量不足'

export const REQUIREMENTS_ONLY_EMPTY = [
  '要求：',
  '1. 只输出上面字段列表中列出的空字段，已填字段一律不要输出',
  '2. 字段值要具体、专业、符合游戏类型和风格',
  REQUIREMENT_STRING_CONTENT,
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
  REQUIREMENT_STRING_CONTENT,
  '4. 列表字段生成 2-5 个元素的列表',
  '5. 数字字段生成合理的整数值',
  '6. 只输出 JSON，不要加任何解释',
  '',
  CESHU_NO_FABRICATION,
  '',
  CESHU_WRITING_STANDARD
].join('\n')

/* ---- 全量生成表单枚举 ---- */

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

/* ---- 全量生成「硬约束」与「品类关键词」（2026-10-28：一句话生成信号补足） ---- */

/**
 * 平台硬约束：从用户所选平台直接派生，逐条可被机器 / 测试核验。
 * 全量生成时注入每章提示词，相关章节（UI/性能/商业化/数值）的生成内容必须满足这些红线，
 * 否则下游编码 AI 拿到文档也跑不起来 / 过不了平台认证。
 */
export const PLATFORM_HARD_CONSTRAINTS: Record<string, string[]> = {
  PC: [
    '桌面端：键鼠为主，支持键位自定义与手柄；最低可交互元素尺寸 ≥ 28px',
    'PC：支持窗口化 / 全屏切换、分辨率自适应（含 21:9 超宽屏）'
  ],
  移动端: [
    '移动端：所有可点击热区最小 44×44pt（iOS HIG）/ 48×48dp（Android），错误点击率可测',
    '移动端：核心操作单手可达（屏幕下半区），首屏不依赖悬浮提示',
    '移动端：弱网 / 断线重连——核心循环需支持 ≤5s 断线重连且状态不丢',
    '移动端：安装包首包 ≤ 200MB（或走分包），冷启动耗时 ≤ 3s'
  ],
  主机: [
    '主机：手柄操作全覆盖（无鼠标依赖），键位映射符合平台规范',
    '主机：需过平台认证（ESRB/PEGI/CERO 分级 + 性能 / 稳定性认证，稳定 30/60fps）',
    '主机：默认开启字幕与色盲模式，支持手柄振动反馈'
  ],
  Web: [
    'Web：首屏包体预算 ≤ 5MB(gzip)，首屏可交互 ≤ 3s，核心资源按需分包加载',
    'Web：兼容最近两年内的 Safari / Chrome / Edge；明确最低支持版本',
    'Web：无本地客户端更新机制，版本灰度需走服务端配置下发'
  ]
}

/**
 * 商业模式硬约束：F2P 必含保底与掉率公示、付费不破坏核心循环；买断类列清交付清单。
 */
export const BUSINESS_HARD_CONSTRAINTS: Record<string, string[]> = {
  F2P: [
    'F2P：必须设计抽卡保底（pity）与掉率公示，抽卡期望与公示口径一致（保底前 / 后概率都要给）',
    'F2P：付费不破坏核心循环——不卖数值碾压，付费点落在外观 / 便利 / 收集',
    'F2P：需设计赛季通行证 / 月卡等持续付费点，并给出月 ARPU 与付费率预测'
  ],
  P2P: ['P2P（买断 + 内购）：列明一次性交付内容清单与后续 DLC 计划，无内购数值碾压'],
  Buyonce: ['Buyonce：一次性买断，列出全部交付内容清单，无后续强制付费与广告'],
  混合: ['混合：区分「基础免费内容」与「付费解锁内容」，边界清晰；付费不破坏核心循环']
}

/**
 * 品类关键词 + 应含系统：从用户所选游戏类型派生，给一句话生成补「这类游戏
 * 一般长什么样、该有哪些系统」的锚点，避免生成内容跑题或关键系统缺席。
 */
export interface TypeKeywordHint {
  /** 品类核心关键词（写进提示词「关键词」块） */
  keywords: string[]
  /** 该品类策划书应覆盖的核心系统（写进提示词，供 systems/economy 等章自检） */
  expectedSystems: string[]
}

export const TYPE_KEYWORD_HINTS: Record<string, TypeKeywordHint> = {
  RPG: { keywords: ['成长曲线', '职业 / 流派', '技能树', '任务链', '世界观叙事'], expectedSystems: ['战斗', '数值', '任务', '装备', '技能', '伙伴 / 宠物'] },
  MMORPG: { keywords: ['大型副本', '公会 / 社交', '赛季', '开放世界'], expectedSystems: ['战斗', '数值', '经济', '社交', '活动', '排行榜'] },
  ARPG: { keywords: ['连招 / 闪避', '装备词缀', 'Build 构筑', '爽快打击感'], expectedSystems: ['战斗', '掉落', '装备', '数值'] },
  MOBA: { keywords: ['英雄', '兵线 / 野区', '视野', '团战'], expectedSystems: ['对战匹配', '数值', '经济', '地图'] },
  FPS: { keywords: ['TTK', '弹道 / 后坐力', '据点', '枪械手感'], expectedSystems: ['射击', '匹配', '数值', '地图'] },
  SLG: { keywords: ['城建', '资源链', '科技树', '联盟'], expectedSystems: ['建造', '战斗', '经济', '活动'] },
  休闲: { keywords: ['单局短', '易上手', '解谜 / 节奏', '碎片化时间'], expectedSystems: ['关卡', '数值', '活动'] },
  放置: { keywords: ['离线收益', '挂机', '数值膨胀', '回归'], expectedSystems: ['经济', '数值', '活动', '任务'] },
  卡牌: { keywords: ['卡组构筑', '费用曲线', '抽卡保底', '羁绊'], expectedSystems: ['对战 / 战斗', '数值', '经济', '收藏'] },
  塔防: { keywords: ['波次', '塔 / 防御', '漏怪', 'DPS'], expectedSystems: ['战斗', '经济', '关卡', '数值'] },
  Roguelike: { keywords: ['词条 / 遗物', '构筑', '随机性', '单局'], expectedSystems: ['战斗', '数值', '掉落', '关卡'] },
  策略: { keywords: ['阵容 / 编队', '克制关系', '回合 / 调度', '部署'], expectedSystems: ['战斗', '数值', '经济'] }
}

/* ---- 章节生成提示 ---- */

export const CHAPTER_GENERATION_HINTS: Record<ChapterKey, string> = {
  meta: '请生成项目元信息：游戏名称、类型、市场定位（一句话）、标签列表（3-5个）、范围与非目标（3-5 条明确不做）、方案取舍（3-6 条：决策|候选方案|为什么不选|结论，必须给出被放弃方案的代价）。',
  vision: '请生成产品愿景：设计愿景、差异化卖点、用户画像（主/次/潜在）、商业模式。**设计支柱 2-4 条，每条是一条可裁决的规则，并各配一个反例（不该发生什么）。**',
  market_analysis: '请生成市场分析：目标市场、市场容量、用户画像、竞品列表、市场定位、进入壁垒、市场趋势、KPI预测。',
  story: '请生成世界观与角色：世界观架构、历史时代、阵营列表、地理设定、主线剧情、分支结局、角色关系网；主角设定、主要NPC数量与列表、反派设计、Boss设计、敌人类型、同伴系统、角色成长弧线。',
  gameplay: '请生成核心玩法：①三层循环（瞬时约 30 秒 / 单局约 5 分钟 / 长期小时级）各写「动作 → 系统变化 → 反馈」，并写清三层之间的传递物（资源 / 能力 / 信息 / 地图 / 关系）；②60–120 秒连续游玩走读（进入已有目标 → 第一眼信息 → 一次核心输入与反馈 → 一次需比较的选择及机会成本 → 系统如何改变下一步 → 一次小成功 / 失败 / 恢复）；③操作方案、游戏模式、胜负条件、新手引导。**必须产出 `核心状态机`（状态|触发事件|结算效果|新状态）5-8 条转移，覆盖主菜单/对局中/暂停/结算/失败/重开，每条可被程序直接实现，禁止留空——状态机是编码 AI 照着写游戏循环的直接依据。**',
  combat: '请生成战斗系统：战斗模式、伤害公式、技能系统、Buff机制、元素系统、战斗节奏、命中判定、PVP/PVE设计、Boss机制。**伤害公式给变量与单位；命中判定逐类攻击写清判定形状/无敌帧/霸体（没有就写「无」）；关键关系写定位/克制/协同，各给一个正例与反例，验证不存在唯一最优解。**',
  systems: '请生成游戏系统：基于玩法需求推荐应启用的游戏系统及配置（保留 systems 结构中 enabled/config 字段）。**每个系统写清生命周期闭合：创建 → 生效条件 → 重复策略 → 消费/退出 → 结束状态 → 打断、死亡、切场景与读档恢复。**',
  economy: '请生成经济系统：货币类型、产出与回收机制、掉落表、生产链、市场设计、通胀控制、经济目标。',
  monetization: '请生成商业化设计：付费模式、定价档位、内购设计、广告策略、订阅制、赛季通行证、VIP系统、收入预测。',
  numeric: '请生成数值设计：核心公式、成长曲线、掉落表、经济模型、平衡原则。**每个数值按「输入来源 → 公式 → 单位与取整 → 正常值 → 边界值 → 设计结论」给出；数字必须有来源（用户约束 / 竞品 / 实测 / 设计初值），禁止只给结论数字。** **必须产出 `数值参数表`（参数|当前值|合法范围|调高影响|调低影响）10-20 行——攻击/防御/暴击率/经验等公式变量都要有初值与合法范围；并产出 3-5 条 `数值断言`（断言|表达式|期望|容差|接受条件）作为可复算验收，缺断言则数值无法验收，禁止留空。**',
  art: '请生成美术设计：美术风格、角色设计、环境设计、UI设计语言、色彩系统、字体、特效、动画、多分辨率。',
  audio: '请生成音频设计：音乐风格、音效数量、配乐清单、音效清单、配音设计、音频引擎、动态音频、音频预算。',
  tech: '请生成技术规格：引擎选型、核心架构、第三方依赖、性能目标、里程碑、团队结构、QA计划、网络协议表、同步模型（同步模型/权威端/回滚/断线恢复四维；纯单机留空）。',
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
  performance: '请生成性能与适配：性能预算（指标/目标值/测量方法）、画质档位（低/中/高各降什么、目标帧率、目标机型）、目标机型、内存与包体、网络适配、发热与耗电、兼容测试矩阵。'
}

/* ---- 成稿反审清单（2026-10-26；源于 skill `game-designer-pro` 的 adversarial-review.md） ---- */

/**
 * 反审核查项（固定规范顺序，**不随品类变**）。
 *
 * ## 为什么不打分
 * 旧的 5 维度 1-10 分（完整性/一致性/市场/技术/创意）给不出「能不能交付」的结论——
 * 「7 分」既不指向动作，也跨品类不可比（休闲与 SLG 的「创意度」根本不是一个量纲）。
 * 反审改成**三级判定**（阻塞/建议/通过）：只回答「有没有必须修的」。
 *
 * ## 为什么按品类换追问
 * 不同品类的设计文档本来就不一样（无战斗品类没有 TTK，叙事类没有数值可达性）。
 * 7 项本身通用，但「核心选择」「数值与可达性」两项的追问重点按 `meta.game_type`
 * 从 `GENRE_REVIEW_PROFILES` 取——同一套清单，问的是不同品类真正该回答的问题。
 */
export const ADVERSARIAL_CHECK_KEYS = [
  'constraints',
  'choice',
  'numeric',
  'units',
  'lifecycle',
  'production',
  'ruleset'
] as const
export type AdversarialCheckKey = (typeof ADVERSARIAL_CHECK_KEYS)[number]

export const ADVERSARIAL_CHECK_LABELS: Record<AdversarialCheckKey, string> = {
  constraints: '约束与事实',
  choice: '核心选择',
  numeric: '数值与可达性',
  units: '口径与单位',
  lifecycle: '生命周期',
  production: '生产责任',
  ruleset: '同一规则集'
}

/** 每项「查什么」（通用探针；`choice`/`numeric` 可被品类档案覆盖） */
export const ADVERSARIAL_CHECK_PROBES: Record<AdversarialCheckKey, string> = {
  constraints:
    '原始需求里的用户约束、当前事实和所处阶段是否完整继承；每项实质改动是否拥有设计权限（有没有越权改冻结项）',
  choice:
    '关键关系在正反场景（顺风/逆风、前期/后期）下是否都成立；同一基线复算；有没有「永远最优」的支配策略',
  numeric:
    '从原始需求重建必须证明的数值问题，不沿用「已经算过」的结论；公式来源、可达性、通过条件、跨产物一致性、最强可钻路径',
  units: '存量效率与边际收益等口径是否标注清楚、全文一致；数字、单位、取整是否统一',
  lifecycle: '持续规则是否闭合；并发与恢复是否唯一结果；终局是否被消费/结转（不残留孤儿状态）',
  production: 'P0 是否只保留核心责任；容量估算是否包含集成、验证、QA 与修复',
  ruleset: '正文、配置、示例、测试、图示与 Demo 是否使用同一当前定义；跨章节一致性是否核对过'
}

/** 反审判定级别（无分数）：阻塞 = 必须修；建议 = 可改可不改；通过 = 未发现问题 */
export const ADVERSARIAL_LEVELS = ['pass', 'suggestion', 'blocker'] as const
export type AdversarialLevel = (typeof ADVERSARIAL_LEVELS)[number]

export const ADVERSARIAL_LEVEL_LABELS: Record<AdversarialLevel, string> = {
  pass: '通过',
  suggestion: '建议',
  blocker: '阻塞'
}

/** 品类档案：只覆盖「核心选择 / 数值与可达性」两项追问，其余项用通用探针 */
export interface GenreReviewProfile {
  /** 档案展示名（提示词与面板用） */
  label: string
  /** 「核心选择」追问重点（缺省 = 用通用探针） */
  choice?: string
  /** 「数值与可达性」追问重点（缺省 = 用通用探针） */
  numeric?: string
}

export type GenreProfileKey =
  | 'action'
  | 'strategy'
  | 'defense'
  | 'card'
  | 'sim'
  | 'idle'
  | 'survival'
  | 'roguelike'
  | 'open_world'
  | 'narrative'
  | 'party'
  | 'casual'
  | 'generic'

/**
 * 22 个 `meta.game_type` 取值 → 品类档案。
 *
 * 分档依据「这套文档真正要回答的数值问题是什么」：动作类问 TTK，塔防问波次可达性，
 * 放置问离线收益指数，叙事类问分支代价（它根本没有战斗数值）。
 */
export const GENRE_PROFILE_BY_TYPE: Record<string, GenreProfileKey> = {
  RPG: 'action',
  MMORPG: 'action',
  ARPG: 'action',
  FPS: 'action',
  TPS: 'action',
  格斗: 'action',
  大逃杀: 'action',
  非对称竞技: 'action',
  SLG: 'strategy',
  RTS: 'strategy',
  MOBA: 'strategy',
  战棋: 'strategy',
  塔防: 'defense',
  卡牌: 'card',
  模拟经营: 'sim',
  放置: 'idle',
  生存建造: 'survival',
  Roguelike: 'roguelike',
  开放世界: 'open_world',
  视觉小说: 'narrative',
  派对: 'party',
  休闲益智: 'casual'
}

export const GENRE_REVIEW_PROFILES: Record<GenreProfileKey, GenreReviewProfile> = {
  action: {
    label: '动作 / 战斗导向',
    numeric:
      'TTK 与伤害公式是否闭合——血量/攻防/倍率代入能算出文档宣称的击杀时长；成长曲线是否单调，有无断崖或爆炸点',
    choice: '战斗取舍是否成立——有没有「一把武器 / 一个流派永远最优」的支配解；顺风与逆风场景下打法是否都成立'
  },
  strategy: {
    label: '策略 / 竞技（兵团 / 英雄）',
    numeric: '单位或英雄的强度曲线是否与造价匹配；资源产出与消耗是否长期平衡，有没有滚雪球到不可逆',
    choice: '开局 / 阵容选择是否有真实取舍；有无唯一最优解；对抗双方在同一基线复算下是否公平'
  },
  defense: {
    label: '塔防',
    numeric: '波次总血量与可用 DPS 是否可达——逐波代入塔的数值验证「宣称能守住」；金币产出与建造消耗是否收支平衡',
    choice: '塔的搭配是否有取舍（有没有一种塔通吃）；漏怪代价与容错是否合理'
  },
  card: {
    label: '卡牌',
    numeric: '单卡强度 / 费用曲线是否平滑；抽卡概率与期望是否与宣发口径一致（含保底）',
    choice: '卡组构筑是否有取舍；有无「一卡 / 一套牌碾压」的支配解'
  },
  sim: {
    label: '模拟经营',
    numeric: '各资源产出 / 消耗速率是否咬合，长线（数十小时）会不会通胀或枯竭',
    choice: '玩家在经营上的取舍是否成立；有没有「一招鲜」的最优布局让其余玩法作废'
  },
  idle: {
    label: '放置',
    numeric: '离线收益系数与回归曲线是否闭合；数值增长是指数还是线性，与关卡门槛是否匹配',
    choice: '放置与主动干预之间是否有取舍；有无「挂机即最优」的伪选择'
  },
  survival: {
    label: '生存建造',
    numeric: '资源循环（采集-消耗-再生产）是否闭合；生存压力曲线是否随进度上升而非恒定',
    choice: '建造与探索的资源分配是否有取舍；有没有必建 / 必不建的结构'
  },
  roguelike: {
    label: 'Roguelike',
    numeric: '单局时长与强度堆叠曲线是否匹配；词条 / 道具的组合上限是否可控（会不会一局无敌）',
    choice: '每局的构筑选择是否有取舍；有无「必抓」的支配组合'
  },
  open_world: {
    label: '开放世界',
    numeric: '内容密度（兴趣点 / 小时）与探索节奏是否撑得起宣称时长',
    choice: '玩家路线选择是否有取舍；有无「最优跑图顺序」让其余内容作废'
  },
  narrative: {
    label: '叙事 / 视觉小说',
    numeric: '（本品类无战斗数值）分支代价与信息量是否平衡；结局可达性是否闭合、有无死路',
    choice: '关键抉择是否有真实代价；有无「一路选最优即可通关」的伪分支'
  },
  party: {
    label: '派对',
    numeric: '单局时长与人数适配是否成立；随机性是否会造成单方碾压',
    choice: '上手门槛与深度是否有取舍；有无「没人想玩」的角色 / 环节'
  },
  casual: {
    label: '休闲益智',
    numeric: '单关时长与难度阶梯是否平滑；有无卡关墙',
    choice: '解法的唯一性与容错是否合理（不能只有一种解，也不能随便乱点就过）'
  },
  generic: {
    label: '通用'
  }
}

/** 游戏类型 → 品类档案 key（未匹配 / 空值回落 generic） */
export function resolveGenreProfileKey(gameType: unknown): GenreProfileKey {
  if (typeof gameType === 'string' && gameType !== '') {
    const direct = GENRE_PROFILE_BY_TYPE[gameType]
    if (direct !== undefined) return direct
    /*
     * `meta.game_type` 是 combo，但旧文档 / 手改可能写入「写实军事 SLG」这类自由文本。
     * 做一次**包含匹配**（最长命中优先），让自由文本也能落到最贴近的档案上。
     */
    let best: GenreProfileKey | null = null
    let bestLen = 0
    for (const [type, profile] of Object.entries(GENRE_PROFILE_BY_TYPE)) {
      if (type.length > bestLen && gameType.includes(type)) {
        best = profile
        bestLen = type.length
      }
    }
    if (best !== null) return best
  }
  return 'generic'
}

/** 取该品类档案（含展示名 + key） */
export function genreReviewProfile(gameType: unknown): { key: GenreProfileKey; label: string; profile: GenreReviewProfile } {
  const key = resolveGenreProfileKey(gameType)
  return { key, label: GENRE_REVIEW_PROFILES[key].label, profile: GENRE_REVIEW_PROFILES[key] }
}

/** 某检查项在该品类下的追问（品类档案优先，否则回落通用探针） */
export function reviewProbeFor(checkKey: AdversarialCheckKey, profileKey: GenreProfileKey): string {
  const profile = GENRE_REVIEW_PROFILES[profileKey]
  if (checkKey === 'numeric' && profile.numeric !== undefined) return profile.numeric
  if (checkKey === 'choice' && profile.choice !== undefined) return profile.choice
  return ADVERSARIAL_CHECK_PROBES[checkKey]
}
