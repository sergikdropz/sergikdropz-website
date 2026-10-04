import { describe, expect, it } from 'vitest'
import {
  browserImageContentRect,
  browserSurfaceRatio,
  elementPickSegment,
  formatElementPickSource,
  formatElementPickText,
  mapBrowserElementRect,
  normalizeElementPickSource,
} from '@/lib/ai/admin-ai-element-pick'

describe('admin-ai-element-pick', () => {
  it('builds a Cursor-style path segment from tag, id, and classes', () => {
    expect(elementPickSegment('BUTTON', 'save', 'inline-flex h-8 w-8')).toBe(
      'button#save.inline-flex.h-8.w-8',
    )
    expect(elementPickSegment('DIV', ':r1:', 'fixed inset-0')).toBe('div.fixed.inset-0')
    expect(elementPickSegment('SPAN', null, '  ')).toBe('span')
  })

  it('formats the three-line element reference', () => {
    expect(
      formatElementPickText({
        path: 'div.fixed.inset-0 > button.inline-flex',
        top: 1108,
        left: 676,
        width: 32,
        height: 32,
        html: '<button type="button" aria-label="Attach files"></button>',
      }),
    ).toBe(
      [
        'DOM Path: div.fixed.inset-0 > button.inline-flex',
        'Position: top=1108px, left=676px, width=32px, height=32px',
        'HTML Element: <button type="button" aria-label="Attach files"></button>',
      ].join('\n'),
    )
  })

  it('formats a live-browser element with its page url and state', () => {
    const source = normalizeElementPickSource({
      tag: 'input',
      id: 'customUpc',
      className: '',
      ancestors: [{ tag: 'form', id: 'auth', className: '' }],
      attrs: [
        { name: 'id', value: 'customUpc' },
        { name: 'placeholder', value: 'UPC' },
      ],
      text: '',
      childElementCount: 0,
      top: 40.2,
      left: 12.6,
      width: 80,
      height: 24,
      value: '',
      required: true,
      associatedLabel: 'UPC',
    })
    expect(source).not.toBeNull()
    expect(formatElementPickSource(source!, 'https://distrokid.com/new/', { youDrive: true })).toBe(
      [
        'Page: https://distrokid.com/new/',
        'DOM Path: form#auth > input#customUpc',
        'Position: top=40px, left=13px, width=80px, height=24px',
        'State: label="UPC" · value=(empty) · required · youDrive=yes',
        'HTML Element: <input id="customUpc" placeholder="UPC">',
      ].join('\n'),
    )
  })


  it('keeps a parent’s visible labels when the HTML line cannot hold them', () => {
    const source = normalizeElementPickSource({
      tag: 'div',
      id: '',
      className: 'shrink-0',
      ancestors: [],
      attrs: [{ name: 'class', value: 'shrink-0' }],
      text: 'BROWSER Back Reload Site Spotify DistroKid',
      childElementCount: 4,
      top: 79,
      left: 224,
      width: 712,
      height: 286,
    })
    expect(formatElementPickSource(source!)).toContain(
      'Visible: BROWSER Back Reload Site Spotify DistroKid',
    )
  })

  it('maps a point on the browser picture back to the remote viewport', () => {
    const surface = { top: 151, left: 811, width: 1403, height: 974 }
    const content = browserImageContentRect(surface, 1403, 974)
    expect(content).toEqual(surface)
    expect(browserSurfaceRatio(811, 151, content)).toEqual({ x: 0, y: 0 })
    expect(browserSurfaceRatio(800, 151, content)).toBeNull()

    const letterboxed = browserImageContentRect({ top: 0, left: 0, width: 200, height: 100 }, 100, 100)
    expect(letterboxed).toEqual({ top: 0, left: 50, width: 100, height: 100 })
    expect(
      mapBrowserElementRect({ top: 10, left: 20, width: 30, height: 40 }, letterboxed, 100, 100),
    ).toEqual({ top: 10, left: 70, width: 30, height: 40 })
  })
})
