/**
 * 有出处的参照 GDD 库 —— 替代「编造的行业均值」。
 *
 * ## 为什么要有它
 * 改造前 `ceshuScorer` 的「同行业对比」用的是 `INDUSTRY_BENCHMARKS`：
 * `RPG: { total_avg: 77, top_games: ['原神','古剑奇谭','鬼谷荒'] }` 这类
 * **凭空写出的分数**。它同时违反两件事：
 *   1. 本项目的 `禁编造` 铁律——77 分没有任何来源；
 *   2. 用户的实际诉求——「一百分制有啥用哈…纯瞎评价的」。
 *
 * 取而代之的是**可核验的参照文档**：每一条都注明出处（谁写的 / 什么项目 /
 * 公开链接或仓库路径），并给出该文档在**每个必填字段**上的实际覆盖与依据。
 * 于是「对比」变成「你的文档 vs 一份真实文档」的逐字段核查，而不是 vs 一个数字。
 *
 * ## 三类参照（出处强度不同，UI 必须如实标注）
 * - `real-public`：真实公开发布的 GDD（可点链接核对原文）；
 * - `project-deliverable`：本项目**已交付**的完整案例（GDD + 契约 + 可玩 Demo，可复跑验证）；
 * - `project-sample`：本项目为对齐 schema 写的 5 页样例（best-case 对照，**不是真实文档**，
 *   UI 必须标「合成样例」，避免拿它当行业基准）。
 *
 * ## 覆盖数据的口径
 * `coverage` 的键是 `'<章>.<字段>'`，值 ` covered, evidence }`：
 * - `covered` 只在该文档**明确写了**该字段时才是 `true`；缺口保留缺口
 *   （如 Doom Bible 的 `gameplay.core_loop` 只有一句「New 3-D engine」⇒ false），
 *   **不替它脑补**；
 * - `evidence` 必须能回原文档核对（页码 / 小节号 / 原文摘句）。
 */

import { CHAPTER_LABELS, CHAPTER_REQUIRED_FIELDS, type ChapterKey, type CeshuDocument } from './ceshuConstants'
import { chaptersUpToStage } from '../workflow'

/** 参照文档的出处强度（决定 UI 怎么标注，不能混为一谈） */
export type CeshuReferenceKind = 'real-public' | 'project-deliverable' | 'project-sample'

export const CESHU_REFERENCE_KIND_LABELS: Record<CeshuReferenceKind, string> = {
  'real-public': '真实公开文档',
  'project-deliverable': '本项目已交付案例',
  'project-sample': '本项目合成样例（非真实文档）'
}

/** 出处说明（可核验；没有链接就不写链接，不编造） */
export interface CeshuReferenceSource {
  /** 一句话交代「谁写的 / 什么项目 / 什么时候」 */
  attribution: string
  /** 可点开核对的公开链接（真实公开文档才有） */
  url?: string
  /** 仓库内相对路径（本项目产物才有） */
  path?: string
}

/** 单个必填字段的覆盖情况 */
export interface CeshuReferenceFieldCoverage {
  covered: boolean
  /** 依据（页码 / 小节 / 原文摘句），必须能回原文档核对 */
  evidence: string
}

/** 一份有出处的参照 GDD */
export interface CeshuReferenceGdd {
  id: string
  title: string
  /** 品类描述（展示用） */
  genre: string
  /** 写入 meta.game_type 的取值（驱动「无战斗品类隐藏 combat 章」同口径对比） */
  gameType: string
  kind: CeshuReferenceKind
  source: CeshuReferenceSource
  /** '章.字段' -> 覆盖情况（只登记立项阶段的必填字段） */
  coverage: Record<string, CeshuReferenceFieldCoverage>
  /** 机读数据层说明（自带、不计入完备度） */
  machine: Record<string, string>
}

/** 覆盖键：'<章>.<字段>' */
export function referenceKey(chapter: ChapterKey, field: string): string {
  return `${chapter}.${field}`
}

