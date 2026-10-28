import { useCallback, useEffect, useState } from 'react'

import type { ImageGenConfig } from '../../../shared/config/imageGen'
import { loadImageGenConfig, saveImageGenConfig } from '../../../shared/config/imageGenConfig'
import type { StoredImageGenConfig, StoredProvider } from '../../../shared/config/imageGenConfig'
import { SECRET_NAMES } from '../../../shared/config/secretNames'
import { migrateLegacyApiKey, readLegacyImageGenApiKey } from '../../../shared/config/secretMigration'

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

const PROVIDER_LABELS: Readonly<Record<StoredProvider, string>> = {
  openai: 'OpenAI（dall-e-3）',
  qwen: '通义千问（DashScope）',
  doubao: '豆包（火山方舟 Ark）',
  generic: '自定义兼容端点'
}

interface ImageGenPanelProps {
  onClose: () => void
}

export default function ImageGenPanel({ onClose }: ImageGenPanelProps) {
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
        setStatus('已将旧版本保存在本地的 API Key 迁移到系统钥匙串，并清除了本地明文')
      } else if (migration.reason === 'secret-write-failed' || migration.reason === 'invalid-legacy-key') {
        setError(migration.error ?? '旧版 API Key 迁移失败，请重新输入并保存')
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
      setError('请先输入 API Key')
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
        setStatus('API Key 已保存到系统钥匙串（主进程加密落盘，渲染层不再留存明文）')
      } else {
        setError(res.error ?? '保存 API Key 失败')
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
        setStatus('已删除钥匙串中的 API Key')
      } else {
        setError(res.error ?? '删除 API Key 失败')
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
      setStatus(`保存目录：${result.path}`)
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
      setError('请先填写图片描述')
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
        setError('请先配置 API Key（在上方输入后点「保存到钥匙串」）')
        return
      }
    }
    if (saveDir.trim() === '') {
      setError('请先选择保存目录')
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
    setStatus('生成中…（云端 API 请求可能需要数十秒）')
    try {
      const result = await window.mbApi.image.generate({
        config: request,
        prompt: promptText,
        saveDir
      })
      if (result.ok) {
        setPreviewUrl(result.url)
        setSavedPath(result.path)
        setStatus(`已保存到：${result.path}`)
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
    hasSecret === null ? '检查中…' : hasSecret ? '已配置（保存在系统钥匙串）' : '未配置'

  return (
    <div className="editor" data-testid="image-gen-panel">
      <div className="editor-header">
        <div className="editor-title">
          AI 生图
          <small>调用云端图像 API 生成并落盘</small>
        </div>
        <button type="button" className="btn slim" onClick={onClose}>
          关闭
        </button>
      </div>

      <div className="editor-body">
        <div className="form-row">
          <label className="form-label" htmlFor="image-gen-provider">
            服务商
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
                {PROVIDER_LABELS[id]}
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
            placeholder="sk-…（保存到系统钥匙串，保存后本框会被清空）"
            onChange={(e) => setApiKeyDraft(e.target.value)}
          />
          <span className="form-hint" data-testid="image-gen-secret-state">
            钥匙串状态：{secretStateLabel}
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
            保存到钥匙串
          </button>
          <button
            type="button"
            className="btn slim"
            data-testid="image-gen-delete-apikey"
            disabled={busy || hasSecret !== true}
            onClick={() => void handleDeleteApiKey()}
          >
            清除钥匙串中的 Key
          </button>
        </div>

        <div className="form-row">
          <label className="form-label" htmlFor="image-gen-model">
            模型（可选）
          </label>
          <input
            id="image-gen-model"
            className="form-input"
            data-testid="image-gen-model"
            value={config.model}
            placeholder="留空则用服务商默认模型"
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
            图片描述
          </label>
          <textarea
            id="image-gen-prompt"
            className="form-textarea"
            data-testid="image-gen-prompt"
            rows={4}
            value={prompt}
            placeholder="越具体越好：主体 / 服装 / 姿势 / 背景 / 光线 / 视角"
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
            选择保存目录
          </button>
          <button
            type="button"
            className="btn primary"
            data-testid="image-gen-generate"
            disabled={busy}
            onClick={() => void handleGenerate()}
          >
            {busy ? '生成中…' : '生成图片'}
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
              alt="生成的图片预览"
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
