/**
 * 检查清单：分类常量、状态常量、类型、50 项条目定义、自动检查函数与注册表、聚合查询。
 * 评估逻辑（runChecklist）与 Markdown 报告（buildChecklistMarkdown）见同目录 ceshuChecklist.ts。
 * 本文件为「定义 + 数据」层；ceshuChecklist.ts 为「编排」层，二者单向依赖（后者 import 前者）。
 */
import { checkSystemDependencies, type CeshuDocument, type ChapterKey } from './ceshuConstants'
import { isPlainObject } from './ceshuModel'

/**
 * GDD 完备性检查清单（自 Python core/ceshu/ceshu_checklist.py 匹平迁移）。
 * 50 项 / 6 大类：项目基础 8 · 游戏设计 12 · 技术方案 8 · 商业与市场 8 · 团队与流程 6 · 风险与合规 8。
 * 每项要么绑定自动检查函数（对照章节字段），要么标记为人工核查；runChecklist 汇总就绪度评分与制作就绪判定。
 */

/* ---- 6 大类别 ---- */

export const CATEGORY_PROJECT = '项目基础'
export const CATEGORY_DESIGN = '游戏设计'
export const CATEGORY_TECH = '技术方案'
export const CATEGORY_MARKET = '商业与市场'
export const CATEGORY_TEAM = '团队与流程'
export const CATEGORY_RISK = '风险与合规'

export const ALL_CATEGORIES: readonly string[] = [
  CATEGORY_PROJECT,
  CATEGORY_DESIGN,
  CATEGORY_TECH,
  CATEGORY_MARKET,
  CATEGORY_TEAM,
  CATEGORY_RISK
]

/* ---- 状态 ---- */

export const STATUS_PASS = 'pass'
export const STATUS_FAIL = 'fail'
export const STATUS_WARNING = 'warning'
export const STATUS_MANUAL = 'manual'
export const STATUS_NA = 'not_applicable'

export type ChecklistStatus =
  | typeof STATUS_PASS
  | typeof STATUS_FAIL
  | typeof STATUS_WARNING
  | typeof STATUS_MANUAL
  | typeof STATUS_NA

/** 状态展示元信息（图标/颜色/中文标签，与 Python checklist_dialog._STATUS_META 一致） */
export const STATUS_META: Record<ChecklistStatus, { icon: string; color: string; label: string }> = {
  [STATUS_PASS]: { icon: '✅', color: '#22C55E', label: '通过' },
  [STATUS_FAIL]: { icon: '❌', color: '#EF4444', label: '失败' },
  [STATUS_WARNING]: { icon: '⚠️', color: '#F59E0B', label: '警告' },
  [STATUS_MANUAL]: { icon: '👤', color: '#6B7280', label: '人工核查' },
  [STATUS_NA]: { icon: '➖', color: '#9CA3AF', label: '不适用' }
}

/* ---- 数据结构 ---- */

export interface ChecklistItem {
  id: string
  category: string
  title: string
  description: string
  /** true = 必须通过，false = 建议 */
  required: boolean
  /** 自动检查函数名，null = 人工核查 */
  auto_check: string | null
  /** 关联的章节 */
  chapter_key: ChapterKey | null
}

export interface ChecklistResult {
  item_id: string
  status: ChecklistStatus
  message: string
  auto_checked: boolean
}

export interface ChecklistReport {
  results: ChecklistResult[]
  total_items: number
  passed: number
  failed: number
  warnings: number
  manual: number
  not_applicable: number
  /** 0~100，通过项 /（通过 + 失败 + 警告） */
  readiness_score: number
  /** 所有必需项均通过 */
  is_production_ready: boolean
}

/* ---- 50 项检查清单定义 ---- */

