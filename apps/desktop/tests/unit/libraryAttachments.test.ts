import { describe, expect, it } from 'vitest'

import {
  formatAttachmentSize,
  guessMimeType,
  planAttachmentName
} from '@mobai/shared/util/io'

describe('会话附件：纯辅助函数', () => {
  it('planAttachmentName：保留文件名，重名加 -2/-3 后缀', () => {
    expect(planAttachmentName('/a/b/report.pdf', [])).toBe('report.pdf')
    expect(planAttachmentName('/a/b/report.pdf', ['report.pdf'])).toBe('report-2.pdf')
    expect(planAttachmentName('/a/b/report.pdf', ['report.pdf', 'report-2.pdf'])).toBe('report-3.pdf')
    // 大小写不同也算重名（Windows 文件系统不区分大小写）
    expect(planAttachmentName('/a/b/Report.PDF', ['report.pdf'])).toBe('Report-2.PDF')
    // 空文件名回落固定名
    expect(planAttachmentName('   ', [])).toBe('attachment')
  })

  it('guessMimeType：按扩展名推断，未知回落 octet-stream', () => {
    expect(guessMimeType('a.md')).toBe('text/markdown')
    expect(guessMimeType('a.PNG')).toBe('image/png')
    expect(guessMimeType('a.xlsx')).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet')
    expect(guessMimeType('a.unknown')).toBe('application/octet-stream')
    expect(guessMimeType('noext')).toBe('application/octet-stream')
  })

  it('formatAttachmentSize：B / KB / MB，非法值返回空串', () => {
    expect(formatAttachmentSize(512)).toBe('512 B')
    expect(formatAttachmentSize(2048)).toBe('2.0 KB')
    expect(formatAttachmentSize(5 * 1024 * 1024)).toBe('5.0 MB')
    expect(formatAttachmentSize(-1)).toBe('')
    expect(formatAttachmentSize(Number.NaN)).toBe('')
  })
})
