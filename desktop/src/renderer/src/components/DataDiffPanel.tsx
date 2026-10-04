import { useCallback, useEffect, useMemo, useState } from 'react'

import {
  collectLeaves,
  diffLibraries,
  summarizeDiff,
  type DiffLeaf,
  type ItemDiffType,
  type LibraryDiffGroup
} from '../../../shared/itemDiff'
import {
  SETTINGS_KEYS,
  readJsonSetting,
  removeSetting,
  writeJsonSetting
} from '../../../shared/settingsStore'
import type { ItemRecord } from '../../../shared/types'

/**
 * 数据对比面板（当前数据 vs 用户手动设定的基线）。
 *
 * 与 Python 原对话框的关系：
 * - Python 的 `data_diff_dialog.py` 执行 `DataDiff.compare({}, {...})`，拿空 dict 与
 *   当前数据比，永远只输出「全部新增」，且 TS 侧没有备份/历史存储（那是另一切片）。
 * - 本面板改为「用户手动设基线 → 与基线对比」，基线缓存在 localStorage，
 *   真正做双侧 diff（引擎见 `shared/itemDiff.ts`）。
 */

const BASELINE_KEY = SETTINGS_KEYS.dataDiffBaseline

/** 上一次写入是否失败（供组件提示用；同步读写，无并发问题） */
let baselineWriteFailed = false

/** 读取基线：坏数据/异常一律返回 null（不抛） */
function loadBaseline(): ItemRecord[] | null {
  const parsed = readJsonSetting<unknown>(BASELINE_KEY, null)
  if (!Array.isArray(parsed)) return null
  return parsed as ItemRecord[]
}

/** 保存基线：写失败不崩，置错误标志由调用方提示 */
function saveBaseline(items: ItemRecord[] | null): void {
  if (items === null) {
    baselineWriteFailed = !removeSetting(BASELINE_KEY)
    return
  }
  if (!writeJsonSetting(BASELINE_KEY, items)) {
    baselineWriteFailed = true
    console.warn('数据对比：基线写入失败（localStorage 不可用或已满）')
  }
}

const DIFF_LABELS: Record<ItemDiffType, string> = {
  added: '新增',
  removed: '删除',
  modified: '修改'
}

/** 值预览：JSON.stringify 后截断到 ~60 字符 */
function preview(value: unknown): string {
  let text: string
  if (value === undefined) {
    text = 'undefined'
  } else {
    try {
      text = JSON.stringify(value) ?? String(value)
    } catch {
      text = String(value)
    }
  }
  return text.length > 60 ? `${text.slice(0, 57)}…` : text
}

function describeLeaf(leaf: DiffLeaf): string {
  if (leaf.diffType === 'added') return `+ ${preview(leaf.newValue)}`
  if (leaf.diffType === 'removed') return `− ${preview(leaf.oldValue)}`
  return `${preview(leaf.oldValue)} → ${preview(leaf.newValue)}`
}

interface DataDiffPanelProps {
  onClose: () => void
}

export default function DataDiffPanel({ onClose }: DataDiffPanelProps) {
  const [items, setItems] = useState<ItemRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [baseline, setBaseline] = useState<ItemRecord[] | null>(() => loadBaseline())
  // null = 还没对比过；[] = 对比过但无差异
  const [groups, setGroups] = useState<LibraryDiffGroup[] | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let alive = true
    window.mbApi.data
      .listAll()
      .then((list) => {
        if (alive) setItems(list)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
  }, [])

  const allEntries = useMemo(() => (groups ?? []).flatMap((group) => group.entries), [groups])
  const stats = useMemo(() => summarizeDiff(allEntries), [allEntries])
  const leafCount = useMemo(() => collectLeaves(allEntries).length, [allEntries])

  const handleSetBaseline = useCallback((): void => {
    if (items === null) return
    saveBaseline(items)
    if (baselineWriteFailed) {
      setNotice('基线保存失败：浏览器存储不可用')
      return
    }
    setBaseline(items)
    setGroups(null)
    setNotice(`已设当前 ${items.length} 条数据为基线`)
  }, [items])

  const handleClearBaseline = useCallback((): void => {
    saveBaseline(null)
    setBaseline(null)
    setGroups(null)
    setNotice('已清除基线')
  }, [])

  const handleRun = useCallback((): void => {
    if (items === null || baseline === null) return
    setGroups(diffLibraries(baseline, items))
    setNotice(null)
  }, [items, baseline])

  const currentCount = items === null ? '读取中' : items.length

  return (
    <div className="editor" data-testid="data-diff-panel">
      <div className="editor-header">
        <div className="editor-title">
          数据对比
          <small>当前 vs 基线</small>
        </div>
      </div>

      <div className="editor-body">
        <div className="qc-stat-total" data-testid="dd-counts">
          当前条目数：{currentCount} ·{' '}
          {baseline === null ? '尚未设置基线' : `基线条目数：${baseline.length}`}
        </div>

        {error !== null && <div className="empty">读取数据失败：{error}</div>}
        {items === null && error === null && <div className="empty">正在读取数据…</div>}
        {notice !== null && (
          <div className="item-meta" data-testid="dd-notice" style={{ marginTop: 6 }}>
            {notice}
          </div>
        )}

        {groups !== null && (
          <>
            <div className="qc-stat-total" data-testid="dd-summary">
              +新增 {stats.added} · −删除 {stats.removed} · ~修改 {stats.modified}
            </div>

            {leafCount === 0 ? (
              <div className="empty" data-testid="dd-identical">
                与基线完全一致
              </div>
            ) : (
              groups.map((group) => {
                const groupLeaves = collectLeaves(group.entries)
                return (
                  <div key={group.type} style={{ marginTop: 8 }}>
                    <div
                      className="qc-stat-total"
                      data-testid="dd-group"
                      style={{ textAlign: 'left' }}
                    >
                      {group.type}（{groupLeaves.length} 处变更）
                    </div>
                    {groupLeaves.map((leaf, index) => (
                      <div
                        className="ref-row"
                        data-testid="dd-row"
                        key={`${leaf.path}:${index}`}
                        style={{ cursor: 'default' }}
                      >
                        <span className="ref-row-main">{leaf.path}</span>
                        <span className="item-meta">
                          {DIFF_LABELS[leaf.diffType]}：{describeLeaf(leaf)}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              })
            )}
          </>
        )}
      </div>

      <div className="editor-actions">
        <button
          type="button"
          className="btn"
          data-testid="dd-set-baseline"
          onClick={handleSetBaseline}
          disabled={items === null}
        >
          设当前为基线
        </button>
        <button
          type="button"
          className="btn"
          data-testid="dd-run"
          onClick={handleRun}
          disabled={baseline === null || items === null}
        >
          与基线对比
        </button>
        <button
          type="button"
          className="btn"
          data-testid="dd-clear-baseline"
          onClick={handleClearBaseline}
          disabled={baseline === null}
        >
          清除基线
        </button>
        <button type="button" className="btn" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}
