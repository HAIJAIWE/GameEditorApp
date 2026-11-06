import { useT } from '@mobai/client-ui'
import {
  CHAPTER_LABELS,
  CHAPTER_PARTS,
  MODULE_CHAPTERS,
  UNIVERSAL_CORE_CHAPTERS,
  enabledModuleChapters,
  type CeshuDocument,
  type ChapterKey
} from '@mobai/shared/ceshu/reference'

/**
 * 系统模块勾选（2026-10-26，见 `docs/gdd-universal-core.md`）。
 *
 * 「通用底座」恒有、不可取消；「系统模块」按项目勾选——勾了才出现在章节导航与完成度里。
 * 开关写进 `meta.enabled_modules`（随「文档信息」保存）；缺省 = 全部模块（老文档零变化）。
 */
interface CeshuModulePickerProps {
  doc: CeshuDocument
  onToggle: (module: ChapterKey, enabled: boolean) => void
  /** 批量设置启用模块（分组开关 / 预设用）：一次写盘，避免逐章 onToggle 读脏 doc.meta 互相覆盖 */
  onSetModules?: (chapters: ChapterKey[]) => void
  /** 关闭（Slice 15 起为内联气泡视图：没有它就关不掉）。省略 = 不画关闭按钮 */
  onClose?: () => void
}

export default function CeshuModulePicker({ doc, onToggle, onSetModules, onClose }: CeshuModulePickerProps) {
  const t = useT()
  const enabled = new Set(enabledModuleChapters(doc))

  // 最小核心 = 仅核心设计分组的模块章（关闭制作与商业 / 扩展设计）；属产品口径，可按需调整
  const coreModules: ChapterKey[] = (CHAPTER_PARTS.find((part) => part.key === 'core')?.chapters ?? []).filter(
    (chapter) => MODULE_CHAPTERS.includes(chapter)
  )
  const handlePresetCore = () => {
    if (onSetModules === undefined) return
    onSetModules(MODULE_CHAPTERS.filter((chapter) => coreModules.includes(chapter)))
  }
  const handleGroupToggle = (chapters: ChapterKey[], allEnabled: boolean) => {
    if (onSetModules === undefined) return
    const next = new Set(enabled)
    if (allEnabled) chapters.forEach((chapter) => next.delete(chapter))
    else chapters.forEach((chapter) => next.add(chapter))
    onSetModules(MODULE_CHAPTERS.filter((chapter) => next.has(chapter)))
  }

  return (
    <div className="module-picker" data-testid="module-picker">
      {onClose !== undefined && (
        <div className="module-picker-actions">
          <button type="button" className="btn slim" data-testid="module-picker-close" onClick={onClose}>
            {t('common.close')}
          </button>
        </div>
      )}
      <div className="module-picker-core">
        <div className="module-picker-title">{t('ceshu.modulePicker.core')}</div>
        <div className="module-picker-chips">
          {UNIVERSAL_CORE_CHAPTERS.map((chapter) => (
            <span key={chapter} className="module-chip core">
              {CHAPTER_LABELS[chapter]}
            </span>
          ))}
        </div>
      </div>
      <div className="module-picker-modules">
        <div className="module-picker-title">{t('ceshu.modulePicker.modules')}</div>
        {onSetModules !== undefined && (
          <div className="module-picker-actions">
            <button
              type="button"
              className="btn slim"
              data-testid="module-preset-core"
              title={t('ceshu.modulePicker.presetCoreHint')}
              onClick={handlePresetCore}
            >
              {t('ceshu.modulePicker.presetCore')}
            </button>
          </div>
        )}
        {/* 按分区把可选模块分组显示（章节多时一长列难找）；testid 仍是 `module-toggle-<章>`，行为不变 */}
        {CHAPTER_PARTS.map((part) => {
          const chapters = part.chapters.filter((chapter) => MODULE_CHAPTERS.includes(chapter))
          if (chapters.length === 0) return null
          const groupAllEnabled = chapters.every((chapter) => enabled.has(chapter))
          return (
            <div key={part.key} className="module-group" data-testid={`module-group-${part.key}`}>
              <div className="module-picker-title">
                {part.label}
                {onSetModules !== undefined && (
                  <button
                    type="button"
                    className="btn slim link"
                    data-testid={`module-group-toggle-${part.key}`}
                    onClick={() => handleGroupToggle(chapters, groupAllEnabled)}
                  >
                    {groupAllEnabled ? t('ceshu.modulePicker.groupAllOff') : t('ceshu.modulePicker.groupAllOn')}
                  </button>
                )}
              </div>
              <div className="module-picker-list">
                {chapters.map((chapter) => (
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
          )
        })}
      </div>
    </div>
  )
}
