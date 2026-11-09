import { describe, expect, it } from 'vitest'

import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import {
  HANDOFF_PROGRESS_FILE,
  buildHandoffPlan,
  buildHandoffWorkOrder,
  parseHandoffProgress,
  planHandoffDocs
} from '@mobai/shared/ceshu/workflow'

/**
 * 派工单（把交接包翻译成「编码智能体开工的第一句话」）。
 *
 * 钉住三件事：
 * 1. **只派一份**：选的是「适用且未完成」里第一份门禁就绪的；一份都没就绪才退而取第一份并标未就绪；
 * 2. **该说的都在**：交接包路径、工作区、开工必读、验收条目（带判定方式）、收尾写哪；
 * 3. **进度可回喂**：`parseHandoffProgress` 解析 `进度.md`，标了失败的那份不算完成（下一轮要做它）。
 */

function makeDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
  doc.meta.game_type = 'RPG'
  return doc
}

const BUNDLE = 'E:/tmp/测试游戏-交接包'
const WORKSPACE = 'E:/tmp/code'

function order(doc: CeshuDocument, completed: string[] = []): ReturnType<typeof buildHandoffWorkOrder> {
  return buildHandoffWorkOrder(doc, { bundleDir: BUNDLE, workspace: WORKSPACE, completed })
}

describe('派工单：选哪一份', () => {
  it('总是派一份真实存在、且本作适用的文档', () => {
    const doc = makeDoc()
    const result = order(doc)
    const paths = new Set(planHandoffDocs(doc).map((item) => item.path))
    expect(result.target).not.toBeNull()
    expect(paths.has(result.target!.path)).toBe(true)
    expect(result.applicableCount).toBeGreaterThan(0)
  })

  it('有门禁就绪的文档时，优先派就绪的那份', () => {
    // 空白夹具里没有任何 ready 的文档，先补一份能过门禁的（arch-data 只要一个字段）。
    const doc = makeDoc()
    doc.tech.data_tables = '表名|用途|关键字段|期望条数\n敌人表|配置敌人|id,hp,atk|40'
    const ready = buildHandoffPlan(doc).flatMap((volume) =>
      volume.docs.filter((status) => status.applicable && status.ready).map((status) => status.doc.id)
    )
    expect(ready).toContain('arch-data')
    const result = order(doc)
    expect(result.target!.ready).toBe(true)
    expect(result.target!.path).toBe('00-架构/03-数据表与内容管线.md')
    expect(result.readyCount).toBeGreaterThan(0)
  })

  it('一份都没就绪时，退而取第一份并如实标未就绪', () => {
    const result = order(makeDoc())
    expect(result.target).not.toBeNull()
    expect(result.target!.ready).toBe(false)
    expect(result.readyCount).toBe(0)
    expect(result.target!.missing.length).toBeGreaterThan(0)
    expect(result.markdown).toContain('未就绪')
  })

  it('跳过已完成的：完成一份后派下一份', () => {
    const doc = makeDoc()
    const first = order(doc)
    const second = order(doc, [first.target!.path])
    expect(second.remaining).toBe(first.remaining - 1)
    expect(second.doneCount).toBe(1)
    expect(second.target!.path).not.toBe(first.target!.path)
  })

  it('适用的全部完成后，target 为 null 且提示复核进度', () => {
    const doc = makeDoc()
    const all = planHandoffDocs(doc).map((item) => item.path)
    const result = order(doc, all)
    expect(result.target).toBeNull()
    expect(result.remaining).toBe(0)
    expect(result.markdown).toContain('已全部完成')
  })
})

describe('派工单：该说的都在', () => {
  it('写明交接包目录、代码工作区、进度文件名', () => {
    const md = order(makeDoc()).markdown
    expect(md).toContain(BUNDLE)
    expect(md).toContain(WORKSPACE)
    expect(md).toContain(HANDOFF_PROGRESS_FILE)
  })

  it('写明冲突优先级与「先写 TDD」', () => {
    const md = order(makeDoc()).markdown
    expect(md).toContain('contract.json > data/snapshot.json')
    expect(md).toContain('system.tech_doc')
    expect(md).toContain('07-工程脚手架.md')
  })

  it('本次任务的标题行、开工必读、验收条目（带判定方式）齐备', () => {
    const result = order(makeDoc())
    const target = result.target!
    expect(result.markdown).toContain(target.path)
    expect(result.markdown).toContain(target.title)
    for (const path of target.minimalContext) expect(result.markdown).toContain(path)
    expect(target.acceptance.length).toBeGreaterThan(0)
    for (const entry of target.acceptance) {
      expect(result.markdown).toContain('[' + entry.check + ']')
      expect(result.markdown).toContain(entry.text)
    }
  })

  it('卷内第一份还要读卷 README（与 index.json 的 minimalContext 同源）', () => {
    const doc = makeDoc()
    const result = order(doc)
    const planned = planHandoffDocs(doc).find((item) => item.path === result.target!.path)!
    if (planned.number === 1) {
      expect(result.target!.minimalContext).toHaveLength(2)
      expect(result.target!.minimalContext[0]).toContain('README')
    } else {
      expect(result.target!.minimalContext).toEqual(['contract.json'])
    }
  })
})

describe('进度记录：进度.md 的解析', () => {
  it('只收路径列，忽略标题/空行/分隔线，去掉反引号', () => {
    const md = ['# 进度', '', '---', '`00-架构/01-范围与平台.md` | 2026-11-09 18:00 | a1 ok / a2 ok', '', '01-核心玩法/01-核心循环.md | 2026-11-09 18:30 | 通过'].join('\n')
    expect(parseHandoffProgress(md)).toEqual(['00-架构/01-范围与平台.md', '01-核心玩法/01-核心循环.md'])
  })

  it('标了失败的那份不算完成（下一轮还得做它）', () => {
    const md = ['00-架构/01-范围与平台.md | 2026-11-09 18:00 | a1 ok', '00-架构/01-范围与平台.md | 2026-11-09 19:00 | 验收未通过'].join('\n')
    expect(parseHandoffProgress(md)).toEqual([])
  })

  it('同一个路径后面那条覆盖前面那条', () => {
    const md = ['00-架构/01-范围与平台.md | 2026-11-09 18:00 | 未通过', '00-架构/01-范围与平台.md | 2026-11-09 19:00 | 通过'].join('\n')
    expect(parseHandoffProgress(md)).toEqual(['00-架构/01-范围与平台.md'])
  })
})
