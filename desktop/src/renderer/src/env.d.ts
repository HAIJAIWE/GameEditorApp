/// <reference types="vite/client" />

import type { MbApi } from '../../shared/service/api'

declare global {
  interface Window {
    mbApi: MbApi
  }
}

/*
 * <webview> 的 DOM 类型补齐：@types/react 只声明了**空占位**
 * `interface HTMLWebViewElement extends HTMLElement {}`（global.d.ts，
 * 故意留给消费者扩充）。这里做全局声明合并，补上 src + 导航三件套。
 * did-load 三事件不走 JSX props（React 不认 webview 自定义事件，见
 * BrowserPanel 的 addEventListener 方案），故无需扩充 WebViewHTMLAttributes。
 * 渲染层因此**不需要**引 electron 类型——DOM 形状自持，Node 类型不进 DOM 上下文。
 */
declare global {
  // 合并进 @types/react/global.d.ts 的空占位（本文件是模块，必须 declare global 才生效）
  interface HTMLWebViewElement extends HTMLElement {
    src: string
    goBack(): void
    goForward(): void
    reload(): void
    stop(): void
  }
}

export {}