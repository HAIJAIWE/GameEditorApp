import { useEffect, useState } from 'react'

import { useT } from '@mobai/client-ui'

import type { CeshuSummary } from '@mobai/shared/ceshu/reference'
import {
  TIMELINE_COLORS,
  TIMELINE_LEGEND,
  TIMELINE_NODE_HEIGHT,
  TIMELINE_NODE_WIDTH,
  buildTimelineDetail,
  buildTimelineLayout,
  defaultTimelineSelectionId
} from '@mobai/shared/domain/ceshu/ceshuTimeline'
import { toErrorMessage } from '@mobai/shared/util/system'

/**
 * 版本时间线面板：
 * - 读取同版本链下的所有版本（ceshu:versions，主策划在首位）
 * - 横向时间线：主轴虚线 + 节点（版本号/时间/名称）+ 父→子箭头；绿色=激活、蓝色=主策划、灰蓝=子版本
 * - 点击节点 → 底部展示版本说明与完成进度；「切换到此版本」切换到选中版本
 * 说明：旧版 用 QGraphicsScene 绘制，TS 改为等价 SVG（信息与交互一致、可断言）。
 */

interface VersionTimelinePanelProps {
  ceshuId: string
  /** 当前打开的版本 id（默认选中回退值） */
  currentId: string
  onSelect: (id: string) => void
  onClose: () => void
}

/** 箭头头部三角形 */
function arrowHead(toX: number, toY: number): string {
  const size = 8
  return `${toX},${toY} ${toX - size},${toY - size / 2} ${toX - size},${toY + size / 2}`
}

export default function VersionTimelinePanel({ ceshuId, currentId, onSelect, onClose }: VersionTimelinePanelProps) {
  const t = useT()
  const [versions, setVersions] = useState<CeshuSummary[] | null>(null)
  const [selectedId, setSelectedId] = useState('')
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.mbApi.ceshu
      .versions({ id: ceshuId })
      .then((loaded) => {
        if (cancelled) return
        setVersions(loaded)
        setSelectedId(defaultTimelineSelectionId(loaded, currentId))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [ceshuId, currentId])

  const layout = buildTimelineLayout(versions ?? [])
  const selectedNode = layout.nodes.find((node) => node.id === selectedId) ?? null
  const detail = selectedNode ? buildTimelineDetail(selectedNode) : null

  return (
    <div className="changelog-panel" data-testid="timeline-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">{t('timeline.title')}</span>
        <div className="editor-actions">
          <button
            type="button"
            className="btn primary"
            data-testid="timeline-switch"
            disabled={!selectedId}
            onClick={() => {
              if (!selectedId) return
              onSelect(selectedId)
              onClose()
            }}
          >
            {t('timeline.switchTo')}
          </button>
          <button type="button" className="btn" data-testid="timeline-close" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      </div>

      <div className="item-meta">{t('timeline.hint')}</div>

      <div className="timeline-legend" data-testid="timeline-legend">
        {TIMELINE_LEGEND.map((item) => (
          <span className="timeline-legend-item" key={item.label}>
            <span style={{ color: item.color }}>●</span>
            {item.label}
          </span>
        ))}
      </div>

      {error && (
        <div className="form-error" data-testid="timeline-error">
          {error}
        </div>
      )}

      {!versions ? (
        <div className="empty">{t('timeline.loading')}</div>
      ) : layout.nodes.length === 0 ? (
        <div className="empty">{t('timeline.noVersions')}</div>
      ) : (
        <>
          <div className="timeline-canvas" data-testid="timeline-canvas">
            <svg
              width={layout.sceneWidth}
              height={layout.sceneHeight}
              role="img"
              aria-label={t('timeline.aria')}
              data-testid="timeline-svg"
            >
              {/* 主轴（虚线） */}
              <line
                x1={20}
                y1={layout.axisY}
                x2={layout.totalWidth + 20}
                y2={layout.axisY}
                stroke={TIMELINE_COLORS.arrow}
                strokeWidth={2}
                strokeDasharray="6 4"
              />
              {/* 父 → 子箭头 */}
              {layout.arrows.map((arrow, index) => (
                <g key={`arrow-${index}`}>
                  <line
                    x1={arrow.fromX}
                    y1={arrow.fromY}
                    x2={arrow.toX}
                    y2={arrow.toY}
                    stroke={TIMELINE_COLORS.arrow}
                    strokeWidth={2}
                  />
                  <polygon points={arrowHead(arrow.toX, arrow.toY)} fill={TIMELINE_COLORS.arrow} />
                </g>
              ))}
              {/* 版本节点 */}
              {layout.nodes.map((node) => {
                const selected = node.id === selectedId
                return (
                  <g
                    key={node.id}
                    className="timeline-node"
                    data-testid="timeline-node"
                    onClick={() => setSelectedId(node.id)}
                  >
                    <rect
                      x={node.x}
                      y={node.y}
                      width={TIMELINE_NODE_WIDTH}
                      height={TIMELINE_NODE_HEIGHT}
                      rx={8}
                      fill={node.fill}
                      stroke={selected ? TIMELINE_COLORS.selected : node.border}
                      strokeWidth={selected ? 3 : 2}
                    />
                    <text x={node.x + 8} y={node.y + 22} fill="#ffffff" fontSize={13} fontWeight={600}>
                      {node.label}
                    </text>
                    <text x={node.x + 8} y={node.y + 44} fill="#ffffff" fontSize={11}>
                      {node.timeText}
                    </text>
                    <text x={node.x + 8} y={node.y + 64} fill="#ffffff" fontSize={11}>
                      {node.nameText}
                    </text>
                  </g>
                )
              })}
            </svg>
          </div>

          <div className="timeline-detail" data-testid="timeline-detail">
            <span className="timeline-detail-title" data-testid="timeline-detail-title">
              {detail?.title ?? t('timeline.detailFallback')}
            </span>
            {detail ? (
              <>
                <span>{t('timeline.versionLabel', { label: detail.versionLabel })}</span>
                <span>{t('timeline.nameLabel', { name: detail.name })}</span>
                <span>{t('timeline.updatedLabel', { updated: detail.updated })}</span>
                <span>{t('timeline.progressLabel', { percent: detail.progressPercent })}</span>
                <span>{t('timeline.noteLabel', { note: detail.note })}</span>
              </>
            ) : (
              <span>{t('timeline.clickNode')}</span>
            )}
          </div>
        </>
      )}
    </div>
  )
}