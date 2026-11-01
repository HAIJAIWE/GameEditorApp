import { useState } from 'react'

import {
  buildConfidentialConfig,
  effectiveProvider,
  hasStoredLlmConfig,
  LLM_MAX_TOKENS_MAX,
  LLM_PROVIDER_ORDER,
  LLM_PROVIDER_PRESETS,
  LLM_TEMPERATURE_MAX,
  LLM_TEMPERATURE_MIN,
  llmSetupGuide,
  loadLlmConfig,
  resolveLlmBaseUrl,
  saveLlmConfig,
  type LlmProvider,
  type LlmSetupGuide,
  type StoredLlmConfig
} from '@mobai/shared/config/llm'
import { SECRET_NAMES } from '@mobai/shared/config/secrets'
import { LOCALES, LOCALE_LABELS, type Locale } from '@mobai/shared/i18n'
import { resolveVisionSupport, type VisionMode } from '@mobai/shared/util/ui'
import {
  applyFontSize,
  applyTheme,
  DEFAULT_FONT_SIZE,
  loadBlockExportMissingImages,
  loadConfirmDelete,
  loadFontSize,
  loadTheme,
  MAX_FONT_SIZE,
  MIN_FONT_SIZE,
  saveBlockExportMissingImages,
  saveConfirmDelete,
  saveFontSize,
  saveTheme,
  THEME_OPTIONS,
  type ThemeMode
} from '@mobai/shared/config/settings'
import { useLocale, useT } from '@mobai/client-ui'

import { setLocalePreference } from '../../localePreference'

/**
 * 设置面板。
 *
 * 旧版 是 4 页签（通用 / AI / 编辑器 / 工具）的 QDialog。TS 侧做**五项**：
 * 语言 / 字体大小 / 主题 / 删除时确认（`shared/settingsPreferences.ts`）+
 * **AI 模型服务**（E41 新增，`shared/llmConfig.ts`，对齐 `ui/dialogs/api_config` 基础设置页）。
 * 仍**刻意不做**：自动保存（TS 侧无此功能）、界面布局（IA 已重写为无侧栏单栈）、
 * 工具页开关（未核实消费者）、视觉模型页（TS 侧无视觉模型消费者）、
 * 技能生成模板偏好（属策划内容域，职责错位）。**宁可少做，不做假控件。**
 *
 * ## i18n（A2 之后新增）
 * 本面板是**第一个**完成中英迁移的界面：所有可见文案走 `t('settings.…')`，
 * 文案表在 `shared/i18n/catalog.ts`（英文表缺键 tsc 会红）。
 * 语言开关就放在这里——它自己也得是双语的，否则切到 English 后开关本身看不懂。
 * 已知残留：`llmSetupGuide()`（shared 生成的未配置引导）仍返回中文，
 * 属下一批迁移（`shared/config/llm` 的文案要改成返回键）。
 *
 * ## AI 模型服务（E41）
 * 非敏感字段走 `shared/llmConfig.ts`（localStorage `mb.llmConfig`），
 * 每次改动即调 `llm:configure` 推给主进程；**API Key 不进 localStorage**，
 * 走 `settings:setSecret` → safeStorage 加密盘（`shared/secretNames.ts` 的 `llmApiKey`），
 * 渲染层永不持有也不回显长期明文。
 *
 * ## 偏好项各自的状态来源（读写全部委托 `shared/settingsPreferences`，组件只管渲染）
 * - **字体大小**：`loadFontSize` 惰性初值 → `saveFontSize` 落盘 + `applyFontSize` **立即生效**
 * - **主题**：委托 `theme.ts`（唯一真源），面板只提供二选一入口
 * - **删除时确认**：`loadConfirmDelete` 惰性初值 → `saveConfirmDelete`，消费者 `BatchEditPanel`
 * - **语言**：`localePreference.ts`（模块级 store + `useSyncExternalStore`），
 *   改完由根节点的 `LocaleProvider` 触发整棵树重渲染
 *
 * ## 交互约定
 * - **不接收 `onClose`**：浮层头部已有统一的「关闭」按钮（同 `GameDataPreviewPanel`/
 *   `ClearAllPanel`），多传一个 prop 只会被 eslint 判为未使用参数。
 * - **偏好即时保存、无「确定/取消」**：这几项都是可逆的低风险偏好。主题与字号都是
 *   当场预览，若要支持「取消」就得额外存一份草稿态，属过度开发。
 * - **字号输入用草稿态提交**（`draft`）：允许用户打到一半（空串/半截数字）不被立即
 *   纠回；失焦或回车才提交。派生值用惰性表达式，无 effect 同步 setState。
 */

