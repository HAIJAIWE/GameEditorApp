import { CHAPTER_KEYS, type CeshuDocument, type CeshuFieldDef } from '../reference'
import { displayFieldValue } from '../fields'
import {
  chapterDataForDoc,
  chapterFieldsForDoc,
  chapterLabelForDoc,
  computeChapterProgress,
  formatLocalTimestamp,
  isSoftwareDoc,
  visibleChaptersForDoc
} from '../model'
import { isMachineDataField } from '../workflow'

/**
 * 文档治理层 / 专题分册导出（2026-11-12）。
 *
 * 背景：与 50 份公开 GDD 抽样对比后发现，AI 生成的正文并不「字少」——它给的是
 * 带单位数字、失败路径、验收口径的可执行规格；缺的是真实文档有的**文档治理层**
 * （版本/修订/状态/审批/术语表）与**未决事项的汇总**，以及按专题编排的交付形态。
 *
 * 因此这里刻意不做三件事：
 * - 不往章节 schema 加字段（`docs/ceshu-field-necessity.md` 的结论是病根在分层入口，不在字段数）；
 * - 不编造责任人 / 排期 / 竞品真名 / 市场数据（AI 在正文标「待确认」是对的，汇总成清单即可）；
 * - 不拉长正文（`CESHU_DETAIL_REQUIREMENTS` 第 1 条：宁可短而实，不要为凑字数注水）。
 *
 * 本模块只做纯派生：从已有 doc 读出事实，把留白显式列出来，把已有内容重新编排。
 */

/* ---- 待补项清单 ---- */

/** AI 明确留白、不编造的措辞。命中即视为「待人工补齐」，不是错误。 */
const PENDING_MARKER = /待确认|待定|待补|待填|未定|待评估|待验证|待人工|待核实|待提供|TBD|TODO/i

/** 外部事实类留白：本档位常常没有对应章，需要提示扩档而不是硬塞进本章 */
const EXTERNAL_FACT_HINT = /竞品|市场|收入|流水|营收|发行|渠道|版号|合规|认证|分级|授权|用户量|DAU|ARPU/

export interface PendingItem {
  chapter: string
  chapterLabel: string
  fieldKey: string
  fieldLabel: string
  /** 命中留白措辞附近的正文片段（截断），供人工定位 */
  excerpt: string
  /** 建议责任章：默认所属章；外部事实类指向 market_analysis */
  ownerChapter: string
  ownerChapterLabel: string
  /** 该责任章不在当前档位时置 true —— 渲染时提示切档 */
  needsStageUpgrade: boolean
  /** AI 不编造排期，统一标注 */
  targetVersion: string
}

export interface GlossaryCandidate {
  term: string
  hits: number
  /** 定义留空：术语含义必须人工确认，不能由模型猜 */
  definition: string
}

export interface RevisionRow {
  version: string
  date: string
  author: string
  change: string
  approver: string
}

export interface DocGovernance {
  projectName: string
  versionLabel: string
  createdAt: string
  updatedAt: string
  versionNote: string
  rulesetId: string
  chapterCount: number
  completionPct: number
  pending: PendingItem[]
  glossary: GlossaryCandidate[]
  revisions: RevisionRow[]
}

/**
 * 分册与治理层只收「实质已写」的字段。
 *
 * `createDefaultCeshu` 的 schema.defaults 里有 `0` / `false` 这类占位计数
 * （如「主要 NPC 数量 = 0」），`displayFieldValue` 会把 0 显示成 "0"；
 * 若照单全收就会把模板占位当成规格输出，违背「不补写空话」。
 * 结构化对象同样不进分册（分册给结论，不给原始结构）。
 */
function substantiveText(field: CeshuFieldDef, value: unknown): string {
  if (value === null || value === undefined || value === '' || value === 0 || value === false) return ''
  if (Array.isArray(value)) return value.length === 0 ? '' : displayFieldValue(field, value)
  if (typeof value === 'object') return ''
  return displayFieldValue(field, value)
}

