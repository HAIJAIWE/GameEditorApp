import type { CeshuDocument } from '../reference'
import {
  evaluateHandoffAcceptances,
  summarizeHandoffAcceptances,
  type HandoffAcceptanceContext,
  type HandoffAcceptanceResult,
  type HandoffAcceptanceSummary
} from './ceshuHandoffAcceptance'
import { handoffVolumeIndexPath, stripProgressSnapshot } from './ceshuHandoffPaths'
import { buildHandoffPlan, planHandoffDocs } from './ceshuHandoffPlan'
import type { HandoffDocStatus, PlannedHandoffDoc } from './ceshuHandoffPlan'
import { acceptanceCheck, acceptanceText } from './ceshuHandoffTypes'

/**
 * **派工单**（work order）：把交接包翻译成「编码智能体开工的第一句话」。
 *
 * ## 为什么要它
 * 交接包导出后是一条死路：几十个文件躺在磁盘上，客户端没有任何按钮把它交给编码智能体。
 * 用户只能自己手写一段提示，而「读哪份、先读什么、按什么顺序、怎么算做完」全都散在
 * README / index.json / 每份文档的门禁段里。实测（2026-11-09）导出后既不开目录、也不建工程、
 * 也不派活——链路断在最后一步。
 *
 * 这份文本把四件事压成一段可粘贴的提示：
 * 1. **只做一份**（点明本次是哪份文档，不是「把整包实现」）；
 * 2. **开工只读什么**（本文档 + 卷 README + contract.json，与 index.json 的 minimalContext 同源）；
 * 3. **门禁与验收**（ready / blockers / 验收条目及判定方式，机器可判的必须真跑）；
 * 4. **收尾写哪**（在工作区追加 `进度.md` 一行，下一轮据此跳过已完成的）。
 *
 * 纯函数、零 LLM：文案与顺序全部来自既有交接包规划（planHandoffDocs / buildHandoffPlan），
 * 不发明新数据，也不复制文档正文。
 */

/** 进度文件名（写在**代码工作区根**，不是交接包里——交接包只读） */
export const HANDOFF_PROGRESS_FILE = '进度.md'

/** 技术设计文档的默认落点（`<库>/tech`，由 `system.tech_doc` 技能读写） */
export const TDD_DIR_HINT = 'tech'

export interface WorkOrderOptions {
  /** 交接包目录（绝对路径，原样写进提示） */
  bundleDir: string
  /** 代码工作区根（绝对路径） */
  workspace: string
  /** 已完成的文档相对路径（从 `进度.md` 读到）；缺省 = 从头开始 */
  completed?: string[]
  /** TDD 文档路径（`<库>/tech/<名>.md`）；缺省则提示智能体先写一份 */
  tddPath?: string
  /**
   * 验收现状（契约 / 数据表 / 策划书本体）。
   * 缺省 = 只出判定方式、不给结论（纯函数，不自己去读文档建契约）。
   */
  context?: HandoffAcceptanceContext
  /**
   * 指定要派的那一份（交接包内相对路径）。
   *
   * 缺省 = 自动挑「适用且未完成里第一份门禁就绪的」。施工看板里点某一份的
   * 「派这一份」就走这里——用户已经点明了做哪份，不该再让自动选择器替他挑。
   * 指定的路径不在适用清单里时不静默改派：照旧派自动挑的那份，**并在正文里说明**。
   */
  targetPath?: string
}

export interface WorkOrderAcceptance {
  id: string
  text: string
  /** assertion / data / field / test / manual */
  check: string
  /** 机器判定给的结论（test / manual 恒为 unverified）；没注入现状时也标 unverified */
  verdict: string
  /** 一句话依据：复算了几条、哪条没过、缺哪张表…… */
  evidence: string
}

export interface WorkOrderTarget {
  /** 交接包内相对路径 */
  path: string
  title: string
  /** 卷内序号（裁剪后重排） */
  number: number
  volumeTitle: string
  /** 卷 README 的相对路径 */
  volumeIndex: string
  /** 门禁：可开工 / 未就绪 */
  ready: boolean
  fieldFilled: number
  fieldTotal: number
  /** 还缺的字段（中文名） */
  missing: string[]
  blockers: string[]
  /** 开工必读（与 index.json 的 minimalContext 同源） */
  minimalContext: string[]
  acceptance: WorkOrderAcceptance[]
  /** 验收结论汇总（机器判定的几条过、几条没过） */
  verdicts: HandoffAcceptanceSummary | null
  purpose: string
}

