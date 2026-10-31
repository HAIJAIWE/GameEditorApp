import { useEffect, useSyncExternalStore } from 'react'

import {
  buildCacheKey,
  ensureCached,
  estimateImageBytes,
  getImageCacheSnapshot,
  IMAGE_LOADING_TEXT,
  IMAGE_PLACEHOLDER_TEXT,
  isLoadableImagePath,
  subscribeImageCache
} from '../../../../shared/util/io'

/**
 * 延迟加载的图片控件。
 *
 * ## 为什么需要它
 * 旧版 的 `LazyImageLabel` 是**按已保存路径**加载并回显预览的：
 * 空路径显示「无图片」，加载中显示「加载中...」，到位后上屏。
 * `dynamic_form:747` 打开条目时直接 `load_image(str(value))` —— 即按数据里存的
 * **绝对路径**回读。
 *
 * TS 侧原先只在**本会话刚选择过**图片时才有预览（`picked.path === current`），
 * 于是**打开一条已保存图片路径的条目时看不到任何图** —— 与 旧版 行为不符，是真缺口。
 * 本组件改为：拿到字段值（绝对路径）就经主进程 `images:readByPath` 回读 data URL。
 *
 * ## 与 旧版 的差异（刻意，有依据）
 * - **不做位图重采样**：旧版 用 PIL 真缩小（Qt 吃内存）；浏览器 `<img>` 由引擎解码，
 *   CSS 限尺寸即可，JS 无 PIL，硬做要引入 canvas 重编码 = 过度开发。
 * - **缓存键含目标尺寸**。
 * - **用 data URL 而非本地路径**：渲染层直接引用 `C://...` 会被 `webSecurity` 拦。
 *
 * ## 为什么用「订阅 + 快照」而不是 useEffect 里 setState
 * react-hooks v7.1.1 的 `set-state-in-effect` 是 **error**：在 effect 里同步 setState 会直接报红。
 * 这里改用模块级 store + `useSyncExternalStore`（与 `ToastHost` 同款），
 * 既符合约束，又能在**渲染期**同步命中缓存（不等 effect），避免「先空后闪」。
 */
interface LazyImageProps {
  /** 已保存的图片路径；空串/空白/null 均视为「无图片」 */
  path: string | null | undefined
  /** 目标显示尺寸（用于估算缓存字节数；也作为 <img> 的 width/height） */
  width?: number
  height?: number
  alt?: string
  className?: string
}

export default function LazyImage({
  path,
  width = 100,
  height = 100,
  alt = '图片预览',
  className
}: LazyImageProps) {
  // 快照返回**稳定引用**（globalCache 单例），否则 useSyncExternalStore 会无限重渲染
  const cache = useSyncExternalStore(subscribeImageCache, getImageCacheSnapshot, getImageCacheSnapshot)

  const key = isLoadableImagePath(path) ? buildCacheKey(String(path), width, height) : ''
  // peek 不改动 LRU 顺序，避免在 render 中触发 Map 重排
  const hit = key !== '' ? cache.peek(key) : undefined

  // 异步加载：仅在 effect 里发起；setState 发生在 .then 的 ensureCached 内（非同步于 effect 体）
  useEffect(() => {
    if (key === '') return
    if (cache.has(key)) return
    void ensureCached(key, estimateImageBytes(width, height), async () => {
      const res = await window.mbApi.images.readByPath({ path: String(path) })
      return res.path === null ? null : res.dataUrl
    })
  }, [key, path, width, height, cache])

  // 无路径 ⇒ 占位
  if (key === '') {
    return (
      <div className="image-lazy image-lazy-empty" data-testid="image-lazy-empty">
        {IMAGE_PLACEHOLDER_TEXT}
      </div>
    )
  }

  // 失败 ⇒ 中文原因（不留白，且失败项已缓存，不会反复重试）
  if (hit !== undefined && hit.src === '') {
    return (
      <div className="image-lazy image-lazy-error" data-testid="image-lazy-error">
        {reasonOf(hit)}
      </div>
    )
  }

  // 未到位 ⇒ 骨架
  if (hit === undefined) {
    return (
      <div className="image-lazy image-lazy-loading" data-testid="image-lazy-loading">
        {IMAGE_LOADING_TEXT}
      </div>
    )
  }

  return (
    <img
      className={`image-lazy${className !== undefined && className !== '' ? ` ${className}` : ''}`}
      data-testid="image-lazy"
      src={hit.src}
      alt={alt}
      width={width}
      height={height}
      decoding="async"
      loading="lazy"
    />
  )
}

/** 失败文案：优先用缓存里的原因，兜底通用文案 */
function reasonOf(entry: { reason: string | null }): string {
  return entry.reason ?? '图片不可用'
}