/**
 * 取命中词所在的**完整句子**做片段，不从词中间硬切。
 * 旧实现从 hit-12 截 64 字，会把「项目状态：立项通过。」切成「态：立项通过。」这类半截词，
 * 待补项清单读起来像乱码；按句读切分后，过长句再以命中词为中心收回 limit 字并加省略号。
 */
function excerptAround(text: string, limit = 64): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  const hit = flat.search(PENDING_MARKER)
  if (hit < 0) return flat.length > limit ? `${flat.slice(0, limit)}…` : flat
  const isBreak = (char: string) => /[。！？]/.test(char)
  let start = 0
  for (let i = hit - 1; i >= 0; i--) {
    if (isBreak(flat[i])) { start = i + 1; break }
  }
  let end = flat.length
  for (let i = hit; i < flat.length; i++) {
    if (isBreak(flat[i])) { end = i + 1; break }
  }
  const sentence = flat.slice(start, end).trim()
  if (sentence.length <= limit) return sentence
  const from = Math.max(0, hit - start - 18)
  return `${sentence.slice(from, from + limit)}…`
}

function projectNameOf(doc: CeshuDocument): string {
  const meta = doc.meta as Record<string, unknown>
  const raw = isSoftwareDoc(doc)
    ? (typeof meta.project_name === 'string' && meta.project_name.trim() ? meta.project_name : meta.game_name)
    : meta.game_name
  return typeof raw === 'string' && raw.trim() !== '' ? raw.trim() : (isSoftwareDoc(doc) ? '未命名软件设计文档' : '未命名策划书')
}

/** 从正文抽出「引号/书名号内」的专名候选：只给候选，不给定义 */
function collectGlossary(texts: readonly string[], limit = 15): GlossaryCandidate[] {
  const counts = new Map<string, number>()
  for (const text of texts) {
    for (const match of text.matchAll(/[「『《"]([^」』》"\n]{2,14})[」』》"]/g)) {
      const term = match[1].trim()
      if (term.length < 2) continue
      counts.set(term, (counts.get(term) ?? 0) + 1)
    }
  }
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'zh-CN'))
    .slice(0, limit)
    .map(([term, hits]) => ({ term, hits, definition: '' }))
}

/**
 * 派生文档治理信息。全部来自 doc 已有字段，不新增事实。
 * `completionPct` 与一页摘要同口径（立项必填完成度），避免两套数字打架。
 */
export function buildDocGovernance(doc: CeshuDocument): DocGovernance {
  const chapters = visibleChaptersForDoc(doc)
  const progress = computeChapterProgress(doc)
  const pending: PendingItem[] = []
  const texts: string[] = []

  for (const chapter of chapters) {
    const label = chapterLabelForDoc(doc, chapter)
    const data = chapterDataForDoc(doc, chapter)
    for (const field of chapterFieldsForDoc(doc, chapter)) {
      if (isMachineDataField(chapter, field.key)) continue
      const value = substantiveText(field, data[field.key])
      if (value === '') continue
      texts.push(value)
      if (!PENDING_MARKER.test(value)) continue
      const external = EXTERNAL_FACT_HINT.test(value)
      const ownerChapter = external ? 'market_analysis' : chapter
      pending.push({
        chapter,
        chapterLabel: label,
        fieldKey: field.key,
        fieldLabel: field.label,
        excerpt: excerptAround(value),
        ownerChapter,
        ownerChapterLabel: external ? chapterLabelForDoc(doc, 'market_analysis') : label,
        needsStageUpgrade: external && !chapters.includes('market_analysis'),
        targetVersion: '下一版（待确认）'
      })
    }
  }

  const completed = chapters.reduce((sum, key) => sum + (progress[key] ?? 0), 0)
  const versionLabel = doc.version_label || 'v1.0'
  const createdAt = (doc.created_at || '').slice(0, 10) || '（待填）'
  const updatedAt = (doc.updated_at || '').slice(0, 10) || '（待填）'
  const versionNote = (doc.version_note || '').trim()

  return {
    projectName: projectNameOf(doc),
    versionLabel,
    createdAt,
    updatedAt,
    versionNote,
    rulesetId: doc.ruleset_id || '（未落盘，导出时派生）',
    chapterCount: chapters.length,
    completionPct: chapters.length === 0 ? 0 : Math.round((completed / chapters.length) * 100),
    pending,
    glossary: collectGlossary(texts),
    revisions: [
      {
        version: versionLabel,
        date: updatedAt,
        author: '（待填）',
        change: versionNote || '初稿（由 AI 生成，待人工审校）',
        approver: '（待填）'
      }
    ]
  }
}