/* ------------------------------------------------------------------ */
/* 参照文档 1：The Doom Bible（1992，真实公开 PDF）                     */
/* ------------------------------------------------------------------ */

/**
 * 刻意保留**真实文档的真实缺口**：§4 Play Loop 只有一句「New 3-D engine」，
 * §14 武器只有定性描述、护甲值甚至写成「?」——不替它脑补。
 */
const DOOM: CeshuReferenceGdd = {
  id: 'DOOM',
  title: '《Doom Bible》',
  genre: '1992 FPS 设计圣经',
  gameType: 'FPS',
  kind: 'real-public',
  source: {
    attribution: 'Tom Hall 撰写，id Software 1992 年公开分发的设计圣经（PDF）',
    url: 'https://www.cs.wpi.edu/~imgd1001/a08/projects/proj2/doomBible.pdf'
  },
  coverage: {
    'meta.game_name': { covered: true, evidence: '标题 DOOM' },
    'meta.game_type': {
      covered: true,
      evidence: '§15.1「real-time, three-dimensional... multi-player battle」'
    },
    'meta.positioning': { covered: true, evidence: '§15.1「DOOM — where the sanest place is behind a trigger」' },
    'meta.tags': { covered: false, evidence: '有 feature bullets，但无结构化标签' },
    'vision.design_vision': {
      covered: true,
      evidence: '§15.2「Revolutionary Programming and Advanced Design」+ Program Features'
    },
    'vision.differentiation': {
      covered: true,
      evidence: '§15.3 对标 id 前作 Wolfenstein 3-D（「another technical revolution」）'
    },
    'gameplay.core_loop': { covered: false, evidence: '§4「Play Loop」仅一句「New 3-D engine」，未写循环' },
    'gameplay.game_modes': {
      covered: true,
      evidence: '§15.3「Four players at once on LANs, two by modem」+ shareware 章节'
    },
    'combat.combat_mode': { covered: true, evidence: '§14.1 实时 FPS，10+ 武器（刀/枪/霰弹/机枪/导弹…）' },
    'combat.damage_formula': { covered: false, evidence: '§14.1 仅定性（minimum / more powerful），无公式' },
    'economy.currency_types': { covered: false, evidence: '无货币系统；只有弹药 / 血 / 宝物' },
    'economy.source_sink': { covered: false, evidence: '无经济循环（拾取 ≠ 经济）' },
    'numeric.core_formulas': { covered: false, evidence: '无公式；护甲值甚至写作「?」' },
    'numeric.balance_principles': { covered: false, evidence: '无' },
    'mvp.mvp_scope': { covered: true, evidence: '§15.3「Six exciting episodes」+ 商业版；首章 shareware' },
    'mvp.mvp_timeline': { covered: true, evidence: '§15.3「release DOOM in the third quarter of 1993」' }
  },
  machine: {
    'economy.ledger': '无经济账本（1992 FPS 无货币系统）',
    'numeric.numeric_assertions': '无（该文档无任何可复算断言）',
    'numeric.design_claims': '无',
    'vision.design_assumptions': '隐含于 Program Features，但未登记为可证伪假设'
  }
}

/* ------------------------------------------------------------------ */
/* 参照文档 2：深潮灯塔（本项目已交付案例：GDD + 契约 + 可玩 Demo）        */
/* ------------------------------------------------------------------ */

