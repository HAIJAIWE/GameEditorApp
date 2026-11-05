/**
 * 关于面板。
 *
 * 旧版 是一段 `QMessageBox.about` 的静态 HTML（标题 / 版本 / 定位 / 两行小字）。
 * TS 侧沿用同样的文案与层次，但**版本号取真实 `app:info`**（由 `App.tsx` 传入），
 * 不硬编码 —— 硬编码的版本号必然随发布漂移。
 *
 * 外壳（Phase A）：窗口标题与关闭按钮由 `AppPanelOverlay` 提供，本组件**不再重复画标题**，
 * 只把版本号放进 `PanelShell` 的工具条、正文放定位与特性说明。这样「关于」与其他面板
 * 的头部高度、正文内距、滚动归属一致。
 */

import { useT } from '@mobai/client-ui'

import PanelShell from './PanelShell'

interface AboutPanelProps {
  /** 应用版本（来自 `app:info`；null = 尚未读到，展示占位文案而非假版本号） */
  version: string | null
}

export default function AboutPanel({ version }: AboutPanelProps) {
  const t = useT()
  return (
    <PanelShell
      testId="about-panel"
      toolbar={
        <span className="item-meta" data-testid="about-panel-version">
          {version === null ? t('about.readingVersion') : t('about.version', { version })}
        </span>
      }
    >
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
    </PanelShell>
  )
}
