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

// 仅类型引用（`import type` 在编译期擦除）⇒ 不构成与 ceshuTasks 的运行时循环依赖
import type { CeshuTaskPlan } from '../workflow'

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

/** 模板版本：与 `documentSpec` 中 GAME_SPEC / APP_SPEC 的 version 保持一致。新建文档写入 meta.template_version，老文档读盘补齐 */
export const TEMPLATE_VERSION = '2026.11'

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
 * 章节在导出文档里的锚点 id（`ch1`~`chN`）。
 *
 * 索引 = 在 `CHAPTER_KEYS` 中的位置 + 1，与 `main/ceshu/export/common.ts` 的
 * `visibleChapterEntries` 完全一致。**注意不等于 `chapterNumber`**：meta 章号是 0 但锚点是 `ch1`，
 * 编号章的锚点也比章号大 1（如第十六章 → `ch17`）。Markdown/HTML 目录与交接包「来源」回链
 * 必须指同一个锚点，故此处单源派生，别在别处手写 `ch${...}`。
 */
export function chapterAnchorOf(key: ChapterKey): string {
  return `ch${CHAPTER_KEYS.indexOf(key) + 1}`
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

/**
 * 章节显示标签（**游戏档**）：编号章用「N. 名称」编号小节式，文档信息段无前缀。
 *
 * 依据 `docs/game-doc-corpus-2026.md`（国内 25 + 国际 25 条游戏文档）：
 * 逐字读过的 11 份里编号派 5 / 主题派 4 / 同页并存 1 / 非模板 1；全 50 条口径 10:3。
 * 游戏策划案（正式交付物 / 可复制模板）多数用「第一章…第八章」或 `1./a./i.` 多级编号，
 * 用户拍板「跟多数人习惯」⇒ 恢复编号。分流维度是**文档载体**而非地域：
 * 应用档（SDD）仍用主题式，依据是 6 个软件文档原文（RFC/KEP/Google/ADR/PEP/ModelCard）。
 *
 * 顺序与锚点 `chN` 由数组位置独立派生（见 `chapterNumber` / `chapterAnchorOf`），与标签前缀无关。
 */
export const CHAPTER_LABELS: Record<ChapterKey, string> = Object.fromEntries(
  CHAPTER_KEYS.map((key) => {
    const ordinal = chapterNumber(key)
    const name = CHAPTER_NAMES[key]
    return [key, ordinal === 0 ? name : `${ordinal}. ${name}`]
  })
) as Record<ChapterKey, string>

/** 该章所属分区；文档信息段返回 null（分区序号见 `partDisplayName`） */
export function chapterPartOf(key: ChapterKey): ChapterPart | null {
  return CHAPTER_PARTS.find((part) => (part.chapters as readonly ChapterKey[]).includes(key)) ?? null
}

/**
 * 分区显示名：**直接用分区标签**，不加中文序号。
 *
 * 曾经是「一、核心设计」，与章标签「1. 产品愿景」的阿拉伯数字编号混排，看起来像
 * 两套互不相干的编号体系（语料库复核也指出「分组标题应去掉中文序号」，见
 * `docs/template-corpus.md` / `docs/design-doc-templates-research.md`）。
 * 保留函数而非让调用方直取 `part.label`：分区显示名的口径要单源，将来若再调整只改这里。
 */
export function partDisplayName(part: ChapterPart): string {
  return part.label
}

/** 轻量档可见的**编号**章（恒为 `NUMBERED_CHAPTER_KEYS` 的前缀 ⇒ 章号 1..9 不跳号） */
export const LITE_CHAPTER_KEYS: readonly NumberedChapterKey[] = NUMBERED_CHAPTER_KEYS.slice(0, 9)

/** @deprecated 请用 `META_CHAPTER_KEY` + `LITE_CHAPTER_KEYS`；保留仅为兼容既有调用点 */
export const BASE_CHAPTER_KEYS: readonly ChapterKey[] = [META_CHAPTER_KEY, ...LITE_CHAPTER_KEYS]

export const GDD_SCOPE_FULL = 'full'
export const GDD_SCOPE_LITE = 'lite'
export type GddScope = typeof GDD_SCOPE_FULL | typeof GDD_SCOPE_LITE

/**
 * 某档位的**内容章数**（不含「文档信息」段）。
 *
 * 界面/提示词里凡是要写「文档信息 + N 章」的地方都必须用它，**不要写死数字**：
 * 2026-10-26 追加 7 个 P2 章后，full 从 16 章变成 23 章，而各处文案仍写 16 ——
 * 用户看到的导航有 24 章、档位标签却说 16 章，属于典型的「文案跟着数据腐烂」。
 * 守卫见 `tests/unit/ceshuScopeLabel.test.ts`。
 */
export function contentChapterCount(scope: GddScope): number {
  return scope === GDD_SCOPE_LITE ? LITE_CHAPTER_KEYS.length : NUMBERED_CHAPTER_KEYS.length
}

export function isChapterKey(value: string): value is ChapterKey {
  return (CHAPTER_KEYS as readonly string[]).includes(value)
}

export function isGddScope(value: unknown): value is GddScope {
  return value === GDD_SCOPE_FULL || value === GDD_SCOPE_LITE
}

/**
 * 无战斗品类的「游戏类型」取值（`meta.game_type` 合法值的子集）。
 *
 * 这些品类没有战斗系统，`combat` 章不应参与可见章节与完成度——否则立项稿会被
 * 「伪必填」的 combat 拉低（真实 GDD 走查：休闲合成立项 68% vs 含战斗 82%，
 * 见 `docs/ceshu-import-walkthrough.md` / `docs/ceshu-genre-taxonomy-proposal.md`）。
 *
 * **刻意复用既有 `meta.game_type`，不新增 `game_genre` 字段**：它的 22 个取值本身
 * 就是品类枚举，再加一个同义字段只会造成「双维护 + 静默漂移」（项目既有教训）。
 * 未匹配 / 空值一律按「有战斗」保守处理 ⇒ 老文档行为零变化。
 */
export const NON_COMBAT_GAME_TYPES: ReadonlySet<string> = new Set([
  '模拟经营',
  '视觉小说',
  '派对',
  '休闲益智'
])

/** 该游戏类型是否有战斗系统（缺省/未知一律按「有战斗」保守处理） */
export function gameTypeHasCombat(gameType: unknown): boolean {
  if (typeof gameType !== 'string' || gameType === '') return true
  return !NON_COMBAT_GAME_TYPES.has(gameType)
}

/**
 * 品类 → 不适用章映射（在「无战斗品类剔除 `combat`」之外，按品类进一步剔除的章）。
 *
 * 仅收录**高置信**规则，不确定就不剔，避免误伤：
 * - 视觉小说 / 派对：无经济系统 ⇒ 剔除 `economy`
 * - 休闲益智虽无战斗，但常有关卡与轻量经济 ⇒ 不剔（保留 `economy` / `level_design`）
 * - 其余品类暂不加规则
 *
 * `combat` 的剔除仍走 `gameTypeHasCombat`（无战斗品类恒无 combat 章），本表只管 combat 之外的章。
 */
export const GENRE_INAPPLICABLE_CHAPTERS: Readonly<Record<string, readonly ChapterKey[]>> = {
  '视觉小说': ['economy'],
  '派对': ['economy']
}

/** 该章在给定游戏类型下是否适用（无战斗品类剔 `combat`；映射表再剔经济等） */
export function chapterApplicableToGenre(chapter: ChapterKey, gameType: unknown): boolean {
  if (!gameTypeHasCombat(gameType) && chapter === 'combat') return false
  if (typeof gameType === 'string') {
    const extra = GENRE_INAPPLICABLE_CHAPTERS[gameType]
    if (extra !== undefined && (extra as readonly ChapterKey[]).includes(chapter)) return false
  }
  return true
}

/* ---- 通用底座 vs 系统模块（2026-10-26，见 docs/gdd-universal-core.md）---- */

/**
 * 通用底座：任何品类都必须写的章（对应「所有游戏都要回答的 6 个问题」）。
 * - meta：它是什么 / 平台 / 受众 / 商业模式
 * - vision：核心体验（设计支柱 + 差异化）
 * - gameplay：核心循环 + 目标/进度
 * - mvp：首个可玩范围
 *
 * 其余章都是「系统模块」，按品类/项目勾选，**不是通用清单**。
 */
export const UNIVERSAL_CORE_CHAPTERS: readonly ChapterKey[] = ['meta', 'vision', 'gameplay', 'mvp'] as const

/** 系统模块 = 除通用底座外的所有章（战斗/经济/数值/叙事/美术/…），可选。 */
export const MODULE_CHAPTERS: readonly ChapterKey[] = CHAPTER_KEYS.filter(
  (chapter) => !UNIVERSAL_CORE_CHAPTERS.includes(chapter)
)

export function isCoreChapter(chapter: ChapterKey): boolean {
  return UNIVERSAL_CORE_CHAPTERS.includes(chapter)
}

/**
 * 新文档**默认不启用**的系统模块章。
 *
 * 依据模板语料库复核（`docs/template-corpus.md` §D、`docs/design-doc-templates-research.md` §四）：
 * 游戏 23 章偏多，「市场分析 / 商业化 / 运营活动」属发行期、并非所有项目都需要，
 * 宜转「按需开启」而不是默认铺满。
 *
 * ⚠️ **只影响新建文档的默认值**：`createDefaultCeshu` 会把 `enabled_modules` 显式写成
 * 「全部模块 − 本表」。老文档没有该字段，仍按「全部模块」读（见 `enabledModuleChapters`），
 * 因此**老文档零变化**——它们已写好的这三章内容不会消失。
 */
export const DEFAULT_DISABLED_MODULE_CHAPTERS: readonly ChapterKey[] = [
  'market_analysis',
  'monetization',
  'live_ops'
]

/**
 * 新文档默认启用的模块章 = 全部模块 − `DEFAULT_DISABLED_MODULE_CHAPTERS`。
 * 顺序沿用 `MODULE_CHAPTERS`（即章序），保证写进 `meta.enabled_modules` 的值稳定可比。
 */
export function defaultEnabledModuleChapters(): ChapterKey[] {
  return MODULE_CHAPTERS.filter((chapter) => !DEFAULT_DISABLED_MODULE_CHAPTERS.includes(chapter))
}

/**
 * 文档启用的系统模块：
 * - `doc.enabled_modules` 是合法数组 ⇒ 用它（过滤到 MODULE_CHAPTERS 内）；
 * - 缺省 / 非法 ⇒ **全部模块**（向后兼容：老文档行为零变化）。
 */
export function enabledModuleChapters(doc: CeshuDocument): ChapterKey[] {
  // 存在 meta 上（与 gdd_scope 一致，随「文档信息」一起保存）；缺省 = 全部模块
  const raw = (doc.meta as Record<string, unknown>).enabled_modules
  if (Array.isArray(raw)) {
    return raw.filter(
      (key): key is ChapterKey => typeof key === 'string' && MODULE_CHAPTERS.includes(key as ChapterKey)
    )
  }
  return [...MODULE_CHAPTERS]
}

/** 该章在文档中是否启用（底座恒启用；模块看 enabled_modules） */
export function isChapterEnabled(chapter: ChapterKey, doc: CeshuDocument): boolean {
  return isCoreChapter(chapter) || enabledModuleChapters(doc).includes(chapter)
}

/**
 * 按档位返回可见章节 key：full = 全部；lite = 文档信息段 + 核心设计 9 章。
 *
 * - 传 `gameType` 时按品类剔除「不适用章」（无战斗品类的 combat 章）；
 * - 传 `enabledModules` 时再按模块启用剔除未勾选的模块章（底座恒保留）。
 * - **两者都不传时行为与旧版逐项一致**（不做任何过滤），保证既有调用方与测试不变。
 */
export function visibleChapterKeys(
  scope: GddScope,
  gameType?: unknown,
  enabledModules?: readonly ChapterKey[]
): readonly ChapterKey[] {
  const base: readonly ChapterKey[] =
    scope === GDD_SCOPE_LITE ? [META_CHAPTER_KEY, ...LITE_CHAPTER_KEYS] : CHAPTER_KEYS
  if (gameType === undefined && enabledModules === undefined) return base
  return base.filter((chapter) => {
    if (gameType !== undefined && !chapterApplicableToGenre(chapter, gameType)) return false
    if (enabledModules !== undefined && !isCoreChapter(chapter) && !enabledModules.includes(chapter)) return false
    return true
  })
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

/** 游戏系统中文名称映射 */
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

/** 系统间硬依赖：启用某系统时，其依赖的系统必须也已启用 */
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

/** 检查已启用系统的依赖是否满足 */
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

/** 游戏系统 config 字段 */
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

/** 策划书文档（磁盘 JSON 与 早期版本同构：顶层元数据 + 文档信息段 + 各章平铺） */
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
  /**
   * AI 生成的岗位任务计划（按岗位分组）。
   * 缺省/空 = 还没生成过，此时岗位任务回落到「按章字段清单」。
   * 只由 `ceshu:aiGenerateTasks` 写入；落盘在项目文件夹的 `data/tasks.json`。
   */
  task_plan?: CeshuTaskPlan
  /**
   * 可玩原型的单文件 HTML（AI 按设计文档生成）。
   * 落盘在项目文件夹的 `prototype/demo.html`——原型也是交付物，不能只活在界面内存里。
   * 空串/缺省 = 还没生成过。
   */
  demo_html?: string
  /**
   * 生成原型那一刻的设计内容指纹（见 `ceshuPrototypeStale.fingerprintCeshuDesign`）。
   * 用来判断「文档后来改了、原型是否过期」；落盘在 `config.json`。
   * 缺省 = 老原型（本功能之前生成），不做过期判定。
   */
  demo_source_fingerprint?: string
  /**
   * 规则集标识（设计契约的锚点）。
   *
   * 为什么需要它：设计文档、契约 JSON、原型 Demo、数据表配置必须能证明「引用的是同一套规则」。
   * 缺了它，改了数值后没法核对「哪些产物还停在旧规则」。派生规则见 `deriveRulesetId`：
   * 优先显式值，否则由 ceshu_id 生成稳定值（**不落盘派生值**，避免把派生结果当事实写进文件）。
   */
  ruleset_id?: string
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
  /** 文档类型（meta.doc_kind；application 档不显示游戏数据编辑页签，缺省 game） */
  docKind: 'game' | 'application'
  /** 目标平台（meta.platform，首页卡片平台徽标用；空数组表示未指定） */
  platform: string[]
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

export const CESHU_EXPORT_FORMATS = [
  'markdown',
  'onepage',
  'deliverable',
  'narrative',
  'homepage',
  'artbible',
  'tasks',
  'manifest',
  'html',
  'docx',
  'pptx',
  'pdf',
  'excel',
  'bundle'
] as const
export type CeshuExportFormat = (typeof CESHU_EXPORT_FORMATS)[number]

export const CESHU_FORMAT_LABELS: Record<CeshuExportFormat, string> = {
  markdown: 'Markdown 文档',
  onepage: '一页摘要（Markdown）',
  deliverable: '交付版（摘要+目录+全章）',
  narrative: '叙事版（首页+走读+机制+附录）',
  homepage: '设计首页（Markdown）',
  artbible: 'Art Bible 美术圣经（Markdown）',
  tasks: '岗位任务清单（程序/美术/测试…）',
  manifest: '实现契约 / 构建清单（Markdown）',
  html: 'HTML 网页',
  docx: 'Word 文档（docx）',
  pptx: 'PowerPoint 演示（pptx）',
  pdf: 'PDF 文档',
  excel: 'Excel 表格（xlsx）',
  bundle: '双轨：Markdown + JSON'
}

export const CESHU_FORMAT_EXTENSIONS: Record<CeshuExportFormat, string> = {
  markdown: '.md',
  onepage: '.md',
  deliverable: '.md',
  narrative: '.md',
  homepage: '.md',
  artbible: '.md',
  tasks: '.md',
  manifest: '.md',
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