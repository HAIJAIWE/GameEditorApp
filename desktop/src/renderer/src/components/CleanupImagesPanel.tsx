import { useCallback, useEffect, useState } from 'react'

import {
  IMAGE_EXTENSIONS,
  collectReferencedImagePaths,
  diffUnusedImages,
  previewUnused,
  summarizeScan
} from '../../../shared/cleanupImages'
import type { UnusedImageScan } from '../../../shared/cleanupImages'
import { toErrorMessage } from '../../../shared/util/errors'

/**
 * 清理未使用图片面板（对齐 Python `src/features/advanced.py:373-431` 的
 * `cleanup_unused_images`，入口 `menus.py:110`「工具 → 清理未使用图片」
 * 与 `settings_dialog.py:428`）。
 *
 * ## PyQt 做了什么（逐行读过 `advanced.py:373-431`）
 * 1. 遍历全库数据，收集字段名 ∈ {`image`,`icon`,`avatar`,`img`} 且值为非空字符串的路径；
 * 2. `data_dir.rglob('*' + ext)` 扫出 7 种图片扩展名；
 * 3. 做差集得「未使用」；为空则弹一句「未发现未使用的图片」；
 * 4. `QMessageBox.question(Yes|No)` 问一次「是否删除」（附「操作不可恢复，建议先备份」）；
 * 5. 逐个 `unlink()`，失败只记 warning，最后如实报「已删除 N/M 张」。
 *
 * ## 与 PyQt 的差异（**都是加护栏 / 说得更清楚**，不是漏做）
 * - **先扫描、先展示清单，再让用户确认**：PyQt 只报一个数字（`发现 N 张`）就问Yes/No，
 *   用户根本不知道要删的是哪些文件。TS 侧把**完整路径清单**摆出来（>50 条折叠），
 *   确认语里带上数量，确认区点明「**删除文件不可撤销**」。
 * - **不可撤销的后果写明**：与 `ClearAllPanel` 不同，数据删除走撤销栈能 Ctrl+Z 找回，
 *   而**文件删除进不了撤销栈**（主进程只unlink），所以这里必须说清「先备份」。
 * - **删除结果绝不假装全成功**：沿用 PyQt 的 `已删除 N/M 张` 口径，
 *   并把失败条目逐条列出（PyQt 只写进日志，用户看不到）。
 * - **悬空引用如实告知**：数据里引用了但目录里不存在的图片，会算进 PyQt 的
 *   `len(referenced)`（虚高）。TS 侧单列为 `danglingRefCount` 显示，不混进「已引用」数。
 *
 * 交互形态沿用项目既有做法：**内联两按钮确认态**（同 `ClearAllPanel` /
 * `BackupPanel` 的删除确认），不自造弹窗组件。
 * 浮层头部已有统一的「关闭」按钮，故本组件**不接收 `onClose`**。
 *
 * ## ⚠️ 待主理人接线（本面板**已实现但未接线**，双端 tsc 当前为 0 错）
 * 渲染层**没有 fs**，目录扫描与物理删除都必须走主进程。本面板通过一个**窄接口 + 安全探测**
 * 访问 `window.mbApi.images`：
 *
 * ```ts
 * window.mbApi.images = {
 *   listLibraryImages(): Promise<{ dir: string; files: string[] }>   // 见报告里的 IPC 定义
 *   deleteImages(req: { paths: string[]; confirm: boolean }): Promise<{ deleted: number; failed: string[] }>
 * }
 * ```
 * 接线前本面板显示「尚未接线」的提示而不是报错——刻意不 import 未改动的
 * `shared/ipc.ts`（`IpcContract` 里还没有这两个通道，import 了反而会连带要求改契约文件）。
 */

interface ImagesApi {
  /** 列出图片目录下的全部图片文件（主进程 rglob 7 种扩展名）；`dir` 为实际扫描的目录 */
  listLibraryImages(): Promise<{ dir: string; files: string[] }>
  /** 物理删除给定路径的图片；`confirm` 必须为 true（主进程再校验一次） */
  deleteImages(req: { paths: string[]; confirm: boolean }): Promise<{ deleted: number; failed: string[] }>
}

