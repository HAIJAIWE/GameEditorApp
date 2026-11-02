import { useCallback, useEffect, useState } from 'react'

import { useT } from '@mobai/client-ui'
import { translate, type MessageKey } from '@mobai/shared/i18n'
import type { ImageGenConfig } from '@mobai/shared/config/llm'
import { loadImageGenConfig, saveImageGenConfig } from '@mobai/shared/config/llm'
import type { StoredImageGenConfig, StoredProvider } from '@mobai/shared/config/llm'
import { SECRET_NAMES } from '@mobai/shared/config/secrets'
import { migrateLegacyApiKey, readLegacyImageGenApiKey } from '@mobai/shared/config/secrets'

import { getLocalePreference } from '../../localePreference'

/**
 * AI 生图面板。
 *
 * 旧版 侧该文件的 UI 入口（`dynamic_form._on_ai_image`）本身是**死桩**（只弹「需配置
 * API Key」提示、从不真正调用），这里按其**设计意图**（`show_ai_image_dialog`：
 * 填描述 → 调 `generate_ai_image` → 下载落盘）做一个真正可用的实现。
 *
 * ## API Key 的存放（相对 E22 的安全性修复）
 * E22 把 apiKey 明文存进了 localStorage（`mb.imageGenConfig`），那是相对 旧版
 * `config/settings`（Fernet 加密）的**明确退步**。现在：
 * - 明文只存在于「用户输入 → IPC → 主进程 `safeStorage` 加密落盘」这一瞬间，
 *   保存成功后**立即清空输入框**；
 * - 面板只通过 `hasSecret` 知道「配没配过」，**没有任何途径读回明文**
 *   （`window.mbApi.settings` 刻意不提供 get）；
 * - 面板其余表单（provider/model/baseUrl）仍持久化在 localStorage
 *   （`shared/imageGenConfig.ts` 已从类型与落盘结构里移除 apiKey）。
 * - 挂载时做一次性兼容迁移：把 E22 时期遗留的明文搬进钥匙串并从 localStorage 删除
 *   （`shared/secretMigration.ts`，读完即删）。
 *
 * 与 旧版 的其他差异：
 * - 落盘目录由用户经原生对话框选择。
 */

const PROVIDER_LABELS: Readonly<Record<StoredProvider, MessageKey>> = {
  openai: 'imageGen.provider.openai',
  qwen: 'imageGen.provider.qwen',
  doubao: 'imageGen.provider.doubao',
  generic: 'imageGen.provider.generic'
}

interface ImageGenPanelProps {
  onClose: () => void
}