function projectItems(): ChecklistItem[] {
  return [
    {
      id: 'PB-01',
      category: CATEGORY_PROJECT,
      title: '游戏名称已确定',
      description: '游戏名称是项目对外标识，必须明确',
      required: true,
      auto_check: 'check_meta_game_name',
      chapter_key: 'meta'
    },
    {
      id: 'PB-02',
      category: CATEGORY_PROJECT,
      title: '游戏类型已确定',
      description: '明确游戏类型（RPG/SLG/FPS/MOBA 等）以指导系统设计',
      required: true,
      auto_check: 'check_meta_game_type',
      chapter_key: 'meta'
    },
    {
      id: 'PB-03',
      category: CATEGORY_PROJECT,
      title: '目标平台已确定',
      description: '明确目标发布平台（PC/移动/主机/Web）',
      required: true,
      auto_check: 'check_meta_platform',
      chapter_key: 'meta'
    },
    {
      id: 'PB-04',
      category: CATEGORY_PROJECT,
      title: '项目定位清晰',
      description: '项目定位说明（受众/差异化/核心卖点）',
      required: true,
      auto_check: 'check_meta_positioning',
      chapter_key: 'meta'
    },
    {
      id: 'PB-05',
      category: CATEGORY_PROJECT,
      title: '设计愿景完整',
      description: '设计愿景阐述项目长期目标与设计哲学',
      required: true,
      auto_check: 'check_vision_design_vision',
      chapter_key: 'vision'
    },
    {
      id: 'PB-06',
      category: CATEGORY_PROJECT,
      title: '差异化亮点明确',
      description: '差异化亮点说明与竞品的核心区别',
      required: true,
      auto_check: 'check_vision_differentiation',
      chapter_key: 'vision'
    },
    {
      id: 'PB-07',
      category: CATEGORY_PROJECT,
      title: '核心循环已定义',
      description: '核心玩法循环（行为→反馈→奖励→目标）',
      required: true,
      auto_check: 'check_gameplay_core_loop',
      chapter_key: 'gameplay'
    },
    {
      id: 'PB-08',
      category: CATEGORY_PROJECT,
      title: '项目标签已设置',
      description: '项目标签便于检索与分类',
      required: false,
      auto_check: 'check_meta_tags',
      chapter_key: 'meta'
    }
  ]
}

function designItems(): ChecklistItem[] {
  return [
    {
      id: 'GD-01',
      category: CATEGORY_DESIGN,
      title: '世界观已建立',
      description: '世界观架构、主线剧情、势力格局等设定完整',
      required: true,
      auto_check: 'check_worldview',
      chapter_key: 'story'
    },
    {
      id: 'GD-02',
      category: CATEGORY_DESIGN,
      title: '主要角色已定义',
      description: '主角与主要 NPC 设定（背景/性格/外观/能力）',
      required: true,
      auto_check: 'check_characters_main_npc',
      chapter_key: 'story'
    },
    {
      id: 'GD-03',
      category: CATEGORY_DESIGN,
      title: '战斗系统已设计',
      description: '战斗模式（回合/即时/半即时）与伤害公式',
      required: true,
      auto_check: 'check_combat_mode',
      chapter_key: 'combat'
    },
    {
      id: 'GD-04',
      category: CATEGORY_DESIGN,
      title: '经济系统已设计',
      description: '货币类型、产出回收机制、通胀控制',
      required: true,
      auto_check: 'check_economy',
      chapter_key: 'economy'
    },
    {
      id: 'GD-05',
      category: CATEGORY_DESIGN,
      title: '核心系统已启用',
      description: '至少启用 3 个核心游戏系统',
      required: true,
      auto_check: 'check_systems_enabled_count',
      chapter_key: 'systems'
    },
    {
      id: 'GD-06',
      category: CATEGORY_DESIGN,
      title: '系统依赖完整',
      description: '已启用系统的依赖系统均应启用',
      required: true,
      auto_check: 'check_systems_dependencies',
      chapter_key: 'systems'
    },
    {
      id: 'GD-07',
      category: CATEGORY_DESIGN,
      title: '数值体系已规划',
      description: '核心数值公式与平衡原则',
      required: true,
      auto_check: 'check_numeric',
      chapter_key: 'numeric'
    },
    {
      id: 'GD-08',
      category: CATEGORY_DESIGN,
      title: '美术风格已确定',
      description: '美术风格与色彩系统已确定',
      required: true,
      auto_check: 'check_art_style',
      chapter_key: 'art'
    },
    {
      id: 'GD-09',
      category: CATEGORY_DESIGN,
      title: '音频方案已确定',
      description: '音乐风格与音效方案已确定',
      required: true,
      auto_check: 'check_audio',
      chapter_key: 'audio'
    },
    {
      id: 'GD-10',
      category: CATEGORY_DESIGN,
      title: '可访问性已考虑',
      description: '无障碍特性与多语言支持',
      required: false,
      auto_check: 'check_accessibility',
      chapter_key: 'accessibility'
    },
    {
      id: 'GD-11',
      category: CATEGORY_DESIGN,
      title: '操作方案已设计',
      description: '操作方式（键鼠/手柄/触屏）与键位映射',
      required: false,
      auto_check: null,
      chapter_key: 'gameplay'
    },
    {
      id: 'GD-12',
      category: CATEGORY_DESIGN,
      title: '教学流程已设计',
      description: '新手教学流程与首次体验设计',
      required: false,
      auto_check: null,
      chapter_key: 'gameplay'
    }
  ]
}

