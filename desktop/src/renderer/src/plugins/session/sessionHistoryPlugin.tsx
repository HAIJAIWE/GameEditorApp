import { useEffect, useState, type ReactElement } from 'react'

import type { PluginHost } from '../../../../shared/plugin/host'
import type { PluginManifest } from '../../../../shared/plugin/types'
import { registerReactBinding, type PanelBindingProps } from '../host'

/**
 * 会话历史检索（#25，对齐 dsh session-search）。
 *
 * 渲染进程插件：经 `window.mbApi.agent` 调用 `sessionTurns`（聚合 turns.jsonl）与 `draftList`
 * （既有草稿），提供搜索框过滤 + 点击草稿只读回看。零新 IPC 之外的依赖——只用既有 agent IPC。
 *
 * 与「插件市场」同构：`command` + `sidebar` + `panel` 三件套，富 UI 外置为 reactBinding。
 */
export function defineSessionHistoryPlugin(_host: PluginHost): PluginManifest {
  registerReactBinding('sessionHistory.panel', (props: PanelBindingProps) => (
    <SessionHistoryPanel {...props} />
  ))
  return {
    id: 'session-history',
    name: 'session-history',
    version: '0.1.0',
    description: '会话历史检索：列出会话/草稿，按内容搜索，点击草稿只读回看',
    meta: {
      label: '会话历史',
      icon: 'clock',
      description: '检索历史会话与草稿，按内容搜索并回看'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'sessionHistory.open',
        label: '会话历史',
        run: () => _host.openPanel('sessionHistory.panel')
      },
      {
        kind: 'sidebar',
        id: 'sessionHistory.sidebar',
        order: 910,
        items: [{ key: 'session-history', label: '会话历史', icon: 'clock', command: 'sessionHistory.open' }]
      },
      {
        kind: 'panel',
        id: 'sessionHistory.panel',
        title: '会话历史',
        ui: { type: 'text', text: '会话历史' }
      }
    ]
  }
}

interface DraftItem {
  name: string
  time: string
  messageCount: number
  path: string
}

interface SessionItem {
  sessionId: string
  title: string
  firstMessage: string
  messageCount: number
  turnCount: number
  lastActivity: number
}

function SessionHistoryPanel(props: PanelBindingProps): ReactElement {
  const { onClose } = props
  const [query, setQuery] = useState('')
  const [sessions, setSessions] = useState<SessionItem[]>([])
  const [drafts, setDrafts] = useState<DraftItem[]>([])
  const [detail, setDetail] = useState<{ name: string; messages: Array<Record<string, unknown>> } | null>(null)
  const [loading, setLoading] = useState(false)

  // 拉会话历史（服务端按 query 过滤）与草稿列表
  useEffect(() => {
    let cancelled = false
    const load = async (): Promise<void> => {
      setLoading(true)
      try {
        const [turnsRes, draftRes] = await Promise.all([
          window.mbApi.agent.sessionTurns({ query: query || undefined }),
          window.mbApi.agent.draftList()
        ])
        if (cancelled) return
        setSessions(turnsRes.sessions as SessionItem[])
        // 草稿按名称过滤（客户端，名称不含首消息体）
        const q = query.trim().toLowerCase()
        setDrafts((draftRes as DraftItem[]).filter((d) => q === '' || d.name.toLowerCase().includes(q)))
      } catch {
        // 拉取失败（主进程不可用等）静默，列表保持上次内容
      } finally {
        if (!cancelled) setLoading(false)
      }
    }
    void load()
    return () => {
      cancelled = true
    }
  }, [query])

  const openDraft = async (path: string, name: string): Promise<void> => {
    try {
      const res = await window.mbApi.agent.draftLoad({ path })
      setDetail({ name, messages: res.messages as Array<Record<string, unknown>> })
    } catch {
      // 草稿读取失败（文件被删/损坏）静默，列表已展示
    }
  }

  return (
    <div className="panel session-history">
      <div className="panel-header">
        <h3>会话历史</h3>
        <button type="button" className="btn" onClick={onClose}>
          关闭
        </button>
      </div>

      <div className="session-history-search">
        <input
          type="search"
          placeholder="搜索会话内容 / 草稿名…"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
        {loading && <span className="session-history-loading">加载中…</span>}
      </div>

      <div className="session-history-body">
        <section>
          <h4>历史会话（{sessions.length}）</h4>
          {sessions.length === 0 ? (
            <p className="session-history-empty">暂无历史会话记录</p>
          ) : (
            <ul className="session-history-list">
              {sessions.map((s) => (
                <li key={s.sessionId} className="session-history-item">
                  <span className="session-history-title">{s.title}</span>
                  <span className="session-history-meta">
                    {s.messageCount} 条 · {s.turnCount} 轮 · {formatActivity(s.lastActivity)}
                  </span>
                  <span className="session-history-snippet">{s.firstMessage.slice(0, 80)}</span>
                </li>
              ))}
            </ul>
          )}
        </section>

        <section>
          <h4>草稿（{drafts.length}）</h4>
          {drafts.length === 0 ? (
            <p className="session-history-empty">暂无草稿</p>
          ) : (
            <ul className="session-history-list">
              {drafts.map((d) => (
                <li key={d.path} className="session-history-item session-history-draft">
                  <button type="button" className="btn-link" onClick={() => void openDraft(d.path, d.name)}>
                    {d.name}
                  </button>
                  <span className="session-history-meta">
                    {d.time} · {d.messageCount} 条
                  </span>
                </li>
              ))}
            </ul>
          )}
        </section>

        {detail && (
          <section className="session-history-detail">
            <h4>草稿回看：{detail.name}</h4>
            <button type="button" className="btn" onClick={() => setDetail(null)}>
              收起
            </button>
            <ol className="session-history-messages">
              {detail.messages.map((message, index) => (
                <li key={index}>
                  <span className="session-history-role">[{String(message.role)}]</span>{' '}
                  {typeof message.content === 'string' ? message.content.slice(0, 300) : JSON.stringify(message.content)}
                </li>
              ))}
            </ol>
          </section>
        )}
      </div>
    </div>
  )
}

function formatActivity(timestamp: number): string {
  if (!timestamp) return '—'
  const date = new Date(timestamp * 1000)
  const pad = (value: number): string => String(value).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}
