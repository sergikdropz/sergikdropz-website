import { describe, expect, it } from 'vitest'
import {
  distrokidCodesFromHtml,
  distrokidPageKind,
  formatDistroKidPageCodes,
  keepToolString,
  orderToolOutputForDistroKid,
} from '@/lib/ai/distrokid-page-codes'

const ALBUM = 'https://distrokid.com/dashboard/album/?albumuuid=FCFD5797-2DFF-4EC2-A5AC8F959F458E38'

const SOUL_CANDY = `
<div class="album-title"><span title="Album title">Soul Candy</span></div>
<div class="band-name"><span>Sergik</span></div>
<div><span>DistroKid UPC:</span><span id="js-album-upc" class="info-value">199083322052</span></div>
<div class="track-row trackRow">
<div class="track-cell track-num">1</div>
<div class="track-cell track-name"><span title="Soul Candy">Soul Candy</span></div>
<div class="track-cell track-isrc desktop-only">
<div class="isrc-value">QZES72569811</div>
</div>
</div>
<div class="track-row trackRow">
<div class="track-cell track-num">2</div>
<div class="track-cell track-name"><span title="Everyday Gratitude">Everyday Gratitude</span></div>
<div class="isrc-value">QZES-72-569812</div>
</div>
</div>
`

describe('distrokid page codes', () => {
  it('reads ISRCs from album HTML, including hyphenated desktop-only cells', () => {
    const codes = distrokidCodesFromHtml(SOUL_CANDY, ALBUM)
    expect(codes?.album).toBe('Soul Candy')
    expect(codes?.upc).toBe('199083322052')
    expect(codes?.tracks).toEqual([
      { n: 1, title: 'Soul Candy', isrc: 'QZES72569811' },
      { n: 2, title: 'Everyday Gratitude', isrc: 'QZES72569812' },
    ])
    const text = formatDistroKidPageCodes(codes!)
    expect(text.startsWith('DISTROKID CODES')).toBe(true)
    expect(text).toContain('2. Everyday Gratitude — QZES72569812')
    expect(text).toContain('Do not open /isrc/')
  })

  it('tells the model that /isrc/ and My Music are not the code list', () => {
    expect(distrokidPageKind('https://distrokid.com/isrc/?albumuuid=ABC')).toBe('isrc')
    const codes = distrokidCodesFromHtml('', 'https://distrokid.com/mymusic/')
    expect(codes?.tracks).toEqual([])
    expect(codes?.note).toMatch(/redirects to My Music/)
    expect(distrokidCodesFromHtml('<input name="isrc">', 'https://distrokid.com/new/')).toBeNull()
  })

  it('keeps the code block when tool text is cut to the first 400 characters of chrome', () => {
    const codes = distrokidCodesFromHtml(SOUL_CANDY, ALBUM)!
    const chrome = `${'Upload\nMy Music\n'.repeat(40)}Staying A Vibe`
    const text = `${chrome}\n${formatDistroKidPageCodes(codes)}`
    expect(text.slice(0, 400)).not.toContain('QZES72569811')
    const kept = keepToolString(text)
    expect(kept.startsWith('DISTROKID CODES')).toBe(true)
    expect(kept).toContain('QZES72569811')
    expect(kept).toContain('QZES72569812')

    const ordered = orderToolOutputForDistroKid({
      text,
      url: ALBUM,
      distrokidCodes: codes,
    })
    expect(Object.keys(ordered)[0]).toBe('distrokidCodes')
    expect(String(ordered.text)).toContain('QZES72569812')
  })
})
