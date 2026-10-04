import { describe, expect, it } from 'vitest'
import {
  annotateElementPick,
  adminAiToolLiteracyPrompt,
  isChromeElementPick,
  readElementPick,
} from '@/lib/ai/admin-ai-tool-literacy'

describe('admin-ai-tool-literacy', () => {
  it('includes desk cards and live-context rules for every bookmark', () => {
    const prompt = adminAiToolLiteracyPrompt()
    expect(prompt).toContain('DESK CARDS')
    expect(prompt).toContain('DistroKid')
    expect(prompt).toContain('YouTube Studio')
    expect(prompt).toContain('LIVE CONTEXT')
    expect(prompt).toContain('probe_fields')
    expect(prompt).toContain('SX Direct')
    expect(prompt).toContain('QTA53')
  })

  it('reads chrome selections and compresses their dumps', () => {
    const toolbar = [
      'DOM Path: div.shrink-0',
      'Visible: BROWSER Back Reload Go Site Spotify DistroKid',
      'HTML Element: <div class="shrink-0"></div>',
    ].join('\n')
    expect(isChromeElementPick(toolbar)).toBe(true)
    expect(annotateElementPick(toolbar)).toBe(
      'Selected: The embedded browser toolbar (back, reload, zoom, address, and desk bookmarks). This is chrome, not a field on the open site. A form question needs the live control, LIVE CONTEXT, or probe_fields.',
    )
    expect(annotateElementPick(toolbar)).not.toContain('DOM Path:')
  })

  it('keeps live control dumps and surfaces State', () => {
    const upc = annotateElementPick(
      [
        'Page: https://distrokid.com/new/',
        'DOM Path: form > input#customUpc',
        'State: label="UPC" · value=(empty) · youDrive=yes',
        'HTML Element: <input id="customUpc" name="customUpc" placeholder="UPC">',
      ].join('\n'),
    )
    expect(upc.startsWith('Selected: A field labeled "UPC" on https://distrokid.com/new/')).toBe(true)
    expect(upc).toContain('State: label="UPC"')
    expect(upc).toContain('DOM Path:')
    expect(
      readElementPick(
        'Page: https://studio.youtube.com/\nHTML Element: <button aria-label="Create"></button>',
      ),
    ).toContain('button labeled "Create" on https://studio.youtube.com/')
  })
})
