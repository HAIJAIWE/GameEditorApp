import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { useT } from '@mobai/client-ui'
import { translate } from '@mobai/shared/i18n'
import { LucideIcon } from '../common'
import { subscribeCodeViewRequest, takeCodeViewRequest } from '../../plugins/context'
import { getLocalePreference } from '../../localePreference'
import { baseNameOf, formatBytes, isCodeFile, sortEntries, tokenizeCode } from '../../utils/codeView'
import type { FsDirEntry } from '@mobai/shared/ipc'
import './code-panel.css'

/**
 * 代码面板（中间窗口「代码编辑」页签）——**只读**代码查看器。
 *
 * ## 定位与边界
 * 让用户在同一窗口里看代码/配置/Demo 源码，**不替代 VS Code**：不编辑、不保存、
 * 无 LSP。写入是独立议题（见 fsIpc 的注释），做成「能改但改丢」比不做严重。
 *
 * ## 数据来源
 * 主进程 `fs:*` 三道闸（条目数 500 / 文件 512KB / 二进制探测），失败走 reason
 * 不抛异常。目录树懒加载：只有展开过的目录才发起 listDir，结果进 treeCache。
 *
 * ## 版面（对齐 dsh 右栏代码面板）
 * 左树 / 右栏自上而下：文件页签 → 面包屑（右侧工具图标）→ 带行号槽的代码区。
 * 多文件不再是「替换当前内容」，而是页签并存 + 内容按路径缓存。
 */

/** 树节点：路径 + 加载态 + 条目 + 展开态 */
interface TreeNode {
  path: string
  loading: boolean
  entries: FsDirEntry[] | null
  error: string | null
}

/** 单个文件的读取结果（含失败原因，失败不抛异常） */
interface FileBuffer {
  text: string
  reason: string | null
  bytes: number
}

