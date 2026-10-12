import {
  CHART_HEIGHT,
  CHART_MARGIN,
  CHART_WIDTH,
  CHART_X_LABEL,
  CHART_Y_LABEL,
  chartGridPositions,
  normalizeCompetitors
} from '../../../shared/domain/ceshu/ceshuCompetitiveChart'

/**
 * 竞品象限图（对应 Python ui/ceshu/competitive_chart.py）：
 * 横轴=创新度、纵轴=完成度（0-100），最多 5 个竞品散点。
 * 数据来源为 vision 章的 legacy 字段 competitive_analysis（只读可视化，不可编辑）。
 */

interface CompetitiveChartProps {
  competitors: unknown
}

export default function CompetitiveChart({ competitors }: CompetitiveChartProps) {
  const points = normalizeCompetitors(competitors)
  const { xs, ys } = chartGridPositions()

  return (
    <svg
      className="competitive-chart"
      data-testid="competitive-chart"
      viewBox={`0 0 ${CHART_WIDTH} ${CHART_HEIGHT}`}
      role="img"
      aria-label="竞品象限图（横轴创新度，纵轴完成度）"
    >
      {xs.map((x) => (
        <line
          key={`grid-v-${x}`}
          className="competitive-chart-grid"
          x1={x}
          y1={CHART_MARGIN}
          x2={x}
          y2={CHART_HEIGHT - 20}
        />
      ))}
      {ys.map((y) => (
        <line
          key={`grid-h-${y}`}
          className="competitive-chart-grid"
          x1={CHART_MARGIN}
          y1={y}
          x2={CHART_WIDTH - 20}
          y2={y}
        />
      ))}
      <line
        className="competitive-chart-axis"
        x1={CHART_MARGIN}
        y1={CHART_MARGIN}
        x2={CHART_MARGIN}
        y2={CHART_HEIGHT - 20}
      />
      <line
        className="competitive-chart-axis"
        x1={CHART_MARGIN}
        y1={CHART_HEIGHT - CHART_MARGIN}
        x2={CHART_WIDTH - 20}
        y2={CHART_HEIGHT - CHART_MARGIN}
      />
      <text className="competitive-chart-label" x={CHART_WIDTH - 80} y={CHART_HEIGHT - 40}>
        {CHART_X_LABEL}
      </text>
      <text className="competitive-chart-label" x={10} y={10}>
        {CHART_Y_LABEL}
      </text>
      {points.map((point, index) => (
        <g key={`${point.name}-${index}`} data-testid="competitor-point">
          <circle
            cx={point.x}
            cy={point.y}
            r={5}
            fill={point.color}
            fillOpacity={0.55}
            stroke={point.color}
            strokeWidth={2}
          />
          <text className="competitive-chart-name" x={point.x + 8} y={point.y - 10} fill={point.color}>
            {point.name}
          </text>
        </g>
      ))}
    </svg>
  )
}