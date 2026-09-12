import { describe, expect, it } from 'vitest'
import {
  resolveSectionAwareMixStyle,
  styleFromOutgoingSection,
} from './section-style'
import type { MixTrackRef } from './types'

const out: MixTrackRef = {
  id: 'o',
  file: '/o.mp3',
  bpm: 128,
  duration: 200,
  energy_level: 0.4,
  sonic_dna: {
    segments: { outroStartSec: 160, dropStartSec: 40, introEndSec: 16 },
  },
}
const inn: MixTrackRef = {
  id: 'i',
  file: '/i.mp3',
  bpm: 128,
  duration: 180,
  energy_level: 0.7,
}

describe('section-aware style', () => {
  it('maps outro to Smooth and drop to bass-swap', () => {
    expect(styleFromOutgoingSection('outro')).toBe('crossfade')
    expect(styleFromOutgoingSection('drop')).toBe('bass-swap')
  })

  it('keeps phrase-out on Smooth (canonical Auto DJ OUT)', () => {
    const style = resolveSectionAwareMixStyle({
      outgoing: out,
      incoming: inn,
      outSec: 170,
      userStyle: 'crossfade',
      techniques: ['standard'],
      currentStyle: 'crossfade',
      sectionStyle: true,
    })
    expect(style).toBe('crossfade')
  })

  it('caps at the user style when they picked Filter', () => {
    const style = resolveSectionAwareMixStyle({
      outgoing: { ...out, sonic_dna: { segments: { dropStartSec: 10, outroStartSec: 190 } } },
      incoming: inn,
      outSec: 50,
      userStyle: 'filter-eq',
      techniques: ['standard'],
      sectionStyle: true,
    })
    expect(style).toBe('filter-eq')
  })

  it('lets bass-swap technique win', () => {
    const style = resolveSectionAwareMixStyle({
      outgoing: out,
      incoming: inn,
      outSec: 170,
      userStyle: 'crossfade',
      techniques: ['bass-swap'],
      sectionStyle: true,
    })
    expect(style).toBe('bass-swap')
  })

  it('honors sectionStyle off', () => {
    const style = resolveSectionAwareMixStyle({
      outgoing: out,
      incoming: inn,
      outSec: 170,
      userStyle: 'crossfade',
      techniques: ['standard'],
      currentStyle: 'crossfade',
      sectionStyle: false,
    })
    expect(style).toBe('crossfade')
  })
})
