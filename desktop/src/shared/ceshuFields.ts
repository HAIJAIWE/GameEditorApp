import { CHAPTER_REQUIRED_FIELDS, type ChapterKey, type CeshuFieldDef } from './ceshuConstants'
import * as OPT from './ceshuOptionLabels'
import { FIELD_HINTS } from './ceshuFieldHints'
import { NEW_CHAPTER_FIELDS } from './ceshuChapterFields'
import { FIELD_SPLITS } from './ceshuFieldSplits'

/** 文档信息段 + 16 章表单字段描述（标签取自 Python chapter_forms/_base.py 与 _industrial.py） */

function f(key: string, label: string, kind: CeshuFieldDef['kind'], extra: Partial<CeshuFieldDef> = {}): CeshuFieldDef {
  return { key, label, kind, ...extra }
}

/** 字段的协作契约（解析后的结果，供 UI 标记与单字段生成提示词使用） */
export interface ResolvedFieldMeta {
  required: boolean
  aiDraftable: boolean
  aiHint: string
  reviewHint: string
}

/**
 * 解析字段契约：
 * - `required` 缺省从 `CHAPTER_REQUIRED_FIELDS` 派生（避免两处维护同一份必填信息）；
 * - `aiDraftable` 缺省 true（AI 可起草），人定字段显式设 false；
 * - `aiHint` / `reviewHint` 缺省空串。
 */
export function resolveFieldMeta(chapter: ChapterKey, field: CeshuFieldDef): ResolvedFieldMeta {
  const requiredKeys = CHAPTER_REQUIRED_FIELDS[chapter] ?? []
  return {
    required: field.required ?? requiredKeys.includes(field.key),
    aiDraftable: field.aiDraftable ?? true,
    aiHint: field.aiHint ?? '',
    reviewHint: field.reviewHint ?? ''
  }
}

/**
 * 字段定义（结构层）与协作契约（数据层）分离：
 * 下面这份 BASE 只描述「原有 16 章有哪些字段、什么类型」；契约（aiHint/reviewHint/aiDraftable）
 * 按章放在 `ceshuFieldHints/` 下，导出时在此合并——合并后 BASE 里显式写的
 * 契约仍然优先（meta/vision/story 三章早期写在定义里的契约不受影响）。
 * P2 的扩展设计 7 章在 `ceshuChapterFields/` 按章分文件存放（见该目录注释），
 * 同样在导出时合并——纯数据改动按章分文件，支持并行编辑。
 */
