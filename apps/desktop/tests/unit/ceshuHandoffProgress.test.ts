import { describe, expect, it } from 'vitest'

import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import {
  HANDOFF_PROGRESS_FILE,
  HANDOFF_PROGRESS_SNAPSHOT_BEGIN,
  HANDOFF_PROGRESS_SNAPSHOT_END,
  HANDOFF_PROGRESS_STATE_LABELS,
  annotateHandoffProgress,
  buildHandoffProgressBoard,
  buildHandoffWorkOrder,
  buildHandoffPlan,
  parseHandoffProgress,
  planHandoffDocs,
  renderHandoffProgressBoardMarkdown,
  stripProgressSnapshot
} from '@mobai/shared/ceshu/workflow'

/**
 * 施工看板（把「几十份交接文档现在做到哪了」变成一张表）。
 *
 * 钉住四件事：
 * 1. **选下一份与派工单同一套判据**——看板说做 A、派工单派 B 是最难查的错；
 * 2. **完成只认施工记录**：机判全过也不自动标 done（否则又退回「AI 自述完成」）；
 * 3. **机判能否决**：记录说完成但机器判出未过 ⇒ 降级为「需返工」；
 * 4. **快照可重写**：机判快照段幂等覆盖，且解析 `进度.md` 时整段摘掉（机器不许给自己盖章）。
 */

function makeDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
  doc.meta.game_type = 'RPG'
  return doc
}

function docWithTables(): CeshuDocument {
  const doc = makeDoc()
  doc.tech.data_tables = '表名|用途|关键字段|期望条数\n敌人表|配置敌人|id,hp,atk|40'
  return doc
}

const BUNDLE = 'E:/tmp/测试游戏-交接包'
const WORKSPACE = 'E:/tmp/code'

describe('施工看板：状态判定', () => {
  it('未开工且门禁未就绪的排成 blocked，下一份仍指向它（与派工单一致）', () => {
    const doc = makeDoc()
    const board = buildHandoffProgressBoard(doc, { context: { doc } })
    const order = buildHandoffWorkOrder(doc, { bundleDir: BUNDLE, workspace: WORKSPACE, context: { doc } })
    expect(board.counts.total).toBe(
      buildHandoffPlan(doc).flatMap((volume) => volume.docs).filter((status) => status.applicable).length
    )
    expect(board.counts.done).toBe(0)
    expect(board.next).toBe(order.target!.path)
  })

  it('有就绪文档时，下一份优先取就绪的第一份（与派工单一致）', () => {
    const doc = docWithTables()
    const board = buildHandoffProgressBoard(doc)
    const order = buildHandoffWorkOrder(doc, { bundleDir: BUNDLE, workspace: WORKSPACE })
    expect(board.nextState).toBe('todo')
    expect(board.next).toBe('00-架构/03-数据表与内容管线.md')
    expect(board.next).toBe(order.target!.path)
  })

  it('施工记录说完成、机判无未过项 ⇒ done（跳过它派下一份）', () => {
    const doc = docWithTables()
    const first = buildHandoffProgressBoard(doc)
    const next = buildHandoffProgressBoard(doc, { completed: [first.next!] })
    expect(next.counts.done).toBe(1)
    expect(next.remaining).toBe(first.remaining - 1)
    expect(next.next).not.toBe(first.next)
  })

  it('施工记录说完成、机判却有未过项 ⇒ rework（不认这句「做完了」）', () => {
    const doc = makeDoc()
    const first = buildHandoffProgressBoard(doc)
    const order = buildHandoffWorkOrder(doc, { bundleDir: BUNDLE, workspace: WORKSPACE, context: { doc } })
    // 空白夹具里的 field 类验收必然未过（策划书字段没写）。
    expect(order.target!.verdicts!.fail).toBeGreaterThan(0)
    const claimed = buildHandoffProgressBoard(doc, { completed: [first.next!], context: { doc } })
    expect(claimed.counts.rework).toBe(1)
    expect(claimed.counts.done).toBe(0)
    expect(claimed.entries.find((entry) => entry.path === first.next)!.note).toContain('机判')
  })

  it('本作不适用的文档记 skip，且不计入统计', () => {
    const board = buildHandoffProgressBoard(makeDoc())
    const skipped = board.entries.filter((entry) => entry.state === 'skip')
    expect(board.counts.total).toBe(board.entries.length - skipped.length)
    if (skipped.length > 0) {
      expect(skipped[0]!.note).toContain('本作不做')
      expect(board.next).not.toBe(skipped[0]!.path)
    }
  })

  it('机判未过的条数与待测试条数汇总到 counts（一眼看整包还剩多少真问题）', () => {
    const doc = makeDoc()
    const board = buildHandoffProgressBoard(doc, { context: { doc } })
    const applicableFail = board.entries
      .filter((entry) => entry.state !== 'skip')
      .flatMap((entry) => entry.results)
      .filter((result) => result.verdict === 'fail')
    expect(board.counts.machineFail).toBe(applicableFail.length)
    expect(board.counts.unverified).toBeGreaterThan(0)
  })

  it('不注入现状时不给结论（纯函数不自己去读文档）', () => {
    const board = buildHandoffProgressBoard(makeDoc())
    for (const entry of board.entries) {
      expect(entry.summary.machine).toBe(0)
      expect(entry.results).toHaveLength(0)
    }
  })

  it('每份文档都带状态中文标签，markdown 摘要不漏项', () => {
    const board = buildHandoffProgressBoard(makeDoc())
    const md = renderHandoffProgressBoardMarkdown(board)
    expect(md).toContain('共 ' + String(board.counts.total) + ' 份')
    for (const entry of board.entries) {
      if (entry.state === 'skip') continue
      expect(md).toContain(HANDOFF_PROGRESS_STATE_LABELS[entry.state])
      expect(md).toContain(entry.path)
    }
  })
})