const ABYSSAL_BEACON: CeshuReferenceGdd = {
  id: 'ABYSSAL',
  title: '《深潮灯塔》',
  genre: '单路塔防（本项目交付案例）',
  gameType: '塔防',
  kind: 'project-deliverable',
  source: {
    attribution: '本项目用 game-designer-pro 交付：GDD + 设计契约（ruleset abyssal-beacon-v1）+ 单文件可玩 Demo',
    path: 'docs/gdd-samples/abyssal-beacon/'
  },
  coverage: {
    'meta.game_name': { covered: true, evidence: '标题「深潮灯塔 · Abyssal Beacon」' },
    'meta.game_type': { covered: true, evidence: '§1「单人、桌面/移动浏览器、点击建塔的单路塔防」' },
    'meta.positioning': { covered: true, evidence: '§1 一句话：深海灯塔防守，守 20 波' },
    'meta.tags': { covered: false, evidence: '有支柱与克制关系，但无结构化标签' },
    'vision.design_vision': { covered: true, evidence: '§1 三条设计支柱（各带反例）' },
    'vision.differentiation': { covered: true, evidence: '§4.5 反支配检查：不存在「只建一种塔通关」的最优解' },
    'gameplay.core_loop': { covered: true, evidence: '§1 循环一句话 + §3.1 三层循环表' },
    'gameplay.game_modes': { covered: false, evidence: '单核心循环，未枚举可选模式' },
    'combat.combat_mode': { covered: true, evidence: '§4.2 三种塔（探照灯/声呐塔/腐蚀塔）结算顺序' },
    'combat.damage_formula': { covered: true, evidence: '§5.2 塔 DPS 与 §5.4 HP(w)=ceil(18×1.16^(w-1))' },
    'economy.currency_types': { covered: true, evidence: '§3.1 传递物：生物质 + 耐久' },
    'economy.source_sink': { covered: true, evidence: '§4.3 击杀得生物质、建塔/升级消耗；§4.4 拆除返还 50%' },
    'numeric.core_formulas': { covered: true, evidence: '§5.1 全局参数表 + §5.4 波次曲线公式' },
    'numeric.balance_principles': { covered: true, evidence: '§5.4「血量涨得比金币快」⇒ 必须靠塔位+克制；§4.5' },
    'mvp.mvp_scope': { covered: true, evidence: '§6 P0/P1/Non-goals 三层范围表' },
    'mvp.mvp_timeline': { covered: false, evidence: '只给了验证阈值，无研发/上线时间线' }
  },
  machine: {
    'economy.ledger': '§5.5 关键账本（20 波总击杀 226 / 总生物质 2503），可复算',
    'numeric.numeric_assertions': '§6 验证假设与阈值 3 条；contract.json 断言 A1–A4',
    'numeric.design_claims': '§7 原型验证结论（Demo 已在 headless Chrome 实跑）',
    'vision.design_assumptions': '§6 三条可证伪阈值（3–5 分钟 / 至少 2 种塔 / 末波耐久 ≥5）'
  }
}

/* ------------------------------------------------------------------ */
/* 参照文档 3–5：本项目合成的 5 页样例（best-case 对照，非真实文档）      */
/* ------------------------------------------------------------------ */

const SLG_SAMPLE: CeshuReferenceGdd = {
  id: 'SLG',
  title: '《列王纷争录》',
  genre: '军事 SLG',
  gameType: 'SLG',
  kind: 'project-sample',
  source: {
    attribution: '本项目为对齐 schema 骨架合成的 5 页样例（best-case，非真实文档）',
    path: 'docs/gdd-samples/01-SLG-列王纷争录.md'
  },
  coverage: {
    'meta.game_name': { covered: true, evidence: 'L1 《列王纷争录》' },
    'meta.game_type': { covered: true, evidence: 'L3 写实军事 SLG' },
    'meta.positioning': { covered: true, evidence: 'L7 一句话定位' },
    'meta.tags': { covered: false, evidence: '未列结构化标签；类型散落定位句，需人定' },
    'vision.design_vision': { covered: true, evidence: 'L11-16 四条设计支柱' },
    'vision.differentiation': { covered: true, evidence: 'L7 与率土/万国差异；L41 差异化核心' },
    'gameplay.core_loop': { covered: true, evidence: 'L18 核心动词 算→派→等→判→谈' },
    'gameplay.game_modes': { covered: false, evidence: '只描述主玩法，未枚举可选项模式清单' },
    'combat.combat_mode': { covered: true, evidence: 'L14 战斗自动进行，决策全在战前' },
    'combat.damage_formula': { covered: true, evidence: 'L37 伤害=兵力×攻击×减伤系数×克制系数' },
    'economy.currency_types': { covered: true, evidence: 'L26 四资源；L22 钻石；L42 粮食' },
    'economy.source_sink': { covered: true, evidence: 'L26 产出；L47 税收；L31 消耗' },
    'numeric.core_formulas': { covered: true, evidence: 'L31 T(L)；L37 伤害；L57-66 参数表' },
    'numeric.balance_principles': { covered: true, evidence: 'L39 克制闭环无支配；L38 混编理由' },
    'mvp.mvp_scope': { covered: true, evidence: 'L79 P0 清单' },
    'mvp.mvp_timeline': { covered: false, evidence: '无研发/上线时间线，仅新手前 20 分钟走读' }
  },
  machine: {
    'economy.ledger': 'GDD 未给逐笔账本，但有产出/消耗/税收流（L26/31/47）',
    'numeric.numeric_assertions': 'L68-75 数值断言表 4 条，可复算',
    'numeric.design_claims': 'L83 验证假设与阈值 3 条',
    'vision.design_assumptions': 'L13-16 各支柱反例=假设；L83 可证伪阈值'
  }
}