function techItems(): ChecklistItem[] {
  return [
    {
      id: 'TC-01',
      category: CATEGORY_TECH,
      title: '引擎已确定',
      description: '游戏引擎选型（Unity/Unreal/自研等）',
      required: true,
      auto_check: 'check_tech_engine',
      chapter_key: 'tech'
    },
    {
      id: 'TC-02',
      category: CATEGORY_TECH,
      title: '核心技术栈已确定',
      description: '核心架构与第三方依赖',
      required: true,
      auto_check: 'check_tech_stack',
      chapter_key: 'tech'
    },
    {
      id: 'TC-03',
      category: CATEGORY_TECH,
      title: '性能目标已设定',
      description: '性能目标（帧率/内存/加载时间等）',
      required: true,
      auto_check: 'check_tech_performance',
      chapter_key: 'tech'
    },
    {
      id: 'TC-04',
      category: CATEGORY_TECH,
      title: 'MVP 范围已定义',
      description: 'MVP 范围（最小可行产品功能集）',
      required: true,
      auto_check: 'check_mvp_scope',
      chapter_key: 'mvp'
    },
    {
      id: 'TC-05',
      category: CATEGORY_TECH,
      title: 'MVP 时间线已确定',
      description: 'MVP 开发时间线（起止/关键节点）',
      required: true,
      auto_check: 'check_mvp_timeline',
      chapter_key: 'mvp'
    },
    {
      id: 'TC-06',
      category: CATEGORY_TECH,
      title: '里程碑已规划',
      description: '项目里程碑列表（名称/日期/交付物）',
      required: true,
      auto_check: 'check_mvp_milestones',
      chapter_key: 'mvp'
    },
    {
      id: 'TC-07',
      category: CATEGORY_TECH,
      title: '成功标准已定义',
      description: 'MVP 成功标准（留存/活跃/付费等指标）',
      required: true,
      auto_check: 'check_mvp_success_criteria',
      chapter_key: 'mvp'
    },
    {
      id: 'TC-08',
      category: CATEGORY_TECH,
      title: '技术风险评估',
      description: '技术风险识别与应对方案（人工核查）',
      required: false,
      auto_check: null,
      chapter_key: 'tech'
    }
  ]
}

function marketItems(): ChecklistItem[] {
  return [
    {
      id: 'MK-01',
      category: CATEGORY_MARKET,
      title: '目标市场已分析',
      description: '目标市场（地域/平台/用户画像）',
      required: true,
      auto_check: 'check_market_target',
      chapter_key: 'market_analysis'
    },
    {
      id: 'MK-02',
      category: CATEGORY_MARKET,
      title: '竞品已分析',
      description: '竞品列表与优劣势分析',
      required: true,
      auto_check: 'check_market_competitors',
      chapter_key: 'market_analysis'
    },
    {
      id: 'MK-03',
      category: CATEGORY_MARKET,
      title: '市场规模已评估',
      description: '市场容量与增长趋势',
      required: true,
      auto_check: 'check_market_size',
      chapter_key: 'market_analysis'
    },
    {
      id: 'MK-04',
      category: CATEGORY_MARKET,
      title: '商业模式已确定',
      description: '付费模式（f2p/p2p/b2p/订阅）',
      required: true,
      auto_check: 'check_monetization_model',
      chapter_key: 'monetization'
    },
    {
      id: 'MK-05',
      category: CATEGORY_MARKET,
      title: '定价策略已制定',
      description: '定价档位与商品组合',
      required: true,
      auto_check: 'check_monetization_pricing',
      chapter_key: 'monetization'
    },
    {
      id: 'MK-06',
      category: CATEGORY_MARKET,
      title: '内购设计已规划',
      description: '内购商品设计（商品/价格/价值/目标用户）',
      required: false,
      auto_check: 'check_monetization_iap',
      chapter_key: 'monetization'
    },
    {
      id: 'MK-07',
      category: CATEGORY_MARKET,
      title: 'ARPU 目标已设定',
      description: 'ARPU 目标值与营收预测',
      required: false,
      auto_check: 'check_monetization_arpu',
      chapter_key: 'monetization'
    },
    {
      id: 'MK-08',
      category: CATEGORY_MARKET,
      title: 'KPI 预测已制定',
      description: 'KPI 预测（DAU/MAU/留存/LTV 等）',
      required: true,
      auto_check: 'check_market_kpi',
      chapter_key: 'market_analysis'
    }
  ]
}