describe('进度快照：写回 进度.md', () => {
  it('没有施工记录时也写得出来（保留空行、给出全量成绩单）', () => {
    const board = buildHandoffProgressBoard(makeDoc())
    const md = annotateHandoffProgress('', board, { generatedAt: '2026-11-09 22:00' })
    expect(md).toContain(HANDOFF_PROGRESS_SNAPSHOT_BEGIN)
    expect(md).toContain(HANDOFF_PROGRESS_SNAPSHOT_END)
    expect(md).toContain('2026-11-09 22:00')
    expect(md).toContain(planHandoffDocs(makeDoc())[0]!.path)
  })

  it('重算覆盖旧快照段，且**不动**智能体自己写的施工记录', () => {
    const doc = docWithTables()
    const record = '# 进度\n\n00-架构/03-数据表与内容管线.md | 2026-11-09 21:00 | a1 ok'
    const board = buildHandoffProgressBoard(doc, { completed: parseHandoffProgress(record) })
    const once = annotateHandoffProgress(record, board)
    const twice = annotateHandoffProgress(once, board)
    expect(twice).toBe(once)
    expect(twice).toContain('00-架构/03-数据表与内容管线.md | 2026-11-09 21:00 | a1 ok')
    expect(twice.split(HANDOFF_PROGRESS_SNAPSHOT_BEGIN)).toHaveLength(2)
  })

  it('机判快照里的路径不会被当成施工记录（机器不许给自己盖章）', () => {
    const doc = makeDoc()
    const board = buildHandoffProgressBoard(doc)
    const md = annotateHandoffProgress('', board)
    expect(parseHandoffProgress(md)).toEqual([])
    // 施工记录写在快照上方时照常认出来
    const withRecord = '00-架构/01-范围与平台.md | 2026-11-09 21:00 | 通过\n' + md
    expect(parseHandoffProgress(withRecord)).toEqual(['00-架构/01-范围与平台.md'])
  })

  it('stripProgressSnapshot 只摘快照段；标记不全时截到开头', () => {
    const keep = '01-核心玩法/01-核心循环.md | 2026-11-09 20:00 | 通过\n'
    expect(stripProgressSnapshot(keep)).toBe(keep)
    const full = keep + HANDOFF_PROGRESS_SNAPSHOT_BEGIN + '\n- 已完成 · x\n' + HANDOFF_PROGRESS_SNAPSHOT_END
    expect(stripProgressSnapshot(full)).toBe(keep)
    expect(stripProgressSnapshot(keep + HANDOFF_PROGRESS_SNAPSHOT_BEGIN + '\n- 已完成')).toContain('01-核心玩法')
  })

  it('快照段落写明「不代替施工记录」，避免被误当验收结论', () => {
    const md = annotateHandoffProgress('', buildHandoffProgressBoard(makeDoc()))
    expect(md).toContain('不代替施工记录')
    expect(md).toContain(HANDOFF_PROGRESS_FILE)
  })
})