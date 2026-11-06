import JSZip from 'jszip'
import { describe, expect, it } from 'vitest'

import { renderCeshuDocx } from '../../src/main/ceshu/export/doc/docx'
import { renderCeshuPptx } from '../../src/main/ceshu/export/doc/pptx'
import { renderCeshuHtml } from '../../src/main/ceshu/export/doc/html'
import { createDefaultCeshu, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import { APP_CHAPTER_LABELS } from '@mobai/shared/appSchema'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'

/**
 * 路线 A 第 5 步收尾守卫：docx / html / pptx 三个通用导出格式按 docKind 分派。
 * 应用档此前直接查 CHAPTER_LABELS / CESHU_CHAPTER_FIELDS，导出会出现
 * undefined 章标签与游戏章名。这里锁定 SDD 口径，并反向锁定游戏档结构。
 */
function appDoc(): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full', docKind: 'application', name: '效率工具' })
  doc.meta.project_name = '效率工具'
  doc.meta.platform = ['desktop', 'web']
  ;(doc as unknown as Record<string, Record<string, unknown>>).architecture.modules = '按领域边界拆 3 个模块'
  return doc
}

function gameDoc(): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', name: '星海计划' })
}

async function docxText(doc: CeshuDocument): Promise<string> {
  const zip = await JSZip.loadAsync(await renderCeshuDocx(doc))
  return (await zip.file('word/document.xml')?.async('string')) ?? ''
}

async function pptxText(doc: CeshuDocument): Promise<string> {
  const zip = await JSZip.loadAsync(await renderCeshuPptx(doc))
  const slides = Object.keys(zip.files).filter((path) => /^ppt\/slides\/slide\d+\.xml$/.test(path))
  const parts = await Promise.all(slides.map((path) => zip.file(path)!.async('string')))
  return parts.join('\n')
}

describe('应用档：通用导出格式是 SDD 口径', () => {
  it('HTML 导出含全部 SDD 章标签、项目名与平台，无 undefined', () => {
    const doc = appDoc()
    const html = renderCeshuHtml(doc)
    for (const key of visibleChaptersForDoc(doc)) expect(html).toContain(APP_CHAPTER_LABELS[key])
    expect(html).toContain('效率工具')
    expect(html).not.toContain('undefined')
    expect(html).not.toContain('未命名策划书')
    expect(html).not.toContain('第一章·核心玩法')
    expect(html).not.toContain('class="diagrams"') // 不画游戏专属的核心循环/成长曲线
  })

  it('docx 导出含 SDD 章标签与项目名', async () => {
    const text = await docxText(appDoc())
    expect(text).toContain(APP_CHAPTER_LABELS.architecture)
    expect(text).toContain('效率工具')
    expect(text).not.toContain('undefined')
  })

  it('pptx 导出含 SDD 章标签与项目名', async () => {
    const text = await pptxText(appDoc())
    expect(text).toContain(APP_CHAPTER_LABELS.architecture)
    expect(text).toContain('效率工具')
    expect(text).not.toContain('undefined')
  })
})

describe('游戏档：导出结构逐项零回归', () => {
  it('HTML 头部仍是「类型」与游戏名，且不含 SDD 章标签', () => {
    const html = renderCeshuHtml(gameDoc())
    expect(html).toContain('星海计划')
    expect(html).toContain('类型:')
    expect(html).not.toContain('平台:')
    expect(html).not.toContain(APP_CHAPTER_LABELS.architecture)
  })

  it('docx / pptx 仍正常产出且含游戏章标签', async () => {
    const doc = gameDoc()
    const docx = await docxText(doc)
    const pptx = await pptxText(doc)
    expect(docx).toContain('星海计划')
    expect(pptx).toContain('星海计划')
    expect(docx).not.toContain('undefined')
    expect(pptx).not.toContain('undefined')
  })
})
