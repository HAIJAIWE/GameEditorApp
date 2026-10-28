import { useEffect, useState } from 'react'

import type { CeshuSummary } from '../../../shared/ceshuConstants'
import {
  DIFF_DISPLAY,
  buildVersionDiffMarkdown,
  chapterTotalChanges,
  formatDiffValue,
  versionDiffTotalChanges,
  type CeshuChapterDiff,
  type CeshuVersionDiff,
  type CeshuVersionFieldDiff
} from '../../../shared/ceshuDiff'
import { formatLocalTimestamp } from '../../../shared/ceshuModel'
import { toErrorMessage } from '../../../shared/util/errors'

/**
 * 版本对比面板：
 * - 选择同版本链下的两个版本 →「开始对比」
 * - 章节级 Diff：左列章节（N 处变更 / 未变），右列字段表（字段 / 旧值 / 新值 / 类型）
 * - 点击字段查看完整旧新值详情 + 导出 Markdown 对比报告
 */

interface VersionDiffPanelProps {
  ceshuId: string
  onClose: () => void
}

function versionLabelOf(summary: CeshuSummary): string {
  return `${summary.versionLabel} - ${summary.gameName || '未命名'}${summary.isActive ? ' ★激活' : ''}`
}

function changedFieldsOf(chapter: CeshuChapterDiff): CeshuVersionFieldDiff[] {
  return chapter.field_diffs.filter((field) => field.diff_type !== 'unchanged')
}