/** 对外提交前必须人工补齐、且本文件刻意不编造的外部事实 */
const EXTERNAL_FACTS = [
  '竞品真名与对标口径（当前正文只写品类，不写具体产品）',
  '市场容量 / 收入预测 / 定价依据',
  '发行商、渠道与上架平台清单',
  '合规认证（版号、分级、隐私与数据合规）',
  '真实排期、人力与预算（正文的人日是设计估算，不是承诺）'
] as const

function mdTable(headers: readonly string[], rows: readonly (readonly string[])[]): string {
  const escape = (cell: string) => cell.replace(/\|/g, '\\|').replace(/\n/g, ' ')
  return [
    `| ${headers.map(escape).join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((row) => `| ${row.map(escape).join(' | ')} |`)
  ].join('\n')
}

/** `governance` 格式：文档治理附录（不改正文，只把治理层与留白显式列出来） */
export function renderDocGovernanceMarkdown(doc: CeshuDocument): string {
  const g = buildDocGovernance(doc)
  const today = formatLocalTimestamp().slice(0, 10)
  const blocks: string[] = []

  blocks.push(`# 《${g.projectName}》· 文档治理附录` +
    `\n\n> 本附录由已有内容派生，**不新增事实、不改写正文**。带「（待填）」的格子必须由人填写；` +
    `AI 在正文标注的「待确认」已汇总为待补项清单，供对外提交前逐项销项。` +
    `\n> 导出日期：${today} · 档位内可见章节 ${g.chapterCount} 章 · 章节平均完成度 ${g.completionPct}%`)

  blocks.push(`## 1. 文档信息\n\n` + mdTable(
    ['项', '值', '来源'],
    [
      ['项目名', g.projectName, '文档信息'],
      ['版本', g.versionLabel, 'version_label'],
      ['文档状态', '（待填：草案 / 待审 / 已批准）', '人工填写'],
      ['规则集 ID', g.rulesetId, 'ruleset_id / 派生'],
      ['创建日期', g.createdAt, 'created_at'],
      ['最后更新', g.updatedAt, 'updated_at'],
      ['版本说明', g.versionNote || '（待填）', 'version_note'],
      ['填写人 / 审核人 / 批准人', '（待填）', '人工填写']
    ]
  ))

  blocks.push(`## 2. 修订记录\n\n` + mdTable(
    ['版本', '日期', '修改人', '修改内容', '审批'],
    g.revisions.map((r) => [r.version, r.date, r.author, r.change, r.approver])
  ) + `\n\n> 后续修订请按同一格式追加新行；不要覆盖历史行。变更规则集时同步更新「规则集 ID」。`)

  if (g.pending.length === 0) {
    blocks.push('## 3. 待补项清单\n\n当前可见章节的正文中未检出「待确认 / 待定 / 待补」类留白。')
  } else {
    const rows = g.pending.map((item, index) => [
      String(index + 1),
      item.excerpt,
      item.chapterLabel,
      item.needsStageUpgrade ? `${item.ownerChapterLabel}（需扩档）` : item.ownerChapterLabel,
      item.targetVersion
    ])
    blocks.push(`## 3. 待补项清单（${g.pending.length} 项）\n\n` +
      `正文里 AI 明确留白、没有编造的地方。逐项补实后删除本行，或把「目标版本」改成实际排期。\n\n` +
      mdTable(['#', '待补项（正文片段）', '所在章', '建议责任章', '目标版本'], rows))
  }

  blocks.push('## 4. 外部事实待补（本文件刻意不编造）\n\n' +
    EXTERNAL_FACTS.map((fact) => `- [ ] ${fact}`).join('\n') +
    '\n\n> 正文里写作「待确认」而非编一个数，是刻意的设计；对外提交前需由业务方补实并注明出处。')

  if (g.glossary.length === 0) {
    blocks.push('## 5. 术语表\n\n正文未检出带引号的专名。请按下面的格式人工补充术语与定义。\n\n' +
      mdTable(['术语', '定义', '来源章', '负责人'], [['（待填）', '（待填）', '（待填）', '（待填）']]))
  } else {
    blocks.push(`## 5. 术语表（${g.glossary.length} 个候选）\n\n` +
      '下列专名从正文引号内自动抽出，**只是候选，定义必须人工确认**；误抽的删掉即可。\n\n' +
      mdTable(['术语', '出现次数', '定义', '来源章', '负责人'],
        g.glossary.map((item) => [item.term, String(item.hits), '（待填）', '（待填）', '（待填）'])))
  }

  blocks.push('## 6. 协作约定（模板，需团队确认后生效）\n\n' +
    mdTable(['约定', '内容'], [
      ['填写人', '（待填）'],
      ['审核人 / 批准人', '（待填）'],
      ['超期处理', '（待填：如「目标版本到期未销项则升级评审」）'],
      ['变更流程', '（待填：改数值需同步更新规则集 ID 与实现契约）'],
      ['附录清单', '（待填：流程图 / 界面草图 / 数据表 / 原型 Demo 的存放位置）']
    ]))

  return blocks.join('\n\n---\n\n') + '\n'
}

