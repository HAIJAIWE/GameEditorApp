import { useCallback, useEffect, useState } from 'react'

import { useT } from '@mobai/client-ui'
import {
  IMAGE_EXTENSIONS,
  collectReferencedImagePaths,
  diffUnusedImages,
  previewUnused,
  summarizeScan
} from '@mobai/shared/util/io'
import type { UnusedImageScan } from '@mobai/shared/util/io'
import { toErrorMessage } from '@mobai/shared/util/system'

/**
 * 清理未使用图片面板（对齐 旧版 `src/features/advanced:373-431` 的
 * `cleanup_unused_images`，入口 `menus:110`「工具 → 清理未使用图片」
 * 与 `settings_dialog:428`）。
 *
 * ## 旧版 做了什么（逐行读过 `advanced:373-431`）
 * 1. 遍历全库数据，收集字段名 ∈ {`image`,`icon`,`avatar`,`img`} 且值为非空字符串的路径；
 * 2. `data_dir.rglob('*' + ext)` 扫出 7 种图片扩展名；
 * 3. 做差集得「未使用」；为空则弹一句「未发现未使用的图片」；
 * 4. `QMessageBox.question(Yes|No)` 问一次「是否删除」（附「操作不可恢复，建议先备份」）；
 * 5. 逐个 `unlink()`，失败只记 warning，最后如实报「已删除 N/M 张」。
 *
 * ## 与 旧版 的差异（**都是加护栏 / 说得更清楚**，不是漏做）
 * - **先扫描、先展示清单，再让用户确认**：旧版 只报一个数字（`发现 N 张`）就问Yes/No，
 *   用户根本不知道要删的是哪些文件。TS 侧把**完整路径清单**摆出来（>50 条折叠），
 *   确认语里带上数量，确认区点明「**删除文件不可撤销**」。
 * - **不可撤销的后果写明**：与 `ClearAllPanel` 不同，数据删除走撤销栈能 Ctrl+Z 找回，
 *   而**文件删除进不了撤销栈**（主进程只unlink），所以这里必须说清「先备份」。
 * - **删除结果绝不假装全成功**：沿用 旧版 的 `已删除 N/M 张` 口径，
 *   并把失败条目逐条列出。
 * - **悬空引用如实告知**：数据里引用了但目录里不存在的图片，会算进 旧版 的
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
 *   listLibraryImages(): Promise<{ dir: string; libraryDir: string; files: string[] }>
 *   deleteImages(req: { paths: string[]; confirm: boolean }): Promise<{ deleted: number; failed: string[] }>
 * }
 * ```
 * 接线前本面板显示「尚未接线」的提示而不是报错——刻意不 import 未改动的
 * `shared/ipc.ts`（`IpcContract` 里还没有这两个通道，import 了反而会连带要求改契约文件）。
 */

interface ImagesApi {
  /** 列出图片目录下的全部图片文件（主进程 rglob 7 种扩展名）；`dir` 为实际扫描的目录 */
  listLibraryImages(): Promise<{ dir: string; libraryDir: string; files: string[] }>
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
  const t = useT()
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
    /*
     * ⚠️ 用 `listing.libraryDir`（库根）而不是 `listing.dir`（images 目录）当基准：
     * 字段里的 `images/xxx.png` 是相对库根的。用错基准会让"已引用"被判成"未引用"，
     * 用户一清理就把正在用的图删了。
     */
    const referencedKeys = collectReferencedImagePaths(records, listing.libraryDir)
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
      setError(t('cleanupImages.notWired'))
      return
    }
    const targets = state.scan.unused
    setBusy(true)
    setError(null)
    api
      .deleteImages({ paths: targets, confirm: true })
      .then((res) => {
        // 与 旧版 同一口径：如实报「成功数/总数」，失败条目逐条列出
        setResult(t('cleanupImages.result', { deleted: res.deleted, total: targets.length }))
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
          {t('cleanupImages.title')}
          <small>{t('cleanupImages.subtitle')}</small>
        </div>
      </div>

      <div className="editor-body">
        <div className="form-hint">{t('cleanupImages.hint', { exts: IMAGE_EXTENSIONS.join(' / ') })}</div>

        {state.status === 'loading' && <div className="empty">{t('cleanupImages.loading')}</div>}

        {state.status === 'unwired' && (
          <div className="empty" data-testid="cleanup-images-unwired">
            {t('cleanupImages.unwired')}
          </div>
        )}

        {state.status === 'error' && (
          <div className="form-error" data-testid="cleanup-images-scan-error">
            {t('cleanupImages.scanError', { message: state.message })}
          </div>
        )}

        {scan !== null && preview !== null && (
          <>
            <div className="form-row">
              <span className="form-label">{t('cleanupImages.scanResult')}</span>
              <span data-testid="cleanup-images-summary">{summarizeScan(scan)}</span>
            </div>

            {scan.unused.length === 0 ? (
              <div className="empty" data-testid="cleanup-images-clean">
                {t('cleanupImages.clean')}
              </div>
            ) : (
              <>
                {/* 破坏性操作的风险提示（与 ClearAllPanel 的 delete 确认同一条样式类） */}
                <div className="danger-hint" data-testid="cleanup-images-warning">
                  {t('cleanupImages.warning1', {
                    count: scan.unused.length,
                    dir: state.status === 'ready' ? state.dir : ''
                  })}
                  <br />
                  {t('cleanupImages.warning2')}
                </div>

                <div className="form-row">
                  <span className="form-label">{t('cleanupImages.pendingList')}</span>
                  <div style={{ maxHeight: 220, overflow: 'auto' }}>
                    {preview.shown.map((path) => (
                      <div key={path} data-testid="cleanup-images-item" style={{ wordBreak: 'break-all' }}>
                        {path}
                      </div>
                    ))}
                    {preview.hiddenCount > 0 && (
                      <div className="form-hint" data-testid="cleanup-images-more">
                        {t('cleanupImages.more', { count: preview.hiddenCount })}
                      </div>
                    )}
                  </div>
                </div>

                {confirming && (
                  <div className="form-row" data-testid="cleanup-images-confirm">
                    <span className="form-label">{t('cleanupImages.confirmPrompt', { count: scan.unused.length })}</span>
                    <button
                      type="button"
                      className="btn danger"
                      data-testid="cleanup-images-confirm-yes"
                      disabled={busy}
                      onClick={handleDelete}
                    >
                      {t('cleanupImages.confirm')}
                    </button>
                    <button
                      type="button"
                      className="btn"
                      data-testid="cleanup-images-confirm-no"
                      disabled={busy}
                      onClick={() => setConfirming(false)}
                    >
                      {t('cleanupImages.cancel')}
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
            {t('cleanupImages.failures', { count: failures.length })}
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
          {busy ? t('cleanupImages.processing') : t('cleanupImages.rescan')}
        </button>
        {!confirming && (
          <button
            type="button"
            className="btn danger"
            data-testid="cleanup-images-start"
            disabled={busy || scan === null || scan.unused.length === 0}
            onClick={() => setConfirming(true)}
          >
            {t('cleanupImages.start')}
          </button>
        )}
      </div>
    </div>
  )
}