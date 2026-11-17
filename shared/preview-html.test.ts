import { describe, expect, it } from 'vitest'
import { preparePreviewHtml } from './preview-html'

describe('preparePreviewHtml', () => {
  it('在 head 内注入 Storage shim，且幂等', () => {
    const html =
      '<!DOCTYPE html><html><head><meta charset="utf-8"/></head><body>ok</body></html>'
    const once = preparePreviewHtml(html)
    expect(once).toContain('data-atoms-preview-shim')
    expect(once.indexOf('<head>')).toBeLessThan(
      once.indexOf('data-atoms-preview-shim'),
    )
    const twice = preparePreviewHtml(once)
    expect(twice).toBe(once)
  })

  it('空串原样返回', () => {
    expect(preparePreviewHtml('')).toBe('')
    expect(preparePreviewHtml('   ')).toBe('   ')
  })
})
