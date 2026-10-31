import { CHAPTER_LABELS, chapterAnchorOf, type CeshuDocument, type ChapterKey, type SystemEntry } from '../reference/ceshuConstants'
import { GENRE_REVIEW_PROFILES } from '../prompts/ceshuAiData'
import { CESHU_CHAPTER_FIELDS, fieldColumns, fieldLabelOf } from '../fields/ceshuFields'
import { isFilledValue } from '../model/ceshuModel'
import { SYSTEM_CONFIG_SCHEMA } from '../model/systemConfigSchema'
import { column, toRowStrings } from './ceshuPipeRows'
import { escapeCell, formatScalar } from './ceshuHandoffMarkdown'
import { handoffVolumeIndexPath, readPath } from './ceshuHandoffPaths'
import {
  buildHandoffPlan,
  docChapters,
  planHandoffDocs,
  resolveHandoffGenre,
  type HandoffRenderContext,
  type PlannedHandoffDoc
} from './ceshuHandoffPlan'
import { docRoles, HANDOFF_ROLE_LABELS } from './ceshuHandoffRoles'
import { renderApiContractSection, renderEngineeringWbsSection, renderPerfPlaybookSection, renderScaffoldSection } from './ceshuHandoffRenderSections'
import { acceptanceCheck, acceptanceText, type HandoffDoc, type HandoffDocSystem } from './ceshuHandoffTypes'
import { HANDOFF_VOLUMES } from './ceshuHandoffVolumes'

/**
 * 渲染单份设计文档（= 一个可独立验收的施工单元）。
 *
 * 结构固定：解决什么 → 顺序与依赖 → 门禁状态 → 要实现什么 → 规则与数据 →
 * （专属章节）→ 验收 → 本作类型的额外检查点 → 明确不做。
 */

interface DocBuildUnits {
  /** 要实现的状态/公式/判定 */
  rules: string[]
  /** 要做的界面与交互 */
  ui?: string[]
}

/**
 * 每份文档的「实现单元」。
 *
 * 为什么要单独写：字段值告诉 AI「设计是什么」，但不告诉它「要写哪些代码」。
 * 补上规则/界面两条，能显著减少自由发挥（幻觉多来自「文档没说，但实现必须决定」的地方）。
 * 数据类不手写——从字段类型自动派生（表格字段 → 表，系统 → 配置表），避免两处漂移。
 */
