import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'

import ChatMarkdown from '../../src/renderer/src/components/digital/ChatMarkdown'

/**
 * 覆盖 Python `chat_renderer.render_markdown` 的核心能力：
 * 粗体/斜体、围栏代码高亮、GFM 表格、空文本、单换行转 <br>。
 * 组件用 `React.createElement` 渲染（vitest `environment: node`、纯 .test.ts，无 JSX 设施）。
 */
describe('ChatMarkdown：对齐 Python chat_renderer.render_markdown', () => {
  it('粗体 / 斜体 → <strong> / <em>', () => {
    const html = renderToStaticMarkup(createElement(ChatMarkdown, { text: '**重要** 与 *强调*' }))
    expect(html).toContain('<strong>重要</strong>')
    expect(html).toContain('<em>强调</em>')
  })

  it('围栏代码 → 带 hljs class 且含源码', () => {
    const html = renderToStaticMarkup(createElement(ChatMarkdown, { text: '```js\nconst a = 1\n```' }))
    expect(html).toContain('hljs')
    expect(html).toContain('const')
  })

  it('GFM 表格 → <table> / <td>1</td>', () => {
    const html = renderToStaticMarkup(
      createElement(ChatMarkdown, { text: '| a | b |\n| - | - |\n| 1 | 2 |' })
    )
    expect(html).toContain('<table>')
    expect(html).toContain('<td>1</td>')
  })

  it('空文本 → 渲染为 null（空串）', () => {
    const html = renderToStaticMarkup(createElement(ChatMarkdown, { text: '' }))
    expect(html).toBe('')
  })

  it('单换行 → <br>（nl2br / remark-breaks）', () => {
    const html = renderToStaticMarkup(createElement(ChatMarkdown, { text: '第一行\n第二行' }))
    // react-markdown 的 HTML 序列化输出自闭合 <br/>，故用前缀匹配（同时兼容 <br>）
    expect(html).toContain('<br')
  })
})