const CARD_SAMPLE: CeshuReferenceGdd = {
  id: 'CARD',
  title: '《午夜列车》',
  genre: '卡牌 Roguelike',
  gameType: '卡牌',
  kind: 'project-sample',
  source: {
    attribution: '本项目为对齐 schema 骨架合成的 5 页样例（best-case，非真实文档）',
    path: 'docs/gdd-samples/02-卡牌Roguelike-午夜列车.md'
  },
  coverage: {
    'meta.game_name': { covered: true, evidence: 'L1 《午夜列车》' },
    'meta.game_type': { covered: true, evidence: 'L3 卡牌构建 Roguelike' },
    'meta.positioning': { covered: true, evidence: 'L7' },
    'meta.tags': { covered: false, evidence: '未列结构化标签，需人定' },
    'vision.design_vision': { covered: true, evidence: 'L11-16 四支柱' },
    'vision.differentiation': { covered: true, evidence: 'L7 与杀戮尖塔/区块链桌游差异' },
    'gameplay.core_loop': { covered: true, evidence: 'L18 核心动词 停站→看→选→开' },
    'gameplay.game_modes': { covered: false, evidence: '只描述主玩法，未枚举可选项模式清单' },
    'combat.combat_mode': { covered: true, evidence: 'L26 战斗自动开始/战前调座；L42 自动回合制' },
    'combat.damage_formula': {
      covered: true,
      evidence: 'L37 觉醒攻击=基础×好感；L43 攻击=基础×好感×(1+0.2×相邻)'
    },
    'economy.currency_types': { covered: true, evidence: 'L24 硬币；L36 好感；L31 精力' },
    'economy.source_sink': { covered: true, evidence: 'L31 精力用于服务/查验/治疗/交易；L48 硬币' },
    'numeric.core_formulas': { covered: true, evidence: 'L37/L43/L48/L54-65 参数表' },
    'numeric.balance_principles': { covered: true, evidence: 'L49 HP 增速>硬币增速必然出墙；L45 双邻接权衡' },
    'mvp.mvp_scope': { covered: true, evidence: 'L80 P0 清单' },
    'mvp.mvp_timeline': { covered: false, evidence: '无研发/上线时间线，仅新手走读' }
  },
  machine: {
    'economy.ledger': 'GDD 未给逐笔账本，但有硬币/精力流',
    'numeric.numeric_assertions': 'L68-76 数值断言表 5 条，可复算',
    'numeric.design_claims': 'L84 验证假设与阈值 3 条',
    'vision.design_assumptions': 'L13-16 支柱反例=假设；L84 可证伪阈值'
  }
}