function teamItems(): ChecklistItem[] {
  return [
    {
      id: 'TM-01',
      category: CATEGORY_TEAM,
      title: '团队规模已确定',
      description: '开发团队规模与角色配置（人工核查）',
      required: false,
      auto_check: null,
      chapter_key: 'mvp'
    },
    {
      id: 'TM-02',
      category: CATEGORY_TEAM,
      title: '角色分工已明确',
      description: '团队成员角色与职责分工（人工核查）',
      required: false,
      auto_check: null,
      chapter_key: 'tech'
    },
    {
      id: 'TM-03',
      category: CATEGORY_TEAM,
      title: '开发流程已确定',
      description: '开发流程（敏捷/瀑布/Scrum/Kanban）（人工核查）',
      required: false,
      auto_check: null,
      chapter_key: 'tech'
    },
    {
      id: 'TM-04',
      category: CATEGORY_TEAM,
      title: '沟通工具已选定',
      description: '团队沟通工具（Slack/钉钉/飞书等）（人工核查）',
      required: false,
      auto_check: null,
      chapter_key: 'tech'
    },
    {
      id: 'TM-05',
      category: CATEGORY_TEAM,
      title: '版本控制已建立',
      description: '版本控制规范（Git/SVN/P4）（人工核查）',
      required: false,
      auto_check: null,
      chapter_key: 'tech'
    },
    {
      id: 'TM-06',
      category: CATEGORY_TEAM,
      title: '文档规范已建立',
      description: '文档命名/存储/评审规范（人工核查）',
      required: false,
      auto_check: null,
      chapter_key: 'tech'
    }
  ]
}

function riskItems(): ChecklistItem[] {
  return [
    {
      id: 'RS-01',
      category: CATEGORY_RISK,
      title: '风险矩阵已建立',
      description: '风险矩阵（风险/概率/影响/应对/负责人）',
      required: true,
      auto_check: 'check_risk_matrix',
      chapter_key: 'risk_handling'
    },
    {
      id: 'RS-02',
      category: CATEGORY_RISK,
      title: '应对策略已制定',
      description: '应急预案与应对策略',
      required: true,
      auto_check: 'check_risk_mitigation',
      chapter_key: 'risk_handling'
    },
    {
      id: 'RS-03',
      category: CATEGORY_RISK,
      title: '资源需求已评估',
      description: '美术/音频/本地化等资源规划与预算',
      required: true,
      auto_check: 'check_resources',
      chapter_key: 'resources'
    },
    {
      id: 'RS-04',
      category: CATEGORY_RISK,
      title: '本地化计划已制定',
      description: '本地化策略与支持语言列表',
      required: false,
      auto_check: 'check_accessibility_localization',
      chapter_key: 'accessibility'
    },
    {
      id: 'RS-05',
      category: CATEGORY_RISK,
      title: '版权合规已检查',
      description: '美术/音频/代码版权合规检查（人工核查）',
      required: false,
      auto_check: null,
      chapter_key: 'resources'
    },
    {
      id: 'RS-06',
      category: CATEGORY_RISK,
      title: '隐私政策已准备',
      description: '用户隐私政策与数据处理说明（人工核查）',
      required: false,
      auto_check: null,
      chapter_key: 'accessibility'
    },
    {
      id: 'RS-07',
      category: CATEGORY_RISK,
      title: '年龄分级已确认',
      description: '年龄分级认证（ESRB/PEGI/CERO/GRAC）（人工核查）',
      required: false,
      auto_check: null,
      chapter_key: 'accessibility'
    },
    {
      id: 'RS-08',
      category: CATEGORY_RISK,
      title: '数据合规已检查',
      description: '数据合规（GDPR/CCPA/个保法等）（人工核查）',
      required: false,
      auto_check: null,
      chapter_key: 'accessibility'
    }
  ]
}

let cachedItems: ChecklistItem[] | null = null

