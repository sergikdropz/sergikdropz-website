import { describe, expect, it } from 'vitest'
import {
  buildMixPairHint,
  filterOpenness,
  formatMixPairHintLine,
} from './mix-pair-hint'

describe('mix pair hints', () => {
  it('formats BPM delta and key change', () => {
    const hint = buildMixPairHint(
      { bpm: 120, sonic_dna: { key: '5A' } },
      { bpm: 126, sonic_dna: { key: '8B' } },
    )
    expect(hint.bpmDeltaPct).toBe(5)
    expect(hint.bpmHint).toBe('ΔBPM +5.0%')
    expect(hint.keyHint).toBe('5A→8B')
    expect(formatMixPairHintLine(hint)).toBe('ΔBPM +5.0% · 5A→8B')
  })

  it('omits key when unchanged', () => {
    const hint = buildMixPairHint(
      { bpm: 128, trackKey: '8A' },
      { bpm: 128, trackKey: '8A' },
    )
    expect(formatMixPairHintLine(hint)).toBe('ΔBPM 0.0% · 8A')
  })

  it('scores filter openness from HPF/LPF', () => {
    const open = filterOpenness(20, 20000)
    expect(open).toBeCloseTo(1, 2)
    expect(filterOpenness(920, 20000)).toBeLessThan(open)
    expect(filterOpenness(20, 4000)).toBeLessThan(open)
  })
})