const MERGE_SAMPLE: CeshuReferenceGdd = {
  id: 'MERGE',
  title: '《喵岛邮差》',
  genre: '休闲合成（无战斗品类）',
  gameType: '模拟经营',
  kind: 'project-sample',
  source: {
    attribution: '本项目为对齐 schema 骨架合成的 5 页样例（best-case，非真实文档）',
    path: 'docs/gdd-samples/03-休闲合成-喵岛邮差.md'
  },
  coverage: {
    'meta.game_name': { covered: true, evidence: 'L1 《喵岛邮差》' },
    'meta.game_type': { covered: true, evidence: 'L3 休闲合成+订单经营' },
    'meta.positioning': { covered: true, evidence: 'L7' },
    'meta.tags': { covered: false, evidence: '未列结构化标签，需人定' },
    'vision.design_vision': { covered: true, evidence: 'L9-16 四支柱' },
    'vision.differentiation': { covered: true, evidence: 'L7 与 Merge Mansion/Travel Town 差异' },
    'gameplay.core_loop': { covered: true, evidence: 'L18 核心动词 收→合→发→雇→读' },
    'gameplay.game_modes': { covered: false, evidence: '单核心循环，未枚举可选项模式' },
    'combat.combat_mode': {
      covered: false,
      evidence: '休闲合成无战斗系统——combat 章对无战斗品类是「伪必填」'
    },
    'combat.damage_formula': { covered: false, evidence: '同上，无伤害公式' },
    'economy.currency_types': { covered: true, evidence: 'L24 贝壳币；L31 货物' },
    'economy.source_sink': { covered: true, evidence: 'L31 合成；L32 订单奖励；L48 离线收益' },
    'numeric.core_formulas': {
      covered: true,
      evidence: 'L31 R=20×等级×1.15^连击；L38 心情系数；L48 离线收益；L54-67 参数表'
    },
    'numeric.balance_principles': { covered: true, evidence: 'L14 合并永远有出路；L33 合成永无失败；L76 L8 需 128 件' },
    'mvp.mvp_scope': { covered: true, evidence: 'L81 P0 清单' },
    'mvp.mvp_timeline': { covered: false, evidence: '无研发/上线时间线，仅新手走读' }
  },
  machine: {
    'economy.ledger': 'GDD 未给逐笔账本，但有贝壳币/货物流',
    'numeric.numeric_assertions': 'L69-77 数值断言表 5 条，可复算',
    'numeric.design_claims': 'L85 验证假设与阈值 4 条',
    'vision.design_assumptions': 'L9-16 支柱反例=假设；L85 可证伪阈值'
  }
}

/**
 * 参照库全集（顺序即 UI 展示顺序：真实公开 / 本项目交付 / 合成样例）。
 * 新增参照时**必须**填 `source.attribution`；真实公开文档尽量给 `url`。
 */
export const CESHU_REFERENCE_GDDS: readonly CeshuReferenceGdd[] = [
  DOOM,
  ABYSSAL_BEACON,
  SLG_SAMPLE,
  CARD_SAMPLE,
  MERGE_SAMPLE
]

/* ------------------------------------------------------------------ */
/* 与当前文档的对比                                                     */
/* ------------------------------------------------------------------ */

/** 单份参照文档在立项阶段的必填覆盖 */
export interface CeshuReferenceComparison {
  id: string
  title: string
  genre: string
  kind: CeshuReferenceKind
  kindLabel: string
  /** 出处（直接展示，保证「有出处」） */
  attribution: string
  url?: string
  path?: string
  /** 该参照文档在立项阶段适用的必填字段数（按品类的 combat 口径） */
  total: number
  /** 参照文档覆盖数 */
  covered: number
  /** 覆盖比（0~1） */
  ratio: number
  /** 当前文档覆盖数（同一字段集合，可直接比） */
  docCovered: number
  /** 差（当前 − 参照）；正数表示比参照更全 */
  delta: number
}

/**
 * 立项阶段适用的必填字段（含品类口径）。
 *
 * 与 `computeChapterProgress(doc, 'concept')` 的分母同源：无战斗品类（按
 * `doc.meta.game_type` 判定）的 combat 章不计入——否则参照文档里的休闲合成
 * 会被「伪必填」拖低，对比就不公平了。
 */
