import {
  CHAPTER_LABELS,
  SYSTEM_DEPENDENCIES,
  SYSTEM_LABELS,
  checkSystemDependencies,
  type CeshuDocument,
  type ChapterData,
  type ChapterKey
} from '../../ceshuConstants'
import { isFilledValue, isPlainObject } from '../../ceshuModel'

/**
 * 字段级依赖规则 + 依赖图结构（纯逻辑，无 IO / DOM / React）。
 *
 * 语义来源（Python → TS 对照）：
 * - core/ceshu/field_dependencies.py        规则表 / 求值 / 章节邻接表 / 违规汇总
 * - ui/ceshu/field_dependency_graph.py      字段依赖图的数据与层级（Qt 渲染部分不移植）
 * - ui/ceshu/system_dependency_graph.py     系统依赖图的数据、拓扑层级与缺失标记（Qt 渲染部分不移植）
 *
 * 结构体字段一律 snake_case（后续跨 IPC）。
 */

import {
  DEP_TYPE_CONSISTENCY,
  STATUS_OK,
  STATUS_WARNING,
  STATUS_VIOLATION,
  STATUS_SEVERITY,
  SEVERITY_STATUS,
  FIELD_DEPENDENCIES,
  type FieldDependency,
  type FieldDependencyStatus,
  type FieldDependencyType
} from './ceshuFieldDepsData'
export * from './ceshuFieldDepsData'


/** 单条依赖的检查结果（对应 Python check_field_dependencies 的 dict 项） */
export interface FieldDependencyResult {
  dependency: FieldDependency
  status: FieldDependencyStatus
  message: string
  source_value: unknown
  target_value: unknown
}

/* ---- 字段取值 / 比较 ---- */

/**
 * 按点分路径取嵌套值（对应 Python _get_nested_value）。
 * 起始非对象或任一段缺失时返回 null（与 Python None 对应）。
 */
export function getNestedValue(data: unknown, path: string): unknown {
  if (!isPlainObject(data) || !path) return null
  let cur: unknown = data
  for (const seg of path.split('.')) {
    if (isPlainObject(cur) && seg in cur) cur = cur[seg]
    else return null
  }
  return cur
}

/**
 * 字段依赖视角的“空值”判定。
 *
 * 修正 Python 缺陷：Python 版用 `v is None or v == "" or v == [] or v == {}` 判空，
 * 由于 Python 的 `0 == ""`/`False == ""` 均为 False，导致 0 与 False 被误判为“已填写”
 * （新建文档 characters.main_npc_count=0 会误报“仅一侧字段已填写”警告）。
 * 此处复用项目既有的 isFilledValue 反向语义：null/undefined/''/0/false/[]/{} 均视为空，
 * 与 ceshu_validation / 进度计算的真值语义保持一致。
 */
export function isFieldDependencyEmpty(value: unknown): boolean {
  return !isFilledValue(value)
}

/**
 * 判断两个字段值是否一致（对应 Python _values_consistent + 相等比较）。
 * - 任一侧为空 → 视为一致（仅一侧设置不在此视为冲突）
 * - 两侧均非空 → 按值比较（列表逐项、对象键序无关；Python 中 True==1 亦在此对齐）
 */
export function valuesConsistent(a: unknown, b: unknown): boolean {
  if (isFieldDependencyEmpty(a) || isFieldDependencyEmpty(b)) return true
  return deepEqualValues(a, b)
}

/**
 * 值相等（对齐 Python `==` 语义）：
 * - 数组：长度相同且逐项相等（顺序敏感）
 * - 对象：键集合相同且逐键相等（键顺序无关，Python dict 相等与顺序无关）
 * - 布尔与数字：Python `True == 1` / `False == 0` 为真，此处按数值比较
 */
function deepEqualValues(a: unknown, b: unknown): boolean {
  if (a === b) return true
  if (typeof a === 'boolean' && typeof b === 'number') return Number(a) === b
  if (typeof a === 'number' && typeof b === 'boolean') return a === Number(b)
  if (Array.isArray(a) && Array.isArray(b)) {
    return a.length === b.length && a.every((item, index) => deepEqualValues(item, b[index]))
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const keysA = Object.keys(a)
    const keysB = Object.keys(b)
    if (keysA.length !== keysB.length) return false
    return keysA.every((key) => key in b && deepEqualValues(a[key], b[key]))
  }
  return false
}

