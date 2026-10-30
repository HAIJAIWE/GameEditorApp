import { useState } from 'react'

import type { CeshuDocument } from '../../../shared/ceshu/reference/ceshuConstants'
import { buildDemoPrompt } from '../../../shared/ceshu/prompts/ceshuDemoPrompt'
import { isPrototypeStale } from '../../../shared/ceshu/workflow/ceshuPrototypeStale'
import { toErrorMessage } from '../../../shared/util/errors'

/**
 * 原型预览（三栏布局「原型预览」标签）。
 *
 * 生成走 `buildDemoPrompt(doc)`（纯函数）+ `window.mbApi.llm.generate`（通用 LLM 通道，
 * `scripts/generateDemo.ts` 走的也是它）；**生成完必须落盘**（`ceshu:saveDemo` →
 * 项目文件夹 `prototype/demo.html`），否则关掉窗口就没了，而生成一次是要花钱的。
 *
 * 安全：LLM 产出的 HTML 放进 `sandbox="allow-scripts"` 的 iframe（**不加 allow-same-origin**），
 * 隔离到唯一源，拿不到宿主 cookie/DOM。这是渲染不可信 HTML 的标准做法。
 */

function stripCodeFence(raw: string): string {
  return raw
    .replace(/^```html\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```\s*$/i, '')
    .trim()
}

export default function CeshuPrototypePanel({
  doc,
  onDocUpdated
}: {
  doc: CeshuDocument
  /** 生成/保存后把最新文档交回上层（否则界面还显示旧 doc） */
  onDocUpdated?: (doc: CeshuDocument) => void
}) {
  // 已保存的原型直接显示：打开项目就能看到上次生成的成果，不用再花钱
  const saved = doc.demo_html ?? ''
  // 用「草稿 + 归属 id」而不是裸 state：切换文档时草稿自动失效，回落到该文档已保存的原型
  const [draft, setDraft] = useState<{ id: string; html: string } | null>(null)
  const html = draft !== null && draft.id === doc.ceshu_id ? draft.html : saved
  // 文档在生成原型后改过（指纹对不上）⇒ 提示原型可能过期，别让旧原型冒充最新
  const stale = isPrototypeStale(doc)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const generate = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    setNotice(null)
    try {
      const { system, prompt } = buildDemoPrompt(doc)
      const result = await window.mbApi.llm.generate({ system, prompt })
      const next = stripCodeFence(result.content ?? '')
      if (!/<html[\s>]/i.test(next)) {
        throw new Error('模型没有返回完整 HTML，请重试或换个模型')
      }
      setDraft({ id: doc.ceshu_id, html: next })
      // 落盘失败不该把刚生成的成果丢掉：先显示，再把错误说出来
      try {
        const savedDoc = await window.mbApi.ceshu.saveDemo({ id: doc.ceshu_id, html: next })
        onDocUpdated?.(savedDoc.doc)
        setNotice('原型已保存到项目文件夹 prototype/demo.html')
      } catch (err) {
        setError(`原型已生成但保存失败：${toErrorMessage(err)}`)
      }
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="prototype-panel" data-testid="prototype-panel">
      <div className="prototype-toolbar">
        <button
          type="button"
          className="btn primary"
          data-testid="prototype-generate"
          disabled={busy}
          onClick={() => void generate()}
        >
          {busy ? '生成中…' : html === '' ? '生成可玩原型' : '重新生成'}
        </button>
        <span className="prototype-hint">按当前设计文档生成单文件 HTML（验证核心循环，不是成品）</span>
      </div>
      {error !== null && (
        <div className="form-error" data-testid="prototype-error">
          {error}
        </div>
      )}
      {notice !== null && (
        <div className="notice-banner inline" data-testid="prototype-notice">
          {notice}
        </div>
      )}
      {stale && (
        <div className="notice-banner inline stale" data-testid="prototype-stale">
          设计文档在生成原型后有改动，当前原型可能已过期。点「重新生成」按最新文档更新。
        </div>
      )}
      {html === '' ? (
        <div className="artifact-placeholder" data-testid="prototype-empty">
          <div className="artifact-placeholder-title">还没有原型</div>
          <p>点「生成可玩原型」，AI 会按设计文档产出一个单文件 HTML。</p>
        </div>
      ) : (
        <iframe
          className="prototype-frame"
          data-testid="prototype-frame"
          title="原型预览"
          sandbox="allow-scripts"
          srcDoc={html}
        />
      )}
    </div>
  )
}
