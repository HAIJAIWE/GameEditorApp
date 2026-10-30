import { useEffect, useMemo, useState } from 'react'

import {
  buildToolCatalog,
  emptyToolCatalog,
  filterToolViews,
  summarizeCatalog,
  type ToolCatalog
} from '../../../shared/agent/ui/agentEditor'
import { toErrorMessage } from '../../../shared/util/errors'

/**
 * 智能体编辑器（对齐 旧版 `src/ui/ai_bridge:93` `open_agent_editor` 的入口 +
 * `src/ui/widgets/team_dialog` 的「工具汇总」这一块）。
 *
 * ## 为什么只做工具清单，不做「团队 & 智能体管理」
 *
 * 旧版 的 TeamDialog 有两半，TS 侧的数据支撑完全不同。逐条判定见
 * `shared/agentEditor.ts` 顶部的范围判定表（那里列了 `team_dialog` 的行号依据）。要点：
 *
 * - **不做团队 CRUD / 成员勾选 / 成员级提示词与工具覆盖 / 自定义智能体增删改 / 团队模式切换**
 *   —— 它们全部依赖 `core/agent/agents/agent_manager` 的 `AgentManager`
 *   （`Team` 类型 + `teams.json` + `DEFAULT_AGENTS`）。TS 侧**这些一个都没有**，
 *   且 `AgentBrainService.chat()` 不读任何团队状态，改了没有消费者。
 *   做成能点能存但没人读的界面 = 假控件，比不做严重得多。
 * - **做工具清单 + 风险可见** —— 数据源是**真实已注册**的技能：
 *   IPC `agent:listTools`（`main/ipc.ts:260` → `SkillDispatcher.toolsJsonSchema()`）。
 *   风险等级走 `shared/agent/protocol.ts` 的 `TOOL_RISK_MAP`，
 *   与调度器执行时用的 `resolveRiskLevel`（`dispatcher.ts:212`）**同源**，
 *   所以面板说的「需二次确认」就是运行时真实会发生的事。
 *
 * ## 与 旧版 的差异
 *
 * - 不移植 `team_dialog:369-389` 的 `desc_map`：那是 旧版 侧硬编码的工具描述表，
 *   且列了 `system.git` / `system.shell` 等 TS 侧**未注册**的工具。描述一律取 `skill.description`。
 * - 不显示「某工具被禁止执行」：`checkPermission` 的 `allowed: false` 分支在
 *   `dispatcher.execute` 里**根本没被调用**，显示它等于报告一个运行时不存在的事实。
 *
 * ## 组件约定
 *
 * 浮层头部（`App.tsx` 的 `.panel-overlay-header`）已统一提供「关闭」按钮，
 * 故本组件**不接 `onClose` prop**（避免出现未使用参数）。
 */
type LoadState =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; catalog: ToolCatalog }

export default function AgentEditorPanel() {
  const [state, setState] = useState<LoadState>({ status: 'loading' })
  const [query, setQuery] = useState('')
  const [onlyRisky, setOnlyRisky] = useState(false)

  // 每次打开都重新拉一次：用户可能刚装/卸技能，工具集是活的
  useEffect(() => {
    let alive = true
    void window.mbApi.agent
      .listTools()
      .then((res) => {
        if (!alive) return
        setState({ status: 'ready', catalog: buildToolCatalog(res.tools) })
      })
      .catch((error: unknown) => {
        if (!alive) return
        setState({ status: 'error', message: toErrorMessage(error) })
      })
    return () => {
      alive = false
    }
  }, [])

  // 派生值用惰性表达式 + useMemo，不在 render 里 setState
  const catalog = state.status === 'ready' ? state.catalog : emptyToolCatalog()
  const visible = useMemo(() => filterToolViews(catalog.tools, { query, onlyRisky }), [catalog.tools, query, onlyRisky])
  const filtered = visible.length !== catalog.tools.length

  return (
    <div className="changelog-panel" data-testid="agent-editor-panel">
      <div className="changelog-header">
        <div className="editor-title">
          智能体可用能力
          <small data-testid="agent-editor-summary">
            {state.status === 'loading'
              ? '正在读取调度器已注册技能…'
              : state.status === 'error'
                ? '读取失败'
                : summarizeCatalog(state.catalog)}
          </small>
        </div>
      </div>

      <div className="list-toolbar">
        <input
          className="form-input search-input"
          type="search"
          placeholder="搜索工具名 / 描述 / 动作…"
          value={query}
          data-testid="agent-editor-search"
          onChange={(event) => setQuery(event.target.value)}
        />
        <label className="check-option" data-testid="agent-editor-only-risky">
          <input type="checkbox" checked={onlyRisky} onChange={(event) => setOnlyRisky(event.target.checked)} />
          只看需二次确认
        </label>
      </div>

      {state.status === 'loading' && <div className="empty">正在读取调度器已注册技能…</div>}

      {state.status === 'error' && (
        <div className="form-error" data-testid="agent-editor-error">
          读取工具清单失败：{state.message}
        </div>
      )}

      {state.status === 'ready' && catalog.toolCount === 0 && (
        <div className="empty" data-testid="agent-editor-empty">
          调度器当前没有注册任何技能，AI 助手无法调用工具。
        </div>
      )}

      {state.status === 'ready' && catalog.toolCount > 0 && (
        <div className="form-section" data-testid="agent-editor-tools">
          <div className="form-section-head">
            <span className="form-section-title">
              工具清单
              {filtered && `（筛选出 ${visible.length} / ${catalog.toolCount}）`}
            </span>
          </div>
          <div className="form-section-body">
            {visible.length === 0 ? (
              <div className="empty" data-testid="agent-editor-no-match">
                没有匹配的工具。
              </div>
            ) : (
              visible.map((tool) => (
                <div className="form-row" key={tool.id} data-testid={`agent-editor-tool-${tool.id}`}>
                  <div className="form-label">{tool.id}</div>
                  <div className="desc-field">
                    {tool.description !== '' ? tool.description : '（该技能未提供描述）'}
                    <div className="item-meta">
                      {tool.namespaceLabel} · 最高风险 {tool.highestRiskLabel}
                      {tool.needsConfirmation ? ' · 需二次确认' : ''}
                    </div>
                    {tool.actions.length > 0 && (
                      <div className="item-meta" data-testid={`agent-editor-actions-${tool.id}`}>
                        动作：
                        {tool.actions.map((action) => (
                          <span
                            key={action.action}
                            data-testid={`agent-editor-action-${tool.id}-${action.action}`}
                            data-risk={action.riskLabel}
                          >
                            {action.action}（{action.riskLabel}）
                            {action.needsConfirmation ? ' ⚠' : ''}
                          </span>
                        ))}
                      </div>
                    )}
                    {tool.params.length > 0 && (
                      <div className="item-meta">
                        参数：
                        {tool.params.map((param) => (
                          <span key={param.name} data-testid={`agent-editor-param-${tool.id}-${param.name}`}>
                            {param.required ? `${param.name}*` : param.name}
                            {param.enumValues.length > 0 ? `(${param.enumValues.join('|')})` : ''}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}

      <div className="notice-banner" data-testid="agent-editor-scope-note">
        本面板只展示调度器<strong>当前真实注册</strong>的工具与风险等级。
        旧版 侧的「团队 & 智能体管理」（团队增删改、成员勾选、成员级提示词与工具覆盖、自定义智能体、
        团队/个人模式切换）在 TS 侧尚无数据层与消费者，故未移植——详见
        <code> src/shared/agentEditor.ts </code>顶部的范围判定表。
      </div>
    </div>
  )
}