const BASE_CHAPTER_FIELDS: Partial<Record<ChapterKey, CeshuFieldDef[]>> = {
  meta: [
    f('game_name', '游戏名称', 'text', { aiDraftable: false, reviewHint: '确认名称是否最终确定' }),
    f('game_type', '游戏类型', 'combo', {
      aiDraftable: false,
      values: [
        'RPG',
        'MMORPG',
        'ARPG',
        '战棋',
        'SLG',
        'RTS',
        'MOBA',
        'FPS',
        'TPS',
        '格斗',
        '大逃杀',
        '非对称竞技',
        '卡牌',
        '塔防',
        '模拟经营',
        '开放世界',
        'Roguelike',
        '生存建造',
        '视觉小说',
        '放置',
        '派对',
        '休闲益智'
      ]
    }),
    f('platform', '平台', 'multiCombo', { values: ['PC', '移动端', '主机'], aiDraftable: false }),
    f('positioning', '一句话定位', 'text', {
      placeholder: '一句话描述你的游戏',
      aiHint: '一句话说清「给谁玩、玩什么、和谁不一样」',
      reviewHint: '是否一句话能讲清，且不与竞品同质'
    }),
    f('tags', '特色标签', 'stringList', {
      separator: 'comma',
      placeholder: '用逗号分隔，如: 剧情向,开放世界,多人联机',
      aiHint: '3-5 个具体标签，避免「好玩」「有趣」这类空泛词'
    }),
    f('status', '文档状态', 'combo', {
      aiDraftable: false,
      values: ['draft', 'in_progress', 'review', 'final'],
      optionLabels: OPT.DOC_STATUS_LABELS
    }),
    f('confidentiality', '保密级别', 'combo', {
      aiDraftable: false,
      values: ['internal', 'confidential', 'strictly_confidential', 'public'],
      optionLabels: OPT.CONFIDENTIALITY_LABELS
    }),
    f('gdd_scope', '策划档位', 'combo', {
      aiDraftable: false,
      values: ['lite', 'full'],
      optionLabels: OPT.GDD_SCOPE_LABELS
    }),
    f('version', '版本号', 'text', { aiDraftable: false, reviewHint: '与 version_label 区分：这是数据结构版本' }),
    f('date', '日期', 'text', { aiDraftable: false }),
  ],
  vision: [
    f('design_vision', '设计愿景', 'textarea', {
      placeholder: '阐述设计理念和愿景',
      aiHint: '先一句愿景（要做成什么样的游戏），再给三条支撑理由；不要写与竞品的对比',
      reviewHint: '是否具体、可判断，而不是口号；与「差异化优势」不重复'
    }),
    f('user_personas.primary', '主要用户', 'textarea', { aiHint: '年龄 / 使用场景 / 核心痛点，各一句' }),
    f('user_personas.secondary', '次要用户', 'textarea', { aiHint: '与主要用户的具体差异，不要复述' }),
    f('differentiation', '差异化优势', 'textarea', {
      aiHint: '与 2-3 个竞品的具体差异，给出可验证的例子；不要复述设计愿景',
      reviewHint: '是否说得出「玩家凭什么选你」；与「设计愿景」不重复'
    }),
    f('business_model', '商业模式', 'textarea', { aiDraftable: false }),
    f('competitive_analysis', '竞品对比要点', 'stringList'),
  ],
  // 原 worldview + characters 两章合并为 story（字段取并集）
  story: [
    f('architecture', '世界观架构', 'textarea', {
      aiHint: '一句话世界观 + 3-5 条设定要点（每条一句）',
      reviewHint: '设定之间是否自洽、有无互相矛盾'
    }),
    f('architecture_points', '世界观架构·要点', 'stringList', {
      placeholder: '每行一条设定要点',
      aiHint: '3-5 条设定要点，每条一句，便于逐条审阅'
    }),
    f('architecture_notes', '世界观架构·补充', 'textarea', { aiHint: '要点之外的补充说明，可留空' }),
    f('geography', '地理设定', 'textarea', { aiHint: '3-5 个关键地点，各一句，说清「在哪、有什么用」' }),
    f('main_plot', '主线剧情', 'textarea', { aiHint: '主线分 3 幕，每幕一句：起因 / 转折 / 结局' }),
    f('main_plot_points', '主线剧情·节拍', 'stringList', {
      placeholder: '每行一个情节点',
      aiHint: '3-5 个情节点，每行一个，按顺序'
    }),
    f('main_plot_notes', '主线剧情·补充', 'textarea', { aiHint: '节拍之外的补充说明，可留空' }),
    f('protagonist', '主角设定', 'textarea', { aiHint: '身份 / 目标 / 缺陷，各一句' }),
    f('main_npc_count', '主要 NPC 数量', 'number', { from: 0, to: 9999, aiDraftable: false }),
    f('npc_list', 'NPC 列表', 'pipeList', {
      columns: [
        { key: 'name', label: '名称' },
        { key: 'role', label: '角色' },
        { key: 'location', label: '位置' },
        { key: 'personality', label: '性格' },
        { key: 'quest_hook', label: '任务钩子' }
      ],
      aiHint: '每个 NPC 一行：名称/角色/位置/性格/任务钩子'
    }),
    f('antagonists', '反派设计', 'stringList', { placeholder: '每行一个' }),
    f('boss_design', 'Boss 设计', 'pipeList', {
      columns: [
        { key: 'name', label: '名称' },
        { key: 'mechanics', label: '机制' },
        { key: 'phases', label: '阶段' },
        { key: 'rewards', label: '奖励' }
      ]
    }),
    f('companion_system', '同伴系统', 'textarea'),
    f('character_arcs', '角色成长弧线', 'stringList', { placeholder: '每行一个' }),
    f('history_eras', '历史纪元', 'pipeList', { placeholder: '纪元|事件' }),
    f('factions', '阵营', 'pipeList', { placeholder: '名称|立场|现状' }),
    f('branch_endings', '分支结局', 'pipeList', { placeholder: '结局名|达成条件' }),
    f('character_network', '角色关系网', 'pipeList', { placeholder: '角色A-角色B|关系|张力' }),
    f('enemy_types', '敌人类型', 'pipeList', { placeholder: '类型|等级|行为|作用' }),
    f('voice_cast', '配音阵容', 'pipeList', { placeholder: '角色|语言|声线|范围' }),
    f('character_relationships', '角色关系', 'stringList'),
  ],
  gameplay: [
    f('core_loop', '核心循环', 'textarea', { placeholder: '如: 探索→战斗→获取→养成→更强探索' }),
    f('core_loop_points', '核心循环·步骤', 'stringList', {
      placeholder: '每行一个步骤',
      aiHint: '3-6 个步骤，按顺序每行一个'
    }),
    f('core_loop_notes', '核心循环·补充', 'textarea', { aiHint: '循环之外的补充说明，可留空' }),
    f('game_modes', '游戏模式', 'stringList', { placeholder: '每行一个' }),
    f('first_30_min', '新手体验(前30分钟)', 'textarea'),
    f('control_scheme', '操作方案', 'text'),
    f('win_lose_conditions', '胜负条件', 'textarea'),
    f('tutorial_design', '新手引导设计', 'textarea'),
  ],
  systems: [],
  numeric: [
    f('core_formulas', '核心公式', 'textarea', {
      placeholder: '核心数值公式，每行一个',
      aiHint: '每行一个核心数值公式；伤害公式属战斗章，此处不要重复',
      reviewHint: '公式是否自洽；是否与战斗章「伤害公式」重复'
    }),
    f('core_formulas_points', '核心公式·列表', 'stringList', {
      placeholder: '每行一个公式',
      aiHint: '每行一个公式，格式统一'
    }),
    f('core_formulas_notes', '核心公式·补充', 'textarea', { aiHint: '公式之外的说明，可留空' }),
    f('balance_principles', '平衡原则', 'textarea'),
    f('economic_model', '经济模型', 'textarea'),
    f('growth_curves', '成长曲线', 'pipeList', { placeholder: '对象|曲线形状|参数' }),
    f('drop_tables', '掉落公式', 'pipeList', { placeholder: '物品|来源|公式' }),
  ],
  art: [
    f('art_style', '美术风格', 'textarea'),
    f('color_system', '色彩体系', 'textarea'),
    f('typography', '字体排版', 'textarea'),
    f('vfx', '特效风格', 'textarea'),
    f('character_design', '角色设计要点', 'stringList'),
    f('environment_design', '场景设计要点', 'stringList'),
    f('ui_design_language', 'UI 设计语言', 'textarea'),
    f('animation', '动画规格', 'stringList'),
    f('multi_resolution', '多分辨率适配', 'textarea'),
  ],
  tech: [
    f('engine', '引擎/框架', 'combo', {
      values: ['Unity', 'Unreal Engine', 'Godot', 'Cocos2d', 'PyGame', '自定义引擎', '其他'],
      optionLabels: OPT.ENGINE_LABELS
    }),
    f('core_architecture', '核心架构', 'textarea'),
    f('milestones', '开发里程碑', 'pipeList', { columns: [{ key: 'phase', label: '阶段' }] }),
    f('team_structure', '团队分工', 'textarea'),
    f('third_party_deps', '第三方依赖', 'pipeList', { placeholder: '名称|用途|授权' }),
    f('performance_targets', '性能目标', 'textarea'),
    f('qa_plan', 'QA 计划', 'textarea'),
  ],
  resources: [
    f('budget.summary', '预算概算', 'text'),
    f('risk_matrix', '风险评估', 'stringList', { placeholder: '每行一条风险' }),
    f('ip', '知识产权', 'text'),
    f('art_assets', '美术资源清单', 'pipeList', { placeholder: '类别|数量|规格' }),
    f('audio_assets', '音频资源清单', 'pipeList', { placeholder: '类别|数量|说明' }),
    f('localization', '本地化资源', 'pipeList', { placeholder: '语言|阶段|文本量' }),
    f('outsourcing', '外包计划', 'pipeList', { placeholder: '事项|方式|预算' }),
    f('contingency_plan', '应急预案', 'textarea'),
    f('appendix', '附录', 'textarea'),
  ],
  market_analysis: [
    f('target_market', '目标市场', 'textarea'),
    f('market_size', '市场容量', 'textarea'),
    f('user_demographics', '用户画像', 'textarea'),
    f('competitors', '竞品分析', 'pipeList', {
      columns: [
        { key: 'name', label: '名称' },
        { key: 'type', label: '类型' },
        { key: 'strengths', label: '优势' },
        { key: 'weaknesses', label: '劣势' },
        { key: 'market_share', label: '市场份额' }
      ]
    }),
    f('market_positioning', '市场定位', 'textarea'),
    f('entry_barriers', '进入壁垒', 'textarea'),
    f('market_trends', '市场趋势', 'stringList', { placeholder: '每行一个' })
  ],
  combat: [
    f('combat_mode', '战斗模式', 'combo', {
      values: ['turn_based', 'realtime', 'semi_realtime', 'auto_battle', 'atb', 'ctb', 'srpg_grid'],
      optionLabels: OPT.COMBAT_MODE_LABELS
    }),
    f('damage_formula', '伤害公式', 'textarea', {
      aiHint: '伤害计算公式：写清攻击/防御/暴击等变量的关系',
      reviewHint: '公式是否可计算；数值章「核心公式」是否重复本条'
    }),
    f('damage_formula_points', '伤害公式·要点', 'stringList', {
      placeholder: '每行一条公式或步骤',
      aiHint: '每条公式或步骤一行，便于机器解析'
    }),
    f('damage_formula_notes', '伤害公式·补充', 'textarea', { aiHint: '公式之外的推导或说明，可留空' }),
    f('skill_system', '技能系统', 'textarea'),
    f('buff_debuff', 'Buff/Debuff', 'textarea'),
    f('element_system', '元素系统', 'textarea'),
    f('combat_pace', '战斗节奏', 'combo', {
      values: ['slow', 'medium', 'fast', 'variable'],
      optionLabels: OPT.COMBAT_PACE_LABELS
    }),
    f('team_formation', '队伍编排', 'textarea'),
    f('pvp_design', 'PVP 设计', 'textarea'),
    f('pve_design', 'PVE 设计', 'textarea'),
    f('boss_mechanics', 'Boss 战机制', 'textarea'),
    f('balance_strategy', '平衡策略', 'textarea'),
    f('combat_progression', '战斗成长', 'textarea'),
  ],
  economy: [
    f('currency_types', '货币类型', 'pipeList', {
      columns: [
        { key: 'name', label: '名称' },
        { key: 'source', label: '产出' },
        { key: 'sink', label: '回收' },
        { key: 'exchange_rate', label: '兑换率' }
      ]
    }),
    f('source_sink', '产出与回收', 'textarea'),
    f('drop_tables', '掉落表', 'stringList', { placeholder: '每行一个' }),
    f('production_chain', '生产链', 'textarea'),
    f('market_design', '交易市场', 'textarea'),
    f('inflation_control', '通胀控制', 'textarea'),
    f('economic_goals', '经济目标', 'textarea'),
    f('metrics_tracking', '经济监控指标', 'pipeList', { placeholder: '指标|口径|告警阈值' }),
    f('seasonal_adjustment', '赛季调整', 'textarea'),
  ],
  monetization: [
    f('payment_model', '付费模式', 'combo', {
      values: ['f2p', 'p2p', 'b2p', 'subscription', 'f2p_p2w', 'f2p_cosmetic', 'buy_to_play'],
      optionLabels: OPT.PAYMENT_MODEL_LABELS
    }),
    f('pricing_tiers', '定价档位', 'stringList', { placeholder: '每行一个，如 6/30/68/128/328/648' }),
    f('iap_design', '内购设计', 'pipeList', {
      columns: [
        { key: 'item', label: '物品' },
        { key: 'price', label: '价格' },
        { key: 'value', label: '价值' },
        { key: 'target', label: '目标用户' }
      ]
    }),
    f('ad_strategy', '广告策略', 'textarea'),
    f('subscription_design', '订阅制', 'textarea'),
    f('season_pass', '赛季通行证', 'textarea'),
    f('vip_system', 'VIP 系统', 'textarea'),
    f('whale_strategy', '大 R 策略', 'textarea'),
    f('f2p_experience', '免费玩家体验', 'textarea'),
    f('arpu_target', 'ARPU 目标', 'textarea'),
    f('limited_offers', '限时优惠', 'pipeList', { placeholder: '名称|条件|有效期' }),
  ],
  mvp: [
    f('mvp_scope', 'MVP 范围', 'textarea'),
    f('mvp_timeline', 'MVP 时间线', 'textarea'),
    f('core_features', '核心特性', 'stringList', { placeholder: '每行一个' }),
    f('cut_features', '暂缓特性', 'stringList', { placeholder: '每行一个' }),
    f('milestones', '里程碑', 'pipeList', {
      columns: [
        { key: 'name', label: '名称' },
        { key: 'date', label: '日期' },
        { key: 'deliverables', label: '交付物' },
        { key: 'acceptance', label: '验收标准' }
      ]
    }),
    f('success_criteria', '成功标准', 'textarea'),
    f('team_size', '团队规模', 'number', { from: 0, to: 999 }),
    f('budget_estimate', '预算估算', 'textarea'),
    f('playtest_plan', '试玩测试', 'textarea'),
    f('prototype_features', '原型特性', 'pipeList', { placeholder: '特性|周期' }),
    f('risk_assessment', '风险评估', 'stringList'),
    f('prototype_plan', '原型计划', 'textarea'),
  ],
  risk_handling: [
    f('risk_matrix', '风险矩阵', 'pipeList', {
      columns: [
        { key: 'risk', label: '风险' },
        { key: 'probability', label: '概率' },
        { key: 'impact', label: '影响' },
        { key: 'mitigation', label: '应对' },
        { key: 'owner', label: '负责人' }
      ]
    }),
    f('contingency_plan', '应急预案', 'textarea'),
    f('technical_risks', '技术风险', 'stringList', { placeholder: '每行一个' }),
    f('market_risks', '市场风险', 'stringList', { placeholder: '每行一个' }),
    f('team_risks', '团队风险', 'stringList', { placeholder: '每行一个' }),
    f('legal_risks', '法律风险', 'stringList', { placeholder: '每行一个' }),
    f('schedule_risks', '进度风险', 'stringList', { placeholder: '每行一个' }),
    f('risk_monitoring', '风险监控', 'textarea'),
    f('crisis_management', '危机管理', 'textarea'),
    f('escalation_path', '升级路径', 'pipeList', { placeholder: '层级|决策人|时限' }),
  ],
  audio: [
    f('music_style', '音乐风格', 'textarea'),
    f('sfx_count', '音效数量估算', 'number', { from: 0, to: 99999 }),
    f('soundtrack_list', '配乐清单', 'pipeList', {
      columns: [
        { key: 'scene', label: '场景' },
        { key: 'duration', label: '时长' },
        { key: 'mood', label: '情绪' },
        { key: 'composer', label: '作曲者' }
      ]
    }),
    f('sfx_list', '音效清单', 'pipeList', {
      columns: [
        { key: 'category', label: '类别' },
        { key: 'count', label: '数量' },
        { key: 'description', label: '描述' }
      ]
    }),
    f('voice_acting', '配音设计', 'textarea'),
    f('audio_engine', '音频引擎', 'combo', {
      values: ['FMOD', 'Wwise', 'CRI ADX', 'Unity Audio', 'Unreal Audio', '自研'],
      optionLabels: OPT.AUDIO_ENGINE_LABELS
    }),
    f('dynamic_audio', '动态音频', 'textarea'),
    f('audio_localization', '音频本地化', 'textarea'),
    f('audio_budget', '音频预算', 'textarea'),
    f('audio_milestones', '音频里程碑', 'pipeList', { placeholder: '时间|交付物' }),
  ],
  accessibility: [
    f('language_list', '支持语言', 'stringList', { placeholder: '每行一个，如: 简体中文、English' }),
    f('localization_strategy', '本地化策略', 'textarea'),
    f('cultural_adaptation', '文化适配', 'textarea'),
    f('accessibility_features', '无障碍特性', 'stringList', { placeholder: '每行一个，如: 色盲模式、字幕' }),
    f('subtitle_design', '字幕设计', 'textarea'),
    f('color_blind_support', '色盲支持', 'textarea'),
    f('motor_accessibility', '运动无障碍', 'textarea'),
    f('cognitive_accessibility', '认知无障碍', 'textarea'),
    f('rating_certification', '分级认证', 'stringList', { placeholder: '每行一个，如 ESRB/PEGI' }),
    f('compliance_notes', '合规备注', 'textarea')
  ]
}

