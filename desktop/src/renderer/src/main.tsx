import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'

import App from './App'
import { applyTheme, loadTheme } from '../../shared/theme'

import './styles.css'

// 渲染前先应用主题，避免浅色偏好用户启动时闪一下深色
applyTheme(loadTheme())

const container = document.getElementById('root')
if (!container) {
  throw new Error('缺少 #root 挂载节点')
}

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>
)