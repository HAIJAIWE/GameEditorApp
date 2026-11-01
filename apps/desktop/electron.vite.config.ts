import { fileURLToPath } from 'node:url'
import react from '@vitejs/plugin-react'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import type { Plugin } from 'vite'

/** 共享包（`packages/shared`）走路径别名，不打进 apps/desktop 的相对路径 */
const sharedAlias = {
  '@mobai/shared': fileURLToPath(new URL('../../packages/shared/src', import.meta.url)),
  // 单实例：shared 与 app 都从 app 的 node_modules 取，避免两份 zod 造成类型/运行时不兼容
  zod: fileURLToPath(new URL('./node_modules/zod', import.meta.url)),
  'pinyin-pro': fileURLToPath(new URL('./node_modules/pinyin-pro', import.meta.url))
}

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
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias: sharedAlias }
  },
  renderer: {
    plugins: [react(), stripCspInDev()],
    resolve: { alias: sharedAlias }
  }
})