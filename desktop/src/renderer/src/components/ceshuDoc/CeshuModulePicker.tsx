import {
  CHAPTER_LABELS,
  MODULE_CHAPTERS,
  UNIVERSAL_CORE_CHAPTERS,
  enabledModuleChapters,
  type CeshuDocument,
  type ChapterKey
} from '../../../../shared/ceshu/reference'

/**
 * 系统模块勾选（2026-10-26，见 `docs/gdd-universal-core.md`）。
 *
 * 「通用底座」恒有、不可取消；「系统模块」按项目勾选——勾了才出现在章节导航与完成度里。
 * 开关写进 `meta.enabled_modules`（随「文档信息」保存）；缺省 = 全部模块（老文档零变化）。
 */
interface CeshuModulePickerProps {
  doc: CeshuDocument
  onToggle: (module: ChapterKey, enabled: boolean) => void
  /** 关闭（Slice 15 起为内联气泡视图：没有它就关不掉）。省略 = 不画关闭按钮 */
  onClose?: () => void
}

export default function CeshuModulePicker({ doc, onToggle, onClose }: CeshuModulePickerProps) {
  const enabled = new Set(enabledModuleChapters(doc))

  return (
    <div className="module-picker" data-testid="module-picker">
      {onClose !== undefined && (
        <div className="module-picker-actions">
          <button type="button" className="btn slim" data-testid="module-picker-close" onClick={onClose}>
            关闭
          </button>
        </div>
      )}
      <div className="module-picker-core">
        <div className="module-picker-title">通用底座（恒有）</div>
        <div className="module-picker-chips">
          {UNIVERSAL_CORE_CHAPTERS.map((chapter) => (
            <span key={chapter} className="module-chip core">
              {CHAPTER_LABELS[chapter]}
            </span>
          ))}
        </div>
      </div>
      <div className="module-picker-modules">
        <div className="module-picker-title">系统模块（勾选启用）</div>
        <div className="module-picker-list">
          {MODULE_CHAPTERS.map((chapter) => (
            <label key={chapter} className="module-check">
              <input
                type="checkbox"
                data-testid={`module-toggle-${chapter}`}
                checked={enabled.has(chapter)}
                onChange={(event) => onToggle(chapter, event.target.checked)}
              />
              <span>{CHAPTER_LABELS[chapter]}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  )
}
