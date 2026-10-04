import { describe, expect, it } from 'vitest'
import {
  youtubeChannelSubscribeHref,
  youtubeSubscribeSmartLinkHref,
  youtubeSubscribeButtonPopupFeatures,
  youtubeSubscribePopupHref,
  youtubeSubscribeGateReturnPath,
  youtubeSubscribeGateStartHref,
  youtubeSubscribePopupCloseHtml,
  youtubeSubscribePopupFeatures,
} from '@/lib/youtube/subscribe-gate-public'

describe('youtube subscribe gate return path', () => {
  it('sends the fan back to the music library release', () => {
    const next = youtubeSubscribeGateReturnPath(
      'http://localhost:3001/music-library?q=awake#play',
      'folder-awake',
    )
    expect(next).toBe('/music-library?q=awake&ytv=folder-awake#play')
    expect(youtubeSubscribeGateStartHref('http://localhost:3001/music-library', 'folder-awake')).toBe(
      '/api/youtube/subscribe-gate/start?ui=popup&next=' +
        encodeURIComponent('/music-library?ytv=folder-awake'),
    )
  })

  it('requests a floating popup instead of a browser tab', () => {
    const features = youtubeSubscribePopupFeatures({
      screenX: 100,
      screenY: 40,
      outerWidth: 1440,
      outerHeight: 900,
    })
    expect(features.startsWith('popup=yes,')).toBe(true)
    expect(features).toContain('width=480')
    expect(features).toContain('height=680')
    expect(features).not.toContain('noopener')
  })

  it('tells the floating window to close after Google returns', () => {
    const html = youtubeSubscribePopupCloseHtml('ok')
    expect(html).toContain('window.close()')
    expect(html).toContain('flag: "ok"')
    expect(html).not.toContain('gsi/transform')
  })

  it('opens the floating subscribe window without leaving the library', () => {
    expect(youtubeSubscribePopupHref('fan@gmail.com')).toBe(
      '/api/youtube/subscribe-gate/intent?email=fan%40gmail.com',
    )
    const features = youtubeSubscribeButtonPopupFeatures({
      screenX: 0,
      screenY: 0,
      outerWidth: 1200,
      outerHeight: 800,
    })
    expect(features).toContain('popup=yes')
    expect(features).toContain('width=400')
    expect(features).toContain('height=460')
  })

  it('opens YouTube’s own subscribe page for the channel', () => {
    expect(youtubeChannelSubscribeHref('sergikdropz')).toBe(
      'https://www.youtube.com/@sergikdropz?sub_confirmation=1',
    )
    expect(youtubeChannelSubscribeHref('@sergikdropz')).toBe(
      'https://www.youtube.com/@sergikdropz?sub_confirmation=1',
    )
    expect(youtubeSubscribeSmartLinkHref('sergikdropz')).toBe(
      'https://www.youtube.com/@sergikdropz?sub_confirmation=1',
    )
  })

  it('drops a previous unlock flag so Google can set a fresh one', () => {
    expect(
      youtubeSubscribeGateReturnPath('https://sergikdropz.com/music-library?ytgate=denied', 'ep-1'),
    ).toBe('/music-library?ytv=ep-1')
  })
})
