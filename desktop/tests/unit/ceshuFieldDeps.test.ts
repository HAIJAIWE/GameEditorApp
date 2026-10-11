import { describe, expect, it } from 'vitest'

import { CHAPTER_KEYS, isChapterKey, type CeshuDocument, type ChapterKey } from '../../src/shared/ceschu/ceshuConstants'
import { createDefaultCeshu } from '../../src/shared/ceschu/ceshuModel'
import {
  DEP_TYPE_CONSISTENCY,
  DEP_TYPE_DERIVED,
  DEP_TYPE_REFERENCE,
  FIELD_DEPENDENCIES,
  STATUS_OK,
  STATUS_VIOLATION,
  STATUS_WARNING,
  buildChapterDependencyAdjacency,
  buildFieldDependencyGraph,
  buildSystemDependencyGraph,
  evaluateFieldDependencies,
  getChapterViolationSummary,
  getDependenciesForChapter,
  getDependenciesForField,
  getNestedValue,
  isFieldDependencyEmpty,
  valuesConsistent,
  type FieldDependency,
  type FieldDependencyStatus
} from '../../src/shared/ceschu/ceshuFieldDeps'

function makeDoc(scope: 'full' | 'lite' = 'full'): CeshuDocument {
  return createDefaultCeshu({ scope })
}

/** 在文档中按章节 + 点分路径写入值（含 systems.<system>.config.<field> 这类嵌套路径） */
function setChapterField(doc: CeshuDocument, chapter: ChapterKey, path: string, value: unknown): void {
  const segments = path.split('.')
  let cur = doc[chapter] as Record<string, unknown>
  for (let i = 0; i < segments.length - 1; i += 1) {
    const seg = segments[i]
    let next = cur[seg]
    if (typeof next !== 'object' || next === null || Array.isArray(next)) {
      next = {}
      cur[seg] = next
    }
    cur = next as Record<string, unknown>
  }
  cur[segments[segments.length - 1]] = value
}

/** 取指定依赖对象的求值结果 */
function resultOf(doc: CeshuDocument, dep: FieldDependency) {
  const result = evaluateFieldDependencies(doc).find((item) => item.dependency === dep)
  if (!result) throw new Error(`未找到依赖 ${dep.source_chapter}.${dep.source_field}`)
  return result
}

function statusOf(doc: CeshuDocument, dep: FieldDependency): FieldDependencyStatus {
  return resultOf(doc, dep).status
}

function depBySource(chapter: ChapterKey, field: string): FieldDependency {
  const dep = FIELD_DEPENDENCIES.find((item) => item.source_chapter === chapter && item.source_field === field)
  if (!dep) throw new Error(`未找到依赖 ${chapter}.${field}`)
  return dep
}

describe('字段依赖：规则表（匹平 Python field_dependencies.py）', () => {
  it('共 20 条，一致性 8 / 派生 5 / 引用 7，其中 7 条无自动检查规则', () => {
    expect(FIELD_DEPENDENCIES).toHaveLength(20)
    const byType = (type: string): number =>
      FIELD_DEPENDENCIES.filter((dep) => dep.dependency_type === type).length
    expect(byType(DEP_TYPE_CONSISTENCY)).toBe(8)
    expect(byType(DEP_TYPE_DERIVED)).toBe(5)
    expect(byType(DEP_TYPE_REFERENCE)).toBe(7)
    expect(FIELD_DEPENDENCIES.filter((dep) => dep.check_rule === null)).toHaveLength(7)
    expect(FIELD_DEPENDENCIES.filter((dep) => dep.check_rule !== null)).toHaveLength(13)
  })

  it('全部 source/target 章节均为合法章节 key，且字段路径非空', () => {
    for (const dep of FIELD_DEPENDENCIES) {
      expect(isChapterKey(dep.source_chapter)).toBe(true)
      expect(isChapterKey(dep.target_chapter)).toBe(true)
      expect(dep.source_field).not.toBe('')
      expect(dep.target_field).not.toBe('')
    }
  })

  it('getDependenciesForChapter 覆盖 17 章相关依赖数', () => {
    expect(getDependenciesForChapter('combat')).toHaveLength(4)
    expect(getDependenciesForChapter('systems')).toHaveLength(6)
    expect(getDependenciesForChapter('market_analysis')).toHaveLength(4)
    expect(getDependenciesForChapter('art')).toHaveLength(3)
    expect(getDependenciesForChapter('meta')).toHaveLength(1)
    expect(getDependenciesForChapter('numeric')).toHaveLength(1)
    // 全部 17 章均至少参与一条依赖
    for (const chapter of CHAPTER_KEYS) {
      expect(getDependenciesForChapter(chapter).length).toBeGreaterThan(0)
    }
  })

  it('getDependenciesForField 按字段路径（含点路径）匹配', () => {
    expect(getDependenciesForField('combat', 'combat_mode')).toHaveLength(2)
    expect(getDependenciesForField('systems', 'battle.config.turn_mode')).toHaveLength(1)
    expect(getDependenciesForField('art', 'art_style')).toHaveLength(2)
    expect(getDependenciesForField('story', 'protagonist')).toHaveLength(1)
    expect(getDependenciesForField('meta', 'positioning')).toHaveLength(1)
    expect(getDependenciesForField('meta', 'not_exists')).toHaveLength(0)
  })
})

