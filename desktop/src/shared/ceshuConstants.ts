/**
 * 策划书常量（自 Python 版 core/ceshu/ceshu_model.py v5.0 与 ceshu_constants.py 匹平迁移）。
 * - 18 章工业级结构：基础 9 章（旧版保留）+ 工业级补充 9 章
 * - 档位：lite = 基础 9 章 / full = 全部 18 章，持久化在 meta.gdd_scope
 */

export const CHAPTER_KEYS = [
  // 基础章节（旧 9 章保留）
  'meta',
  'vision',
  'worldview',
  'gameplay',
  'systems',
  'numeric',
  'art',
  'tech',
  'resources',
  // 工业级补充 9 章
  'market_analysis',
  'characters',
  'combat',
  'economy',
  'monetization',
  'mvp',
  'risk_handling',
  'audio',
  'accessibility'
] as const

export type ChapterKey = (typeof CHAPTER_KEYS)[number]

export const CHAPTER_LABELS: Record<ChapterKey, string> = {
  // 基础 9 章
  meta: '第一章·项目元信息',
  vision: '第二章·产品愿景',
  worldview: '第三章·世界观',
  gameplay: '第四章·核心玩法',
  systems: '第五章·游戏系统设计',
  numeric: '第六章·数值设计',
  art: '第七章·美术设计',
  tech: '第八章·技术规格',
  resources: '第九章·资源规划',
  // 工业级补充 9 章
  market_analysis: '第十章·市场分析',
  characters: '第十一章·角色设计',
  combat: '第十二章·战斗系统设计',
  economy: '第十三章·经济系统设计',
  monetization: '第十四章·商业化设计',
  mvp: '第十五章·MVP 规划',
  risk_handling: '第十六章·风险控制',
  audio: '第十七章·音频设计',
  accessibility: '第十八章·可访问性与本地化'
}

/** 轻量档可见章节（基础 9 章） */
export const BASE_CHAPTER_KEYS: readonly ChapterKey[] = CHAPTER_KEYS.slice(0, 9)
/** 工业级档新增章节（后 9 章） */
export const INDUSTRIAL_CHAPTER_KEYS: readonly ChapterKey[] = CHAPTER_KEYS.slice(9)

export const GDD_SCOPE_FULL = 'full'
export const GDD_SCOPE_LITE = 'lite'
export type GddScope = typeof GDD_SCOPE_FULL | typeof GDD_SCOPE_LITE

export function isChapterKey(value: string): value is ChapterKey {
  return (CHAPTER_KEYS as readonly string[]).includes(value)
}

export function isGddScope(value: unknown): value is GddScope {
  return value === GDD_SCOPE_FULL || value === GDD_SCOPE_LITE
}

/** 按档位返回可见章节 key */
export function visibleChapterKeys(scope: GddScope): readonly ChapterKey[] {
  return scope === GDD_SCOPE_LITE ? BASE_CHAPTER_KEYS : CHAPTER_KEYS
}

/** 每章必填字段（用于进度计算与校验，与 Python CHAPTER_REQUIRED_FIELDS 一致） */
export const CHAPTER_REQUIRED_FIELDS: Record<ChapterKey, string[]> = {
  meta: ['game_name', 'game_type', 'positioning', 'tags'],
  vision: ['design_vision', 'differentiation'],
  worldview: ['architecture', 'main_plot'],
  gameplay: ['core_loop', 'game_modes'],
  systems: [], // 游戏系统按 enabled 数量算进度
  numeric: ['core_formulas', 'balance_principles'],
  art: ['art_style', 'color_system'],
  tech: ['engine', 'milestones'],
  resources: ['budget', 'risk_matrix'],
  market_analysis: ['target_market', 'competitors'],
  characters: ['protagonist', 'main_npc_count'],
  combat: ['combat_mode', 'damage_formula'],
  economy: ['currency_types', 'source_sink'],
  monetization: ['payment_model', 'pricing_tiers'],
  mvp: ['mvp_scope', 'mvp_timeline'],
  risk_handling: ['risk_matrix', 'contingency_plan'],
  audio: ['music_style', 'sfx_count'],
  accessibility: ['language_list', 'accessibility_features']
}

/** 游戏系统中文名称映射（与 Python SYSTEM_LABELS 一致） */
export const SYSTEM_LABELS: Record<string, string> = {
  battle: '战斗',
  character: '角色',
  skill: '技能',
  equipment: '装备',
  item: '物品',
  quest: '任务',
  social: '社交',
  economy: '经济',
  growth: '成长',
  customization: '自定义外观',
  content: '关卡内容',
  gacha: '抽卡系统',
  competitive: '排位竞技'
}

