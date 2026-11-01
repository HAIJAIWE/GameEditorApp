import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { isPathUnder, PathEscapeError, resolveInsideRoot } from '@mobai/agent-core/skills/fsContainment'

let root = ''

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'mb-contain-'))
})

afterEach(async () => {
  if (root !== '') await rm(root, { recursive: true, force: true })
})

describe('isPathUnder（对齐 dsh fs-sandbox containment）', () => {
  it('根目录本身与子路径都在其下', async () => {
    expect(await isPathUnder(root, root)).toBe(true)
    expect(await isPathUnder(join(root, 'a', 'b.txt'), root)).toBe(true)
  })

  it('同级 / 父级路径不在其下', async () => {
    expect(await isPathUnder(resolve(root, '..'), root)).toBe(false)
    expect(await isPathUnder(join(root, '..', 'other'), root)).toBe(false)
  })

  it('词法前缀不能误判（root 与 root2 不是父子）', async () => {
    expect(await isPathUnder(`${root}-sibling`, root)).toBe(false)
  })
})

describe('resolveInsideRoot', () => {
  it('工作区内路径解析为绝对路径', async () => {
    const abs = await resolveInsideRoot(root, 'sub/file.txt')
    expect(abs.startsWith(root)).toBe(true)
  })

  it('`..` 穿越越界抛 PathEscapeError', async () => {
    await expect(resolveInsideRoot(root, '../evil.txt')).rejects.toBeInstanceOf(PathEscapeError)
  })

  it('绝对路径越界抛 PathEscapeError', async () => {
    await expect(resolveInsideRoot(root, resolve(root, '..', 'x'))).rejects.toBeInstanceOf(PathEscapeError)
  })
})

describe('isPathUnder 文件身份兜底', () => {
  it('已存在文件与其根判为包含', async () => {
    await writeFile(join(root, 'f.txt'), 'x', 'utf8')
    expect(await isPathUnder(join(root, 'f.txt'), root)).toBe(true)
  })
})
