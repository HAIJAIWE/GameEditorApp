import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { pushLlmConfigMirror } from './llmBootstrap'
import { applyFontSize, loadFontSize } from '../../shared/config/settingsPreferences'
import { applyTheme, loadTheme } from '../../shared/config/theme'

import './styles.css'

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
  throw new Error('缺少 #root 挂载节点')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)