/**
 * 图片预览缓存（对齐 Python `src/ui/components/image_loader.py`）。
 *
 * ## 范围：只迁 `LazyImageLabel` 那条真实路径
 * 那个文件里有两个类，**别照着名字迁错**：
 * - `LazyImageLoader`（:55）：线程池 + LRU 缓存管理器。它在 PyQt 里**只在退出时**
 *   被 `main_window.py:894` 调 `shutdown_all()`，本身不是 UI。
 * - **`LazyImageLabel`（:251）才是真正在用的**：被 `ui/widgets/dynamic_form.py:581`
 *   实例化为**数据表单里图片字段的预览控件**（:593 / :747 `load_image(...)`）。
 * ⇒ 本模块迁的是 `LazyImageLabel` 对外表现出的行为 + 其背后 LRU 缓存的**纯逻辑**。
 *
 * ## 与 PyQt 的差异（刻意，有依据）
 * - **不做位图重采样**：Python 用 PIL `thumbnail(..., LANCZOS)` 真缩小，因为 Qt 显示大图吃内存。
 *   浏览器/Electron 里 `<img>` 由渲染引擎解码，用 CSS 限显示尺寸即可；
 *   JS 没有 PIL，硬做要引入 canvas 重编码 = 过度开发。
 * - **缓存键含目标尺寸**：Python 的 `self.cache` 只以 `file_path` 为键，换尺寸会拿到错误大小的图。
 *   本实现把尺寸并进键（一处小修正）。
 *
 * ## 为什么用「订阅 + 快照」而不是 useEffect 里 setState
 * react-hooks v7.1.1 的 `set-state-in-effect` 是 **error**：在 effect 里同步 setState 会直接报红。
 * 这里改用模块级 store + `useSyncExternalStore`（与 `ToastHost` 同款），
 * 既符合约束，又能在**渲染期**同步命中缓存（不等 effect），避免「先空后闪」。
 */

/** 缓存项 */
export interface CachedImageEntry {
  key: string
  /** 加载成功为 data URL；加载失败（文件不存在 / 不支持格式 / 读失败）为空串 */
  src: string
  bytes: number
  /** 仅加载失败项有值：中文原因；成功项为 null */
  reason: string | null
}

/** 缓存条数上限（对齐 Python `MAX_CACHE_SIZE = 50`） */
export const IMAGE_CACHE_MAX_SIZE = 50

/** 缓存字节上限 100MB（对齐 Python `MAX_CACHE_BYTES`） */
export const IMAGE_CACHE_MAX_BYTES = 100 * 1024 * 1024

/** 占位文本（对齐 Python `placeholder_text="无图片"`） */
export const IMAGE_PLACEHOLDER_TEXT = '无图片'

/** 加载中文本（对齐 Python `setText("加载中...")`） */
export const IMAGE_LOADING_TEXT = '加载中…'

/** 组装缓存键：路径 + 目标尺寸（修正 Python 只按路径作键） */
export function buildCacheKey(path: string, width: number, height: number): string {
  return `${path}@${width}x${height}`
}

/**
 * 路径是否「可加载」。对齐 `LazyImageLabel.load_image` 的守卫：
 * 空 / 空白 / 非字符串 ⇒ 不可加载（显示占位）。
 */
export function isLoadableImagePath(path: string | null | undefined): boolean {
  if (typeof path !== 'string') return false
  return path.trim() !== ''
}

/** 估算解码后占用：RGBA = w * h * 4（对齐 Python `_add_to_cache`） */
export function estimateImageBytes(width: number, height: number): number {
  if (!Number.isFinite(width) || !Number.isFinite(height)) return 0
  const w = Math.max(0, Math.floor(width))
  const h = Math.max(0, Math.floor(height))
  return w * h * 4
}

export type ImageLoadStatus = 'empty' | 'loading' | 'loaded' | 'error'

export interface ImageCacheEntry {
  status: Extract<ImageLoadStatus, 'loaded' | 'error'>
  /** `loaded` 时为 data URL；`error` 时为空串 */
  src: string
  /** `error` 时为中文原因；`loaded` 时为 null */
  reason: string | null
}

