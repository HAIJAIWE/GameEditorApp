import type { CeshuSummary } from '../../ceshuConstants'

/**
 * 版本时间线纯逻辑（自 旧版 `ui/ceshu/version_timeline_dialog` 匹平迁移）：
 * - 节点尺寸/配色常量（旧版 _NODE_W/_NODE_H/_NODE_GAP/_NODE_Y + 颜色表）
 * - 节点文案：标题（主策划前缀 ★、激活后缀 ★）、时间（截断 16 字符）、名称（超 18 字截断）
 * - 横向布局：节点坐标 + 父→子箭头 + 场景尺寸（旧版 _draw_timeline）
 * - 默认选中策略（优先激活版本）与详情文案（旧版 _select_node）
 * 渲染层只负责把布局画成 SVG，不重复业务判断。
 */

/* ---- 节点尺寸（对应 旧版 常量） ---- */

export const TIMELINE_NODE_WIDTH = 180
export const TIMELINE_NODE_HEIGHT = 80
/** 节点间水平间距 */
export const TIMELINE_NODE_GAP = 60
/** 节点左上角 Y 坐标 */
export const TIMELINE_NODE_Y = 120
/** 左侧留白（节点起点 X） */
export const TIMELINE_PADDING = 20
export const TIMELINE_MIN_SCENE_WIDTH = 880
export const TIMELINE_SCENE_HEIGHT = 240

/** 配色（与 旧版 _COLOR_* 一致） */
export const TIMELINE_COLORS = {
  /** 激活版本 — 绿 */
  active: '#22C55E',
  activeBorder: '#16A34A',
  /** 主策划（非激活） — 蓝 */
  main: '#3B82F6',
  mainBorder: '#1D4ED8',
  /** 子版本（非激活） — 灰蓝 */
  sub: '#90A4AE',
  subBorder: '#455A64',
  arrow: '#888888',
  /** 选中边框 — 橙 */
  selected: '#F59E0B'
} as const

/** 图例（顺序与 旧版 _build_legend 一致） */
export const TIMELINE_LEGEND: ReadonlyArray<{ color: string; label: string }> = [
  { color: TIMELINE_COLORS.active, label: '激活版本' },
  { color: TIMELINE_COLORS.main, label: '主策划' },
  { color: TIMELINE_COLORS.sub, label: '子版本' },
  { color: TIMELINE_COLORS.arrow, label: '→ 父→子派生' }
]

export type TimelineNodeKind = 'active' | 'main' | 'sub'

/** 节点填充/边框色（对应 旧版 节点的颜色策略：激活 > 主策划 > 子版本） */
export const TIMELINE_KIND_COLORS: Record<TimelineNodeKind, { fill: string; border: string }> = {
  active: { fill: TIMELINE_COLORS.active, border: TIMELINE_COLORS.activeBorder },
  main: { fill: TIMELINE_COLORS.main, border: TIMELINE_COLORS.mainBorder },
  sub: { fill: TIMELINE_COLORS.sub, border: TIMELINE_COLORS.subBorder }
}

export interface TimelineNode {
  id: string
  versionLabel: string
  /** 节点标题（主策划前缀 ★、激活后缀 ★，对应 旧版 节点的 vlabel） */
  label: string
  kind: TimelineNodeKind
  fill: string
  border: string
  /** 更新时间（updated_at 优先，其次 created_at；截断 16 字符，无则 (无时间)） */
  timeText: string
  /** 完整更新时间（详情面板用，无则 (无)） */
  updatedFull: string
  /** 名称（节点展示，超 18 字截断加 …；空为 未命名） */
  nameText: string
  /** 完整名称（详情面板用） */
  gameName: string
  /** 版本说明（详情面板用） */
  versionNote: string
  /** 总进度百分比整数（旧版 int(float(progress) * 100)） */
  progressPercent: number
  x: number
  y: number
  index: number
}

export interface TimelineArrow {
  fromX: number
  fromY: number
  toX: number
  toY: number
}

export interface TimelineLayout {
  nodes: TimelineNode[]
  arrows: TimelineArrow[]
  /** 时间线主轴 Y 坐标（节点垂直中心） */
  axisY: number
  totalWidth: number
  sceneWidth: number
  sceneHeight: number
}

export interface TimelineDetail {
  /** 详情标题（含「（激活版本）」后缀） */
  title: string
  versionLabel: string
  name: string
  updated: string
  progressPercent: number
  note: string
}

