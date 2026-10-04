import { describe, expect, it } from 'vitest'
import {
  assistantMayAct,
  assistantMayRunBrowserAction,
  parseBrowserUrl,
  scaleWheel,
  stepZoom,
  viewportPoint,
} from '@/lib/ai/admin-browser-shared'

describe('admin browser helpers', () => {
  it('accepts http and https and adds a scheme', () => {
    expect(parseBrowserUrl('soundcloud.com/sergikdropz')).toBe('https://soundcloud.com/sergikdropz')
    expect(parseBrowserUrl('http://localhost:3001/music')).toBe('http://localhost:3001/music')
  })

  it('rejects other schemes and empty input', () => {
    expect(parseBrowserUrl('')).toBeNull()
    expect(parseBrowserUrl('javascript:alert(1)')).toBeNull()
    expect(parseBrowserUrl('file:///etc/passwd')).toBeNull()
  })

  it('maps a ratio into the viewport', () => {
    expect(viewportPoint(0, 0, 960, 640)).toEqual({ x: 0, y: 0 })
    expect(viewportPoint(1, 1, 960, 640)).toEqual({ x: 959, y: 639 })
    expect(viewportPoint(0.5, 0.5, 960, 640)).toEqual({ x: 480, y: 320 })
  })

  it('scales wheel distance to the Chromium viewport', () => {
    expect(scaleWheel(0, 100, 500, 320, 960, 640)).toEqual({ deltaX: 0, deltaY: 200 })
  })

  it('steps zoom in and out within the allowed range', () => {
    expect(stepZoom(1, 1)).toBe(1.1)
    expect(stepZoom(1, -1)).toBe(0.9)
    expect(stepZoom(0.5, -1)).toBe(0.5)
    expect(stepZoom(2, 1)).toBe(2)
  })

  it('lets the user drive while blocking the assistant', () => {
    expect(assistantMayAct(true, 'user')).toBe(true)
    expect(assistantMayAct(true, 'assistant')).toBe(false)
    expect(assistantMayAct(false, 'assistant')).toBe(true)
    expect(assistantMayRunBrowserAction(true, 'assistant', 'probe_fields')).toBe(true)
    expect(assistantMayRunBrowserAction(true, 'assistant', 'read')).toBe(true)
    expect(assistantMayRunBrowserAction(true, 'assistant', 'distrokid_prefill')).toBe(true)
    expect(assistantMayRunBrowserAction(true, 'assistant', 'distrokid_upload_assets')).toBe(true)
    expect(assistantMayRunBrowserAction(true, 'assistant', 'click')).toBe(false)
    expect(assistantMayRunBrowserAction(true, 'assistant', 'type')).toBe(false)
  })
})