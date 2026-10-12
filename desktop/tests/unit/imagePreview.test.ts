import { describe, expect, it } from 'vitest'

import {
  IMAGE_PREVIEW_MAX_BYTES,
  buildImagePreviewDataUrl,
  fileExtensionOf,
  imageMimeOf,
  imagePreviewUnavailableReason,
  isSupportedImageFile
} from '../../src/shared/util/imagePreview'

/**
 * 本地图片预览纯逻辑。
 *
 * 动机：PyQt 的「图片」字段是「只读路径框 + 选择按钮 + 实时预览」
 * （`src/ui/widgets/dynamic_form.py::_create_image_widget`），TS 原先只有一个可编辑单行框。
 * 预览必须由主进程回传 `data:` URL（渲染层直接引用 `C:\...` 会被 `webSecurity` 拦），
 * 本模块管「什么文件能预览 / 预览多大」。
 */

describe('图片预览：扩展名与 MIME', () => {
  it('fileExtensionOf 取小写扩展名，不含点', () => {
    expect(fileExtensionOf('a.PNG')).toBe('png')
    expect(fileExtensionOf('C:\\assets\\hero/banner.JPEG')).toBe('jpeg')
    expect(fileExtensionOf('noext')).toBe('')
    expect(fileExtensionOf('trailing.')).toBe('')
    // 前导点（隐藏文件）不当扩展名
    expect(fileExtensionOf('.gitignore')).toBe('')
  })

  it('imageMimeOf 覆盖 PyQt 的白名单 png/jpg/jpeg/bmp/gif', () => {
    expect(imageMimeOf('a.png')).toBe('image/png')
    expect(imageMimeOf('a.jpg')).toBe('image/jpeg')
    expect(imageMimeOf('a.jpeg')).toBe('image/jpeg')
    expect(imageMimeOf('a.bmp')).toBe('image/bmp')
    expect(imageMimeOf('a.gif')).toBe('image/gif')
  })

  it('不在白名单 → 空串（不硬猜类型）', () => {
    expect(imageMimeOf('a.webp')).toBe('')
    expect(imageMimeOf('a.svg')).toBe('')
    expect(imageMimeOf('a.exe')).toBe('')
    expect(isSupportedImageFile('a.webp')).toBe(false)
    expect(isSupportedImageFile('a.png')).toBe(true)
  })
})

describe('图片预览：data URL 构造', () => {
  it('正常图片 → data:<mime>;base64,<内容>', () => {
    expect(buildImagePreviewDataUrl('a.png', 3, 'YWJj')).toBe('data:image/png;base64,YWJj')
    expect(buildImagePreviewDataUrl('a.JPG', 3, 'YWJj')).toBe('data:image/jpeg;base64,YWJj')
  })

  it('超过体积上限 → 空串（不做超大 base64 传输）', () => {
    const tooBig = IMAGE_PREVIEW_MAX_BYTES + 1
    expect(buildImagePreviewDataUrl('a.png', tooBig, 'YWJj')).toBe('')
  })

  it('不支持的格式 → 空串', () => {
    expect(buildImagePreviewDataUrl('a.webp', 10, 'YWJj')).toBe('')
  })
})

describe('图片预览：不可用原因（给用户看的中文说明）', () => {
  it('可预览时返回 null', () => {
    expect(imagePreviewUnavailableReason('a.png', 1024)).toBeNull()
  })

  it('格式不支持 → 说明支持哪些', () => {
    const reason = imagePreviewUnavailableReason('a.webp', 1024)
    expect(reason).not.toBeNull()
    expect(reason).toContain('不支持的图片格式')
    expect(reason).toContain('image/png')
  })

  it('超限 → 说明体积并明确「仅显示路径」（不静默留白）', () => {
    const reason = imagePreviewUnavailableReason('a.png', IMAGE_PREVIEW_MAX_BYTES + 1024 * 1024)
    expect(reason).toContain('仅显示路径不预览')
    expect(reason).toMatch(/\d+ MB/)
  })
})