/**
 * 模块级 LRU 缓存（可直接单测）。
 *
 * 淘汰规则逐条对齐 Python `_add_to_cache`：
 * 1. 已存在则先移除旧记录（并扣回字节数），保证重新插入后处于「最近使用」位置；
 * 2. 按**字节上限**淘汰最久未用；
 * 3. 再按**条数上限**兜底淘汰；
 * 4. 插入并累加字节数。
 */
export class ImageCache {
  private readonly map = new Map<string, CachedImageEntry>()
  private totalBytes = 0

  constructor(
    private readonly maxSize: number = IMAGE_CACHE_MAX_SIZE,
    private readonly maxBytes: number = IMAGE_CACHE_MAX_BYTES
  ) {}

  get size(): number {
    return this.map.size
  }

  get bytes(): number {
    return this.totalBytes
  }

  /** 命中则返回值，并把它挪到「最近使用」 */
  get(key: string): CachedImageEntry | undefined {
    const hit = this.map.get(key)
    if (hit === undefined) return undefined
    this.map.delete(key)
    this.map.set(key, hit)
    return hit
  }

  has(key: string): boolean {
    return this.map.has(key)
  }

  /** 只读取值、**不改动 LRU 顺序**（供渲染期读取，避免 render 中触发 Map 重排） */
  peek(key: string): CachedImageEntry | undefined {
    return this.map.get(key)
  }

  /** 插入一条，按规则淘汰最久未用的项 */
  set(key: string, entry: CachedImageEntry): void {
    const existing = this.map.get(key)
    if (existing !== undefined) {
      this.map.delete(key)
      this.totalBytes -= existing.bytes
    }
    while (this.totalBytes + entry.bytes > this.maxBytes && this.map.size > 0) {
      this.evictOldest()
    }
    while (this.map.size >= this.maxSize && this.map.size > 0) {
      this.evictOldest()
    }
    this.map.set(key, entry)
    this.totalBytes += entry.bytes
  }

  private evictOldest(): void {
    const oldest = this.map.keys().next()
    if (oldest.done === true) return
    const victim = this.map.get(oldest.value)
    if (victim !== undefined) this.totalBytes -= victim.bytes
    this.map.delete(oldest.value)
  }

  clear(): void {
    this.map.clear()
    this.totalBytes = 0
  }
}

/** 全局单例：跨组件复用，避免同一张图在列表里重复解码 */
const globalCache = new ImageCache()
const listeners = new Set<() => void>()

function emit(): void {
  for (const fn of listeners) fn()
}

/** `useSyncExternalStore` 订阅入口 */
export function subscribeImageCache(listener: () => void): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/** `useSyncExternalStore` 快照入口（返回**稳定引用**，否则会无限重渲染） */
export function getImageCacheSnapshot(): ImageCache {
  return globalCache
}

/**
 * 把某个尺寸的图片读进缓存（幂等：已在缓存则直接返回）。
 *
 * `loader` 由调用方注入（渲染层传 IPC 调用，测试传假实现）——
 * 这样纯逻辑模块**不依赖 `window`**，可在 node 环境直接单测。
 */
export async function ensureCached(
  key: string,
  bytes: number,
  loader: () => Promise<string | null>
): Promise<ImageCacheEntry> {
  // 命中（含失败缓存项）：直接返回，**无需再广播**——peek 不改动顺序，
  // 且失败项也缓存了，组件读取时会落到对应分支，不会无限重试。
  const existing = globalCache.peek(key)
  if (existing !== undefined) {
    return existing.src === ''
      ? { status: 'error', src: '', reason: existing.reason ?? '图片不可用' }
      : { status: 'loaded', src: existing.src, reason: null }
  }

  try {
    const src = await loader()
    if (src === null || src === '') {
      // 文件不可用也落缓存（src 空串标记），避免组件永远停在「加载中」
      globalCache.set(key, { key, src: '', bytes: 0, reason: '图片不可用' })
      emit()
      return { status: 'error', src: '', reason: '图片不可用' }
    }
    globalCache.set(key, { key, src, bytes, reason: null })
    emit()
    return { status: 'loaded', src, reason: null }
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error)
    globalCache.set(key, { key, src: '', bytes: 0, reason })
    emit()
    return { status: 'error', src: '', reason }
  }
}

/** 清空缓存并广播（测试用） */
export function clearImageCache(): void {
  globalCache.clear()
  emit()
}