export interface WorkOrder {
  markdown: string
  /** 本次要做的文档；适用的已全部完成时为 null */
  target: WorkOrderTarget | null
  /** 适用文档数 */
  applicableCount: number
  /** 其中门禁已通过的数 */
  readyCount: number
  /** 已完成数（按传入的 completed 命中计） */
  doneCount: number
  /** 剩余数（适用且未完成） */
  remaining: number
  /** 调用方指定要派的那一份（没指定为 null）；没命中时正文里会说明改派了谁 */
  requestedPath: string | null
}

/** 文档 id → 门禁状态 */
function statusMap(doc: CeshuDocument): Map<string, HandoffDocStatus> {
  const map = new Map<string, HandoffDocStatus>()
  for (const volume of buildHandoffPlan(doc)) {
    for (const status of volume.docs) map.set(status.doc.id, status)
  }
  return map
}

function buildTarget(
  item: PlannedHandoffDoc,
  status: HandoffDocStatus | undefined,
  acceptanceContext: HandoffAcceptanceContext | undefined
): WorkOrderTarget {
  // 验收结论：机器判定（assertion / data / field）拿现状真算一遍，test / manual 恒 unverified。
  const verdictMap = new Map<string, HandoffAcceptanceResult>()
  let verdicts: HandoffAcceptanceSummary | null = null
  if (acceptanceContext !== undefined) {
    const results = evaluateHandoffAcceptances(item.def.id, item.def.acceptance, acceptanceContext)
    for (const result of results) verdictMap.set(result.id, result)
    verdicts = summarizeHandoffAcceptances(results)
  }
  // 与 index.json 的 minimalContext 同源：卷内第一份还要读卷 README，其余只读契约。
  const readContext =
    item.number === 1 ? [handoffVolumeIndexPath(item.volume), 'contract.json'] : ['contract.json']
  return {
    path: item.path,
    title: item.def.title,
    number: item.number,
    volumeTitle: item.volume.title,
    volumeIndex: handoffVolumeIndexPath(item.volume),
    ready: status?.ready ?? false,
    fieldFilled: status?.fieldFilled ?? 0,
    fieldTotal: status?.fieldTotal ?? 0,
    missing: (status?.missing ?? []).map((entry) => entry.label),
    blockers: status?.blockers ?? [],
    minimalContext: readContext,
    acceptance: item.def.acceptance.map((entry, index) => {
      const id = item.def.id + '-a' + String(index + 1)
      const verdict = verdictMap.get(id)
      return {
        id,
        text: acceptanceText(entry),
        check: acceptanceCheck(entry),
        verdict: verdict?.verdict ?? 'unverified',
        evidence: verdict?.evidence ?? ''
      }
    }),
    verdicts,
    purpose: item.def.purpose
  }
}

/** 验收条目后面的「现状」标记（没注入现状时不写，保持老派工单原样） */
function verdictTag(entry: WorkOrderAcceptance): string {
  if (entry.verdict === 'pass') return ' ← 现状：已通过（' + entry.evidence + '）'
  if (entry.verdict === 'fail') return ' ← 现状：**未过**（' + entry.evidence + '）'
  if (entry.verdict === 'skip') return ' ← 现状：待补（' + entry.evidence + '）'
  return ''
}

function checkLabel(check: string): string {
  if (check === 'assertion') return '机器判定：按 contract.json 复算断言'
  if (check === 'data') return '机器判定：核对声明的数据表建没建、条数与字段够不够'
  if (check === 'field') return '机器判定：核对策划书里这条设计写没写（不等于实现完成）'
  if (check === 'test') return '自动化测试'
  return '人工判定'
}

/**
 * 生成派工单。
 *
 * 选文档的判据（与 index.json 的 sequential 一致，但跳过已完成的）：
 * ① 适用（本作真的要做这份）且未完成 → 候选；
 * ② 候选里**第一份门禁就绪的**当选（前面的没就绪就卡住整条链，不如先做能做的那份）；
 * ③ 一份就绪的都没有 → 取第一个候选并如实标「未就绪」，把缺什么写清。
 */
