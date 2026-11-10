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
  type GddScope
} from '@mobai/shared/ceshu/reference'
import { chaptersUpToStage } from '@mobai/shared/ceshu/workflow'
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
import { chapterDataForDoc, chapterLabelForDoc, getDocKind, getGddScope, isPlainObject, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
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
  const stopRef = useRef(false)
  /** 第 2 步「确认设计概要」卡片：出现时滚进视口，别让标题被长面板上沿裁掉 */
  const briefRef = useRef<HTMLDivElement | null>(null)
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

  const failedChapters = plan.order.filter((chapter) => statuses[chapter] === 'failed')
  /** 确定性质量门判定为「净恶化」的章：生成后校验错误变多 / 立项完成度倒退 */
  const regenChapters = plan.order.filter(
    (chapter) => statuses[chapter] === 'done' && shouldRegenerateChapter(verdicts[chapter] ?? null)
  )
  const appliedCount = plan.order.filter((chapter) => results[chapter] !== undefined).length
  const locked = running || applying
  /** 步骤条当前所在步：2 = 等人工确认概要，3 = 生成中，4 = 待应用 */
  const currentStep = confirming ? 2 : running ? 3 : appliedCount > 0 ? 4 : 1
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
   * 未应用结果的草稿快照：每章完成即写 localStorage（按 ceshuId 隔离）。
   * **不写进策划书正文**——用户要的是「人确认之后才生成设计文档」，自动入库会绕过这道门。
   * 快照只在用户点「恢复」时回填内存；点「全部应用并保存」后清除。
   */
  useEffect(() => {
    if (applying) return
    const generated = Object.keys(results)
    if (generated.length === 0) return
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
      summary
    }
    saveAiFullDraft(payload)
  }, [ceshuId, results, statuses, errors, usageTotal, summary, stage, scope, briefConfirmed, applying])

  /** 恢复上次未应用的结果：只回内存，仍要用户点「全部应用并保存」才写盘 */
  const handleRestoreDraft = (): void => {
    const draft = draftPending
    if (draft === null) return
    resultsRef.current = { ...draft.results }
    setResults({ ...draft.results })
    setStatuses({ ...draft.statuses })
    setErrors({ ...draft.errors })
    setUsageTotal(draft.usageTotal)
    setSummary(draft.summary)
    setBriefConfirmed(draft.briefConfirmed)
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
  const runChapters = async (targets: readonly string[]): Promise<void> => {
    if (targets.length === 0) return
    setRunning(true)
    setPanelError(null)
    setSummary(null)
    setUsageTotal(0)
    setUnitProgress({})
    stopRef.current = false
    const draftResults: Partial<Record<string, ChapterData>> = { ...resultsRef.current }
    const draftJudges: Partial<Record<string, LlmJudgeVerdict | null>> = { ...judgesRef.current }
    const draftVerdicts: Partial<Record<string, QualityGateVerdict | null>> = { ...verdictsRef.current }
    let succeeded = 0
    let failed = 0
    let usageAcc = 0
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
          return
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
      return
    }
    if (failed > 0) {
      setSummary(t('aiFull.summaryFailed', { succeeded, failed }))
    } else {
      setSummary(t('aiFull.summaryDone', { succeeded }))
    }
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
    const initial: Partial<Record<string, ChapterStatus>> = {}
    for (const chapter of plan.order) initial[chapter] = 'pending'
    setStatuses(initial)
    await runChapters(plan.order)
  }

  const handleRetry = async (): Promise<void> => {
    await runChapters(failedChapters)
  }

  /** 重生成「确定性质量门判定为净恶化」的章：把主结论从记录变成可行动 */
  const handleRegen = async (): Promise<void> => {
    await runChapters(regenChapters)
  }

  /** 应用并保存：逐章写入（含 meta 种子与 systems 深合并），首章顺带写回风格/类型 key */
  const handleApply = async (): Promise<void> => {
    const chapters = plan.order.filter((chapter) => resultsRef.current[chapter] !== undefined)
    if (chapters.length === 0) return
    setApplying(true)
    setPanelError(null)
    try {
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
      // 已写盘 ⇒ 草稿快照完成使命，清掉；否则下次打开还会提示「有未应用结果」
      clearAiFullDraft(ceshuId)
      setDraftPending(null)
      setDraftNotice(null)
      resultsRef.current = {}
      setResults({})
      setStatuses({})
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
            disabled={locked}
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
                disabled={locked}
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
                disabled={locked}
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
                disabled={locked}
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
                disabled={locked}
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
                disabled={locked}
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
            disabled={locked}
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
              disabled={locked}
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
              disabled={locked}
              onChange={() => setScope(GDD_SCOPE_FULL)}
            />
            {t('aiFull.scopeFull', { count: contentChapterCount(GDD_SCOPE_FULL) })}
          </label>
          <label className="ai-gen-check">
            <input
              type="checkbox"
              data-testid="ai-full-market"
              checked={includeMarket}
              disabled={locked || scope === GDD_SCOPE_LITE}
              onChange={(event) => setIncludeMarket(event.target.checked)}
            />
            {t('aiFull.includeMarket')}
          </label>
          <label className="ai-gen-check">
            <input
              type="checkbox"
              data-testid="ai-full-risk"
              checked={includeRisk}
              disabled={locked || scope === GDD_SCOPE_LITE}
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
                disabled={locked}
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
                disabled={locked}
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
                disabled={locked}
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
            disabled={locked}
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
        <button
          type="button"
          className="btn"
          data-testid="ai-full-apply"
          disabled={locked || appliedCount === 0}
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

