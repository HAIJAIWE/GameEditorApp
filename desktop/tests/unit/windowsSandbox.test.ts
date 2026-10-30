import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { isAclSandboxSupported, withReadOnlyDir } from '../../src/main/agent/ops/windowsSandbox'

const isWin = isAclSandboxSupported()
let dir: string | null = null

afterEach(() => {
  if (dir !== null) {
    rmSync(dir, { recursive: true, force: true })
    dir = null
  }
})

describe.skipIf(!isWin)('OS 级沙箱（Windows ACL，Slice 35）', () => {
  it('withReadOnlyDir：期间写入被 OS 拒绝，结束后恢复可写', async () => {
    dir = mkdtempSync(join(tmpdir(), 'mb-acl-'))
    const target = dir

    let deniedDuring = false
    await withReadOnlyDir(target, async () => {
      try {
        writeFileSync(join(target, 'during.txt'), 'x')
      } catch {
        deniedDuring = true
      }
    })

    expect(deniedDuring).toBe(true)
    // 恢复后可写
    expect(() => writeFileSync(join(target, 'after.txt'), 'y')).not.toThrow()
  })
})

describe.skipIf(isWin)('OS 级沙箱（非 Windows 回退）', () => {
  it('非 Windows 抛错（调用方应回退到「拒绝运行」）', async () => {
    await expect(withReadOnlyDir(tmpdir(), async () => undefined)).rejects.toThrow()
  })
})
