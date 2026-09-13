import { describe, expect, it } from 'vitest'
import { inferBassPocket } from '@/lib/audio/bass-pocket'
import {
  ensureMeasuredBassPocket,
  resolveMeasuredGenreConflicts,
  runAccuracyChallenge,
} from '@/lib/audio/sonic-dna-v2/accuracy-challenge'

describe('bass-pocket + accuracy-challenge', () => {
  it('infers offbeat bass for house-tempo four-on-the-floor', () => {
    const pocket = inferBassPocket({
      bpm: 124,
      drumFamily: 'four-on-the-floor',
    })
    expect(pocket.lock).toBe('offbeat-syncopated')
    expect(pocket.confidence).toBeGreaterThan(0.5)
  })

  it('keeps existing measured bass lock', () => {
    const pocket = inferBassPocket({
      bpm: 140,
      drumFamily: 'half-time',
      existingLock: 'pedal-root',
    })
    expect(pocket.lock).toBe('pedal-root')
    expect(pocket.reason[0]).toMatch(/existing/)
  })

  it('resolves reggae-at-house-tempo against four-on-the-floor DSP', () => {
    const { dna, resolved } = resolveMeasuredGenreConflicts({
      measured: {
        bpm: 122,
        drumFamily: 'four-on-the-floor',
        genre: {
          primary: 'Reggae',
          audioPrimary: 'Funky House',
          source: 'user-preferred',
        },
      },
    })
    expect(resolved).toBe(1)
    expect(dna.measured.genre.primary).toBe('Funky House')
    expect(dna.measured.genre.preferredPrimary).toBe('Reggae')
    expect(String(dna.measured.genre.judgment)).toMatch(/DSP lock/)
  })

  it('grounds unquoted narrative and stamps bass lock on challenge', () => {
    const result = runAccuracyChallenge({
      description: 'A groovy club track with warm keys and playful hats.',
      measured: {
        bpm: 124,
        drumFamily: 'four-on-the-floor',
        timingFeel: 'full-time',
        genre: { primary: 'Funky House', audioPrimary: 'Funky House', source: 'audio-measured' },
        report: {
          layers: {
            cultural: 'From the playlist crate vibes of the Caribbean.',
            dsp: 'Kick four-on-the-floor. Hats offbeat.',
          },
        },
        intelligence: {
          description: 'A groovy club track with warm keys and playful hats.',
          cultural: { description: 'From the playlist crate vibes of the Caribbean.' },
        },
      },
    })

    expect(result.dna.measured.bass?.lock).toBeTruthy()
    expect(String(result.dna.description || result.dna.measured?.intelligence?.description)).toMatch(/124/)
    expect(result.patches.length).toBeGreaterThan(0)
    expect(result.warnings.some((w) => w.startsWith('Copy mentions'))).toBe(false)
  })

  it('ensureMeasuredBassPocket fills missing lock', () => {
    const next = ensureMeasuredBassPocket({
      measured: { bpm: 90, drumFamily: 'half-time' },
    })
    expect(next.measured.bass.lock).toBe('sparse-808')
  })
})
