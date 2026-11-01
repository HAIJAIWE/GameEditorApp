import { describe, expect, it } from 'vitest'

import {
  baseNameOf,
  dirNameOf,
  formatBytes,
  isCodeFile,
  sortEntries,
  tokenizeCode
} from '../../src/renderer/src/utils/codeView'
import { normalizeUrlInput } from '../../src/renderer/src/utils/urlInput'

describe('isCodeFile：扩展名白名单', () => {
  it('认代码与常见文本格式', () => {
    for (const name of ['a.ts', 'b.tsx', 'c.js', 'd.mjs', 'e.json', 'f.md', 'g.html', 'h.css', 'i.py', 'j.lua', 'k.yaml', 'l.svg']) {
      expect(isCodeFile(name)).toBe(true)
    }
  })

  it('拒图片/二进制/无扩展名/点开头', () => {
    for (const name of ['a.png', 'b.jpg', 'c.exe', 'd.sqlite', 'noext', '.gitignore', 'a.']) {
      expect(isCodeFile(name)).toBe(false)
    }
  })

  it('大小写不敏感', () => {
    expect(isCodeFile('README.MD')).toBe(true)
    expect(isCodeFile('App.TSX')).toBe(true)
  })
})

describe('formatBytes / baseNameOf / dirNameOf', () => {
  it('字节数人读', () => {
    expect(formatBytes(0)).toBe('0 B')
    expect(formatBytes(1023)).toBe('1023 B')
    expect(formatBytes(2048)).toBe('2.0 KB')
    expect(formatBytes(3 * 1024 * 1024)).toBe('3.0 MB')
  })

  it('路径切分兼容两种分隔符', () => {
    expect(baseNameOf('D:\\a\\b.ts')).toBe('b.ts')
    expect(baseNameOf('/x/y/z.ts')).toBe('z.ts')
    expect(dirNameOf('D:\\a\\b.ts')).toBe('D:\\a')
    expect(dirNameOf('/x/y/z.ts')).toBe('/x/y')
  })
})

describe('sortEntries：目录在前 + 数字感知名称序', () => {
  it('目录优先，其余按名称', () => {
    const sorted = sortEntries([
      { name: 'z.ts', isDir: false, size: 1 },
      { name: 'src', isDir: true, size: 0 },
      { name: 'a.ts', isDir: false, size: 1 }
    ])
    expect(sorted.map((e) => e.name)).toEqual(['src', 'a.ts', 'z.ts'])
  })

  it('数字感知：item2 在 item10 前', () => {
    const sorted = sortEntries([
      { name: 'item10', isDir: false, size: 0 },
      { name: 'item2', isDir: false, size: 0 }
    ])
    expect(sorted.map((e) => e.name)).toEqual(['item2', 'item10'])
  })

  it('不改原数组', () => {
    const input = [{ name: 'b', isDir: false, size: 0 }, { name: 'a', isDir: false, size: 0 }]
    sortEntries(input)
    expect(input[0].name).toBe('b')
  })
})

describe('tokenizeCode：分词高亮', () => {
  it('注释/字符串/数字/关键字各归各类', () => {
    const tokens = tokenizeCode('const x = 42 // 注释\nreturn "hi"', 'ts')
    const byKind = (kind: string): string[] => tokens.filter((t) => t.kind === kind).map((t) => t.text)
    expect(byKind('keyword')).toContain('const')
    expect(byKind('keyword')).toContain('return')
    expect(byKind('number')).toContain('42')
    expect(byKind('string')).toContain('"hi"')
    expect(byKind('comment')).toContain('// 注释')
  })

  it('python 注释是 #，ts 不是', () => {
    expect(tokenizeCode('# py comment', 'py')[0].kind).toBe('comment')
    expect(tokenizeCode('# not a comment', 'ts').every((t) => t.kind !== 'comment')).toBe(true)
  })

  it('块注释跨行整体成一个 token', () => {
    const tokens = tokenizeCode('/* a\nb */ x', 'ts')
    expect(tokens.filter((t) => t.kind === 'comment')).toHaveLength(1)
    expect(tokens.find((t) => t.kind === 'comment')?.text).toBe('/* a\nb */')
  })

  it('字符串里的数字与注释符不被二次切分', () => {
    const tokens = tokenizeCode('const s = "a // b 42"', 'ts')
    const strings = tokens.filter((t) => t.kind === 'string')
    expect(strings).toHaveLength(1)
    expect(strings[0].text).toBe('"a // b 42"')
    expect(tokens.filter((t) => t.kind === 'number')).toHaveLength(0)
  })

  it('无损：拼接后等于原文', () => {
    const code = 'function f(a: number): void {\n  return // x\n}'
    expect(tokenizeCode(code, 'ts').map((t) => t.text).join('')).toBe(code)
  })

  it('中文内容原样输出（不误判为关键字）', () => {
    const tokens = tokenizeCode('const 名称 = "剑士"', 'ts')
    expect(tokens.map((t) => t.text).join('')).toBe('const 名称 = "剑士"')
    expect(tokens.filter((t) => t.kind === 'keyword').map((t) => t.text)).toEqual(['const'])
  })
})

describe('normalizeUrlInput：地址栏归一化', () => {
  it('带协议原样', () => {
    expect(normalizeUrlInput('https://example.com/a?b=1')).toBe('https://example.com/a?b=1')
    expect(normalizeUrlInput('http://localhost:5173')).toBe('http://localhost:5173')
    expect(normalizeUrlInput('file:///D:/x.html')).toBe('file:///D:/x.html')
  })

  it('localhost/127.0.0.1 补 http', () => {
    expect(normalizeUrlInput('localhost:5173')).toBe('http://localhost:5173')
    expect(normalizeUrlInput('127.0.0.1:8787/v1/models')).toBe('http://127.0.0.1:8787/v1/models')
  })

  it('盘符路径转 file:///（三斜杠、反斜杠转正）', () => {
    expect(normalizeUrlInput('D:\\GameEditorApp\\demo.html')).toBe('file:///D:/GameEditorApp/demo.html')
    expect(normalizeUrlInput('C:/x/y.html')).toBe('file:///C:/x/y.html')
  })

  it('POSIX 路径转 file://', () => {
    expect(normalizeUrlInput('/tmp/x.html')).toBe('file:///tmp/x.html')
  })

  it('裸域名补 https；空串回落 about:blank', () => {
    expect(normalizeUrlInput('example.com')).toBe('https://example.com')
    expect(normalizeUrlInput('   ')).toBe('about:blank')
  })
})
