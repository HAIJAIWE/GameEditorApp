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
} from '../../../shared/llmConfig'
import { SECRET_NAMES } from '../../../shared/secretNames'
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
} from '../../../shared/config/settingsPreferences'

/**
 * 设置面板（对齐 Python `ui/dialogs/settings_dialog.py`，菜单入口 `设置 → 打开设置...`）。
 *
 * Python 是 4 页签（通用 / AI / 编辑器 / 工具）的 QDialog。TS 侧做**四项**：
 * 字体大小 / 主题 / 删除时确认（前三项，`shared/settingsPreferences.ts`）+ 
 * **AI 模型服务**（E41 新增，`shared/llmConfig.ts`，对齐 `ui/dialogs/api_config.py` 基础设置页）。
 * 仍**刻意不做**：语言下拉（无 i18n 框架）、自动保存（TS 侧无此功能）、
 * 界面布局（IA 已重写为无侧栏单栈）、工具页开关（未核实消费者）、
 * 视觉模型页（TS 侧无视觉模型消费者）、技能生成模板偏好（属策划内容域，职责错位）。
 * **宁可少做，不做假控件。**
 *
 * ## AI 模型服务（E41）
 * 非敏感字段走 `shared/llmConfig.ts`（localStorage `mb.llmConfig`），
 * 每次改动即调 `llm:configure` 推给主进程；**API Key 不进 localStorage**，
 * 走 `settings:setSecret` → safeStorage 加密盘（`shared/secretNames.ts` 的 `llmApiKey`），
 * 渲染层永不持有也不回显长期明文。
 *
 * ## 前三项各自的状态来源（读写全部委托 `shared/settingsPreferences`，组件只管渲染）
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

  /* ---- LLM 服务商配置（对齐 Python `ui/dialogs/api_config.py` 基础设置页） ---- */
  const [llm, setLlm] = useState<StoredLlmConfig>(() => loadLlmConfig())
  const [llmKeyDraft, setLlmKeyDraft] = useState('')
  const [llmNotice, setLlmNotice] = useState<string | null>(null)
  const [llmKeySaved, setLlmKeySaved] = useState(false)
  /*
   * M0「默认档位纠正」：AI 配置四态的引导内容。
   * 惰性初值（与本文件其余 4 个 `useState(() => ...)` 同风格）：避免每次渲染都读一遍 storage。
   * ⚠️ `llmSetupGuide` 的 `hasStored` 是**入参**（shared 层刻意不读 storage，依赖注入以便测试），
   * 所以这里必须自己调 `hasStoredLlmConfig()` 再传进去，不能只传 `loadLlmConfig()`。
   */
  const [setupGuide, setSetupGuide] = useState<LlmSetupGuide>(() => llmSetupGuide(loadLlmConfig(), hasStoredLlmConfig()))
  /** 「一键启用保密模式」的本地探测是否在途（用于禁用按钮，防重复点击） */
  const [llmProbing, setLlmProbing] = useState(false)

  const llmPreset = LLM_PROVIDER_PRESETS[effectiveProvider(llm)]

  /** 改配置：落盘 + 立刻推给主进程（下次 AI 调用即生效） */
  const commitLlm = (next: StoredLlmConfig): void => {
    const saved = saveLlmConfig(next)
    setLlm(next)
    setLlmNotice(null)
    if (!saved) {
      setLlmNotice('配置保存失败：浏览器存储不可用')
      return
    }
    /*
     * 刷新四态引导。⚠️ 写在**事件处理器**里而不是 `useEffect`：
     * react-hooks v7 把 `set-state-in-effect` / `set-state-in-render` 判为 **error**。
     * 且必须落在上面 `if (!saved) {...return}` 的**早退分支之后** ——
     * 存储写失败时配置根本没落盘，此时若刷新引导会把「没存上」显示成「已生效」。
     */
    setSetupGuide(llmSetupGuide(next, hasStoredLlmConfig()))
    void window.mbApi.llm
      .configure({ config: next })
      .catch(() => setLlmNotice('已保存到本地，但推送给主进程失败，AI 调用可能仍用旧配置'))
  }

  /** 切服务商：带出该服务商的预设地址与首个模型（对齐 PyQt `on_provider_changed`） */
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
      setLlmNotice('请先填写 API Key')
      return
    }
    const res = await window.mbApi.settings.setSecret({
      name: SECRET_NAMES.llmApiKey,
      plaintext
    })
    if (!res.ok) {
      setLlmNotice(`API Key 保存失败：${res.error ?? '未知原因'}`)
      return
    }
    setLlmKeyDraft('')
    setLlmKeySaved(true)
    setLlmNotice('API Key 已存入系统钥匙串（加密落盘，不写入浏览器存储）')
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
        setLlmNotice(`本地可用（${st.models.length} 个模型）`)
      } else if (st.models.length > 0) {
        setLlmNotice('本地 Ollama 未启动')
      } else {
        setLlmNotice('已开启保密模式，但本地还没有模型，请先在命令行执行 ollama pull <model 或 qwen3:8b> 拉取模型')
      }
    } catch (err) {
      const reason = err instanceof Error ? err.message : String(err)
      setLlmNotice(`已保存配置，但无法连接本地 Ollama：${reason}，请确认已启动（ollama serve）`)
    } finally {
      setLlmProbing(false)
    }
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

        {/* ---- LLM 服务商配置（对齐 Python `api_config.py` 基础设置页） ---- */}
        <div className="form-section" data-testid="settings-llm">
          <strong>AI 模型服务</strong>

          {/*
            M0 未配置引导块。位置在「AI 模型服务」标题之后、「启用 API」复选框之前 ——
            引导说的是「你还没配」，必须**先于**配置控件出现，否则用户先看到一堆
            选填项、不知道哪些是必填。块内元素与既有 `form-section` 内的
            `check-option` 同为块级流式排布，不改动任何既有元素的相对位置。
            ⚠️ `body` 含 `\n`（三步说明），必须靠 `whiteSpace: 'pre-line'` 渲染换行；
            直接塞进普通 div 会把三行压成一行糊掉。
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
                  🔒 一键启用保密模式
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
            启用 API
          </label>

          {/* DD-0b 保密模式：显式开关，开启后强制本地 Ollama，与云端档并列而非隐藏 */}
          <label className="check-option" data-testid="llm-confidential">
            <input
              type="checkbox"
              checked={llm.confidential}
              onChange={(e) => commitLlm({ ...llm, confidential: e.target.checked })}
            />
            🔒 保密模式（数据不出本机）
          </label>
          {llm.confidential && (
            <div className="item-meta" data-testid="llm-confidential-notice">
              已开启保密模式：所有 AI 调用强制走本地 Ollama，<b>数据不出本机</b>，不会向任何云端服务商发送数据。
            </div>
          )}

          <div className="form-row">
            <label className="form-label" htmlFor="llm-provider">
              API 服务
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
                  placeholder={llmKeySaved ? '已存入钥匙串（不回显）' : '请输入 API Key'}
                  value={llmKeyDraft}
                  onChange={(e) => {
                    setLlmKeyDraft(e.target.value)
                    setLlmKeySaved(false)
                  }}
                />
                <button type="button" className="btn" data-testid="llm-save-key" onClick={() => void saveLlmKey()}>
                  保存到钥匙串
                </button>
                <div className="item-meta">
                  密钥经 Electron safeStorage 加密落盘，不写入浏览器存储，渲染层也不回显。
                </div>
              </div>
            </div>
          )}

          <div className="form-row">
            <label className="form-label" htmlFor="llm-base-url">
              接口地址
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
                实际生效：{resolveLlmBaseUrl(llm)}
              </div>
            </div>
          </div>

          <div className="form-row">
            <label className="form-label" htmlFor="llm-model">
              模型
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

          <div className="form-row">
            <label className="form-label" htmlFor="llm-temperature">
              温度
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
              最大令牌
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

          {llmNotice !== null && (
            <div className="item-meta" data-testid="llm-notice">
              {llmNotice}
            </div>
          )}

          {effectiveProvider(llm) === 'claude' && (
            <div className="danger-hint" data-testid="llm-claude-unsupported">
              Claude 走 Anthropic Messages API，与 OpenAI 协议不兼容，本版暂未接入调用。
            </div>
          )}
        </div>

        {/* ---- 范围外项目：显式列出并说明为何不做（静默省略会让用户以为漏做了） ---- */}
        <div className="item-meta" data-testid="settings-out-of-scope">
          本版未提供：语言（无多语言框架）、自动保存（本应用无自动保存）、界面布局（已固定为单栏工作区）、
          视觉模型配置（TS 侧无视觉模型消费者）、技能生成模板偏好（属策划内容域，见上）。
        </div>
      </div>
    </div>
  )
}