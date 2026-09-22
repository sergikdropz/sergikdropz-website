import { describe, expect, it } from 'vitest'
import { r2ObjectKey, vaultMediaProxyUrl } from '@/lib/audio/r2Media'

describe('r2Media vault helpers', () => {
  it('prefixes audio/ for R2 object keys', () => {
    expect(r2ObjectKey('distrokid/album/track.wav')).toBe('audio/distrokid/album/track.wav')
    expect(r2ObjectKey('/audio/unreleased/a.mp3')).toBe('audio/unreleased/a.mp3')
  })

  it('builds same-origin media proxy URLs', () => {
    expect(vaultMediaProxyUrl('distrokid/soul-candy/QZES72569811-SoulCandy.wav')).toBe(
      '/api/audio/media/distrokid/soul-candy/QZES72569811-SoulCandy.wav',
    )
    expect(vaultMediaProxyUrl('unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3')).toBe(
      '/api/audio/media/unreleased/eps/SERGIK%20-%20FTP/SERGIK%20-%20FTP.mp3',
    )
  })
})
