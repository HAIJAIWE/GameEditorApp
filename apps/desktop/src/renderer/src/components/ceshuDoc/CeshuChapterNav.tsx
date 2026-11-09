import {
  MODULE_CHAPTERS,
  contentChapterCount,
  type CeshuDocument,
  type ChapterKey
} from '@mobai/shared/ceshu/reference'
import { chapterLabelForDoc } from '@mobai/shared/ceshu/model'
import type { AiGeneratedMap } from '@mobai/shared/ceshu/prompts'
import {
  CESHU_STAGE_LABELS,
  CESHU_STAGE_ORDER,
  type CeshuStage
} from '@mobai/shared/ceshu/workflow'
import type { PluginHost } from '@mobai/shared/plugin/host'

import { ViewMount } from '../../plugins/host'
import { CESHU_CHAPTERNAV_MOUNT, CeshuViewProvider, type CeshuViewContextValue } from '../../plugins/ceshu'
import { useT } from '@mobai/client-ui'
import { ARTIFACTS, type ArtifactKey } from './ceshuArtifacts'

/**
 * 左栏：产出物切换 + 阶段筛选 + 系统模块 / 一页总览入口 + 章节大纲（含进度与待核对点）。
 *
 * 纯展示件：筛选、当前章、视图模式都是 `CeshuView` 的 state，本组件只接收值与回调。
 * 返回的**就是** `<div className="chapter-nav">` 本身——不额外包一层容器，
 * 保证 DOM 结构与拆分前逐字一致。
 */
interface CeshuChapterNavProps {
  /** 章标签按 docKind 分派（游戏档 CHAPTER_LABELS、应用档 APP_CHAPTER_LABELS） */
  doc: CeshuDocument
  activeArtifact: ArtifactKey
  /** 切产出物（`'doc'` 关掉产出物视图，其余打开 `${key}.view`） */
  onSelectArtifact: (key: ArtifactKey) => void
  stageFilter: CeshuStage | 'all'
  onStageFilterChange: (stage: CeshuStage | 'all') => void
  /** 已启用的系统模块数（分母取 `MODULE_CHAPTERS.length`） */
  enabledModuleCount: number
  onOpenModulePicker: () => void
  /** 打开模板覆盖层编辑器（改标签 / 顺序 / 模块默认开关） */
  onOpenTemplateOverlay: () => void
  viewMode: 'edit' | 'overview'
  onToggleViewMode: () => void
  /** 阶段筛选后的章节列表（父组件已按阶段 + 当前章过滤）；应用章 key 用 string */
  chapters: readonly string[]
  /**
   * 文档感知的章标签（来自 `specForDoc(doc).chapterLabels`）。
   * 传入后编辑视图的章名会跟随交付模板覆盖层，与导出/交接包一致；
   * 不传则回退 `chapterLabelForDoc`（默认模板），供独立渲染/旧调用零回归。
   * 覆盖层只改标签与顺序；这里跟随**标签**，不改 `chapters` 的顺序（顺序牵动锚点/进度/activeChapter）。
   */
  chapterLabels?: Readonly<Record<string, string>>
  progress: Record<string, number>
  activeChapter: string
  aiMarks: AiGeneratedMap
  /** 点章节：切章并退出「一页总览」 */
  onSelectChapter: (chapter: string) => void
  scope: 'full' | 'lite'
  host: PluginHost
  viewContext: CeshuViewContextValue
}

