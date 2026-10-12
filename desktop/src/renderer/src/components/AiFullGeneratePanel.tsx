import { useMemo, useRef, useState } from 'react'

import {
  CHAPTER_LABELS,
  GDD_SCOPE_FULL,
  GDD_SCOPE_LITE,
  type CeshuDocument,
  type ChapterData,
  type ChapterKey,
  type GddScope
} from '../../../shared/ceshuConstants'
import {
  FULL_GEN_BUSINESS_MODELS,
  FULL_GEN_GAME_TYPES,
  FULL_GEN_PLATFORMS,
  FULL_GEN_STYLES,
  buildFullGeneratePlan,
  type FullGeneratePlan
} from '../../../shared/ceshu/ceshuAi'
import { getGddScope, isPlainObject } from '../../../shared/ceshuModel'
import { evaluateBudget, taskBudget } from '../../../shared/agent/budget'
import type { LlmJudgeVerdict } from '../../../shared/agent/qualityGate'
import { toErrorMessage } from '../../../shared/util/errors'
import { readText } from '../../../shared/util/readText'

/**
 * AI 一键生成完整策划书（对应 Python N10 AIFullGenerateDialog）：
 * 填写简要描述 → 按章节依赖顺序逐章调用本地模型 → 逐章进度 → 应用并保存 / 重试失败章节。
 * 生成期间不写盘；点「全部应用并保存」才逐章 saveChapter 写入当前策划书。
 */

type ChapterStatus = 'pending' | 'running' | 'done' | 'failed'

const STATUS_LABELS: Record<ChapterStatus, string> = {
  pending: '待生成',
  running: '生成中',
  done: '已完成',
  failed: '失败'
}

interface AiFullGeneratePanelProps {
  ceshuId: string
  doc: CeshuDocument
  onApplied: (updated: CeshuDocument, appliedChapters: number) => void
  onClose: () => void
}