export function buildHandoffWorkOrder(doc: CeshuDocument, options: WorkOrderOptions): WorkOrder {
  const planned = planHandoffDocs(doc)
  const statuses = statusMap(doc)
  const completed = new Set(
    (options.completed ?? []).map((path) => path.trim()).filter((path) => path !== '')
  )
  const applicable = planned.filter((item) => (statuses.get(item.def.id)?.applicable ?? true) !== false)
  const remaining = applicable.filter((item) => !completed.has(item.path))
  const readyRemaining = remaining.filter((item) => statuses.get(item.def.id)?.ready === true)
  // ⓪ 调用方点名的那份优先（看板「派这一份」）。只看适用性，不看「是否已完成」——
  //    已完成的那份被点名，语义是「按新结论重做这一份」，不该被静默跳过。
  const requested = (options.targetPath ?? '').trim()
  const forced = requested === '' ? undefined : applicable.find((item) => item.path === requested)
  const chosen = forced ?? readyRemaining[0] ?? remaining[0]
  const target =
    chosen === undefined ? null : buildTarget(chosen, statuses.get(chosen.def.id), options.context)

  const lines: string[] = []
  const name = String(doc.meta.game_name ?? '').trim() || '未命名游戏'
  lines.push('# 派工单 · ' + name, '')
  lines.push('> 这是按开发交接包施工的开工提示。**一次只做一份文档**，做完、验收、再下一份。', '')

  lines.push('## 交接包（只读，不要改它）', '')
  lines.push(options.bundleDir, '')

  lines.push('## 代码工作区（只在这里写代码）', '')
  lines.push(options.workspace, '')

  lines.push('## 开工前（只做一次）', '')
  lines.push(
    '1. 读 `index.json`：`sequence` 是施工顺序，`precedence` 是冲突优先级' +
      '（contract.json > data/snapshot.json > 交接文档 > gdd.md > prototype/demo.html）。遇到矛盾按它裁决，不要猜。'
  )
  const tddPath = options.tddPath ?? '<库>/' + TDD_DIR_HINT + '/<游戏名>-TDD.md'
  lines.push(
    '2. 先写技术设计文档（TDD）：调用 `system.tech_doc`（action=outline 取 9 章大纲，action=write 落到 `' +
      tddPath +
      '`）。TDD 说「怎么实现」，策划书说「是什么」——架构、模块边界、接口签名、数据模型写在 TDD 里。'
  )
  lines.push('3. 按 `00-架构/07-工程脚手架.md` 建工程骨架，再开始第一份实现。', '')

  // 指定与命中不一致时**必须说明**：否则用户点了 A 却收到 B 的派工单，会以为点错了。
  if (requested !== '' && forced === undefined) {
    lines.push(
      '> ⚠️ 你指定的 `' + requested + '` 不在本作适用的交接文档里（可能这份对本作不适用，或路径写错了），' +
        '已改派下面这份。要做指定那份，请先在交接包 `index.json` 里核对它的路径。',
      ''
    )
  }
  if (forced !== undefined && completed.has(forced.path)) {
    lines.push('> 说明：这份在 `' + HANDOFF_PROGRESS_FILE + '` 里已记为完成，本次按你的指定重做。', '')
  }

  if (target === null) {
    lines.push('## 本次任务', '')
    lines.push(
      '交接包里**适用的文档已全部完成**（按你给的进度记录）。请复核 `进度.md` 的验收结论，' +
        '再回头做上一轮标了「未通过」的那份。',
      ''
    )
  } else {
    lines.push('## 本次任务（只做这一份）', '')
    lines.push('- 文档：`' + target.path + '`')
    lines.push('- 标题：' + target.title + '（' + target.volumeTitle + ' 第 ' + String(target.number) + ' 份）')
    lines.push('- 解决什么：' + target.purpose)
    if (target.ready) {
      lines.push(
        '- 门禁：可以开工（字段 ' +
          String(target.fieldFilled) + '/' + String(target.fieldTotal) + ' 已填，无阻塞）'
      )
    } else {
      const missing =
        target.missing.length > 0 ? '，还缺：' + target.missing.slice(0, 8).join('、') : ''
      const blocked =
        target.blockers.length > 0
          ? '；阻塞 ' + String(target.blockers.length) + ' 条：' + target.blockers.slice(0, 3).join('；')
          : ''
      lines.push(
        '- 门禁：**未就绪**（字段 ' +
          String(target.fieldFilled) + '/' + String(target.fieldTotal) + missing + blocked +
          '）——先把缺的补进策划书，或按其结论做最小实现并在 `进度.md` 记下偏差'
      )
    }
    lines.push('- 开工必读：`' + target.minimalContext.map((path) => path).join('`、`') + '`')
    if (target.acceptance.length > 0) {
      lines.push('- 验收（做完逐条对照）：')
      for (const entry of target.acceptance) {
        lines.push('  - [' + entry.check + '] ' + entry.text + '（' + checkLabel(entry.check) + '）' + verdictTag(entry))
      }
      if (target.verdicts !== null && target.verdicts.machine > 0) {
        lines.push(
          '  - 现状快照：机器已判 ' + String(target.verdicts.machine) + ' 条（通过 ' +
            String(target.verdicts.pass) + ' / 未过 ' + String(target.verdicts.fail) + ' / 待补 ' +
            String(target.verdicts.skip) + '），其余 ' + String(target.verdicts.unverified) +
            ' 条要你跑测试或人工确认——**别拿通过的那几条当整份做完了**。'
        )
      }
    }
    lines.push('')
  }

  lines.push('## 施工纪律', '')
  lines.push('- 一次只做一份：做完 → 逐条验收 → 再下一份。不要同时改多个文档对应的模块。')
  lines.push('- 数据行的唯一来源是 `data/snapshot.json`（结构看 `schema.json`），代码里不许硬编码内容行。')
  lines.push(
    '- 标了 `assertion` / `test` 的验收必须真的跑（断言复算通过 / 测试绿的才算过）；' +
      '标 `manual` 的写清你怎么验的。'
  )
  lines.push(
    '- 标了 `data` / `field` 的验收由机器核对（数据表建没建 / 策划书写没写）：报「已通过」只说明' +
      '**设计层面**齐了，代码有没有按它实现仍要你用 `test` 或人工补证。'
  )
  lines.push('- 只写代码工作区；不要改交接包，也不要改策划库的 `data` / `ceshu` / `design` 目录。')
  lines.push('')

  lines.push('## 收尾', '')
  lines.push('在 `' + options.workspace + '/' + HANDOFF_PROGRESS_FILE + '` 追加一行（没这个文件就新建）：', '')
  lines.push('```', '<文档相对路径> | <完成时间> | <验收结果>', '```', '')
  const examplePath = target?.path ?? '00-架构/01-范围与平台.md'
  lines.push('例：`' + examplePath + ' | 2026-11-09 18:00 | a1 ok / a2 ok`', '')
  lines.push(
    '**用 `system.file_ops` 落这一行**（别只在回复里说说）：文件已存在就先 `read` 再 `write` ——' +
      '`write` 是整文件覆盖，要把新行接在原内容后面；file_ops 带「读后写」版本闸，没读就写会被拒绝。' +
      '文件不存在则直接 `write` 新建。',
    ''
  )
  lines.push(
    '这一行是下一轮的**唯一**依据：写了，下一份派工单就跳过它；没写，下一轮还会派同一份——' +
      '「做完了但没说」在这套流程里等于没做。',
    ''
  )

  return {
    markdown: lines.join('\n'),
    target,
    applicableCount: applicable.length,
    readyCount: applicable.filter((item) => statuses.get(item.def.id)?.ready === true).length,
    doneCount: applicable.length - remaining.length,
    remaining: remaining.length,
    requestedPath: requested === '' ? null : requested
  }
}

