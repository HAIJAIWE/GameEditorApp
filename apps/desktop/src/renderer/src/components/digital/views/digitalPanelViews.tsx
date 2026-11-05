import { useState, type ReactNode } from 'react'

import { useT } from '@mobai/client-ui'
import { LucideIcon } from '../../common'
import { type MessageKey, type TranslateParams } from '@mobai/shared/i18n'
import type { LucideIconName } from '@mobai/shared/util/ui'
import { diffRows, diffTotals, errorSummary, formatToolArgs } from '@mobai/shared/agent/tools'
import { type DigitalPanelState, type DigitalStep } from '@mobai/shared/agent/ui'
import { AttachmentLightbox } from '../chat/DigitalMessageItem'
import { JsonTree } from './JsonTree'

/** 步骤图标（按 kind）：让「思考 / 批量 / 工具」一眼可分（Lucide 单色线稿，零 emoji） */
const STEP_ICONS: Record<DigitalStep['kind'], LucideIconName> = {
  think: 'brain',
  batch: 'package',
  tool: 'wrench'
}

/**
 * 工具结果视图（对齐 dsh `tool.call.toolview` 的 keyed 分派）：
 * 按工具名把结果交给不同渲染器；未注册的走通用文本。
 */
type ToolView = (step: DigitalStep) => ReactNode

/** 外部（插件 keyed slot）提供的工具视图解析器：命中则覆盖内置视图 */
export type ToolViewResolver = (tool: string) => ToolView | undefined

function textView(step: DigitalStep): ReactNode {
  return <div className="digital-step-result">{step.result ?? ''}</div>
}

/** 代码类：等宽块 */
function codeView(step: DigitalStep): ReactNode {
  return <pre className="digital-step-code">{step.result ?? ''}</pre>
}

/** JSON 优先：能解析就美化，否则退回纯文本（MCP 工具常用） */
function jsonView(step: DigitalStep): ReactNode {
  const raw = step.result ?? ''
  try {
    const parsed: unknown = JSON.parse(raw)
    // 树形折叠 + 节点上限：MCP 工具可能回几百 KB JSON，全量 stringify 会卡住渲染
    return <JsonTree value={parsed} rawClassName="digital-step-code" />
  } catch {
    return textView(step)
  }
}

const TOOL_VIEWS: Record<string, ToolView> = {
  'system.code': codeView,
  'system.game_data': jsonView
}

function resolveToolView(tool: string): ToolView {
  const exact = TOOL_VIEWS[tool]
  if (exact !== undefined) return exact
  if (tool.startsWith('mcp.')) return jsonView
  return textView
}

/**
 * 工具变体（借 dsh `ui-tool` 的 variant 思路）：决定前导图标与配色。
 * dsh 用 `ui-primitives` 的图标包；我们保持零依赖，用内联线性 SVG。
 */
type ToolVariant = 'search' | 'read' | 'bash' | 'code' | 'data' | 'doc' | 'api' | 'others'

function toolVariant(tool: string): ToolVariant {
  if (tool.includes('session_search') || tool.includes('search')) return 'search'
  if (tool.includes('game_data')) return 'data'
  if (tool.includes('ceshu')) return 'doc'
  if (tool.includes('code')) return 'code'
  if (tool.includes('shell') || tool.includes('terminal')) return 'bash'
  if (tool.startsWith('mcp.')) return 'api'
  return 'others'
}

/** 前导线性图标（15px，随文字色；不引 dsh 图标包） */
function ToolIcon({ variant }: { variant: ToolVariant }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  }
  switch (variant) {
    case 'search':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" />
        </svg>
      )
    case 'data':
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
          <path d="M2.5 6.5h11M6.5 6.5V13" />
        </svg>
      )
    case 'doc':
      return (
        <svg {...common}>
          <path d="M4 2.5h5l3 3v8H4z" />
          <path d="M9 2.5v3h3M6 9h4M6 11h3" />
        </svg>
      )
    case 'code':
      return (
        <svg {...common}>
          <path d="M6 5 3 8l3 3M10 5l3 3-3 3" />
        </svg>
      )
    case 'bash':
      return (
        <svg {...common}>
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M4.5 6.5 6.5 8l-2 1.5M8 10h3" />
        </svg>
      )
    case 'api':
      return (
        <svg {...common}>
          <path d="M6 2.5v3M10 2.5v3M4 5.5h8v3a4 4 0 0 1-8 0z" />
          <path d="M8 12.5v1" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <path d="M8 2.5l1.6 3.4 3.4 1.6-3.4 1.6L8 12.5 6.4 9.1 3 7.5l3.4-1.6z" />
        </svg>
      )
  }
}

