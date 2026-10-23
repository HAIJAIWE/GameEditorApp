import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

import { baseNameOf, formatBytes, isCodeFile, sortEntries, tokenizeCode } from '../utils/codeView'
import type { FsDirEntry } from '../../../shared/ipc'

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
 */

/** 树节点：路径 + 加载态 + 条目 + 展开态 */
interface TreeNode {
  path: string
  loading: boolean
  entries: FsDirEntry[] | null
  error: string | null
}

export default function CodePanel(): React.JSX.Element {
  const [root, setRoot] = useState<string>('')
  const [tree, setTree] = useState<TreeNode>({ path: '', loading: true, entries: null, error: null })
  const [expanded, setExpanded] = useState<Set<string>>(() => new Set())
  const [activePath, setActivePath] = useState<string>('')
  const [content, setContent] = useState<{ text: string; reason: string | null; bytes: number } | null>(null)
  const [pathInput, setPathInput] = useState<string>('')
  const contentRef = useRef<HTMLPreElement>(null)

  /** 列目录（结果直接写进树状态） */
  const loadDir = useCallback((path: string): void => {
    setTree((prev) => ({ ...prev, path, loading: true, error: null }))
    void window.mbApi.fs.listDir({ path }).then((res) => {
      setTree({ path: res.path, loading: false, entries: sortEntries(res.entries), error: null })
    }).catch(() => {
      setTree({ path, loading: false, entries: [], error: '无法读取该目录' })
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
        if (!cancelled) setTree((prev) => ({ ...prev, loading: false, error: '无法获取默认目录' }))
      })
    return () => {
      cancelled = true
    }
  }, [loadDir])

  /** 打开文件：读内容并回到顶部 */
  const openFile = useCallback((path: string): void => {
    setActivePath(path)
    setContent(null)
    void window.mbApi.fs.readFile({ path }).then((res) => {
      setContent({ text: res.content, reason: res.reason, bytes: res.bytes })
      requestAnimationFrame(() => {
        contentRef.current?.scrollTo({ top: 0 })
      })
    }).catch(() => {
      setContent({ text: '', reason: '读取失败', bytes: 0 })
    })
  }, [])

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

  /** 面包屑：当前树路径相对 root 的展示 */
  const breadcrumb = useMemo(() => {
    if (tree.path === '') return ''
    return tree.path === root ? tree.path : tree.path.replace(root, '').replace(/^[\\/]/, '')
  }, [tree.path, root])

  /** 路径栏回车：跳转到输入的绝对路径 */
  const gotoPath = useCallback((): void => {
    const target = pathInput.trim()
    if (target !== '') loadDir(target)
  }, [pathInput, loadDir])

  const tokens = useMemo(
    () => (content !== null && content.reason === null && activePath !== '' ? tokenizeCode(content.text, extOf(activePath)) : []),
    [content, activePath]
  )
  const lineCount = content !== null && content.reason === null ? content.text.split('\n').length : 0

  return (
    <div className="code-panel" data-testid="code-panel">
      {/* 左：文件树 */}
      <aside className="code-tree" data-testid="code-tree">
        <div className="code-tree-head">
          <span className="code-tree-title">文件</span>
          <button
            type="button"
            className="btn slim"
            title="向上一级"
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
            placeholder="绝对路径，回车跳转"
            onChange={(e) => setPathInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') gotoPath()
            }}
          />
        </div>
        <div className="code-tree-body">
          {tree.loading && <div className="code-tree-hint">读取中…</div>}
          {tree.error !== null && <div className="code-tree-hint error">{tree.error}</div>}
          {!tree.loading && tree.entries !== null && tree.entries.length === 0 && (
            <div className="code-tree-hint">空目录（或条目超出 500 条上限被截断）</div>
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
                  title={`${full}（${formatBytes(entry.size)}）`}
                >
                  <span className="code-tree-icon">·</span>
                  <span className="code-tree-name">{entry.name}</span>
                  <span className="code-tree-size">{formatBytes(entry.size)}</span>
                </button>
              )
            })}
        </div>
      </aside>

      {/* 右：代码查看 */}
      <section className="code-view" data-testid="code-view">
        {activePath === '' ? (
          <div className="code-view-empty">
            <p>从左侧选择一个代码文件</p>
            <p className="code-view-empty-sub">只读查看 · 支持 ts/tsx/js/json/md/html/css/py/lua 等文本格式</p>
          </div>
        ) : (
          <>
            <header className="code-view-head">
              <span className="code-view-path" title={activePath}>
                {baseNameOf(activePath)}
              </span>
              <span className="code-view-meta">
                {content !== null && content.reason === null ? `${lineCount} 行 · ${formatBytes(content.bytes)}` : ''}
              </span>
              <span className="code-view-badge" title="本面板只读，不提供编辑保存">
                只读
              </span>
            </header>
            {content === null && <div className="code-view-empty">读取中…</div>}
            {content !== null && content.reason !== null && (
              <div className="code-view-empty error" data-testid="code-view-reason">
                {content.reason}
              </div>
            )}
            {content !== null && content.reason === null && (
              <pre className="code-content" ref={contentRef} data-testid="code-content">
                {tokens.map((token, index) => (
                  <span key={index} className={`tok-${token.kind}`}>
                    {token.text}
                  </span>
                ))}
              </pre>
            )}
          </>
        )}
      </section>
      {/* 面包屑（调试/定位用：当前目录） */}
      <div className="code-breadcrumb" data-testid="code-breadcrumb">
        {breadcrumb || '（未加载）'}
      </div>
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
  const [state, setState] = useState<TreeNode>({ path, loading: true, entries: null, error: null })
  useEffect(() => {
    let cancelled = false
    void window.mbApi.fs.listDir({ path }).then((res) => {
      if (!cancelled) setState({ path: res.path, loading: false, entries: sortEntries(res.entries), error: null })
    }).catch(() => {
      if (!cancelled) setState({ path, loading: false, entries: [], error: '无法读取' })
    })
    return () => {
      cancelled = true
    }
  }, [path])

  if (state.loading) return <div className="code-tree-hint indent">读取中…</div>
  if (state.error !== null) return <div className="code-tree-hint indent error">{state.error}</div>
  return (
    <>
      {state.entries?.map((entry) => {
        const full = joinPath(path, entry.name)
        if (entry.isDir) {
          if (depth >= 6) {
            return (
              <div key={full} className="code-tree-hint indent" title={full}>
                {entry.name}（过深，未展开）
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
          <button key={full} type="button" className="code-tree-row file" onClick={() => onOpenFile(full)} title={`${full}（${formatBytes(entry.size)}）`}>
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
