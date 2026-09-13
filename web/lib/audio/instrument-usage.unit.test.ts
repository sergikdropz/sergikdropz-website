import { describe, expect, it } from 'vitest'
import {
  composeInstrumentationSection,
  extractInstrumentTypes,
  inferInstrumentUsageFromMeasured,
  mergeInstrumentUsage,
} from '@/lib/audio/instrument-usage'
import { listSonicDnaReportSections } from '@/lib/audio/sonic-dna-report-sections'

const houseMeasured = {
  bpm: 122,
  drumFamily: 'four-on-the-floor',
  bass: { lock: 'offbeat-syncopated', rootNote: 'G' },
  percussion: {
    kickRole: 'four-on-the-floor',
    snareRole: 'backbeat-2-and-4',
    hatGrid: 'offbeat-hats',
    styles: ['four-on-the-floor', 'disco-offbeat-hats'],
    kickSyncopation: 0.1,
  },
  spectral: {
    relative: { sub: 0.08, kick: 0.14, bass: 0.16, lowMid: 0.14, mid: 0.12, presence: 0.1, air: 0.12 },
    flatness: 0.22,
    zeroCrossingRate: 0.09,
    centroidHz: 1600,
    chromaFlux: 0.07,
  },
  instruments: [
    { id: 'kick-drum', label: 'Kick drum', confidence: 0.72 },
    { id: 'snare-clap', label: 'Snare / clap', confidence: 0.65 },
    { id: 'hats-cymbals', label: 'Hats / cymbals', confidence: 0.58 },
    { id: 'bass', label: 'Bass', confidence: 0.6 },
    { id: 'harmonic-pad', label: 'Sustained harmonic (keys/pad)', confidence: 0.52 },
  ],
}

describe('inferInstrumentUsageFromMeasured', () => {
  it('detects bass, keys, hats, and percussion for a house groove', () => {
    const usage = inferInstrumentUsageFromMeasured(houseMeasured)
    expect(usage.entries.length).toBeGreaterThan(3)
    expect(usage.bass?.type).toBeTruthy()
    expect(usage.entries.some((e) => e.category === 'percussion')).toBe(true)
    expect(usage.entries.some((e) => /rhodes|pad|piano|organ|keys/i.test(e.type))).toBe(true)
    expect(usage.lines?.length).toBeGreaterThan(2)
  })

  it('identifies 808-sub for sparse trap bass', () => {
    const usage = inferInstrumentUsageFromMeasured({
      ...houseMeasured,
      bass: { lock: 'sparse-808' },
      instruments: [{ id: 'bass', label: 'Sub / 808 bass', confidence: 0.8 }],
    })
    expect(usage.bass?.type).toBe('808-sub')
  })
})

describe('composeInstrumentationSection', () => {
  it('adds instrumentation report section between usage and description', () => {
    const dna = { measured: houseMeasured }
    const sections = listSonicDnaReportSections(dna)
    const ids = sections.map((s) => s.id)
    expect(ids).toContain('instrumentation')
    expect(ids.indexOf('instrumentation')).toBeGreaterThan(ids.indexOf('usage'))
    expect(ids.indexOf('instrumentation')).toBeLessThan(ids.indexOf('description'))
    const inst = sections.find((s) => s.id === 'instrumentation')
    expect(inst?.text.length).toBeGreaterThan(40)
  })

  it('weaves instrumentation into composed section text', () => {
    const text = composeInstrumentationSection({ measured: houseMeasured })
    expect(text).toMatch(/Bass:/i)
    expect(text).toMatch(/confidence tiers/i)
  })
})

describe('extractInstrumentTypes + merge', () => {
  it('extracts type labels for subgenre scoring', () => {
    const usage = inferInstrumentUsageFromMeasured(houseMeasured)
    const types = extractInstrumentTypes(usage)
    expect(types.length).toBeGreaterThan(2)
  })

  it('merges agent refinements without dropping DSP entries', () => {
    const dsp = inferInstrumentUsageFromMeasured(houseMeasured)
    const agent = {
      entries: [
        {
          type: 'shaker',
          category: 'percussion' as const,
          confidence: 0.42,
          source: 'agent' as const,
          usage: 'Shaker inferred from genre.',
        },
      ],
    }
    const merged = mergeInstrumentUsage(dsp, agent)
    expect(merged.entries.some((e) => e.type === 'shaker')).toBe(true)
    expect(merged.entries.length).toBeGreaterThanOrEqual(dsp.entries.length)
  })
})
