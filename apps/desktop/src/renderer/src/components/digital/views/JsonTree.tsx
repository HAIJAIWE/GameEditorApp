import { useCallback, useMemo, useState, type ReactElement } from 'react'

import { useT } from '@mobai/client-ui'

/**
 * 大 JSON 的树形视图（对齐 dsh `ui-tool` 的 JSON 检查能力，简化版）。
 *
 * 两处原本都是 `<pre>{JSON.stringify(obj, null, 2)}</pre>`：有 max-height 兜底不撑爆布局，
 * 但**整份 JSON 仍会 stringify 成一个巨大的文本节点**——MCP 工具返回几百 KB 时会卡，
 * 用户也只能在一个 240px 的滚动框里翻找某个字段。
 *
 * 这里做三件事：
 * 1. 容器（object/array）按层折叠，默认只展开根；
 * 2. **节点上限**（默认 200）：超了就停止生成行，不做「只截断显示但 DOM 还是全量」的假优化；
 * 3. 保留「原文」切换 —— 调试时想复制整段 JSON 仍有路可走。
 *
 * 树先由纯函数 `buildRows` 展平成行数据，组件只 map 渲染：
 * 既让「渲染多少节点」可单测，也避开 React 编译规则对 render 期间可变变量的限制。
 */

export interface JsonTreeProps {
  value: unknown
  /** 最多渲染多少个节点（含容器行） */
  maxNodes?: number
  /** 切到「原文」时套用的样式类：两处调用点的 `<pre>` 样式不同 */
  rawClassName: string
}

type Row =
  | { kind: 'container'; path: string; key: string | null; depth: number; expanded: boolean; isArray: boolean; count: number }
  | { kind: 'leaf'; path: string; key: string | null; depth: number; value: unknown }
  | { kind: 'more'; path: string }

function isContainer(value: unknown): value is Record<string, unknown> | unknown[] {
  return value !== null && typeof value === 'object'
}

function entriesOf(value: Record<string, unknown> | unknown[]): Array<[string, unknown]> {
  return Array.isArray(value)
    ? value.map((item, index) => [String(index), item] as [string, unknown])
    : Object.entries(value)
}

/** 原始值的显示文本；字符串加引号并限长，避免一个超长 base64 把整行撑坏 */
function primitiveText(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'string') {
    const shown = value.length > 200 ? `${value.slice(0, 200)}…` : value
    return JSON.stringify(shown)
  }
  return String(value)
}

function valueKind(value: unknown): string {
  if (value === null) return 'null'
  if (typeof value === 'number') return 'number'
  if (typeof value === 'boolean') return 'boolean'
  return 'string'
}

/** 纯函数：按当前展开集合把 JSON 展平成可渲染的行，超过上限就停 */
function buildRows(value: unknown, open: ReadonlySet<string>, maxNodes: number): Row[] {
  const rows: Row[] = []
  const visit = (key: string | null, node: unknown, path: string, depth: number): void => {
    if (rows.length >= maxNodes) {
      // 只留一行提示，后续节点直接丢弃 —— DOM 不会随 JSON 体积线性膨胀
      if (!rows.some((row) => row.kind === 'more')) rows.push({ kind: 'more', path: `${path}.more` })
      return
    }
    if (!isContainer(node)) {
      rows.push({ kind: 'leaf', path, key, depth, value: node })
      return
    }
    const entries = entriesOf(node)
    const expanded = open.has(path)
    rows.push({
      kind: 'container',
      path,
      key,
      depth,
      expanded,
      isArray: Array.isArray(node),
      count: entries.length
    })
    if (expanded) {
      for (const [childKey, child] of entries) visit(childKey, child, `${path}.${childKey}`, depth + 1)
    }
  }
  visit(null, value, '$', 0)
  return rows
}

export function JsonTree({ value, maxNodes = 200, rawClassName }: JsonTreeProps): ReactElement {
  const t = useT()
  const [raw, setRaw] = useState(false)
  const [open, setOpen] = useState<ReadonlySet<string>>(() => new Set(['$']))

  const toggle = useCallback((path: string): void => {
    setOpen((prev) => {
      const next = new Set(prev)
      if (next.has(path)) next.delete(path)
      else next.add(path)
      return next
    })
  }, [])

  const rows = useMemo(() => buildRows(value, open, maxNodes), [value, open, maxNodes])
  const truncated = rows.some((row) => row.kind === 'more')

  return (
    <div className="json-tree" data-testid="json-tree">
      <div className="json-tree-toolbar">
        <button
          type="button"
          className="json-tree-mode"
          data-testid="json-tree-mode"
          onClick={() => setRaw((prev) => !prev)}
        >
          {raw ? t('digital.jsonTree.tree') : t('digital.jsonTree.raw')}
        </button>
      </div>
      {raw ? (
        <pre className={rawClassName}>{JSON.stringify(value, null, 2)}</pre>
      ) : (
        <div className="json-tree-body">
          {rows.map((row) => {
            if (row.kind === 'more') {
              return <div className="json-tree-more" key={row.path}>…</div>
            }
            if (row.kind === 'leaf') {
              return (
                <div
                  className="json-tree-leaf"
                  key={row.path}
                  data-testid="json-tree-leaf"
                  style={{ paddingLeft: row.depth * 14 + 2 }}
                >
                  {row.key !== null && <span className="json-tree-key">{row.key}</span>}
                  <span className={`json-tree-value json-tree-value-${valueKind(row.value)}`}>
                    {primitiveText(row.value)}
                  </span>
                </div>
              )
            }
            const summary = row.isArray
              ? `[ ] ${t('digital.jsonTree.items', { count: row.count })}`
              : `{ } ${t('digital.jsonTree.items', { count: row.count })}`
            return (
              <button
                type="button"
                className="json-tree-toggle"
                key={row.path}
                data-testid="json-tree-toggle"
                data-path={row.path}
                aria-expanded={row.expanded}
                style={{ paddingLeft: row.depth * 14 + 2 }}
                onClick={() => toggle(row.path)}
              >
                <span className="json-tree-caret" aria-hidden="true">{row.expanded ? '▾' : '▸'}</span>
                {row.key !== null && <span className="json-tree-key">{row.key}</span>}
                <span className="json-tree-summary">{summary}</span>
              </button>
            )
          })}
        </div>
      )}
      {!raw && truncated && (
        <div className="json-tree-note" data-testid="json-tree-truncated">
          {t('digital.jsonTree.limit', { max: maxNodes })}
        </div>
      )}
    </div>
  )
}
