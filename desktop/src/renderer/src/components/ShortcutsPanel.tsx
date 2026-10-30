import { APP_SHORTCUTS } from '../../../shared/util/ui/shortcuts'

/**
 * 快捷键参考面板（对齐 旧版 `ui/shortcuts_dialog::ShortcutsDialog`，
 * 菜单入口 `帮助 → 快捷键参考`）。
 *
 * ## 与 旧版 的关键差异（**不是漏做，是有意的**）
 * 旧版 按 6 个分类（file/edit/data/view/ai/navigation）列出 `common/shortcuts` 的
 * **35 条**快捷键；TS 侧**只列真实注册的 3 条**（见 `shared/util/shortcuts.ts` 的说明）。
 * 照抄那 35 条会给 32 个「按了没反应」的键做广告 —— 与状态栏快捷键提示同一取舍。
 * 因此本面板**不分组**（3 条全属 `edit`，分组标题行反而是噪声）。
 *
 * 另：`Escape`（关闭浮层/下拉）刻意不列入 —— 它是交互键而非命令键，旧版 表里也没有。
 *
 * 表格样式沿用项目既有的 `score-table`（与 `WordStatsPanel` / `FieldDepsPanel` 同款），
 * 不自造一套。浮层头部已有统一的「关闭」按钮，故本组件**不接收 `onClose`**。
 */
export default function ShortcutsPanel() {
  return (
    <div className="editor" data-testid="shortcuts-panel">
      <div className="editor-header">
        <div className="editor-title">
          快捷键参考
          <small>仅列出本应用实际注册的快捷键（共 {APP_SHORTCUTS.length} 条）</small>
        </div>
      </div>

      <div className="editor-body">
        <div className="changelog-entry">
          <table className="score-table" data-testid="shortcuts-table">
            <thead>
              <tr>
                <th>快捷键</th>
                <th>操作</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {APP_SHORTCUTS.map((shortcut) => (
                <tr key={shortcut.keys} data-testid="shortcuts-row">
                  <td>{shortcut.keys}</td>
                  <td>{shortcut.action}</td>
                  <td>{shortcut.description}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="item-meta">
          输入框内不拦截这些组合键，保留文本框自身的撤销行为；macOS 下 Cmd 等效于 Ctrl。
        </div>
      </div>
    </div>
  )
}