/** 全部检查项定义（50 项，带缓存） */
export function getChecklistItems(): ChecklistItem[] {
  if (cachedItems === null) {
    cachedItems = [...projectItems(), ...designItems(), ...techItems(), ...marketItems(), ...teamItems(), ...riskItems()]
  }
  return cachedItems
}

export function getChecklistItemsByCategory(category: string): ChecklistItem[] {
  return getChecklistItems().filter((item) => item.category === category)
}

/* ---- 自动检查辅助 ---- */

/** Python _has_value：字符串去空白后非空 / 容器非空 / 数字非零 */
function hasValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (isPlainObject(value)) return Object.keys(value).length > 0
  if (typeof value === 'number') return value !== 0
  return Boolean(value)
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

function readCount(value: unknown): number {
  return typeof value === 'number' ? value : 0
}

/** 章节字段读取（章节缺失或非对象时返回 undefined） */
function field(doc: CeshuDocument, chapter: ChapterKey, key: string): unknown {
  const data = doc[chapter]
  return isPlainObject(data) ? data[key] : undefined
}

function readTexts(value: unknown): string[] {
  return Array.isArray(value) ? value.map((item) => String(item)) : []
}

/** Python len() 语义：字符串/列表/字典取长度，其余标量按 1 计 */
function readLength(value: unknown): number {
  if (typeof value === 'string') return value.length
  if (Array.isArray(value)) return value.length
  if (isPlainObject(value)) return Object.keys(value).length
  return 1
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}...`
}

type AutoCheckResult = [ChecklistStatus, string]

/* ---- 自动检查函数（逐项对照 Python ceshu_checklist） ---- */

function checkMetaGameName(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'meta', 'game_name')
  return hasValue(value) ? [STATUS_PASS, `游戏名称: ${String(value)}`] : [STATUS_FAIL, '游戏名称未设置']
}

function checkMetaGameType(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'meta', 'game_type')
  return hasValue(value) ? [STATUS_PASS, `游戏类型: ${String(value)}`] : [STATUS_FAIL, '游戏类型未设置']
}

function checkMetaPlatform(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'meta', 'platform')
  if (!hasValue(value)) return [STATUS_FAIL, '目标平台未设置']
  return [STATUS_PASS, `目标平台: ${readTexts(value).join(', ')}`]
}

function checkMetaPositioning(doc: CeshuDocument): AutoCheckResult {
  const value = readText(field(doc, 'meta', 'positioning'))
  if (!hasValue(value)) return [STATUS_FAIL, '项目定位未填写']
  return [STATUS_PASS, `项目定位: ${truncate(value, 60)}`]
}

function checkMetaTags(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'meta', 'tags')
  if (hasValue(value)) return [STATUS_PASS, `项目标签: ${readTexts(value).join(', ')}`]
  return [STATUS_WARNING, '项目标签未设置（建议补充以便检索）']
}

function checkVisionDesignVision(doc: CeshuDocument): AutoCheckResult {
  const value = readText(field(doc, 'vision', 'design_vision'))
  if (!hasValue(value)) return [STATUS_FAIL, '设计愿景未填写']
  if (value.length < 30) return [STATUS_WARNING, `设计愿景偏短（${value.length} 字），建议扩充至 200 字以上`]
  return [STATUS_PASS, `设计愿景已填写（${value.length} 字）`]
}

function checkVisionDifferentiation(doc: CeshuDocument): AutoCheckResult {
  const value = readText(field(doc, 'vision', 'differentiation'))
  if (!hasValue(value)) return [STATUS_FAIL, '差异化亮点未填写']
  if (value.length < 15) return [STATUS_WARNING, '差异化亮点偏短，建议细化核心卖点']
  return [STATUS_PASS, `差异化亮点: ${truncate(value, 40)}`]
}

function checkGameplayCoreLoop(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'gameplay', 'core_loop')
  return hasValue(value) ? [STATUS_PASS, '核心循环已定义'] : [STATUS_FAIL, '核心循环未定义（玩家行为→反馈→奖励→目标）']
}

function checkWorldview(doc: CeshuDocument): AutoCheckResult {
  const architecture = field(doc, 'story', 'architecture')
  const plot = field(doc, 'story', 'main_plot')
  if (!hasValue(architecture) && !hasValue(plot)) return [STATUS_FAIL, '世界观架构与主线剧情均未填写']
  if (!hasValue(architecture)) return [STATUS_WARNING, '世界观架构未填写']
  if (!hasValue(plot)) return [STATUS_WARNING, '主线剧情未填写']
  return [STATUS_PASS, '世界观架构与主线剧情已建立']
}

function checkCharactersMainNpc(doc: CeshuDocument): AutoCheckResult {
  const protagonist = field(doc, 'story', 'protagonist')
  const npcCount = readCount(field(doc, 'story', 'main_npc_count'))
  const npcList = field(doc, 'story', 'npc_list')
  if (!hasValue(protagonist)) return [STATUS_FAIL, '主角设定未填写']
  if (!hasValue(npcCount) || npcCount <= 0) return [STATUS_WARNING, '主要 NPC 数量未设定']
  if (!hasValue(npcList)) return [STATUS_WARNING, 'NPC 列表为空']
  return [STATUS_PASS, `主角已定义，NPC 数量=${npcCount}`]
}

function checkCombatMode(doc: CeshuDocument): AutoCheckResult {
  const mode = readText(field(doc, 'combat', 'combat_mode'))
  const formula = field(doc, 'combat', 'damage_formula')
  if (!hasValue(mode)) return [STATUS_FAIL, '战斗模式未设置（回合/即时/半即时）']
  if (!hasValue(formula)) return [STATUS_WARNING, '伤害公式未设计']
  return [STATUS_PASS, `战斗模式: ${mode}`]
}

function checkEconomy(doc: CeshuDocument): AutoCheckResult {
  const currencies = field(doc, 'economy', 'currency_types')
  const sourceSink = field(doc, 'economy', 'source_sink')
  if (!hasValue(currencies) && !hasValue(sourceSink)) return [STATUS_FAIL, '货币类型与产出回收机制均未填写']
  if (!hasValue(currencies)) return [STATUS_WARNING, '货币类型未填写']
  const count = Array.isArray(currencies) ? currencies.length : 1
  return [STATUS_PASS, `经济系统已设计（${count} 种货币）`]
}

function checkSystemsEnabledCount(doc: CeshuDocument): AutoCheckResult {
  const enabled = Object.values(doc.systems).filter((entry) => isPlainObject(entry) && Boolean(entry.enabled))
  if (enabled.length === 0) return [STATUS_FAIL, '未启用任何游戏系统']
  if (enabled.length < 3) return [STATUS_WARNING, `仅启用 ${enabled.length} 个系统，建议至少 3 个核心系统`]
  return [STATUS_PASS, `已启用 ${enabled.length} 个游戏系统`]
}

function checkSystemsDependencies(doc: CeshuDocument): AutoCheckResult {
  try {
    const enabled = Object.entries(doc.systems)
      .filter(([, entry]) => isPlainObject(entry) && Boolean(entry.enabled))
      .map(([key]) => key)
    const missing = checkSystemDependencies(enabled)
    if (missing.length === 0) return [STATUS_PASS, '已启用系统的依赖均满足']
    const details = missing.map((item) => `${item.system} 缺少 ${item.missing.join(',')}`).join('; ')
    return [STATUS_FAIL, `依赖缺失: ${details}`]
  } catch (error) {
    return [STATUS_WARNING, `依赖检查异常: ${error instanceof Error ? error.message : String(error)}`]
  }
}

function checkNumeric(doc: CeshuDocument): AutoCheckResult {
  const formulas = field(doc, 'numeric', 'core_formulas')
  const balance = field(doc, 'numeric', 'balance_principles')
  if (!hasValue(formulas)) return [STATUS_FAIL, '核心数值公式未填写']
  if (!hasValue(balance)) return [STATUS_WARNING, '平衡原则未填写']
  return [STATUS_PASS, '数值公式与平衡原则已规划']
}

function checkArtStyle(doc: CeshuDocument): AutoCheckResult {
  const style = readText(field(doc, 'art', 'art_style'))
  const color = field(doc, 'art', 'color_system')
  if (!hasValue(style)) return [STATUS_FAIL, '美术风格未确定']
  if (!hasValue(color)) return [STATUS_WARNING, '色彩系统未确定']
  return [STATUS_PASS, `美术风格: ${style}`]
}

function checkAudio(doc: CeshuDocument): AutoCheckResult {
  const music = readText(field(doc, 'audio', 'music_style'))
  const sfxCount = readCount(field(doc, 'audio', 'sfx_count'))
  if (!hasValue(music)) return [STATUS_FAIL, '音乐风格未确定']
  if (!hasValue(sfxCount) || sfxCount <= 0) return [STATUS_WARNING, '音效数量未估算']
  return [STATUS_PASS, `音乐风格: ${music}`]
}

function checkAccessibility(doc: CeshuDocument): AutoCheckResult {
  const features = field(doc, 'accessibility', 'accessibility_features')
  const languages = field(doc, 'accessibility', 'language_list')
  if (!hasValue(features) && !hasValue(languages)) return [STATUS_WARNING, '无障碍特性与支持语言均未设置']
  const parts: string[] = []
  if (hasValue(features)) parts.push(`${readLength(features)} 项无障碍特性`)
  if (hasValue(languages)) parts.push(`${readLength(languages)} 种语言`)
  return [STATUS_PASS, `已考虑: ${parts.join('、')}`]
}

function checkTechEngine(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'tech', 'engine')
  return hasValue(value) ? [STATUS_PASS, `引擎: ${String(value)}`] : [STATUS_FAIL, '游戏引擎未确定']
}

function checkTechStack(doc: CeshuDocument): AutoCheckResult {
  const architecture = field(doc, 'tech', 'core_architecture')
  const deps = field(doc, 'tech', 'third_party_deps')
  if (!hasValue(architecture) && !hasValue(deps)) return [STATUS_FAIL, '核心架构与第三方依赖均未填写']
  if (!hasValue(architecture)) return [STATUS_WARNING, '核心架构未填写']
  return [STATUS_PASS, '技术栈已确定']
}

function checkTechPerformance(doc: CeshuDocument): AutoCheckResult {
  const value = readText(field(doc, 'tech', 'performance_targets'))
  return hasValue(value) ? [STATUS_PASS, `性能目标: ${truncate(value, 40)}`] : [STATUS_FAIL, '性能目标未设定（帧率/内存/加载时间等）']
}

function checkMvpScope(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'mvp', 'mvp_scope')
  return hasValue(value) ? [STATUS_PASS, 'MVP 范围已定义'] : [STATUS_FAIL, 'MVP 范围未定义']
}

function checkMvpTimeline(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'mvp', 'mvp_timeline')
  return hasValue(value) ? [STATUS_PASS, `MVP 时间线: ${String(value)}`] : [STATUS_FAIL, 'MVP 时间线未确定']
}

function checkMvpMilestones(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'mvp', 'milestones')
  if (hasValue(value)) return [STATUS_PASS, `已规划 ${readLength(value)} 个里程碑`]
  return [STATUS_FAIL, '里程碑未规划']
}

function checkMvpSuccessCriteria(doc: CeshuDocument): AutoCheckResult {
  const value = readText(field(doc, 'mvp', 'success_criteria'))
  return hasValue(value) ? [STATUS_PASS, `成功标准: ${truncate(value, 40)}`] : [STATUS_FAIL, 'MVP 成功标准未定义']
}

function checkMarketTarget(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'market_analysis', 'target_market')
  return hasValue(value) ? [STATUS_PASS, `目标市场: ${String(value)}`] : [STATUS_FAIL, '目标市场未分析']
}

function checkMarketCompetitors(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'market_analysis', 'competitors')
  if (hasValue(value)) return [STATUS_PASS, `已分析 ${readLength(value)} 个竞品`]
  return [STATUS_FAIL, '竞品分析未填写']
}

function checkMarketSize(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'market_analysis', 'market_size')
  return hasValue(value) ? [STATUS_PASS, `市场规模: ${String(value)}`] : [STATUS_FAIL, '市场规模未评估']
}

function checkMonetizationModel(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'monetization', 'payment_model')
  return hasValue(value) ? [STATUS_PASS, `付费模式: ${String(value)}`] : [STATUS_FAIL, '付费模式未确定（f2p/p2p/b2p/订阅）']
}

function checkMonetizationPricing(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'monetization', 'pricing_tiers')
  if (hasValue(value)) return [STATUS_PASS, `定价档位: ${readLength(value)} 档`]
  return [STATUS_FAIL, '定价档位未制定']
}

function checkMonetizationIap(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'monetization', 'iap_design')
  if (hasValue(value)) return [STATUS_PASS, `内购商品: ${readLength(value)} 项`]
  return [STATUS_WARNING, '内购设计未规划']
}

function checkMonetizationArpu(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'monetization', 'arpu_target')
  return hasValue(value) ? [STATUS_PASS, `ARPU 目标: ${String(value)}`] : [STATUS_WARNING, 'ARPU 目标未设定']
}

function checkMarketKpi(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'market_analysis', 'kpi_forecast')
  if (!hasValue(value)) return [STATUS_FAIL, 'KPI 预测未制定']
  const keys = isPlainObject(value) ? Object.keys(value) : []
  return [STATUS_PASS, `KPI 已制定（${keys.length} 项指标）`]
}

function checkRiskMatrix(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'risk_handling', 'risk_matrix')
  if (hasValue(value)) return [STATUS_PASS, `风险矩阵已建立（${readLength(value)} 项风险）`]
  return [STATUS_FAIL, '风险矩阵未建立']
}

function checkRiskMitigation(doc: CeshuDocument): AutoCheckResult {
  const value = field(doc, 'risk_handling', 'contingency_plan')
  return hasValue(value) ? [STATUS_PASS, '应急预案已制定'] : [STATUS_FAIL, '应急预案未制定']
}

function checkResources(doc: CeshuDocument): AutoCheckResult {
  const budget = field(doc, 'resources', 'budget')
  const artAssets = field(doc, 'resources', 'art_assets')
  const audioAssets = field(doc, 'resources', 'audio_assets')
  const hasBudget = hasValue(budget)
  const hasAssets = hasValue(artAssets) || hasValue(audioAssets)
  if (!hasBudget && !hasAssets) return [STATUS_FAIL, '资源预算与资产清单均未填写']
  if (!hasBudget) return [STATUS_WARNING, '资源预算未填写']
  return [STATUS_PASS, '资源需求已评估']
}

function checkAccessibilityLocalization(doc: CeshuDocument): AutoCheckResult {
  const languages = field(doc, 'accessibility', 'language_list')
  const strategy = field(doc, 'accessibility', 'localization_strategy')
  if (!hasValue(languages)) return [STATUS_WARNING, '支持语言列表为空']
  if (!hasValue(strategy)) return [STATUS_WARNING, `已支持 ${readLength(languages)} 种语言，但本地化策略未填写`]
  return [STATUS_PASS, `本地化计划已制定（${readLength(languages)} 种语言）`]
}

/** 自动检查函数注册表（函数名 → 函数，与 Python _AUTO_CHECK_REGISTRY 一致） */
export const AUTO_CHECK_REGISTRY: Record<string, (doc: CeshuDocument) => AutoCheckResult> = {
  check_meta_game_name: checkMetaGameName,
  check_meta_game_type: checkMetaGameType,
  check_meta_platform: checkMetaPlatform,
  check_meta_positioning: checkMetaPositioning,
  check_meta_tags: checkMetaTags,
  check_vision_design_vision: checkVisionDesignVision,
  check_vision_differentiation: checkVisionDifferentiation,
  check_gameplay_core_loop: checkGameplayCoreLoop,
  check_worldview: checkWorldview,
  check_characters_main_npc: checkCharactersMainNpc,
  check_combat_mode: checkCombatMode,
  check_economy: checkEconomy,
  check_systems_enabled_count: checkSystemsEnabledCount,
  check_systems_dependencies: checkSystemsDependencies,
  check_numeric: checkNumeric,
  check_art_style: checkArtStyle,
  check_audio: checkAudio,
  check_accessibility: checkAccessibility,
  check_tech_engine: checkTechEngine,
  check_tech_stack: checkTechStack,
  check_tech_performance: checkTechPerformance,
  check_mvp_scope: checkMvpScope,
  check_mvp_timeline: checkMvpTimeline,
  check_mvp_milestones: checkMvpMilestones,
  check_mvp_success_criteria: checkMvpSuccessCriteria,
  check_market_target: checkMarketTarget,
  check_market_competitors: checkMarketCompetitors,
  check_market_size: checkMarketSize,
  check_monetization_model: checkMonetizationModel,
  check_monetization_pricing: checkMonetizationPricing,
  check_monetization_iap: checkMonetizationIap,
  check_monetization_arpu: checkMonetizationArpu,
  check_market_kpi: checkMarketKpi,
  check_risk_matrix: checkRiskMatrix,
  check_risk_mitigation: checkRiskMitigation,
  check_resources: checkResources,
  check_accessibility_localization: checkAccessibilityLocalization
}

/* ---- 主检查函数 ---- */

/** 运行完整检查清单（对应 Python run_checklist） */
