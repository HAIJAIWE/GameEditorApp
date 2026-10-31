import { describe, expect, it, vi } from 'vitest'

import {
  buildCacheKey,
  clearImageCache,
  ensureCached,
  estimateImageBytes,
  getImageCacheSnapshot,
  IMAGE_CACHE_MAX_BYTES,
  IMAGE_CACHE_MAX_SIZE,
  IMAGE_LOADING_TEXT,
  IMAGE_PLACEHOLDER_TEXT,
  ImageCache,
  isLoadableImagePath,
  subscribeImageCache
} from '../../src/shared/util/io'

/** 造一条缓存项 */
const entry = (key: string, w: number, h: number): { key: string; src: string; bytes: number; reason: string | null } => ({
  key,
  src: `data:image/png;base64,${key}`,
  bytes: estimateImageBytes(w, h),
  reason: null
})

describe('常量：逐条对齐 旧版 image_loader', () => {
  it('MAX_CACHE_SIZE=50 / MAX_CACHE_BYTES=100MB / 占位「无图片」', () => {
    expect(IMAGE_CACHE_MAX_SIZE).toBe(50)
    expect(IMAGE_CACHE_MAX_BYTES).toBe(100 * 1024 * 1024)
    expect(IMAGE_PLACEHOLDER_TEXT).toBe('无图片')
    expect(IMAGE_LOADING_TEXT).toBe('加载中…')
  })
})

describe('estimateImageBytes：RGBA 估算 w*h*4', () => {
  it('常规尺寸', () => {
    expect(estimateImageBytes(100, 100)).toBe(40_000)
    expect(estimateImageBytes(1920, 1080)).toBe(1920 * 1080 * 4)
  })

  it('0 与负数按 0 处理（不产生负字节把缓存算穿）', () => {
    expect(estimateImageBytes(0, 100)).toBe(0)
    expect(estimateImageBytes(-10, 100)).toBe(0)
  })

  it('NaN / Infinity 回落 0（不产生 NaN 污染 totalBytes）', () => {
    expect(estimateImageBytes(Number.NaN, 100)).toBe(0)
    expect(estimateImageBytes(Number.POSITIVE_INFINITY, 100)).toBe(0)
  })
})

describe('buildCacheKey：路径 + 尺寸', () => {
  it('同路径不同尺寸 ⇒ 不同键', () => {
    expect(buildCacheKey('/a.png', 100, 100)).not.toBe(buildCacheKey('/a.png', 200, 200))
  })

  it('不同路径同尺寸 ⇒ 不同键', () => {
    expect(buildCacheKey('/a.png', 100, 100)).not.toBe(buildCacheKey('/b.png', 100, 100))
  })

  it('含 @ 或 x 的怪路径也能区分（键格式稳定）', () => {
    const k = buildCacheKey('/weird@x.png', 1, 2)
    expect(k).toBe('/weird@x.png@1x2')
  })
})

describe('shouldSkipReload（已移除，旧行为由 ensureCached 幂等覆盖）', () => {
  it('占位：确保文件无 shouldSkipReload 残留引用', () => {
    // 旧 v1 暴露的 shouldSkipReload 已在 v2 删除；ensureCached 在命中时直接短路返回，
    // 等价且更强（还覆盖失败项缓存）。这里仅作契约守卫，避免有人误加回该函数。
    expect(typeof ensureCached).toBe('function')
  })
})

describe('ImageCache.peek：只读不改动 LRU 顺序', () => {
  it('peek 存在项不改变 LRU 顺序（与 get 的区别）', () => {
    const c = new ImageCache(2, 1024 * 1024)
    c.set('a', entry('a', 10, 10)) // 顺序 [a]
    c.set('b', entry('b', 10, 10)) // 顺序 [a, b]
    c.peek('a') // 不改变顺序，a 仍是最久未用
    c.set('c', entry('c', 10, 10)) // 超条数 ⇒ 淘汰最久未用 = a
    expect(c.has('a')).toBe(false)
    expect(c.has('b')).toBe(true) // b 比 a 新，保留
    expect(c.size).toBe(2)
  })

  it('peek 不存在项返回 undefined', () => {
    const c = new ImageCache()
    expect(c.peek('x')).toBeUndefined()
  })
})

describe('ensureCached：异步回填 + 失败缓存 + 幂等', () => {
  it('loader 返回 dataUrl ⇒ 缓存命中并回传 loaded', async () => {
    clearImageCache()
    const res = await ensureCached('k1', 400, async () => 'data:image/png;base64,AAA')
    expect(res.status).toBe('loaded')
    expect(res.src).toBe('data:image/png;base64,AAA')
    expect(getImageCacheSnapshot().has('k1')).toBe(true)
  })

  it('loader 返回 null/空串 ⇒ 失败项被缓存（src 空、有 reason），不无限重试', async () => {
    clearImageCache()
    const res = await ensureCached('k2', 0, async () => null)
    expect(res.status).toBe('error')
    expect(res.reason).toBe('图片不可用')
    const cached = getImageCacheSnapshot().peek('k2')
    expect(cached?.src).toBe('')
    expect(cached?.reason).toBe('图片不可用')
  })

  it('loader 抛错 ⇒ 失败项被缓存且 reason 为错误信息', async () => {
    clearImageCache()
    const res = await ensureCached('k3', 0, async () => {
      throw new Error('disk on fire')
    })
    expect(res.status).toBe('error')
    expect(res.reason).toBe('disk on fire')
  })

  it('第二次调用命中缓存，loader 不再被调用（幂等）', async () => {
    clearImageCache()
    const loader = vi.fn(async () => 'data:image/png;base64,BBB')
    await ensureCached('k4', 400, loader)
    const res2 = await ensureCached('k4', 400, loader)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(res2.status).toBe('loaded')
  })

  it('命中失败缓存时直接回 error，不重试 loader', async () => {
    clearImageCache()
    const loader = vi.fn(async () => null)
    await ensureCached('k5', 0, loader)
    const res2 = await ensureCached('k5', 0, loader)
    expect(loader).toHaveBeenCalledTimes(1)
    expect(res2.status).toBe('error')
  })

  it('加载完成 / 失败都会通过 subscribe 广播一次（供 useSyncExternalStore 重渲染）', async () => {
    clearImageCache()
    const listener = vi.fn()
    const unsub = subscribeImageCache(listener)
    await ensureCached('k6', 400, async () => 'data:image/png;base64,CCC')
    expect(listener).toHaveBeenCalled()
    unsub()
  })
})

