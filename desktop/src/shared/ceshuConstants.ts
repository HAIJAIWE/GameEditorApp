/**
 * 策划书章节常量（**单一事实源 = `CHAPTER_PARTS`**）。
 *
 * - **meta（文档信息段）不占章号**：恒在 `CHAPTER_KEYS` 首位、`chapterNumber(meta) === 0`，
 *   且 label 无「第N章·」前缀。
 * - **16 个编号章**由 `CHAPTER_PARTS` 顺序展开派生（`NUMBERED_CHAPTER_KEYS`）。
 *   分区制重组把原「世界观 + 角色设计」两章并成 `story`；`combat`/`economy` 上移到核心区；
 *   制作区里 `mvp` 提到 `monetization` 之前（先定 MVP 范围再定商业化）。
 * - **章号 / 标签 / 分区序号全部由数组位置派生**（`chapterNumber` / `CHAPTER_LABELS` /
 *   `partDisplayName`）。历史上出过「重排后 lite 章号跳号 1,2,3,4,5,6,11,13,14」「目录像缺页」
 *   这类只在界面上肉眼可见的缺陷 ⇒ 派生 + `ceshuConstants.test.ts` 的结构守卫就是为它们立的。
 * - 档位：lite = 文档信息段 + 核心设计 9 章（`LITE_CHAPTER_KEYS` **恒为编号章前缀**）/
 *   full = 全部章节。持久化在 meta.gdd_scope。
 */

/** 文档信息段：封面信息，不占章号 */
export const META_CHAPTER_KEY = 'meta'

/** 分区定义（章节顺序的唯一事实源） */
export const CHAPTER_PARTS = [
  {
    key: 'core',
    label: '核心设计',
    chapters: ['vision', 'story', 'gameplay', 'systems', 'combat', 'economy', 'numeric', 'art', 'audio']
  },
  {
    key: 'production',
    label: '制作与商业',
    chapters: ['tech', 'resources', 'market_analysis', 'risk_handling', 'mvp', 'monetization', 'accessibility']
  },
  {
    /*
     * 扩展设计（P2：2026-10-23 补齐标准 GDD 缺的 7 个模块）。
     * 刻意追加在末尾而非按逻辑插入：章号由分区表位置派生，插中间会让后续
     * 所有章号平移、lite 档（前 9 章）范围变动，旧文档里「见第 N 章」的
     * 引用全部错位。追加在末尾则既有 16 章编号与 lite 范围零变动。
     */
    key: 'expansion',
    label: '扩展设计',
    chapters: ['uiux', 'level_design', 'live_ops', 'analytics', 'qa', 'publishing', 'performance']
  }
] as const

export interface ChapterPart {
  key: string
  label: string
  chapters: readonly ChapterKey[]
}

/** 有章号的章节 key（由分区表展开派生） */
export type NumberedChapterKey = (typeof CHAPTER_PARTS)[number]['chapters'][number]

/** 全部章节 key = 文档信息段 + 编号章 */
export type ChapterKey = typeof META_CHAPTER_KEY | NumberedChapterKey

/** 编号章顺序（**章节顺序的唯一事实源派生结果**） */
export const NUMBERED_CHAPTER_KEYS: readonly NumberedChapterKey[] = CHAPTER_PARTS.flatMap((part) => [...part.chapters])

export const CHAPTER_KEYS: readonly ChapterKey[] = [META_CHAPTER_KEY, ...NUMBERED_CHAPTER_KEYS]

/** 章节中文名（`CHAPTER_LABELS` 与章号由它 + 数组位置派生） */
export const CHAPTER_NAMES: Record<ChapterKey, string> = {
  meta: '文档信息',
  vision: '产品愿景',
  story: '世界观与角色',
  gameplay: '核心玩法',
  systems: '游戏系统设计',
  combat: '战斗系统设计',
  economy: '经济系统设计',
  numeric: '数值设计',
  art: '美术设计',
  audio: '音频设计',
  tech: '技术规格',
  resources: '资源规划',
  market_analysis: '市场分析',
  risk_handling: '风险控制',
  monetization: '商业化设计',
  mvp: 'MVP 规划',
  accessibility: '可访问性与本地化',
  uiux: 'UI/UX 交互设计',
  level_design: '关卡与内容设计',
  live_ops: '运营与活动',
  analytics: '数据埋点与指标',
  qa: '测试与质量保障',
  publishing: '上线与发行',
  performance: '性能与适配'
}

/** 中文数字（章号 / 分区序号共用） */
const CN_NUMERALS = [
  '一', '二', '三', '四', '五', '六', '七', '八', '九', '十',
  '十一', '十二', '十三', '十四', '十五', '十六', '十七', '十八', '十九', '二十',
  '二十一', '二十二', '二十三'
] as const