/**
 * 探测 `window.mbApi.images` 是否已接线。
 * 刻意走 `unknown` 双重断言而非 `import type { MbApi }` 后直接访问 ——
 * 后者要求 `IpcContract` 里已有这两个通道，会连带要求改动契约文件（越界）。
 */
function probeImagesApi(): ImagesApi | null {
  const holder = window as unknown as { mbApi?: { images?: Partial<ImagesApi> } }
  const api = holder.mbApi?.images
  if (api === undefined || typeof api.listLibraryImages !== 'function' || typeof api.deleteImages !== 'function') {
    return null
  }
  return {
    listLibraryImages: () => api.listLibraryImages!(),
    deleteImages: (req) => api.deleteImages!(req)
  }
}

type ScanState =
  | { status: 'loading' }
  | { status: 'ready'; scan: UnusedImageScan; dir: string }
  | { status: 'error'; message: string }
  | { status: 'unwired' }

export default function CleanupImagesPanel() {
  const [state, setState] = useState<ScanState>({ status: 'loading' })
  const [confirming, setConfirming] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [result, setResult] = useState<string | null>(null)
  const [failures, setFailures] = useState<string[]>([])

  /**
   * 跑一次扫描并返回结果（不写 state）。
   * 抽成 async 是为了让挂载 effect 里**一次同步 setState 都没有**——
   * 扫描是异步的，把 setState 放进 `.then` 里（与 `ClearAllPanel` 同一写法），
   * 避免 `react-hooks/set-state-in-effect` 报错与首帧多余的重渲染。
   */
  const fetchScan = useCallback(async (): Promise<ScanState> => {
    const api = probeImagesApi()
    if (api === null) {
      return { status: 'unwired' }
    }
    // 引用侧来自既有 `data:listAll`（无需新通道）；文件侧来自新增的 `images:listLibraryImages`
    const [listing, records] = await Promise.all([api.listLibraryImages(), window.mbApi.data.listAll()])
    const referencedKeys = collectReferencedImagePaths(records, listing.dir)
    return { status: 'ready', scan: diffUnusedImages(listing.files, referencedKeys), dir: listing.dir }
  }, [])

  const handleScan = useCallback((): void => {
    setConfirming(false)
    setResult(null)
    setFailures([])
    setError(null)
    setState({ status: 'loading' })
    fetchScan()
      .then(setState)
      .catch((err: unknown) => setState({ status: 'error', message: toErrorMessage(err) }))
  }, [fetchScan])

  // 打开面板即扫描（只读，用户看清清单后才谈得上删除）
  useEffect(() => {
    let alive = true
    fetchScan()
      .then((next) => {
        if (alive) setState(next)
      })
      .catch((err: unknown) => {
        if (alive) setState({ status: 'error', message: toErrorMessage(err) })
      })
    return () => {
      alive = false
    }
  }, [fetchScan])

  const handleDelete = useCallback((): void => {
    const api = probeImagesApi()
    if (api === null || state.status !== 'ready') {
      setError('清理功能尚未接线，无法删除')
      return
    }
    const targets = state.scan.unused
    setBusy(true)
    setError(null)
    api
      .deleteImages({ paths: targets, confirm: true })
      .then((res) => {
        // 与 PyQt 同一口径：如实报「成功数/总数」，失败条目逐条列出（PyQt 只写进日志）
        setResult(`已删除 ${res.deleted}/${targets.length} 张未使用的图片。`)
        setFailures(res.failed)
        setConfirming(false)
        // 删除后**重扫**而不是本地推算：文件系统的真实结果只有主进程知道
        fetchScan()
          .then(setState)
          .catch((err: unknown) => setState({ status: 'error', message: toErrorMessage(err) }))
      })
      .catch((err: unknown) => {
        setError(toErrorMessage(err))
        setConfirming(false)
      })
      .finally(() => setBusy(false))
  }, [fetchScan, state])

  const scan = state.status === 'ready' ? state.scan : null
  const preview = scan !== null ? previewUnused(scan.unused) : null

  return (
    <div className="editor" data-testid="cleanup-images-panel">
      <div className="editor-header">
        <div className="editor-title">
          清理未使用图片
          <small>扫描数据里没有任何引用的图片文件</small>
        </div>
      </div>

      <div className="editor-body">
        <div className="form-hint">
          只扫描 {IMAGE_EXTENSIONS.join(' / ')} 格式；数据里{' '}
          <code>image</code> / <code>icon</code> / <code>avatar</code> / <code>img</code>{' '}
          四个字段引用到的图片会被视为「已使用」。
        </div>

        {state.status === 'loading' && <div className="empty">正在扫描图片目录与数据引用…</div>}

        {state.status === 'unwired' && (
          <div className="empty" data-testid="cleanup-images-unwired">
            清理未使用图片尚未接线（需要主进程提供图片目录扫描与删除能力）。
          </div>
        )}

        {state.status === 'error' && (
          <div className="form-error" data-testid="cleanup-images-scan-error">
            扫描失败：{state.message}
          </div>
        )}

        {scan !== null && preview !== null && (
          <>
            <div className="form-row">
              <span className="form-label">扫描结果</span>
              <span data-testid="cleanup-images-summary">{summarizeScan(scan)}</span>
            </div>

            {scan.unused.length === 0 ? (
              <div className="empty" data-testid="cleanup-images-clean">
                没有未使用的图片，无需清理。
              </div>
            ) : (
              <>
                {/* 破坏性操作的风险提示（与 ClearAllPanel 的 delete 确认同一条样式类） */}
                <div className="danger-hint" data-testid="cleanup-images-warning">
                  将删除 {scan.unused.length} 个未被任何数据引用的图片文件
                  （扫描目录：{state.status === 'ready' ? state.dir : ''}）。
                  <br />
                  <b>删除文件不可撤销</b>，也不会进入撤销栈（Ctrl+Z 找不回）。
                  如果这些图片是手工放进去、还没来得及在数据里引用的，请先取消并备份。
                </div>

                <div className="form-row">
                  <span className="form-label">待删清单</span>
                  <div style={{ maxHeight: 220, overflow: 'auto' }}>
                    {preview.shown.map((path) => (
                      <div key={path} data-testid="cleanup-images-item" style={{ wordBreak: 'break-all' }}>
                        {path}
                      </div>
                    ))}
                    {preview.hiddenCount > 0 && (
                      <div className="form-hint" data-testid="cleanup-images-more">
                        还有 {preview.hiddenCount} 条未显示
                      </div>
                    )}
                  </div>
                </div>

                {confirming && (
                  <div className="form-row" data-testid="cleanup-images-confirm">
                    <span className="form-label">确认删除这 {scan.unused.length} 个文件？</span>
                    <button
                      type="button"
                      className="btn danger"
                      data-testid="cleanup-images-confirm-yes"
                      disabled={busy}
                      onClick={handleDelete}
                    >
                      确认删除
                    </button>
                    <button
                      type="button"
                      className="btn"
                      data-testid="cleanup-images-confirm-no"
                      disabled={busy}
                      onClick={() => setConfirming(false)}
                    >
                      取消
                    </button>
                  </div>
                )}
              </>
            )}
          </>
        )}

        {result !== null && (
          <div className="notice-banner inline" data-testid="cleanup-images-result">
            {result}
          </div>
        )}
        {failures.length > 0 && (
          <div className="form-error" data-testid="cleanup-images-failures">
            以下 {failures.length} 个文件删除失败：
            <br />
            {failures.map((path) => (
              <div key={path} style={{ wordBreak: 'break-all' }}>
                {path}
              </div>
            ))}
          </div>
        )}
        {error !== null && (
          <div className="form-error" data-testid="cleanup-images-error">
            {error}
          </div>
        )}
      </div>

      <div className="editor-actions">
        <button
          type="button"
          className="btn"
          data-testid="cleanup-images-rescan"
          disabled={busy || state.status === 'loading'}
          onClick={handleScan}
        >
          {busy ? '处理中…' : '重新扫描'}
        </button>
        {!confirming && (
          <button
            type="button"
            className="btn danger"
            data-testid="cleanup-images-start"
            disabled={busy || scan === null || scan.unused.length === 0}
            onClick={() => setConfirming(true)}
          >
            清理未使用图片…
          </button>
        )}
      </div>
    </div>
  )
}