export default function CodePanel(): React.JSX.Element {
  const t = useT()
  const [root, setRoot] = useState<string>('')
  const [tree, setTree] = useState<TreeNode>({ path: '', loading: true, entries: null, error: null })
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  /** 已打开文件（页签顺序即打开顺序）+ 当前激活项 */
  const [openFiles, setOpenFiles] = useState<string[]>([])
  const [activePath, setActivePath] = useState<string>('')
  /** 按路径缓存的内容：切页签直接复用，不必重读 */
  const [buffers, setBuffers] = useState<Record<string, FileBuffer>>({})
  const [pathInput, setPathInput] = useState<string>('')
  const contentRef = useRef<HTMLDivElement>(null)
  /**
   * buffers 的镜像。openFile 需要「这个路径读过没有」这个同步答案，
   * 而 state 在回调闭包里永远是上一次渲染的快照——用 ref 兜住。
   */
  const buffersRef = useRef<Record<string, FileBuffer>>({})

  /** 列目录（结果直接写进树状态） */
  const loadDir = useCallback((path: string): void => {
    setTree((prev) => ({ ...prev, path, loading: true, error: null }))
    void window.mbApi.fs.listDir({ path }).then((res) => {
      setTree({ path: res.path, loading: false, entries: sortEntries(res.entries), error: null })
    }).catch(() => {
      setTree({ path, loading: false, entries: [], error: translate(getLocalePreference(), 'codePanel.readDirFailed') })
    })
  }, [])

  /*
   * 加载根目录（appRoot）并列出。
   * ⚠️ 本 effect 必须声明在 loadDir **之后**：deps 数组 `[loadDir]` 在渲染期求值，
   * 而 loadDir 是 const——写在前面会撞 TDZ（Cannot access before initialization）。
   * 且拿到根目录只是第一步：必须真的发一次 listDir，否则树永远停在「读取中」。
   */
  useEffect(() => {
    let cancelled = false
    void window.mbApi.fs
      .appRoot()
      .then((res) => {
        if (cancelled) return
        setRoot(res.root)
        setPathInput(res.root)
        loadDir(res.root)
      })
      .catch(() => {
        if (!cancelled)
          setTree((prev) => ({ ...prev, loading: false, error: translate(getLocalePreference(), 'codePanel.appRootFailed') }))
      })
    return () => {
      cancelled = true
    }
  }, [loadDir])

  /** 写缓存：null 表示「未知/读取中」（清掉旧值，界面回到 loading 态） */
  const putBuffer = useCallback((path: string, buf: FileBuffer | null): void => {
    const next = { ...buffersRef.current }
    if (buf === null) {
      delete next[path]
    } else {
      next[path] = buf
    }
    buffersRef.current = next
    setBuffers(next)
  }, [])

  /** 读文件（也用于「刷新」：先清缓存再读，界面会短暂回到读取中） */
  const readFile = useCallback((path: string): void => {
    putBuffer(path, null)
    void window.mbApi.fs.readFile({ path }).then((res) => {
      putBuffer(path, { text: res.content, reason: res.reason, bytes: res.bytes })
      // 换文件/刷新后回到顶部：滚动容器是 .code-body（行号槽与代码同在它里面）
      requestAnimationFrame(() => {
        contentRef.current?.scrollTo({ top: 0 })
      })
    }).catch(() => {
      putBuffer(path, { text: '', reason: translate(getLocalePreference(), 'codePanel.readFailed'), bytes: 0 })
    })
  }, [putBuffer])

  /**
   * 打开文件：已开过就只激活页签；没读过才发起读取。
   * （若每次激活都重读，来回切页签会反复闪「读取中…」，而文件内容在查看器里不会变。）
   */
  const openFile = useCallback((path: string): void => {
    setOpenFiles((prev) => (prev.includes(path) ? prev : [...prev, path]))
    setActivePath(path)
    if (buffersRef.current[path] === undefined) readFile(path)
  }, [readFile])

  /*
   * 「在代码面板打开某文件」请求（正文内联文件引用等）：挂载前发出的取一次
   * （不丢首次点击），之后订阅后续请求。本 effect 必须声明在 openFile 之后
   * （deps 数组在渲染期求值，写在前面会撞 TDZ）。
   */
  useEffect(() => {
    const pending = takeCodeViewRequest()
    // 用微任务延后到 effect 之外执行（openFile 会 setState，直接同步调用会触发 set-state-in-effect）
    if (pending !== null) queueMicrotask(() => openFile(pending))
    return subscribeCodeViewRequest((path) => openFile(path))
  }, [openFile])

  /** 关页签：关掉激活项时接管右邻，其次左邻；全关光回空态 */
  const closeFile = useCallback((path: string): void => {
    const index = openFiles.indexOf(path)
    if (index === -1) return
    const next = openFiles.filter((p) => p !== path)
    setOpenFiles(next)
    if (activePath === path) setActivePath(next[index] ?? next[index - 1] ?? '')
  }, [openFiles, activePath])

  /*
   * 切页签也要回顶部。命中缓存的激活不会走 readFile，若不管，新文件会停在
   * 上一份文件的滚动位置——看起来像是「打开错了地方」。
   */
  useEffect(() => {
    requestAnimationFrame(() => {
      contentRef.current?.scrollTo({ top: 0 })
    })
  }, [activePath])

  /**
   * 展开/折叠目录：**只切展开态**。子目录的数据由 `DirChildren` 自行加载
   * （首次展开才请求）——这里若再调 loadDir 会把整棵树换成该子目录，
   * 既丢上下文又让 expanded 集合指向不可见的路径。
   */
  const toggleDir = useCallback((path: string): void => {
    setExpanded((prev) => {
      const next = new Set(prev)
      if (next.has(path)) {
        next.delete(path)
      } else {
        next.add(path)
      }
      return next
    })
  }, [])

  /** 路径栏回车：跳转到输入的绝对路径 */
  const gotoPath = useCallback((): void => {
    const target = pathInput.trim()
    if (target !== '') loadDir(target)
  }, [pathInput, loadDir])

  /** 面包屑：优先显示当前文件，其次当前目录；按分隔符拆段 */
  const crumb = useMemo(() => {
    const raw = activePath !== '' ? activePath : tree.path !== '' ? tree.path : root
    const segments = raw.split(/[\\/]+/).filter((seg) => seg !== '')
    // 路径过深时折叠中段（保留盘符/前两段 + … + 末两段），否则右侧工具栏会被挤没
    if (segments.length > 6) return [segments[0], '…', ...segments.slice(-2)]
    return segments
  }, [activePath, tree.path, root])

  const content = activePath !== '' ? buffers[activePath] ?? null : null
  const tokens = useMemo(
    () => (content !== null && content.reason === null && activePath !== '' ? tokenizeCode(content.text, extOf(activePath)) : []),
    [content, activePath]
  )
  const lineCount = content !== null && content.reason === null ? content.text.split('\n').length : 0
  /** 行号用一整块文本渲染（而不是 N 个 div）：几万行的文件也不会卡 */
  const gutterText = useMemo(
    () => Array.from({ length: lineCount }, (_, i) => i + 1).join('\n'),
    [lineCount]
  )

  return (
    <div className="code-panel" data-testid="code-panel">
      {/* 左：文件树 */}
      <aside className="code-tree" data-testid="code-tree">
        <div className="code-tree-head">
          <span className="code-tree-title">{t('codePanel.dirTitle')}</span>
          <button
            type="button"
            className="btn slim"
            title={t('codePanel.upTitle')}
            data-testid="code-tree-up"
            onClick={() => {
              const parent = parentOf(tree.path || root)
              if (parent !== tree.path) loadDir(parent)
            }}
          >
            ..
          </button>
        </div>
        <div className="code-pathbar">
          <input
            className="code-path-input"
            data-testid="code-path-input"
            value={pathInput}
            placeholder={t('codePanel.pathPlaceholder')}
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') gotoPath()
            }}
          />
        </div>
        <div className="code-tree-body">
          {tree.loading && <div className="code-tree-hint">{t('codePanel.loading')}</div>}
          {tree.error !== null && <div className="code-tree-hint error">{tree.error}</div>}
          {!tree.loading && tree.entries !== null && tree.entries.length === 0 && (
            <div className="code-tree-hint">{t('codePanel.emptyDir')}</div>
          )}
          {!tree.loading &&
            tree.entries?.map((entry) => {
              const full = joinPath(tree.path, entry.name)
              if (entry.isDir) {
                return (
                  <div key={full}>
                    <button
                      type="button"
                      className={`code-tree-row dir${expanded.has(full) ? ' open' : ''}`}
                      onClick={() => toggleDir(full)}
                    >
                      <span className="code-tree-icon">{expanded.has(full) ? '▾' : '▸'}</span>
                      <span className="code-tree-name" title={full}>
                        {entry.name}
                      </span>
                    </button>
                    {expanded.has(full) && <DirChildren path={full} depth={1} expanded={expanded} onToggle={toggleDir} onOpenFile={openFile} />}
                  </div>
                )
              }
              if (!isCodeFile(entry.name)) return null
              return (
                <button
                  key={full}
                  type="button"
                  className={`code-tree-row file${activePath === full ? ' active' : ''}`}
                  onClick={() => openFile(full)}
                  title={t('codePanel.fileTitle', { path: full, size: formatBytes(entry.size) })}
                >
                  <span className="code-tree-icon">·</span>
                  <span className="code-tree-name">{entry.name}</span>
                  <span className="code-tree-size">{formatBytes(entry.size)}</span>
                </button>
              )
            })}
        </div>
      </aside>

      {/* 右：页签 + 面包屑 + 代码查看 */}
      <section className="code-view" data-testid="code-view">
        {/* 文件页签：一个文件一个页签，横向可滚 */}
        <div className="code-tabs">
          {openFiles.map((path) => (
            <div key={path} className={`code-tab${path === activePath ? ' active' : ''}`} title={path}>
              <button type="button" className="code-tab-label" onClick={() => openFile(path)}>
                {baseNameOf(path)}
              </button>
              <button
                type="button"
                className="code-tab-close"
                title={t('codePanel.closeTab')}
                aria-label={t('codePanel.closeTabAria', { name: baseNameOf(path) })}
                onClick={() => closeFile(path)}
              >
                <LucideIcon name="x" size={12} />
              </button>
            </div>
          ))}
          <button type="button" className="code-tab-add" disabled title={t('codePanel.newFileTitle')}>
            <LucideIcon name="plus" size={14} />
          </button>
        </div>

        {/* 面包屑：按 / 拆段（末段加重），右侧工具图标 */}
        <div className="code-breadcrumb" data-testid="code-breadcrumb">
          <span className="code-crumb-path" title={activePath || tree.path}>
            {crumb.length === 0
              ? t('codePanel.unloaded')
              : crumb.map((segment, index) => (
                  <span key={`${index}-${segment}`} className={`code-crumb-seg${index === crumb.length - 1 ? ' last' : ''}`}>
                    {index > 0 && <span className="code-crumb-sep">/</span>}
                    {segment}
                  </span>
                ))}
          </span>
          {content !== null && content.reason === null && (
            <span className="code-crumb-meta">
              {t('codePanel.meta', { lines: lineCount, size: formatBytes(content.bytes) })}
            </span>
          )}
          {activePath !== '' && (
            <span className="code-crumb-badge" title={t('codePanel.readonlyTitle')}>
              {t('codePanel.readonlyBadge')}
            </span>
          )}
          <span className="code-crumb-tools">
            <button type="button" className="code-tool" disabled title={t('codePanel.viewSwitchTitle')}>
              <LucideIcon name="file-text" size={14} />
            </button>
            <button
              type="button"
              className="code-tool"
              disabled={activePath === ''}
              title={t('codePanel.reloadTitle')}
              onClick={() => {
                if (activePath !== '') readFile(activePath)
              }}
            >
              <LucideIcon name="refresh" size={14} />
            </button>
            <button type="button" className="code-tool" disabled title={t('codePanel.moreTitle')}>
              <LucideIcon name="chevron-down" size={14} />
            </button>
          </span>
        </div>

        {activePath === '' ? (
          <div className="code-view-empty">
            <p>{t('codePanel.pickFile')}</p>
            <p className="code-view-empty-sub">{t('codePanel.pickFileSub')}</p>
          </div>
        ) : (
          <>
            {content === null && <div className="code-view-empty">{t('codePanel.loading')}</div>}
            {content !== null && content.reason !== null && (
              <div className="code-view-empty error" data-testid="code-view-reason">
                {content.reason}
              </div>
            )}
            {content !== null && content.reason === null && (
              /* 行号槽与代码同处一个滚动容器，才能保证逐行对齐 + 横向滚动时行号仍可见 */
              <div className="code-body" ref={contentRef}>
                <pre className="code-gutter" aria-hidden="true">
                  {gutterText}
                </pre>
                <pre className="code-content" data-testid="code-content">
                  {tokens.map((token, index) => (
                    <span key={index} className={`tok-${token.kind}`}>
                      {token.text}
                    </span>
                  ))}
                </pre>
              </div>
            )}
          </>
        )}
      </section>
    </div>
  )
}

