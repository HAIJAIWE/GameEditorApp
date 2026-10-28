import type { PluginLoader, PluginManifest, PluginSource } from './types'

/**
 * cordis 式运行时动态加载的最小实现（Slice 44）。
 *
 * 与 dsh `extensions/cordis-*` 的区别：我们不引入完整的 cordis 容器与 sandbox，
 * 只保留「按 source 解析出 manifest」这一核心 seam——静态打包的插件走 `factory:`，
 * 未来外部 bundle 走 `link:/file:/registry:`，宿主侧（`PluginHost`）无需感知差异。
 */

export interface PluginLoaderOptions {
  /** 注册中心基址；省略则 `registry:` 源抛错（骨架期不连外网） */
  registryBase?: string
  /** 外部 bundle 拉取超时（ms），防卡死 */
  fetchTimeoutMs?: number
}

type Factory = () => PluginManifest | Promise<PluginManifest>

/**
 * 创建插件加载器。
 *
 * @param factories 已打包插件的工厂映射（`factory:<id>` 源查这张表）。
 *   工厂函数可以是同步或异步，返回 `PluginManifest`。
 */
export function createPluginLoader(
  factories: Record<string, Factory> = {},
  options: PluginLoaderOptions = {}
): PluginLoader {
  const registryBase = options.registryBase
  const timeout = options.fetchTimeoutMs ?? 15000
  return {
    async load(source: PluginSource): Promise<PluginManifest> {
      if (source.startsWith('factory:')) {
        const id = source.slice('factory:'.length)
        const factory = factories[id]
        if (factory === undefined) throw new Error(`no bundled factory for plugin source "${source}"`)
        return await factory()
      }
      if (source.startsWith('link:') || source.startsWith('file:')) {
        const spec = source.startsWith('link:') ? source.slice('link:'.length) : source.slice('file:'.length)
        return await importExternal(spec)
      }
      if (source.startsWith('registry:')) {
        if (registryBase === undefined) {
          throw new Error(`plugin registry not configured; cannot load "${source}" (set registryBase)`)
        }
        const name = source.slice('registry:'.length)
        const manifest = await fetchRegistryManifest(registryBase, name, timeout)
        return await importExternal(manifest.bundleUrl)
      }
      throw new Error(`unsupported plugin source "${source}"`)
    }
  }
}

/** 运行时动态 import 一个外部 bundle（module 默认导出 `PluginManifest` 或返回它的工厂）。 */
async function importExternal(spec: string): Promise<PluginManifest> {
  // @vite-ignore：spec 是运行时变量，交给构建期之外的 loader 解析（electron 运行时文件/URL）
  const mod = await import(/* @vite-ignore */ spec)
  const exported = (mod as { default?: unknown }).default ?? mod
  if (typeof exported === 'function') return await (exported as () => PluginManifest | Promise<PluginManifest>)()
  if (isManifest(exported)) return exported as PluginManifest
  throw new Error(`plugin module "${spec}" must default-export a PluginManifest or a factory`)
}

function isManifest(value: unknown): value is PluginManifest {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as PluginManifest).id === 'string' &&
    Array.isArray((value as PluginManifest).capabilities)
  )
}

interface RegistryManifest {
  bundleUrl: string
  manifest?: PluginManifest
}

async function fetchRegistryManifest(base: string, name: string, timeoutMs: number): Promise<RegistryManifest> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(`${base.replace(/\/$/, '')}/${name}`, { signal: controller.signal })
    if (!res.ok) throw new Error(`registry returned ${res.status} for "${name}"`)
    return (await res.json()) as RegistryManifest
  } finally {
    clearTimeout(timer)
  }
}