/** 值的中文/近似 Python repr 展示（消息用） */
function formatValue(value: unknown): string {
  if (value === null || value === undefined) return 'None'
  if (typeof value === 'string') return `'${value}'`
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (typeof value === 'number') return String(value)
  if (Array.isArray(value)) return `[${value.map((item) => formatValue(item)).join(', ')}]`
  if (isPlainObject(value)) {
    const entries = Object.entries(value).map(([key, item]) => `'${key}': ${formatValue(item)}`)
    return `{${entries.join(', ')}}`
  }
  return String(value)
}

/* ---- 依赖查询 / 求值 ---- */

/** 获取与指定章节相关的所有依赖（作为源或目标）（对应 Python get_dependencies_for_chapter） */
export function getDependenciesForChapter(chapterKey: ChapterKey): FieldDependency[] {
  return FIELD_DEPENDENCIES.filter(
    (dep) => dep.source_chapter === chapterKey || dep.target_chapter === chapterKey
  )
}

/** 获取指定字段参与的依赖（对应 Python get_dependencies_for_field） */
export function getDependenciesForField(chapterKey: ChapterKey, fieldPath: string): FieldDependency[] {
  return FIELD_DEPENDENCIES.filter(
    (dep) =>
      (dep.source_chapter === chapterKey && dep.source_field === fieldPath) ||
      (dep.target_chapter === chapterKey && dep.target_field === fieldPath)
  )
}

/**
 * 检查全部字段依赖，返回逐条结果（对应 Python check_field_dependencies）。
 * 章节快照只取一次（对应 Python 预取缓存）。
 */
export function evaluateFieldDependencies(doc: CeshuDocument): FieldDependencyResult[] {
  const cache = new Map<ChapterKey, ChapterData>()
  const chapterOf = (key: ChapterKey): ChapterData => {
    let chapter = cache.get(key)
    if (chapter === undefined) {
      chapter = doc[key]
      cache.set(key, chapter)
    }
    return chapter
  }

  const results: FieldDependencyResult[] = []
  for (const dep of FIELD_DEPENDENCIES) {
    const sourceValue = getNestedValue(chapterOf(dep.source_chapter), dep.source_field)
    const targetValue = getNestedValue(chapterOf(dep.target_chapter), dep.target_field)
    const sourceEmpty = isFieldDependencyEmpty(sourceValue)
    const targetEmpty = isFieldDependencyEmpty(targetValue)

    let status: FieldDependencyStatus
    let message: string
    if (sourceEmpty && targetEmpty) {
      status = STATUS_OK
      message = '两侧字段均未填写，暂无冲突'
    } else if (sourceEmpty || targetEmpty) {
      status = STATUS_WARNING
      message =
        `仅一侧字段已填写（${dep.source_chapter}.${dep.source_field}=${formatValue(sourceValue)}, ` +
        `${dep.target_chapter}.${dep.target_field}=${formatValue(targetValue)}）`
    } else if (valuesConsistent(sourceValue, targetValue)) {
      status = STATUS_OK
      message = '字段值一致，依赖满足'
    } else {
      status = STATUS_VIOLATION
      message =
        `依赖冲突：${dep.source_chapter}.${dep.source_field}=${formatValue(sourceValue)} ` +
        `与 ${dep.target_chapter}.${dep.target_field}=${formatValue(targetValue)} 不一致`
    }

    results.push({ dependency: dep, status, message, source_value: sourceValue, target_value: targetValue })
  }
  return results
}

/**
 * 章节 → 依赖目标 的邻接表（对应 Python build_dependency_graph）。
 * source 依赖 target，故 target 出现在 source 的依赖列表中；仅含存在依赖关系的章节。
 */
export function buildChapterDependencyAdjacency(): Record<string, string[]> {
  const graph: Record<string, string[]> = {}
  for (const dep of FIELD_DEPENDENCIES) {
    let targets = graph[dep.source_chapter]
    if (targets === undefined) {
      targets = []
      graph[dep.source_chapter] = targets
    }
    if (!targets.includes(dep.target_chapter)) targets.push(dep.target_chapter)
    if (!(dep.target_chapter in graph)) graph[dep.target_chapter] = []
  }
  return graph
}

/**
 * 每个章节的违规状态汇总（取最严重者，对应 Python get_chapter_violation_summary）。
 * 供依赖图节点着色。
 */