export function conceptRequiredFields(gameType: unknown): Array<{ chapter: ChapterKey; field: string }> {
  const keys: Array<{ chapter: ChapterKey; field: string }> = []
  for (const chapter of chaptersUpToStage('concept')) {
    // 延迟 import 会打乱类型收窄，这里直接用章节适用性判定（仅 combat 受品类影响）
    if (chapter === 'combat' && !referenceChapterApplies(chapter, gameType)) continue
    for (const field of CHAPTER_REQUIRED_FIELDS[chapter] ?? []) keys.push({ chapter, field })
  }
  return keys
}

/** 该章在给定品类下是否适用（与 ceshuConstants.chapterApplicableToGenre 同口径，避免循环 import） */
function referenceChapterApplies(chapter: ChapterKey, gameType: unknown): boolean {
  if (chapter !== 'combat') return true
  const value = typeof gameType === 'string' ? gameType.trim() : ''
  return !NON_COMBAT_REFERENCE_TYPES.has(value)
}

/** 无战斗品类（与 ceshuConstants.NON_COMBAT_GAME_TYPES 保持一致，此处复制以避免循环依赖） */
const NON_COMBAT_REFERENCE_TYPES: ReadonlySet<string> = new Set(['模拟经营', '视觉小说', '派对', '休闲益智'])

/** 当前文档某字段是否有内容（与完成度口径一致：空串/空数组/空对象/0 视为未填） */
function docHasField(doc: CeshuDocument, chapter: ChapterKey, field: string): boolean {
  const value = (doc[chapter] as Record<string, unknown> | undefined)?.[field]
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value.trim() !== ''
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value as object).length > 0
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  return true
}

/**
 * 把当前文档与参照库逐份对比（**只比立项阶段的必填字段**，分母同源、可直接比）。
 *
 * 这是「有出处的对比」的全部实现：不产出任何编造的分数或行业均值，
 * 只回答「同一批必填字段，你覆盖了几个、这份真实文档覆盖了几个、出处在哪」。
 */
export function compareWithReferences(
  doc: CeshuDocument,
  references: readonly CeshuReferenceGdd[] = CESHU_REFERENCE_GDDS
): CeshuReferenceComparison[] {
  const gameType = (doc.meta as Record<string, unknown> | undefined)?.game_type
  const fields = conceptRequiredFields(gameType)

  return references.map((reference) => {
    /*
     * 每一「行」内部同分母：在当前文档适用的字段集上，再按**该参照文档自己的品类**
     * 剔除 combat（休闲合成不该因为写了 combat 而多覆盖两条）。于是
     * `docCovered` / `covered` / `total` 三个数落在同一批字段上，delta 才可解释。
     */
    const rowFields = fields.filter(({ chapter }) => referenceChapterApplies(chapter, reference.gameType))
    const covered = rowFields.filter(
      ({ chapter, field }) => reference.coverage[referenceKey(chapter, field)]?.covered === true
    ).length
    const docCovered = rowFields.filter(({ chapter, field }) => docHasField(doc, chapter, field)).length
    const total = rowFields.length
    const ratio = total === 0 ? 0 : Math.round((covered / total) * 100) / 100
    return {
      id: reference.id,
      title: reference.title,
      genre: reference.genre,
      kind: reference.kind,
      kindLabel: CESHU_REFERENCE_KIND_LABELS[reference.kind],
      attribution: reference.source.attribution,
      url: reference.source.url,
      path: reference.source.path,
      total,
      covered,
      ratio,
      docCovered,
      delta: docCovered - covered
    }
  })
}

/** 参照文档在某章的字段缺口（供「这份真实文档还差什么」展示） */
export function referenceGaps(reference: CeshuReferenceGdd, gameType?: string): string[] {
  const fields = conceptRequiredFields(gameType ?? reference.gameType)
  const gaps: string[] = []
  for (const { chapter, field } of fields) {
    if (referenceChapterApplies(chapter, reference.gameType) === false) continue
    const coverage = reference.coverage[referenceKey(chapter, field)]
    if (coverage === undefined || coverage.covered === false) {
      gaps.push(`${CHAPTER_LABELS[chapter]} · ${field}`)
    }
  }
  return gaps
}
