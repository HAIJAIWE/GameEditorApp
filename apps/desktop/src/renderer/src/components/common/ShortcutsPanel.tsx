import { useT } from '@mobai/client-ui'
import { APP_SHORTCUTS } from '@mobai/shared/util/ui'

import PanelShell from './PanelShell'

/**
 * 快捷键参考面板（对齐 旧版 `ui/shortcuts_dialog::ShortcutsDialog`，
 * 菜单入口 `帮助 → 快捷键参考`）。
 *
 * ## 与 旧版 的关键差异（**不是漏做，是有意的**）
 * 旧版 按 6 个分类（file/edit/data/view/ai/navigation）列出 `common/shortcuts` 的
 * **35 条**快捷键；TS 侧**只列真实注册的 3 条**（见 `shared/util/ui/shortcuts.ts` 的说明）。
 * 照抄那 35 条会给 32 个「按了没反应」的键做广告 —— 与状态栏快捷键提示同一取舍。
 * 因此本面板**不分组**（3 条全属 `edit`，分组标题行反而是噪声）。
 *
 * 另：`Escape`（关闭浮层/下拉）刻意不列入 —— 它是交互键而非命令键，旧版 表里也没有。
 *
 * 表格样式沿用项目既有的 `score-table`（与 `WordStatsPanel` / `FieldDepsPanel` 同款），
 * 不自造一套。浮层头部已有统一的「关闭」按钮，故本组件**不接收 `onClose`**。
 */
export default function ShortcutsPanel() {
  const t = useT()
  return (
    <PanelShell
      testId="shortcuts-panel"
      toolbar={<span className="item-meta">{t('shortcuts.subtitle', { count: APP_SHORTCUTS.length })}</span>}
    >
        <div className="changelog-entry">
          <table className="score-table" data-testid="shortcuts-table">
            <thead>
              <tr>
                <th>{t('shortcuts.col.keys')}</th>
                <th>{t('shortcuts.col.action')}</th>
                <th>{t('shortcuts.col.description')}</th>
              </tr>
            </thead>
            <tbody>
              {APP_SHORTCUTS.map((shortcut) => (
                <tr key={shortcut.id} data-testid="shortcuts-row">
                  <td>{shortcut.keys}</td>
                  <td>{shortcut.action}</td>
                  <td>{t(shortcut.labelKey)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="item-meta">{t('shortcuts.note')}</div>
    </PanelShell>
  )
}