export default function ImageGenPanel({ onClose }: ImageGenPanelProps) {
  const t = useT()
  // 挂载时读一次持久化配置（不含 apiKey）
  const [config, setConfig] = useState<StoredImageGenConfig>(() => loadImageGenConfig())
  const [prompt, setPrompt] = useState('')
  const [saveDir, setSaveDir] = useState('')
  const [previewUrl, setPreviewUrl] = useState('')
  const [savedPath, setSavedPath] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [status, setStatus] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  /** API Key 输入框内容：**只在用户输入与保存期间存在**，保存成功立刻清空 */
  const [apiKeyDraft, setApiKeyDraft] = useState('')
  /** 钥匙串里是否已配置（null = 尚未查询完成） */
  const [hasSecret, setHasSecret] = useState<boolean | null>(null)

  const update = <K extends keyof StoredImageGenConfig>(
    key: K,
    value: StoredImageGenConfig[K]
  ): void => {
    const next = { ...config, [key]: value }
    setConfig(next)
    saveImageGenConfig(next)
  }

  /** 问一次「配没配过」（不解密，渲染层拿不到明文） */
  const refreshHasSecret = useCallback(async (): Promise<boolean> => {
    const res = await window.mbApi.settings.hasSecret({ name: SECRET_NAMES.imageGenApiKey })
    setHasSecret(res.has)
    return res.has
  }, [])

  // 挂载时：① 一次性迁移 E22 遗留的 localStorage 明文 → ② 查钥匙串状态
  useEffect(() => {
    let cancelled = false
    const bootstrap = async (): Promise<void> => {
      const migration = await migrateLegacyApiKey(
        readLegacyImageGenApiKey(),
        async (name, plaintext) => window.mbApi.settings.setSecret({ name, plaintext })
      )
      if (cancelled) return
      if (migration.migrated) {
        setStatus(translate(getLocalePreference(), 'imageGen.migrated'))
      } else if (migration.reason === 'secret-write-failed' || migration.reason === 'invalid-legacy-key') {
        setError(migration.error ?? translate(getLocalePreference(), 'imageGen.migrateFailed'))
      }
      const has = await window.mbApi.settings.hasSecret({ name: SECRET_NAMES.imageGenApiKey })
      if (cancelled) return
      setHasSecret(has.has)
    }
    void bootstrap().catch((err: unknown) => {
      if (!cancelled) {
        setHasSecret(false)
        setError(err instanceof Error ? err.message : String(err))
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const handleSaveApiKey = async (): Promise<void> => {
    setError(null)
    const plaintext = apiKeyDraft.trim()
    if (plaintext === '') {
      setError(t('imageGen.needApiKey'))
      return
    }
    setBusy(true)
    try {
      const res = await window.mbApi.settings.setSecret({
        name: SECRET_NAMES.imageGenApiKey,
        plaintext
      })
      if (res.ok) {
        // 明文即刻从内存清掉，不留在任何 state / 存储里
        setApiKeyDraft('')
        setHasSecret(true)
        setStatus(t('imageGen.apiKeySaved'))
      } else {
        setError(res.error ?? t('imageGen.apiKeySaveFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDeleteApiKey = async (): Promise<void> => {
    setError(null)
    setBusy(true)
    try {
      const res = await window.mbApi.settings.deleteSecret({ name: SECRET_NAMES.imageGenApiKey })
      if (res.ok) {
        setApiKeyDraft('')
        setHasSecret(false)
        setStatus(t('imageGen.apiKeyDeleted'))
      } else {
        setError(res.error ?? t('imageGen.apiKeyDeleteFailed'))
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const handleChooseDir = async (): Promise<void> => {
    setError(null)
    try {
      const result = await window.mbApi.dialog.chooseImageSaveDir()
      if (result.path === null) {
        return
      }
      setSaveDir(result.path)
      setStatus(t('imageGen.saveDirSet', { path: result.path }))
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    }
  }

  const handleGenerate = async (): Promise<void> => {
    setError(null)
    setPreviewUrl('')
    setSavedPath('')

    const promptText = prompt.trim()
    if (promptText === '') {
      setError(t('imageGen.needPrompt'))
      return
    }
    // 兜底再问一次钥匙串：用户可能刚在另一个窗口删过
    let configured = hasSecret
    if (configured === null || configured === false) {
      try {
        configured = await refreshHasSecret()
      } catch {
        configured = false
      }
      if (configured === false) {
        setError(t('imageGen.needConfig'))
        return
      }
    }
    if (saveDir.trim() === '') {
      setError(t('imageGen.needDir'))
      return
    }

    // apiKey 传空串：主进程会用系统钥匙串里的真实 Key 覆盖（明文不进 IPC）
    const request: ImageGenConfig = {
      enabled: true,
      provider: config.provider,
      apiKey: '',
      model: config.model.trim() === '' ? undefined : config.model.trim(),
      baseUrl: config.baseUrl.trim() === '' ? undefined : config.baseUrl.trim()
    }

    setBusy(true)
    setStatus(t('imageGen.generatingStatus'))
    try {
      const result = await window.mbApi.image.generate({
        config: request,
        prompt: promptText,
        saveDir
      })
      if (result.ok) {
        setPreviewUrl(result.url)
        setSavedPath(result.path)
        setStatus(t('imageGen.saved', { path: result.path }))
      } else {
        setStatus(null)
        setError(result.error)
      }
    } catch (err) {
      setStatus(null)
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  const secretStateLabel =
    hasSecret === null
      ? t('imageGen.secret.checking')
      : hasSecret
        ? t('imageGen.secret.configured')
        : t('imageGen.secret.unconfigured')

  return (
    <div className="editor" data-testid="image-gen-panel">
      <div className="editor-header">
        <div className="editor-title">
          {t('imageGen.title')}
          <small>{t('imageGen.subtitle')}</small>
        </div>
        <button type="button" className="btn slim" onClick={onClose}>
          {t('common.close')}
        </button>
      </div>

      <div className="editor-body">
        <div className="form-row">
          <label className="form-label" htmlFor="image-gen-provider">
            {t('imageGen.providerLabel')}
          </label>
          <select
            id="image-gen-provider"
            className="form-input"
            data-testid="image-gen-provider"
            value={config.provider}
            onChange={(e) => update('provider', e.target.value as StoredProvider)}
          >
            {(Object.keys(PROVIDER_LABELS) as StoredProvider[]).map((id) => (
              <option key={id} value={id}>
                {t(PROVIDER_LABELS[id])}
              </option>
            ))}
          </select>
        </div>

        <div className="form-row">
          <label className="form-label" htmlFor="image-gen-apikey">
            API Key
          </label>
          <input
            id="image-gen-apikey"
            className="form-input"
            data-testid="image-gen-apikey"
            type="password"
            value={apiKeyDraft}
            placeholder={t('imageGen.apiKeyPlaceholder')}
            onChange={(e) => setApiKeyDraft(e.target.value)}
          />
          <span className="form-hint" data-testid="image-gen-secret-state">
            {t('imageGen.secretState', { state: secretStateLabel })}
          </span>
        </div>

        <div className="form-row">
          <button
            type="button"
            className="btn"
            data-testid="image-gen-save-apikey"
            disabled={busy}
            onClick={() => void handleSaveApiKey()}
          >
            {t('imageGen.saveApiKey')}
          </button>
          <button
            type="button"
            className="btn slim"
            data-testid="image-gen-delete-apikey"
            disabled={busy || hasSecret !== true}
            onClick={() => void handleDeleteApiKey()}
          >
            {t('imageGen.clearApiKey')}
          </button>
        </div>

        <div className="form-row">
          <label className="form-label" htmlFor="image-gen-model">
            {t('imageGen.modelLabel')}
          </label>
          <input
            id="image-gen-model"
            className="form-input"
            data-testid="image-gen-model"
            value={config.model}
            placeholder={t('imageGen.modelPlaceholder')}
            onChange={(e) => update('model', e.target.value)}
          />
        </div>

        {config.provider === 'generic' && (
          <div className="form-row">
            <label className="form-label" htmlFor="image-gen-baseurl">
              Base URL
            </label>
            <input
              id="image-gen-baseurl"
              className="form-input"
              data-testid="image-gen-baseurl"
              value={config.baseUrl}
              placeholder="https://your-endpoint/v1"
              onChange={(e) => update('baseUrl', e.target.value)}
            />
          </div>
        )}

        <div className="form-row">
          <label className="form-label" htmlFor="image-gen-prompt">
            {t('imageGen.promptLabel')}
          </label>
          <textarea
            id="image-gen-prompt"
            className="form-textarea"
            data-testid="image-gen-prompt"
            rows={4}
            value={prompt}
            placeholder={t('imageGen.promptPlaceholder')}
            onChange={(e) => setPrompt(e.target.value)}
          />
        </div>

        <div className="form-row">
          <button
            type="button"
            className="btn"
            data-testid="image-gen-choose-dir"
            disabled={busy}
            onClick={() => void handleChooseDir()}
          >
            {t('imageGen.chooseDir')}
          </button>
          <button
            type="button"
            className="btn primary"
            data-testid="image-gen-generate"
            disabled={busy}
            onClick={() => void handleGenerate()}
          >
            {busy ? t('imageGen.generating') : t('imageGen.generate')}
          </button>
        </div>

        {status !== null && (
          <div className="notice-banner inline" data-testid="image-gen-status">
            {status}
          </div>
        )}
        {error !== null && (
          <div className="error-banner" data-testid="image-gen-error">
            {error}
          </div>
        )}

        {previewUrl !== '' && (
          <div className="form-row">
            <img
              className="image-gen-preview"
              data-testid="image-gen-preview"
              src={previewUrl}
              alt={t('imageGen.previewAlt')}
            />
          </div>
        )}
        {savedPath !== '' && (
          <div className="form-row">
            <input
              className="form-input"
              data-testid="image-gen-saved-path"
              readOnly
              value={savedPath}
            />
          </div>
        )}
      </div>
    </div>
  )
}
