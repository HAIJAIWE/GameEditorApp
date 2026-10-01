import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

/**
 * 开发模式下剥离 CSP meta：
 * @vitejs/plugin-react 的 Fast Refresh 会注入内联脚本，与严格 CSP 冲突。
 * 生产构建保留 index.html 中的严格 CSP。
 */
function stripCspInDev(): Plugin {
  return {
    name: 'strip-csp-in-dev',
    apply: 'serve',
    transformIndexHtml(html: string): string {
      return html.replace(/<meta[^>]*http-equiv="Content-Security-Policy"[^>]*>\s*/i, '')
    }
  }
}

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()]
  },
  preload: {
    plugins: [externalizeDepsPlugin()]
  },
  renderer: {
    plugins: [react(), stripCspInDev()]
  }
})