/* ------------------------------------------------------------------ */
/* 进度记录：`进度.md` 的读写约定                                    */
/* ------------------------------------------------------------------ */

/** 验收结果里出现这些词 = 这一份**没过**（下一轮别跳过它） */
const FAIL_MARKERS = ['未通过', '不通过', '失败', 'fail', 'FAIL', 'FAILED']

/**
 * 解析工作区里的 `进度.md`：每行 `<文档相对路径> | <完成时间> | <验收结果>`。
 *
 * - 只取第一格当路径（去掉反引号与首尾空白）；空行、`#` 标题行、分隔线跳过；
 * - 验收结果里出现 fail 语义词的**不算完成**（让智能体重做，而不是被上一轮的谎话糊住）；
 * - 同一路径多次出现时后者覆盖前者（重跑后追加的那条才是真状态）。
 *
 * 返回的是**已完成的文档相对路径**，可直接喂回 `buildHandoffWorkOrder({ completed })`。
 */
export function parseHandoffProgress(markdown: string): string[] {
  const done = new Set<string>()
  // 先整段摘掉「机判快照」：那段是机器自己贴的成绩单，里面同样有 `<路径>`，
  // 当施工记录读就成了「机器给自己盖章」——与「完成只认智能体的施工记录」直接冲突。
  for (const rawLine of stripProgressSnapshot(markdown).split(/\r?\n/u)) {
    const line = rawLine.trim()
    if (line === '' || line.startsWith('#') || line.startsWith('---')) continue
    const cells = line.replaceAll('`', '').split('|').map((cell) => cell.trim())
    const path = cells[0] ?? ''
    if (path === '' || path.includes(' ')) continue
    const verdict = cells.slice(1).join(' ')
    const failed = FAIL_MARKERS.some((marker) => verdict.includes(marker))
    if (failed) done.delete(path)
    else done.add(path)
  }
  return [...done]
}