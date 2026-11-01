import { describe, expect, it } from 'vitest'

import { createPluginLoader } from '@mobai/shared/plugin/loader'
import type { PluginManifest } from '@mobai/shared/plugin/types'

function manifest(id: string): PluginManifest {
  return { id, name: id, version: '0.1.0', capabilities: [] }
}

describe('createPluginLoader', () => {
  it('resolves a factory source to its manifest', async () => {
    const loader = createPluginLoader({ demo: () => manifest('demo') })
    const result = await loader.load('factory:demo')
    expect(result.id).toBe('demo')
  })

  it('supports async factories', async () => {
    const loader = createPluginLoader({ demo: async () => manifest('demo') })
    const result = await loader.load('factory:demo')
    expect(result.id).toBe('demo')
  })

  it('throws for unknown factory id', async () => {
    const loader = createPluginLoader({})
    await expect(loader.load('factory:missing')).rejects.toThrow(/no bundled factory/)
  })

  it('throws for registry source without a configured base', async () => {
    const loader = createPluginLoader({}, {})
    await expect(loader.load('registry:@scope/name')).rejects.toThrow(/registry not configured/)
  })

  it('throws for unsupported source schemes', async () => {
    const loader = createPluginLoader({})
    await expect(loader.load('weird:thing')).rejects.toThrow(/unsupported plugin source/)
  })
})