const DOC_BUILD: Record<string, DocBuildUnits> = {
  'arch-scope': {
    rules: ['至少 3 条「明确不做」，实现方不得自行添加', '平台决定输入方式：触屏点击区 ≥44px，键鼠要可重映射'],
    ui: ['主菜单：开始 / 设置 / 退出']
  },
  'arch-stack': {
    rules: ['模块边界写成「谁调用谁」，禁止循环依赖', '数据层 ← 玩法层 ← 界面层 单向依赖']
  },
  'arch-data': {
    rules: ['每张表给主键 + 至少 3 个字段的类型', '表间引用用 id 字符串，不用嵌套对象']
  },
  'arch-state': {
    rules: ['每条转移写清：事件 → 结算 → 新状态', '切状态时说明哪些数据被重置、哪些保留', '不允许存在无法退出的状态']
  },
  'arch-save': {
    rules: ['写入时机与触发点一致（自动/手动）', '缺字段按默认值补齐，旧档不得崩溃']
  },
  'arch-scaffold': {
    rules: ['目录按模块边界划分，禁止循环依赖', '数值/配置走数据驱动，不写死在代码', '首批只落地「状态机骨架 + 存档 + 最小可玩循环」，不提前铺系统']
  },
  'core-loop': {
    rules: ['循环每一步都有 ≤1s 的可见反馈', '一局结束必须有结算页与「再来一次」'],
    ui: ['局内 HUD：资源 / 进度 / 退出']
  },
  'core-input': {
    rules: ['所有输入都有取消/返回路径', '胜负判定写成布尔表达式，可复现']
  },
  'core-combat': {
    rules: ['伤害只在**一处**计算，其余模块调用它', '元素克制系数进参数表', '单场时长按目标节奏校准']
  },
  'core-numeric': {
    rules: ['数值全部从参数表读取，禁止字面量', '每条断言必须可复算（含容差）']
  },
  'content-levels': {
    rules: ['关卡从数据表加载，不写死', '解锁条件按表判定'],
    ui: ['关卡选择页（含解锁状态）']
  },
  'content-curve': {
    rules: ['难度系数与曲线同向', '前 3 关各只引入一个机制']
  },
  'content-enemy': {
    rules: ['每种敌人有独立行为参数（不是换皮）', 'Boss 阶段切换有明确触发条件与提示']
  },
  'content-branch': {
    rules: ['每个结局至少一条可达路径', '关键抉择要改变后续可用选项']
  },
  'content-idle': {
    rules: ['离线收益按时间差计算，与在线同一公式', '回归弹窗给出收益明细与下一步目标']
  },
  'sys-equipment': {
    rules: ['槽位/品质/强化上限从配置读', '强化、镶嵌、附魔的数值进参数表', '词条生成有明确权重与数量上限']
  },
  'sys-growth': {
    rules: ['升级公式可复算', '属性成长单调，无断崖与爆炸点']
  },
  'sys-economy': {
    rules: ['每种货币都有产出与回收', '账本示例逐笔能对上（初始+交易=期末）']
  },
  'sys-skill': {
    rules: ['技能效果由数据驱动，不写死分支', 'Buff 叠加与驱散规则明确']
  },
  'sys-gacha': {
    rules: ['概率与保底可复算（含期望值）', '抽卡资源与付费档位一一对应']
  },
  'sys-social': {
    rules: ['联盟权限矩阵明确（谁能做什么）', '匹配与结算结果可复现']
  },
  'sys-sim': {
    rules: ['产出与消耗速率成对定义', '长线不出现通胀或枯竭']
  },
  'sys-quest': {
    rules: ['任务类型 / 上限 / 奖励走配置，不写死', '剧情与支线可数据配置', '引导链路能到首个核心循环']
  },
  'sys-content': {
    rules: ['关卡总数 / 难度档次走配置', '体力上限与恢复速率可调', '扫荡 / 星级规则可配置']
  },
  'sys-customization': {
    rules: ['外观槽位与可换部件可配置', '外观付费不提供数值优势', '资产规格与美术章一致']
  },
  'ui-flow': {
    rules: ['每条流程有明确出口', '核心操作 ≤3 步'],
    ui: ['主界面常驻入口（≤4 个）']
  },
  'ui-feedback': {
    rules: ['≥3 秒等待显示进度或倒计时', '破坏性操作二次确认']
  },
  'content-waves': {
    rules: ['逐波复算「总血量 ≤ 可用 DPS × 时间」', '漏怪扣血与失败条件写成可判定规则'],
    ui: ['波次倒计时与塔位高亮']
  },
  'content-build': {
    rules: ['采集速率与建造消耗成对定义', '建造前置（科技/材料）按数据判定']
  },
  'content-map': {
    rules: ['兴趣点按区域配置，密度可统计', '解锁顺序不得让其余内容失去意义']
  },
  'tech-server': {
    rules: ['权威端在服务端：客户端只做表现，关键数值服务端算', '断线重连幂等（重放不刷资源）', '协议版本号随客户端走，旧版本明确拒绝'],
    ui: ['断线提示与重连进度']
  },
  'audio-impl': {
    rules: ['音效由事件触发（事件 → 音效 id），不散写在界面里', '并发上限与优先级进配置，超限按优先级丢弃'],
    ui: ['设置页：主音量 / 音乐 / 音效 三档']
  },
  'art-asset': {
    rules: ['每种资产尺寸/格式/命名进一张表，缺失即视为未定', '命名可机读（前缀+用途+序号），不靠中文名找文件', '导入设置写明（压缩/Atlas/最大尺寸），换平台不重对']
  },
  'polish-perf': {
    rules: ['预算按场景拆分，超标即视为不达标']
  },
  'polish-analytics': {
    rules: ['事件名与字段与埋点表一致，不多不少']
  },
  'polish-l10n': {
    rules: ['文案走 key，不硬编码在界面里', '字体覆盖首发语言的全部字符']
  },
  'arch-api': {
    rules: [
      '每个模块至少定义一个对外接口：输入 / 输出 / 依赖 / 错误码',
      '模块单向依赖（数据层 ← 玩法层 ← 界面层），禁止反向调用',
      '错误码统一前缀（E_ / W_），错误不吞、不静默'
    ]
  },
  'eng-wbs': {
    rules: [
      '按 M1→M6 顺序施工，每阶段验收通过再进下一阶段',
      '每条任务都能追到一份设计文档（引用其路径）',
      '数值/关卡/系统配置全部走数据文件，不写死'
    ]
  }
}

