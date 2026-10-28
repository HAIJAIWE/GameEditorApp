/**
 * 老 JSON → 项目文件夹一次性迁移（2026-10-26）。
 *
 * 背景：`CeshuStorage.save` 对**已存在的老 `<id>.json`** 刻意「不强迁」（保持 早期版本可读），
 * 所以库里会长期并存两种形态。想把存量统一成「一个游戏一个文件夹」时用这个脚本，
 * 它是一次性的显式操作，不是保存的副作用。
 *
 * 用法（本机无 tsx，用 esbuild 打包后 node 跑；有 tsx 的环境可直接 `npx tsx`）：
 *   node_modules/.bin/esbuild scripts/ceshuMigrateFolders.ts --bundle --platform=node \
 *     --format=cjs --outfile=scripts/.tmp-migrate.cjs
 *   node scripts/.tmp-migrate.cjs --library <库目录>                # 预演，不写盘
 *   node scripts/.tmp-migrate.cjs --library <库目录> --apply        # 真正写成项目文件夹
 *   node scripts/.tmp-migrate.cjs --library <库目录> --apply --delete-json   # 迁移后删老 JSON
 *
 * 安全边界：
 * - 默认**预演**，必须 `--apply` 才写盘；
 * - 已是项目文件夹（含 config.json）的 id 直接跳过，绝不覆盖；
 * - `--delete-json` 是显式选项，默认保留老 JSON（迁移出错还能回退）。
 */
import { existsSync, readdirSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { CeshuStorage } from '../src/main/ceshu/storage'

function arg(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`)
  return index === -1 ? undefined : process.argv[index + 1]
}

function hasFlag(name: string): boolean {
  return process.argv.includes(`--${name}`)
}

function main(): void {
  const library = arg('library')
  if (library === undefined || library.trim() === '') {
    console.error('用法：--library <库目录> [--apply] [--delete-json]')
    process.exit(1)
  }
  if (!existsSync(library)) {
    console.error(`库目录不存在：${library}`)
    process.exit(1)
  }
  const apply = hasFlag('apply')
  const deleteJson = hasFlag('delete-json')
  const storage = new CeshuStorage(library)

  let migrated = 0
  let skipped = 0
  let failed = 0

  for (const entry of readdirSync(library, { withFileTypes: true })) {
    if (!entry.isFile() || !entry.name.endsWith('.json')) continue
    const id = entry.name.slice(0, -'.json'.length)
    const projectDir = join(library, id)

    if (existsSync(join(projectDir, 'config.json'))) {
      console.log(`跳过 ${id}：已是项目文件夹`)
      skipped += 1
      continue
    }

    try {
      const doc = storage.load(id) // 读老 JSON（normalizeCeshu 归一）
      const label = doc.meta.game_name || id
      if (!apply) {
        console.log(`[预演] ${id} → ${projectDir}/（${label}）`)
        migrated += 1
        continue
      }
      storage.saveProject(doc) // 写文件夹（config/design/data/tasks）
      if (deleteJson) rmSync(join(library, entry.name))
      console.log(`已迁移 ${id} → ${projectDir}/${deleteJson ? '（已删老 JSON）' : ''}`)
      migrated += 1
    } catch (error) {
      console.error(`迁移失败 ${id}：${error instanceof Error ? error.message : String(error)}`)
      failed += 1
    }
  }

  const tail = apply ? '' : '（预演，未写盘；加 --apply 落盘）'
  console.log(`\n完成：迁移 ${migrated}，跳过 ${skipped}，失败 ${failed}${tail}`)
  if (failed > 0) process.exit(1)
}

main()
