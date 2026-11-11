import { useEffect, useMemo, useRef, useState } from 'react'

import { useT } from '@mobai/client-ui'
import type { MessageKey } from '@mobai/shared/i18n'
import {
  CHAPTER_KEYS,
  GDD_SCOPE_FULL,
  GDD_SCOPE_LITE,
  contentChapterCount,
  type CeshuDocument,
  type ChapterData,
  type ChapterKey,
  type GddScope
} from '@mobai/shared/ceshu/reference'
import { CESHU_STAGE_LABELS, chaptersUpToStage, stageOfChapter } from '@mobai/shared/ceshu/workflow'
import type { CeshuStage } from '@mobai/shared/ceshu/workflow'
import {
  FULL_GEN_BUSINESS_MODELS,
  FULL_GEN_GAME_TYPES,
  FULL_GEN_PLATFORMS,
  FULL_GEN_STYLES,
  buildChapterUnitPlan,
  buildFullGeneratePlan,
  mergeChapterDraft,
  withBriefRevision,
  type ChapterUnitTask,
  type FullGeneratePlan,
  type GenerateStage
} from '@mobai/shared/ceshu/prompts'
import { renderGenerationDigest } from '@mobai/shared/ceshu/export/generationDigest'
import { displayFieldValue } from '@mobai/shared/ceshu/fields'
import {
  chapterDataForDoc,
  chapterFieldsForDoc,
  chapterLabelForDoc,
  getDocKind,
  getGddScope,
  isPlainObject,
  visibleChaptersForDoc
} from '@mobai/shared/ceshu/model'
import { countWordsInChapter } from '@mobai/shared/ceshu/validation'
import { evaluateChapterDraft, shouldRegenerateChapter } from '@mobai/shared/agent/runtime'
import type { LlmJudgeVerdict, QualityGateVerdict } from '@mobai/shared/types'
import { toErrorMessage } from '@mobai/shared/util/system'
import { readText } from '@mobai/shared/util/io'
import {
  AI_FULL_DRAFT_VERSION,
  clearAiFullDraft,
  loadAiFullDraft,
  saveAiFullDraft,
  type AiFullDraft
} from './aiFullDraft'
import { countRemainingInStage, locateWizardPosition, planNextStep } from './aiFullWizard'

/**
 * AI 一键生成完整策划书（2026-11-11 改为两阶段）：
 *   1 填信息 → 2 **先看一眼设计概要并人工确认** → 3 逐章生成 → 4 全部应用并保存。
 *
 * 设计概要用表单确定性推导，不额外调模型；确认后的方向文本随每章提示词下发。
 * 生成期间不写进策划书正文（人工确认后才写），但每章完成会存一份**草稿快照**，
 * 窗口意外关闭也不白跑；快照只在用户点「恢复」时回填，点「全部应用并保存」后清除。
 */

type ChapterStatus = 'pending' | 'running' | 'done' | 'failed'

/**
 * 单元并发生成上限（2026-11-10）。
 *
 * 为什么是 2 而不是更高：本机嵌入式模型 / 云端代理的可用并发有限（`shared/util/system/rateLimiter`
 * 给 llm 通道的是 3 QPS + burst 5），压到 3 路以上只会让请求在限流队列里排队，
 * 观感上反而更慢；2 路足以把「章多 + 单元多」的墙钟时间砍掉近一半，且不影响「停止」。
 */
const UNIT_CONCURRENCY = 2

const STATUS_LABELS: Record<ChapterStatus, MessageKey> = {
  pending: 'aiFull.status.pending',
  running: 'aiFull.status.running',
  done: 'aiFull.status.done',
  failed: 'aiFull.status.failed'
}

interface AiFullGeneratePanelProps {
  ceshuId: string
  doc: CeshuDocument
  /**
   * 应用完成。`chapters` 是**实际写入的章节 key 列表**（不只是数量）——
   * 宿主要据此把这几章标成「AI 生成、待核对」，用户才好扫读。
   */
  onApplied: (updated: CeshuDocument, chapters: readonly string[]) => void
  onClose: () => void
}