export default function VersionDiffPanel({ ceshuId, onClose }: VersionDiffPanelProps) {
  const [versions, setVersions] = useState<CeshuSummary[] | null>(null)
  const [oldId, setOldId] = useState('')
  const [newId, setNewId] = useState('')
  const [diff, setDiff] = useState<CeshuVersionDiff | null>(null)
  const [activeChapter, setActiveChapter] = useState<string>('')
  const [selectedField, setSelectedField] = useState<CeshuVersionFieldDiff | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false
    window.mbApi.ceshu
      .versions({ id: ceshuId })
      .then((loaded) => {
        if (cancelled) return
        setVersions(loaded)
        // 默认：旧版本=链首、新版本=链尾
        if (loaded.length >= 2) {
          setOldId(loaded[0]?.id ?? '')
          setNewId(loaded[loaded.length - 1]?.id ?? '')
        } else {
          setOldId(loaded[0]?.id ?? '')
          setNewId('')
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [ceshuId])

  const canCompare = Boolean(oldId && newId && oldId !== newId && !busy)

  /** 开始对比：主进程加载两个版本并计算章节级 Diff */
  const handleCompare = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    setSelectedField(null)
    try {
      const result = await window.mbApi.ceshu.diff({ id: oldId, otherId: newId })
      setDiff(result)
      const firstChanged = result.chapter_diffs.find((chapter) => chapterTotalChanges(chapter) > 0)
      setActiveChapter(firstChanged?.chapter_key ?? result.chapter_diffs[0]?.chapter_key ?? '')
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 导出对比报告：渲染层生成 Markdown → 主进程原子写盘 */
  const handleExport = async (): Promise<void> => {
    if (!diff) return
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseCeshuExportFile({
        format: 'markdown',
        defaultName: `版本对比-${diff.old_version_label}-${diff.new_version_label}`
      })
      if (!chosen.path) return
      const markdown = buildVersionDiffMarkdown(diff, formatLocalTimestamp())
      const exported = await window.mbApi.ceshu.exportDiffReport({ path: chosen.path, content: markdown })
      setNotice(`对比报告已导出：${exported.filePath}`)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  const activeChapterDiff = diff?.chapter_diffs.find((chapter) => chapter.chapter_key === activeChapter) ?? null
  const changedFields = activeChapterDiff ? changedFieldsOf(activeChapterDiff) : []
  const scoredTotal = diff
    ? diff.total_added + diff.total_removed + diff.total_modified + diff.total_unchanged
    : 0
  const changeRate = diff && scoredTotal > 0 ? (versionDiffTotalChanges(diff) / scoredTotal) * 100 : 0

  return (
    <div className="changelog-panel" data-testid="diff-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">版本对比（Diff 两个版本）</span>
        <div className="editor-actions">
          <button
            type="button"
            className="btn primary"
            data-testid="diff-compare"
            disabled={!canCompare}
            onClick={() => void handleCompare()}
          >
            {busy ? '对比中…' : '开始对比'}
          </button>
          <button type="button" className="btn" data-testid="diff-export" disabled={!diff} onClick={() => void handleExport()}>
            导出 Markdown
          </button>
          <button type="button" className="btn" data-testid="diff-close" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>

      {error && (
        <div className="form-error" data-testid="diff-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice-banner" data-testid="diff-notice">
          {notice}
        </div>
      )}

      <div className="diff-selectors" data-testid="diff-selectors">
        <span className="form-label">旧版本</span>
        <select
          className="form-select"
          data-testid="diff-old"
          value={oldId}
          onChange={(event) => setOldId(event.target.value)}
        >
          <option value="">请选择</option>
          {(versions ?? []).map((version) => (
            <option key={version.id} value={version.id}>
              {versionLabelOf(version)}
            </option>
          ))}
        </select>
        <span className="form-label">新版本</span>
        <select
          className="form-select"
          data-testid="diff-new"
          value={newId}
          onChange={(event) => setNewId(event.target.value)}
        >
          <option value="">请选择</option>
          {(versions ?? []).map((version) => (
            <option key={version.id} value={version.id}>
              {versionLabelOf(version)}
            </option>
          ))}
        </select>
        {(versions?.length ?? 0) < 2 && <span className="item-meta">版本链只有一份文档，暂无可对比对象</span>}
      </div>

      {!diff ? (
        <div className="empty">选择两个不同的版本后点击「开始对比」</div>
      ) : (
        <>
          <div className="diff-stats" data-testid="diff-stats">
            📊 对比: {diff.old_version_label} → {diff.new_version_label} |
            <span style={{ color: DIFF_DISPLAY.added.color }}> ✚ 新增 {diff.total_added}</span>
            <span style={{ color: DIFF_DISPLAY.removed.color }}> ✖ 删除 {diff.total_removed}</span>
            <span style={{ color: DIFF_DISPLAY.modified.color }}> ✎ 修改 {diff.total_modified}</span>
            <span style={{ color: DIFF_DISPLAY.unchanged.color }}> 未变 {diff.total_unchanged}</span> | 变更率{' '}
            {changeRate.toFixed(1)}%
          </div>

          <div className="diff-body">
            <div className="diff-chapters">
              {diff.chapter_diffs.map((chapter) => {
                const changes = chapterTotalChanges(chapter)
                return (
                  <button
                    key={chapter.chapter_key}
                    type="button"
                    data-testid="diff-chapter"
                    className={`diff-chapter${chapter.chapter_key === activeChapter ? ' active' : ''}${changes > 0 ? ' changed' : ''}`}
                    onClick={() => {
                      setActiveChapter(chapter.chapter_key)
                      setSelectedField(null)
                    }}
                  >
                    <span className="diff-chapter-label">{chapter.chapter_label}</span>
                    <span className="diff-chapter-count" data-testid="diff-chapter-count">
                      {changes > 0 ? `${changes} 处变更` : '未变'}
                    </span>
                  </button>
                )
              })}
            </div>

            <div className="diff-fields">
              {changedFields.length === 0 ? (
                <div className="empty">该章节无变更</div>
              ) : (
                <table className="score-table">
                  <thead>
                    <tr>
                      <th>字段</th>
                      <th>旧值</th>
                      <th>新值</th>
                      <th>类型</th>
                    </tr>
                  </thead>
                  <tbody>
                    {changedFields.map((field) => (
                      <tr
                        key={field.field_path}
                        data-testid="diff-field"
                        className={field.field_path === selectedField?.field_path ? 'selected' : ''}
                        onClick={() => setSelectedField(field)}
                      >
                        <td>{field.field_label}</td>
                        <td>{formatDiffValue(field.old_value, 80)}</td>
                        <td>{formatDiffValue(field.new_value, 80)}</td>
                        <td style={{ color: DIFF_DISPLAY[field.diff_type].color }}>{DIFF_DISPLAY[field.diff_type].text}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}

              {selectedField && activeChapterDiff && (
                <div className="diff-detail" data-testid="diff-detail">
                  <div className="diff-detail-title">
                    {activeChapterDiff.chapter_label} · {selectedField.field_label}
                    <span style={{ color: DIFF_DISPLAY[selectedField.diff_type].color }}>
                      {' '}
                      {DIFF_DISPLAY[selectedField.diff_type].text}
                    </span>
                  </div>
                  <div className="form-label">旧值</div>
                  <pre className="diff-detail-value">{formatDiffValue(selectedField.old_value) || '(空)'}</pre>
                  <div className="form-label">新值</div>
                  <pre className="diff-detail-value">{formatDiffValue(selectedField.new_value) || '(空)'}</pre>
                </div>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  )
}