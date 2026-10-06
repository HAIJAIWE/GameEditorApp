import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { applyFontSize, loadFontSize } from '../../shared/settingsPreferences'
import { applyTheme, loadTheme } from '../../shared/theme'

import './styles.css'

// 渲染前先应用主题，避免浅色偏好用户启动时闪一下深色
applyTheme(loadTheme())
// 同理预应用字号（--ui-font-scale）：否则大字号用户会先看到一瞬间的小字再跳大
applyFontSize(loadFontSize())

const container = document.getElementById('root')
if (!container) {
  throw new Error('缺少 #root 挂载节点')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)