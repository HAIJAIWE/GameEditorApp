import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, rmSync, utimesSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import {
  buildBackupName,
  formatBackupStamp,
  isValidBackupName,
  parseBackupCreatedAt
} from '../../src/shared/util/io/backup'
import {
  createBackupFile,
  deleteBackupFile,
  listBackups,
  readBackupFile,
  resolveBackupPath
} from '../../src/main/backup/backupStore'

describe('备份存储层（backupStore + shared/backup）', () => {
  let root: string

  beforeAll(() => {
    root = mkdtempSync(join(tmpdir(), 'mb-backup-'))
  })

  afterAll(() => {
    rmSync(root, { recursive: true, force: true })
  })

  /** 每个用例一个独立子目录，避免互相干扰；统一由 afterAll 递归清理 */
  function freshDir(): string {
    return mkdtempSync(join(root, 'case-'))
  }

  /* ---------- shared/backup：命名与时间戳 ---------- */

  it('formatBackupStamp 输出 YYYYmmdd_HHMMSS（本地时间、补零）', () => {
    const d = new Date(2026, 9, 5, 14, 30, 12)
    expect(formatBackupStamp(d)).toBe('20261005_143012')
    expect(formatBackupStamp(new Date(2026, 0, 1, 0, 0, 0))).toBe('20260101_000000')
  })

  it('buildBackupName 无 label', () => {
    expect(buildBackupName(new Date(2026, 9, 5, 14, 30, 12))).toBe('backup_20261005_143012.json')
  })

  it('buildBackupName 带合法 label', () => {
    expect(buildBackupName(new Date(2026, 9, 5, 14, 30, 12), 'before_reset')).toBe(
      'backup_20261005_143012_before_reset.json'
    )
  })

  it('buildBackupName 非法 label 抛错', () => {
    expect(() => buildBackupName(new Date(2026, 9, 5, 14, 30, 12), 'a b')).toThrow('非法的备份标签')
    expect(() => buildBackupName(new Date(2026, 9, 5, 14, 30, 12), 'x'.repeat(41))).toThrow()
  })

  it('命名 ↔ 解析 往返一致（无 label）', () => {
    const d = new Date(2026, 9, 5, 14, 30, 12)
    const name = buildBackupName(d)
    expect(parseBackupCreatedAt(name)).toBe(d.toISOString())
    expect(isValidBackupName(name)).toBe(true)
  })

  it('命名 ↔ 解析 往返一致（带 label 也可解析）', () => {
    const d = new Date(2026, 0, 9, 8, 7, 6)
    const name = buildBackupName(d, 'v1')
    expect(parseBackupCreatedAt(name)).toBe(d.toISOString())
    expect(isValidBackupName(name)).toBe(true)
  })

  it('parseBackupCreatedAt：非法名返回 null，日期越界返回 null', () => {
    expect(parseBackupCreatedAt('random.json')).toBeNull()
    expect(parseBackupCreatedAt('backup_20261005_143012.txt')).toBeNull()
    // 2 月 30 日会被 Date 自动进位 → 回读校验判为非法
    expect(parseBackupCreatedAt('backup_20260230_000000.json')).toBeNull()
  })

  /* ---------- isValidBackupName ---------- */

  it('isValidBackupName 拒绝穿越名与非法扩展名', () => {
    expect(isValidBackupName('../x.json')).toBe(false)
    expect(isValidBackupName('a/b.json')).toBe(false)
    expect(isValidBackupName('x.txt')).toBe(false)
    expect(isValidBackupName('backup_2026.json')).toBe(false)
    expect(isValidBackupName('backup_20261005_143012.exe')).toBe(false)
  })

  it('isValidBackupName 接受标准名与带 label 名', () => {
    expect(isValidBackupName('backup_20261005_143012.json')).toBe(true)
    expect(isValidBackupName('backup_20261005_143012_auto-save_2.json')).toBe(true)
  })

  /* ---------- resolveBackupPath ---------- */

  it('resolveBackupPath：合法名返回 join 结果', () => {
    const dir = freshDir()
    expect(resolveBackupPath(dir, 'backup_20261005_143012.json')).toBe(
      join(dir, 'backup_20261005_143012.json')
    )
  })

  it('resolveBackupPath：穿越名抛错', () => {
    const dir = freshDir()
    expect(() => resolveBackupPath(dir, '../x.json')).toThrow('非法的备份文件名')
    expect(() => resolveBackupPath(dir, 'a/b.json')).toThrow('非法的备份文件名')
  })

  /* ---------- createBackupFile ---------- */

  it('createBackupFile：写出文件、内容深等、entry 字段正确', async () => {
    const dir = freshDir()
    const name = 'backup_20261005_143012.json'
    const payload = { 单位: [{ id: 'u1', hp: 100 }], n: 1 }
    const entry = await createBackupFile(dir, name, payload)

    expect(entry.name).toBe(name)
    expect(entry.sizeBytes).toBeGreaterThan(0)
    expect(Number.isNaN(Date.parse(entry.createdAt))).toBe(false)
    expect(entry.createdAt).toBe(parseBackupCreatedAt(name))
    await expect(readBackupFile(dir, name)).resolves.toEqual(payload)
  })

  it('createBackupFile：同秒同名重复创建不报错，内容被原子替换', async () => {
    const dir = freshDir()
    const name = 'backup_20261005_143012.json'
    await createBackupFile(dir, name, { v: 1 })
    const second = await createBackupFile(dir, name, { v: 2, 新: true })

    expect(second.sizeBytes).toBeGreaterThan(0)
    await expect(readBackupFile(dir, name)).resolves.toEqual({ v: 2, 新: true })
    // 只留一个文件、无残留 .tmp
    expect(readdirSync(dir).filter((f) => f.endsWith('.json'))).toEqual([name])
    expect(readdirSync(dir).some((f) => f.endsWith('.tmp'))).toBe(false)
  })

  /* ---------- listBackups ---------- */

  it('listBackups：仅返回 *.json，忽略 .tmp 与 .deleted', async () => {
    const dir = freshDir()
    const name = 'backup_20261005_143012.json'
    await createBackupFile(dir, name, { a: 1 })
    writeFileSync(join(dir, `${name}.tmp`), '{}', 'utf-8')
    writeFileSync(join(dir, `${name}.deleted`), '{}', 'utf-8')
    writeFileSync(join(dir, 'notes.txt'), 'x', 'utf-8')

    const listed = await listBackups(dir)
    expect(listed.map((e) => e.name)).toEqual([name])
  })

  it('listBackups：不存在的目录返回空数组（不抛错）', async () => {
    const dir = join(freshDir(), 'not-created')
    await expect(listBackups(dir)).resolves.toEqual([])
  })

  it('listBackups：按 mtime 降序', async () => {
    const dir = freshDir()
    const olderName = 'backup_20261005_100000.json'
    const newerName = 'backup_20261005_110000.json'
    await createBackupFile(dir, olderName, { v: 'old' })
    await createBackupFile(dir, newerName, { v: 'new' })
    utimesSync(join(dir, olderName), new Date(2026, 9, 5, 10, 0, 0), new Date(2026, 9, 5, 10, 0, 0))
    utimesSync(join(dir, newerName), new Date(2026, 9, 5, 11, 0, 0), new Date(2026, 9, 5, 11, 0, 0))

    const listed = await listBackups(dir)
    expect(listed.map((e) => e.name)).toEqual([newerName, olderName])
  })

  it('listBackups：文件名解析失败时 createdAt 回退 mtime', async () => {
    const dir = freshDir()
    // 满足正则但日期非法（13 月）→ parse 返回 null → 回退 mtime
    const weird = 'backup_20261332_000000.json'
    writeFileSync(join(dir, weird), '{"x":1}', 'utf-8')
    const listed = await listBackups(dir)
    expect(listed).toHaveLength(1)
    expect(listed[0].createdAt).toBe(listed[0].mtime)
  })

  /* ---------- readBackupFile ---------- */

  it('readBackupFile：往返读回', async () => {
    const dir = freshDir()
    const name = 'backup_20261005_143012.json'
    const payload = { list: [1, 2, 3], 文本: '你好' }
    await createBackupFile(dir, name, payload)
    await expect(readBackupFile(dir, name)).resolves.toEqual(payload)
  })

  it('readBackupFile：非法名抛错；损坏 JSON 抛中文错误', async () => {
    const dir = freshDir()
    await expect(readBackupFile(dir, '../x.json')).rejects.toThrow('非法的备份文件名')
    writeFileSync(join(dir, 'backup_20261005_143012.json'), '{ broken', 'utf-8')
    await expect(readBackupFile(dir, 'backup_20261005_143012.json')).rejects.toThrow('内容损坏')
  })

  /* ---------- deleteBackupFile（软删） ---------- */

  it('deleteBackupFile：软删——列表不再含它，但同名 .deleted 文件存在', async () => {
    const dir = freshDir()
    const name = 'backup_20261005_143012.json'
    await createBackupFile(dir, name, { a: 1 })

    await deleteBackupFile(dir, name)

    await expect(listBackups(dir)).resolves.toEqual([])
    expect(existsSync(join(dir, `${name}.deleted`))).toBe(true)
    expect(existsSync(join(dir, name))).toBe(false)
  })

  it('deleteBackupFile：重复删除同一备份会产生 .deleted.2（不覆盖回收文件）', async () => {
    const dir = freshDir()
    const name = 'backup_20261005_143012.json'
    await createBackupFile(dir, name, { v: 1 })
    await deleteBackupFile(dir, name)
    await createBackupFile(dir, name, { v: 2 })
    await deleteBackupFile(dir, name)

    const files = readdirSync(dir)
    expect(files).toContain(`${name}.deleted`)
    expect(files).toContain(`${name}.deleted.2`)
  })

  it('deleteBackupFile：对不存在文件抛中文错误', async () => {
    const dir = freshDir()
    await expect(deleteBackupFile(dir, 'backup_20261005_143012.json')).rejects.toThrow('不存在')
  })

  it('deleteBackupFile：非法名抛错（拒绝删除穿越目标）', async () => {
    const dir = freshDir()
    await expect(deleteBackupFile(dir, '../x.json')).rejects.toThrow('非法的备份文件名')
  })
})
