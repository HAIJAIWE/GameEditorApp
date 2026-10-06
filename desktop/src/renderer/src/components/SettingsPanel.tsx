import { useState } from 'react'

import {
  applyFontSize,
  applyTheme,
  DEFAULT_FONT_SIZE,
  loadConfirmDelete,
  loadFontSize,
  loadTheme,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  saveConfirmDelete,
  saveFontSize,
  saveTheme,
  THEME_OPTIONS,
  type ThemeMode
} from '../../../shared/settingsPreferences'

/**
 * 设置面板（对齐 Python `ui/dialogs/settings_dialog.py`，菜单入口 `设置 → 打开设置...`）。
 *
 * Python 是 4 页签（通用 / AI / 编辑器 / 工具）的 QDialog。**TS 侧本轮只做三项**，
 * 其余五项**刻意不做**（逐条依据见 `shared/settingsPreferences.ts` 末尾的表格）：
 * API Key 三类配置（要动主进程加密存储 = 敏感面）、语言下拉（无 i18n 框架）、
 * 自动保存（TS 侧不存在该功能）、界面布局（IA 已重写为无侧栏单栈，不是三栏）、
 * 工具页开关（未核实消费者）。**宁可少做，不做假控件。**
 *
 * ## 三项各自的状态来源（读写全部委托 `shared/settingsPreferences`，组件只管渲染）
 * - **字体大小**：`loadFontSize` 惰性初值 → `saveFontSize` 落盘 + `applyFontSize` **立即生效**
 * - **主题**：委托 `theme.ts`（唯一真源），面板只提供二选一入口
 * - **删除时确认**：`loadConfirmDelete` 惰性初值 → `saveConfirmDelete`，消费者 `BatchEditPanel`
 *
 * ## 交互约定
 * - **不接收 `onClose`**：浮层头部已有统一的「关闭」按钮（同 `GameDataPreviewPanel`/
 *   `ClearAllPanel`），多传一个 prop 只会被 eslint 判为未使用参数。
 * - **偏好即时保存、无「确定/取消」**：这三项都是可逆的低风险偏好。主题与字号都是
 *   当场预览，若要支持「取消」就得额外存一份草稿态，属过度开发。
 * - **字号输入用草稿态提交**（`draft`）：允许用户打到一半（空串/半截数字）不被立即
 *   纠回；失焦或回车才提交。派生值用惰性表达式，无 effect 同步 setState。
 */

/** 输入框的本地草稿态：`editing=false` 时输入框显示已保存值（受控于偏好） */
type FontSizeDraft = { editing: false } | { editing: true; text: string }

export default function SettingsPanel() {
  /* ---- 三项偏好：惰性初值（useState 的函数形式，避免每次渲染都读一遍 storage） ---- */
  const [fontSize, setFontSize] = useState<number>(() => loadFontSize())
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme())
  const [confirmDelete, setConfirmDelete] = useState<boolean>(() => loadConfirmDelete())
  const [draft, setDraft] = useState<FontSizeDraft>({ editing: false })

  /* ---- 字号：失焦或回车才提交 ---- */
  const commitFontSize = (raw: string): void => {
    setDraft({ editing: false })
    // 空串 = 用户清空后直接失焦 ⇒ 保持现值不动（跳回默认是用户没要求的动作）
    if (raw.trim() === '') return
    const normalized = saveFontSize(raw)
    setFontSize(normalized)
    applyFontSize(normalized)
  }

  const handleThemeChange = (next: ThemeMode): void => {
    setTheme(next)
    saveTheme(next)
    applyTheme(next)
  }

  const handleConfirmDeleteChange = (next: boolean): void => {
    setConfirmDelete(next)
    saveConfirmDelete(next)
  }

  return (
    <div className="editor" data-testid="settings-panel">
      <div className="editor-header">
        <div className="editor-title">
          设置
          <small>偏好即时生效并自动保存，无需点确定</small>
        </div>
      </div>

      <div className="editor-body">
        <div className="form-section">
          <div className="form-section-head">
            <span className="form-section-title">通用设置</span>
          </div>
          <div className="form-section-body">
            {/* 主题：TS 只有浅/深两档（见 theme.ts 的「有意不做：不做多套主题」） */}
            <div className="form-row">
              <span className="form-label">主题</span>
              <select
                className="form-select"
                data-testid="settings-theme"
                aria-label="主题"
                value={theme}
                onChange={(event) => handleThemeChange(event.target.value as ThemeMode)}
              >
                {THEME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="item-meta" data-testid="settings-theme-current">
              当前：{theme === 'dark' ? '深色' : '浅色'}
              （本版仅深/浅两档，不含 Python 的 10 套 QSS 主题）
            </div>

            {/* 字体大小：立即生效（优于 PyQt 的「需重启」，故如实说明而非照抄） */}
            <div className="form-row">
              <label className="form-label" htmlFor="settings-font-size">
                字体大小
              </label>
              <input
                id="settings-font-size"
                className="form-input"
                data-testid="settings-font-size"
                type="number"
                step={1}
                min={MIN_FONT_SIZE}
                max={MAX_FONT_SIZE}
                value={draft.editing ? draft.text : String(fontSize)}
                onChange={(event) => setDraft({ editing: true, text: event.target.value })}
                onBlur={(event) => commitFontSize(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') commitFontSize(event.currentTarget.value)
                }}
              />
              <span className="form-label">px</span>
            </div>
            <div className="item-meta" data-testid="settings-font-size-hint">
              范围 {MIN_FONT_SIZE}–{MAX_FONT_SIZE}px，默认 {DEFAULT_FONT_SIZE}px。
              <b>立即生效</b>（改的是全站 CSS 缩放系数，无需重启）—— Python 侧受 Qt 限制才需重启。
            </div>

            {/* 删除时确认：默认开启；关闭后删除直接执行，必须如实告知破坏性 */}
            <div className="form-row">
              <span className="form-label">确认删除</span>
              <label className="ai-gen-check" htmlFor="settings-confirm-delete">
                <input
                  id="settings-confirm-delete"
                  type="checkbox"
                  data-testid="settings-confirm-delete"
                  checked={confirmDelete}
                  onChange={(event) => handleConfirmDeleteChange(event.target.checked)}
                />
                删除时确认
              </label>
            </div>
            {confirmDelete ? (
              <div className="item-meta" data-testid="settings-confirm-delete-hint">
                已开启：批量删除会先出现「确认删除 / 取消」两个按钮，点错还有退路。
              </div>
            ) : (
              <div className="danger-hint" data-testid="settings-confirm-delete-danger">
                已关闭：批量删除将<b>直接执行且不再二次确认</b>，点错无法撤回。
              </div>
            )}
          </div>
        </div>

        {/* ---- 范围外项目：显式列出并说明为何不做（静默省略会让用户以为漏做了） ---- */}
        <div className="item-meta" data-testid="settings-out-of-scope">
          本版未提供：语言（无多语言框架）、自动保存（本应用无自动保存）、界面布局（已固定为单栏工作区）、
          AI 模型 API Key（密钥走主进程加密存储，渲染层不读取明文）。
        </div>
      </div>
    </div>
  )
}