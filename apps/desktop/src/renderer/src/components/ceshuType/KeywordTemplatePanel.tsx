import { useCallback, useMemo, useState } from 'react'

import { useT } from '@mobai/client-ui'

import {
  KEYWORD_TEMPLATES_SETTING_KEY,
  KEYWORD_TEMPLATE_TYPE_OPTIONS,
  defaultTemplateFor,
  isTemplateEdited,
  keywordTemplateTypeLabel,
  parseKeywordTemplates,
  serializeKeywordTemplates,
  templateTextFor,
  withTemplateText
} from '@mobai/shared/config/secrets'
import type { KeywordTemplates, KeywordTemplateType } from '@mobai/shared/config/secrets'
import { readSetting, writeSetting } from '@mobai/shared/config/settings'

/**
 * 关键词模板配置面板（对齐 旧版 `src/features/advanced:206-306`
 * 的 `show_keyword_template_config`，入口 旧版 在「设置 → 工具与高级配置 →
 * 关键词模板配置」，`settings_dialog:427`）。
 *
 * 旧版 侧结构：类型下拉（5 项）+ 模板编辑框 + 「💾 保存」「🔄 重置默认」「关闭」。
 *
 * ## 三处与 旧版 的差异
 *
 * 1. **保存真的落盘**。旧版 的 `save_template()` 只写内存
 *    （`advanced:272-273` 的注释自己写着「可以后续添加保存到文件的功能」，
 *    且全仓 grep 下来`KEYWORD_TEMPLATES_FILENAME` 从无写入点、模板也无读取方）。
 *    TS 侧落 localStorage（`mb.keywordTemplates`），否则关掉窗口就丢。
 * 2. **重置默认仍需再点保存**。
 *    面板在按钮下方与提示行都写明了这一点，不让用户以为已经还原。
 * 3. **标注「已修改」**：旧版 没有未保存提示，切类型时编辑框内容直接被覆盖。
 *    TS 侧切类型同样覆盖（保持一致，不加二次确认弹窗），
 *    但会在类型标签与按钮行显示「未保存」，让用户知道当前是草稿。
 *
 * 浮层头部已有统一的「关闭」按钮，故本组件**不接收 `onClose`**（同`ClearAllPanel`）。
 *
 * ## 存储
 * 经既有 `settingsStore.ts` 的 `readSetting`/`writeSetting` 落 `mb.` 命名空间
 * （**用原始字符串读写**而非 `readJsonSetting`：模板解析要能容错半个坏数据，
 * `readJsonSetting` 遇到非法 JSON 会直接回落成fallback，把「用户改了一半的模板」整份丢掉）。
 * ⚠️ **需主理人接线**：`settingsStore.ts` 的 `SETTINGS_KEYS` 里补一行
 * `keywordTemplates: KEYWORD_TEMPLATES_SETTING_KEY`，
 * 否则「导出全部设置 / 重置全部设置」不会覆盖这个键。
 */

type TemplateStatus = { kind: 'idle' } | { kind: 'saved' } | { kind: 'reset'; type: KeywordTemplateType } | { kind: 'error'; message: string }

/** 惰性初始化：首帧就读一次已保存的模板（避免挂载后再 setState 造成闪烁） */
function loadSavedTemplates(): KeywordTemplates {
  return parseKeywordTemplates(readSetting(KEYWORD_TEMPLATES_SETTING_KEY))
}

