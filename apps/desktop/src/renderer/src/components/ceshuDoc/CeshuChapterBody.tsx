import type { CeshuDocument, ChapterData } from '@mobai/shared/ceshu/reference'
import { chapterDataForDoc } from '@mobai/shared/ceshu/model'
import type { CeshuStage } from '@mobai/shared/ceshu/workflow'
import type { FieldAction } from '@mobai/shared/ceshu/fields'
import type { ChapterFieldStatus, FieldReviewStatus } from '@mobai/shared/ceshu/fields'
import type { CeshuAiGenerateResult } from '@mobai/shared/ceshu/prompts'
import type { PluginHost } from '@mobai/shared/plugin/host'

import { ChapterForm } from '../ceshuField'
import CeshuOverview from './CeshuOverview'
import { ViewMount } from '../../plugins/host'
import { CESHU_ARTIFACT_MOUNT, CeshuViewProvider, type CeshuViewContextValue } from '../../plugins/ceshu'
import type { ArtifactKey } from './ceshuArtifacts'

/**
 * 中间工作区：按「产出物 / 一页总览 / 章节表单」三态渲染本章内容。
 *
 * 纯展示件：保存、AI 生成、字段状态等动作都由 `CeshuView` 提供。
 * 返回的**就是** `<div className="chapter-body">` 本身——不额外包一层容器，
 * 保证 DOM 结构与拆分前逐字一致。
 */
interface CeshuChapterBodyProps {
  activeArtifact: ArtifactKey
  viewMode: 'edit' | 'overview'
  doc: CeshuDocument
  stageFilter: CeshuStage | 'all'
  progress: Record<string, number>
  activeChapter: string
  busy: boolean
  gameName: string
  /** 「跳到某章的某个字段」目标（校验 / 完备度 / 审阅队列发起） */
  fieldJump: { chapter: string; field: string } | null
  /** 聚焦已消费：清掉目标，否则同字段第二次点击不会再触发 */
  onFocusConsumed: () => void
  /** 保存本章（含字段状态结算） */
  onSave: (
    chapter: string,
    data: ChapterData,
    statusUpdates?: Record<string, FieldReviewStatus>
  ) => Promise<void>
  onFieldStatus: (chapter: string, updates: Record<string, FieldReviewStatus>) => Promise<void>
  fieldStatus: ChapterFieldStatus
  onAiGenerate: (chapter: string, onlyEmpty: boolean) => Promise<CeshuAiGenerateResult>
  onAiGenerateField: (
    chapter: string,
    field: string,
    action?: FieldAction
  ) => Promise<CeshuAiGenerateResult>
  /** 「改这里会影响什么」：面板在宿主渲染，这里只发信号 */
  onShowImpact: (chapter: string, field: string) => void
  host: PluginHost
  viewContext: CeshuViewContextValue
}

export default function CeshuChapterBody({
  activeArtifact,
  viewMode,
  doc,
  stageFilter,
  progress,
  activeChapter,
  busy,
  gameName,
  fieldJump,
  onFocusConsumed,
  onSave,
  onFieldStatus,
  fieldStatus,
  onAiGenerate,
  onAiGenerateField,
  onShowImpact,
  host,
  viewContext
}: CeshuChapterBodyProps) {
  return (
    <div className="chapter-body">
      {activeArtifact !== 'doc' ? (
        <ViewMount host={host} mount={CESHU_ARTIFACT_MOUNT} provider={CeshuViewProvider} context={viewContext} />
      ) : viewMode === 'overview' ? (
        <CeshuOverview
          doc={doc}
          stage={stageFilter === 'all' ? 'concept' : stageFilter}
          progress={progress}
        />
      ) : (
        <ChapterForm
          key={`${doc.ceshu_id}:${activeChapter}`}
          doc={doc}
          chapter={activeChapter}
          data={chapterDataForDoc(doc, activeChapter)}
          busy={busy}
          gameName={gameName}
          onSave={onSave}
          onAiGenerate={onAiGenerate}
          onAiGenerateField={onAiGenerateField}
          fieldStatus={fieldStatus}
          onFieldStatus={onFieldStatus}
          /* 只在目标章与当前章一致时下发：切章后 ChapterForm 会重挂，目标必须跟着换 */
          focusField={fieldJump?.chapter === activeChapter ? fieldJump.field : undefined}
          onFocusConsumed={onFocusConsumed}
          onShowImpact={onShowImpact}
        />
      )}
    </div>
  )
}
