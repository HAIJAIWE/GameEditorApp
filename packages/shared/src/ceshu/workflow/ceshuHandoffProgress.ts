import type { CeshuDocument } from '../reference'
import {
  evaluateHandoffAcceptances,
  summarizeHandoffAcceptances,
  type HandoffAcceptanceContext,
  type HandoffAcceptanceResult,
  type HandoffAcceptanceSummary
} from './ceshuHandoffAcceptance'
import {
  HANDOFF_PROGRESS_SNAPSHOT_BEGIN,
  HANDOFF_PROGRESS_SNAPSHOT_END,
  stripProgressSnapshot
} from './ceshuHandoffPaths'
import { buildHandoffPlan, planHandoffDocs } from './ceshuHandoffPlan'
import type { HandoffDocStatus, PlannedHandoffDoc } from './ceshuHandoffPlan'

/**
 * **施工看板**（progress board）：把「几十份交接文档，现在做到哪了、下一份做谁」变成一张表。
 *
 * ## 为什么要有它
 * 派工单（`ceshuHandoffWorkOrder`）一次只回答「下一份做谁」，但它自己不知道上一份做完了没有——
 * 那个信息躺在工作区根的 `进度.md` 里，是编码智能体**自己写的一句话**。2026-11-09 实测暴露两个问题：
 * 1. 智能体可以随手写「a1 ok」把自己盖章完成，机器没有复核入口；
 * 2. 想做第 5 份时必须手动翻 4 次派工单，看不出整体还剩几份、哪几份返工。
 *
 * 这个模块把两件事合起来做：
 * - **机判复核**：对每一份（不只下一份）跑 `evaluateHandoffAcceptances`，拿到 pass/fail/skip/unverified；
 * - **合并施工记录**：把 `进度.md` 的「自称完成」与机判结论对齐，得到 6 种状态（见 `HandoffProgressState`）。
 *
 * ## 一个刻意的取舍：机判**不**替人盖章
 * `test` / `manual` 类验收机器永远给 `unverified`（见 `ceshuHandoffAcceptance`）。所以本模块
 * **不会**因为「机判全过」就把一份标成完成——完成仍以 `进度.md` 的施工记录为准；
 * 机判只做两件事：**否决**（有 fail 就把「自称完成」降级成需返工）与**举证**（写清过了几条、还差什么）。
 *
 * 这条取舍是刻意的：如果机器替 test/manual 盖章，就退回到「AI 自述完成」的老问题。
 */

/** 一份文档在施工看板上的状态 */
export type HandoffProgressState =
  /** 施工记录已交，且机判没有未过项 */
  | 'done'
  /** 施工记录说完成，但机判有未过项——要返工 */
  | 'rework'
  /** 门禁就绪、还没开工 */
  | 'todo'
  /** 门禁未就绪（策划书字段没填够 / 有阻塞）——先补策划书 */
  | 'blocked'
  /** 本作不做这份（品类裁剪掉） */
  | 'skip'

/** 状态 → 中文短标签（面板、markdown、通知共用一份，避免三处文案漂移） */
export const HANDOFF_PROGRESS_STATE_LABELS: Record<HandoffProgressState, string> = {
  done: '已完成',
  rework: '需返工',
  todo: '未开工',
  blocked: '门禁未就绪',
  skip: '不适用'
}

export interface HandoffProgressEntry {
  /** 交接包内相对路径 */
  path: string
  title: string
  volumeTitle: string
  /** 卷内序号（裁剪后重排） */
  number: number
  /** 门禁是否就绪 */
  ready: boolean
  fieldFilled: number
  fieldTotal: number
  /** `进度.md` 里有没有这一份的施工记录（且没写失败语义词） */
  claimed: boolean
  state: HandoffProgressState
  /** 机判汇总（test / manual 恒算 unverified） */
  summary: HandoffAcceptanceSummary
  /** 逐条结论（面板展开用） */
  results: HandoffAcceptanceResult[]
  /** 一句话现状：给面板与派工单复用 */
  note: string
}