/** 系统间硬依赖：启用某系统时，其依赖的系统必须也已启用（与 Python SYSTEM_DEPENDENCIES 一致） */
export const SYSTEM_DEPENDENCIES: Record<string, string[]> = {
  battle: ['character', 'skill'],
  skill: ['character'],
  equipment: ['character', 'item'],
  gacha: ['item', 'economy'],
  growth: ['character'],
  quest: ['character', 'item'],
  social: ['character'],
  economy: ['item'],
  competitive: ['battle', 'character'],
  customization: ['character'],
  content: ['character', 'battle']
}

/** 检查已启用系统的依赖是否满足（对应 Python check_system_dependencies） */
export function checkSystemDependencies(enabledSystems: string[]): Array<{ system: string; missing: string[] }> {
  const enabled = new Set(enabledSystems)
  const result: Array<{ system: string; missing: string[] }> = []
  for (const system of enabledSystems) {
    const missing = (SYSTEM_DEPENDENCIES[system] ?? []).filter((dependency) => !enabled.has(dependency))
    if (missing.length > 0) result.push({ system, missing })
  }
  return result
}

/* ---- 章节表单字段描述（渲染层 schema 驱动表单用） ---- */

export type CeshuFieldKind =
  | 'text' // 单行文本
  | 'textarea' // 多行文本
  | 'number' // 数字（可带 from/to 范围）
  | 'combo' // 下拉选择（可空选项）
  | 'multiCombo' // 多选（复选框组，值为 string[]）
  | 'checkbox' // 开关
  | 'stringList' // 字符串列表（按行/逗号拆分）
  | 'pipeList' // 结构化行列表："字段1 | 字段2 …" ↔ [{列key: 值}]
  | 'json' // 复杂对象（JSON 编辑）

export interface CeshuColumnDef {
  key: string
  label: string
}

export interface CeshuFieldDef {
  /** 支持点路径（如 user_personas.primary） */
  key: string
  label: string
  kind: CeshuFieldKind
  /** combo/multiCombo 可选值 */
  values?: string[]
  /** combo 选项中文别名（如 lite → 轻量档） */
  optionLabels?: Record<string, string>
  /** number 下限 / 上限 */
  from?: number
  to?: number
  /** pipeList 列定义 */
  columns?: CeshuColumnDef[]
  /** stringList 分隔符（默认按行） */
  separator?: 'newline' | 'comma'
  placeholder?: string
}

/** 游戏系统 config 字段（无 key，键即字段名，与 Python SYSTEM_CONFIG_SCHEMA 对应） */
export type SystemConfigFieldDef = Omit<CeshuFieldDef, 'key'>

export type ChapterData = Record<string, unknown>

/** 系统条目：{ enabled, name, config } */
export interface SystemEntry {
  enabled: boolean
  name: string
  config: Record<string, unknown>
  [key: string]: unknown
}

export interface EnabledEditor {
  key: string
  name: string
  data_type: string
}

/** 策划书文档（磁盘 JSON 与 Python 版同构：顶层元数据 + 18 章平铺） */
export type CeshuChapters = { [K in ChapterKey]: ChapterData }

export interface CeshuDocumentBase {
  version: string
  ceshu_id: string
  created_at: string
  updated_at: string
  parent_id: string
  version_label: string
  is_active: boolean
  version_note: string
  style: string
  module_type: string
  enabled_editors: EnabledEditor[]
  editor_configs: Record<string, unknown>
}

export type CeshuDocument = CeshuDocumentBase & CeshuChapters

/** 侧边栏/版本链列表摘要 */
export interface CeshuSummary {
  id: string
  gameName: string
  scope: GddScope
  versionLabel: string
  updatedAt: string
  /** 总进度 0~1（按档位可见章节平均） */
  progress: number
  /** 父策划书 id（主策划为空字符串） */
  parentId: string
  isActive: boolean
  createdAt: string
}

/* ---- 导出 ---- */

export const CESHU_EXPORT_FORMATS = ['markdown', 'html', 'docx', 'pptx', 'pdf', 'excel'] as const
export type CeshuExportFormat = (typeof CESHU_EXPORT_FORMATS)[number]

export const CESHU_FORMAT_LABELS: Record<CeshuExportFormat, string> = {
  markdown: 'Markdown 文档',
  html: 'HTML 网页',
  docx: 'Word 文档（docx）',
  pptx: 'PowerPoint 演示（pptx）',
  pdf: 'PDF 文档',
  excel: 'Excel 表格（xlsx）'
}

export const CESHU_FORMAT_EXTENSIONS: Record<CeshuExportFormat, string> = {
  markdown: '.md',
  html: '.html',
  docx: '.docx',
  pptx: '.pptx',
  pdf: '.pdf',
  excel: '.xlsx'
}

/** 导出结果 */
export interface CeshuExportResult {
  filePath: string
  format: CeshuExportFormat
  bytes: number
}