/** 子目录懒加载节点（展开时才拉数据；与顶层共用同一 toggle 语义） */
function DirChildren({
  path,
  depth,
  expanded,
  onToggle,
  onOpenFile
}: {
  path: string
  depth: number
  expanded: Set<string>
  onToggle: (path: string) => void
  onOpenFile: (path: string) => void
}): React.JSX.Element {
  const t = useT()
  const [state, setState] = useState<TreeNode>({ path, loading: true, entries: null, error: null })
  useEffect(() => {
    let cancelled = false
    void window.mbApi.fs.listDir({ path }).then((res) => {
      if (!cancelled) setState({ path: res.path, loading: false, entries: sortEntries(res.entries), error: null })
    }).catch(() => {
      if (!cancelled)
        setState({ path, loading: false, entries: [], error: translate(getLocalePreference(), 'codePanel.readDirFailedShort') })
    })
    return () => {
      cancelled = true
    }
  }, [path])

  if (state.loading) return <div className="code-tree-hint indent">{t('codePanel.loading')}</div>
  if (state.error !== null) return <div className="code-tree-hint indent error">{state.error}</div>
  return (
    <>
      {state.entries?.map((entry) => {
        const full = joinPath(path, entry.name)
        if (entry.isDir) {
          if (depth >= 6) {
            return (
              <div key={full} className="code-tree-hint indent" title={full}>
                {t('codePanel.dirTooDeep', { name: entry.name })}
              </div>
            )
          }
          return (
            <div key={full}>
              <button
                type="button"
                className={`code-tree-row dir${expanded.has(full) ? ' open' : ''}`}
                onClick={() => onToggle(full)}
              >
                <span className="code-tree-icon">{expanded.has(full) ? '▾' : '▸'}</span>
                <span className="code-tree-name" title={full}>
                  {entry.name}
                </span>
              </button>
              {expanded.has(full) && (
                <DirChildren path={full} depth={depth + 1} expanded={expanded} onToggle={onToggle} onOpenFile={onOpenFile} />
              )}
            </div>
          )
        }
        if (!isCodeFile(entry.name)) return null
        return (
          <button key={full} type="button" className="code-tree-row file" onClick={() => onOpenFile(full)} title={t('codePanel.fileTitle', { path: full, size: formatBytes(entry.size) })}>
            <span className="code-tree-icon">·</span>
            <span className="code-tree-name">{entry.name}</span>
            <span className="code-tree-size">{formatBytes(entry.size)}</span>
          </button>
        )
      })}
    </>
  )
}

function extOf(path: string): string {
  const name = baseNameOf(path)
  const dot = name.lastIndexOf('.')
  return dot > 0 ? name.slice(dot + 1).toLowerCase() : ''
}

function joinPath(dir: string, name: string): string {
  return dir.endsWith('\\') || dir.endsWith('/') ? `${dir}${name}` : `${dir}\\${name}`
}

function parentOf(path: string): string {
  const parts = path.split(/[\\/]/)
  parts.pop()
  return parts.join('\\') || path
}