/* ---- 专题分册 ---- */

export interface SpecBookletDef {
  key: string
  title: string
  purpose: string
  chapters: readonly string[]
}

/**
 * 四册按「谁会拿这一册去开工」划分，而不是按章号切段。
 * 章节 key 来自 `CESHU_STAGE_CHAPTERS` 的 24 章全集；当前档位没有的章自动跳过，
 * 不会为了凑册而生成空内容。
 */
export const SPEC_BOOKLETS: readonly SpecBookletDef[] = [
  {
    key: 'numeric',
    title: '数值分册',
    purpose: '给数值策划 / 程序：公式、参数表、曲线与验收断言',
    chapters: ['numeric', 'combat', 'economy']
  },
  {
    key: 'system',
    title: '系统分册',
    purpose: '给系统策划 / 程序：状态机、玩法规则、界面与技术约束',
    chapters: ['systems', 'gameplay', 'uiux', 'tech']
  },
  {
    key: 'narrative',
    title: '叙事分册',
    purpose: '给剧情 / 关卡 / 美术 / 音频：世界观、关卡与视听方向',
    chapters: ['story', 'level_design', 'art', 'audio']
  },
  {
    key: 'delivery',
    title: '交付分册',
    purpose: '给制作人 / 测试 / 发行：范围、验收、资源与上线',
    chapters: ['mvp', 'qa', 'resources', 'publishing', 'risk_handling', 'live_ops', 'performance']
  }
] as const

export interface SpecBooklet {
  def: SpecBookletDef
  entries: {
    chapter: string
    label: string
    fields: { label: string; value: string }[]
  }[]
  /** 本册正文里提到其它册章名的次数，用于跨册回链 */
  crossRefs: { label: string; booklet: string; hits: number }[]
}

function bookletOfChapter(chapter: string): string | null {
  for (const def of SPEC_BOOKLETS) {
    if (def.chapters.includes(chapter)) return def.title
  }
  return null
}

