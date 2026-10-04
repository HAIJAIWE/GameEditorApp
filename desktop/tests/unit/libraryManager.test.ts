import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { describe, expect, it } from 'vitest'

import { LibraryManager, validateLibraryName } from '../../src/main/library/manager'
import { FLAT_ENTRIES, migrateFlatToLibraries } from '../../src/main/library/migrate'
import {
  INITIAL_LIBRARY_NAME,
  LibraryRegistryStore,
  isLibraryRegistry
} from '../../src/main/library/store'

function makeRoot(): string {
  return mkdtempSync(join(tmpdir(), 'mb-library-'))
}

describe('库名校验（库名会参与拼路径，必须挡住越界字符）', () => {
  it('空 / 过长 / 含分隔符 / 含 .. / 以点开头 均被拒绝', () => {
    expect(validateLibraryName('')).toBe('库名不能为空')
    expect(validateLibraryName('   ')).toBe('库名不能为空')
    expect(validateLibraryName('x'.repeat(41))).toContain('库名过长')
    expect(validateLibraryName('a/b')).toContain('不能包含')
    expect(validateLibraryName('a\\b')).toContain('不能包含')
    expect(validateLibraryName('a:b')).toContain('不能包含')
    expect(validateLibraryName('..')).toContain('不能包含 ..')
    expect(validateLibraryName('a..b')).toContain('不能包含 ..')
    expect(validateLibraryName('.hidden')).toBe('库名不能以点开头')
  })

  it('正常库名（含中文与空格）通过', () => {
    expect(validateLibraryName('项目 A')).toBeNull()
    expect(validateLibraryName('初始库')).toBeNull()
  })
})

describe('LibraryRegistryStore：注册表读写', () => {
  it('文件不存在 → 默认注册表（只有初始库且为活跃）', () => {
    const store = new LibraryRegistryStore(join(makeRoot(), 'libraries.json'))
    const registry = store.readStrict()
    expect(registry.activeLibrary).toBe(INITIAL_LIBRARY_NAME)
    expect(registry.libraries).toHaveLength(1)
    expect(registry.libraries[0]?.isInitial).toBe(true)
  })

  it('原子写 + 回读一致，且无 tmp 残留', async () => {
    const root = makeRoot()
    const store = new LibraryRegistryStore(join(root, 'libraries.json'))
    await store.write({
      activeLibrary: 'B 库',
      libraries: [
        { name: 'B 库', createdAt: '2026-10-04 10:00:00', description: '', isInitial: false }
      ]
    })
    expect(store.readStrict().activeLibrary).toBe('B 库')
    expect(existsSync(`${store.path}.tmp`)).toBe(false)
    expect(readFileSync(store.path, 'utf-8')).toContain('B 库')
  })

  it('损坏文件：readStrict 抛中文错误，read 容错回落默认值', () => {
    const root = makeRoot()
    const store = new LibraryRegistryStore(join(root, 'libraries.json'))
    writeFileSync(store.path, '{不是 JSON', 'utf-8')
    expect(() => store.readStrict()).toThrow('库注册表损坏（JSON 解析失败）')
    expect(store.read().activeLibrary).toBe(INITIAL_LIBRARY_NAME)

    writeFileSync(store.path, JSON.stringify({ activeLibrary: 'x', libraries: [] }), 'utf-8')
    expect(() => store.readStrict()).toThrow('库注册表格式不正确')
    expect(store.read().libraries).toHaveLength(1)
  })

  it('isLibraryRegistry：活跃库必须在列表内', () => {
    expect(isLibraryRegistry({ activeLibrary: 'a', libraries: [{ name: 'a' }] })).toBe(true)
    expect(isLibraryRegistry({ activeLibrary: 'b', libraries: [{ name: 'a' }] })).toBe(false)
    expect(isLibraryRegistry({ activeLibrary: 'a', libraries: [] })).toBe(false)
    expect(isLibraryRegistry({ activeLibrary: 'a', libraries: [{ name: '' }] })).toBe(false)
    expect(isLibraryRegistry(null)).toBe(false)
  })
})