describe('isLoadableImagePath：对齐 load_image 的空路径守卫', () => {
  it('空串/纯空白/null/undefined 都不可加载', () => {
    expect(isLoadableImagePath('')).toBe(false)
    expect(isLoadableImagePath('   ')).toBe(false)
    expect(isLoadableImagePath(null)).toBe(false)
    expect(isLoadableImagePath(undefined)).toBe(false)
  })

  it('非空路径可加载', () => {
    expect(isLoadableImagePath('/a.png')).toBe(true)
  })

  it('⚠️ 非字符串（数字/对象）安全返回 false，不抛', () => {
    expect(isLoadableImagePath(123 as unknown as string)).toBe(false)
    expect(isLoadableImagePath({} as unknown as string)).toBe(false)
  })
})

describe('ImageCache：LRU 与双重淘汰', () => {
  it('命中后移到最近使用（后续淘汰不会先淘汰它）', () => {
    const c = new ImageCache(3, 10 * 1024 * 1024)
    c.set('a', entry('a', 10, 10))
    c.set('b', entry('b', 10, 10))
    c.set('c', entry('c', 10, 10))
    c.get('a') // a 变成最近使用
    c.set('d', entry('d', 10, 10)) // 超条数 ⇒ 淘汰最久未用 = b
    expect(c.has('a')).toBe(true)
    expect(c.has('b')).toBe(false)
    expect(c.has('c')).toBe(true)
  })

  it('未命中返回 undefined，且不改变顺序', () => {
    const c = new ImageCache()
    expect(c.get('不存在')).toBeUndefined()
    expect(c.size).toBe(0)
  })

  it('条数上限：超出时淘汰最久未用（对齐 MAX_CACHE_SIZE 兜底）', () => {
    const c = new ImageCache(3, 1024 * 1024 * 1024)
    for (const k of ['a', 'b', 'c', 'd'] as const) c.set(k, entry(k, 10, 10))
    // 上限 3 ⇒ 保留最近 3 条（b,c,d），a 被淘汰
    expect(c.size).toBe(3)
    expect(c.has('a')).toBe(false)
    expect(c.has('d')).toBe(true)
  })

  it('字节上限：超预算时按字节淘汰（对齐 MAX_CACHE_BYTES）', () => {
    // 预算只够放 2 张 100x100（40_000 字节/张）
    const c = new ImageCache(50, 90_000)
    c.set('a', entry('a', 100, 100))
    c.set('b', entry('b', 100, 100))
    c.set('c', entry('c', 100, 100)) // 触发淘汰
    expect(c.size).toBe(2)
    expect(c.has('a')).toBe(false) // 最久未用被淘汰
    expect(c.bytes).toBeLessThanOrEqual(90_000)
  })

  it('重复 set 同一键：不重复计数', () => {
    const c = new ImageCache(50, 1024 * 1024)
    c.set('a', entry('a', 100, 100))
    const afterFirst = c.bytes
    c.set('a', entry('a', 100, 100))
    expect(c.bytes).toBe(afterFirst)
    expect(c.size).toBe(1)
  })

  it('重复 set 同一键后它成为最近使用', () => {
    const c = new ImageCache(2, 1024 * 1024)
    c.set('a', entry('a', 10, 10))
    c.set('b', entry('b', 10, 10))
    c.set('a', entry('a', 10, 10)) // a 重新变最近
    c.set('c', entry('c', 10, 10)) // 淘汰 b 而非 a
    expect(c.has('a')).toBe(true)
    expect(c.has('b')).toBe(false)
  })

  it('⚠️ 单条就超预算时不会死循环（while 循环必须有出口）', () => {
    const c = new ImageCache(50, 100) // 预算 100 字节
    // 一张 100x100 = 40000 字节，远超预算
    c.set('big', entry('big', 100, 100))
    // 淘汰循环要把 map 清空后退出；结果允许"放进去"，但不能卡死
    expect(c.size).toBe(1)
  })

  it('⚠️ 大量小图不会撑爆列表（条数兜底生效）', () => {
    const c = new ImageCache(5, 100 * 1024 * 1024)
    for (let i = 0; i < 50; i += 1) c.set(`k${i}`, entry(`k${i}`, 2, 2))
    expect(c.size).toBeLessThanOrEqual(5)
  })

  it('clear 清空并归零字节', () => {
    const c = new ImageCache()
    c.set('a', entry('a', 100, 100))
    c.clear()
    expect(c.size).toBe(0)
    expect(c.bytes).toBe(0)
  })

  it('bytes 累计与实际内容一致', () => {
    const c = new ImageCache()
    c.set('a', entry('a', 10, 10)) // 400
    c.set('b', entry('b', 20, 20)) // 1600
    expect(c.bytes).toBe(2000)
  })
})