export default function AiFullGeneratePanel({ ceshuId, doc, onApplied, onClose }: AiFullGeneratePanelProps) {
  const [gameName, setGameName] = useState(() => readText(doc.meta.game_name))
  const [gameType, setGameType] = useState(() => {
    const value = readText(doc.meta.game_type)
    return FULL_GEN_GAME_TYPES.includes(value) ? value : 'RPG'
  })
  const [style, setStyle] = useState('仙侠')
  const [businessModel, setBusinessModel] = useState('F2P')
  const [references, setReferences] = useState('')
  const [platforms, setPlatforms] = useState<string[]>(['PC'])
  const [description, setDescription] = useState('')
  const [scope, setScope] = useState<GddScope>(() => getGddScope(doc))
  const [includeMarket, setIncludeMarket] = useState(true)
  const [includeRisk, setIncludeRisk] = useState(true)
  const [statuses, setStatuses] = useState<Partial<Record<ChapterKey, ChapterStatus>>>({})
  const [errors, setErrors] = useState<Partial<Record<ChapterKey, string>>>({})
  const [results, setResults] = useState<Partial<Record<ChapterKey, ChapterData>>>({})
  /** 每章 LLM-as-Judge 辅助结论（v1.0 DD-19 剩余项）；null = 该章未获评审（调用失败/降级） */
  const [judges, setJudges] = useState<Partial<Record<ChapterKey, LlmJudgeVerdict | null>>>({})
  const [running, setRunning] = useState(false)
  const [applying, setApplying] = useState(false)
  const [summary, setSummary] = useState<string | null>(null)
  const [panelError, setPanelError] = useState<string | null>(null)
  /** 整篇生成的累计 token 花费（v0.6 M5：成本护栏的观测数据） */
  const [usageTotal, setUsageTotal] = useState(0)
  /** 整篇生成的内联确认态（v0.5 DD-17：大范围云端调用需先确认） */
  const [confirming, setConfirming] = useState(false)
  const stopRef = useRef(false)
  const resultsRef = useRef<Partial<Record<ChapterKey, ChapterData>>>({})
  const judgesRef = useRef<Partial<Record<ChapterKey, LlmJudgeVerdict | null>>>({})

  const plan = useMemo(
    () =>
      buildFullGeneratePlan(
        { gameName, gameType, style, description, references, platforms, businessModel },
        { scope, includeMarket: includeMarket && scope === GDD_SCOPE_FULL, includeRisk: includeRisk && scope === GDD_SCOPE_FULL }
      ),
    [gameName, gameType, style, description, references, platforms, businessModel, scope, includeMarket, includeRisk]
  )

  const failedChapters = plan.order.filter((chapter) => statuses[chapter] === 'failed')
  const appliedCount = plan.order.filter((chapter) => results[chapter] !== undefined).length
  const locked = running || applying

  /** 逐章生成：单章失败记录并继续；首章即失败（本地服务不可用等）中断并汇总 */
  const runChapters = async (targets: ChapterKey[]): Promise<void> => {
    if (targets.length === 0) return
    setRunning(true)
    setPanelError(null)
    setSummary(null)
    setUsageTotal(0)
    stopRef.current = false
    const draftResults: Partial<Record<ChapterKey, ChapterData>> = { ...resultsRef.current }
    const draftJudges: Partial<Record<ChapterKey, LlmJudgeVerdict | null>> = { ...judgesRef.current }
    let succeeded = 0
    let failed = 0
    let usageAcc = 0
    for (const chapter of targets) {
      if (stopRef.current) break
      setStatuses((prev) => ({ ...prev, [chapter]: 'running' }))
      try {
        const response = await window.mbApi.ceshu.aiGenerateChapter({
          id: ceshuId,
          chapter,
          onlyEmpty: false,
          fullGenerate: {
            styleKey: plan.styleKey,
            extraPrompt: plan.chapterPrompts[chapter] ?? '',
            draft: buildDraftPayload(plan, draftResults)
          },
          confirmed: true
        })
        if (Object.keys(response.fields).length === 0) {
          throw new Error('AI 未返回有效内容')
        }
        draftResults[chapter] = response.fields
        // v1.0 DD-19 剩余项：收集每章 judge（确定性门已含在 response.quality，judge 是其辅助维度）
        draftJudges[chapter] = response.quality?.judge ?? null
        resultsRef.current = { ...draftResults }
        judgesRef.current = { ...draftJudges }
        setResults({ ...draftResults })
        setJudges({ ...draftJudges })
        usageAcc += response.usage?.totalTokens ?? 0
        setUsageTotal(usageAcc)
        setStatuses((prev) => ({ ...prev, [chapter]: 'done' }))
        setErrors((prev) => withoutKey(prev, chapter))
        succeeded++
      } catch (error) {
        const message = toErrorMessage(error)
        setStatuses((prev) => ({ ...prev, [chapter]: 'failed' }))
        setErrors((prev) => ({ ...prev, [chapter]: message }))
        failed++
        if (succeeded === 0) {
          // 首章即失败：大概率本地模型服务不可用，不再逐个重试后续章节
          setSummary(`生成中断：${message}`)
          setRunning(false)
          return
        }
      }
    }
    setRunning(false)
    if (stopRef.current) {
      setSummary(`已停止生成：本次完成 ${succeeded} 章${failed > 0 ? `，失败 ${failed} 章` : ''}`)
      return
    }
    if (failed > 0) {
      setSummary(`本次完成 ${succeeded} 章，失败 ${failed} 章；可点「重试失败章节」补齐，或直接「全部应用并保存」。`)
    } else {
      setSummary(`本次完成 ${succeeded} 章，可点「全部应用并保存」写入当前策划书。`)
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
      setPanelError('请填写简要描述，便于 AI 生成有针对性的内容。')
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
    setErrors({})
    const initial: Partial<Record<ChapterKey, ChapterStatus>> = {}
    for (const chapter of plan.order) initial[chapter] = 'pending'
    setStatuses(initial)
    await runChapters(plan.order)
  }

  const handleRetry = async (): Promise<void> => {
    await runChapters(failedChapters)
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
        } else if (chapter === 'systems') {
          data = mergeSystems(updated.systems, generated)
        } else {
          data = { ...updated[chapter], ...generated }
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
      setSummary(`已应用并保存 ${chapters.length} 章到当前策划书。`)
      onApplied(updated, chapters.length)
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
        <span className="chapter-form-title">AI 一键生成完整策划书</span>
        <button type="button" className="btn" data-testid="ai-full-close" disabled={locked} onClick={onClose}>
          关闭
        </button>
      </div>

      <div className="changelog-entry">
        <div className="form-label">项目信息（填写简要描述，AI 将按依赖顺序逐章生成）</div>
        <div className="ai-gen-row">
          <span className="form-label">游戏名称</span>
          <input
            className="form-input"
            data-testid="ai-full-name"
            value={gameName}
            disabled={locked}
            placeholder="如：星河战记"
            onChange={(event) => setGameName(event.target.value)}
          />
          <span className="form-label">游戏类型</span>
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
        </div>
        <div className="ai-gen-row">
          <span className="form-label">风格</span>
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
          <span className="form-label">商业模式</span>
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
          <span className="form-label">参考游戏</span>
          <input
            className="form-input"
            data-testid="ai-full-refs"
            value={references}
            disabled={locked}
            placeholder="可选，逗号分隔，如：原神, 艾尔登法环"
            onChange={(event) => setReferences(event.target.value)}
          />
        </div>
        <div className="ai-gen-row">
          <span className="form-label">目标平台</span>
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
          <span className="form-label">简要描述（3-5 句话描述游戏概念）</span>
          <textarea
            className="form-input"
            data-testid="ai-full-desc"
            rows={4}
            value={description}
            disabled={locked}
            placeholder="例：一款仙侠题材的开放世界 RPG，玩家扮演修真者探索三界，通过修炼境界、收集法宝对抗魔族入侵。"
            onChange={(event) => setDescription(event.target.value)}
          />
        </div>
      </div>

      <div className="changelog-entry">
        <div className="form-label">生成范围</div>
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
            标准版（文档信息 + 9 章）
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
            专业版（文档信息 + 16 章）
          </label>
          <label className="ai-gen-check">
            <input
              type="checkbox"
              data-testid="ai-full-market"
              checked={includeMarket}
              disabled={locked || scope === GDD_SCOPE_LITE}
              onChange={(event) => setIncludeMarket(event.target.checked)}
            />
            含市场分析
          </label>
          <label className="ai-gen-check">
            <input
              type="checkbox"
              data-testid="ai-full-risk"
              checked={includeRisk}
              disabled={locked || scope === GDD_SCOPE_LITE}
              onChange={(event) => setIncludeRisk(event.target.checked)}
            />
            含风险评估
          </label>
        </div>
      </div>

      <div className="changelog-entry">
        <div className="form-label">生成进度（共 {plan.order.length} 章，按依赖顺序生成）</div>
        <div data-testid="ai-full-progress">
          {plan.order.map((chapter) => {
            const status = statuses[chapter] ?? 'pending'
            return (
              <div className={`ai-gen-status ${status}`} key={chapter} data-testid={`ai-full-status-${chapter}`}>
                <span className="ai-gen-status-label">{CHAPTER_LABELS[chapter]}</span>
                <span className={`ai-gen-status-value ${status}`}>{STATUS_LABELS[status]}</span>
                {status === 'done' && judges[chapter] && (
                  <span
                    className={`ai-full-judge-badge ${judges[chapter]!.toxicity}`}
                    data-testid={`ai-full-judge-${chapter}`}
                  >
                    judge：{judges[chapter]!.toxicity === 'flagged' ? '⚠合规风险' : '合规'}
                    {judges[chapter]!.score > 0 ? ` / ${judges[chapter]!.score}分` : ''}
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
              整篇生成将连续调用 {plan.order.length} 次云端模型，耗时较长且 token 消耗较高，确认开始？
            </span>
            <button
              type="button"
              className="btn primary"
              data-testid="ai-full-confirm-yes"
              disabled={locked}
              onClick={() => void handleStart()}
            >
              确认生成
            </button>
            <button
              type="button"
              className="btn"
              data-testid="ai-full-confirm-no"
              onClick={() => setConfirming(false)}
            >
              取消
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
          开始生成
        </button>
        {running && (
          <button
            type="button"
            className="btn"
            data-testid="ai-full-stop"
            onClick={() => {
              stopRef.current = true
            }}
          >
            停止
          </button>
        )}
        <button
          type="button"
          className="btn"
          data-testid="ai-full-retry"
          disabled={locked || failedChapters.length === 0}
          onClick={() => void handleRetry()}
        >
          重试失败章节
        </button>
        <button
          type="button"
          className="btn"
          data-testid="ai-full-apply"
          disabled={locked || appliedCount === 0}
          onClick={() => void handleApply()}
        >
          全部应用并保存
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
              本次花费 {usageTotal} token（预算 {budget}）
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
      {/* v1.0 DD-19 剩余项：judge 辅助评审聚合（确定性门为主，judge 为辅，不覆盖 blocking/scoreDelta） */}
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
                本次 {entries.length} 章均未获得 judge 评审（评审调用失败/降级），不影响主生成。
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
          .map((chapter) => CHAPTER_LABELS[chapter])
        return (
          <div className="ai-full-judge" data-testid="ai-full-judge">
            <div className="ai-full-judge-head">AI 辅助评审（judge · 仅供参考，不覆盖确定性质量门）</div>
            {flaggedChapters.length > 0 && (
              <div className="ai-full-judge-warn">
                ⚠️ {flaggedChapters.length} 章被判存在合规风险：{flaggedChapters.join('、')}，建议人工复核后再发布
              </div>
            )}
            <div className="ai-full-judge-stats">
              可读性均值 {avgReadability}/10 · 创意均值 {avgCreativity}/10 · 已评审 {judged.length}/{entries.length} 章
              {unjudged > 0 ? `（${unjudged} 章未获评审）` : ''}
            </div>
          </div>
        )
      })()}
    </div>
  )
}

/** 草稿载荷：已生成章节 + meta 种子（meta 种子在先，生成结果覆盖），供后续章节提示词上下文 */
function buildDraftPayload(
  plan: FullGeneratePlan,
  results: Partial<Record<ChapterKey, ChapterData>>
): Record<string, ChapterData> {
  const draft: Record<string, ChapterData> = {}
  for (const [key, value] of Object.entries(results)) {
    if (value) draft[key] = value
  }
  draft.meta = { ...plan.metaSeed, ...(results.meta ?? {}) }
  return draft
}

/** systems 章合并：逐系统浅合并（保留既有 enabled/name/config），与 Python _apply_chapter_to_model 一致 */
function mergeSystems(current: ChapterData, generated: ChapterData): ChapterData {
  const merged: ChapterData = { ...current }
  for (const [key, value] of Object.entries(generated)) {
    if (!isPlainObject(value)) continue
    const existing = merged[key]
    merged[key] = isPlainObject(existing) ? { ...existing, ...value } : value
  }
  return merged
}

function withoutKey<T>(record: Partial<Record<ChapterKey, T>>, key: ChapterKey): Partial<Record<ChapterKey, T>> {
  const next = { ...record }
  delete next[key]
  return next
}

