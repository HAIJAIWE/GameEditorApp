import { type MouseEvent as ReactMouseEvent } from 'react'

import type { PluginHost } from '../../../../shared/plugin/host'
import { CollapseIcon, ExpandIcon } from '../common/FullscreenIcons'
import { MainViewMount, type AppMainTab } from '../../plugins/host/MainViewMount'
import type { MainViewContextValue } from '../../plugins/host/mainViewContext'

/**
 * 右侧 AI 停靠栏（对齐 dsh 的 rightbar）+ 它的拖拽分隔条。
 *
 * 从 `App.tsx` 原样抽出：这块是**纯布局**——宽度、全屏、拖拽三个交互都由 App 持有状态，
 * 这里只按 props 渲染。原先内联在 App 里时，三栏外壳与页签挂载器混在一处，
 * 抽出来后 App 只负责「给宽度 / 给全屏态 / 给回调」。
 *
 * ⚠️ 两个根元素（分隔条 + `<aside>`）原样返回，**不包任何额外 div**（用 Fragment 平铺）：
 * `.main-body` 的直接子元素与 flex 排布因此完全不变。
 * `className` / `role` / `aria-*` / `data-testid` 逐字保留（e2e 直接命中 `ai-dock` 与 `ai-dock-resizer`）。
 */
export function AiDock({
  fullscreen,
  width,
  host,
  appTabs,
  context,
  onToggleFullscreen,
  onResizeStart,
  onResetWidth
}: {
  /** 右栏全屏：中栏让位，宽度交给 CSS（不再写死像素），拖拽条不渲染 */
  fullscreen: boolean
  /** 停靠栏宽度（px）；全屏时忽略 */
  width: number
  host: PluginHost
  /** 非插件页签逃生口（当前为空，见 App 的 `appTabs`） */
  appTabs: AppMainTab[]
  /** 主区视图共享状态（`MainViewProvider` 在挂载器内部消费） */
  context: MainViewContextValue
  onToggleFullscreen: () => void
  /** 拖拽开始（记录起点，App 侧维护） */
  onResizeStart: (event: ReactMouseEvent) => void
  /** 双击分隔条：宽度复位 */
  onResetWidth: () => void
}) {
  return (
    <>
      {/* 右栏拖拽分隔条：拖动改宽，双击复位；全屏时没有「宽」可调，不渲染 */}
      {!fullscreen && (
        <div
          className="ai-dock-resizer"
          role="separator"
          aria-orientation="vertical"
          aria-label="调整 AI 停靠栏宽度"
          title="拖拽调整宽度，双击复位"
          data-testid="ai-dock-resizer"
          onMouseDown={onResizeStart}
          onDoubleClick={onResetWidth}
        />
      )}
      <aside
        className={`ai-dock${fullscreen ? ' is-fullscreen' : ''}`}
        // 全屏宽度由 CSS 接管（flex 铺满），不再写死像素
        style={fullscreen ? undefined : { width }}
        data-testid="ai-dock"
      >
        {/* 右栏 = 停靠面板（对齐 dsh 的 rightbar）：策划书 / 数据编辑 / 代码编辑 /
            浏览器 / 会话都在这条页签里；中栏留给对话。 */}
        <MainViewMount
          host={host}
          appTabs={appTabs}
          context={context}
          actions={
            <button
              type="button"
              className="middle-tab-action"
              data-testid="dock-fullscreen"
              aria-pressed={fullscreen}
              aria-label={fullscreen ? '退出全屏' : '停靠区全屏'}
              title={fullscreen ? '退出全屏（Esc）' : '停靠区全屏'}
              onClick={onToggleFullscreen}
            >
              {fullscreen ? <CollapseIcon /> : <ExpandIcon />}
            </button>
          }
        />
      </aside>
    </>
  )
}