export default function KeywordTemplatePanel() {
  const t = useT()
  const [templates, setTemplates] = useState<KeywordTemplates>(loadSavedTemplates)
  const [activeType, setActiveType] = useState<KeywordTemplateType>(KEYWORD_TEMPLATE_TYPE_OPTIONS[0].value)
  /** 编辑框内容与「已保存值」分离：切类型时丢弃草稿的行为对齐 旧版（直接换文本） */
  const [draft, setDraft] = useState<string>(() => defaultTemplateFor(KEYWORD_TEMPLATE_TYPE_OPTIONS[0].value))
  const [status, setStatus] = useState<TemplateStatus>({ kind: 'idle' })

  /** 当前类型已保存的文本（保存/比对的基准） */
  const savedText = useMemo(() => templateTextFor(templates, activeType), [templates, activeType])

  const dirty = draft !== savedText
  const edited = isTemplateEdited(templates, activeType)

  const handleTypeChange = useCallback(
    (next: KeywordTemplateType): void => {
      setActiveType(next)
      // 对齐 旧版 的 load_template()：切类型即从已保存值（缺省回落默认）载入
      setDraft(templateTextFor(templates, next))
      setStatus({ kind: 'idle' })
    },
    [templates]
  )

  const handleSave = useCallback((): void => {
    const next = withTemplateText(templates, activeType, draft)
    if (!writeSetting(KEYWORD_TEMPLATES_SETTING_KEY, serializeKeywordTemplates(next))) {
      setStatus({ kind: 'error', message: t('keywordTemplate.saveFailed') })
      return
    }
    setTemplates(next)
    setStatus({ kind: 'saved' })
  }, [activeType, draft, templates, t])

  const handleReset = useCallback((): void => {
    // 旧版 的 reset_template() 只回填编辑框、不落盘；这里保持同一语义
    setDraft(defaultTemplateFor(activeType))
    setStatus({ kind: 'reset', type: activeType })
  }, [activeType])

  const statusText = useMemo(() => {
    switch (status.kind) {
      case 'idle':
        return null
      case 'saved':
        return t('keywordTemplate.savedNotice', { type: keywordTemplateTypeLabel(activeType) })
      case 'reset':
        return t('keywordTemplate.resetNotice', { type: keywordTemplateTypeLabel(status.type) })
      case 'error':
        return status.message
    }
  }, [status, activeType, t])

  return (
    <div className="editor" data-testid="keyword-template-panel">
      <div className="editor-header">
        <div className="editor-title">
          {t('keywordTemplate.title')}
          <small>{t('keywordTemplate.subtitle')}</small>
        </div>
      </div>

      <div className="editor-body">
        <div className="form-hint">{t('keywordTemplate.hint')}</div>

        <div className="form-row">
          <label className="form-label" htmlFor="keyword-template-type">
            {t('keywordTemplate.typeLabel')}
          </label>
          <select
            id="keyword-template-type"
            className="form-input"
            data-testid="keyword-template-type"
            value={activeType}
            onChange={(e) => handleTypeChange(e.target.value as KeywordTemplateType)}
          >
            {KEYWORD_TEMPLATE_TYPE_OPTIONS.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label className="form-label" htmlFor="keyword-template-text">
            {t('keywordTemplate.contentLabel')}
          </label>
          <textarea
            id="keyword-template-text"
            className="form-textarea"
            data-testid="keyword-template-text"
            rows={18}
            value={draft}
            placeholder={t('keywordTemplate.placeholder')}
            onChange={(e) => setDraft(e.target.value)}
          />
        </div>

        <div className="form-row">
          <span className="form-hint" data-testid="keyword-template-state">
            {dirty
              ? t('keywordTemplate.stateDirty')
              : edited
                ? t('keywordTemplate.stateEdited')
                : t('keywordTemplate.stateDefault')}
          </span>
        </div>

        {statusText !== null && (
          <div className="notice-banner inline" data-testid="keyword-template-status">
            {statusText}
          </div>
        )}
        {status.kind === 'reset' && (
          <div className="form-hint" data-testid="keyword-template-reset-hint">
            {t('keywordTemplate.resetHint')}
          </div>
        )}
      </div>

      <div className="editor-actions">
        <button
          type="button"
          className="btn primary"
          data-testid="keyword-template-save"
          disabled={!dirty}
          onClick={handleSave}
        >
          {t('keywordTemplate.save')}
        </button>
        <button
          type="button"
          className="btn"
          data-testid="keyword-template-reset"
          onClick={handleReset}
        >
          {t('keywordTemplate.reset')}
        </button>
      </div>
    </div>
  )
}