export interface HandoffProgressBoard {
  entries: HandoffProgressEntry[]
  /** 只统计适用文档（skip 不计入） */
  counts: {
    total: number
    done: number
    rework: number
    todo: number
    blocked: number
    /** 机判未过（fail）的条数合计——一眼看出整包还剩多少真问题 */
    machineFail: number
    /** 机器给不出结论（test / manual）的条数合计 */
    unverified: number
  }
  /** 下一份要做的路径（按派工单同一套选法）；全都做完时为 null */
  next: string | null
  /** 下一份的状态（next 为 null 时也是 null） */
  nextState: HandoffProgressState | null
  /** 还有几份没完成（适用且未 done） */
  remaining: number
}

export interface HandoffProgressOptions {
  /** 已完成（从 `进度.md` 解析出来）；缺省 = 全部未开工 */
  completed?: string[]
  /** 验收现状（策划书 / 契约 / 数据表） */
  context?: HandoffAcceptanceContext
}

function statusMap(doc: CeshuDocument): Map<string, HandoffDocStatus> {
  const map = new Map<string, HandoffDocStatus>()
  for (const volume of buildHandoffPlan(doc)) {
    for (const status of volume.docs) map.set(status.doc.id, status)
  }
  return map
}

/** 一句话现状（机判有结论时优先说结论，没有就说门禁） */
function noteOf(entry: {
  state: HandoffProgressState
  summary: HandoffAcceptanceSummary
  results: HandoffAcceptanceResult[]
  ready: boolean
  fieldFilled: number
  fieldTotal: number
}): string {
  if (entry.summary.fail > 0) {
    const first = entry.results.find((result) => result.verdict === 'fail')
    return (
      '机判 ' + String(entry.summary.fail) + ' 条未过' +
      (first === undefined ? '' : '：' + first.evidence)
    )
  }
  if (entry.state === 'skip') return '本作不做这份'
  if (entry.state === 'blocked') {
    return '门禁未就绪（字段 ' + String(entry.fieldFilled) + '/' + String(entry.fieldTotal) + '）'
  }
  const parts: string[] = []
  if (entry.summary.machine > 0) {
    parts.push(
      '机判 ' + String(entry.summary.machine) + ' 条（通过 ' + String(entry.summary.pass) +
        ' / 待补 ' + String(entry.summary.skip) + '）'
    )
  }
  if (entry.summary.unverified > 0) {
    parts.push(String(entry.summary.unverified) + ' 条待测试或人工确认')
  }
  if (parts.length === 0) return '没有可机判的验收条目'
  return parts.join('，')
}

/**
 * 构造施工看板。
 *
 * 选「下一份」与 `buildHandoffWorkOrder` 同一套判据：未完成的里面，先取第一份门禁就绪的；
 * 一份就绪的都没有就取第一个未完成（如实标未就绪）。两份实现共用一条规则，避免出现
 * 「看板说做 A、派工单说做 B」。
 */
export function buildHandoffProgressBoard(
  doc: CeshuDocument,
  options: HandoffProgressOptions = {}
): HandoffProgressBoard {
  const planned = planHandoffDocs(doc)
  const statuses = statusMap(doc)
  const completed = new Set(
    (options.completed ?? []).map((path) => path.trim()).filter((path) => path !== '')
  )

  const entries: HandoffProgressEntry[] = planned.map((item: PlannedHandoffDoc) => {
    const status = statuses.get(item.def.id)
    const applicable = status?.applicable !== false
    const ready = status?.ready === true
    const claimed = completed.has(item.path)
    const results =
      options.context === undefined
        ? []
        : evaluateHandoffAcceptances(item.def.id, item.def.acceptance, options.context)
    const summary = summarizeHandoffAcceptances(results)

    let state: HandoffProgressState
    if (!applicable) state = 'skip'
    else if (claimed) state = summary.fail > 0 ? 'rework' : 'done'
    else if (!ready) state = 'blocked'
    else state = 'todo'

    const base = {
      state,
      summary,
      results,
      ready,
      fieldFilled: status?.fieldFilled ?? 0,
      fieldTotal: status?.fieldTotal ?? 0
    }
    return {
      path: item.path,
      title: item.def.title,
      volumeTitle: item.volume.title,
      number: item.number,
      ready,
      fieldFilled: base.fieldFilled,
      fieldTotal: base.fieldTotal,
      claimed,
      state,
      summary,
      results,
      note: noteOf(base)
    }
  })

  const applicable = entries.filter((entry) => entry.state !== 'skip')
  const counts = {
    total: applicable.length,
    done: applicable.filter((entry) => entry.state === 'done').length,
    rework: applicable.filter((entry) => entry.state === 'rework').length,
    todo: applicable.filter((entry) => entry.state === 'todo').length,
    blocked: applicable.filter((entry) => entry.state === 'blocked').length,
    machineFail: applicable.reduce((sum, entry) => sum + entry.summary.fail, 0),
    unverified: applicable.reduce((sum, entry) => sum + entry.summary.unverified, 0)
  }
  const pending = applicable.filter((entry) => entry.state !== 'done')
  const chosen = pending.find((entry) => entry.ready) ?? pending[0]

  return {
    entries,
    counts,
    next: chosen?.path ?? null,
    nextState: chosen?.state ?? null,
    remaining: pending.length
  }
}

