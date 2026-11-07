import { useMemo, useRef, useState } from 'react'

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
  buildFullGeneratePlan,
  type FullGeneratePlan,
  type GenerateStage
} from '@mobai/shared/ceshu/prompts'
import { chapterDataForDoc, chapterLabelForDoc, getDocKind, getGddScope, isPlainObject, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import { evaluateBudget, shouldRegenerateChapter, taskBudget } from '@mobai/shared/agent/runtime'
import type { LlmJudgeVerdict, QualityGateVerdict } from '@mobai/shared/types'
import { toErrorMessage } from '@mobai/shared/util/system'
import { readText } from '@mobai/shared/util/io'

/**
 * AI 一键生成完整策划书：
 * 填写简要描述 → 按章节依赖顺序逐章调用本地模型 → 逐章进度 → 应用并保存 / 重试失败章节。
 * 生成期间不写盘；点「全部应用并保存」才逐章 saveChapter 写入当前策划书。
 */

type ChapterStatus = 'pending' | 'running' | 'done' | 'failed'

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
  /** 整篇生成的内联确认态（v0.5 DD-17：大范围云端调用需先确认） */
  const [confirming, setConfirming] = useState(false)
  const stopRef = useRef(false)
  const resultsRef = useRef<Partial<Record<string, ChapterData>>>({})
  const judgesRef = useRef<Partial<Record<string, LlmJudgeVerdict | null>>>({})
  const verdictsRef = useRef<Partial<Record<string, QualityGateVerdict | null>>>({})

  const docKind = getDocKind(doc)
  const isApp = docKind !== 'game'
  const plan = useMemo(
    () =>
      buildFullGeneratePlan(
        { gameName, gameType, style, description, references, platforms, businessModel },
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
    [gameName, gameType, style, description, references, platforms, businessModel, scope, includeMarket, includeRisk, docKind, isApp, stage, doc]
  )

  const failedChapters = plan.order.filter((chapter) => statuses[chapter] === 'failed')
  /** 确定性质量门判定为「净恶化」的章：生成后校验错误变多 / 立项完成度倒退 */
  const regenChapters = plan.order.filter(
    (chapter) => statuses[chapter] === 'done' && shouldRegenerateChapter(verdicts[chapter] ?? null)
  )
  const appliedCount = plan.order.filter((chapter) => results[chapter] !== undefined).length
  const locked = running || applying

  /** 逐章生成：单章失败记录并继续；首章即失败（本地服务不可用等）中断并汇总 */
  const runChapters = async (targets: readonly string[]): Promise<void> => {
    if (targets.length === 0) return
    setRunning(true)
    setPanelError(null)
    setSummary(null)
    setUsageTotal(0)
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
         * 单次生成（把「空字段重试」收在这里）：
         * 字段多的章一次整章生成最容易 JSON 被截断 ⇒ 解析出 0 个有效字段 ⇒ 整章归零。
         * 仅在「调用成功但字段为空」时追加严格 JSON 约束**自动重试 1 次**；
         * 服务不可用 / 网络错 / 用户取消都在 await 处抛错，直接进 catch，不会重试放大故障。
         */
        const generateOnce = async (extraPrompt: string) =>
          window.mbApi.ceshu.aiGenerateChapter({
            id: ceshuId,
            chapter,
            onlyEmpty: false,
            fullGenerate: {
              styleKey: plan.styleKey,
              extraPrompt,
              draft: buildDraftPayload(plan, draftResults),
              // 前文要点按本次生成顺序取前序，不按章表顺序（两者不一致）
              generationOrder: [...plan.order]
            },
            confirmed: true
          })
        const basePrompt = plan.chapterPrompts[chapter] ?? ''
        let response = await generateOnce(basePrompt)
        if (Object.keys(response.fields).length === 0 && !stopRef.current) {
          response = await generateOnce(`${basePrompt}\n\n${t('aiFull.retryStrictJson')}`)
        }
        if (Object.keys(response.fields).length === 0) {
          throw new Error(t('aiFull.errNoContent'))
        }
        draftResults[chapter] = response.fields
        // v1.0 DD-19 剩余项：judge 是辅助维度；主结论是确定性质量门 response.quality
        draftJudges[chapter] = response.quality?.judge ?? null
        draftVerdicts[chapter] = response.quality ?? null
        resultsRef.current = { ...draftResults }
        judgesRef.current = { ...draftJudges }
        verdictsRef.current = { ...draftVerdicts }
        setResults({ ...draftResults })
        setJudges({ ...draftJudges })
        setVerdicts({ ...draftVerdicts })
        usageAcc += response.usage?.totalTokens ?? 0
        setUsageTotal(usageAcc)
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
          <div className="form-row" data-testid="ai-full-confirm">
            <span className="form-label">
              {t('aiFull.confirmPrompt', { count: plan.order.length })}
            </span>
            <button
              type="button"
              className="btn primary"
              data-testid="ai-full-confirm-yes"
              disabled={locked}
              onClick={() => void handleStart()}
            >
              {t('aiFull.confirmGenerate')}
            </button>
            <button
              type="button"
              className="btn"
              data-testid="ai-full-confirm-no"
              onClick={() => setConfirming(false)}
            >
              {t('aiFull.cancel')}
            </button>
          </div>
        )}
        <button
          type="button"
          className="btn primary"
          data-testid="ai-full-start"
          disabled={locked}
          onClick={() => void handleStart()}
        >
          {t('aiFull.start')}
        </button>
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
      {/* v0.6 M5：整篇生成的累计 token 花费 + 预算条 */}
      {usageTotal > 0 && (() => {
        const budget = taskBudget('full', { chapters: plan.order.length })
        const status = evaluateBudget(usageTotal, budget, true)
        return (
          <div className="datagen-cost" data-testid="ai-full-cost">
            <span className="datagen-cost-label">
              {t('aiFull.cost', { tokens: usageTotal, budget })}
            </span>
            <div className="budget-bar">
              <div
                className={`budget-bar-fill level-${status.level}`}
                style={{ width: `${Math.min(100, Math.round(status.ratio * 100))}%` }}
              />
            </div>
          </div>
        )
      })()}
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
                {t('aiFull.verdictWarn', { count: worse.length, chapters: worse.join('、') })}
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
                {t('aiFull.judgeWarn', { count: flaggedChapters.length, chapters: flaggedChapters.join('、') })}
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

