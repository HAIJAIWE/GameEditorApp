import { useMemo, useState } from 'react'

import { useT } from '@mobai/client-ui'
import { getDocKind, templateOverlayForDoc } from '@mobai/shared/ceshu/model'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import { applyTemplateOverlay, specForKind, type DocumentSpec } from '@mobai/shared/documentSpec'

/**
 * 交付模板覆盖层编辑器（JSON）。
 *
 * 覆盖层只允许改「标签 / 顺序 / 模块默认开关」，校验与合并在
 * `documentSpec/templateOverlay`（zod 严格模式 + 排列校验）。本组件只负责：
 * 编辑 JSON → 实时校验 → 预览导出后的章序与标签 → 应用 / 清除。
 *
 * **作用域说明（重要）**：覆盖层经 `specForDoc(doc)` 生效，当前消费方是
 * 导出 / 交接包（`appHandoff`）。**编辑视图（章节导航）仍用默认模板**——因为
 * `ceshu/model` 被架构约束禁止 import `documentSpec`，编辑器侧的标签/顺序
 * 仍是模块级常量。要把编辑视图也接上，需要先把覆盖层下沉到中性模块再让两侧
 * 共用（见路线 P2），不在本次范围。
 *
 * 为什么用 JSON 文本而不是拖拽排序：覆盖层是**低频、偏专家**的配置，且需要能从
 * 外部复制粘贴；先把「能力可用」打通，可视化编辑器留后续。
 *
 * 一个刻意的语义：**空对象 `{}` = 无覆盖**。应用空对象时按「清除」处理，
 * 避免在文档里落一个「存在但什么都不改」的空覆盖层——那会让「是否自定义过」难以判断。
 */
interface CeshuTemplateOverlayPanelProps {
  doc: CeshuDocument
  /** 应用覆盖层（写 meta.template_overlay） */
  onApply: (overlay: Record<string, unknown>) => void | Promise<void>
  /** 清除覆盖层（删 meta.template_overlay） */
  onClear: () => void | Promise<void>
  onClose: () => void
}

function prettyOverlay(value: unknown): string {
  return JSON.stringify(value ?? {}, null, 2)
}

export default function CeshuTemplateOverlayPanel({
  doc,
  onApply,
  onClear,
  onClose
}: CeshuTemplateOverlayPanelProps) {
  const t = useT()
  const current = templateOverlayForDoc(doc)
  const [text, setText] = useState(() => prettyOverlay(current))

  /**
   * 每次编辑都重新校验 + 生成预览。覆盖层是小对象，成本可忽略；
   * 换来的是「边输边知道哪一行不合法」，而不是点了应用才报错。
   */
  const result = useMemo((): {
    error: string | null
    preview: DocumentSpec | null
    overlay: Record<string, unknown> | null
  } => {
    let parsed: unknown
    try {
      parsed = JSON.parse(text)
    } catch (err) {
      return {
        error: t('ceshu.templateOverlay.invalidJson', { message: (err as Error).message }),
        preview: null,
        overlay: null
      }
    }
    if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {
        error: t('ceshu.templateOverlay.invalidOverlay', { message: t('ceshu.templateOverlay.rootMustBeObject') }),
        preview: null,
        overlay: null
      }
    }
    try {
      const preview = applyTemplateOverlay(specForKind(getDocKind(doc)), parsed)
      return { error: null, preview, overlay: parsed as Record<string, unknown> }
    } catch (err) {
      return {
        error: t('ceshu.templateOverlay.invalidOverlay', { message: (err as Error).message }),
        preview: null,
        overlay: null
      }
    }
  }, [text, doc, t])

  const hasOverlay = current !== undefined
  const canApply = result.error === null && result.overlay !== null

  const handleApply = (): void => {
    if (result.overlay === null) return
    // 空对象 = 无覆盖：直接清除，不落空壳
    if (Object.keys(result.overlay).length === 0) void onClear()
    else void onApply(result.overlay)
  }

  return (
    <div className="template-overlay-panel" data-testid="template-overlay-panel">
      <div className="template-overlay-head">
        <span className="template-overlay-title">{t('ceshu.templateOverlay.title')}</span>
        <button type="button" className="btn slim" data-testid="template-overlay-close" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>
      <p className="template-overlay-hint">{t('ceshu.templateOverlay.hint')}</p>
      <textarea
        className="template-overlay-input"
        data-testid="template-overlay-input"
        spellCheck={false}
        value={text}
        onChange={(event) => setText(event.target.value)}
      />
      {result.error !== null ? (
        <div className="template-overlay-error" data-testid="template-overlay-error">
          {result.error}
        </div>
      ) : (
        <div className="template-overlay-preview" data-testid="template-overlay-preview">
          <div className="template-overlay-title">{t('ceshu.templateOverlay.preview')}</div>
          {result.preview?.parts.map((part) => (
            <div key={part.key} className="template-overlay-part" data-testid={`template-overlay-part-${part.key}`}>
              <span className="template-overlay-part-label">{part.label}</span>
              <span className="template-overlay-part-chapters">
                {part.chapters.map((key) => result.preview?.chapterLabels[key] ?? key).join(' / ')}
              </span>
            </div>
          ))}
        </div>
      )}
      <div className="template-overlay-actions">
        <button
          type="button"
          className="btn slim"
          data-testid="template-overlay-apply"
          disabled={!canApply}
          onClick={handleApply}
        >
          {t('ceshu.templateOverlay.apply')}
        </button>
        {hasOverlay && (
          <button
            type="button"
            className="btn slim"
            data-testid="template-overlay-clear"
            onClick={() => void onClear()}
          >
            {t('ceshu.templateOverlay.clear')}
          </button>
        )}
      </div>
    </div>
  )
}
