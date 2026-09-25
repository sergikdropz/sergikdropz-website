import { describe, expect, it } from 'vitest'
import {
  clampCanvasDprForDevice,
  mobileQueuePreloadCount,
  mobileWaveformNetworkAllowed,
  MOBILE_WAVEFORM_PAINT_MIN_MS,
  prefersLowPowerWaveformPaint,
  readNetworkPlaybackSnapshot,
  resolveMobilePrioritizeBackgroundPlayback,
  tierToAutoBufferSize,
  tierToStreamQualityLabel,
} from './mobile-playback-profile'

describe('mobile-playback-profile', () => {
  it('caps canvas DPR at 1 in low-power mode', () => {
    expect(clampCanvasDprForDevice(3, true)).toBe(1)
    expect(clampCanvasDprForDevice(2, false)).toBe(2)
  })

  it('exposes a sane mobile waveform paint interval', () => {
    expect(MOBILE_WAVEFORM_PAINT_MIN_MS).toBeGreaterThanOrEqual(60)
  })

  it('returns desktop preload count in test env (no mobile UA)', () => {
    expect(mobileQueuePreloadCount()).toBe(3)
    expect(mobileQueuePreloadCount({ constrained: true, documentHidden: true })).toBe(3)
  })

  it('honors saved background preference on desktop UA', () => {
    expect(resolveMobilePrioritizeBackgroundPlayback(false)).toBe(false)
    expect(resolveMobilePrioritizeBackgroundPlayback(true)).toBe(true)
  })

  it('maps connection tiers to stream and buffer hints', () => {
    expect(tierToStreamQualityLabel('slow')).toBe('standard')
    expect(tierToStreamQualityLabel('medium')).toBe('HD')
    expect(tierToStreamQualityLabel('fast')).toBe('UHD')
    expect(tierToAutoBufferSize('slow')).toBe('small')
  })

  it('readNetworkPlaybackSnapshot returns fast tier in test env', () => {
    const snap = readNetworkPlaybackSnapshot()
    expect(snap.tier).toBe('fast')
    expect(snap.constrained).toBe(false)
  })

  it('prefers low power paint when reduced motion is on', () => {
    expect(prefersLowPowerWaveformPaint({ djMixerActive: true, reducedMotion: true })).toBe(true)
  })

  it('blocks waveform fetch on constrained mobile when collapsed', () => {
    expect(mobileWaveformNetworkAllowed(true, false, false, true)).toBe(false)
    expect(mobileWaveformNetworkAllowed(false, false, false, true)).toBe(false)
    expect(mobileWaveformNetworkAllowed(false, true, false, true)).toBe(true)
    expect(mobileWaveformNetworkAllowed(false, false, true, true)).toBe(true)
  })
})
