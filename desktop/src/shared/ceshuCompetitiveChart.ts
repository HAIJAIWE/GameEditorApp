/**
 * 竞品象限图纯逻辑（自 Python `ui/ceshu/competitive_chart.py` 匹平迁移）：
 * - 画布尺寸/留白常量与网格步长（Python _draw 中 w/h/margin 与 range(0,101,25)）
 * - 网格线坐标、散点投影公式（Python _draw 的网格与 max(0,min(100,...)) 投影）
 * - 竞品数据归一化（Python set_data / _draw 遍历前 5 项）
 * 渲染层只负责把坐标画成 SVG，不重复几何判断。
 *
 * 颜色说明：Python 中颜色取自 theme_color(...) or 固定 fallback，
 * TS 侧不接主题变量，直接固定使用 Python 的 fallback 值。
 */

/** 画布宽（对应 Python w=340） */
export const CHART_WIDTH = 340
/** 画布高（对应 Python h=260） */
export const CHART_HEIGHT = 260
/** 四周边距（对应 Python margin=50） */
export const CHART_MARGIN = 50
/** 网格步长（对应 Python range(0,101,25)） */
export const CHART_GRID_STEPS: number[] = [0, 25, 50, 75, 100]
/** 横轴标签（对应 Python x_label） */
export const CHART_X_LABEL = '创新度 →'
/** 纵轴标签（对应 Python y_label） */
export const CHART_Y_LABEL = '完成度 →'
/** 缺失分数时的默认值（对应 Python 默认 50） */
export const COMPETITOR_DEFAULT_SCORE = 50
/** 最多展示的竞品数量（对应 Python self._competitors[:5]） */
export const MAX_COMPETITORS = 5
/**
 * 5 色，照抄 Python colors 列表的 fallback 值顺序：
 * agent_steward / agent_planner / agent_ops / accent / agent_analyst
 */
export const COMPETITOR_COLORS: string[] = [
  '#534AB7',
  '#1D9E75',
  '#D85A30',
  '#0EA5E9',
  '#BA7517'
]

export interface CompetitorPoint {
  name: string
  /** 归一化后的创新度（0-100） */
  innovation: number
  /** 归一化后的完成度（0-100） */
  completion: number
  color: string
  /** 投影后的画布 X 坐标 */
  x: number
  /** 投影后的画布 Y 坐标 */
  y: number
}

/** 非有限数字（含 undefined/null/字符串/NaN）→ 默认 50；否则 clamp 到 [0,100] */
export function clampScore(value: unknown): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) return COMPETITOR_DEFAULT_SCORE
  return Math.max(0, Math.min(100, value))
}

/** 横轴投影：margin + (w - margin - 20) * clamp(v) / 100 */
export function projectX(innovation: unknown): number {
  return CHART_MARGIN + (CHART_WIDTH - CHART_MARGIN - 20) * clampScore(innovation) / 100
}

/** 纵轴投影：h - margin - (h - margin - 20) * clamp(v) / 100 */
export function projectY(completion: unknown): number {
  return CHART_HEIGHT - CHART_MARGIN - (CHART_HEIGHT - CHART_MARGIN - 20) * clampScore(completion) / 100
}

/** 网格线位置：{ xs, ys }，与 CHART_GRID_STEPS 一一对应 */
export function chartGridPositions(): { xs: number[]; ys: number[] } {
  return {
    xs: CHART_GRID_STEPS.map((i) => CHART_MARGIN + (CHART_WIDTH - CHART_MARGIN - 20) * i / 100),
    ys: CHART_GRID_STEPS.map((i) => CHART_HEIGHT - CHART_MARGIN - (CHART_HEIGHT - CHART_MARGIN - 20) * i / 100)
  }
}

/** 普通对象判断（对应 Python isinstance(comp, dict)） */
function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * 归一化竞品列表（对应 Python set_data/_draw）：
 * 非数组返回 []；只取前 MAX_COMPETITORS 项；跳过非普通对象但保留原始下标。
 */
export function normalizeCompetitors(value: unknown): CompetitorPoint[] {
  if (!Array.isArray(value)) return []
  const result: CompetitorPoint[] = []
  const items = value.slice(0, MAX_COMPETITORS)
  items.forEach((raw, i) => {
    if (!isPlainObject(raw)) return
    const rawName = raw.name
    const name = typeof rawName === 'string' ? rawName : `竞品${i + 1}`
    result.push({
      name,
      innovation: clampScore(raw.innovation_score),
      completion: clampScore(raw.completion_score),
      color: COMPETITOR_COLORS[i % COMPETITOR_COLORS.length],
      x: projectX(raw.innovation_score),
      y: projectY(raw.completion_score)
    })
  })
  return result
}