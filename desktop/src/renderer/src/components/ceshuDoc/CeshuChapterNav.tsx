import {
  CHAPTER_LABELS,
  MODULE_CHAPTERS,
  contentChapterCount,
  type ChapterKey
} from '../../../../shared/ceshu/reference'
import type { AiGeneratedMap } from '../../../../shared/ceshu/prompts'
import {
  CESHU_STAGE_LABELS,
  CESHU_STAGE_ORDER,
  type CeshuStage
} from '../../../../shared/ceshu/workflow'
import type { PluginHost } from '../../../../shared/plugin/host'

import { ViewMount } from '../../plugins/host'
import { CESHU_CHAPTERNAV_MOUNT, type CeshuViewContextValue } from '../../plugins/ceshu'
import { ARTIFACTS, type ArtifactKey } from './ceshuArtifacts'

/**
 * 左栏：产出物切换 + 阶段筛选 + 系统模块 / 一页总览入口 + 章节大纲（含进度与待核对点）。
 *
 * 纯展示件：筛选、当前章、视图模式都是 `CeshuView` 的 state，本组件只接收值与回调。
 * 返回的**就是** `<div className="chapter-nav">` 本身——不额外包一层容器，
 * 保证 DOM 结构与拆分前逐字一致。
 */
interface CeshuChapterNavProps {
  activeArtifact: ArtifactKey
  /** 切产出物（`'doc'` 关掉产出物视图，其余打开 `${key}.view`） */
  onSelectArtifact: (key: ArtifactKey) => void
  stageFilter: CeshuStage | 'all'
  onStageFilterChange: (stage: CeshuStage | 'all') => void
  /** 已启用的系统模块数（分母取 `MODULE_CHAPTERS.length`） */
  enabledModuleCount: number
  onOpenModulePicker: () => void
  viewMode: 'edit' | 'overview'
  onToggleViewMode: () => void
  /** 阶段筛选后的章节列表（父组件已按阶段 + 当前章过滤） */
  chapters: readonly ChapterKey[]
  progress: Record<string, number>
  activeChapter: ChapterKey
  aiMarks: AiGeneratedMap
  /** 点章节：切章并退出「一页总览」 */
  onSelectChapter: (chapter: ChapterKey) => void
  scope: 'full' | 'lite'
  host: PluginHost
  viewContext: CeshuViewContextValue
}

export default function CeshuChapterNav({
  activeArtifact,
  onSelectArtifact,
  stageFilter,
  onStageFilterChange,
  enabledModuleCount,
  onOpenModulePicker,
  viewMode,
  onToggleViewMode,
  chapters,
  progress,
  activeChapter,
  aiMarks,
  onSelectChapter,
  scope,
  host,
  viewContext
}: CeshuChapterNavProps) {
  return (
    <div className="chapter-nav">
      {/* 产出物切换：设计文档 / 原型预览 / 数据·机读 / 岗位任务 */}
      <div className="artifact-switch" role="group" aria-label="产出物">
        {ARTIFACTS.map((item) => (
          <button
            key={item.key}
            type="button"
            data-testid={`artifact-${item.key}`}
            className={`artifact-btn${activeArtifact === item.key ? ' active' : ''}`}
            onClick={() => onSelectArtifact(item.key)}
          >
            {item.label}
          </button>
        ))}
      </div>
      {activeArtifact === 'doc' ? (
        <>
      {/*
        阶段筛选（默认「全部」= 原行为）。用途：立项阶段只需要 7 章，
        24 章全铺开是劝退主因（库内文档填写率 1%–13%，见
        docs/ceshu-field-necessity.md）。这里只做筛选，不隐藏数据。
      */}
      <div className="chapter-stage-filter" role="group" aria-label="按阶段筛选章节">
        <button
          type="button"
          data-testid="stage-filter-all"
          className={`chapter-stage-btn${stageFilter === 'all' ? ' active' : ''}`}
          onClick={() => onStageFilterChange('all')}
        >
          全部
        </button>
        {CESHU_STAGE_ORDER.map((stage) => (
          <button
            key={stage}
            type="button"
            data-testid={`stage-filter-${stage}`}
            className={`chapter-stage-btn${stageFilter === stage ? ' active' : ''}`}
            title={`只看「${CESHU_STAGE_LABELS[stage]}」阶段及更早的章节`}
            onClick={() => onStageFilterChange(stage)}
          >
            {CESHU_STAGE_LABELS[stage]}
          </button>
        ))}
      </div>
      <button
        type="button"
        data-testid="module-picker-toggle"
        className="chapter-stage-btn module-picker-toggle"
        title="勾选要做的系统模块（通用底座恒有）"
        onClick={onOpenModulePicker}
      >
        系统模块 {enabledModuleCount}/{MODULE_CHAPTERS.length}
      </button>
      {/* 系统模块勾选气泡（Slice 15）：原位置挂载，定位不变 */}
      <ViewMount host={host} mount={CESHU_CHAPTERNAV_MOUNT} context={viewContext} />
      <button
        type="button"
        data-testid="view-mode-toggle"
        className={`chapter-stage-btn overview-toggle${viewMode === 'overview' ? ' active' : ''}`}
        title="把当前阶段压成一页只读摘要（2026 主流：一页讲清 → 分层展开）"
        onClick={onToggleViewMode}
      >
        {viewMode === 'overview' ? '返回编辑' : '一页总览'}
      </button>
      {chapters.map((key) => {
        const pct = Math.round((progress[key] ?? 0) * 100)
        // 完成度三色阈值与 旧版 `chapter_panel::set_progress` 一致（<50 / 50-79 / >=80）
        const level = pct >= 80 ? 'hi' : pct >= 50 ? 'mid' : 'low'
        return (
          <button
            key={key}
            type="button"
            data-testid="chapter-tab"
            className={`chapter-tab${key === activeChapter ? ' active' : ''}`}
            onClick={() => onSelectChapter(key)}
          >
            <span className="chapter-tab-label">{CHAPTER_LABELS[key]}</span>
            {/*
              「待核对」圆点：AI 刚生成、人还没看过。点了「保存本章」即消失。
              视觉上不用文字 —— 章节导航里多出的两个字会比圆点更吵。
            */}
            {aiMarks[key] !== undefined && (
              <span className="chapter-tab-ai" title="AI 生成，待核对" data-testid={`chapter-ai-${key}`} />
            )}
            <span
              className="chapter-progress"
              title={`完成度 ${pct}%`}
              role="progressbar"
              aria-valuenow={pct}
              aria-valuemin={0}
              aria-valuemax={100}
            >
              <span className={`chapter-progress-fill ${level}`} style={{ width: `${pct}%` }} />
              {/* 视觉隐藏但保留在文本里：E2E `ceshu.spec.ts:63` 断言 toContainText('50%') */}
              <span className="sr-only">{pct}%</span>
            </span>
          </button>
        )
      })}
      {scope === 'lite' && (
        <div className="chapter-nav-hint">
          标准版仅含基础 {contentChapterCount('lite')} 章；在「文档信息」中可切换为专业版{' '}
          {contentChapterCount('full')} 章
        </div>
      )}
        </>
      ) : (
        <div className="chapter-nav-hint" data-testid="artifact-nav-hint">
          「{ARTIFACTS.find((item) => item.key === activeArtifact)?.label}」的目录将在这里
        </div>
      )}
    </div>
  )
}