/** 折叠态摘要：think/batch 给固定文案，tool 取结果首行（失败时取错误行），截断 */
function stepSummary(step: DigitalStep, t: TFn): string {
  if (step.kind === 'think') return step.status === 'running' ? t('agent.step.thinking') : ''
  if (step.kind === 'batch') return step.status === 'running' ? t('agent.step.parallel') : ''
  // 失败行挑「像错误」的那行（首行常常只是 `Command failed with exit code 1`）
  const first = step.status === 'failed' ? errorSummary(step.result) : ((step.result ?? '').trim().split('\n')[0] ?? '')
  if (first === '') return ''
  return first.length > 56 ? `${first.slice(0, 56)}…` : first
}

/** 绑定语言的便捷类型（与 `translate.translator` 返回值一致） */
type TFn = (key: MessageKey, params?: TranslateParams) => string

/** 参数摘要：美化后的 JSON 多行，摘要必须是单行，故把空白折成一个空格 */
function argsSummary(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat
}

/**
 * 单步卡片：默认展开（结果可见），点头部折叠（借 dsh ui-tool 的 ToolRow 设计）。
 *
 * 展开体按 dsh `ToolDetails` 分段：先「参数」（默认折叠，避免长 JSON 顶掉结果），
 * 再「输出」（diff 输出走行级配色，其余走工具视图）。
 */
function ToolStepCard({ step, resolveView }: { step: DigitalStep; resolveView?: ToolViewResolver }) {
  const [expanded, setExpanded] = useState(true)
  const [argsOpen, setArgsOpen] = useState(false)
  // 工具返回的图像（来自 SkillResult.images，data URL）：聊天卡内联缩略图条（对齐 dsh `tool.call.images` 槽）
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(null)
  const images = step.images ?? []
  const args = formatToolArgs(step.args)
  const hasResult = step.result !== undefined && step.result !== ''
  const hasBody = hasResult || args.text !== '' || images.length > 0
  // 插件 keyed slot 优先，其次内置按工具名分派
  const view = resolveView?.(step.tool) ?? resolveToolView(step.tool)
  const t = useT()
  const variant = toolVariant(step.tool)
  const summary = stepSummary(step, t)
  const diff = hasResult ? diffRows(step.result) : null
  // 行头的 `+N −M`（借 dsh ToolRow 的 diffAdded/diffRemoved）：折叠时也能看出改了多少
  const totals = diff !== null ? diffTotals(diff) : null
  return (
    <li
      className={`digital-step digital-step-card digital-step-${step.status}`}
      data-testid="digital-step"
      data-status={step.status}
      data-kind={step.kind}
      data-variant={variant}
    >
      <button
        type="button"
        className="digital-step-head"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="digital-step-icon" aria-hidden="true">
          {step.kind === 'tool' ? <ToolIcon variant={variant} /> : <LucideIcon name={STEP_ICONS[step.kind]} size={14} />}
        </span>
        <span className="digital-step-tool">{step.tool}</span>
        {summary !== '' && (
          <span
            className={`digital-step-summary${step.status === 'failed' ? ' is-error' : ''}${
              step.status === 'running' ? ' is-shimmer' : ''
            }`}
          >
            {summary}
          </span>
        )}
        {totals !== null && (totals.added > 0 || totals.removed > 0) && (
          <span className="digital-step-diff-total" data-testid="digital-step-diff-total">
            {totals.added > 0 && <span className="is-add">+{totals.added}</span>}
            {totals.removed > 0 && <span className="is-del">−{totals.removed}</span>}
          </span>
        )}
        <span className={`digital-step-status digital-step-status-${step.status}`}>
          {step.status === 'running' && <span className="digital-step-dot" aria-hidden="true" />}
          {step.status === 'running' ? <span className="is-shimmer">{t('agent.step.running')}</span> : null}
          {step.status === 'done' ? t('agent.step.done') : null}
          {step.status === 'failed' ? t('agent.step.failed') : null}
        </span>
        {hasBody && (
          <span className="digital-step-chevron" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
        )}
      </button>
      {expanded && hasBody && (
        <div className="digital-step-body">
          {args.text !== '' && (
            <div className="digital-step-args" data-testid="digital-step-args">
              <button
                type="button"
                className="digital-step-args-toggle"
                aria-expanded={argsOpen}
                onClick={() => setArgsOpen((value) => !value)}
              >
                <span className="digital-step-body-label">{t('agent.step.argsLabel')}</span>
                {!argsOpen && <span className="digital-step-args-summary">{argsSummary(args.text)}</span>}
                <span className="digital-step-chevron" aria-hidden="true">
                  {argsOpen ? '▾' : '▸'}
                </span>
              </button>
              {argsOpen && (
                <pre className="digital-step-args-pre" data-json={args.isJson || undefined}>
                  {args.text}
                </pre>
              )}
            </div>
          )}
          {hasResult && (
            <>
              <span className="digital-step-body-label">{t('agent.step.outputLabel')}</span>
              {diff !== null ? (
                <pre className="digital-step-diff" data-testid="digital-step-diff">
                  {diff.map((row, index) => (
                    <span key={index} className={`diff-row diff-${row.kind}`}>
                      {row.text}
                    </span>
                  ))}
                </pre>
              ) : (
                view(step)
              )}
            </>
          )}
          {images.length > 0 && (
            <>
              <span className="digital-step-body-label">{t('agent.step.imagesLabel')}</span>
              <div className="digital-step-images" data-testid="digital-step-images">
                {images.map((src, index) => (
                  <button
                    key={index}
                    type="button"
                    className="digital-step-image-thumb"
                    data-testid="digital-step-image-thumb"
                    aria-label={t('agent.step.toolImage', { n: index + 1 })}
                    onClick={() => setLightbox({ src, alt: t('agent.step.toolImage', { n: index + 1 }) })}
                  >
                    <img src={src} alt={t('agent.step.toolImage', { n: index + 1 })} />
                  </button>
                ))}
              </div>
            </>
          )}
        </div>
      )}
      {lightbox !== null && (
        <AttachmentLightbox src={lightbox.src} alt={lightbox.alt} onClose={() => setLightbox(null)} />
      )}
    </li>
  )
}

