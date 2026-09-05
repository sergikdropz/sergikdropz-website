import { describe, expect, it } from 'vitest'
import { deckFiltersAtProgress } from './filters'
import { buildMixIntelligence, suggestMixStyle } from './mix-intelligence'
import { resolveStretchPolicy } from './stretch-policy'

describe('stretch-policy', () => {
  it('uses native tier for tiny delta', () => {
    const p = resolveStretchPolicy({ id: 'a', file: '/a.mp3', bpm: 120 }, 1.02)
    expect(p.tier).toBe('native')
  })

  it('escalates for vocal-heavy large delta', () => {
    const p = resolveStretchPolicy(
      {
        id: 'a',
        file: '/a.mp3',
        bpm: 120,
        sonic_dna: {
          measured: {
            instrumentUsage: { entries: [{ category: 'vocals', type: 'lead' }] },
          },
        },
      },
      1.1
    )
    expect(['enhanced', 'wasm']).toContain(p.tier)
  })
})

describe('mix-intelligence', () => {
  const out = { id: 'o', file: '/o.mp3', bpm: 128, energy_level: 0.5 }
  const inn = { id: 'i', file: '/i.mp3', bpm: 120, energy_level: 0.7 }

  it('suggests filter-eq for energy climb', () => {
    expect(suggestMixStyle(out, inn, 'crossfade')).toBe('filter-eq')
  })

  it('builds intelligence with energy scale', () => {
    const intel = buildMixIntelligence({ outgoing: out, incoming: inn, style: 'crossfade' })
    expect(intel.energyScale).toBeGreaterThan(1)
    expect(intel.microStrength).toBeGreaterThan(0.5)
  })

  it('keeps Smooth filters and duck off', () => {
    const intel = buildMixIntelligence({ outgoing: out, incoming: inn, style: 'crossfade' })
    expect(intel.filterIntensity).toBe(0)
    expect(intel.incomingDelay).toBe(0)
    expect(intel.lowDuckDb).toBe(0)
    expect(intel.softTailStart).toBeCloseTo(0.88, 2)
  })
})

describe('deckFiltersAtProgress', () => {
  it('keeps Smooth filters fully open', () => {
    const early = deckFiltersAtProgress({ progress: 0.2, style: 'crossfade', role: 'incoming' })
    const late = deckFiltersAtProgress({ progress: 0.85, style: 'crossfade', role: 'incoming' })
    const outMid = deckFiltersAtProgress({ progress: 0.5, style: 'crossfade', role: 'outgoing' })
    expect(early.lpfHz).toBe(20000)
    expect(late.lpfHz).toBe(20000)
    expect(early.hpfHz).toBe(20)
    expect(outMid.hpfHz).toBe(20)
    expect(outMid.lpfHz).toBe(20000)
  })

  it('opens incoming LPF through a Filter mix', () => {
    const early = deckFiltersAtProgress({ progress: 0.2, style: 'filter-eq', role: 'incoming' })
    const late = deckFiltersAtProgress({ progress: 0.85, style: 'filter-eq', role: 'incoming' })
    expect(early.lpfHz).toBeLessThan(late.lpfHz)
  })

  it('raises outgoing HPF mid-mix', () => {
    const early = deckFiltersAtProgress({ progress: 0.1, style: 'filter-eq', role: 'outgoing' })
    const mid = deckFiltersAtProgress({ progress: 0.5, style: 'filter-eq', role: 'outgoing' })
    expect(mid.hpfHz).toBeGreaterThan(early.hpfHz)
  })
})
