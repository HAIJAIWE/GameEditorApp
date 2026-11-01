import type { ReactNode } from 'react'

import { useT } from '@mobai/client-ui'

/**
 * 全局面板浮层（中栏 + 停靠区整体被面板占据）。
 *
 * 从 `App.tsx` 原样抽出：此前它作为 `panelId !== null` 分支内联在 App 的 JSX 里，
 * 把「外壳编排」和「面板容器」混在一处。抽出后 App 只决定**何时**显示面板，
 * 这里只负责面板的**容器骨架**（标题栏 + 关闭按钮 + 内容区）。
 *
 * ⚠️ 纯展示：不加任何包裹元素（外层仍是原来的 `.panel-overlay`），
 * `className` / `data-testid` 逐字保留。面板本体与 `AppContextProvider` 由调用方
 * 作为 `children` 传入 —— Provider 的嵌套顺序仍写在 App 里，一眼可见、不会被动挪位。
 */
export function AppPanelOverlay({
  panelTitle,
  onClose,
  children
}: {
  /** 浮层标题（`panel` 能力自带的 title，缺失时回退为 id；两者都缺时为 null） */
  panelTitle: string | null
  onClose: () => void
  /** 面板本体（App 侧包好 `AppContextProvider`） */
  children: ReactNode
}) {
  const t = useT()
  return (
    <div className="panel-overlay">
      <div className="panel-overlay-header">
        <span className="chapter-form-title">{panelTitle}</span>
        <button type="button" className="btn" data-testid="panel-close" onClick={() => onClose()}>
          {t('common.close')}
        </button>
      </div>
      <div className="panel-overlay-body">{children}</div>
    </div>
  )
}