/** 看板 → 一段可粘贴的 markdown 摘要（通知、导出、测试断言都用它） */
export function renderHandoffProgressBoardMarkdown(board: HandoffProgressBoard): string {
  const lines: string[] = []
  lines.push(
    '共 ' + String(board.counts.total) + ' 份（已完成 ' + String(board.counts.done) +
      ' / 需返工 ' + String(board.counts.rework) + ' / 未开工 ' + String(board.counts.todo) +
      ' / 门禁未就绪 ' + String(board.counts.blocked) + '）'
  )
  if (board.counts.machineFail > 0) {
    lines.push('机判未过 ' + String(board.counts.machineFail) + ' 条，待测试或人工 ' + String(board.counts.unverified) + ' 条')
  }
  lines.push('')
  for (const entry of board.entries) {
    if (entry.state === 'skip') continue
    lines.push(
      '- ' + HANDOFF_PROGRESS_STATE_LABELS[entry.state] + ' · `' + entry.path + '` · ' + entry.note
    )
  }
  return lines.join('\n')
}

/**
 * 把机判快照写进 `进度.md`（幂等：先摘掉旧的快照段，再追加新的）。
 *
 * **不动**施工智能体自己写的那几行——那些是「自称完成」，是完成与否的唯一凭据；
 * 机器只在旁边贴一张成绩单（过了几条、哪几条没过）。这样：
 * - 智能体不能靠改快照段蒙混（重跑就覆盖）；
 * - 人一眼能看出「它说做完了，机器说还有 3 条没过」。
 *
 * 写入的行都以 `- ` 开头、且带反引号路径（首格含空格），`parseHandoffProgress` 不会把它们
 * 当成施工记录（另外解析器也会整段跳过起止标记之间的内容，双保险）。
 */
export function annotateHandoffProgress(
  markdown: string,
  board: HandoffProgressBoard,
  options: { generatedAt?: string } = {}
): string {
  const stripped = stripProgressSnapshot(markdown)
  const lines: string[] = [stripped.replace(/\s+/u, '').length === 0 ? '' : stripped.trimEnd(), '']
  lines.push(HANDOFF_PROGRESS_SNAPSHOT_BEGIN)
  lines.push(
    '## 机判快照' + (options.generatedAt === undefined ? '' : '（' + options.generatedAt + '）')
  )
  lines.push('')
  lines.push('> 这一段是机器按交接包验收条目的判定方式重新算出来的，**写在本文件（进度.md）里只是成绩单，不代替施工记录**；')
  lines.push('> 重跑会覆盖本段。要标完成，请在「机判快照」开始标记**上方**按格式（`<文档相对路径> | <完成时间> | <验收结果>`）追加自己的一行。')
  lines.push('')
  for (const entry of board.entries) {
    if (entry.state === 'skip') continue
    lines.push(
      '- ' + HANDOFF_PROGRESS_STATE_LABELS[entry.state] + ' · `' + entry.path + '` · ' + entry.note
    )
  }
  lines.push('')
  lines.push(HANDOFF_PROGRESS_SNAPSHOT_END)
  return lines.join('\n')
}