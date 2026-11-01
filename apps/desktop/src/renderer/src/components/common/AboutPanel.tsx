/**
 * 关于面板。
 *
 * 旧版 是一段 `QMessageBox.about` 的静态 HTML（标题 / 版本 / 定位 / 两行小字）。
 * TS 侧沿用同样的文案与层次，但**版本号取真实 `app:info`**（由 `App.tsx` 传入），
 * 不硬编码 —— 硬编码的版本号必然随发布漂移。
 *
 * 浮层头部已有统一的「关闭」按钮（`App.tsx` 的 `panel-overlay-header`），
 * 故本组件**不接收 `onClose`**；只渲染内容。
 */

import { useT } from '@mobai/client-ui'

interface AboutPanelProps {
  /** 应用版本（来自 `app:info`；null = 尚未读到，展示占位文案而非假版本号） */
  version: string | null
}

export default function AboutPanel({ version }: AboutPanelProps) {
  const t = useT()
  return (
    <div className="editor" data-testid="about-panel">
      <div className="editor-header">
        <div className="editor-title">
          {t('about.appName')}
          <small data-testid="about-panel-version">
            {version === null ? t('about.readingVersion') : t('about.version', { version })}
          </small>
        </div>
      </div>

      <div className="editor-body">
        {/* 旧版 用 <hr> 分隔正文与落款；此处用两个 changelog-entry 分块，视觉层次等价 */}
        <div className="changelog-entry">
          <div>{t('about.tagline')}</div>
        </div>

        <div className="changelog-entry">
          <div className="item-meta">
            {t('about.features')}
            <br />
            {t('about.engines')}
          </div>
        </div>
      </div>
    </div>
  )
}