/** 章号：文档信息段为 0，编号章从 1 起（按 `NUMBERED_CHAPTER_KEYS` 位置派生） */
export function chapterNumber(key: ChapterKey): number {
  if (key === META_CHAPTER_KEY) {
    return 0
  }
  return NUMBERED_CHAPTER_KEYS.indexOf(key) + 1
}

/**
 * 中文数字章号（供文案拼 `第${chapterOrdinalCn(key)}章` 用）。
 *
 * 存在的理由：`ceshuValidation` 的一致性提示里散落着「第十四章 monetization…」这类**手写章号**，
 * 分区重组后它们几乎全部漂移（art 写成第七章、audio 写成第十七章、tech 写成第八章…），
 * 而 `ceshuChapterLabelDrift` 守卫只认「第N章·<章节名>」带间隔号的写法 ⇒ 扫不到这些。
 * ⇒ 一律改用本函数派生，从根上消灭这一类。
 *
 * 文档信息段（`chapterNumber === 0`）返回空串——它不占章号，调用方不应拼进文案。
 */
export function chapterOrdinalCn(key: ChapterKey): string {
  return CN_NUMERALS[chapterNumber(key) - 1] ?? ''
}

/** 章节显示标签：文档信息段无「第N章·」前缀，编号章与章号严格对齐 */
export const CHAPTER_LABELS: Record<ChapterKey, string> = Object.fromEntries(
  CHAPTER_KEYS.map((key) => {
    const ordinal = chapterNumber(key)
    const name = CHAPTER_NAMES[key]
    return [key, ordinal === 0 ? name : `第${CN_NUMERALS[ordinal - 1]}章·${name}`]
  })
) as Record<ChapterKey, string>

/** 该章所属分区；文档信息段返回 null（分区序号见 `partDisplayName`） */
export function chapterPartOf(key: ChapterKey): ChapterPart | null {
  return CHAPTER_PARTS.find((part) => (part.chapters as readonly ChapterKey[]).includes(key)) ?? null
}

/** 分区显示名：「一、核心设计」（序号按其在 `CHAPTER_PARTS` 中的位置派生） */
export function partDisplayName(part: ChapterPart): string {
  const index = CHAPTER_PARTS.findIndex((candidate) => candidate.key === part.key)
  return `${CN_NUMERALS[index]}、${part.label}`
}

/** 轻量档可见的**编号**章（恒为 `NUMBERED_CHAPTER_KEYS` 的前缀 ⇒ 章号 1..9 不跳号） */
export const LITE_CHAPTER_KEYS: readonly NumberedChapterKey[] = NUMBERED_CHAPTER_KEYS.slice(0, 9)

/** @deprecated 请用 `META_CHAPTER_KEY` + `LITE_CHAPTER_KEYS`；保留仅为兼容既有调用点 */
export const BASE_CHAPTER_KEYS: readonly ChapterKey[] = [META_CHAPTER_KEY, ...LITE_CHAPTER_KEYS]

export const GDD_SCOPE_FULL = 'full'
export const GDD_SCOPE_LITE = 'lite'
export type GddScope = typeof GDD_SCOPE_FULL | typeof GDD_SCOPE_LITE

export function isChapterKey(value: string): value is ChapterKey {
  return (CHAPTER_KEYS as readonly string[]).includes(value)
}

export function isGddScope(value: unknown): value is GddScope {
  return value === GDD_SCOPE_FULL || value === GDD_SCOPE_LITE
}

/** 按档位返回可见章节 key：full = 全部；lite = 文档信息段 + 核心设计 9 章 */
export function visibleChapterKeys(scope: GddScope): readonly ChapterKey[] {
  return scope === GDD_SCOPE_LITE ? [META_CHAPTER_KEY, ...LITE_CHAPTER_KEYS] : CHAPTER_KEYS
}

/**
 * 每章必填字段（用于进度计算与校验）。
 * `story` 是原 `worldview` + `characters` 的必填项**并集**（两章已合并）。
 */
