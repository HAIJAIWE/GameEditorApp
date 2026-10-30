import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { CeshuDocument } from '../../shared/ceshu/ceshuConstants'
import { normalizeCeshu } from '../../shared/ceshu/ceshuModel'
import { buildProjectFolder, projectFilesToDoc } from '../../shared/ceshu/ceshuProjectFolder'

/**
 * 策划书存储（2026-10-26：支持「一份 JSON」与「项目文件夹」两种形态并存）。
 *
 * - **项目文件夹（新文档默认）**：`<dir>/<id>/`（`config.json` + `design/*.md` + `data/*.json` + `tasks/*.md`），
 *   即「一个游戏一个文件夹」——人能直接看、能交付、能塞进 git；
 * - **老文档**：`<dir>/<id>.json`（早期版本的 JSON 形态），已存在就保持原形态，不强迁。
 *
 * `save` 按「该 id 当前是什么形态」自动路由（见该方法注释），存量 JSON 文档零迁移。
 */
export class CeshuStorage {
  constructor(private readonly dir: string) {}

  /** 列出全部策划书（JSON 文件 + 项目文件夹）；单个损坏时跳过，不阻塞其余 */
  listDocuments(): CeshuDocument[] {
    const docs: CeshuDocument[] = []
    for (const id of this.listIds()) {
      try {
        docs.push(this.load(id))
      } catch {
        // 损坏跳过
      }
    }
    return docs
  }

  load(id: string): CeshuDocument {
    const projectDir = this.projectDir(id)
    if (existsSync(join(projectDir, 'config.json'))) {
      const doc = projectFilesToDoc(this.readProjectFiles(projectDir))
      doc.ceshu_id = id
      return doc
    }
    return this.loadJson(id)
  }

  /**
   * 写盘，按「该 id 现在是什么形态」路由：
   *
   * 1. 已有项目文件夹 → 写文件夹（文件夹权威），并清掉同 id 的老 `<id>.json`；
   * 2. 已有 `<id>.json`（老文档）→ 继续写 JSON，**不强迁**（不静默改写用户文件；JSON 保留全部键，
   *    要统一成文件夹请用 `scripts/ceshuMigrateFolders.ts` 显式迁移）；
   * 3. 两者都没有（新建 / 复制 / 派生 / 导入）→ 写项目文件夹。
   *
   * 第 3 条是「一个游戏一个文件夹」的落点：新项目从第一刻起就是可读可交付的目录，
   * 老文档则保持原形态不动 —— 迁移是用户的选择，不是保存的副作用。
   */
  save(doc: CeshuDocument): void {
    const projectDir = this.projectDir(doc.ceshu_id)
    const legacy = this.filePath(doc.ceshu_id)

    if (existsSync(projectDir)) {
      this.saveProject(doc)
      // 留着老 JSON = 两份内容会分叉；一旦文件夹被手工删掉，旧 JSON 会「诈尸」成旧内容。
      // 此处的 doc 本来就优先从文件夹 load，故删除不额外损失可见信息。
      if (existsSync(legacy)) rmSync(legacy)
      return
    }
    if (existsSync(legacy)) {
      this.writeJson(doc, legacy)
      return
    }
    this.saveProject(doc)
  }

  /** 显式写成项目文件夹（新建/导入项目时用；之后 `save` 自动走文件夹） */
  saveProject(doc: CeshuDocument): void {
    const dir = this.projectDir(doc.ceshu_id)
    const { files } = buildProjectFolder(doc)
    for (const [relative, content] of Object.entries(files)) {
      const full = join(dir, relative)
      mkdirSync(dirname(full), { recursive: true })
      // 内容没变就不写：一次保存要碰 50+ 个文件，其中绝大多数是没动过的章。
      // 跳过不仅省 IO，也让 mtime 保持稳定（外部编辑器 / git 不会误判为「刚改过」）。
      if (this.sameContent(full, content)) continue
      writeFileSync(full, content, 'utf-8')
    }
    this.pruneStale(dir, new Set(Object.keys(files)))
  }

  /** 目标文件内容是否已与待写内容一致（不存在/读不出 ⇒ 视为不一致，照写） */
  private sameContent(path: string, content: string): boolean {
    try {
      return readFileSync(path, 'utf-8') === content
    } catch {
      return false
    }
  }

