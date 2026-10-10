#!/usr/bin/env node
/**
 * 审查：渲染层 JSX 里用到的 class 是否都在 styles.css 里有规则。
 *
 * 背景：系统确认面板「裸奔成纯文本」的根因就是组件写了 .system-card 等类，
 * 而 styles.css 里一个规则都没有。这类缺陷必须机械排查，靠肉眼看不出来。
 *
 * 📌 2026-10-10：由 `scripts/audit-renderer-css.py` **逐行等值移植**（Python 版已随旧技术线移除）。
 *    输出与旧版逐字一致（已用同一份工作树比对通过）。用法：
 *        node scripts/audit-renderer-css.mjs          # 需在仓库根执行
 *        NODE_OPTIONS= env -u ELECTRON_RUN_AS_NODE ./desktop/node_modules/electron/dist/electron.exe \
 *            scripts/audit-renderer-css.mjs            # 本机 node 被拦时的替代运行时
 */
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { fileURLToPath } from 'node:url'

const REPO_ROOT = join(fileURLToPath(new URL('.', import.meta.url)), '..')
const ROOT = join(REPO_ROOT, 'desktop', 'src', 'renderer', 'src')
const CSS = join(ROOT, 'styles.css')

// ---- 1. 收集 CSS 里定义过的 class ----
const cssText = readFileSync(CSS, 'utf-8')
const cssNc = cssText.replace(/\/\*[\s\S]*?\*\//g, '') // 去注释
const defined = new Set()
for (const chunk of cssNc.matchAll(/([^{}]+)\{/g)) {
  const sel = chunk[1].trim()
  if (sel === '' || sel.startsWith('@')) continue
  for (const m of sel.matchAll(/\.([A-Za-z_][A-Za-z0-9_-]*)/g)) {
    defined.add(m[1])
  }
}

// ---- 2. 收集 JSX 里用到的 class ----
/** @type {Map<string, Set<string>>} */
const used = new Map()
const clsPat = /className=(?:"([^"]*)"|\{([^}]*)\})/g
const strPat = /['"`]([^'"`]*)['"`]/g

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, out)
    else out.push(full)
  }
  return out
}

for (const path of walk(ROOT)) {
  if (!path.endsWith('.tsx')) continue
  const rel = relative(ROOT, path)
  const text = readFileSync(path, 'utf-8')
  for (const m of text.matchAll(clsPat)) {
    const raw = m[1] !== undefined ? m[1] : ''
    const expr = m[2] !== undefined ? m[2] : ''
    const chunks = [raw]
    for (const s of expr.matchAll(strPat)) chunks.push(s[1])
    if (expr.includes('`')) {
      for (const t of expr.matchAll(/`([^`]*)`/g)) chunks.push(t[1])
    }
    for (const chunk of chunks) {
      for (const rawToken of chunk.split(/\s+/)) {
        const token = rawToken.trim()
        if (token === '' || token.includes('$') || token.includes('{')) continue
        if (!used.has(token)) used.set(token, new Set())
        used.get(token).add(rel)
      }
    }
  }
}

// ---- 3. 差集（只保留像类名的 token：小写 kebab-case，排除运算符/变量名噪声） ----
const clsName = /^[a-z][a-z0-9-]{2,}$/
/** @type {Map<string, Set<string>>} */
const missing = new Map()
for (const [c, files] of used) {
  if (!defined.has(c) && clsName.test(c)) missing.set(c, files)
}

const pad = (s, w) => s + ' '.repeat(Math.max(0, w - s.length))
console.log(`CSS 已定义 class: ${defined.size}`)
console.log(`JSX 使用 class:   ${used.size}`)
console.log(`疑似无规则的 class: ${missing.size}`)
console.log('')
const byCount = [...missing.keys()].sort((a, b) => {
  const d = missing.get(b).size - missing.get(a).size
  return d !== 0 ? d : (a < b ? -1 : a > b ? 1 : 0)
})
for (const c of byCount) {
  const files = [...missing.get(c)].sort()
  console.log(`  ${pad(c, 28)} 出现 ${files.length} 处  <- ${files.join(', ')}`)
}
console.log('')
console.log('=== 逐个复核（是否在 CSS 里真的没有） ===')
for (const c of [...missing.keys()].sort()) {
  const esc = c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const hit = new RegExp(`(^|[\\s,>+~])\\.${esc}\\b`, 'm').test(cssNc)
  console.log(`  ${pad(c, 28)} ${hit ? '有规则(漏判)' : '★ 确认缺失'}`)
}
