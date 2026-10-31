import {
  CESHU_EXPORT_FORMATS,
  CESHU_FORMAT_LABELS,
  contentChapterCount,
  type CeshuExportFormat
} from '../../../../shared/ceshu/reference'
import type { PluginHost } from '../../../../shared/plugin/host'
import { LucideIcon } from '../common'
import { MenuMount } from '../../plugins/host'

/**
 * 策划书编辑器顶部工具栏（返回 / 书名 / 版本 / 档位 / 总进度 / 各动作入口 / 导出格式）。
 *
 * 纯展示件：所有状态与动作都在 `CeshuView` 里，本组件只负责摆版。
 * 返回的**就是** `<header className="toolbar">` 本身——不额外包一层容器，
 * 保证 DOM 结构与拆分前逐字一致。
 */
interface CeshuToolbarProps {
  gameName: string
  /** 版本号（`doc.version_label`） */
  versionLabel: string
  /** 是否为激活版本（决定「★ 激活 / · 未激活」与「设为激活」按钮） */
  isActive: boolean
  /** 文档档位（标准版 / 专业版） */
  scope: 'full' | 'lite'
  /** 总进度百分比（已取整） */
  totalPct: number
  busy: boolean
  /** 全局待审字段数（跨章 AI 草稿） */
  pendingReviewCount: number
  /** 数据栏是否展开 */
  previewOpen: boolean
  exportFormat: CeshuExportFormat
  /** 「更多 ▸」菜单（`ceshuMenusPlugin`）的宿主 */
  host: PluginHost
  onBack: () => void
  onSetActive: () => void
  onValidate: () => void
  onOpenReview: () => void
  onTogglePreview: () => void
  onOpenAiFull: () => void
  /** 工具栏入口是「全局生成」：不传参数，面板默认全选 */
  onOpenAiDataGen: () => void
  onExportFormatChange: (format: CeshuExportFormat) => void
  onExport: () => void
}

export default function CeshuToolbar({
  gameName,
  versionLabel,
  isActive,
  scope,
  totalPct,
  busy,
  pendingReviewCount,
  previewOpen,
  exportFormat,
  host,
  onBack,
  onSetActive,
  onValidate,
  onOpenReview,
  onTogglePreview,
  onOpenAiFull,
  onOpenAiDataGen,
  onExportFormatChange,
  onExport
}: CeshuToolbarProps) {
  return (
    <header className="toolbar">
      <button
        type="button"
        className="btn"
        data-testid="ceshu-back"
        title="返回策划书首页"
        onClick={onBack}
      >
        <LucideIcon name="chevron-left" size={18} />
        返回
      </button>
      <h1>{gameName}</h1>
      <span className="item-meta" data-testid="ceshu-version">
        {versionLabel}
        {isActive ? ' ★ 激活' : ' · 未激活'}
      </span>
      <span className="item-meta">
        档位：
        {scope === 'lite'
          ? `标准版（${contentChapterCount('lite')} 章）`
          : `专业版（${contentChapterCount('full')} 章）`}
      </span>
      <span className="item-meta" data-testid="ceshu-total-progress">
        总进度 {totalPct}%
      </span>
      {!isActive && (
        <button type="button" className="btn" data-testid="ceshu-set-active" disabled={busy} onClick={onSetActive}>
          设为激活
        </button>
      )}
      <button type="button" className="btn accent-outline" data-testid="ceshu-validate" disabled={busy} onClick={onValidate}>
        校验
      </button>
      {/* 全局审阅入口：跨章列出 AI 草稿字段，逐条接受 / 跳转 */}
      <button
        type="button"
        className={`btn${pendingReviewCount > 0 ? ' accent-outline' : ''}`}
        data-testid="ceshu-review-toggle"
        disabled={busy}
        title="跨章列出 AI 草稿字段，逐条接受"
        onClick={onOpenReview}
      >
        待审 {pendingReviewCount}
      </button>
      {/*
        数据栏开关。布局心智：**左栏 + 中间 = 工作区，右栏 = 智能体**。
        数据预览属于工作区的一部分（写文档时要对照数据），但它不该和智能体并排抢宽度 ——
        写正文时把它收起来，表单立刻拿回 44% 的宽度。
        状态持久化：这是「工作姿势」偏好，每次重开都要重新点会很烦。
      */}
      <button
        type="button"
        className="btn"
        data-testid="ceshu-preview-toggle"
        aria-pressed={previewOpen}
        title={previewOpen ? '收起数据栏，让章节表单占满工作区' : '展开数据栏（对照角色/技能等数据）'}
        onClick={onTogglePreview}
      >
        {previewOpen ? '收起数据' : '数据栏'}
      </button>
      <button type="button" className="btn accent-outline" data-testid="ceshu-ai-full" disabled={busy} onClick={onOpenAiFull}>
        AI 一键生成
      </button>
      <button
        type="button"
        className="btn accent-outline"
        data-testid="ceshu-ai-datagen"
        disabled={busy}
        onClick={onOpenAiDataGen}
      >
        AI 生成数据
      </button>
      {/* 「更多 ▸」菜单（Slice 16）：结构与动作由 ceshuMenusPlugin 声明，MenuMount 在此渲染 */}
      <MenuMount host={host} mount="ceshu.toolbar" busy={busy} />
      <select
        className="form-select export-format"
        data-testid="export-format"
        value={exportFormat}
        onChange={(event) => onExportFormatChange(event.target.value as CeshuExportFormat)}
      >
        {CESHU_EXPORT_FORMATS.map((format) => (
          <option key={format} value={format}>
            {CESHU_FORMAT_LABELS[format]}
          </option>
        ))}
      </select>
      <button type="button" className="btn accent-outline" data-testid="ceshu-export" disabled={busy} onClick={onExport}>
        导出
      </button>
    </header>
  )
}