export function getChapterViolationSummary(doc: CeshuDocument): Record<string, FieldDependencyStatus> {
  const chapterSeverity: Record<string, number> = {}
  for (const item of evaluateFieldDependencies(doc)) {
    const severity = STATUS_SEVERITY[item.status]
    for (const chapter of [item.dependency.source_chapter, item.dependency.target_chapter]) {
      chapterSeverity[chapter] = Math.max(chapterSeverity[chapter] ?? 0, severity)
    }
  }
  const summary: Record<string, FieldDependencyStatus> = {}
  for (const [chapter, severity] of Object.entries(chapterSeverity)) {
    summary[chapter] = SEVERITY_STATUS[severity] ?? STATUS_OK
  }
  return summary
}

/* ---- 依赖图：层级（拓扑最长链） ---- */

/**
 * 计算每个节点的层级（最长依赖链长度，与 Python _layered_layout / _topological_layers 一致）。
 * 无依赖 → 0；有环时回退为 0（防死递归）。
 */
function computeDependencyLevels(
  adjacency: Record<string, readonly string[]>,
  allNodes: readonly string[]
): Record<string, number> {
  const nodeSet = new Set(allNodes)
  const level: Record<string, number> = {}
  const visiting = new Set<string>()

  const compute = (node: string): number => {
    const cached = level[node]
    if (cached !== undefined) return cached
    if (visiting.has(node)) return 0
    visiting.add(node)
    const deps = (adjacency[node] ?? []).filter((dep) => nodeSet.has(dep))
    let value = 0
    if (deps.length > 0) {
      let maxDep = -1
      for (const dep of deps) maxDep = Math.max(maxDep, compute(dep))
      value = Math.max(1 + maxDep, 0)
    }
    visiting.delete(node)
    level[node] = value
    return value
  }

  for (const node of allNodes) compute(node)
  return level
}

/** 按层级分组（层内按字典序排序，与 Python 一致） */
function groupLevels(levels: Record<string, number>): string[][] {
  const values = Object.values(levels)
  const maxLevel = values.length > 0 ? Math.max(...values) : 0
  const layers: string[][] = Array.from({ length: maxLevel + 1 }, () => [])
  for (const [node, lv] of Object.entries(levels)) layers[lv].push(node)
  for (const layer of layers) layer.sort()
  return layers
}

/* ---- 字段依赖图 ---- */

export interface FieldDependencyGraphNode {
  chapter: ChapterKey
  label: string
  level: number
  status: FieldDependencyStatus
}

export interface FieldDependencyGraphEdge {
  source_chapter: ChapterKey
  target_chapter: ChapterKey
  /** source → target 的依赖类型（多条同类边去重后取第一条，对应 Python _find_dep_type） */
  dependency_type: FieldDependencyType
}

export interface FieldDependencyGraph {
  nodes: FieldDependencyGraphNode[]
  edges: FieldDependencyGraphEdge[]
  /** 分层结构（层内按字典序），按 level 升序 */
  layers: string[][]
}

/** 查找 src → dst 的依赖类型（取第一条匹配，对应 Python FieldDependencyGraphDialog._find_dep_type） */
function findDependencyType(source: string, target: string): FieldDependencyType {
  for (const dep of FIELD_DEPENDENCIES) {
    if (dep.source_chapter === source && dep.target_chapter === target) return dep.dependency_type
  }
  return DEP_TYPE_CONSISTENCY
}

/**
 * 构建字段依赖图（对应 Python build_dependency_graph + _layered_layout 的数据部分）。
 * 章节级边按 (source, target) 去重；节点附带章节标签、层级与（可选模型下的）违规状态。
 */
export function buildFieldDependencyGraph(doc?: CeshuDocument): FieldDependencyGraph {
  const adjacency = buildChapterDependencyAdjacency()
  const allNodes = Object.keys(adjacency)
  const levels = computeDependencyLevels(adjacency, allNodes)
  const layers = groupLevels(levels)
  const statusOf = doc ? getChapterViolationSummary(doc) : {}

  const nodes: FieldDependencyGraphNode[] = []
  layers.forEach((layer, level) => {
    for (const chapter of layer) {
      nodes.push({
        chapter: chapter as ChapterKey,
        label: CHAPTER_LABELS[chapter as ChapterKey] ?? chapter,
        level,
        status: statusOf[chapter] ?? STATUS_OK
      })
    }
  })

  const edges: FieldDependencyGraphEdge[] = []
  for (const [source, targets] of Object.entries(adjacency)) {
    for (const target of targets) {
      edges.push({
        source_chapter: source as ChapterKey,
        target_chapter: target as ChapterKey,
        dependency_type: findDependencyType(source, target)
      })
    }
  }

  return { nodes, edges, layers }
}