/** 派生四册：只重组已写内容，不生成新正文 */
export function buildSpecBooklets(doc: CeshuDocument): SpecBooklet[] {
  const visible = visibleChaptersForDoc(doc)
  /*
   * 回链词表必须覆盖 **24 章全集**，不能只取当前档位可见章：
   * 立项档正文里写「见关卡设计章」时，那一章还没生成，恰恰是最需要提示「去叙事分册 / 需扩档」的引用。
   */
  const labelCandidates = [...new Set<string>([...visible, ...CHAPTER_KEYS])]
  const labels = new Map(labelCandidates.map((key) => [key, chapterLabelForDoc(doc, key)]))
  const bookletByChapter = new Map<string, string>()
  for (const chapter of labelCandidates) {
    const title = bookletOfChapter(chapter)
    if (title) bookletByChapter.set(chapter, title)
  }

  return SPEC_BOOKLETS.map((def) => {
    const entries: SpecBooklet['entries'] = []
    const texts: string[] = []
    for (const chapter of def.chapters) {
      if (!visible.includes(chapter)) continue
      const data = chapterDataForDoc(doc, chapter)
      const fields: { label: string; value: string }[] = []
      for (const field of chapterFieldsForDoc(doc, chapter)) {
        if (isMachineDataField(chapter, field.key)) continue
        const value = substantiveText(field, data[field.key])
        if (value === '') continue
        fields.push({ label: field.label, value })
        texts.push(value)
      }
      if (fields.length > 0) entries.push({ chapter, label: chapterLabelForDoc(doc, chapter), fields })
    }

    const cross = new Map<string, { booklet: string; hits: number }>()
    const body = texts.join('\n')
    for (const [chapter, label] of labels) {
      if (label.length < 3) continue
      const target = bookletByChapter.get(chapter)
      if (!target || target === def.title) continue
      const hits = body.split(label).length - 1
      if (hits === 0) continue
      const key = `${label}|${target}`
      cross.set(key, { booklet: target, hits: (cross.get(key)?.hits ?? 0) + hits })
    }

    return {
      def,
      entries,
      crossRefs: [...cross.entries()]
        .map(([key, value]) => ({ label: key.split('|')[0], booklet: value.booklet, hits: value.hits }))
        .sort((a, b) => b.hits - a.hits)
        .slice(0, 8)
    }
  })
}

/** `booklets` 格式：一份文件里给四册，各带目录、已写内容与跨册回链 */
export function renderSpecBookletsMarkdown(doc: CeshuDocument): string {
  const booklets = buildSpecBooklets(doc)
  const blocks: string[] = [`# 《${projectNameOf(doc)}》· 专题分册`,
    '> 同一份策划书按「谁来用」重排成四册，内容全部来自已写章节，未作的章不补写。' +
    '\n> 跨册回链由正文中出现的章名自动统计，仅供定位，不代表章间依赖已评审。']

  for (const booklet of booklets) {
    const lines: string[] = [`## ${booklet.def.title}`, '', `> ${booklet.def.purpose}`, '']
    if (booklet.entries.length === 0) {
      lines.push('（当前档位未包含本册的章节；切到「制作 / 全量」档生成后再导出本册。）')
      blocks.push(lines.join('\n'))
      continue
    }
    lines.push('### 本册目录', '')
    for (const entry of booklet.entries) {
      lines.push(`- ${entry.label}（${entry.fields.length} 项已填）`)
    }
    if (booklet.crossRefs.length > 0) {
      lines.push('', '### 跨册回链', '')
      for (const ref of booklet.crossRefs) {
        lines.push(`- 本册正文提到「${ref.label}」${ref.hits} 次 → 见《${ref.booklet}》`)
      }
    }
    lines.push('', '### 本册内容', '')
    for (const entry of booklet.entries) {
      lines.push(`#### ${entry.label}`, '')
      for (const field of entry.fields) {
        lines.push(`- **${field.label}**：${field.value}`)
      }
      lines.push('')
    }
    blocks.push(lines.join('\n').trimEnd())
  }

  return blocks.join('\n\n---\n\n') + '\n'
}