export default function CeshuChapterNav({
  doc,
  activeArtifact,
  onSelectArtifact,
  stageFilter,
  onStageFilterChange,
  enabledModuleCount,
  onOpenModulePicker,
  onOpenTemplateOverlay,
  viewMode,
  onToggleViewMode,
  chapters,
  chapterLabels,
  progress,
  activeChapter,
  aiMarks,
  onSelectChapter,
  scope,
  host,
  viewContext
}: CeshuChapterNavProps) {
  const t = useT()
  return (
    <div className="chapter-nav">
      {/* 产出物切换：设计文档 / 原型预览 / 数据·机读 / 岗位任务 */}
      <div className="artifact-switch" role="group" aria-label={t('ceshu.artifact.groupLabel')}>
        {ARTIFACTS.map((item) => (
          <button
            key={item.key}
            type="button"
            data-testid={`artifact-${item.key}`}
            className={`artifact-btn${activeArtifact === item.key ? ' active' : ''}`}
            onClick={() => onSelectArtifact(item.key)}
          >
            {t(item.labelKey)}
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
      <div className="chapter-stage-filter" role="group" aria-label={t('chapterNav.stageFilterLabel')}>
        <button
          type="button"
          data-testid="stage-filter-all"
          className={`chapter-stage-btn${stageFilter === 'all' ? ' active' : ''}`}
          onClick={() => onStageFilterChange('all')}
        >
          {t('chapterNav.stageAll')}
        </button>
        {CESHU_STAGE_ORDER.map((stage) => (
          <button
            key={stage}
            type="button"
            data-testid={`stage-filter-${stage}`}
            className={`chapter-stage-btn${stageFilter === stage ? ' active' : ''}`}
            title={t('chapterNav.stageFilterTitle', { stage: CESHU_STAGE_LABELS[stage] })}
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
        title={t('chapterNav.modulePickerTitle')}
        onClick={onOpenModulePicker}
      >
        {t('chapterNav.moduleCount', { enabled: enabledModuleCount, total: MODULE_CHAPTERS.length })}
      </button>
      <button
        type="button"
        data-testid="template-overlay-toggle"
        className="chapter-stage-btn template-overlay-toggle"
        title={t('ceshu.templateOverlay.toggleTitle')}
        onClick={onOpenTemplateOverlay}
      >
        {t('ceshu.templateOverlay.toggle')}
      </button>
      {/* 系统模块勾选气泡（Slice 15）：原位置挂载，定位不变 */}
      <ViewMount host={host} mount={CESHU_CHAPTERNAV_MOUNT} provider={CeshuViewProvider} context={viewContext} />
      <button
        type="button"
        data-testid="view-mode-toggle"
        className={`chapter-stage-btn overview-toggle${viewMode === 'overview' ? ' active' : ''}`}
        title={t('chapterNav.overviewTitle')}
        onClick={onToggleViewMode}
      >
        {viewMode === 'overview' ? t('chapterNav.backToEdit') : t('chapterNav.overview')}
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
            <span className="chapter-tab-label">{chapterLabels?.[key] ?? chapterLabelForDoc(doc, key)}</span>
            {/*
              「待核对」圆点：AI 刚生成、人还没看过。点了「保存本章」即消失。
              视觉上不用文字 —— 章节导航里多出的两个字会比圆点更吵。
            */}
            {aiMarks[key as ChapterKey] !== undefined && (
              <span className="chapter-tab-ai" title={t('chapterNav.aiPendingTitle')} data-testid={`chapter-ai-${key}`} />
            )}
            <span
              className="chapter-progress"
              title={t('chapterNav.progressTitle', { pct })}
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
          {t('chapterNav.liteHint', { lite: contentChapterCount('lite'), full: contentChapterCount('full') })}
        </div>
      )}
        </>
      ) : activeArtifact === 'workboard' ? (
        /*
         * 施工看板（2026-11-09 挂进产出物页签）：它不是"某一份产出物的目录"，
         * 用「目录将在这里」会误导——这里如实说清看板在哪、怎么回去编辑。
         */
        <div className="chapter-nav-hint" data-testid="artifact-nav-hint">
          {t('chapterNav.workboardHint')}
        </div>
      ) : (
        <div className="chapter-nav-hint" data-testid="artifact-nav-hint">
          {t('chapterNav.artifactDirHint', {
            name: (() => {
              const active = ARTIFACTS.find((item) => item.key === activeArtifact)
              return active === undefined ? '' : t(active.labelKey)
            })()
          })}
        </div>
      )}
    </div>
  )
}