/* ---- 系统依赖图 ---- */

export interface SystemDependencyGraphNode {
  system: string
  label: string
  enabled: boolean
  /** 该已启用系统的依赖未满足（对应 Python missing_deps_map 命中） */
  has_missing_dependency: boolean
  level: number
}

export interface SystemDependencyGraphEdge {
  source_system: string
  target_system: string
  source_enabled: boolean
  target_enabled: boolean
  /** source 已启用而 target 未启用 → 依赖缺失（Python 中画为红色虚线） */
  missing: boolean
}

export interface SystemDependencyGraph {
  nodes: SystemDependencyGraphNode[]
  edges: SystemDependencyGraphEdge[]
  layers: string[][]
  /** 已启用系统中缺失依赖明细（对应 Python check_system_dependencies 结果） */
  missing_dependencies: Array<{ system: string; missing: string[] }>
}

/** 已启用的系统 key（对应 Python 遍历 model.systems 取 v.get("enabled") 为真者） */
function getEnabledSystemKeys(doc: CeshuDocument): string[] {
  if (!isPlainObject(doc.systems)) return []
  const keys: string[] = []
  for (const [key, value] of Object.entries(doc.systems)) {
    if (isPlainObject(value) && Boolean(value.enabled)) keys.push(key)
  }
  return keys
}

/**
 * 构建系统依赖图（对应 Python _topological_layers + _render_graph 的数据部分）。
 * 依赖来源复用 ceshuConstants.SYSTEM_DEPENDENCIES，不重复定义规则表。
 * doc 为空（未加载策划书）时所有系统视为未启用。
 */
export function buildSystemDependencyGraph(doc?: CeshuDocument): SystemDependencyGraph {
  const allNodes: string[] = []
  const seen = new Set<string>()
  const pushNode = (node: string): void => {
    if (!seen.has(node)) {
      seen.add(node)
      allNodes.push(node)
    }
  }
  for (const [system, deps] of Object.entries(SYSTEM_DEPENDENCIES)) {
    pushNode(system)
    for (const dep of deps) pushNode(dep)
  }

  const levels = computeDependencyLevels(SYSTEM_DEPENDENCIES, allNodes)
  const layers = groupLevels(levels)

  const enabledKeys = doc ? getEnabledSystemKeys(doc) : []
  const enabled = new Set(enabledKeys)
  const missingDependencies = checkSystemDependencies(enabledKeys)
  const missingSystems = new Set(missingDependencies.map((item) => item.system))

  const nodes: SystemDependencyGraphNode[] = []
  layers.forEach((layer, level) => {
    for (const system of layer) {
      nodes.push({
        system,
        label: SYSTEM_LABELS[system] ?? system,
        enabled: enabled.has(system),
        has_missing_dependency: missingSystems.has(system),
        level
      })
    }
  })

  const edges: SystemDependencyGraphEdge[] = []
  for (const [source, deps] of Object.entries(SYSTEM_DEPENDENCIES)) {
    for (const target of deps) {
      edges.push({
        source_system: source,
        target_system: target,
        source_enabled: enabled.has(source),
        target_enabled: enabled.has(target),
        missing: enabled.has(source) && !enabled.has(target)
      })
    }
  }

  return { nodes, edges, layers, missing_dependencies: missingDependencies }
}

/* ---- 聚合报告（供 IPC 一次返回面板所需的全部数据） ---- */

export interface CeshuFieldDepsReport {
  /** 20 条依赖的逐条检查结果 */
  results: FieldDependencyResult[]
  /** 章节 → 最严重违规状态（图节点着色用） */
  chapter_status: Record<string, FieldDependencyStatus>
  field_graph: FieldDependencyGraph
  system_graph: SystemDependencyGraph
}

/** 汇总字段依赖检查 + 两张依赖图（对应 Python 两个依赖图对话框的数据来源） */
export function buildFieldDepsReport(doc: CeshuDocument): CeshuFieldDepsReport {
  return {
    results: evaluateFieldDependencies(doc),
    chapter_status: getChapterViolationSummary(doc),
    field_graph: buildFieldDependencyGraph(doc),
    system_graph: buildSystemDependencyGraph(doc)
  }
}