/**
 * 该文档要接哪些**品类追问**（来自 `GENRE_REVIEW_PROFILES`）。
 *
 * AI 审阅已经按品类下发不同追问；交接包沿用同一份文案，让「验收」也随品类变，
 * 而不是所有游戏共用一套检查点。`numeric` = 数值向追问，`choice` = 取舍向追问。
 */
const DOC_PROBES: Record<string, Array<'numeric' | 'choice'>> = {
  'core-loop': ['choice'],
  'core-input': ['choice'],
  'core-combat': ['numeric', 'choice'],
  'core-numeric': ['numeric'],
  'content-levels': ['numeric'],
  'content-curve': ['numeric'],
  'content-waves': ['numeric'],
  'sys-equipment': ['numeric'],
  'sys-growth': ['numeric'],
  'sys-economy': ['numeric'],
  'sys-gacha': ['numeric'],
  'sys-skill': ['choice'],
  'ui-flow': ['choice'],
  'ui-feedback': ['choice']
}

/** 数据类实现单元：从字段类型派生（表格字段 → 表；系统 → 配置表） */
function derivedDataItems(doc: CeshuDocument, def: HandoffDoc): string[] {
  const items: string[] = []
  for (const item of def.fields) {
    const fieldDef = (CESHU_CHAPTER_FIELDS[item.chapter] ?? []).find((field) => field.key === item.field)
    if (fieldDef?.kind === 'pipeList') items.push(`表：${fieldLabelOf(item.chapter, item.field)}`)
  }
  for (const system of def.systems ?? []) {
    const entry = readPath(doc.systems, system.key) as SystemEntry | undefined
    items.push(`配置：${entry?.name ?? system.key}（${system.key}）`)
  }
  return items
}

/**
 * 渲染一个字段的值：有 `columns` 的 pipeList 出真表格，其余原样（列表/段落）。
 * 空值显式写成「（未填写）」——交接包里最怕的就是空着不说，实现方以为不用做。
 */
function renderValueOf(chapter: ChapterKey, fieldKey: string, value: unknown): string {
  if (!isFilledValue(value)) return '（未填写 —— 实现方只能自行决定，建议先补齐）'
  const columns = fieldColumns(chapter, fieldKey)
  if (columns.length > 0 && Array.isArray(value)) {
    const rows = toRowStrings(value, columns)
    const head = `| ${columns.map((item) => item.label).join(' | ')} |`
    const sep = `| ${columns.map(() => '---').join(' | ')} |`
    const body = rows.map((row) => `| ${columns.map((_item, index) => escapeCell(column(row, index))).join(' | ')} |`)
    return [head, sep, ...body].join('\n')
  }
  if (Array.isArray(value)) return value.map((item) => `- ${formatScalar(item)}`).join('\n')
  return formatScalar(value)
}

/** 读字段并渲染（`doc` 显式传入：不做模块级可变状态，渲染可重入） */
function renderField(doc: CeshuDocument, chapter: ChapterKey, fieldKey: string): string {
  return renderValueOf(chapter, fieldKey, readPath(doc[chapter], fieldKey))
}

