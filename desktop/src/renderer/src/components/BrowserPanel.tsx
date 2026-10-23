import { useCallback, useEffect, useRef, useState } from 'react'

import { normalizeUrlInput } from '../utils/urlInput'

/**
 * 浏览器面板（中间窗口「浏览器」页签）——内嵌 webview。
 *
 * ## 为什么是 webview 而不是 <iframe>
 * iframe 受父文档 CSP 约束（本应用生产构建带严格 CSP），且很多站点用
 * X-Frame-Options 拒绝被嵌；webview 是**独立 guest 进程**，不受父文档 CSP
 * 与对方帧策略影响，与 Chrome 体验一致。代价是主进程要开 `webviewTag`
 * （已在 index.ts 开启，注释说明安全边界）。
 *
 * ## 定位
 * 预览生成的 HTML Demo、查资料、看本地文档。地址栏归一化规则见
 * `utils/urlInput.ts`（http(s) 原样 / localhost 补 http / 盘符路径转 file:///）。
 */

const HOME_HINT = 'about:blank'

interface BrowserPanelProps {
  /** 初始地址（默认 about:blank，由用户在地址栏输入） */
  initialUrl?: string
}

export default function BrowserPanel({ initialUrl = HOME_HINT }: BrowserPanelProps): React.JSX.Element {
  const [input, setInput] = useState(initialUrl === HOME_HINT ? '' : initialUrl)
  const [src, setSrc] = useState(initialUrl)
  const [status, setStatus] = useState('')
  const webviewRef = useRef<HTMLWebViewElement | null>(null)

  /*
   * webview 的 did-load 三事件**不是 React 合成事件**——JSX props 形式会被
   * React 判为 unknown handler 直接忽略（控制台有 warning）。必须用
   * addEventListener 命令式挂。Electron 把参数挂在 event 自身上
   * （errorDescription 等），个别版本走 detail，两处都读。
   */
  useEffect(() => {
    const el = webviewRef.current
    if (el === null) return
    const onStart = (): void => setStatus('加载中…')
    const onStop = (): void => setStatus('')
    const onFail = (event: Event): void => {
      const carrier = event as unknown as { errorDescription?: string; detail?: { errorDescription?: string } }
      setStatus(`加载失败：${carrier.errorDescription ?? carrier.detail?.errorDescription ?? '未知错误'}`)
    }
    el.addEventListener('did-start-loading', onStart)
    el.addEventListener('did-stop-loading', onStop)
    el.addEventListener('did-fail-load', onFail)
    return () => {
      el.removeEventListener('did-start-loading', onStart)
      el.removeEventListener('did-stop-loading', onStop)
      el.removeEventListener('did-fail-load', onFail)
    }
  }, [src])

  const go = useCallback((target: string): void => {
    setSrc(target)
    setStatus('')
  }, [])

  const onSubmit = useCallback(
    (e: React.FormEvent): void => {
      e.preventDefault()
      go(normalizeUrlInput(input))
    },
    [input, go]
  )

  return (
    <div className="browser-panel" data-testid="browser-panel">
      <form className="browser-bar" onSubmit={onSubmit}>
        <button
          type="button"
          className="btn slim"
          title="后退"
          data-testid="browser-back"
          onClick={() => webviewRef.current?.goBack()}
        >
          ←
        </button>
        <button
          type="button"
          className="btn slim"
          title="前进"
          data-testid="browser-forward"
          onClick={() => webviewRef.current?.goForward()}
        >
          →
        </button>
        <button
          type="button"
          className="btn slim"
          title="刷新"
          data-testid="browser-reload"
          onClick={() => webviewRef.current?.reload()}
        >
          ⟳
        </button>
        <button
          type="button"
          className="btn slim"
          title="主页（空白页）"
          data-testid="browser-home"
          onClick={() => {
            setInput('')
            go(HOME_HINT)
          }}
        >
          ⌂
        </button>
        <input
          className="browser-url"
          data-testid="browser-url"
          value={input}
          placeholder="输入网址或本地文件路径（C:\\...\\demo.html），回车打开"
          onChange={(e) => setInput(e.target.value)}
        />
      </form>
      {src === HOME_HINT ? (
        <div className="browser-empty" data-testid="browser-empty">
          <p>内置浏览器</p>
          <p className="browser-empty-sub">
            输入网址打开网页，或粘贴本地 HTML Demo 路径直接预览
            <br />
            例：D:\GameEditorApp\docs\demo.html
          </p>
        </div>
      ) : (
        <webview
          ref={webviewRef}
          src={src}
          className="browser-view"
          data-testid="browser-view"
        />
      )}
      {status !== '' && <div className="browser-status">{status}</div>}
    </div>
  )
}
