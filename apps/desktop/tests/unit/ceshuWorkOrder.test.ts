import { describe, expect, it } from 'vitest'

import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import {
  HANDOFF_PROGRESS_FILE,
  TDD_DIR_HINT,
  buildHandoffPlan,
  buildHandoffWorkOrder,
  parseHandoffProgress,
  planHandoffDocs,
  resolveTddDocName
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

describe('派工单：点哪份派哪份（看板「派这一份」）', () => {
  function named(doc: CeshuDocument, targetPath: string, completed: string[] = []) {
    return buildHandoffWorkOrder(doc, {
      bundleDir: BUNDLE,
      workspace: WORKSPACE,
      completed,
      targetPath
    })
  }

  it('点名的那份当选中，哪怕它不是自动选择器会挑的第一份', () => {
    const doc = makeDoc()
    const auto = order(doc).target!.path
    // 挑一份「肯定不是自动会挑的那份」：取适用清单里排在后面的。
    const paths = planHandoffDocs(doc).map((item) => item.path)
    const picked = paths[paths.length - 1]
    expect(picked).not.toBe(auto)
    const result = named(doc, picked)
    expect(result.target!.path).toBe(picked)
    expect(result.requestedPath).toBe(picked)
  })

  it('点名已完成的那份也照派，并在正文说明「按你的指定重做」', () => {
    const doc = makeDoc()
    const picked = planHandoffDocs(doc)[0].path
    const result = named(doc, picked, [picked])
    expect(result.target!.path).toBe(picked)
    expect(result.doneCount).toBe(1)
    expect(result.markdown).toContain('已记为完成，本次按你的指定重做')
  })

  it('点名的路径不在适用清单里：不静默改派，正文开头点名说明', () => {
    const doc = makeDoc()
    const result = named(doc, '99-不存在/不存在.md')
    expect(result.requestedPath).toBe('99-不存在/不存在.md')
    expect(result.target!.path).not.toBe('99-不存在/不存在.md')
    expect(result.markdown).toContain('不在本作适用的交接文档里')
    expect(result.markdown).toContain('99-不存在/不存在.md')
  })

  it('不点名时 requestedPath 为 null，选择逻辑与从前一致', () => {
    const result = order(makeDoc())
    expect(result.requestedPath).toBeNull()
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

  it('TDD 这一步讲清「先 outline 建骨架、再逐节生成、一次只生成一节」', () => {
    const md = order(makeDoc()).markdown
    // 只给 outline 会让智能体把骨架当成品交差，必须点明正文要逐节生成。
    expect(md).toContain('action=outline')
    expect(md).toContain('action=write')
    expect(md).toContain('骨架')
    expect(md).toContain('一次只生成一节')
    // 九节的 sectionId 要真列出来，否则智能体只能自己猜 id。
    for (const id of ['overview', 'architecture', 'modules', 'data-model', 'interfaces', 'flows', 'dependencies', 'risks', 'milestones']) {
      expect(md).toContain(id)
    }
  })

  it('不传 tddPath 时给出可读的中性落点，不再是 <游戏名> 字面占位符', () => {
    const md = order(makeDoc()).markdown
    expect(md).not.toContain('<游戏名>')
    expect(md).toContain('<库>/' + TDD_DIR_HINT + '/' + resolveTddDocName(makeDoc()) + '.md')
  })

  it('传 tddPath 时原样写进提示（宿主注入活跃库的真实路径）', () => {
    const doc = makeDoc()
    const tddPath = 'E:/tmp/库/tech/测试游戏-TDD.md'
    const md = buildHandoffWorkOrder(doc, {
      bundleDir: BUNDLE,
      workspace: WORKSPACE,
      tddPath
    }).markdown
    expect(md).toContain(tddPath)
    expect(md).not.toContain('<游戏名>')
  })

  it('TDD 文档名随项目名变化，且净化掉 system.tech_doc 会拒的字符', () => {
    const doc = makeDoc()
    expect(resolveTddDocName(doc)).toBe('测试游戏-TDD')
    doc.meta.game_name = 'a/b:c'
    expect(resolveTddDocName(doc)).toBe('a_b_c-TDD')
    doc.meta.game_name = '   '
    expect(resolveTddDocName(doc)).toBe('未命名游戏-TDD')
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

describe('派工单：验收现状（机器判定）', () => {
  function docWithPositioning(): CeshuDocument {
    const doc = makeDoc()
    doc.meta.positioning = '一款仙侠开放世界 RPG'
    return doc
  }

  it('注入现状后每条验收带 verdict，且 test 不会被机器判过', () => {
    const result = buildHandoffWorkOrder(docWithPositioning(), {
      bundleDir: BUNDLE,
      workspace: WORKSPACE,
      context: { doc: docWithPositioning() }
    })
    const target = result.target!
    expect(target.verdicts).not.toBeNull()
    for (const entry of target.acceptance) {
      expect(['pass', 'fail', 'skip', 'unverified']).toContain(entry.verdict)
      if (entry.check === 'test' || entry.check === 'manual') expect(entry.verdict).toBe('unverified')
    }
  })

  it('没注入现状时保持老样子：verdicts 为 null、不写「现状」标记', () => {
    const result = order(makeDoc())
    expect(result.target!.verdicts).toBeNull()
    expect(result.markdown).not.toContain('← 现状：')
  })

  it('机器判过的条数会写进「现状快照」，并提醒别拿通过当整份做完', () => {
    const result = buildHandoffWorkOrder(docWithPositioning(), {
      bundleDir: BUNDLE,
      workspace: WORKSPACE,
      context: { doc: docWithPositioning() }
    })
    const verdicts = result.target!.verdicts!
    if (verdicts.machine > 0) {
      expect(result.markdown).toContain('现状快照：机器已判 ' + String(verdicts.machine) + ' 条')
      expect(result.markdown).toContain('别拿通过的那几条当整份做完了')
    }
  })

  it('没过 / 待补的条目在派工单里被点名（不是只打勾）', () => {
    const result = buildHandoffWorkOrder(makeDoc(), {
      bundleDir: BUNDLE,
      workspace: WORKSPACE,
      context: { doc: makeDoc() }
    })
    const target = result.target!
    const failed = target.acceptance.filter((entry) => entry.verdict === 'fail')
    if (failed.length > 0) {
      expect(result.markdown).toContain('← 现状：**未过**')
    }
  })

  it('施工纪律写明 data/field 是设计层面判定，不等于实现完成', () => {
    const md = order(makeDoc()).markdown
    expect(md).toContain('由机器核对')
    expect(md).toContain('设计层面')
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
