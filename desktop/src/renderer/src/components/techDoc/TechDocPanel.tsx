/**
 * 技术设计文档面板（主区页签）：列表 + 预览/编辑 + 导出。
 *
 * 数据经 `window.mbApi.techDoc`（主进程复用 `system.tech_doc` 技能，存 `<库>/tech/<name>.md`）。
 * 纯产品 UI：新建时预填标准 9 章大纲，编辑后保存，可导出为 .md。
 */

import { useCallback, useEffect, useState } from 'react'

interface TechDocApi {
  list(): Promise<{ docs: string[] }>
  outline(): Promise<{ content: string }>
  read(req: { name: string }): Promise<{ content: string }>
  write(req: { name: string; content: string }): Promise<{ ok: boolean }>
  export(req: { name: string }): Promise<{ path: string | null }>
}

function getApi(): TechDocApi | undefined {
  const api = (window as unknown as { mbApi?: { techDoc?: TechDocApi } }).mbApi
  return api?.techDoc
}

/** 去掉大纲的首个 `# 标题` 行，保留章节正文（新建时接在文档标题后） */
function stripFirstHeading(outline: string): string {
  return outline.replace(/^#[^\n]*\n+/, '').trimStart()
}

export function TechDocPanel() {
  const api = getApi()
  const [docs, setDocs] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [newName, setNewName] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')

  const refresh = useCallback(async (): Promise<void> => {
    if (api === undefined) return
    try {
      const result = await api.list()
      setDocs(result.docs)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [api])

  useEffect(() => {
    if (api === undefined) return
    let cancelled = false
    // 首屏加载：先 await 再 setState（避免 react-hooks/set-state-in-effect）
    void (async () => {
      try {
        const result = await api.list()
        if (!cancelled) setDocs(result.docs)
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      }
    })()
    return () => {
      cancelled = true
    }
  }, [api])

  const openDoc = useCallback(
    async (name: string): Promise<void> => {
      if (api === undefined) return
      try {
        const result = await api.read({ name })
        setActive(name)
        setContent(result.content)
        setDirty(false)
        setNotice('')
        setError('')
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err))
      }
    },
    [api]
  )

  const createDoc = useCallback(async (): Promise<void> => {
    if (api === undefined) return
    const name = newName.trim()
    if (name === '') return
    try {
      const outline = await api.outline()
      const initial = `# ${name}\n\n${stripFirstHeading(outline.content)}\n`
      await api.write({ name, content: initial })
      setNewName('')
      setActive(name)
      setContent(initial)
      setDirty(false)
      setNotice('已新建')
      setError('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [api, newName, refresh])

  const save = useCallback(async (): Promise<void> => {
    if (api === undefined || active === null) return
    try {
      await api.write({ name: active, content })
      setDirty(false)
      setNotice('已保存')
      setError('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [api, active, content, refresh])

  const exportDoc = useCallback(async (): Promise<void> => {
    if (api === undefined || active === null) return
    try {
      const result = await api.export({ name: active })
      if (result.path !== null) setNotice(`已导出：${result.path}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [api, active])

  if (api === undefined) {
    return <div className="empty">当前环境未提供技术设计文档接口。</div>
  }

  return (
    <div className="techdoc" data-testid="techdoc">
      <aside className="techdoc-list">
        <div className="techdoc-list-head">
          <input
            className="form-input"
            data-testid="techdoc-new-name"
            placeholder="新文档名"
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void createDoc()
            }}
          />
          <button type="button" className="btn primary" data-testid="techdoc-create" onClick={() => void createDoc()}>
            新建
          </button>
        </div>
        {docs.length === 0 ? (
          <div className="empty">还没有技术设计文档</div>
        ) : (
          <ul className="techdoc-list-items">
            {docs.map((name) => (
              <li key={name}>
                <button
                  type="button"
                  className={`techdoc-item${active === name ? ' active' : ''}`}
                  data-testid="techdoc-item"
                  data-name={name}
                  onClick={() => void openDoc(name)}
                >
                  {name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </aside>

      <section className="techdoc-editor">
        {active === null ? (
          <div className="empty">选择左侧文档，或新建一个技术设计文档</div>
        ) : (
          <>
            <div className="techdoc-toolbar">
              <span className="techdoc-title" data-testid="techdoc-title">
                {active}
                {dirty ? ' *' : ''}
              </span>
              <button type="button" className="btn" data-testid="techdoc-save" onClick={() => void save()}>
                保存
              </button>
              <button type="button" className="btn" data-testid="techdoc-export" onClick={() => void exportDoc()}>
                导出
              </button>
            </div>
            {notice !== '' && <div className="techdoc-notice" data-testid="techdoc-notice">{notice}</div>}
            {error !== '' && <div className="techdoc-error" data-testid="techdoc-error">{error}</div>}
            <textarea
              className="techdoc-textarea"
              data-testid="techdoc-textarea"
              value={content}
              onChange={(event) => {
                setContent(event.target.value)
                setDirty(true)
              }}
            />
          </>
        )}
      </section>
    </div>
  )
}