export const CHAPTER_REQUIRED_FIELDS: Record<ChapterKey, string[]> = {
  meta: ['game_name', 'game_type', 'positioning', 'tags'],
  vision: ['design_vision', 'differentiation'],
  story: ['architecture', 'main_plot', 'protagonist', 'main_npc_count'],
  gameplay: ['core_loop', 'game_modes'],
  systems: [], // 游戏系统按 enabled 数量算进度
  combat: ['combat_mode', 'damage_formula'],
  economy: ['currency_types', 'source_sink'],
  numeric: ['core_formulas', 'balance_principles'],
  art: ['art_style', 'color_system'],
  audio: ['music_style', 'sfx_count'],
  tech: ['engine', 'milestones'],
  resources: ['budget', 'risk_matrix'],
  market_analysis: ['target_market', 'competitors'],
  risk_handling: ['risk_matrix', 'contingency_plan'],
  monetization: ['payment_model', 'pricing_tiers'],
  mvp: ['mvp_scope', 'mvp_timeline'],
  accessibility: ['language_list', 'accessibility_features'],
  // P2 扩展设计 7 章：必填字段由章字段设计方建议（每章 2 个，避开三件套配套键）
  uiux: ['information_architecture', 'core_flows'],
  level_design: ['level_templates', 'first_levels'],
  live_ops: ['ops_goals', 'activity_system'],
  analytics: ['metric_system', 'event_tracking'],
  qa: ['test_strategy', 'test_cases'],
  publishing: ['publish_plan', 'channel_strategy'],
  performance: ['performance_budget', 'target_devices']
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
  /* ---- 人机协作契约（见 ceshuFields.resolveFieldMeta） ---- */
  /**
   * 是否必填（没填就无法开工）。缺省时由 `CHAPTER_REQUIRED_FIELDS` 派生，
   * 避免两处维护同一份「必填」信息。
   */
  required?: boolean
  /**
   * 是否允许 AI 起草。缺省 `true`；预算、商业决策、团队规模这类**人定**字段显式设 `false`，
   * 单字段生成时会把它们排除，避免 AI 越权替人做决定。
   */
  aiDraftable?: boolean
  /** 该字段 AI 应产出什么（一句话，直接喂给单字段生成提示词） */
  aiHint?: string
  /** 人审这个字段时看什么（一句话，显示在字段旁，供审核者快速判断） */
  reviewHint?: string
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

/** 策划书文档（磁盘 JSON 与 Python 版同构：顶层元数据 + 文档信息段 + 16 章平铺） */
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
  /** 版本说明（派生时填写；版本时间线详情用） */
  versionNote: string
  /** 游戏类型（meta.game_type，首页卡片类型标签用；空串表示未分类） */
  gameType: string
  /** 文档状态（meta.status，首页卡片状态徽章用；缺省 "draft"） */
  status: string
  /**
   * 待审字段数（ai_draft 数量；0 表示没有待审）。
   *
   * 必填而不是可选：摘要的唯一生产者是 `CeshuManager.toSummary`，把它做成必填
   * 才能让「卡片显示待审数」这件事没有默认值可赖——少算一处就会在类型检查时报错，
   * 而不是悄悄显示成 0（「0 待审」和「没统计」在界面上看起来一样，最难排查）。
   */
  pendingCount: number
}

/* ---- 导出 ---- */

export const CESHU_EXPORT_FORMATS = ['markdown', 'html', 'docx', 'pptx', 'pdf', 'excel', 'bundle'] as const
export type CeshuExportFormat = (typeof CESHU_EXPORT_FORMATS)[number]

export const CESHU_FORMAT_LABELS: Record<CeshuExportFormat, string> = {
  markdown: 'Markdown 文档',
  html: 'HTML 网页',
  docx: 'Word 文档（docx）',
  pptx: 'PowerPoint 演示（pptx）',
  pdf: 'PDF 文档',
  excel: 'Excel 表格（xlsx）',
  bundle: '双轨：Markdown + JSON'
}

export const CESHU_FORMAT_EXTENSIONS: Record<CeshuExportFormat, string> = {
  markdown: '.md',
  html: '.html',
  docx: '.docx',
  pptx: '.pptx',
  pdf: '.pdf',
  excel: '.xlsx',
  /** 双轨的主产物是人读的 Markdown；机读 JSON 与它同主文件名（.json） */
  bundle: '.md'
}

/** 导出结果 */
export interface CeshuExportResult {
  /** 主产物路径（双轨时为 Markdown） */
  filePath: string
  format: CeshuExportFormat
  bytes: number
  /** 双轨导出的全部产物（[Markdown, JSON]）；单文件格式缺省 */
  files?: Array<{ path: string; bytes: number }>
}

/* ---- 状态常量（检查清单 ChecklistStatus 与字段依赖 FieldDependencyStatus 共用的 warning 状态与展示元） ---- */

/**
 * 警告状态字面量。
 * 检查清单（`ceshuChecklistItems.ts` 的 `ChecklistStatus`）与字段依赖（`ceshuFieldDepsData.ts` 的
 * `FieldDependencyStatus`）原本各自 `export const STATUS_WARNING = 'warning'`，语义一致、应单一事实源 ⇒ 抽到此处。
 * 注意：两域的 `STATUS_META` 键集不同（清单 5 态 / 依赖 3 态，见各自文件），故 `STATUS_META` 不合并，仅共享 warning 这一枚。
 */
export const STATUS_WARNING = 'warning'

/** 警告状态展示元信息（图标/颜色/标签），检查清单与字段依赖的 `STATUS_META` 共用同一份，避免两处各自维护漂移 */
export const WARNING_STATUS_META: { icon: string; color: string; label: string } = {
  icon: '⚠️',
  color: '#F59E0B',
  label: '警告'
}