/** 一轮（turn）的过程分组：对齐 dsh ui-chat 的「轮次过程折叠」 */
function TurnGroup({
  turn,
  steps,
  resolveView
}: {
  turn: number
  steps: DigitalStep[]
  resolveView?: ToolViewResolver
}) {
  const t = useT()
  const [expanded, setExpanded] = useState(true)
  const failed = steps.some((step) => step.status === 'failed')
  return (
    <li className="digital-turn" data-testid="digital-turn" data-turn={turn}>
      <button
        type="button"
        className="digital-turn-head"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="digital-turn-label">{t('agent.step.turn', { n: turn + 1 })}</span>
        <span className="item-meta">
          {t('agent.step.turnMeta', { n: steps.length, failed: failed ? t('agent.step.turnMetaFailed') : '' })}
        </span>
        <span className="digital-step-chevron" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <ol className="digital-turn-steps">
          {steps.map((step, index) => (
            <ToolStepCard key={`${step.order}-${step.tool}-${index}`} step={step} resolveView={resolveView} />
          ))}
        </ol>
      )}
    </li>
  )
}

/**
 * 执行步骤列表（整体折叠由父组件控制；内部按轮次分组，每轮可再折叠）。
 * `resolveView` 为插件 keyed slot 的工具视图解析器（可选；未命中回退内置）。
 */
export function DigitalStepList({
  steps,
  resolveView
}: {
  steps: DigitalPanelState['steps']
  resolveView?: ToolViewResolver
}) {
  // 按 order（轮次）分组：order 相同即同一轮
  const groups: Array<{ turn: number; steps: DigitalStep[] }> = []
  for (const step of steps) {
    const last = groups.at(-1)
    if (last !== undefined && last.turn === step.order) last.steps.push(step)
    else groups.push({ turn: step.order, steps: [step] })
  }
  return (
    <ol className="digital-step-list">
      {groups.map((group) => (
        <TurnGroup key={group.turn} turn={group.turn} steps={group.steps} resolveView={resolveView} />
      ))}
    </ol>
  )
}

// —— 已按能力拆到同目录的独立文件（本文件保留步骤渲染 + 统一出口）——
export { DigitalApproval } from './approval'
export { DigitalSubagentList } from './subagent'
export { DigitalWorkspaceBar } from './workspace'
export { DigitalJobList } from './jobs'
export { DigitalCommandMenu, DigitalReferenceMenu } from './menus'
export { DigitalTaskList } from './tasks'