/**
 * 应用结构拆分：为清单里的 textarea 字段插入配套的「要点列表 / 补充」字段（位置在本体之后）。
 *
 * 三条防线都在这里收敛，配合 `ceshuFieldSplits.test.ts` 守卫测试：
 * 1. 只拆非必填字段（必填拆分会改变校验语义）；
 * 2. 已手工拆过的不重复插（`xxx_points` 已存在即跳过，如 damage_formula）；
 * 3. 配套字段带通用契约兜底——章特定的分工契约由 hints 层覆盖。
 */
function applySplits(chapter: ChapterKey, fields: CeshuFieldDef[]): CeshuFieldDef[] {
  const splits = FIELD_SPLITS[chapter]
  if (splits === undefined || splits.length === 0) return fields
  const required = new Set(CHAPTER_REQUIRED_FIELDS[chapter])
  const result: CeshuFieldDef[] = []
  for (const field of fields) {
    result.push(field)
    if (!splits.includes(field.key)) continue
    if (field.kind !== 'textarea' || required.has(field.key)) continue
    if (fields.some((item) => item.key === `${field.key}_points`)) continue
    result.push(
      {
        key: `${field.key}_points`,
        label: `${field.label}·要点`,
        kind: 'stringList',
        placeholder: '每行一条要点',
        aiHint: '3-6 条，每行一条可核对的要点',
        reviewHint: '条目是否具体可核对；与本体的概述是否重复'
      },
      { key: `${field.key}_notes`, label: `${field.label}·补充`, kind: 'textarea', aiHint: '要点之外的补充说明，可留空' }
    )
  }
  return result
}

/** 原始字段表 = 原有 16 章 + P2 扩展设计 7 章（后者按章分文件，见 ceshuChapterFields/） */
const RAW_CHAPTER_FIELDS = { ...BASE_CHAPTER_FIELDS, ...NEW_CHAPTER_FIELDS } as Record<ChapterKey, CeshuFieldDef[]>

/** 合并后的字段表：定义 → 结构拆分 → 按章契约（hints 缺省的章/字段原样返回） */
export const CESHU_CHAPTER_FIELDS: Record<ChapterKey, CeshuFieldDef[]> = Object.fromEntries(
  (Object.keys(RAW_CHAPTER_FIELDS) as ChapterKey[]).map((chapter) => {
    const hints = FIELD_HINTS[chapter]
    const fields = applySplits(chapter, RAW_CHAPTER_FIELDS[chapter])
    return [chapter, hints === undefined ? fields : fields.map((field) => ({ ...field, ...hints[field.key] }))]
  })
) as Record<ChapterKey, CeshuFieldDef[]>