describe('LibraryManager：生命周期', () => {
  it('ensureReady：首次创建注册表与初始库目录，二次为幂等', async () => {
    const root = makeRoot()
    const manager = new LibraryManager(root)

    const first = await manager.ensureReady()
    expect(first).toEqual({ registryCreated: true, activeDirCreated: true })
    expect(existsSync(join(root, 'libraries', INITIAL_LIBRARY_NAME))).toBe(true)

    const second = await manager.ensureReady()
    expect(second).toEqual({ registryCreated: false, activeDirCreated: false })
    expect(manager.active()).toBe(INITIAL_LIBRARY_NAME)
    expect(manager.activeDir()).toBe(join(root, 'libraries', INITIAL_LIBRARY_NAME))
  })

  it('create：建目录 + 入注册表；重名 / 非法名 / 目录已存在 均拒绝', async () => {
    const root = makeRoot()
    const manager = new LibraryManager(root)
    await manager.ensureReady()

    const entry = await manager.create('项目 A', '测试库')
    expect(entry).toMatchObject({ name: '项目 A', description: '测试库', isInitial: false })
    expect(existsSync(manager.dirOf('项目 A'))).toBe(true)
    expect(manager.list().map((item) => item.name)).toEqual([INITIAL_LIBRARY_NAME, '项目 A'])

    await expect(manager.create('项目 A')).rejects.toThrow('已存在')
    await expect(manager.create('a/b')).rejects.toThrow('不能包含')
    // 目录已存在（绕过注册表手工建目录）
    mkdirSync(manager.dirOf('野生库'), { recursive: true })
    await expect(manager.create('野生库')).rejects.toThrow('目录已存在')
  })

  it('rename：搬目录；改活跃库时同步更新指针', async () => {
    const root = makeRoot()
    const manager = new LibraryManager(root)
    await manager.ensureReady()
    await manager.create('旧名')
    await manager.switch('旧名')

    await manager.rename('旧名', '新名')
    expect(existsSync(manager.dirOf('旧名'))).toBe(false)
    expect(existsSync(manager.dirOf('新名'))).toBe(true)
    expect(manager.active()).toBe('新名')
    expect(manager.list().map((item) => item.name)).toContain('新名')

    await expect(manager.rename('不存在', 'x')).rejects.toThrow('不存在')
    await expect(manager.rename('新名', INITIAL_LIBRARY_NAME)).rejects.toThrow('已存在')
  })

  it('remove：初始库禁删；删活跃库时先切回初始库', async () => {
    const root = makeRoot()
    const manager = new LibraryManager(root)
    await manager.ensureReady()

    await expect(manager.remove(INITIAL_LIBRARY_NAME)).rejects.toThrow('不可删除')
    await expect(manager.remove('不存在')).rejects.toThrow('不存在')

    await manager.create('临时库')
    await manager.switch('临时库')
    const result = await manager.remove('临时库')
    expect(result.switchedTo).toBe(INITIAL_LIBRARY_NAME)
    expect(manager.active()).toBe(INITIAL_LIBRARY_NAME)
    expect(existsSync(manager.dirOf('临时库'))).toBe(false)
    expect(manager.list().map((item) => item.name)).toEqual([INITIAL_LIBRARY_NAME])
  })

  it('switch：未注册库拒绝；重复切换幂等；指针持久化', async () => {
    const root = makeRoot()
    const manager = new LibraryManager(root)
    await manager.ensureReady()
    await manager.create('B 库')

    await expect(manager.switch('不存在')).rejects.toThrow('不存在')
    await manager.switch('B 库')
    await manager.switch('B 库')
    expect(manager.active()).toBe('B 库')

    // 新实例读同一注册表 → 活跃库保持
    expect(new LibraryManager(root).active()).toBe('B 库')
  })
})

describe('一次性搬迁（平铺 → libraries/<初始库>/）', () => {
  it('无 libraries 目录且有旧数据 → 全部搬入初始库', () => {
    const root = makeRoot()
    writeFileSync(join(root, 'mb-editor.db'), 'db', 'utf-8')
    mkdirSync(join(root, 'ceshu'))
    writeFileSync(join(root, 'type_schema.json'), '{}', 'utf-8')

    const result = migrateFlatToLibraries(root, INITIAL_LIBRARY_NAME)
    expect(result?.moved.sort()).toEqual(['ceshu', 'mb-editor.db', 'type_schema.json'])
    const target = join(root, 'libraries', INITIAL_LIBRARY_NAME)
    expect(existsSync(join(target, 'mb-editor.db'))).toBe(true)
    expect(existsSync(join(target, 'ceshu'))).toBe(true)
    // 原位置已不在
    expect(existsSync(join(root, 'mb-editor.db'))).toBe(false)
  })

  it('已有 libraries 目录 → 视为已迁移，不动（幂等）', () => {
    const root = makeRoot()
    mkdirSync(join(root, 'libraries', INITIAL_LIBRARY_NAME), { recursive: true })
    writeFileSync(join(root, 'mb-editor.db'), 'db', 'utf-8')
    expect(migrateFlatToLibraries(root, INITIAL_LIBRARY_NAME)).toBeNull()
    expect(existsSync(join(root, 'mb-editor.db'))).toBe(true)
  })

  it('全新安装（无旧数据）→ 不动', () => {
    expect(migrateFlatToLibraries(makeRoot(), INITIAL_LIBRARY_NAME)).toBeNull()
  })

  it('搬迁覆盖全部已知旧条目（AGENT 会话/记忆与导出目录也在内）', () => {
    const root = makeRoot()
    for (const entry of FLAT_ENTRIES) {
      writeFileSync(join(root, entry), 'x', 'utf-8')
    }
    const result = migrateFlatToLibraries(root, INITIAL_LIBRARY_NAME)
    expect(result?.moved).toHaveLength(FLAT_ENTRIES.length)
    for (const entry of FLAT_ENTRIES) {
      expect(existsSync(join(root, 'libraries', INITIAL_LIBRARY_NAME, entry))).toBe(true)
    }
  })
})