/** 渲染一个系统配置块（启用时列配置表，未启用时说明「本作不做」） */
function renderSystemBlock(doc: CeshuDocument, system: HandoffDocSystem): string {
  const entry = readPath(doc.systems, system.key) as SystemEntry | undefined
  const lines: string[] = []
  lines.push(`### 系统 · ${entry?.name ?? system.key}（${system.key}）`)
  lines.push('')
  lines.push(`> 为什么必须写清：${system.why}`)
  lines.push('')
  if (entry === undefined || entry.enabled !== true) {
    lines.push('**未启用** —— 若本作不做这个系统，可整节跳过；若要做，先在「文档信息 → 游戏系统」里启用它。')
    lines.push('')
    return lines.join('\n')
  }
  const schema = SYSTEM_CONFIG_SCHEMA[system.key] ?? {}
  const config = (entry.config ?? {}) as Record<string, unknown>
  const rows: string[] = []
  for (const [key, raw] of Object.entries(config)) {
    if (raw === '' || raw === null || raw === undefined || (Array.isArray(raw) && raw.length === 0)) continue
    const def = schema[key]
    const value = Array.isArray(raw) ? raw.map((item) => String(item)).join('、') : formatScalar(raw)
    const range =
      def?.values !== undefined
        ? def.values.map((item) => def.optionLabels?.[item] ?? item).join(' / ')
        : def?.from !== undefined
          ? `${def.from}–${def.to}`
          : ''
    rows.push(`| ${def?.label ?? key} | ${escapeCell(value)} | ${escapeCell(range)} |`)
  }
  if (rows.length === 0) {
    lines.push('（配置全空 —— 该系统的规则还没定，实现方只能自己编）')
  } else {
    lines.push('| 配置项 | 值 | 可选范围 |')
    lines.push('| --- | --- | --- |')
    lines.push(...rows)
  }
  lines.push('')
  return lines.join('\n')
}