/** 输入框的本地草稿态：`editing=false` 时输入框显示已保存值（受控于偏好） */
type FontSizeDraft = { editing: false } | { editing: true; text: string }

export default function SettingsPanel() {
  const t = useT()
  const locale = useLocale()

  /* ---- 偏好：惰性初值（useState 的函数形式，避免每次渲染都读一遍 storage） ---- */
  const [fontSize, setFontSize] = useState<number>(() => loadFontSize())
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme())
  const [confirmDelete, setConfirmDelete] = useState<boolean>(() => loadConfirmDelete())
  const [blockExportMissing, setBlockExportMissing] = useState<boolean>(() => loadBlockExportMissingImages())
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

  const handleBlockExportMissingChange = (next: boolean): void => {
    setBlockExportMissing(next)
    saveBlockExportMissingImages(next)
  }

  /** 语言：落盘 + 广播（`localePreference` 通知根节点重渲染整棵树） */
  const handleLocaleChange = (next: Locale): void => {
    setLocalePreference(next)
  }

  /* ---- LLM 服务商配置 ---- */
  const [llm, setLlm] = useState<StoredLlmConfig>(() => loadLlmConfig())
  const [llmKeyDraft, setLlmKeyDraft] = useState('')
  const [llmNotice, setLlmNotice] = useState<string | null>(null)
  const [llmKeySaved, setLlmKeySaved] = useState(false)
  /*
   * M0「默认档位纠正」：AI 配置四态的引导内容。
   * 惰性初值（与本文件其余 `useState(() => ...)` 同风格）：避免每次渲染都读一遍 storage。
   * ⚠️ `llmSetupGuide` 的 `hasStored` 是**入参**（shared 层刻意不读 storage，依赖注入以便测试），
   * 所以这里必须自己调 `hasStoredLlmConfig()` 再传进去，不能只传 `loadLlmConfig()`。
   */
  const [setupGuide, setSetupGuide] = useState<LlmSetupGuide>(() => llmSetupGuide(loadLlmConfig(), hasStoredLlmConfig()))
  /** 「一键启用保密模式」的本地探测是否在途（用于禁用按钮，防重复点击） */
  const [llmProbing, setLlmProbing] = useState(false)
  /** 「测试连接」是否在途（禁用按钮，防重复点击） */
  const [llmTesting, setLlmTesting] = useState(false)

  const llmPreset = LLM_PROVIDER_PRESETS[effectiveProvider(llm)]

  /** 改配置：落盘 + 立刻推给主进程（下次 AI 调用即生效） */
  const commitLlm = (next: StoredLlmConfig): void => {
    const saved = saveLlmConfig(next)
    setLlm(next)
    setLlmNotice(null)
    if (!saved) {
      setLlmNotice(t('settings.noticeSaveFailed'))
      return
    }
    /*
     * 刷新四态引导。⚠️ 写在**事件处理器**里而不是 `useEffect`：
     * react-hooks v7 把 `set-state-in-effect` / `set-state-in-render` 判为 **error**。
     * 且必须落在上面 `if (!saved) {...return}` 的**早退分支之后** ——
     * 存储写失败时配置根本没落盘，此时若刷新引导会把「没存上」显示成「已生效」。
     */
    setSetupGuide(llmSetupGuide(next, hasStoredLlmConfig()))
    void window.mbApi.llm.configure({ config: next }).catch(() => setLlmNotice(t('settings.noticePushFailed')))
  }

  /** 切服务商：带出该服务商的预设地址与首个模型 */
  const handleProviderChange = (next: LlmProvider): void => {
    const preset = LLM_PROVIDER_PRESETS[next]
    commitLlm({
      ...llm,
      provider: next,
      baseUrl: preset.baseUrl,
      model: preset.models[0] ?? ''
    })
  }

  /** API Key 存进系统钥匙串（渲染层不保存明文，只存「有没有」这个事实） */
  const saveLlmKey = async (): Promise<void> => {
    const plaintext = llmKeyDraft.trim()
    if (plaintext === '') {
      setLlmNotice(t('settings.noticeKeyRequired'))
      return
    }
    const res = await window.mbApi.settings.setSecret({
      name: SECRET_NAMES.llmApiKey,
      plaintext
    })
    if (!res.ok) {
      setLlmNotice(
        t('settings.noticeKeySaveFailed', { reason: res.error ?? t('settings.noticeUnknownReason') })
      )
      return
    }
    setLlmKeyDraft('')
    setLlmKeySaved(true)
    setLlmNotice(t('settings.noticeKeySaved'))
  }

  /**
   * 「一键启用保密模式」：切到本地 Ollama 档，然后**如实汇报本地到底能不能用**（M0 / DD-0）。
   *
   * ## 铁律：不假装成功
   * 配置**保存成功 ≠ 本地可用**。本地档真正能不能跑，取决于两件用户自己才能解决的事：
   * Ollama 服务有没有起（`ollama serve`）、有没有拉过模型（`ollama pull`）。
   * 所以点完按钮必须发一次 `llm:status` 探测，并按 `available` + `models.length`
   * **两个结构化字段**分四态显示。⚠️ 绝不用 `message.includes('...')` 判定 ——
   * 那是文案判定，文案一改判定就跟着漂（且 `message` 是主进程自由发挥的字符串）。
   * ⚠️ 也绝不在任何分支显示「已启用」了事。
   */
  const enableConfidential = async (): Promise<void> => {
    setLlmNotice(null)
    setLlmProbing(true)
    const next = buildConfidentialConfig(llm)
    commitLlm(next)
    try {
      // 渲染层首次调用 `llm:status`（此前该 IPC 通道从未被渲染层用过）
      const st = await window.mbApi.llm.status()
      if (st.available) {
        setLlmNotice(t('settings.noticeLocalAvailable', { count: st.models.length }))
      } else if (st.models.length > 0) {
        setLlmNotice(t('settings.noticeOllamaNotRunning'))
      } else {
        setLlmNotice(t('settings.noticeNoModel'))
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      setLlmNotice(t('settings.noticeOllamaUnreachable', { reason }))
    } finally {
      setLlmProbing(false)
    }
  }

  /** 「测试连接」：探活当前已配置镜像，结果直接展示在 llmNotice */
  const handleTestConnection = async (): Promise<void> => {
    setLlmNotice(null)
    setLlmTesting(true)
    try {
      const res = await window.mbApi.llm.testConnection()
      setLlmNotice(
        t('settings.noticeTestResult', {
          status: res.ok ? t('settings.noticeTestOk') : t('settings.noticeTestFail'),
          message: res.message
        })
      )
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      setLlmNotice(t('settings.noticeTestError', { reason }))
    } finally {
      setLlmTesting(false)
    }
  }

  return (
    <div className="editor" data-testid="settings-panel">
      <div className="editor-header">
        <div className="editor-title">
          {t('settings.title')}
          <small>{t('settings.subtitle')}</small>
        </div>
      </div>

      <div className="editor-body">
        <div className="form-section">
          <div className="form-section-head">
            <span className="form-section-title">{t('settings.sectionGeneral')}</span>
          </div>
          <div className="form-section-body">
            {/* 语言：改完立即生效（根节点的 LocaleProvider 触发整棵树重渲染） */}
            <div className="form-row">
              <label className="form-label" htmlFor="settings-language">
                {t('settings.language')}
              </label>
              <select
                id="settings-language"
                className="form-select"
                data-testid="settings-language"
                value={locale}
                onChange={(event) => handleLocaleChange(event.target.value as Locale)}
              >
                {LOCALES.map((item) => (
                  <option key={item} value={item}>
                    {LOCALE_LABELS[item]}
                  </option>
                ))}
              </select>
            </div>
            <div className="item-meta" data-testid="settings-language-hint">
              {t('settings.languageHint')}
              {locale !== 'zh' && <> {t('settings.languageBeta')}</>}
            </div>

            {/* 主题：TS 只有浅/深两档（见 theme.ts 的「有意不做：不做多套主题」） */}
            <div className="form-row">
              <span className="form-label">{t('settings.theme')}</span>
              <select
                className="form-select"
                data-testid="settings-theme"
                aria-label={t('settings.theme')}
                value={theme}
                onChange={(event) => handleThemeChange(event.target.value as ThemeMode)}
              >
                {THEME_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.value === 'dark' ? t('settings.themeDark') : t('settings.themeLight')}
                  </option>
                ))}
              </select>
            </div>
            <div className="item-meta" data-testid="settings-theme-current">
              {t('settings.themeCurrent', {
                name: theme === 'dark' ? t('settings.themeDark') : t('settings.themeLight')
              })}
            </div>

            {/* 字体大小：立即生效 */}
            <div className="form-row">
              <label className="form-label" htmlFor="settings-font-size">
                {t('settings.fontSize')}
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
              {t('settings.fontSizeHint', { min: MIN_FONT_SIZE, max: MAX_FONT_SIZE, def: DEFAULT_FONT_SIZE })}
              <b>{t('settings.immediate')}</b>
              {t('settings.fontSizeHintTail')}
            </div>

            {/* 删除时确认：默认开启；关闭后删除直接执行，必须如实告知破坏性 */}
            <div className="form-row">
              <span className="form-label">{t('settings.confirmDelete')}</span>
              <label className="ai-gen-check" htmlFor="settings-confirm-delete">
                <input
                  id="settings-confirm-delete"
                  type="checkbox"
                  data-testid="settings-confirm-delete"
                  checked={confirmDelete}
                  onChange={(event) => handleConfirmDeleteChange(event.target.checked)}
                />
                {t('settings.confirmDeleteLabel')}
              </label>
            </div>
            {confirmDelete ? (
              <div className="item-meta" data-testid="settings-confirm-delete-hint">
                {t('settings.confirmDeleteOn')}
              </div>
            ) : (
              <div className="danger-hint" data-testid="settings-confirm-delete-danger">
                {t('settings.confirmDeleteOffPrefix')}
                <b>{t('settings.confirmDeleteOffStrong')}</b>
                {t('settings.confirmDeleteOffSuffix')}
              </div>
            )}

            {/* 导出时图片缺失则阻断：默认关闭（保持旧行为）；开启后缺图直接报错不落盘 */}
            <div className="form-row">
              <span className="form-label">{t('settings.blockExport')}</span>
              <label className="ai-gen-check" htmlFor="settings-block-export-missing">
                <input
                  id="settings-block-export-missing"
                  type="checkbox"
                  data-testid="settings-block-export-missing"
                  checked={blockExportMissing}
                  onChange={(event) => handleBlockExportMissingChange(event.target.checked)}
                />
                {t('settings.blockExportLabel')}
              </label>
            </div>
            {blockExportMissing ? (
              <div className="item-meta" data-testid="settings-block-export-missing-hint">
                {t('settings.blockExportOn')}
              </div>
            ) : (
              <div className="item-meta" data-testid="settings-block-export-missing-off">
                {t('settings.blockExportOff')}
              </div>
            )}
          </div>
        </div>

        {/* ---- LLM 服务商配置 ---- */}
        <div className="form-section" data-testid="settings-llm">
          <strong>{t('settings.llmSection')}</strong>

          {/*
            M0 未配置引导块。位置在「AI 模型服务」标题之后、「启用 API」复选框之前 ——
            引导说的是「你还没配」，必须**先于**配置控件出现，否则用户先看到一堆
            选填项、不知道哪些是必填。块内元素与既有 `form-section` 内的
            `check-option` 同为块级流式排布，不改动任何既有元素的相对位置。
            ⚠️ `body` 含 `\n`（三步说明），必须靠 `whiteSpace: 'pre-line'` 渲染换行；
            直接塞进普通 div 会把三行压成一行糊掉。
            ⚠️ 已知残留：这段文案由 `shared/config/llm` 的 `llmSetupGuide()` 生成，仍是中文，
            属下一批 i18n 迁移（要改成返回文案键）。
          */}
          {setupGuide.showGuide && (
            <div className="notice-banner inline" data-testid="llm-setup-guide">
              <b data-testid="llm-setup-title">{setupGuide.title}</b>
              <div className="item-meta" data-testid="llm-setup-body" style={{ whiteSpace: 'pre-line' }}>
                {setupGuide.body}
              </div>
              {setupGuide.showEnableConfidential && (
                <button
                  type="button"
                  className="btn"
                  data-testid="llm-enable-confidential"
                  disabled={llmProbing}
                  onClick={() => void enableConfidential()}
                >
                  {t('settings.llmEnableConfidential')}
                </button>
              )}
            </div>
          )}
          {setupGuide.hint !== null && (
            <div className="item-meta" data-testid="llm-setup-hint">
              {setupGuide.hint}
            </div>
          )}

          <label className="check-option" data-testid="llm-enabled">
            <input
              type="checkbox"
              checked={llm.enabled}
              onChange={(e) => commitLlm({ ...llm, enabled: e.target.checked })}
            />
            {t('settings.llmEnable')}
          </label>

          {/* DD-0b 保密模式：显式开关，开启后强制本地 Ollama，与云端档并列而非隐藏 */}
          <label className="check-option" data-testid="llm-confidential">
            <input
              type="checkbox"
              checked={llm.confidential}
              onChange={(e) => commitLlm({ ...llm, confidential: e.target.checked })}
            />
            {t('settings.llmConfidential')}
          </label>
          {llm.confidential && (
            <div className="item-meta" data-testid="llm-confidential-notice">
              {t('settings.llmConfidentialNoticePrefix')}
              <b>{t('settings.llmConfidentialNoticeStrong')}</b>
              {t('settings.llmConfidentialNoticeSuffix')}
            </div>
          )}

          <div className="form-row">
            <label className="form-label" htmlFor="llm-provider">
              {t('settings.llmProvider')}
            </label>
            <div className="form-field">
              <select
                id="llm-provider"
                data-testid="llm-provider"
                value={effectiveProvider(llm)}
                disabled={llm.confidential}
                onChange={(e) => handleProviderChange(e.target.value as LlmProvider)}
              >
                {LLM_PROVIDER_ORDER.map((p) => (
                  <option key={p} value={p}>
                    {LLM_PROVIDER_PRESETS[p].label}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {llmPreset.requiresApiKey && (
            <div className="form-row">
              <label className="form-label" htmlFor="llm-api-key">
                API Key
              </label>
              <div className="form-field">
                <input
                  id="llm-api-key"
                  type="password"
                  data-testid="llm-api-key"
                  placeholder={
                    llmKeySaved ? t('settings.llmKeyPlaceholderSaved') : t('settings.llmKeyPlaceholderEmpty')
                  }
                  value={llmKeyDraft}
                  onChange={(e) => {
                    setLlmKeyDraft(e.target.value)
                    setLlmKeySaved(false)
                  }}
                />
                <button type="button" className="btn" data-testid="llm-save-key" onClick={() => void saveLlmKey()}>
                  {t('settings.llmSaveKey')}
                </button>
                <div className="item-meta">{t('settings.llmKeyHint')}</div>
              </div>
            </div>
          )}

          <div className="form-row">
            <label className="form-label" htmlFor="llm-base-url">
              {t('settings.llmBaseUrl')}
            </label>
            <div className="form-field">
              <input
                id="llm-base-url"
                type="text"
                data-testid="llm-base-url"
                placeholder={llmPreset.baseUrl}
                value={llm.baseUrl}
                onChange={(e) => commitLlm({ ...llm, baseUrl: e.target.value })}
              />
              <div className="item-meta" data-testid="llm-base-url-effective">
                {t('settings.llmBaseUrlEffective', { url: resolveLlmBaseUrl(llm) })}
              </div>
            </div>
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="llm-model">
              {t('settings.llmModel')}
            </label>
            <div className="form-field">
              <input
                id="llm-model"
                type="text"
                list="llm-model-options"
                data-testid="llm-model"
                value={llm.model}
                onChange={(e) => commitLlm({ ...llm, model: e.target.value })}
              />
              <datalist id="llm-model-options">
                {llmPreset.models.map((m) => (
                  <option key={m} value={m} />
                ))}
              </datalist>
            </div>
          </div>

          {/*
            视觉输入（图片）设定。模型能力没有元数据来源，只能按模型名启发式判断，
            新模型 / 自建模型必然漏判 ⇒ 给一个显式覆盖口，避免「明明能看图却只收到路径」。
          */}
          <div className="form-row">
            <label className="form-label" htmlFor="llm-vision">
              {t('settings.llmVision')}
            </label>
            <div className="form-field">
              <select
                id="llm-vision"
                data-testid="llm-vision"
                value={llm.vision}
                onChange={(e) => commitLlm({ ...llm, vision: e.target.value as VisionMode })}
              >
                <option value="auto">{t('settings.llmVisionAuto')}</option>
                <option value="on">{t('settings.llmVisionOn')}</option>
                <option value="off">{t('settings.llmVisionOff')}</option>
              </select>
              <div className="item-meta" data-testid="llm-vision-effective">
                {resolveVisionSupport(llm.model, llm.vision)
                  ? t('settings.llmVisionYes')
                  : t('settings.llmVisionNo')}
              </div>
            </div>
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="llm-temperature">
              {t('settings.llmTemperature')}
            </label>
            <div className="form-field">
              <input
                id="llm-temperature"
                type="number"
                min={LLM_TEMPERATURE_MIN}
                max={LLM_TEMPERATURE_MAX}
                step="0.1"
                data-testid="llm-temperature"
                value={llm.temperature}
                onChange={(e) => commitLlm({ ...llm, temperature: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="llm-max-tokens">
              {t('settings.llmMaxTokens')}
            </label>
            <div className="form-field">
              <input
                id="llm-max-tokens"
                type="number"
                min={1}
                max={LLM_MAX_TOKENS_MAX}
                data-testid="llm-max-tokens"
                value={llm.maxTokens}
                onChange={(e) => commitLlm({ ...llm, maxTokens: Number(e.target.value) })}
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-field">
              <button
                type="button"
                className="btn"
                data-testid="llm-test-connection"
                disabled={llmTesting}
                onClick={() => void handleTestConnection()}
              >
                {llmTesting ? t('settings.llmTesting') : t('settings.llmTest')}
              </button>
            </div>
          </div>

          {llmNotice !== null && (
            <div className="item-meta" data-testid="llm-notice">
              {llmNotice}
            </div>
          )}

          {effectiveProvider(llm) === 'claude' && (
            <div className="danger-hint" data-testid="llm-claude-unsupported">
              {t('settings.llmClaudeUnsupported')}
            </div>
          )}
        </div>

        {/* ---- 范围外项目：显式列出并说明为何不做（静默省略会让用户以为漏做了） ---- */}
        <div className="item-meta" data-testid="settings-out-of-scope">
          {t('settings.outOfScope')}
        </div>
      </div>
    </div>
  )
}
