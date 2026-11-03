/**
 * 技术设计文档面板（主区页签）：列表 + 章节大纲 + 编辑/预览 + 导出。
 *
 * 数据经 `window.mbApi.techDoc`（主进程复用 `system.tech_doc` 技能，存 `<库>/tech/<name>.md`）。
 * 编辑用 textarea；预览复用数字员工气泡的 `ChatMarkdown`（GFM + 语法高亮）；
 * 章节大纲从 markdown 标题提取，点击切到预览并滚动到对应标题。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useT } from '@mobai/client-ui'

import { ChatMarkdown } from '../digital'

interface TechDocApi {
  list(): Promise<{ docs: string[] }>
  outline(): Promise<{ content: string }>
  read(req: { name: string }): Promise<{ content: string }>
  write(req: { name: string; content: string }): Promise<{ ok: boolean }>
  delete(req: { name: string }): Promise<{ ok: boolean }>
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

interface Heading {
  level: number
  text: string
}

/** 从 markdown 提取标题（`#`~`######`），顺序与预览里的 h1~h6 一致 */
export function parseHeadings(content: string): Heading[] {
  const result: Heading[] = []
  for (const line of content.split('\n')) {
    const match = /^(#{1,6})\s+(.*\S)\s*$/.exec(line)
    if (match !== null) result.push({ level: match[1].length, text: match[2] })
  }
  return result
}

type Mode = 'edit' | 'preview'

export function TechDocPanel() {
  const t = useT()
  const api = getApi()
  const [docs, setDocs] = useState<string[]>([])
  const [active, setActive] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [newName, setNewName] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>('edit')
  const [scrollTick, setScrollTick] = useState(0)
  const [deleteArmed, setDeleteArmed] = useState(false)

  const previewRef = useRef<HTMLDivElement>(null)
  const scrollTargetRef = useRef<number | null>(null)

  const headings = useMemo(() => parseHeadings(content), [content])

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

  // 点击大纲后：预览渲染完成再滚动到目标标题（只操作 DOM，不在 effect 内 setState）
  useEffect(() => {
    if (mode !== 'preview') return
    const target = scrollTargetRef.current
    if (target === null) return
    scrollTargetRef.current = null
    const container = previewRef.current
    if (container === null) return
    const node = container.querySelectorAll('h1, h2, h3, h4, h5, h6')[target]
    if (node !== undefined && typeof node.scrollIntoView === 'function') {
      node.scrollIntoView({ block: 'start' })
    }
  }, [mode, scrollTick])

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
        setDeleteArmed(false)
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
      setNotice(t('techDoc.created'))
      setError('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [api, newName, refresh, t])

  const save = useCallback(async (): Promise<void> => {
    if (api === undefined || active === null) return
    try {
      await api.write({ name: active, content })
      setDirty(false)
      setNotice(t('techDoc.saved'))
      setError('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [api, active, content, refresh, t])

  const exportDoc = useCallback(async (): Promise<void> => {
    if (api === undefined || active === null) return
    try {
      const result = await api.export({ name: active })
      if (result.path !== null) setNotice(t('techDoc.exported', { path: result.path }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [api, active, t])

  /** 删除当前文档（两步确认：先 arm 再确认） */
  const removeDoc = useCallback(async (): Promise<void> => {
    if (api === undefined || active === null) return
    try {
      await api.delete({ name: active })
      setDeleteArmed(false)
      setActive(null)
      setContent('')
      setDirty(false)
      setNotice(t('techDoc.deleted'))
      setError('')
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [api, active, refresh, t])

  /** 点击章节大纲：切预览并滚动到该标题 */
  const jumpToHeading = useCallback((index: number): void => {
    scrollTargetRef.current = index
    setMode('preview')
    setScrollTick((n) => n + 1)
  }, [])

  if (api === undefined) {
    return <div className="empty">{t('techDoc.noApi')}</div>
  }

  return (
    <div className="techdoc" data-testid="techdoc">
      <aside className="techdoc-list">
        <div className="techdoc-list-head">
          <input
            className="form-input"
            data-testid="techdoc-new-name"
            placeholder={t('techDoc.newNamePlaceholder')}
            value={newName}
            onChange={(event) => setNewName(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') void createDoc()
            }}
          />
          <button type="button" className="btn primary" data-testid="techdoc-create" onClick={() => void createDoc()}>
            {t('techDoc.create')}
          </button>
        </div>
        {docs.length === 0 ? (
          <div className="empty">{t('techDoc.empty')}</div>
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
        {headings.length > 0 && (
          <div className="techdoc-outline" data-testid="techdoc-outline">
            <div className="home-section-label">{t('techDoc.outline')}</div>
            {headings.map((heading, index) => (
              <button
                key={`${index}-${heading.text}`}
                type="button"
                className="techdoc-outline-item"
                data-testid="techdoc-outline-item"
                data-level={heading.level}
                style={{ paddingLeft: `${8 + (heading.level - 1) * 10}px` }}
                onClick={() => jumpToHeading(index)}
              >
                {heading.text}
              </button>
            ))}
          </div>
        )}
      </aside>

      <section className="techdoc-editor">
        {active === null ? (
          <div className="empty">{t('techDoc.pickDoc')}</div>
        ) : (
          <>
            <div className="techdoc-toolbar">
              <span className="techdoc-title" data-testid="techdoc-title">
                {active}
                {dirty ? ' *' : ''}
              </span>
              <div className="techdoc-modes" role="group" aria-label={t('techDoc.modeGroup')}>
                <button
                  type="button"
                  className={`btn${mode === 'edit' ? ' primary' : ''}`}
                  data-testid="techdoc-mode-edit"
                  onClick={() => setMode('edit')}
                >
                  {t('techDoc.edit')}
                </button>
                <button
                  type="button"
                  className={`btn${mode === 'preview' ? ' primary' : ''}`}
                  data-testid="techdoc-mode-preview"
                  onClick={() => setMode('preview')}
                >
                  {t('techDoc.preview')}
                </button>
              </div>
              <button type="button" className="btn" data-testid="techdoc-save" onClick={() => void save()}>
                {t('common.save')}
              </button>
              <button type="button" className="btn" data-testid="techdoc-export" onClick={() => void exportDoc()}>
                {t('techDoc.export')}
              </button>
              <button
                type="button"
                className={`btn${deleteArmed ? ' danger' : ''}`}
                data-testid="techdoc-delete"
                onClick={() => {
                  if (deleteArmed) void removeDoc()
                  else setDeleteArmed(true)
                }}
              >
                {deleteArmed ? t('techDoc.confirmDelete') : t('common.delete')}
              </button>
            </div>
            {notice !== '' && <div className="techdoc-notice" data-testid="techdoc-notice">{notice}</div>}
            {error !== '' && <div className="techdoc-error" data-testid="techdoc-error">{error}</div>}
            {mode === 'edit' ? (
              <textarea
                className="techdoc-textarea"
                data-testid="techdoc-textarea"
                value={content}
                onChange={(event) => {
                  setContent(event.target.value)
                  setDirty(true)
                }}
              />
            ) : (
              <div className="techdoc-preview" data-testid="techdoc-preview" ref={previewRef}>
                <ChatMarkdown text={content} />
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}
