import { describe, expect, it } from 'vitest'
import {
  formatBytesMb,
  isConvertibleOversizeAudio,
  isWithinDirectIngestLimit,
  maxDirectBytesForDuration,
  PLAYLIST_DROP_MAX_DIRECT_BYTES,
  HIGH_RES_WAV_BYTES_PER_SEC,
} from './playlist-drop-limits'

describe('playlist-drop-limits', () => {
  it('keeps the 80MB soft floor for unknown/short duration', () => {
    expect(maxDirectBytesForDuration(null)).toBe(PLAYLIST_DROP_MAX_DIRECT_BYTES)
    expect(maxDirectBytesForDuration(60)).toBe(PLAYLIST_DROP_MAX_DIRECT_BYTES)
    expect(isWithinDirectIngestLimit(PLAYLIST_DROP_MAX_DIRECT_BYTES)).toBe(true)
  })

  it('raises the cap for longer songs', () => {
    const twelveMin = 12 * 60
    const allowed = maxDirectBytesForDuration(twelveMin)
    expect(allowed).toBe(twelveMin * HIGH_RES_WAV_BYTES_PER_SEC)
    expect(allowed).toBeGreaterThan(PLAYLIST_DROP_MAX_DIRECT_BYTES)
    // ~100MB 12-minute master should pass
    expect(isWithinDirectIngestLimit(100 * 1024 * 1024, twelveMin)).toBe(true)
  })

  it('still rejects files denser than high-res budget', () => {
    const tenMin = 10 * 60
    const allowed = maxDirectBytesForDuration(tenMin)
    expect(allowed).toBeGreaterThan(PLAYLIST_DROP_MAX_DIRECT_BYTES)
    expect(isWithinDirectIngestLimit(allowed + 1, tenMin)).toBe(false)
    expect(isConvertibleOversizeAudio('long.wav', allowed + 1, tenMin)).toBe(true)
  })

  it('flags oversized wav/flac as convertible when over duration budget', () => {
    expect(isConvertibleOversizeAudio('track.wav', PLAYLIST_DROP_MAX_DIRECT_BYTES + 1)).toBe(true)
    expect(isConvertibleOversizeAudio('track.flac', PLAYLIST_DROP_MAX_DIRECT_BYTES + 1)).toBe(true)
    expect(isConvertibleOversizeAudio('track.aiff', PLAYLIST_DROP_MAX_DIRECT_BYTES + 1)).toBe(true)
  })

  it('does not flag small or non-lossless files', () => {
    expect(isConvertibleOversizeAudio('track.wav', PLAYLIST_DROP_MAX_DIRECT_BYTES)).toBe(false)
    expect(isConvertibleOversizeAudio('track.mp3', PLAYLIST_DROP_MAX_DIRECT_BYTES + 1)).toBe(false)
  })

  it('lets a long wav pass without convert when duration justifies size', () => {
    const size = 120 * 1024 * 1024
    const duration = 15 * 60
    expect(isWithinDirectIngestLimit(size, duration)).toBe(true)
    expect(isConvertibleOversizeAudio('dj-set.wav', size, duration)).toBe(false)
  })

  it('formats megabytes', () => {
    expect(formatBytesMb(80 * 1024 * 1024)).toBe('80.0MB')
  })
})
