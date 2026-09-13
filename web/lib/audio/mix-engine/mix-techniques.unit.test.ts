import { describe, expect, it } from 'vitest'
import { applyTechniqueToIntelligence, resolveEffectiveMixStyle, resolveEffectiveMixTechniques } from './mix-techniques'
import { buildMixIntelligence } from './mix-intelligence'

describe('mix-techniques', () => {
  it('resolves bass-swap technique to engine style', () => {
    expect(resolveEffectiveMixStyle('crossfade', 'bass-swap')).toBe('bass-swap')
  })

  it('honors transitionMode when techniques are auto', () => {
    expect(resolveEffectiveMixStyle('crossfade', ['auto'], 'filter-eq')).toBe('filter-eq')
    expect(resolveEffectiveMixStyle('crossfade', ['auto'], 'cutout-filter')).toBe('cut')
  })

  it('prefers explicit technique override over transitionMode', () => {
    expect(resolveEffectiveMixStyle('crossfade', 'bass-swap', 'filter-eq')).toBe('bass-swap')
  })

  it('stacks compatible techniques', () => {
    const base = buildMixIntelligence({
      outgoing: { id: 'o', file: '/o.mp3', bpm: 120 },
      incoming: { id: 'i', file: '/i.mp3', bpm: 122 },
      style: 'crossfade',
    })
    const tuned = applyTechniqueToIntelligence(base, ['phrase-lock', 'vocal-blend'], 'crossfade')
    expect(tuned.microStrength).toBeGreaterThan(base.microStrength)
    expect(tuned.incomingDelay).toBeGreaterThanOrEqual(base.incomingDelay)
  })

  it('auto-resolves phrase-lock when DNA confidence is high', () => {
    const out = {
      id: 'o',
      file: '/o.mp3',
      bpm: 124,
      sonic_dna: { measured: { bpm: 124, bpmConfidence: 0.82, kickSteps: [0, 4, 8, 12] } },
    }
    const incoming = {
      id: 'i',
      file: '/i.mp3',
      bpm: 126,
      sonic_dna: { measured: { bpm: 126, bpmConfidence: 0.79, kickSteps: [0, 4, 8, 12] } },
    }
    const resolved = resolveEffectiveMixTechniques(['auto'], out, incoming)
    expect(resolved).toContain('phrase-lock')
  })
})