describe('字段依赖：逐条规则 触发 / 不触发 两态', () => {
  for (const dep of FIELD_DEPENDENCIES) {
    const title = `${dep.source_chapter}.${dep.source_field} → ${dep.target_chapter}.${dep.target_field}`
    it(title, () => {
      // 不触发：两态皆空（默认文档）→ ok
      expect(statusOf(makeDoc(), dep)).toBe(STATUS_OK)

      // 触发：仅一侧填写 → warning
      const oneSide = makeDoc()
      setChapterField(oneSide, dep.source_chapter, dep.source_field, 'A')
      expect(statusOf(oneSide, dep)).toBe(STATUS_WARNING)

      // 触发：两侧填写但冲突 → violation
      const conflict = makeDoc()
      setChapterField(conflict, dep.source_chapter, dep.source_field, 'A')
      setChapterField(conflict, dep.target_chapter, dep.target_field, 'B')
      expect(statusOf(conflict, dep)).toBe(STATUS_VIOLATION)

      // 不触发：两侧一致 → ok
      const same = makeDoc()
      setChapterField(same, dep.source_chapter, dep.source_field, 'SAME')
      setChapterField(same, dep.target_chapter, dep.target_field, 'SAME')
      expect(statusOf(same, dep)).toBe(STATUS_OK)
    })
  }
})

