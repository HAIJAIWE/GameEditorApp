import { useCallback, useEffect, useState, useSyncExternalStore } from 'react'

import { useT } from '@mobai/client-ui'
import {
  CESHU_FORMAT_LABELS,
  CHAPTER_LABELS,
  MODULE_CHAPTERS,
  enabledModuleChapters,
  type CeshuDocument,
  type CeshuExportFormat,
  type ChapterData,
  type ChapterKey
} from '@mobai/shared/ceshu/reference'
import {
  chapterFieldsForDoc,
  chapterLabelForDoc,
  computeChapterProgress,
  computeEnabledEditors,
  contentChapterCountsForDoc,
  formatLocalTimestamp,
  getDocKind,
  getGddScope,
  resolveDocGameStyle,
  visibleChaptersForDoc
} from '@mobai/shared/ceshu/model'
import type { CeshuChangelog } from '@mobai/shared/ceshu/workflow'
import {
  isChapterVisibleInStage,
  type CeshuStage
} from '@mobai/shared/ceshu/workflow'
import {
  buildChangelogHtml,
  buildChangelogMarkdown,
  buildChangelogText,
  buildValidationReportMarkdown
} from '@mobai/shared/domain/ceshu/ceshuReports'
import { buildReadinessReportMarkdown, type CeshuReadinessReport } from '@mobai/shared/ceshu/readiness'
import { clearAiGenerated, markAiGenerated, readAiGenerated } from '@mobai/shared/ceshu/prompts'
import { fieldStatusOf, setFieldStatuses, type FieldReviewStatus } from '@mobai/shared/ceshu/fields'
import type { FieldAction } from '@mobai/shared/ceshu/fields'
import { clearFieldRequest } from '../../ceshuFieldFocus'
import { applyCeshuPatch, type CeshuPatchItem } from '@mobai/shared/ceshu/data'
import type { CeshuAiGenerateResult } from '@mobai/shared/ceshu/prompts'
import type { PluginHost } from '@mobai/shared/plugin/host'
import type { DataTypeDef } from '@mobai/shared/types'

import { CeshuDataPreview, type PreviewJumpTarget } from '../ceshu'
import CeshuAgentPanel from './CeshuAgentPanel'
import { collectPendingReviewFields } from '../ceshu'
import { ViewMount } from '../../plugins/host'
import { CeshuViewProvider, setCeshuEditorBridge } from '../../plugins/ceshu'
import {
  CESHU_ARTIFACT_MOUNT,
  CESHU_CONTENT_MOUNT,
  CESHU_TOOLBAR_MOUNT,
  CESHU_VIEW_MOUNT,
  type CeshuViewContextValue
} from '../../plugins/ceshu'
import { toErrorMessage } from '../ceshuViewUtils'
import CeshuToolbar from './CeshuToolbar'
import CeshuChapterNav from './CeshuChapterNav'
import CeshuChapterBody from './CeshuChapterBody'
import type { ArtifactKey } from './ceshuArtifacts'

/** 数据栏展开状态的 localStorage 键（`'0'` = 收起，其它/缺失 = 展开） */
const PREVIEW_OPEN_KEY = 'mb.ceshu.previewOpen'

interface CeshuViewProps {
  ceshuId: string | null
  onChanged: () => void
  /** 切换当前策划书（派生新版本后自动切到新版本） */
  onSelect: (id: string) => void
  /**
   * 打开策划书时回填活跃术语风格（对应 旧版 `ceshu_controller.open_ceshu`：
   * 由 meta 推断风格后 `set_active_style`；本版优先采用用户显式选过的 `doc.style`）。
   */
  onGameStyleChange?: (styleId: string) => void
  /** 全部数据类型定义（内嵌数据编辑器标签页渲染条目表单用） */
  types: readonly DataTypeDef[]
  /** 活跃术语风格 id（透传给内嵌数据编辑器的字段标签术语替换） */
  gameStyle?: string
  /** 返回策划书首页 */
  onBack: () => void
  /** 跳转定位目标（透传给内嵌数据预览面板，命中启用编辑器时定位到对应条目） */
  jumpTarget?: PreviewJumpTarget | null
  /** 跳转已处理（透传；宿主据此清空 jumpTarget） */
  onJumpHandled?: () => void
  /** 跳转未命中（透传；宿主据此提示目标类型未被启用系统覆盖） */
  onJumpMissed?: (name: string) => void
  /** 数据纪元（App 在「清空所有数据」成功后递增）：并入内嵌数据编辑器的 key 强制重挂载刷新 */
  dataEpoch?: number
  /** 打开「字段结构编辑器」编辑指定类型（由条目表单的「更多 ▸」触发，宿主负责开面板） */
  onEditType?: (typeId: string) => void
  /** 类型 schema 被改动（数据表补齐会新建类型/字段）：宿主刷新类型列表 */
  onTypesChanged?: (types: DataTypeDef[]) => void
  /** 打开「数据关联预览」查看某条目引用关系（由条目表单的「更多 ▸」触发，宿主负责开面板） */
  onShowReferences?: (target: { type: string; id: string; name: string }) => void
  /**
   * 插件宿主（Slice 11）：编辑器内视图（开发路线 / 体检 / 影响面）改由 `view` 能力供给。
   * 本组件用它在挂载点 `ceshu.overlay` 上 `openView` 并渲染 `<ViewMount>`。
   * 由 App 传入（与 `HostPanel` 同一路数，避免组件直接耦合 `builtins` 单例）。
   */
  host: PluginHost
}