/** 节点类型：激活优先，其次主策划（无 parent_id；list_versions 中首位即主策划），否则子版本 */
export function classifyTimelineNode(version: Pick<CeshuSummary, 'isActive' | 'parentId'>): TimelineNodeKind {
  if (version.isActive) return 'active'
  return version.parentId ? 'sub' : 'main'
}

/** 节点标题：激活加后缀「 ★」，主策划加前缀「★ 」（对应 旧版 _VersionNodeItem 的 vlabel 拼装） */
export function timelineNodeLabel(version: Pick<CeshuSummary, 'versionLabel' | 'isActive' | 'parentId'>): string {
  let label = version.versionLabel || 'v?'
  if (version.isActive) label += ' ★'
  if (!version.parentId) label = `★ ${label}`
  return label
}

/** 节点时间文案：updated_at 优先，其次 created_at；长度 >= 16 时截断到 16 字符，缺失为 (无时间) */
export function timelineTimeText(version: Pick<CeshuSummary, 'updatedAt' | 'createdAt'>): string {
  const raw = version.updatedAt || version.createdAt
  if (!raw) return '(无时间)'
  return raw.length >= 16 ? raw.slice(0, 16) : raw
}

/** 详情时间文案：updated_at 优先，其次 created_at，缺失为 (无) */
export function timelineUpdatedFull(version: Pick<CeshuSummary, 'updatedAt' | 'createdAt'>): string {
  return version.updatedAt || version.createdAt || '(无)'
}

/** 节点名称文案：空为「未命名」；超 18 字截断为前 17 字 + … */
export function timelineNameText(name: string): string {
  const value = name || '未命名'
  return value.length > 18 ? `${value.slice(0, 17)}…` : value
}

/** 进度百分比整数（非有限数按 0，对应 旧版 try/except） */
export function timelineProgressPercent(progress: number): number {
  return Number.isFinite(progress) ? Math.trunc(progress * 100) : 0
}

/** 横向时间线布局（对应 旧版 _draw_timeline：主轴 + 节点 + 父→子箭头） */
export function buildTimelineLayout(versions: CeshuSummary[]): TimelineLayout {
  const count = versions.length
  const totalWidth = count * TIMELINE_NODE_WIDTH + Math.max(count - 1, 0) * TIMELINE_NODE_GAP
  const axisY = TIMELINE_NODE_Y + TIMELINE_NODE_HEIGHT / 2
  const nodes: TimelineNode[] = []
  const arrows: TimelineArrow[] = []
  let prevX: number | null = null

  versions.forEach((version, index) => {
    const x = TIMELINE_PADDING + index * (TIMELINE_NODE_WIDTH + TIMELINE_NODE_GAP)
    const kind = classifyTimelineNode(version)
    nodes.push({
      id: version.id,
      versionLabel: version.versionLabel,
      label: timelineNodeLabel(version),
      kind,
      fill: TIMELINE_KIND_COLORS[kind].fill,
      border: TIMELINE_KIND_COLORS[kind].border,
      timeText: timelineTimeText(version),
      updatedFull: timelineUpdatedFull(version),
      nameText: timelineNameText(version.gameName),
      gameName: version.gameName || '未命名',
      versionNote: version.versionNote,
      progressPercent: timelineProgressPercent(version.progress),
      x,
      y: TIMELINE_NODE_Y,
      index
    })
    if (prevX !== null) {
      arrows.push({
        fromX: prevX + TIMELINE_NODE_WIDTH,
        fromY: axisY,
        toX: x,
        toY: axisY
      })
    }
    prevX = x
  })

  return {
    nodes,
    arrows,
    axisY,
    totalWidth,
    sceneWidth: Math.max(totalWidth + TIMELINE_PADDING * 2, TIMELINE_MIN_SCENE_WIDTH),
    sceneHeight: TIMELINE_SCENE_HEIGHT
  }
}

/** 默认选中节点：优先激活版本，否则回退当前版本（对应 旧版 _draw_timeline 的 default_id 逻辑） */
export function defaultTimelineSelectionId(versions: CeshuSummary[], currentId: string): string {
  const active = versions.find((version) => version.isActive)
  return active?.id ?? currentId
}

/** 节点详情（对应 旧版 _select_node 写入详情面板的文案） */
export function buildTimelineDetail(node: TimelineNode): TimelineDetail {
  return {
    title: `版本详情：${node.versionLabel || 'v?'}${node.kind === 'active' ? '（激活版本）' : ''}`,
    versionLabel: node.versionLabel || 'v?',
    name: node.gameName,
    updated: node.updatedFull,
    progressPercent: node.progressPercent,
    note: node.versionNote || '(无版本说明)'
  }
}