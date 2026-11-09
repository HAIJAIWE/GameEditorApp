/**
 * 技术设计文档面板（主区页签）：列表 + 章节大纲 + 编辑/预览 + 导出。
 *
 * 数据经 `window.mbApi.techDoc`（主进程复用 `system.tech_doc` 技能，存 `<库>/tech/<name>.md`）。
 * 编辑用 textarea；预览复用数字员工气泡的 `ChatMarkdown`（GFM + 语法高亮）；
 * 章节大纲从 markdown 标题提取，点击切到预览并滚动到对应标题。
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useT } from '@mobai/client-ui'
import { buildTechDocDraft } from '@mobai/shared/agent/techDoc/techDocDraft'
import { replaceTechDocSection } from '@mobai/shared/agent/techDoc/techDocPrompt'
import { resolveTddDocName } from '@mobai/shared/ceshu/workflow'
import { TECH_DOC_SECTIONS } from '@mobai/shared/agent/techDoc/techDocSchema'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import { getActiveCeshuId } from '../../plugins/host'

import { ChatMarkdown } from '../digital'
import { StateView } from '../common'

interface TechDocApi {
  list(): Promise<{ docs: string[] }>
  outline(): Promise<{ content: string }>
  read(req: { name: string }): Promise<{ content: string }>
  write(req: { name: string; content: string }): Promise<{ ok: boolean }>
  delete(req: { name: string }): Promise<{ ok: boolean }>
  export(req: { name: string }): Promise<{ path: string | null }>
  generate(req: {
    sectionId: string
    name?: string
    extra?: string
    confirmed?: boolean
  }): Promise<{ body: string; sectionId: string; title: string; model: string; usage: unknown }>
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
  /** 首屏加载中：`docs` 初始 `[]`，不分「加载中 / 真的没有」会先闪一下「暂无文档」 */
  const [loading, setLoading] = useState(true)
  const [active, setActive] = useState<string | null>(null)
  const [content, setContent] = useState('')
  const [dirty, setDirty] = useState(false)
  const [newName, setNewName] = useState('')
  const [notice, setNotice] = useState('')
  const [error, setError] = useState('')
  const [mode, setMode] = useState<Mode>('edit')
  const [scrollTick, setScrollTick] = useState(0)
  const [deleteArmed, setDeleteArmed] = useState(false)
  /** 按节生成：选中的节 id（默认第一节「概述与目标」） */
  const [genSection, setGenSection] = useState<string>(TECH_DOC_SECTIONS[0]?.id ?? 'overview')
  /** 按节生成：是否正在等模型返回（生成一节要几十秒，必须锁住按钮并给反馈） */
  const [generating, setGenerating] = useState(false)
  /** 云端超预算时先要一次确认（DD-17）；确认态只对「本次点击的节」有效 */
  const [confirmArmed, setConfirmArmed] = useState(false)

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
        if (!cancelled) {
          setDocs(result.docs)
          setLoading(false)
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err))
          setLoading(false)
        }
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

  /**
   * 从当前策划书生成 TDD 草稿：把 GDD 素材按 TECH_DOC_GDD_INPUTS 映射填进 9 章。
   * 零 LLM（纯素材汇集），复用现有 `techDoc:write`；用户再补实现细节或让 AI 展开。
   */
  const createFromGdd = useCallback(async (): Promise<void> => {
    if (api === undefined) return
    const id = getActiveCeshuId()
    if (id === null) {
      setError(t('techDoc.fromGddNoDoc'))
      return
    }
    try {
      const mb = (window as unknown as {
        mbApi?: { ceshu?: { get(req: { id: string }): Promise<CeshuDocument> } }
      }).mbApi
      const doc = await mb?.ceshu?.get({ id })
      if (doc === undefined) throw new Error(t('techDoc.fromGddNoDoc'))
      // 默认名与派工单同源（`resolveTddDocName`）：派工单让编码智能体写到 `<游戏名>-TDD`，
      // 人在这里点「从策划书生成草稿」若另起一个 `tech-xxxx` 就会变成两份文档各写一半。
      const name = newName.trim() || resolveTddDocName(doc)
      const draft = buildTechDocDraft(doc, name)
      await api.write({ name, content: draft.markdown })
      setNewName('')
      setActive(name)
      setContent(draft.markdown)
      setDirty(false)
      setError('')
      setNotice(
        draft.sourcedFields === 0
          ? t('techDoc.fromGddEmpty')
          : t('techDoc.fromGddOk', { name, count: draft.sourcedFields })
      )
      await refresh()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }, [api, newName, refresh, t])

  /** 切换目标节后确认态失效：确认针对的是「刚才那一节的预估花费」，换节要重新问 */
  const pickSection = useCallback((id: string): void => {
    setGenSection(id)
    setConfirmArmed(false)
  }, [])

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

  /**
   * 按节 AI 生成：**一次只生成一节**。
   *
   * 三个刻意的取舍：
   * 1. 生成的正文用 `replaceTechDocSection` 拼进**当前编辑器里的内容**（不是磁盘上的），
   *    这样用户没保存的编辑不会被吞掉；
   * 2. 拼完只标记 dirty，**不自动写盘**：AI 写的节需要人看一眼再保存；
   * 3. 云端档超预算时主进程会抛确认原因 —— 原样展示，再点一次「确认生成」带 confirmed 重发。
   */
  const generateSection = useCallback(
    async (confirmed: boolean): Promise<void> => {
      if (api === undefined || generating) return
      setGenerating(true)
      setError('')
      try {
        const result = await api.generate({
          sectionId: genSection,
          ...(active !== null ? { name: active } : {}),
          ...(confirmed ? { confirmed: true } : {})
        })
        const next = replaceTechDocSection(content, result.title, result.body)
        setContent(next)
        setDirty(true)
        setMode('edit')
        setNotice(t('techDoc.genDone', { title: result.title, chars: result.body.length }))
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        // 确认门：把「是否确认」交给用户点，而不是在这里静默重发（等于绕过预算护栏）
        const needsConfirm = !confirmed && message.includes('token')
        setConfirmArmed(needsConfirm)
        setError(needsConfirm ? t('techDoc.genConfirm', { message }) : message)
      } finally {
        setGenerating(false)
      }
    },
    [api, active, content, genSection, generating, t]
  )

  /** 点击章节大纲：切预览并滚动到该标题 */
  const jumpToHeading = useCallback((index: number): void => {
    scrollTargetRef.current = index
    setMode('preview')
    setScrollTick((n) => n + 1)
  }, [])

  if (api === undefined) {
    return <StateView kind="error" title={t('techDoc.noApi')} />
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
          <button
            type="button"
            className="btn"
            data-testid="techdoc-create-from-gdd"
            onClick={() => void createFromGdd()}
          >
            {t('techDoc.createFromGdd')}
          </button>
        </div>
        {loading ? (
          <StateView kind="loading" />
        ) : docs.length === 0 ? (
          <StateView kind="empty" title={t('techDoc.empty')} />
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
        {/*
          提示/错误条必须留在编辑区这一列里：原先挂在 `.techdoc` 顶层，而那是 flex 行容器，
          它会被当成第三个列项挤在编辑区右侧，窄面板下直接溢出到右侧栏上面（实测遮住按钮）。
        */}
        {notice !== '' && <div className="techdoc-notice" data-testid="techdoc-notice">{notice}</div>}
        {error !== '' && <div className="techdoc-error" data-testid="techdoc-error">{error}</div>}
        {active === null ? (
          <StateView kind="empty" title={t('techDoc.pickDoc')} />
        ) : (
          <>
            <div className="techdoc-toolbar">
              <span className="techdoc-title" data-testid="techdoc-title">
                {active}
                {dirty ? ' *' : ''}
              </span>
              <span
                className={`item-meta techdoc-dirty${dirty ? ' is-dirty' : ''}`}
                data-testid="techdoc-dirty"
                data-dirty={dirty ? 'true' : 'false'}
              >
                {dirty ? t('techDoc.unsaved') : t('techDoc.saved')}
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
            {/*
              按节生成：一次一节。放在编辑器上方而不是放进工具栏 —— 工具栏已经 5 个按钮，
              生成还多一个「选哪节」+ 可能的「确认」两步，挤进去会看不清当前在生成哪一节。
            */}
            <div className="techdoc-gen-row">
              <label className="techdoc-gen-label" htmlFor="techdoc-gen-section">
                {t('techDoc.genSection')}
              </label>
              <select
                id="techdoc-gen-section"
                className="form-select"
                data-testid="techdoc-gen-section"
                value={genSection}
                onChange={(event) => pickSection(event.target.value)}
                disabled={generating}
              >
                {TECH_DOC_SECTIONS.map((section) => (
                  <option key={section.id} value={section.id}>
                    {section.title}
                  </option>
                ))}
              </select>
              <button
                type="button"
                className={`btn${confirmArmed ? ' primary' : ''}`}
                data-testid="techdoc-gen-run"
                disabled={generating}
                onClick={() => void generateSection(confirmArmed)}
              >
                {generating
                  ? t('techDoc.genRunning')
                  : confirmArmed
                    ? t('techDoc.genConfirmRun')
                    : t('techDoc.genRun')}
              </button>
            </div>
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