/** 「要实现什么（按类分）」：数据自动派生，规则/界面手写 */
function renderBuildSection(doc: CeshuDocument, def: HandoffDoc): string {
  const build = DOC_BUILD[def.id]
  const data = derivedDataItems(doc, def)
  const lines: string[] = []
  lines.push('## 要实现什么（按类分）')
  lines.push('')
  lines.push('### 数据')
  lines.push('')
  if (data.length === 0) lines.push('- （本文档不新增数据表；按现有 schema 读写）')
  else for (const item of data) lines.push(`- ${item}`)
  lines.push('')
  lines.push('### 规则')
  lines.push('')
  if (build === undefined || build.rules.length === 0) lines.push('- （见「规则与数据」）')
  else for (const item of build.rules) lines.push(`- ${item}`)
  lines.push('')
  if (build?.ui !== undefined && build.ui.length > 0) {
    lines.push('### 界面')
    lines.push('')
    for (const item of build.ui) lines.push(`- ${item}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** 文档里字段 + 系统块的正文 */
function renderDocBody(doc: CeshuDocument, def: HandoffDoc): string {
  const lines: string[] = []
  for (const item of def.fields) {
    lines.push(`### ${CHAPTER_LABELS[item.chapter]} · ${fieldLabelOf(item.chapter, item.field)}`)
    lines.push('')
    lines.push(`> 为什么必须写清：${item.why}`)
    lines.push('')
    lines.push(renderField(doc, item.chapter, item.field))
    lines.push('')
  }
  for (const system of def.systems ?? []) {
    lines.push(renderSystemBlock(doc, system))
  }
  return lines.join('\n')
}

/**
 * 本作类型的额外检查点：把 `GENRE_REVIEW_PROFILES` 的追问接到该文档的验收里。
 * 组合品类会逐档案列出（SLG+卡牌 → 两套追问），不合并成一句含糊的话。
 */
function renderGenreProbes(doc: CeshuDocument, def: HandoffDoc): string {
  const kinds = DOC_PROBES[def.id]
  if (kinds === undefined || kinds.length === 0) return ''
  const { profiles } = resolveHandoffGenre(doc)
  const lines: string[] = []
  for (const key of profiles) {
    const profile = GENRE_REVIEW_PROFILES[key]
    const parts: string[] = []
    if (kinds.includes('numeric') && profile.numeric !== undefined) parts.push(`数值：${profile.numeric}`)
    if (kinds.includes('choice') && profile.choice !== undefined) parts.push(`取舍：${profile.choice}`)
    if (parts.length === 0) continue
    if (lines.length === 0) {
      lines.push('## 本作类型的额外检查点（做完连同验收一起过）')
      lines.push('')
    }
    lines.push(`**${profile.label}**`, '')
    for (const part of parts) lines.push(`- ${part}`)
    lines.push('')
  }
  return lines.join('\n')
}

/** 渲染单份文档 */
export function renderHandoffDoc(
  doc: CeshuDocument,
  planned: PlannedHandoffDoc,
  generatedAt: string,
  context?: HandoffRenderContext
): string {
  const def = planned.def
  const volume = planned.volume
  const ctx = context ?? { plan: buildHandoffPlan(doc), planned: planHandoffDocs(doc) }
  const siblings = ctx.planned.filter((item) => item.volume.id === volume.id)
  const position = siblings.findIndex((item) => item.def.id === def.id) + 1
  const previous = position > 1 ? siblings[position - 2] : undefined
  const next = position < siblings.length ? siblings[position] : undefined
  const status = ctx.plan.flatMap((item) => item.docs).find((item) => item.doc.id === def.id)
  const genre = resolveHandoffGenre(doc)
  {
    const lines: string[] = []
    lines.push(`# ${String(volume.index).padStart(2, '0')}-${String(planned.number).padStart(2, '0')} · ${def.title}`)
    lines.push('')
    lines.push(
      `> 游戏：${String(doc.meta.game_name ?? '未命名')} ｜ 所属：${volume.title} ｜ 生成时间：${generatedAt}`
    )
    lines.push(
      `> 品类：${String(doc.meta.game_type ?? '未指定')}（${genre.primaryLabel}）${
        genre.composite ? ` ｜ 组合：${genre.tags.join(' + ')}` : ''
      }`
    )
    lines.push(`> 本卷共 ${siblings.length} 份文档，这是第 ${position} 份。**只实现本文档范围。**`)
    const roles = docRoles(def)
    if (roles.length > 0) lines.push(`> 负责角色：${roles.map((role) => HANDOFF_ROLE_LABELS[role]).join('、')}`)
    const layerLabel =
      planned.layer === 'baseline' ? '通用基线（任何游戏都要做）' : planned.layer === 'genre' ? '品类专属（由游戏类型决定）' : '条件文档（由项目事实决定）'
    lines.push(`> 层级：${layerLabel}`)
    /*
     * 来源回链：工程师按「要做的东西」找文档，但设计意图写在「章」里。
     * 没有这行，从 `03-系统/01-装备与词条.md` 回到「第六章·经济系统设计」要靠人肉翻 24 章；
     * 有这行，追溯成本是 0，且锚点与 gdd.md 目录共用 `chapterAnchorOf` 同一套口径。
     */
    const sourceChapters = [...docChapters(def)]
    if (sourceChapters.length > 0) {
      lines.push(`> 来源：${sourceChapters.map((key) => `${CHAPTER_LABELS[key]}（gdd.md#${chapterAnchorOf(key)}）`).join('、')}`)
    }
    lines.push('')
    lines.push('## 这份文档要解决什么')
    lines.push('')
    lines.push(def.purpose)
    lines.push('')
    lines.push('## 顺序与依赖')
    lines.push('')
    lines.push(previous === undefined ? '- 上游：无（本卷第一份）' : `- 上游：\`${previous.path}\`（须先完成）`)
    lines.push(next === undefined ? '- 下游：无（本卷最后一份）' : `- 下游：\`${next.path}\``)
    if (volume.requires.length > 0) {
      lines.push(
        `- 跨卷前置：${volume.requires
          .map((id) => {
            const required = HANDOFF_VOLUMES.find((item) => item.id === id)
            return required === undefined ? id : `${String(required.index).padStart(2, '0')} ${required.title}`
          })
          .join('、')}`
      )
    }
    /*
     * 最小上下文：上下文窗口有限，20+ 份文档全读会爆，也会让注意力被无关内容稀释。
     * 明确「只读这三份就能开工」，比让 agent 自己判断该读什么可靠得多。
     */
    lines.push(
      previous === undefined
        ? `- 开工只读：本文档 + \`${handoffVolumeIndexPath(volume)}\`（新卷先定位）+ \`contract.json\``
        : '- 开工只读：本文档 + `contract.json`（上游是上一轮刚做完的，不必重读）'
    )
    lines.push('')
    lines.push('## 门禁状态')
    lines.push('')
    if (status !== undefined) {
      lines.push(
        `本文档字段 ${status.fieldFilled}/${status.fieldTotal} 已填写；相关校验问题 ${status.blockers.length} 条。` +
          (status.ready ? ' **可以开工。**' : status.applicable ? ' **建议先补齐再开工。**' : '')
      )
      if (status.configFieldTotal > 0) {
        const configHint =
          status.configFieldFilled === 0
            ? '（全空，实现方只能自己编）'
            : status.configFieldFilled < status.configFieldTotal
              ? '（未填项可能是有意留空，请确认）'
              : ''
        lines.push('')
        lines.push(`系统配置：已填 ${status.configFieldFilled}/${status.configFieldTotal} 项${configHint}。`)
      }
      if (!status.applicable) {
        lines.push('')
        lines.push(
          '**本文档当前不适用**：它依赖的游戏系统全部未启用。本作不做这些系统的话可整份跳过；要做，先在「文档信息 → 游戏系统」里启用。'
        )
      }
      if (status.missing.length > 0) {
        lines.push('')
        lines.push(`还差：${status.missing.map((item) => `${CHAPTER_LABELS[item.chapter]}·${item.label}`).join('、')}`)
      }
      if (status.systemsEnabled.length > 0) {
        lines.push('')
        lines.push(`涉及系统：${status.systemsEnabled.join('、')}`)
      }
      if (status.blockers.length > 0) {
        lines.push('')
        for (const message of status.blockers.slice(0, 10)) lines.push(`- ${message}`)
        if (status.blockers.length > 10) lines.push(`- …… 其余 ${status.blockers.length - 10} 条见校验报告`)
      }
      lines.push('')
    }
    lines.push(renderBuildSection(doc, def))
    lines.push('## 规则与数据')
    lines.push('')
    lines.push(renderDocBody(doc, def))
    if (def.id === 'arch-scaffold') lines.push(renderScaffoldSection(doc))
    if (def.id === 'arch-api') lines.push(renderApiContractSection())
    if (def.id === 'polish-perf') lines.push(renderPerfPlaybookSection())
    if (def.id === 'eng-wbs') lines.push(renderEngineeringWbsSection(doc))
    lines.push('## 验收（做完逐条打勾）')
    lines.push('')
    for (const item of def.acceptance) {
      // 非人工判定才标出来：老文档（全字符串）渲染结果逐字不变，避免无意义 diff
      const check = acceptanceCheck(item)
      const tag = check === 'assertion' ? '（判定：contract.json 断言）' : check === 'test' ? '（判定：自动化测试）' : ''
      lines.push(`- [ ] ${acceptanceText(item)}${tag}`)
    }
    lines.push('')
    const probes = renderGenreProbes(doc, def)
    if (probes !== '') lines.push(probes)
    lines.push('## 明确不做')
    lines.push('')
    for (const item of def.outOfScope ?? volume.outOfScope) lines.push(`- ${item}`)
    lines.push('')
    return lines.join('\n')
  }
}
