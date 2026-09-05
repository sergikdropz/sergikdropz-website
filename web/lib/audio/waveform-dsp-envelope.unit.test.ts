import { describe, expect, it } from 'vitest'
import {
  densifyEnvelopesPeakHold,
  dspDisplayAmplitude,
  envelopesToWaveformSamples,
  extractDspEnvelopesFromPcm,
  legacyPeaksToEnvelopes,
  onePoleCoeff,
} from './waveform-dsp-envelope'

describe('onePoleCoeff', () => {
  it('returns a stable coefficient in (0,1)', () => {
    const a = onePoleCoeff(250, 44100)
    expect(a).toBeGreaterThan(0)
    expect(a).toBeLessThan(1)
  })
})

describe('extractDspEnvelopesFromPcm', () => {
  it('splits low vs high energy for sine tones', () => {
    const sr = 44100
    const n = sr // 1s
    const lowTone = new Float32Array(n)
    const highTone = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      lowTone[i] = Math.sin((2 * Math.PI * 80 * i) / sr) * 0.8
      highTone[i] = Math.sin((2 * Math.PI * 6000 * i) / sr) * 0.8
    }
    const lowEnv = extractDspEnvelopesFromPcm({ left: lowTone, sampleRate: sr, buckets: 64 })
    const highEnv = extractDspEnvelopesFromPcm({ left: highTone, sampleRate: sr, buckets: 64 })
    const avg = (envs: typeof lowEnv, key: 'low' | 'mid' | 'high') =>
      envs.reduce((s, e) => s + e[key], 0) / envs.length

    expect(avg(lowEnv, 'low')).toBeGreaterThan(avg(lowEnv, 'high'))
    expect(avg(highEnv, 'high')).toBeGreaterThan(avg(highEnv, 'low'))
  })

  it('keeps separate peak and rms', () => {
    const sr = 8000
    const n = 8000
    const pcm = new Float32Array(n)
    for (let i = 0; i < n; i++) {
      pcm[i] = i % 400 === 0 ? 1 : 0.05
    }
    const envs = extractDspEnvelopesFromPcm({ left: pcm, sampleRate: sr, buckets: 40 })
    const spiked = envs.filter((e) => e.peak > 0.5)
    expect(spiked.length).toBeGreaterThan(0)
    expect(spiked.every((e) => e.peak >= e.rms)).toBe(true)
  })
})

describe('legacyPeaksToEnvelopes', () => {
  it('produces bands and peak/rms from mono peaks', () => {
    const peaks = Array.from({ length: 100 }, (_, i) => (i % 10 === 0 ? 0.9 : 0.15))
    const envs = legacyPeaksToEnvelopes(peaks)
    expect(envs).toHaveLength(100)
    expect(Math.max(...envs.map((e) => e.peak))).toBeCloseTo(1, 1)
    const samples = envelopesToWaveformSamples(envs)
    expect(samples[0].bands).toBeDefined()
    expect(samples[0].rms).toBeDefined()
  })
})

describe('densifyEnvelopesPeakHold', () => {
  it('preserves transient peaks when upsampling', () => {
    const envs = legacyPeaksToEnvelopes([0.1, 1, 0.1])
    const dense = densifyEnvelopesPeakHold(envs, 12)
    expect(Math.max(...dense.map((e) => e.peak))).toBeCloseTo(1, 1)
  })
})

describe('dspDisplayAmplitude', () => {
  it('maps quiet material above linear floor (Scaled)', () => {
    expect(dspDisplayAmplitude(0)).toBe(0)
    expect(dspDisplayAmplitude(1)).toBeGreaterThan(0.85)
    expect(dspDisplayAmplitude(0.05)).toBeGreaterThan(0.05)
  })
})
