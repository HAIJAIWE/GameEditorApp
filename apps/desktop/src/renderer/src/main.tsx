import { StrictMode, type ReactNode } from 'react'
import { createRoot } from 'react-dom/client'

import { LocaleProvider } from '@mobai/client-ui'
import { translate } from '@mobai/shared/i18n'

import App from './App'
import { installInputModalityTracking } from './inputModality'
import { getLocalePreference, useLocalePreference } from './localePreference'
import { pushLlmConfigMirror } from './llmBootstrap'
import { applyFontSize, loadFontSize } from '@mobai/shared/config/settings'
import { applyTheme, loadTheme } from '@mobai/shared/config/settings'

import './styles.css'

// 输入模态跟踪：指针点击抑制焦点环、键盘导航恢复（dsh input-modality 机制）。
// 纯 DOM 监听、无 React 依赖，必须在首帧前装好——否则第一次点击会先闪一下环。
installInputModalityTracking()

// 渲染前先应用主题，避免浅色偏好用户启动时闪一下深色
applyTheme(loadTheme())
// 同理预应用字号（--ui-font-scale）：否则大字号用户会先看到一瞬间的小字再跳大
applyFontSize(loadFontSize())

// 把 LLM 配置镜像推给主进程（主进程读不到 localStorage，见 llmBootstrap.ts 的说明）。
// 必须在 createRoot 之前：主进程侧的配置镜像是每次 AI 调用的唯一非敏感配置来源，
// 晚于任何组件挂载就等于「首次 AI 调用发生在配置就绪之前」。
// ⚠️ 「用户从没配过」时会**跳过推送**（守卫，见 llmBootstrap.ts）：
// 主进程用 `镜像 === null` 表达「从没配置过」，好让 AI 调用给出「配云端 / 一键保密」的
// notConfigured 引导；若无条件推一份默认配置进去，那道闸就永不成立，用户会被误告知
// 「你禁用了 API」。因此镜像为 null 有两种成因，**都**导向「未配置 ⇒ 给指引」的 fail-closed：
// (a) 从没配过（正常路径）；(b) 推送失败（异常兜底，静默不外泄）。
void pushLlmConfigMirror()

const container = document.getElementById('root')
if (!container) {
  throw new Error(translate(getLocalePreference(), 'common.rootMissing'))
}

createRoot(container).render(
  <StrictMode>
    <LocaleRoot>
      <App />
    </LocaleRoot>
  </StrictMode>
)

/**
 * 语言提供者：把模块级偏好（`localePreference.ts`）桥成 React context。
 *
 * 放在根节点而不是 App 内部：设置面板只是**改**语言的一方，改完要靠根节点重渲染
 * 整棵树——如果 Provider 在 App 里、订阅也在 App 里，就得把 locale 一路下传，
 * 迟早漏接（漏接的表现是"设置改了、界面不动"）。
 */
function LocaleRoot({ children }: { children: ReactNode }) {
  const locale = useLocalePreference()
  return <LocaleProvider locale={locale}>{children}</LocaleProvider>
}