export default function AiFullGeneratePanel({ ceshuId, doc, onApplied, onClose }: AiFullGeneratePanelProps) {
  const t = useT()
  const [gameName, setGameName] = useState(() => readText(doc.meta.game_name))
  const [gameType, setGameType] = useState(() => {
    const value = readText(doc.meta.game_type)
    return FULL_GEN_GAME_TYPES.includes(value) ? value : 'RPG'
  })
  const [style, setStyle] = useState(() => FULL_GEN_STYLES[0] ?? '')
  const [businessModel, setBusinessModel] = useState('F2P')
  const [references, setReferences] = useState('')
  const [platforms, setPlatforms] = useState<string[]>(['PC'])
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<GddScope>(() => getGddScope(doc))
  /**
   * 生成阶段：默认立项（真实 GDD 从一页 pitch 分阶段长出来，见 docs/game-doc-corpus-2026.md）。
   * 全量仍可选，不删既有能力。应用档不显示此选项（SDD 全章表一次生成）。
   */
  const [stage, setStage] = useState<GenerateStage>('concept')
  const [includeMarket, setIncludeMarket] = useState(true)
  const [includeRisk, setIncludeRisk] = useState(true)
  const [statuses, setStatuses] = useState<Partial<Record<string, ChapterStatus>>>({})
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({})
  const [results, setResults] = useState<Partial<Record<string, ChapterData>>>({})
  /** 每章 LLM-as-Judge 辅助结论（v1.0 DD-19 剩余项）；null = 该章未获评审（调用失败/降级） */
  const [judges, setJudges] = useState<Partial<Record<string, LlmJudgeVerdict | null>>>({})
  /** 每章**确定性质量门主结论**（生成前后校验对比）；此前只落在返回值里、UI 从未使用 */
  const [verdicts, setVerdicts] = useState<Partial<Record<string, QualityGateVerdict | null>>>({})
  const [running, setRunning] = useState(false)
  const [applying, setApplying] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)
  /** 整篇生成的累计 token 花费（v0.6 M5：成本护栏的观测数据） */
  const [usageTotal, setUsageTotal] = useState(0)
  /** 第 2 步「确认设计概要」：大范围调用前先让人看一眼方向，确认后才生成（v0.5 DD-17 升级） */
  const [confirming, setConfirming] = useState(false)
  /** 用户看概要时补的方向修订 / 硬约束，随每章提示词下发 */
  const [briefNote, setBriefNote] = useState('')
  /** 方向是否已确认（写进草稿快照，恢复时还原流程状态） */
  const [briefConfirmed, setBriefConfirmed] = useState(false)
  /** 上次未应用、窗口关闭前自动留存的结果；非空时显示「恢复 / 丢弃」横幅 */
  const [draftPending, setDraftPending] = useState<AiFullDraft | null>(() => {
    const found = loadAiFullDraft(ceshuId)
    return found !== null && Object.keys(found.results).length > 0 ? found : null
  })
  const [draftNotice, setDraftNotice] = useState<string | null>(null)
  /** 每章当前生成到第几个单元（单元模式的细粒度进度；未开始的章无键） */
  const [unitProgress, setUnitProgress] = useState<Partial<Record<string, { done: number; total: number }>>>({})
  /**
   * 分步向导（2026-11-11，用户原话「可以，但不一键生成，要步骤都来」）。
   *
   * 三个位置字段**一律存章 key，不存下标**：plan.order 随 stage / scope / 可见章变化
   * （恢复草稿时就会变），存下标会在阶段切换后指到别的章上。
   *
   * cursorChapter = 当前这一步的章；null 表示向导没在跑（表单态）。
   */
  const [cursorChapter, setCursorChapter] = useState<string | null>(null)
  /** 本轮已写盘的章（采纳后立刻落盘，所以「已生成」与「已保存」不再是一回事） */
  const [applied, setApplied] = useState<readonly string[]>([])
  /** 人主动跳过的章：不写盘，但不该被当成失败或阻塞下一步 */
  const [skipped, setSkipped] = useState<readonly string[]>([])
  /** 本章已生成、等人看：true 时显示正文预览 + 采纳 / 重生成 / 跳过 */
  const [reviewing, setReviewing] = useState(false)
  /** 整轮走完（全部章或采纳或跳过后置 true，用于收尾文案） */
  const [finished, setFinished] = useState(false)
  /** 非 null ⇒ 正停在阶段门上（跨 concept → production → release 时停一次） */
  const [stageGate, setStageGate] = useState<CeshuStage | null>(null)
  /** 阶段门通过后要去的章（门只是暂停，「下一步是哪章」在开门前就定好了） */
  const [gateNextChapter, setGateNextChapter] = useState<string | null>(null)
  /** 逐章写盘后的文档快照：本章预览与字数统计都要基于「含刚保存内容」的文档 */
  const [docSnapshot, setDocSnapshot] = useState<CeshuDocument | null>(null)
  const stopRef = useRef(false)
  /** token 累计用 ref：runChapters 每步都会读它，读 state 会拿到点击那一刻的旧值 */
  const usageRef = useRef(0)
  /** 第 2 步「确认设计概要」卡片：出现时滚进视口，别让标题被长面板上沿裁掉 */
  const briefRef = useRef<HTMLDivElement | null>(null)
  /** 本轮已写盘 / 已跳过的章（ref 供 handler 同步读，state 供渲染） */
  const appliedRef = useRef<readonly string[]>([])
  const skippedRef = useRef<readonly string[]>([])
  const resultsRef = useRef<Partial<Record<string, ChapterData>>>({})
  const judgesRef = useRef<Partial<Record<string, LlmJudgeVerdict | null>>>({})
  const verdictsRef = useRef<Partial<Record<string, QualityGateVerdict | null>>>({})

  const docKind = getDocKind(doc)
  const isApp = docKind !== 'game'
  /**
   * 第 2 步确认后的「设计概要」要真正驱动生成：把用户看概要时补的方向修订拼进
   * buildFullGeneratePlan 的 description，经 buildUserInputLines 的「概念描述 / 需求描述」
   * 进入每章【用户输入】。其余表单项（名称 / 类型 / 风格 / 平台 / 参考）本来就在同一段里，
   * 不重复抄一遍，免得占 token 又让模型读了两份互相打架的设定。
   *
   * 关键点：**不**拿 briefConfirmed 当开关——handleStart 点击那一下的闭包里 plan 还是旧值，
   * 若靠 state 触发重建，首轮生成会漏掉方向修订。这里始终由表单确定性推导，
   * 而生成本来就只发生在用户确认之后，因此不存在「未确认就下发」的情况。
   */
  const effectiveDescription = useMemo(
    () => withBriefRevision(description, briefNote),
    [description, briefNote]
  )
  const plan = useMemo(
    () =>
      buildFullGeneratePlan(
        { gameName, gameType, style, description: effectiveDescription, references, platforms, businessModel },
        {
          scope,
          includeMarket: includeMarket && scope === GDD_SCOPE_FULL,
          includeRisk: includeRisk && scope === GDD_SCOPE_FULL,
          docKind,
          // 游戏档按阶段 + 文档可见章裁剪；应用档忽略这两项
          stage: isApp ? 'full' : stage,
          visibleChapters: isApp ? undefined : visibleChaptersForDoc(doc)
        }
      ),
    [gameName, gameType, style, effectiveDescription, references, platforms, businessModel, scope, includeMarket, includeRisk, docKind, isApp, stage, doc]
  )

  /**
   * 当前这一步的章。存的是 key，但检索时**必须过一遍 plan.order**：
   * 用户中途改阶段 / 档位会让 order 变形，旧 key 可能已不在计划里，
   * 那时向导应视为未启动，而不是卡在一章永远生成不出来的章上。
   */
  const currentChapter = cursorChapter !== null && plan.order.includes(cursorChapter) ? cursorChapter : null
  const currentIndex = currentChapter === null ? -1 : plan.order.indexOf(currentChapter)
  const failedChapters = plan.order.filter((chapter) => statuses[chapter] === 'failed')
  /** 确定性质量门判定为「净恶化」的章：生成后校验错误变多 / 立项完成度倒退 */
  const regenChapters = plan.order.filter(
    (chapter) => statuses[chapter] === 'done' && shouldRegenerateChapter(verdicts[chapter] ?? null)
  )
  const appliedCount = plan.order.filter((chapter) => results[chapter] !== undefined).length
  /**
   * 已生成但**还没写盘**的章。「全部应用并保存」按钮只该在真的有事可做时可用：
   * 分步向导是逐章写盘的，跑完一轮后再留一个亮着的「全部应用」会让人以为漏存了。
   */
  const pendingApplyChapters = plan.order.filter(
    (chapter) => results[chapter] !== undefined && !applied.includes(chapter)
  )
  const locked = running || applying
  /**
   * 向导进行中（有当前章）时表单、阶段选择、关闭一律锁住：
   * 中途改 stage/scope 会让 plan.order 变形，也让人分不清「我确认的那份概要」是哪一份。
   * 注意**不**把 apply 按钮算进 locked：草稿恢复后可能还剩一批已生成未保存的章，
   * 那时仍需能用（见 handleApply 的兜底语义）。
   */
  const wizardActive = cursorChapter !== null || reviewing
  const formLocked = locked || wizardActive
  /**
   * 阶段门要进的下一阶段标签。stageGate 记的是**目标**阶段（planNextStep 返回的 toStage），
   * 所以这里直接查标签即可；不用再按序号 +1 推——那样在「跨两阶段」或
   * 「从 release 阶段的门」这类边界上会算错。
   */
  const gateStageLabel = stageGate === null ? null : CESHU_STAGE_LABELS[stageGate]
  /** 步骤条当前所在步：2 = 等人工确认概要，3 = 生成中，4 = 待应用 */
  /*
   * 向导期间（等你看 / 正在生成当前章）都算第 3 步：分步流程里「第 3 步」的语义是
   * 「逐章生成」，不是「跑完一次」。写成 appliedCount > 0 ? 4 会让采纳完第一章后
   * 步骤条直接跳到第 4 步，后面还没生成的十几章看着像已完成。
   */
  const currentStep = confirming ? 2 : wizardActive || running ? 3 : appliedCount > 0 || finished ? 4 : 1
  /**
   * 点「开始一键生成」后卡片出现在长面板底部，标题/提示容易被视口上沿裁掉
   * （实测截图 01-brief-card.png 只露出「项目设定」行）。用户要「先看一眼」，
   * 所以确认态一出现就把整张卡片滚到可见区；jsdom 无 scrollIntoView 时静默跳过。
   */
  useEffect(() => {
    if (!confirming) return
    const node = briefRef.current
    if (node !== null && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'start', behavior: 'auto' })
    }
  }, [confirming])
  /**
   * 生成结果速览（2026-11-11）：**真正压成一页**，并去掉「只给立项阶段」的门禁。
   * 旧实现把 renderOnePageSummary（立项阶段完备度清单）整个塞进 pre：制作档 15 章实测
   * 34261 字符 / 中文 19864 字 / 7 个三级小节，既不是「一页」，制作/全量档还干脆不显示。
   * renderOnePageSummary 是导出格式口径（空字段必须保留「（待填）」占位），不能改；
   * 这里改用 renderGenerationDigest：只摘已写出的章、每章 1–2 个要点、全文字符预算。
   */
  const pitchPreview = useMemo(() => {
    const draft: Record<string, ChapterData> = {}
    for (const [key, value] of Object.entries(results)) {
      if (value !== undefined) draft[key] = value
    }
    if (Object.keys(draft).length === 0) return ''
    return renderGenerationDigest(mergeChapterDraft(doc, draft), { chapters: plan.order })
  }, [results, doc, plan.order])

  /**
   * 当前章的正文预览（分步向导的「看一眼再决定」）。
   *
   * 用 displayFieldValue 而不是 JSON 直出：字段值可能是 stringList / pipeList，
   * 直出会变成 `["a","b"]` 这种没人要读的东西。空值不占位——预览只回答
   * 「这章写出了什么」，没写出的空字段在编辑页里自然可见。
   *
   * 字数用 countWordsInChapter 统一口径（中文按字 + 英文按词），和导出/完成度一致；
   * 不自己数 length，否则中英混排的数字和面板别处对不上。
   */
  const chapterPreview = useMemo(() => {
    const chapter = currentChapter
    const data = chapter === null ? undefined : results[chapter]
    if (chapter === null || data === undefined) return { words: 0, rows: [] as { label: string; value: string }[] }
    const previewDoc = docSnapshot ?? doc
    const rows: { label: string; value: string }[] = []
    for (const field of chapterFieldsForDoc(previewDoc, chapter)) {
      const value = displayFieldValue(field, data[field.key])
      if (value === '') continue
      rows.push({ label: field.label, value })
    }
    return { words: countWordsInChapter(data), rows }
  }, [currentChapter, results, doc, docSnapshot])

  /**
   * 未应用结果的草稿快照：每章完成即写 localStorage（按 ceshuId 隔离）。
   * **不写进策划书正文**——用户要的是「人确认之后才生成设计文档」，自动入库会绕过这道门。
   * 快照只在用户点「恢复」时回填内存；点「全部应用并保存」后清除。
   */
  useEffect(() => {
    if (applying) return
    const generated = Object.keys(results)
    if (generated.length === 0) return
    /*
     * 全部生成结果都已写盘 ⇒ 快照没有存在意义，直接清掉。
     * 分步向导是逐章写盘的，跑完一轮后 results 仍留在内存里（速览还要用），
     * 若不在这里清，下次打开面板会弹「有未应用结果」的恢复横幅，可恢复的东西却是零。
     */
    if (generated.every((chapter) => applied.includes(chapter))) {
      clearAiFullDraft(ceshuId)
      return
    }
    const payload: AiFullDraft = {
      version: AI_FULL_DRAFT_VERSION,
      ceshuId,
      savedAt: Date.now(),
      stage,
      scope,
      briefConfirmed,
      results: results as Record<string, Record<string, unknown>>,
      statuses: statuses as Record<string, 'pending' | 'running' | 'done' | 'failed'>,
      errors: errors as Record<string, string>,
      usageTotal,
      summary,
      applied: [...applied],
      skipped: [...skipped]
    }
    saveAiFullDraft(payload)
  }, [ceshuId, results, statuses, errors, usageTotal, summary, stage, scope, briefConfirmed, applying, applied, skipped])

  /** 恢复上次未应用的结果：只回内存，仍要用户点「全部应用并保存」才写盘 */
  const handleRestoreDraft = (): void => {
    const draft = draftPending
    if (draft === null) return
    /**
     * 还原生成阶段与档位：草稿可能是制作档 15 章跑到一半留下的，而新窗口的表单
     * 默认回到立项档 7 章。plan.order 由 stage/scope 推导，不还原会让「全部应用」
     * 只写回前 7 章里的交集 —— 实测恢复 8 章却只保存了 6 章，story / systems 被静默丢掉。
     * 表单其余项（名称 / 描述 / 风格）只影响提示词，不影响写盘章集合，故不入快照。
     */
    if (draft.stage === 'concept' || draft.stage === 'production' || draft.stage === 'full') {
      setStage(draft.stage)
    }
    if (draft.scope === GDD_SCOPE_FULL || draft.scope === GDD_SCOPE_LITE) {
      setScope(draft.scope)
    }
    resultsRef.current = { ...draft.results }
    setResults({ ...draft.results })
    // 中断时正在生成的单元会留下 'running'，恢复后不该永远显示「生成中」
    const restoredStatuses: Partial<Record<string, ChapterStatus>> = {}
    for (const [chapter, status] of Object.entries(draft.statuses)) {
      restoredStatuses[chapter] = status === 'running' ? 'pending' : status
    }
    setStatuses(restoredStatuses)
    setErrors({ ...draft.errors })
    setUsageTotal(draft.usageTotal)
    usageRef.current = draft.usageTotal
    setSummary(draft.summary)
    setBriefConfirmed(draft.briefConfirmed)
    /*
     * 还原向导位置：快照里的 applied 是「已经写进策划书」的章，恢复后不该再让人
     * 采纳一次；有结果但未写盘的章则直接进入 review 态，人点一下就能接着走。
     *
     * 旧快照没有 applied 字段 ⇒ 按空数组处理，会把「已写盘但没记下来」的章重新
     * 停在 review；这是保守方向（多重确认一次，不会漏写），可接受。
     */
    const restoredApplied = draft.applied ?? []
    const restoredSkipped = draft.skipped ?? []
    appliedRef.current = restoredApplied
    setApplied(restoredApplied)
    skippedRef.current = restoredSkipped
    setSkipped(restoredSkipped)
    const position = locateWizardPosition(
      plan.order,
      Object.keys(draft.results),
      restoredApplied,
      0
    )
    setFinished(false)
    setStageGate(null)
    setCursorChapter(position.cursor < plan.order.length ? (plan.order[position.cursor] as string) : null)
    setReviewing(position.reviewing)
    setDraftPending(null)
    setDraftNotice(t('aiFull.draftRestored', { count: Object.keys(draft.results).length }))
  }
  /** 丢弃快照：必须同时清空内存结果，否则上面的 useEffect 会立刻把它写回去 */
  const handleDiscardDraft = (): void => {
    clearAiFullDraft(ceshuId)
    setDraftPending(null)
    setDraftNotice(null)
    resultsRef.current = {}
    setResults({})
    setStatuses({})
    setErrors({})
    setUsageTotal(0)
    setSummary(null)
    setBriefConfirmed(false)
  }

  /**
   * 逐章生成：**章内按「单元」切分并少量并发**，章与章之间串行（后文要点依赖前序章）。
   *
   * 为什么不再一次索要整章（2026-11-10 实测）：整章 6–33 字段一次性索要时，推理型模型把
   * 70–93% 的输出预算花在思考上，正文被压到每字段几十字，JSON 还常在最后一个字段中间被截断
   * （解析失败 ⇒ 整章归零）；同样的内容按 11/11/11 分批后写出 4992 字（≈4 倍）。
   * 故这里用 `buildChapterUnitPlan` 把每章切成若干「一次只写几项」的单元，逐单元调用。
   *
   * 并发只给 2：本地模型服务 / 网关的可用并发有限，再高会让限流排队和「停止」互相干扰；
   * 每笔都带独立 `taskId`——取消表按窗口只记一笔，不带 id 并发时点「停止」会停错人。
   */
  const runChapters = async (targets: readonly string[], step = false): Promise<number> => {
    if (targets.length === 0) return 0
    setRunning(true)
    setPanelError(null)
    /*
     * 分步向导下一步时不重置：花费是整轮的累计值，每步清零会让人以为这一步不要钱。
     * 整轮开始时由 handleStart 显式把 usageRef 归零。
     */
    if (!step) setSummary(null)
    setUnitProgress({})
    stopRef.current = false
    const draftResults: Partial<Record<string, ChapterData>> = { ...resultsRef.current }
    const draftJudges: Partial<Record<string, LlmJudgeVerdict | null>> = { ...judgesRef.current }
    const draftVerdicts: Partial<Record<string, QualityGateVerdict | null>> = { ...verdictsRef.current }
    let succeeded = 0
    let failed = 0
    let usageAcc = usageRef.current
    setUsageTotal(usageAcc)
    for (const chapter of targets) {
      if (stopRef.current) break
      setStatuses((prev) => ({ ...prev, [chapter]: 'running' }))
      try {
        /*
         * 单元计划按「当前草稿」算：前序章的生成结果会改变本章可见字段（如 systems 的系统块），
         * 用原始 doc 规划会让计划与实际可写字段脱节。
         */
        const planDraft: Record<string, ChapterData> = {}
        for (const [key, value] of Object.entries(draftResults)) {
          if (value !== undefined) planDraft[key] = value
        }
        const planDoc = Object.keys(planDraft).length > 0 ? mergeChapterDraft(doc, planDraft) : doc
        const planned = buildChapterUnitPlan(planDoc, chapter, {
          ...(plan.styleKey ? { styleOverride: plan.styleKey } : {}),
          ...(plan.chapterPrompts[chapter] ? { extraPrompt: plan.chapterPrompts[chapter] } : {}),
          generationOrder: [...plan.order],
          generatedChapters: Object.keys(draftResults)
        })
        // 兜底：规划不出单元（该章无可写字段）时退回「整章一次调用」，保持旧行为不丢章
        const units: ChapterUnitTask[] =
          planned.length > 0 ? planned : [{ id: 'u1', label: '', fields: [], system: '', prompt: '' }]
        const merged: ChapterData = {}
        let unitDone = 0
        let chapterError: unknown
        setUnitProgress((prev) => ({ ...prev, [chapter]: { done: 0, total: units.length } }))

        /*
         * 单单元生成（把「空字段重试」收在这里）：
         * 仅在「调用成功但解析出 0 个字段」时追加严格 JSON 约束**自动重试 1 次**；
         * 服务不可用 / 网络错 / 用户取消都在 await 处抛错，直接进 catch，不会重试放大故障。
         */
        const callUnit = async (unit: ChapterUnitTask): Promise<void> => {
          const basePrompt = plan.chapterPrompts[chapter] ?? ''
          const request = (extraPrompt: string) =>
            window.mbApi.ceshu.aiGenerateChapter({
              id: ceshuId,
              chapter,
              onlyEmpty: false,
              onlyFields: unit.fields,
              taskId: 'ai-full-' + chapter + '-' + unit.id,
              // 单元模式不复跑 judge：每单元一次会让往返翻倍，与「加快生成」直接冲突；
              // 主结论由下面章级的确定性质量门给出。
              skipJudge: true,
              fullGenerate: {
                styleKey: plan.styleKey,
                extraPrompt,
                draft: buildDraftPayload(plan, draftResults),
                generationOrder: [...plan.order]
              },
              confirmed: true
            })
          let response = await request(basePrompt)
          if (Object.keys(response.fields).length === 0 && !stopRef.current) {
            response = await request(basePrompt + '\n\n' + t('aiFull.retryStrictJson'))
          }
          if (Object.keys(response.fields).length === 0) {
            throw new Error(t('aiFull.errNoContent'))
          }
          for (const [key, value] of Object.entries(response.fields)) merged[key] = value
          usageAcc += response.usage?.totalTokens ?? 0
          usageRef.current = usageAcc
          setUsageTotal(usageAcc)
          unitDone += 1
          setUnitProgress((prev) => ({ ...prev, [chapter]: { done: unitDone, total: units.length } }))
        }

        // 小并发工作池：单元之间互不依赖，串行会把「章多 + 单元多」的耗时直接相加
        const queue = [...units]
        const worker = async (): Promise<void> => {
          for (;;) {
            if (stopRef.current || chapterError !== undefined) return
            const unit = queue.shift()
            if (unit === undefined) return
            try {
              await callUnit(unit)
            } catch (error) {
              if (chapterError === undefined) chapterError = error
              return
            }
          }
        }
        await Promise.all(
          Array.from({ length: Math.min(UNIT_CONCURRENCY, units.length) }, () => worker())
        )
        if (chapterError !== undefined) throw chapterError
        if (stopRef.current) {
          setStatuses((prev) => ({ ...prev, [chapter]: 'pending' }))
          break
        }
        if (Object.keys(merged).length === 0) throw new Error(t('aiFull.errNoContent'))
        draftResults[chapter] = merged
        /*
         * 质量门对「整章合并结果」重算一次：单元返回值里的 quality 只覆盖本单元字段，
         * 直接当章结论会把「其它单元还没写」误判成倒退。judge 在单元模式下不跑（见上）。
         */
        draftJudges[chapter] = null
        draftVerdicts[chapter] = evaluateChapterDraft(doc, chapter, merged)
        resultsRef.current = { ...draftResults }
        judgesRef.current = { ...draftJudges }
        verdictsRef.current = { ...draftVerdicts }
        setResults({ ...draftResults })
        setJudges({ ...draftJudges })
        setVerdicts({ ...draftVerdicts })
        setStatuses((prev) => ({ ...prev, [chapter]: 'done' }))
        setErrors((prev) => withoutKey(prev, chapter))
        succeeded++
      } catch (error) {
        // 用户点了停止 ⇒ 这一章是被主动中断的，不是失败：状态还原、不计入 failed
        if (stopRef.current) {
          setStatuses((prev) => ({ ...prev, [chapter]: 'pending' }))
          break
        }
        const message = toErrorMessage(error)
        setStatuses((prev) => ({ ...prev, [chapter]: 'failed' }))
        setErrors((prev) => ({ ...prev, [chapter]: message }))
        failed++
        if (succeeded === 0) {
          // 首章即失败：大概率本地模型服务不可用，不再逐个重试后续章节
          setSummary(t('aiFull.summaryInterrupted', { message }))
          setRunning(false)
          return 0
        }
      }
    }
    setRunning(false)
    if (stopRef.current) {
      setSummary(
        t('aiFull.summaryStopped', {
          succeeded,
          extra: failed > 0 ? t('aiFull.summaryStoppedFailed', { count: failed }) : ''
        })
      )
      return succeeded
    }
    if (failed > 0) {
      setSummary(t('aiFull.summaryFailed', { succeeded, failed }))
    } else {
      setSummary(t('aiFull.summaryDone', { succeeded }))
    }
    return succeeded
  }
  /**
   * 整篇生成属「大范围云端调用」（v0.5 DD-17）⇒ **首次点击只进入内联确认态**，
   * 再点「确认生成」才真正发起。交互沿用项目既有做法（`ClearAllPanel` / `BatchEditPanel`），
   * 不自造弹窗组件。
   */
  const handleStart = async (): Promise<void> => {
    setPanelError(null)
    if (!description.trim()) {
      setPanelError(t('aiFull.errNoDesc'))
      return
    }
    if (!confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    // 方向已由人确认：清掉上次的快照，避免新结果与旧结果混进同一份草稿
    setBriefConfirmed(true)
    clearAiFullDraft(ceshuId)
    setDraftPending(null)
    setDraftNotice(null)
    resultsRef.current = {}
    setResults({})
    judgesRef.current = {}
    setJudges({})
    verdictsRef.current = {}
    setVerdicts({})
    setErrors({})
    setSummary(null)
    setFinished(false)
    usageRef.current = 0
    setUsageTotal(0)
    appliedRef.current = []
    setApplied([])
    skippedRef.current = []
    setSkipped([])
    setStageGate(null)
    setReviewing(false)
    const initial: Partial<Record<string, ChapterStatus>> = {}
    for (const chapter of plan.order) initial[chapter] = 'pending'
    setStatuses(initial)
    /*
     * 分步：确认方向后**只生成第一章**，剩下的等这一章被采纳/跳过后再走。
     * 旧实现（await runChapters(plan.order)）会一口气跑完全部 15 章，
     * 确认门被放在最贵一步之后——12 分钟 / 31 万 token 花完才轮到人点头。
     */
    const first = plan.order[0]
    setCursorChapter(first ?? null)
    if (first !== undefined) await generateChapter(first)
  }

  const handleRetry = async (): Promise<void> => {
    const targets = failedChapters
    /*
     * 分步模式下「重试失败小节」只该重试**当前这一章**：把整批失败章一次跑完，
     * 等于把刚拆掉的「一键全量」从后门放回来。
     */
    if (currentChapter !== null) {
      if (!targets.includes(currentChapter)) return
      await generateChapter(currentChapter)
      return
    }
    await runChapters(targets)
  }

  /** 重生成「确定性质量门判定为净恶化」的章：把主结论从记录变成可行动 */
  const handleRegen = async (): Promise<void> => {
    if (currentChapter !== null) {
      await generateChapter(currentChapter)
      return
    }
    await runChapters(regenChapters)
  }

  /**
   * 把指定章写进策划书（含 meta 种子与 systems 深合并），首章顺带写回风格/类型 key。
   *
   * 从 handleApply 里抽出来：分步向导「采纳本章」要**逐章**写盘，而草稿恢复的
   * 「全部应用并保存」仍是批量写盘；两条路径必须写同一套合并规则，否则
   * 「逐章采纳」和「批量应用」会产出不一样的文件——那比不提供逐章采纳更糟。
   */
  const saveChapters = async (chapters: readonly string[]): Promise<CeshuDocument> => {
    let updated = doc
    for (let index = 0; index < chapters.length; index++) {
      const chapter = chapters[index]
      const generated = resultsRef.current[chapter] as ChapterData
      let data: ChapterData
      if (chapter === 'meta') {
        data = { ...updated.meta, ...plan.metaSeed, ...generated }
        data.gdd_scope = updated.meta.gdd_scope
        // 应用档 meta 的字段表里含 doc_kind（人定字段），AI 整章生成可能写出 'game'。
        // 一键生成不该把用户选的档位悄悄改回游戏档，这里显式保留。
        if (isApp) data.doc_kind = updated.meta.doc_kind
      } else if (chapter === 'systems') {
        data = mergeSystems(updated.systems, generated)
      } else {
        data = { ...chapterDataForDoc(updated, chapter), ...generated }
      }
      updated = await window.mbApi.ceshu.saveChapter({
        id: ceshuId,
        chapter,
        data,
        style: index === 0 && plan.styleKey ? plan.styleKey : undefined,
        moduleType: index === 0 && plan.typeKey ? plan.typeKey : undefined
      })
    }
    return updated
  }

  /**
   * 生成**一章**（向导里的「这一步」）。返回是否成功。
   *
   * 成功即进入 review 态：不自动写盘。用户原话是「要步骤都来」，
   * 每章都该有一个「看过了，写进去」的动作，而不是跑完直接入库。
   */
  const generateChapter = async (chapter: string): Promise<boolean> => {
    setReviewing(false)
    const ok = await runChapters([chapter], true)
    if (stopRef.current) return false
    if (ok > 0) {
      setReviewing(true)
      setSummary(null)
      return true
    }
    return false
  }

  /**
   * 采纳当前章并前进。
   *
   * 阶段门在**写盘之后**再过一道：人刚看完「立项最后一章」，此刻正是问
   * 「要不要继续展开研发阶段」的时候；放到写盘前会让人误以为不点头就不保存。
   */
  const handleAdopt = async (): Promise<void> => {
    const chapter = currentChapter
    if (chapter === null || resultsRef.current[chapter] === undefined) return
    setApplying(true)
    setPanelError(null)
    try {
      const updated = await saveChapters([chapter])
      appliedRef.current = [...appliedRef.current, chapter]
      setApplied(appliedRef.current)
      setDocSnapshot(updated)
      onApplied(updated, [chapter])
      setReviewing(false)
      await advanceAfter(chapter)
    } catch (error) {
      setPanelError(toErrorMessage(error))
    } finally {
      setApplying(false)
    }
  }

  /** 跳过当前章：不写盘（正文保持原样），但不再阻塞流程 */
  const handleSkip = async (): Promise<void> => {
    const chapter = currentChapter
    if (chapter === null) return
    skippedRef.current = [...skippedRef.current, chapter]
    setSkipped(skippedRef.current)
    setReviewing(false)
    await advanceAfter(chapter)
  }

  /**
   * 收尾：整轮结束后停在这里，不再自动生成下一阶段。
   *
   * 之所以不自动滚动到下一阶段：跨阶段是「要不要继续投入」的决策点，
   * 未读过的章一次跑完正是这次要改掉的行为。
   */
  const finishWizard = (): void => {
    const done = appliedRef.current.length
    const skippedCount = skippedRef.current.length
    setCursorChapter(null)
    setStageGate(null)
    setFinished(true)
    setSummary(t('aiFull.wizardDone', { applied: done, skipped: skippedCount, total: plan.order.length }))
  }

  /** 当前章处理完 ⇒ 按 planNextStep 决定「下一章」还是「停一道阶段门」 */
  const advanceAfter = async (finishedChapter: string): Promise<void> => {
    const index = plan.order.indexOf(finishedChapter)
    if (index < 0) {
      finishWizard()
      return
    }
    const next = planNextStep(plan.order, index, finishedChapter)
    if (next.cursor >= plan.order.length) {
      finishWizard()
      return
    }
    const nextChapter = plan.order[next.cursor] as string
    setCursorChapter(nextChapter)
    if (next.stageGate !== null) {
      /*
       * 阶段门：先记下「下一章是谁」，但**不生成**。
       * 门上的两个出口——继续（生成下一章）/ 停在这里——都必须显式点，
       * 不给「默认继续」，否则门就形同虚设。
       */
      setGateNextChapter(nextChapter)
      setStageGate(next.stageGate)
      return
    }
    setStageGate(null)
    await generateChapter(nextChapter)
  }

  /** 阶段门「继续」：放行下一章（此时才真正调模型） */
  const handleGateGo = async (): Promise<void> => {
    const next = gateNextChapter
    setStageGate(null)
    setGateNextChapter(null)
    if (next === null) {
      finishWizard()
      return
    }
    setCursorChapter(next)
    await generateChapter(next)
  }

  /** 阶段门「先停在这里」：本轮结束，已写盘的章都在，随时能再开一轮 */
  const handleGateStop = (): void => {
    finishWizard()
  }

  /**
   * 应用并保存（兜底）：处理「草稿恢复」等非向导路径留下的**未写盘**章节。
   *
   * 向导自己的路径已逐章落盘，这里必须按 applied 过滤，否则会把同一章
   * 再写一遍——虽然结果相同，但白跑一次 IPC，还会覆盖刚被用户手工改过的正文。
   */
  const handleApply = async (): Promise<void> => {
    const chapters = plan.order.filter(
      (chapter) => resultsRef.current[chapter] !== undefined && !appliedRef.current.includes(chapter)
    )
    if (chapters.length === 0) return
    setApplying(true)
    setPanelError(null)
    try {
      const updated = await saveChapters(chapters)
      // 已写盘 ⇒ 草稿快照完成使命，清掉；否则下次打开还会提示「有未应用结果」
      clearAiFullDraft(ceshuId)
      setDraftPending(null)
      setDraftNotice(null)
      const merged = [...appliedRef.current, ...chapters]
      appliedRef.current = merged
      setApplied(merged)
      /*
       * 结果留一份在内存里：向导中途恢复后「生成结果速览」仍要能看，
       * 一键清空会让刚写进去的内容从面板上消失（用户会以为没保存）。
       */
      setStatuses((prev) => {
        const next = { ...prev }
        for (const chapter of chapters) next[chapter] = 'done'
        return next
      })
      setDocSnapshot(updated)
      setSummary(t('aiFull.applied', { count: chapters.length }))
      onApplied(updated, chapters)
    } catch (error) {
      setPanelError(toErrorMessage(error))
    } finally {
      setApplying(false)
    }
  }

  const togglePlatform = (platform: string): void => {
    setPlatforms((prev) => (prev.includes(platform) ? prev.filter((item) => item !== platform) : [...prev, platform]))
  }

  return (
    <div className="changelog-panel" data-testid="ai-full-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">{t(isApp ? 'aiFull.appTitle' : 'aiFull.title')}</span>
        <button type="button" className="btn" data-testid="ai-full-close" disabled={locked} onClick={onClose}>
          {t('common.close')}
        </button>
      </div>

      {/* 四步流程：把「先确认方向再生成」做成看得见的门禁，而不是一个隐藏的确认条 */}
      <ol className="ai-full-steps" data-testid="ai-full-steps" aria-label={t('aiFull.stepsLabel')}>
        {([
          ['form', 'aiFull.stepForm'],
          ['brief', 'aiFull.stepBrief'],
          ['generate', 'aiFull.stepGenerate'],
          ['apply', 'aiFull.stepApply']
        ] as const).map(([key, label], index) => (
          <li
            key={key}
            className={'ai-full-step' + (currentStep === index + 1 ? ' is-current' : '') + (currentStep > index + 1 ? ' is-done' : '')}
            data-testid={'ai-full-step-' + key}
            aria-current={currentStep === index + 1 ? 'step' : undefined}
          >
            <span className="ai-full-step-no" aria-hidden="true">{index + 1}</span>
            <span>{t(label)}</span>
          </li>
        ))}
      </ol>

      {draftPending !== null && (
        <div className="ai-full-draft" data-testid="ai-full-draft" role="status">
          <span className="ai-full-draft-text">
            {t('aiFull.draftFound', { count: Object.keys(draftPending.results).length })}
          </span>
          <button type="button" className="btn primary" data-testid="ai-full-draft-restore" onClick={handleRestoreDraft}>
            {t('aiFull.draftRestore')}
          </button>
          <button type="button" className="btn" data-testid="ai-full-draft-discard" onClick={handleDiscardDraft}>
            {t('aiFull.draftDiscard')}
          </button>
        </div>
      )}
      {draftNotice !== null && (
        <div className="notice-banner" data-testid="ai-full-draft-notice">{draftNotice}</div>
      )}

      <div className="changelog-entry">
        <div className="form-label">{t('aiFull.projectInfo')}</div>
        <div className="ai-gen-row">
          <span className="form-label">{t(isApp ? 'aiFull.projectName' : 'aiFull.gameName')}</span>
          <input
            className="form-input"
            data-testid="ai-full-name"
            value={gameName}
            disabled={formLocked}
            placeholder={t(isApp ? 'aiFull.appNamePlaceholder' : 'aiFull.namePlaceholder')}
            onChange={(event) => setGameName(event.target.value)}
          />
          {!isApp && (
            <>
              <span className="form-label">{t('aiFull.gameType')}</span>
              <select
                className="form-select"
                data-testid="ai-full-type"
                value={gameType}
                disabled={formLocked}
                onChange={(event) => setGameType(event.target.value)}
              >
                {FULL_GEN_GAME_TYPES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </>
          )}
        </div>
        {!isApp && (
          <>
            <div className="ai-gen-row">
              <span className="form-label">{t('aiFull.style')}</span>
              <select
                className="form-select"
                data-testid="ai-full-style"
                value={style}
                disabled={formLocked}
                onChange={(event) => setStyle(event.target.value)}
              >
                {FULL_GEN_STYLES.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
              <span className="form-label">{t('aiFull.businessModel')}</span>
              <select
                className="form-select"
                data-testid="ai-full-biz"
                value={businessModel}
                disabled={formLocked}
                onChange={(event) => setBusinessModel(event.target.value)}
              >
                {FULL_GEN_BUSINESS_MODELS.map((item) => (
                  <option key={item} value={item}>
                    {item}
                  </option>
                ))}
              </select>
            </div>
            <div className="ai-gen-row">
              <span className="form-label">{t('aiFull.references')}</span>
              <input
                className="form-input"
                data-testid="ai-full-refs"
                value={references}
                disabled={formLocked}
                placeholder={t('aiFull.refsPlaceholder')}
                onChange={(event) => setReferences(event.target.value)}
              />
            </div>
          </>
        )}
        <div className="ai-gen-row">
          <span className="form-label">{t('aiFull.platforms')}</span>
          {FULL_GEN_PLATFORMS.map((platform) => (
            <label className="ai-gen-check" key={platform}>
              <input
                type="checkbox"
                data-testid={`ai-full-platform-${platform}`}
                checked={platforms.includes(platform)}
                disabled={formLocked}
                onChange={() => togglePlatform(platform)}
              />
              {platform}
            </label>
          ))}
        </div>
        <div className="ai-gen-block">
          <span className="form-label">{t(isApp ? 'aiFull.appDescLabel' : 'aiFull.descLabel')}</span>
          <textarea
            className="form-input"
            data-testid="ai-full-desc"
            rows={4}
            value={description}
            disabled={formLocked}
            placeholder={t(isApp ? 'aiFull.appDescPlaceholder' : 'aiFull.descPlaceholder')}
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      {/* 档位/市场/风险是游戏研发流程概念；应用档固定铺 SDD 全章，无需这些开关 */}
      {!isApp && (
      <div className="changelog-entry">
        <div className="form-label">{t('aiFull.scope')}</div>
        <div className="ai-gen-row">
          <label className="ai-gen-check">
            <input
              type="radio"
              name="ai-full-scope"
              data-testid="ai-full-scope-lite"
              checked={scope === GDD_SCOPE_LITE}
              disabled={formLocked}
              onChange={() => setScope(GDD_SCOPE_LITE)}
            />
            {t('aiFull.scopeLite', { count: contentChapterCount(GDD_SCOPE_LITE) })}
          </label>
          <label className="ai-gen-check">
            <input
              type="radio"
              name="ai-full-scope"
              data-testid="ai-full-scope-full"
              checked={scope === GDD_SCOPE_FULL}
              disabled={formLocked}
              onChange={() => setScope(GDD_SCOPE_FULL)}
            />
            {t('aiFull.scopeFull', { count: contentChapterCount(GDD_SCOPE_FULL) })}
          </label>
          <label className="ai-gen-check">
            <input
              type="checkbox"
              data-testid="ai-full-market"
              checked={includeMarket}
              disabled={formLocked || scope === GDD_SCOPE_LITE}
              onChange={(event) => setIncludeMarket(event.target.checked)}
            />
            {t('aiFull.includeMarket')}
          </label>
          <label className="ai-gen-check">
            <input
              type="checkbox"
              data-testid="ai-full-risk"
              checked={includeRisk}
              disabled={formLocked || scope === GDD_SCOPE_LITE}
              onChange={(event) => setIncludeRisk(event.target.checked)}
            />
            {t('aiFull.includeRisk')}
          </label>
        </div>
        <div className="form-label" style={{ marginTop: 8 }} data-testid="ai-full-stage-label">
          {t('aiFull.stage')}
        </div>
        <div className="ai-gen-row" data-testid="ai-full-stage">
          {(['concept', 'production', 'full'] as const).map((value) => (
            <label className="ai-gen-check" key={value}>
              <input
                type="radio"
                name="ai-full-stage"
                data-testid={`ai-full-stage-${value}`}
                checked={stage === value}
                disabled={formLocked}
                onChange={() => setStage(value)}
              />
              {t(
                value === 'concept'
                  ? 'aiFull.stageConcept'
                  : value === 'production'
                    ? 'aiFull.stageProduction'
                    : 'aiFull.stageFull',
                { count: stageChapterCount(value) }
              )}
            </label>
          ))}
        </div>
        <div className="ai-gen-hint">{t('aiFull.stageHint')}</div>
      </div>
      )}

      <div className="changelog-entry">
        <div className="form-label">{t('aiFull.progress', { count: plan.order.length })}</div>
        <div data-testid="ai-full-progress">
          {plan.order.map((chapter) => {
            const status = statuses[chapter] ?? 'pending'
            return (
              <div className={`ai-gen-status ${status}`} key={chapter} data-testid={`ai-full-status-${chapter}`}>
                <span className="ai-gen-status-label">{chapterLabelForDoc(doc, chapter)}</span>
                <span className={`ai-gen-status-value ${status}`}>{t(STATUS_LABELS[status])}</span>
                {/* 单元粒度进度：整章被切成若干单元逐份生成，只看「生成中」不知道还剩多少 */}
                {status === 'running' && unitProgress[chapter] !== undefined && (
                  <span className="ai-gen-status-value" data-testid={`ai-full-units-${chapter}`}>
                    {t('aiFull.units', {
                      done: unitProgress[chapter]!.done,
                      total: unitProgress[chapter]!.total
                    })}
                  </span>
                )}
                {status === 'done' && shouldRegenerateChapter(verdicts[chapter] ?? null) && (
                  <span
                    className="ai-full-judge-badge flagged"
                    data-testid={`ai-full-verdict-${chapter}`}
                    title={verdicts[chapter]?.summary ?? ''}
                  >
                    {t('aiFull.verdictWorse')}
                  </span>
                )}
                {status === 'done' && judges[chapter] && (
                  <span
                    className={`ai-full-judge-badge ${judges[chapter]!.toxicity}`}
                    data-testid={`ai-full-judge-${chapter}`}
                  >
                    {t(judges[chapter]!.toxicity === 'flagged' ? 'aiFull.judgeFlagged' : 'aiFull.judgeOk')}
                    {judges[chapter]!.score > 0 ? t('aiFull.judgeScore', { score: judges[chapter]!.score }) : ''}
                  </span>
                )}
                {errors[chapter] && <span className="ai-gen-status-error">{errors[chapter]}</span>}
              </div>
            )
          })}
        </div>
      </div>

      {/*
        * 分步向导的正文预览（2026-11-11）：一章生成完先停在这里，让人看一眼再决定
        * 采纳 / 重生成 / 跳过。放在按钮区之上、进度列表之下——视线顺序是
        * 「跑到哪了 → 这章写了什么 → 我要怎么办」。
        */}
      {currentChapter !== null && reviewing && (
        <div className="ai-full-judge" data-testid="ai-full-wizard">
          <div className="ai-full-judge-head">
            {t('aiFull.wizardProgress', {
              index: currentIndex + 1,
              total: plan.order.length
            })}
            {' · '}
            {t('aiFull.wizardChapter', { section: chapterLabelForDoc(doc, currentChapter) })}
          </div>
          <div className="ai-gen-hint">{t('aiFull.wizardHint')}</div>
          <div className="ai-full-judge-head">
            {t('aiFull.wizardPreviewHead', { words: chapterPreview.words })}
          </div>
          {chapterPreview.rows.length === 0 ? (
            <div className="ai-full-pitch-empty" data-testid="ai-full-wizard-empty">
              {t('aiFull.wizardPreviewEmpty')}
            </div>
          ) : (
            <dl className="ai-full-brief-list" data-testid="ai-full-wizard-preview">
              {chapterPreview.rows.map((row) => (
                <div className="ai-full-brief-item" key={row.label}>
                  <dt>{row.label}</dt>
                  <dd className="ai-full-brief-value">{row.value}</dd>
                </div>
              ))}
            </dl>
          )}
          <div className="ai-full-brief-actions">
            <button
              type="button"
              className="btn primary"
              data-testid="ai-full-adopt"
              disabled={locked}
              onClick={() => void handleAdopt()}
            >
              {t('aiFull.wizardAdopt')}
            </button>
            <button
              type="button"
              className="btn"
              data-testid="ai-full-redo"
              disabled={locked}
              onClick={() => void handleRegen()}
            >
              {t('aiFull.wizardRedo')}
            </button>
            <button
              type="button"
              className="btn"
              data-testid="ai-full-skip"
              disabled={locked}
              onClick={() => void handleSkip()}
            >
              {t('aiFull.wizardSkip')}
            </button>
          </div>
        </div>
      )}
      {/* 阶段门：跨 concept → production → release 时显式停一次，绝不默认继续 */}
      {stageGate !== null && gateStageLabel !== null && (
        <div className="ai-full-brief" data-testid="ai-full-gate">
          <div className="ai-full-brief-head">
            {t('aiFull.wizardGateHead', { stage: gateStageLabel })}
          </div>
          <div className="ai-gen-hint">
            {t('aiFull.wizardGateBody', {
              next: gateStageLabel,
              count: gateNextChapter === null ? 0 : countRemainingInStage(plan.order, applied, stageOfChapter(gateNextChapter as ChapterKey))
            })}
          </div>
          <div className="ai-full-brief-actions">
            <button
              type="button"
              className="btn primary"
              data-testid="ai-full-gate-go"
              disabled={locked}
              onClick={() => void handleGateGo()}
            >
              {t('aiFull.wizardGateGo', { next: gateStageLabel })}
            </button>
            <button
              type="button"
              className="btn"
              data-testid="ai-full-gate-stop"
              disabled={locked}
              onClick={handleGateStop}
            >
              {t('aiFull.wizardGateStop')}
            </button>
          </div>
        </div>
      )}
      <div className="editor-actions">
        {confirming && (
          <div className="ai-full-brief" data-testid="ai-full-confirm" ref={briefRef}>
            <div className="ai-full-brief-head">{t('aiFull.briefHead')}</div>
            <div className="ai-gen-hint">{t('aiFull.briefHint')}</div>
            <dl className="ai-full-brief-list" data-testid="ai-full-brief">
              <div className="ai-full-brief-item">
                <dt>{t('aiFull.briefProject')}</dt>
                <dd className="ai-full-brief-value">
                  {gameName.trim() || t('aiFull.namePlaceholder')}
                  {!isApp && ' · ' + gameType}
                  {!isApp && style.trim() !== '' && ' · ' + style.trim()}
                  {platforms.length > 0 && ' · ' + platforms.join('、')}
                  {!isApp && ' · ' + businessModel}
                </dd>
              </div>
              <div className="ai-full-brief-item">
                <dt>{t('aiFull.briefDirection')}</dt>
                <dd className="ai-full-brief-value ai-full-brief-desc" data-testid="ai-full-brief-desc">
                  {description.trim()}
                </dd>
              </div>
              <div className="ai-full-brief-item">
                <dt>{t('aiFull.briefChapters', { count: plan.order.length })}</dt>
                <dd>
                  <ul className="ai-full-brief-chips" data-testid="ai-full-brief-chips">
                    {plan.order.map((chapter) => (
                      <li key={chapter} className="ai-full-brief-chip">{chapterLabelForDoc(doc, chapter)}</li>
                    ))}
                  </ul>
                </dd>
              </div>
            </dl>
            <label className="ai-full-brief-note">
              <span className="form-label">{t('aiFull.briefNote')}</span>
              <textarea
                className="form-input"
                data-testid="ai-full-brief-note"
                rows={3}
                value={briefNote}
                disabled={formLocked}
                placeholder={t('aiFull.briefNotePlaceholder')}
                onChange={(event) => setBriefNote(event.target.value)}
              />
            </label>
            <div className="ai-full-brief-actions">
              <span className="ai-gen-hint">{t('aiFull.confirmPrompt', { count: plan.order.length })}</span>
              <button
                type="button"
                className="btn primary"
                data-testid="ai-full-confirm-yes"
                disabled={formLocked}
                onClick={() => void handleStart()}
              >
                {t('aiFull.briefConfirm')}
              </button>
              <button
                type="button"
                className="btn"
                data-testid="ai-full-confirm-no"
                onClick={() => setConfirming(false)}
              >
                {t('aiFull.briefBack')}
              </button>
            </div>
          </div>
        )}
        {/* 概要确认期间藏起「开始生成」：第 2 步的唯一出口是卡片上的「确认方向，开始生成」 */}
        {!confirming && (
          <button
            type="button"
            className="btn primary"
            data-testid="ai-full-start"
            disabled={formLocked}
            onClick={() => void handleStart()}
          >
            {t('aiFull.start')}
          </button>
        )}
        {running && (
          <button
            type="button"
            className="btn"
            data-testid="ai-full-stop"
            onClick={() => {
              stopRef.current = true
              // 只置标志位的话，当前这一章会一直跑到返回（最长到生成超时），按钮看着像没反应。
              // 同时中断在途请求，循环下一轮即 break。
              void window.mbApi.task.cancel({})
            }}
          >
            {t('aiFull.stop')}
          </button>
        )}
        <button
          type="button"
          className="btn"
          data-testid="ai-full-retry"
          disabled={locked || failedChapters.length === 0}
          onClick={() => void handleRetry()}
        >
          {t('aiFull.retry')}
        </button>
        <button
          type="button"
          className="btn"
          data-testid="ai-full-regen"
          disabled={locked || regenChapters.length === 0}
          onClick={() => void handleRegen()}
        >
          {t('aiFull.regen', { count: regenChapters.length })}
        </button>
        {/*
          * 「全部应用并保存」在分步向导里是**兜底**（草稿恢复等非向导路径）。
          * 因此按「已生成但未写盘」的章数判断可用性，而不是 appliedCount——
          * 后者含已写盘的章，跑完一轮后会一直亮着，看着像还有东西没保存。
          */}
        <button
          type="button"
          className="btn"
          data-testid="ai-full-apply"
          disabled={locked || pendingApplyChapters.length === 0}
          onClick={() => void handleApply()}
        >
          {t('aiFull.apply')}
        </button>
      </div>

      {panelError && (
        <div className="error-banner" data-testid="ai-full-error">
          {panelError}
        </div>
      )}
      {summary && (
        <div className="notice-banner" data-testid="ai-full-summary">
          {summary}
        </div>
      )}
      {/*
         * v0.6 M5 的 token 花费块：2026-11-10 起**去掉预算条**（用户明确要求不限制预算）。
         * 预算原本只是「提示词长度的粗估」，不是账单——实测 4000 档 7 章花了 58381 token，
         * 是面板上那个「预算 21000」的 2.8 倍；拿它画进度条只会给出错误的安心感。
         * 现在只如实显示累计花费，供成本观测。
         */}
      {usageTotal > 0 && (
        <div className="datagen-cost" data-testid="ai-full-cost">
          <span className="datagen-cost-label">{t('aiFull.cost', { tokens: usageTotal })}</span>
        </div>
      )}
      {/* 生成结果速览：一页、所有阶段/档位均可见；生成前是空提示，生成后是应用前确认 */}
      <div className="ai-full-judge" data-testid="ai-full-pitch">
        <div className="ai-full-judge-head">{t('aiFull.pitchHead')}</div>
        <div className="ai-gen-hint">{t('aiFull.pitchHint')}</div>
        {pitchPreview === '' ? (
          <div className="ai-full-pitch-empty" data-testid="ai-full-pitch-empty">{t('aiFull.pitchEmpty')}</div>
        ) : (
          <pre className="ai-full-pitch-body" data-testid="ai-full-pitch-body">{pitchPreview}</pre>
        )}
      </div>
      {/* 确定性质量门主结论：此前只落在 IPC 返回值里，UI 从未使用 ⇒「体检报告出来了不治病」 */}
      {(() => {
        const evaluated = plan.order.filter((chapter) => verdicts[chapter] != null)
        if (evaluated.length === 0) return null
        const worse = regenChapters.map((chapter) => chapterLabelForDoc(doc, chapter))
        return (
          <div className="ai-full-judge" data-testid="ai-full-verdict">
            <div className="ai-full-judge-head">{t('aiFull.verdictHead', { count: evaluated.length })}</div>
            {worse.length > 0 && (
              <div className="ai-full-judge-warn" data-testid="ai-full-verdict-worse">
                {t('aiFull.verdictWarn', { count: worse.length, sections: worse.join('、') })}
              </div>
            )}
            {worse.length === 0 && <div>{t('aiFull.verdictOk')}</div>}
          </div>
        )
      })()}
      {/* v1.0 DD-19 剩余项：judge 辅助评审聚合（确定性门为主，judge 为辅，不覆盖 blocking/completionDelta） */}
      {(() => {
        const entries = plan.order
          .map((chapter) => judges[chapter])
          .filter((value): value is LlmJudgeVerdict | null => value !== undefined)
        if (entries.length === 0) return null
        const judged = entries.filter((value): value is LlmJudgeVerdict => value !== null)
        if (judged.length === 0) {
          return (
            <div className="ai-full-judge" data-testid="ai-full-judge">
              <span className="ai-full-judge-note">
                {t('aiFull.judgeNote', { count: entries.length })}
              </span>
            </div>
          )
        }
        const avgReadability =
          Math.round((judged.reduce((sum, item) => sum + item.readability, 0) / judged.length) * 10) / 10
        const avgCreativity =
          Math.round((judged.reduce((sum, item) => sum + item.creativity, 0) / judged.length) * 10) / 10
        const unjudged = entries.length - judged.length
        const flaggedChapters = plan.order
          .filter((chapter) => judges[chapter]?.toxicity === 'flagged')
          .map((chapter) => chapterLabelForDoc(doc, chapter))
        return (
          <div className="ai-full-judge" data-testid="ai-full-judge">
            <div className="ai-full-judge-head">{t('aiFull.judgeHead')}</div>
            {flaggedChapters.length > 0 && (
              <div className="ai-full-judge-warn">
                {t('aiFull.judgeWarn', { count: flaggedChapters.length, sections: flaggedChapters.join('、') })}
              </div>
            )}
            <div className="ai-full-judge-stats">
              {t('aiFull.judgeStats', {
                readability: avgReadability,
                creativity: avgCreativity,
                judged: judged.length,
                total: entries.length
              })}
              {unjudged > 0 ? t('aiFull.judgeUnjudged', { count: unjudged }) : ''}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

/** 阶段对应的累计章数（含 meta），只用于 UI 文案；真实裁剪在 buildFullGeneratePlan */
function stageChapterCount(stage: GenerateStage): number {
  if (stage === 'full') return CHAPTER_KEYS.length
  return chaptersUpToStage(stage).length
}

/** 草稿载荷：已生成章节 + meta 种子（meta 种子在先，生成结果覆盖），供后续章节提示词上下文 */
function buildDraftPayload(
  plan: FullGeneratePlan,
  results: Partial<Record<string, ChapterData>>
): Record<string, ChapterData> {
  const draft: Record<string, ChapterData> = {}
  for (const [key, value] of Object.entries(results)) {
    if (value) draft[key] = value
  }
  draft.meta = { ...plan.metaSeed, ...(results.meta ?? {}) }
  return draft
}

/** systems 章合并：逐系统浅合并（保留既有 enabled/name/config），与 旧版 _apply_chapter_to_model 一致 */
function mergeSystems(current: ChapterData, generated: ChapterData): ChapterData {
  const merged: ChapterData = { ...current }
  for (const [key, value] of Object.entries(generated)) {
    if (!isPlainObject(value)) continue
    const existing = merged[key]
    merged[key] = isPlainObject(existing) ? { ...existing, ...value } : value
  }
  return merged
}

function withoutKey<T>(record: Partial<Record<string, T>>, key: string): Partial<Record<string, T>> {
  const next = { ...record }
  delete next[key]
  return next
}