describe('字段依赖：消息与空值/相等语义', () => {
  it('默认文档 20 条全部 ok（修正 Python 的 0 真值缺陷：main_npc_count=0 不再误报警告）', () => {
    const results = evaluateFieldDependencies(makeDoc())
    expect(results).toHaveLength(20)
    expect(results.filter((item) => item.status === STATUS_OK)).toHaveLength(20)
    expect(results.filter((item) => item.status === STATUS_WARNING)).toHaveLength(0)
    expect(results.filter((item) => item.status === STATUS_VIOLATION)).toHaveLength(0)

    const npcDep = depBySource('story', 'main_npc_count')
    const npc = resultOf(makeDoc(), npcDep)
    expect(npc.status).toBe(STATUS_OK)
    expect(npc.message).toBe('两侧字段均未填写，暂无冲突')
  })

  it('仅一侧填写：warning 消息含两字段 repr', () => {
    const doc = makeDoc()
    doc.combat.combat_mode = 'turn_based'
    const result = resultOf(doc, depBySource('combat', 'combat_mode'))
    expect(result.status).toBe(STATUS_WARNING)
    expect(result.message).toBe(
      "仅一侧字段已填写（combat.combat_mode='turn_based', systems.battle.config.turn_mode=''）"
    )
  })

  it('两侧冲突：violation 消息；两侧一致：ok 消息', () => {
    const doc = makeDoc()
    doc.combat.combat_mode = 'turn_based'
    setChapterField(doc, 'systems', 'battle.config.turn_mode', 'realtime')
    const conflict = resultOf(doc, depBySource('combat', 'combat_mode'))
    expect(conflict.status).toBe(STATUS_VIOLATION)
    expect(conflict.message).toBe(
      "依赖冲突：combat.combat_mode='turn_based' 与 systems.battle.config.turn_mode='realtime' 不一致"
    )

    const same = makeDoc()
    same.combat.combat_mode = 'turn_based'
    setChapterField(same, 'systems', 'battle.config.turn_mode', 'turn_based')
    expect(resultOf(same, depBySource('combat', 'combat_mode')).message).toBe('字段值一致，依赖满足')
  })

  it('数组/对象按值比较：键序无关，数组顺序敏感', () => {
    const sameObj = makeDoc()
    sameObj.risk_handling.risk_matrix = [{ risk: 'a', level: 1 }]
    sameObj.resources.risk_matrix = [{ level: 1, risk: 'a' }]
    expect(resultOf(sameObj, depBySource('risk_handling', 'risk_matrix')).status).toBe(STATUS_OK)

    const diffObj = makeDoc()
    diffObj.risk_handling.risk_matrix = [{ risk: 'a' }]
    diffObj.resources.risk_matrix = [{ risk: 'b' }]
    expect(resultOf(diffObj, depBySource('risk_handling', 'risk_matrix')).status).toBe(STATUS_VIOLATION)

    const diffOrder = makeDoc()
    diffOrder.mvp.milestones = ['a', 'b']
    diffOrder.tech.milestones = ['b', 'a']
    expect(resultOf(diffOrder, depBySource('mvp', 'milestones')).status).toBe(STATUS_VIOLATION)
  })

  it('isFieldDependencyEmpty：null/undefined/空串/0/false/空数组/空对象为空', () => {
    for (const value of [null, undefined, '', 0, false, [], {}]) {
      expect(isFieldDependencyEmpty(value)).toBe(true)
    }
    for (const value of ['x', 1, true, ['a'], { a: 1 }]) {
      expect(isFieldDependencyEmpty(value)).toBe(false)
    }
  })

  it('valuesConsistent：空侧视为一致；非空按 Python == 语义', () => {
    expect(valuesConsistent('x', 'x')).toBe(true)
    expect(valuesConsistent('x', 'y')).toBe(false)
    expect(valuesConsistent('x', '')).toBe(true)
    expect(valuesConsistent([1, 2], [1, 2])).toBe(true)
    expect(valuesConsistent([1, 2], [2, 1])).toBe(false)
    expect(valuesConsistent({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true)
    expect(valuesConsistent(true, 1)).toBe(true)
    expect(valuesConsistent(0, false)).toBe(true)
  })

  it('getNestedValue：点分路径取值，缺失/非对象返回 null', () => {
    expect(getNestedValue({ a: { b: { c: 1 } } }, 'a.b.c')).toBe(1)
    expect(getNestedValue({ a: {} }, 'a.b')).toBeNull()
    expect(getNestedValue(null, 'a')).toBeNull()
    expect(getNestedValue({ a: 1 }, '')).toBeNull()
    expect(getNestedValue({ a: 1 }, 'b')).toBeNull()
  })

  it('getChapterViolationSummary：只把冲突涉及的两章标为 violation', () => {
    const doc = makeDoc()
    doc.combat.combat_mode = 'turn_based'
    setChapterField(doc, 'systems', 'battle.config.turn_mode', 'realtime')
    const summary = getChapterViolationSummary(doc)
    expect(Object.keys(summary)).toHaveLength(17)
    expect(summary.combat).toBe(STATUS_VIOLATION)
    expect(summary.systems).toBe(STATUS_VIOLATION)
    expect(Object.values(summary).filter((value) => value === STATUS_VIOLATION)).toHaveLength(2)

    const clean = getChapterViolationSummary(makeDoc())
    expect(Object.keys(clean)).toHaveLength(17)
    expect(Object.values(clean).every((value) => value === STATUS_OK)).toBe(true)
  })
})

describe('字段依赖图：结构精确数字（匹平 Python _layered_layout 数据部分）', () => {
  it('章节邻接表：17 节点 / 19 条去重边', () => {
    const adjacency = buildChapterDependencyAdjacency()
    expect(Object.keys(adjacency)).toHaveLength(17)
    const edges = Object.values(adjacency).reduce((sum, targets) => sum + targets.length, 0)
    expect(edges).toBe(18)
    expect(adjacency.systems).toEqual([])
    expect(adjacency.monetization).toEqual(['systems'])
    expect(adjacency.story).toEqual(['systems', 'combat'])
    expect(adjacency.market_analysis).toEqual(['accessibility', 'monetization'])
  })

  it('buildFieldDependencyGraph（无模型）：17 节点 / 18 边 / 10 层 [1,3,3,1,2,1,1,2,1,2]', () => {
    const graph = buildFieldDependencyGraph()
    expect(graph.nodes).toHaveLength(17)
    expect(graph.edges).toHaveLength(18)
    expect(graph.layers).toHaveLength(10)
    expect(graph.layers.map((layer) => layer.length)).toEqual([1, 3, 3, 1, 2, 1, 1, 2, 1, 2])
    expect(graph.layers[0]).toEqual(['systems'])
    expect(graph.layers[1]).toEqual(['combat', 'economy', 'monetization'])
    expect(graph.layers[2]).toEqual(['gameplay', 'numeric', 'story'])
    expect(graph.layers[9]).toEqual(['meta', 'vision'])
    // 无模型时节点状态统一为 ok，且节点按层级顺序铺开
    expect(graph.nodes[0]).toMatchObject({ chapter: 'systems', level: 0, status: STATUS_OK })
    expect(graph.nodes[0].label).toBe('第四章·游戏系统设计')
    // 边去重：无重复 (source,target)
    const pairs = new Set(graph.edges.map((edge) => `${edge.source_chapter}->${edge.target_chapter}`))
    expect(pairs.size).toBe(graph.edges.length)
  })

  it('字段依赖图边：依赖类型取首条匹配', () => {
    const graph = buildFieldDependencyGraph()
    const findEdge = (source: string, target: string) =>
      graph.edges.find((edge) => edge.source_chapter === source && edge.target_chapter === target)
    expect(findEdge('combat', 'systems')?.dependency_type).toBe(DEP_TYPE_CONSISTENCY)
    expect(findEdge('story', 'systems')?.dependency_type).toBe(DEP_TYPE_CONSISTENCY)
    expect(findEdge('story', 'combat')?.dependency_type).toBe(DEP_TYPE_REFERENCE)
    expect(findEdge('tech', 'art')?.dependency_type).toBe(DEP_TYPE_REFERENCE)
    expect(findEdge('resources', 'mvp')?.dependency_type).toBe(DEP_TYPE_REFERENCE)
    expect(findEdge('market_analysis', 'accessibility')?.dependency_type).toBe(DEP_TYPE_REFERENCE)
  })

  it('默认文档：字段依赖图节点状态全为 ok', () => {
    const graph = buildFieldDependencyGraph(makeDoc())
    expect(graph.nodes).toHaveLength(17)
    expect(graph.edges).toHaveLength(18)
    expect(graph.nodes.every((node) => node.status === STATUS_OK)).toBe(true)
  })
})

describe('系统依赖图：结构精确数字与缺失标记（匹平 Python system_dependency_graph.py）', () => {
  it('无模型：13 节点 / 17 边 / 4 层 [2,7,2,2]，全部未启用', () => {
    const graph = buildSystemDependencyGraph()
    expect(graph.nodes).toHaveLength(13)
    expect(graph.edges).toHaveLength(17)
    expect(graph.layers).toHaveLength(4)
    expect(graph.layers.map((layer) => layer.length)).toEqual([2, 7, 2, 2])
    expect(graph.layers[0]).toEqual(['character', 'item'])
    expect(graph.layers[1]).toEqual(['customization', 'economy', 'equipment', 'growth', 'quest', 'skill', 'social'])
    expect(graph.layers[2]).toEqual(['battle', 'gacha'])
    expect(graph.layers[3]).toEqual(['competitive', 'content'])
    expect(graph.missing_dependencies).toHaveLength(0)
    expect(graph.nodes.every((node) => !node.enabled && !node.has_missing_dependency)).toBe(true)
    // 节点按层级顺序，携带中文标签
    expect(graph.nodes[0]).toMatchObject({ system: 'character', label: '角色', level: 0 })
    // 边顺序与 SYSTEM_DEPENDENCIES 插入顺序一致
    expect(graph.edges[0]).toEqual({
      source_system: 'battle',
      target_system: 'character',
      source_enabled: false,
      target_enabled: false,
      missing: false
    })
  })

  it('仅启用 battle：标记缺失依赖 character/skill', () => {
    const doc = makeDoc()
    ;(doc.systems.battle as { enabled: boolean }).enabled = true
    const graph = buildSystemDependencyGraph(doc)

    expect(graph.missing_dependencies).toEqual([{ system: 'battle', missing: ['character', 'skill'] }])
    const battle = graph.nodes.find((node) => node.system === 'battle')
    expect(battle).toMatchObject({ enabled: true, has_missing_dependency: true })
    const character = graph.nodes.find((node) => node.system === 'character')
    expect(character).toMatchObject({ enabled: false, has_missing_dependency: false })

    const edge = (s: string, t: string) => graph.edges.find((item) => item.source_system === s && item.target_system === t)
    expect(edge('battle', 'character')).toMatchObject({ source_enabled: true, target_enabled: false, missing: true })
    expect(edge('battle', 'skill')).toMatchObject({ missing: true })
    expect(edge('skill', 'character')).toMatchObject({ missing: false })
  })

  it('启用 battle+character+skill：依赖满足，缺失清零', () => {
    const doc = makeDoc()
    ;(doc.systems.battle as { enabled: boolean }).enabled = true
    ;(doc.systems.character as { enabled: boolean }).enabled = true
    ;(doc.systems.skill as { enabled: boolean }).enabled = true
    const graph = buildSystemDependencyGraph(doc)
    expect(graph.missing_dependencies).toHaveLength(0)
    expect(graph.nodes.filter((node) => node.enabled)).toHaveLength(3)
    expect(graph.nodes.find((node) => node.system === 'battle')?.has_missing_dependency).toBe(false)
    const edge = graph.edges.find((item) => item.source_system === 'battle' && item.target_system === 'character')
    expect(edge).toMatchObject({ source_enabled: true, target_enabled: true, missing: false })
  })

  it('仅启用 gacha：标记缺失 item/economy', () => {
    const doc = makeDoc()
    ;(doc.systems.gacha as { enabled: boolean }).enabled = true
    const graph = buildSystemDependencyGraph(doc)
    expect(graph.missing_dependencies).toEqual([{ system: 'gacha', missing: ['item', 'economy'] }])
  })
})