/** 策划书编辑器：章节导航（含进度）+ 章节表单 + 版本链操作 */
export default function CeshuView({
  ceshuId,
  onChanged,
  onSelect,
  onGameStyleChange,
  types,
  gameStyle,
  onBack,
  jumpTarget,
  dataEpoch = 0,
  onJumpHandled,
  onJumpMissed,
  onEditType,
  onTypesChanged,
  onShowReferences,
  host
}: CeshuViewProps) {
  const t = useT()
  const [doc, setDoc] = useState<CeshuDocument | null>(null)
  const [activeChapter, setActiveChapter] = useState<string>('meta')
  /**
   * 阶段筛选（2026-10-26，反向验证后的入口分层）：
   * **默认 'concept'（立项 7 章）**——24 章全平铺会把策划书变成 checklist（「不像设计文档」）。
   * 要扩展再切「研发 / 发行 / 全部」；发行阶段的章不会真丢：校验跳转、评审队列会把
   * activeChapter 带过去，而当前章永远参与渲染，避免「筛掉自己」导致右侧面板空白。
   */
  const [stageFilter, setStageFilter] = useState<CeshuStage | 'all'>('concept')
  /** 一页总览（2026 对齐）：把当前阶段压成一页只读摘要；默认仍是逐章编辑 */
  const [viewMode, setViewMode] = useState<'edit' | 'overview'>('edit')
  /* 左栏产出物页签（Slice 17）：'doc'=章节表单本体（内联）；原型/数据/任务 → ceshu.artifact 挂载点上的视图。 */
  /*
   * 编辑器内视图（Slice 11–14）全部迁到插件 `view` 能力，挂在两个挂载点上由 `<ViewMount>` 渲染：
   * - `ceshu.overlay`：浮层（路线/体检/影响面/迁移/消费提示词/审阅队列/导入）；
   * - `ceshu.content`：内容面板（版本对比/时间线/报告/AI/预设…）。
   * 打开走 `openEditorView`（见下），本组件不再持这些浮层的 state 与内联 JSX。
   * 审阅队列的光标/折叠、导入的原文/解析结果等本地 UI state 都在 EditorOverlays 组件内部。
   */
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [exportFormat, setExportFormat] = useState<CeshuExportFormat>('markdown')
  /* 派生新版本 / 系统模块勾选（Slice 15）：已抽成 EditorOverlays 组件，经内联挂载点渲染。 */
  /*
   * 内容型面板（Slice 12/13）：原来的 `panel` 状态 + 三元链已全部迁到插件 `view` 能力，
   * 挂在内容槽 `ceshu.content` 上由 `<ViewMount>` 渲染（打开走 `openEditorView`，见下）。
   */
  const [changelog, setChangelog] = useState<CeshuChangelog | null>(null)
  const [validateErrors, setValidateErrors] = useState<string[]>([])
  const [readiness, setReadiness] = useState<CeshuReadinessReport | null>(null)
  /**
   * 「跳到某章的某个字段」目标（校验面板的必填缺失 / 完备度面板的逐章缺口 / 审阅队列的「查看」）。
   * 与数据栏的 `jumpTarget`（跳到引用）无关：那个跳数据、这个跳表单字段。
   * 消费方是 `ChapterForm` 的 `focusField`：滚过去 + 高亮，然后回调清空（见其注释）。
   */
  const [fieldJump, setFieldJump] = useState<{ chapter: string; field: string } | null>(null)
  /**
   * 数据栏是否展开（左栏 + 中间 = 工作区，右栏 = 智能体）。
   *
   * **默认收起**：本项目的实际工作流是「AI 生成 → 人扫一遍」，审阅时数据栏通常是空的，
   * 却把正文挤到每行十来个字（实测开栏时表单 345px、收起后 820px）。
   * 需要对照数据时一键展开；状态存 localStorage，记住用户的姿势。
   */
  const [previewOpen, setPreviewOpen] = useState<boolean>(() => {
    try {
      return localStorage.getItem(PREVIEW_OPEN_KEY) === '1'
    } catch {
      return false // 隐私模式/存储被禁：按默认（收起）
    }
  })

  const togglePreview = (): void => {
    setPreviewOpen((open) => {
      const next = !open
      try {
        localStorage.setItem(PREVIEW_OPEN_KEY, next ? '1' : '0')
      } catch {
        // 存储不可用不影响本次会话内的开关
      }
      return next
    })
  }
  /* AI 数据生成的「预选类型 / 数量 / 要求」不再存本组件 state：改为 openView 的打开参数。 */

  useEffect(() => {
    if (!ceshuId) return
    let cancelled = false
    window.mbApi.ceshu
      .get({ id: ceshuId })
      .then((loaded) => {
        if (cancelled) return
        setDoc(loaded)
        setActiveChapter('meta')
        setError(null)
        host.closeView(CESHU_CONTENT_MOUNT)
        host.closeView(CESHU_TOOLBAR_MOUNT)
        // 对齐 旧版 `ceshu_controller:66-71`：打开策划书时，若**尚未确认过系统**且
        // 已有启用系统，则自动弹出「确认游戏系统」对话框。
        // 注意在 promise 回调里 setState —— react-hooks v7 禁止 effect 体内同步 setState。
        const alreadyConfirmed = loaded.meta?.system_confirmed === true
        if (!alreadyConfirmed && computeEnabledEditors(loaded).length > 0) {
          try {
            host.openView('systemConfirm.view')
          } catch {
            /* 视图插件未启用：不自动弹，静默 */
          }
        }
        // 打开策划书 → 回填活跃术语风格
        onGameStyleChange?.(resolveDocGameStyle(loaded))
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [ceshuId, onGameStyleChange, host])

  /** AI 生成本章：走 IPC 调本地模型（ollama），返回清洗后的字段供表单填入草稿 */
  const handleAiGenerate = useCallback(
    async (chapter: string, onlyEmpty: boolean): Promise<CeshuAiGenerateResult> => {
      if (!ceshuId) throw new Error(t('ceshuView.noDocSelected'))
      return window.mbApi.ceshu.aiGenerateChapter({ id: ceshuId, chapter, onlyEmpty })
    },
    [ceshuId, t]
  )

  /** AI 生成单个字段（E62）：走 IPC 调本地模型，返回清洗后的字段供表单回填。
   *  `action` 为局部重生成动作（停靠栏快捷操作），透传给主进程注入提示词 */
  const handleAiGenerateField = useCallback(
    async (chapter: string, field: string, action?: FieldAction): Promise<CeshuAiGenerateResult> => {
      if (!ceshuId) throw new Error(t('ceshuView.noDocSelected'))
      return window.mbApi.ceshu.aiGenerateField({ id: ceshuId, chapter, field, action })
    },
    [ceshuId, t]
  )

  /** 保存章节：同时清除该章的「待核对」标记（人已经动过这一章了） */
  const handleSave = useCallback(
    async (
      chapter: string,
      data: ChapterData,
      statusUpdates?: Record<string, FieldReviewStatus>
    ): Promise<void> => {
      if (!ceshuId) return
      setBusy(true)
      try {
        const updated = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter, data })
        setDoc(updated)
        setNotice(t('ceshuView.savedChapter', { chapter: chapterLabelForDoc(updated, chapter) }))
        setError(null)
        /*
         * 一次 meta 写盘同时完成两件事：
         * 1) 清掉「按章待核对」点（人工保存过 = 核对过了）；
         * 2) 结算「字段级状态」（AI 草稿未改→已批准、人改过→human_edited）。
         * 任一没变化就不写盘（clearAiGenerated 无标记时返回原对象）。
         */
        let nextMeta = clearAiGenerated(updated.meta, chapter)
        if (statusUpdates !== undefined && Object.keys(statusUpdates).length > 0) {
          nextMeta = setFieldStatuses(nextMeta, chapter, statusUpdates, new Date().toISOString())
        }
        if (nextMeta !== updated.meta) {
          setDoc(await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter: 'meta', data: nextMeta }))
        }
        onChanged()
      } catch (err) {
        setError(toErrorMessage(err))
      } finally {
        setBusy(false)
      }
    },
    [ceshuId, onChanged, t]
  )

  /** 字段级状态写入（「接受」/ AI 草稿标记）：单独走一次 meta 保存 */
  const handleFieldStatus = useCallback(
    async (chapter: string, updates: Record<string, FieldReviewStatus>): Promise<void> => {
      if (!ceshuId || doc === null) return
      const nextMeta = setFieldStatuses(doc.meta, chapter, updates, new Date().toISOString())
      if (nextMeta === doc.meta) return
      setDoc(await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter: 'meta', data: nextMeta }))
    },
    [ceshuId, doc]
  )

  /** 勾选/取消系统模块：写进 meta.enabled_modules（随「文档信息」保存） */
  const handleToggleModule = useCallback(
    async (module: ChapterKey, enabled: boolean): Promise<void> => {
      if (doc === null) return
      const current = new Set(enabledModuleChapters(doc))
      if (enabled) current.add(module)
      else current.delete(module)
      const nextModules = MODULE_CHAPTERS.filter((item) => current.has(item))
      await handleSave('meta', { ...doc.meta, enabled_modules: nextModules })
    },
    [doc, handleSave]
  )

  /** 批量设置启用模块（分组开关 / 预设）：一次写盘，避免逐章 onToggle 读脏 doc.meta 互相覆盖 */
  const handleSetModules = useCallback(
    async (chapters: ChapterKey[]): Promise<void> => {
      if (doc === null) return
      const wanted = new Set(chapters)
      const nextModules = MODULE_CHAPTERS.filter((item) => wanted.has(item))
      await handleSave('meta', { ...doc.meta, enabled_modules: nextModules })
    },
    [doc, handleSave]
  )

  /* 审阅队列快捷键（j/k/a/v/Esc）已随浮层迁到 EditorOverlays 的 ReviewQueueOverlay 内。 */

  /*
   * 切章兜底：停靠栏可能刚发起针对旧章字段的局部重生成请求，而新章的表单不会消费它
   * （请求按 chapter 匹配）。这里直接丢弃，避免请求烂在桥里、下次聚焦同章字段时被误执行。
   */
  useEffect(() => {
    clearFieldRequest()
  }, [activeChapter])

  /**
   * 内容槽视图（Slice 12）：版本对比 / 时间线激活时**替换** `.content`（不是叠浮层）。
   * 订阅宿主判断「当前是否有内容视图」，有则渲染 ViewMount、无则渲染默认内容。
   */
  const subscribeHost = useCallback((onChange: () => void) => host.subscribe(onChange), [host])
  const contentViewId = useSyncExternalStore(
    subscribeHost,
    () => host.activeView(CESHU_CONTENT_MOUNT)?.id ?? null
  )
  /**
   * 产出物页签（Slice 17）：'doc' 无对应视图（章节表单本体），其余 3 个是 `ceshu.artifact` 上的视图。
   * 页签高亮与内容都从「当前激活的产出物视图」派生，不再单独持 state（避免双源不同步）。
   */
  const artifactViewId = useSyncExternalStore(
    subscribeHost,
    () => host.activeView(CESHU_ARTIFACT_MOUNT)?.id ?? null
  )
  const activeArtifact: ArtifactKey =
    artifactViewId === null ? 'doc' : (artifactViewId.slice(0, -'.view'.length) as ArtifactKey)

  /**
   * 卸载时关闭编辑器内视图（Slice 11/12）：视图状态存在宿主里，不会随组件卸载自动清。
   * 不关的话「开视图 → 返回首页 → 再进编辑器」会看到它又冒出来。
   * `host` 是 App 传入的稳定单例，故此清理只在真正卸载时触发。
   */
  useEffect(() => () => {
    host.closeView(CESHU_VIEW_MOUNT)
    host.closeView(CESHU_CONTENT_MOUNT)
    setCeshuEditorBridge(null)
  }, [host])

  if (!ceshuId) {
    return (
      <div className="ceshu-view">
        <div className="empty">{t('ceshuView.pickDoc')}</div>
      </div>
    )
  }

  // 切换策划书时旧文档仍在 state 中，id 不匹配则视为加载中
  if (!doc || doc.ceshu_id !== ceshuId) {
    /*
     * 加载失败必须**在这里**给出口：`error` 的横幅渲染在下方主界面里，而主界面
     * 要求 `doc` 已就位 —— 于是 `get` 抛错时旧实现会永久停在「正在加载策划书…」，
     * 用户既看不到原因也点不到返回（W2 组件测试发现的实际缺陷）。
     * 只在 `doc` 为空时展示错误：`doc` 存在但 id 不匹配是「切换文档」的瞬态，
     * 此时残留的旧错误会误导用户。
     */
    if (doc === null && error !== null) {
      return (
        <div className="ceshu-view">
          <div className="error-banner" data-testid="ceshu-load-error">
            {error}
          </div>
          <button type="button" className="btn" data-testid="ceshu-load-error-back" onClick={onBack}>
            {t('common.back')}
          </button>
        </div>
      )
    }
    return (
      <div className="ceshu-view">
        <div className="empty">{t('ceshuView.loading')}</div>
      </div>
    )
  }

  /**
   * 打开编辑器内视图（Slice 11/12/13）：走宿主的 `view` 能力。
   * 浮层挂 `ceshu.overlay`、内容面板挂 `ceshu.content`，由 capability 的 `mount` 决定。
   * 视图插件被禁用时 `openView` 会抛错——这里吞掉并静默（入口不该崩；可在插件中心重新启用）。
   * 放在文档守卫之后（各 handler 都要用它），且是普通函数（只在事件里执行）。
   */
  const openEditorView = (id: string, params?: unknown): void => {
    try {
      host.openView(id, params)
    } catch {
      /* 视图插件未启用：静默，不打断编辑器 */
    }
  }

  /** 切产出物：`'doc'` 无对应视图（章节表单本体），关掉产出物视图即可；其余打开 `${key}.view` */
  const handleSelectArtifact = (key: ArtifactKey): void => {
    if (key === 'doc') host.closeView(CESHU_ARTIFACT_MOUNT)
    else openEditorView(`${key}.view`)
  }

  /** 点章节：切章并退出「一页总览」（总览是只读摘要，切章意味着要继续编辑） */
  const handleSelectChapter = (chapter: string): void => {
    setActiveChapter(chapter)
    setViewMode('edit')
  }

  /** 「AI 生成、待核对」的章节集合 —— 章节列表据此画小圆点 */
  const aiMarks = readAiGenerated(doc.meta)
  const scope = getGddScope(doc)
  const visible = visibleChaptersForDoc(doc)
  /**
   * 阶段筛选后的章节列表：`all` 为原行为；选了阶段则只留「截至该阶段」的章，
   * 但**始终保留当前章**——否则从校验报告/评审队列跳过来时右侧会空白。
   */
  const visibleByStage =
    stageFilter === 'all' || getDocKind(doc) !== 'game'
      ? visible
      : visible.filter((key) => isChapterVisibleInStage(key as ChapterKey, stageFilter) || key === activeChapter)
  /**
   * 全局待审字段（跨章）：AI 草稿、尚未接受。
   * 按 `visible` 章节顺序 + 字段定义顺序排列，便于「一条队列」往下扫。
   */
  const pendingReviewFields = collectPendingReviewFields(doc)
  /** 一键接受所有待审字段：按章合并后一次 meta 写盘（审阅队列浮层的「全部接受」经上下文调用） */
  const handleApproveAllPending = async (): Promise<void> => {
    if (!ceshuId || pendingReviewFields.length === 0) return
    const now = new Date().toISOString()
    let meta = doc.meta
    for (const chapter of visible) {
      const statuses = fieldStatusOf(doc.meta, chapter)
      const updates: Record<string, FieldReviewStatus> = {}
      for (const field of chapterFieldsForDoc(doc, chapter)) {
        if (statuses[field.key]?.status === 'ai_draft') updates[field.key] = 'approved'
      }
      if (Object.keys(updates).length > 0) {
        meta = setFieldStatuses(meta, chapter, updates, now)
      }
    }
    if (meta !== doc.meta) {
      setDoc(await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter: 'meta', data: meta }))
    }
  }

  const progress = computeChapterProgress(doc, stageFilter === 'all' ? undefined : stageFilter)
  /** 由第四章游戏系统派生的启用编辑器（内嵌数据预览面板据此渲染标签页） */
  const enabledEditors = computeEnabledEditors(doc)
  const gameName = typeof doc.meta.game_name === 'string' && doc.meta.game_name ? doc.meta.game_name : t('ceshuView.untitled')
  const gameType = typeof doc.meta.game_type === 'string' && doc.meta.game_type ? doc.meta.game_type : t('ceshuView.unknownType')

  /**
   * 标准「忙碌动作」模板：清错 → 置忙 → 执行 → 失败转中文错误 → 解忙。
   *
   * 本组件 12 处 `try/catch` 动作**并非逐字同构**，实测 5 种形态，只有 S1 用本函数：
   * - **S1**：`derive` / `setActive` / `showChangelog` / `validate` / `score`
   * - **S2** 保留显式：`save` / `autoFill` —— `busy` 在 try 外，**成功时**才 `setError(null)`
   * - **S3** 保留显式：三个导出报告 —— 不占 `busy`，套进来会凭空让按钮变灰
   * - **S4** 保留显式：`handleExport` —— 选完文件才置忙，不在系统对话框期间灰界面
   * - **S5** 保留显式：两个 AI 单发生成 —— 不捕获，直接 throw 给表单
   *
   * 收益不在行数（本函数含注释是净增），而在 **`finally` 不会再被漏写** ——
   * 漏写的后果是按钮永久变灰且无任何提示。故 S2–S5 刻意保持显式，别「顺手」并进来。
   */
  const runBusy = async (
    action: () => Promise<void>,
    options: { clearNotice?: boolean } = {}
  ): Promise<void> => {
    setError(null)
    if (options.clearNotice === true) setNotice(null)
    setBusy(true)
    try {
      await action()
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 导出当前策划书：选择保存路径 → 主进程按格式渲染并原子写盘 */
  const handleExport = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseCeshuExportFile({ format: exportFormat, defaultName: gameName })
      if (!chosen.path) return
      setBusy(true)
      const result = await window.mbApi.ceshu.export({ id: doc.ceshu_id, format: exportFormat, path: chosen.path })
      if (result.files !== undefined && result.files.length > 1) {
        // 双轨：一次导出多份产物，逐条列出路径
        setNotice(
          t('ceshuView.exportedFiles', {
            n: result.files.length,
            paths: result.files.map((file) => file.path).join(' + ')
          })
        )
      } else {
        setNotice(t('ceshuView.exported', { format: CESHU_FORMAT_LABELS[result.format], path: result.filePath }))
      }
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 导出项目文件夹：config.json + design/*.md + tasks/*.md（一个可交付的项目目录） */
  const handleExportProject = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseExportDir()
      if (chosen.path === null) return
      setBusy(true)
      const result = await window.mbApi.ceshu.exportProjectFolder({ id: doc.ceshu_id, path: chosen.path })
      setNotice(t('ceshuView.exportedProject', { dir: result.dir, n: result.files.length }))
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /**
   * 导出**开发交接包**：分卷施工图（架构→玩法→内容→系统→界面→打磨）+ 机读包 + 契约
   * + 数据表 schema/快照 + 原型。与「项目文件夹」的区别：那份是**给人看的项目资料**，
   * 这份是**给编码智能体按卷施工**的规格（每卷有门禁与验收）。
   */
  const handleExportHandoff = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseExportDir()
      if (chosen.path === null) return
      setBusy(true)
      const result = await window.mbApi.ceshu.exportHandoff({ id: doc.ceshu_id, path: chosen.path })
      setNotice(
        t('ceshuView.exportedHandoff', { dir: result.dir, n: result.files.length })
      )
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 派生新版本：复制当前版本内容，版本号自动递增，默认未激活（派生弹层经上下文调用） */
  const onDerive = async (note: string): Promise<void> => {
    await runBusy(
      async () => {
        const created = await window.mbApi.ceshu.derive({ id: doc.ceshu_id, note })
        host.closeView(CESHU_TOOLBAR_MOUNT)
        setNotice(t('ceshuView.derived', { version: created.version_label }))
        onChanged()
        onSelect(created.ceshu_id)
      },
      { clearNotice: true }
    )
  }

  /** 将当前文档设为激活版本（同链其他版本自动取消激活） */
  const handleSetActive = async (): Promise<void> => {
    await runBusy(
      async () => {
        const updated = await window.mbApi.ceshu.setActive({ id: doc.ceshu_id })
        setDoc(updated)
        setNotice(t('ceshuView.activated', { version: updated.version_label }))
        onChanged()
      },
      { clearNotice: true }
    )
  }

  /** 查看版本链变更记录（同链版本按时间逐对 diff） */
  const handleShowChangelog = async (): Promise<void> => {
    await runBusy(async () => {
      const log = await window.mbApi.ceshu.changelog({ id: doc.ceshu_id })
      setChangelog(log)
      openEditorView('changelog.view')
    })
  }

  /** 数据校验：必填字段 + 章节间一致性检查 */
  const handleValidate = async (): Promise<void> => {
    await runBusy(async () => {
      const errors = await window.mbApi.ceshu.validate({ id: doc.ceshu_id })
      setValidateErrors(errors)
      openEditorView('validate.view')
    })
  }

  /** 完备度：各阶段必填覆盖 + 逐章缺口 + 有出处的参照对比（替代旧的 100 分制评分） */
  const handleReadiness = async (): Promise<void> => {
    await runBusy(async () => {
      const report = await window.mbApi.ceshu.readiness({ id: doc.ceshu_id })
      setReadiness(report)
      openEditorView('readiness.view')
    })
  }

  /**
   * 跳到某章的某个字段：切章 + 交给 `ChapterForm` 滚过去高亮，并关掉当前报告面板。
   *
   * 三处入口共用（校验面板的必填缺失、完备度面板的逐章缺口、审阅队列的「查看」）——
   * 只跳章等于让人在 32 个字段里再翻一遍，而这三处本来就知道具体是哪个字段。
   */
  const jumpToField = (chapter: string, field: string): void => {
    setActiveChapter(chapter)
    setFieldJump({ chapter, field })
    host.closeView(CESHU_CONTENT_MOUNT)
  }

  /** 导出完备度报告：渲染层生成 Markdown → 主进程原子写盘 */
  const handleExportReadiness = async (): Promise<void> => {
    if (!readiness) return
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseCeshuExportFile({
        format: 'markdown',
        defaultName: t('ceshuView.readinessFileName', { name: gameName })
      })
      if (!chosen.path) return
      const markdown = buildReadinessReportMarkdown(gameName, gameType, readiness, formatLocalTimestamp())
      const exported = await window.mbApi.ceshu.exportReadinessReport({ path: chosen.path, content: markdown })
      setNotice(t('ceshuView.readinessExported', { path: exported.filePath }))
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  /** 导出校验报告：渲染层生成 Markdown → 主进程原子写盘 */
  const handleExportValidation = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      // 文件名安全化：保留字母/数字/._-
      const safeName = [...gameName].filter((ch) => /[\p{L}\p{N}._-]/u.test(ch)).join('') || 'ceshu'
      const chosen = await window.mbApi.dialog.chooseReportFile({
        defaultName: t('ceshuView.validationFileName', { name: safeName, version: doc.version_label || 'v1.0' }),
        extension: '.md',
        label: t('ceshuView.fileLabelMarkdown')
      })
      if (!chosen.path) return
      const markdown = buildValidationReportMarkdown(
        gameName,
        doc.version_label || 'v1.0',
        formatLocalTimestamp(),
        validateErrors,
        progress
      )
      const exported = await window.mbApi.ceshu.exportValidationReport({ path: chosen.path, content: markdown })
      setNotice(t('ceshuView.validationExported', { path: exported.filePath }))
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  /** 导出变更日志：MD / HTML / Text 三格式 */
  const handleExportChangelog = async (format: 'md' | 'html' | 'text'): Promise<void> => {
    if (!changelog) return
    try {
      setError(null)
      setNotice(null)
      const spec =
        format === 'html'
          ? { content: buildChangelogHtml(changelog), extension: '.html', label: t('ceshuView.fileLabelHtml') }
          : format === 'text'
            ? { content: buildChangelogText(changelog), extension: '.txt', label: t('ceshuView.fileLabelText') }
            : { content: buildChangelogMarkdown(changelog), extension: '.md', label: t('ceshuView.fileLabelMarkdown') }
      const chosen = await window.mbApi.dialog.chooseReportFile({
        defaultName: 'changelog',
        extension: spec.extension,
        label: spec.label
      })
      if (!chosen.path) return
      const exported = await window.mbApi.ceshu.exportChangelogReport({ path: chosen.path, content: spec.content })
      setNotice(t('ceshuView.changelogExported', { path: exported.filePath }))
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  /** AI 一键生成应用完成：更新当前文档并刷新列表 */
  /**
   * AI 一键生成应用完成：把这几章标成「待核对」，并跳到第一章开始扫读。
   *
   * 标记写进 `meta.ai_generated`（见 `shared/ceshuAiMark.ts`）。人点「保存本章」
   * 或「已核对」即清除该章标记 —— 这正是「AI 生成 → 人扫一遍」工作流的进度。
   */
  const handleAiApplied = async (updated: CeshuDocument, chapters: readonly string[]): Promise<void> => {
    setDoc(updated)
    const names = chapters.map((chapter) => chapterLabelForDoc(updated, chapter)).join(t('ceshuView.listSeparator'))
    setNotice(t('ceshuView.aiApplied', { n: chapters.length, names }))
    onChanged()

    // 标记要落盘：只用组件内 state 的话，重开应用就丢了，那「待核对」就没意义
    if (ceshuId !== null && chapters.length > 0) {
      try {
        const marked = markAiGenerated(updated.meta, chapters, new Date().toISOString())
        const saved = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter: 'meta', data: marked })
        setDoc(saved)
        // 跳到第一处变化：省得用户自己在整份文档里找
        setActiveChapter(chapters[0])
      } catch (err) {
        // 标记失败不该让用户以为生成失败了 —— 内容已经写进去了
        setError(toErrorMessage(err))
      }
    }
  }

  /** 模板编辑器「应用到该章节」完成：更新当前文档并刷新列表（进度可能变化） */
  const handleTemplateApplied = (updated: CeshuDocument, chapter: ChapterKey): void => {
    setDoc(updated)
    setNotice(t('ceshuView.templateApplied', { chapter: CHAPTER_LABELS[chapter] }))
    onChanged()
  }

  /**
   * 补全空白字段：原「完备性清单」面板的「一键修复」入口。
   * 清单/字数/依赖三项旁路报告已移除（见架构评估 W0），但**补全能力保留**，
   * 否则 `ceshu:autoFill` 会变成没有 UI 入口的死通道。
   */
  const handleAutoFill = async (): Promise<void> => {
    if (!ceshuId) return
    setBusy(true)
    try {
      const result = await window.mbApi.ceshu.autoFill({ id: ceshuId })
      setDoc(result.doc)
      setNotice(
        result.filled > 0 ? t('ceshuView.autofillDone', { n: result.filled }) : t('ceshuView.autofillNone')
      )
      if (result.filled > 0) onChanged()
      setError(null)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 执行字段拆分迁移：幂等、非破坏（原文保留），迁完刷新文档。
   *  注意：这是**普通函数**而不是 useCallback —— 它位于 `if (!doc) return` 之后，
   *  在那里调 hook 会违反 Rules of Hooks（与 handleAutoFill 同一处理）。 */
  const handleRunMigration = async (): Promise<void> => {
    if (!ceshuId) return
    setBusy(true)
    try {
      const result = await window.mbApi.ceshu.migrateFieldSplits({ id: ceshuId })
      setDoc(result.doc)
      setError(null)
      if (result.migrated.length > 0) {
        const names = result.migrated
          .map((item) => `${CHAPTER_LABELS[item.chapter]}·${item.fieldKey}`)
          .join(t('ceshuView.listSeparator'))
        setNotice(
          t('ceshuView.migrated', { n: result.migrated.length, names })
        )
        onChanged()
      } else {
        setNotice(t('ceshuView.migratedNone'))
      }
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /**
   * 应用导入补丁（导入浮层调用）：按章写盘（只写有变化的字段），再一次性把涉及字段标为 AI 草稿。
   * 走既有 saveChapter 通道，不新增 IPC——导入与手工保存共用同一条写入路径。返回是否成功。
   */
  const onApplyImport = async (changed: CeshuPatchItem[]): Promise<boolean> => {
    if (!ceshuId || changed.length === 0) return false
    let ok = false
    await runBusy(
      async () => {
        const { doc: next, chapters, applied } = applyCeshuPatch(doc, changed)
        let latest = doc
        for (const chapter of chapters) {
          latest = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter, data: next[chapter] })
        }
        // 导入内容一律视为 AI 草稿待审（与站内 AI 生成同口径）
        const now = new Date().toISOString()
        let meta = latest.meta
        for (const chapter of chapters) {
          const updates: Record<string, FieldReviewStatus> = {}
          for (const item of changed) {
            if (item.chapter === chapter) updates[item.fieldKey] = 'ai_draft'
          }
          if (Object.keys(updates).length > 0) meta = setFieldStatuses(meta, chapter, updates, now)
        }
        if (meta !== latest.meta) {
          latest = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter: 'meta', data: meta })
        }
        setDoc(latest)
        setNotice(t('ceshuView.imported', { n: applied }))
        onChanged()
        ok = true
      },
      { clearNotice: true }
    )
    return ok
  }

  /** 智能体「改文档」应用：按章写盘 + 标记 AI 草稿（与导入补丁同一条写入路径） */
  const handleApplyAgentPatch = async (items: CeshuPatchItem[]): Promise<void> => {
    if (!ceshuId) return
    const changed = items.filter((item) => item.changed)
    if (changed.length === 0) return
    const { doc: next, chapters } = applyCeshuPatch(doc, changed)
    let latest = doc
    for (const chapter of chapters) {
      latest = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter, data: next[chapter] })
    }
    const now = new Date().toISOString()
    let meta = latest.meta
    for (const chapter of chapters) {
      const updates: Record<string, FieldReviewStatus> = {}
      for (const item of changed) {
        if (item.chapter === chapter) updates[item.fieldKey] = 'ai_draft'
      }
      if (Object.keys(updates).length > 0) meta = setFieldStatuses(meta, chapter, updates, now)
    }
    if (meta !== latest.meta) {
      latest = await window.mbApi.ceshu.saveChapter({ id: ceshuId, chapter: 'meta', data: meta })
    }
    setDoc(latest)
    setNotice(t('ceshuView.agentPatched', { n: changed.length }))
    onChanged()
  }

  /** 预设市场应用完成：systems/meta 已在主进程写盘，更新文档并刷新侧边栏 */
  const handlePresetApplied = (updated: CeshuDocument, enabledCount: number, presetLabel: string): void => {
    setDoc(updated)
    setNotice(t('ceshuView.presetApplied', { label: presetLabel, n: enabledCount }))
    onChanged()
  }

  /** 系统确认完成：systems 已写盘 + 数据同步已触发，更新文档并刷新侧边栏 */
  const handleSystemConfirmed = (updated: CeshuDocument, enabledCount: number, addedCustom: number): void => {
    setDoc(updated)
    setNotice(
      addedCustom > 0
        ? t('ceshuView.systemConfirmedCustom', { n: enabledCount, custom: addedCustom })
        : t('ceshuView.systemConfirmed', { n: enabledCount })
    )
    onChanged()
  }

  /*
   * 「更多 ▸」菜单（Slice 16）已迁到 ceshuMenusPlugin：结构与 18 条命令都在插件里，
   * 工具栏由 `<MenuMount mount="ceshu.toolbar">` 渲染。这里只把「非视图类」动作注入桥
   * （补全 / 完备度 / 变更记录 / 导出项目 / 导出交接包），供插件命令调用；卸载时清空（见上方 cleanup）。
   * 注：注入在渲染期执行（handlers 在文档守卫之后定义，无法放进早退之前的 effect）。
   */
  setCeshuEditorBridge({
    autoFill: () => void handleAutoFill(),
    showReadiness: () => void handleReadiness(),
    showChangelog: () => void handleShowChangelog(),
    exportProject: () => void handleExportProject(),
    exportHandoff: () => void handleExportHandoff()
  })

  /**
   * 编辑器下发给内部视图的上下文（Slice 11–13）：文档 + 类型 + 版本切换 + 报告数据 +
   * 应用/导出/跳转动作。每次渲染重建（`doc` 会变）；只在有视图激活时才交给 Provider。
   */
  const viewContext: CeshuViewContextValue = {
    doc,
    types,
    onSelect,
    gameName,
    currentChapter: activeChapter,
    changelog,
    validateErrors,
    readiness,
    busy,
    onRunMigration: handleRunMigration,
    onApproveAllPending: handleApproveAllPending,
    onFieldStatus: handleFieldStatus,
    onApplyImport,
    onDerive,
    onToggleModule: handleToggleModule,
    onSetModules: handleSetModules,
    onDocUpdated: (next) => {
      setDoc(next)
      onChanged()
    },
    onTypesChanged: onTypesChanged ?? (() => undefined),
    onGenerateData: (target) => openEditorView('aiDataGen.view', target),
    onAiApplied: handleAiApplied,
    onTemplateApplied: handleTemplateApplied,
    onPresetApplied: handlePresetApplied,
    onSystemConfirmed: handleSystemConfirmed,
    onExportChangelog: handleExportChangelog,
    onExportValidation: handleExportValidation,
    onExportReadiness: handleExportReadiness,
    onJumpChapter: (chapter: ChapterKey): void => {
      setActiveChapter(chapter)
      host.closeView(CESHU_CONTENT_MOUNT)
    },
    onJumpField: jumpToField
  }

  return (
    <div className="ceshu-view">
      <CeshuToolbar
        gameName={gameName}
        versionLabel={doc.version_label}
        isActive={doc.is_active}
        scope={scope}
        scopeCounts={contentChapterCountsForDoc(doc)}
        totalPct={Math.round((progress.total ?? 0) * 100)}
        busy={busy}
        pendingReviewCount={pendingReviewFields.length}
        previewOpen={previewOpen}
        exportFormat={exportFormat}
        host={host}
        onBack={onBack}
        onSetActive={() => void handleSetActive()}
        onValidate={() => void handleValidate()}
        onOpenReview={() => openEditorView('review.view')}
        onTogglePreview={togglePreview}
        onOpenAiFull={() => openEditorView('aiFull.view')}
        onOpenAiDataGen={() => openEditorView('aiDataGen.view')}
        onExportFormatChange={setExportFormat}
        onExport={() => void handleExport()}
      />

      {/* 派生新版本内联弹层（Slice 15）：原位置挂载，定位不变 */}
      <ViewMount host={host} mount={CESHU_TOOLBAR_MOUNT} provider={CeshuViewProvider} context={viewContext} />

      {error && <div className="error-banner">{error}</div>}
      {notice && <div className="notice-banner">{notice}</div>}

      <div className="content">
        {/*
         * 内容槽（Slice 12/13）：所有内容型面板（版本对比 / 时间线 / 变更记录 / 校验 / 完备度 /
         * 笔记 / 数据引用 / AI 审阅 / AI 全文 / AI 数据生成 / 预设市场 / 系统确认 / 模板编辑器）
         * 激活时**替换**整个内容区（不是叠浮层）；无激活时渲染默认编辑器内容。
         */}
        {contentViewId !== null ? (
          <ViewMount host={host} mount={CESHU_CONTENT_MOUNT} provider={CeshuViewProvider} context={viewContext} />
        ) : (
          <>
            {/*
             * 编辑器内视图挂载点（Slice 11–14）：浮层（路线/体检/影响面/迁移/消费提示词/审阅队列/导入）
             * 不再内联渲染，改为插件 `view` 能力，由 ViewMount 在这里渲染——**CeshuView 保持挂载**。
             */}
            <ViewMount host={host} mount={CESHU_VIEW_MOUNT} provider={CeshuViewProvider} context={viewContext} />
            <div className="ceshu-pane-row">
            <CeshuChapterNav
              doc={doc}
              activeArtifact={activeArtifact}
              onSelectArtifact={handleSelectArtifact}
              stageFilter={stageFilter}
              onStageFilterChange={setStageFilter}
              enabledModuleCount={enabledModuleChapters(doc).length}
              onOpenModulePicker={() => openEditorView('modulePicker.view')}
              viewMode={viewMode}
              onToggleViewMode={() => setViewMode((mode) => (mode === 'overview' ? 'edit' : 'overview'))}
              chapters={visibleByStage}
              progress={progress}
              activeChapter={activeChapter}
              aiMarks={aiMarks}
              onSelectChapter={handleSelectChapter}
              scope={scope}
              host={host}
              viewContext={viewContext}
            />

            <CeshuChapterBody
              activeArtifact={activeArtifact}
              viewMode={viewMode}
              doc={doc}
              stageFilter={stageFilter}
              progress={progress}
              activeChapter={activeChapter}
              busy={busy}
              gameName={gameName}
              fieldJump={fieldJump}
              onFocusConsumed={() => setFieldJump(null)}
              onSave={handleSave}
              onFieldStatus={handleFieldStatus}
              fieldStatus={fieldStatusOf(doc.meta, activeChapter)}
              onAiGenerate={handleAiGenerate}
              onAiGenerateField={handleAiGenerateField}
              onShowImpact={(chapter, field) => openEditorView('fieldImpact.view', { chapter, field })}
              host={host}
              viewContext={viewContext}
            />

            {/*
              数据栏属于**工作区**（左栏 + 中间），不是和右侧智能体并列的第四栏。
              收起时章节表单吃掉整段宽度；`jumpTarget` 有值时必须展开 ——
              否则「跳到引用」这类动作会静默失效（用户点了没反应）。

              ⚠️ 用 `!= null` 而不是 `!== null`：`jumpTarget` 是可选 prop，
              未传时是 `undefined`，而 `undefined !== null` 为真 ⇒ 数据栏会永远展开、
              开关形同虚设（组件测试抓到的）。
            */}
            {previewOpen || jumpTarget != null ? (
              <CeshuDataPreview
                enabledEditors={enabledEditors}
                types={types}
                chapters={doc}
                gameStyle={gameStyle}
                dataEpoch={dataEpoch}
                onGotoSystems={() => setActiveChapter('systems')}
                onDataChanged={onChanged}
                jumpTarget={jumpTarget}
                onEditType={onEditType}
                onShowReferences={onShowReferences}
                onAiGenerate={(typeId) => openEditorView('aiDataGen.view', { typeId })}
                onJumpHandled={onJumpHandled}
                onJumpMissed={onJumpMissed}
              />
            ) : (
              <CeshuAgentPanel doc={doc} onApplyPatch={handleApplyAgentPatch} />
            )}
          </div>
          </>
        )}
      </div>
    </div>
  )
}