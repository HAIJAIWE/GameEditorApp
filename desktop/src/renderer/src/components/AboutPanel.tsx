/**
 * 关于面板（对齐 旧版 `ui/main_window::_show_about`，菜单入口 `帮助 → 关于墨白编辑器`）。
 *
 * 旧版 是一段 `QMessageBox.about` 的静态 HTML（标题 / 版本 / 定位 / 两行小字）。
 * TS 侧沿用同样的文案与层次，但**版本号取真实 `app:info`**（由 `App.tsx` 传入），
 * 不硬编码 —— 硬编码的版本号必然随发布漂移。
 *
 * 浮层头部已有统一的「关闭」按钮（`App.tsx` 的 `panel-overlay-header`），
 * 故本组件**不接收 `onClose`**；只渲染内容。
 */

interface AboutPanelProps {
  /** 应用版本（来自 `app:info`；null = 尚未读到，展示占位文案而非假版本号） */
  version: string | null
}

export default function AboutPanel({ version }: AboutPanelProps) {
  return (
    <div className="editor" data-testid="about-panel">
      <div className="editor-header">
        <div className="editor-title">
          墨白可视化编辑器
          <small data-testid="about-panel-version">{version === null ? '正在读取版本…' : `版本 ${version}`}</small>
        </div>
      </div>

      <div className="editor-body">
        {/* 旧版 用 <hr> 分隔正文与落款；此处用两个 changelog-entry 分块，视觉层次等价 */}
        <div className="changelog-entry">
          <div>面向游戏开发者的数据配置与策划工具平台</div>
        </div>

        <div className="changelog-entry">
          <div className="item-meta">
            内置 Agent 系统 · 属性计算引擎 · 策划书编辑器
            <br />
            支持 Unity / Unreal / Godot / Cocos2d 引擎导出
          </div>
        </div>
      </div>
    </div>
  )
}