  /**
   * 清掉「这次不该再存在」的旧产物。
   *
   * 只写不删会留下诈尸文件：删掉原型后 `prototype/demo.html` 还在，下次 load 又读回来；
   * 关掉某个模块后 `design/<章>.md` 还在，看着像那章仍有内容。
   *
   * 安全边界：只在**自己管的四个子目录**里动手，且只删 `.md/.json/.html`——
   * 用户往项目里塞的图片、脚本一概不碰。
   */
  private pruneStale(dir: string, keep: ReadonlySet<string>): void {
    for (const sub of ['design', 'data', 'tasks', 'prototype'] as const) {
      const full = join(dir, sub)
      if (!existsSync(full)) continue
      for (const entry of readdirSync(full, { withFileTypes: true })) {
        if (!entry.isFile()) continue
        if (!/\.(md|json|html)$/i.test(entry.name)) continue
        if (keep.has(`${sub}/${entry.name}`)) continue
        rmSync(join(full, entry.name))
      }
    }
  }

  /** 从任意目录导入一个项目文件夹 → 文档，并在本库落地为项目文件夹 */
  importProjectFolder(sourceDir: string): CeshuDocument {
    if (!existsSync(join(sourceDir, 'config.json'))) {
      throw new Error('不是有效的项目文件夹（缺少 config.json）')
    }
    const doc = projectFilesToDoc(this.readProjectFiles(sourceDir))
    this.saveProject(doc)
    return doc
  }

  /** 删除（JSON 文件或项目文件夹均可） */
  remove(id: string): boolean {
    let removed = false
    const path = this.filePath(id)
    if (existsSync(path)) {
      rmSync(path)
      removed = true
    }
    const dir = this.projectDir(id)
    if (existsSync(dir)) {
      rmSync(dir, { recursive: true })
      removed = true
    }
    return removed
  }

  /** 列出目录内的 id：`<id>.json` 的 basename ∪ 含 config.json 的子目录名 */
  listIds(): string[] {
    this.ensureDir()
    const ids = new Set<string>()
    for (const entry of readdirSync(this.dir, { withFileTypes: true })) {
      if (entry.isFile() && entry.name.endsWith('.json')) {
        ids.add(entry.name.slice(0, -'.json'.length))
      } else if (entry.isDirectory() && existsSync(join(this.dir, entry.name, 'config.json'))) {
        ids.add(entry.name)
      }
    }
    return [...ids].sort()
  }

  /** 原子写 JSON（先写 .tmp 再 rename，避免半截文件） */
  private writeJson(doc: CeshuDocument, path: string): void {
    this.ensureDir()
    const tmpPath = `${path}.tmp`
    writeFileSync(tmpPath, JSON.stringify(doc, null, 2), 'utf-8')
    renameSync(tmpPath, path)
  }

  private loadJson(id: string): CeshuDocument {
    const path = this.filePath(id)
    let text: string
    try {
      text = readFileSync(path, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('策划书不存在，可能已被删除', { cause: error })
      }
      throw new Error(`读取策划书文件失败：${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      throw new Error('策划书文件内容损坏（JSON 解析失败）')
    }
    return normalizeCeshu(raw)
  }

  /** 递归读取项目文件夹内的文本文件（相对路径 → 内容） */
  private readProjectFiles(dir: string): Record<string, string> {
    const files: Record<string, string> = {}
    const walk = (current: string, prefix: string): void => {
      for (const entry of readdirSync(current, { withFileTypes: true })) {
        const relative = prefix === '' ? entry.name : `${prefix}/${entry.name}`
        const full = join(current, entry.name)
        if (entry.isDirectory()) walk(full, relative)
        // `.html` = 原型（prototype/demo.html）；不收图片等二进制，读进来也没用
        else if (/\.(json|md|html)$/i.test(entry.name)) files[relative] = readFileSync(full, 'utf-8')
      }
    }
    walk(dir, '')
    return files
  }

  private projectDir(id: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      throw new Error('非法的策划书 id')
    }
    return join(this.dir, id)
  }

  private filePath(id: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      throw new Error('非法的策划书 id')
    }
    return join(this.dir, `${id}.json`)
  }

  private ensureDir(): void {
    mkdirSync(this.dir, { recursive: true })
  }
}
