import { describe, expect, it } from 'vitest'
import {
  classifyWithGenreEngine,
  proposeGenreEngineUpdates,
  scoreGenreEngineAgainstGold,
} from '@/lib/audio/genre-engine'

describe('genre-engine', () => {
  it('overlays liquid DnB on mid-tempo breakbeat with rolling bass', () => {
    const result = classifyWithGenreEngine({
      bpm: 158,
      drumFamily: 'breakbeat',
      bass: { lock: 'rolling' },
      percussion: { kickRole: 'syncopated-or-broken-kick', hatGrid: 'sixteenths', snareRole: 'broken-snare' },
    })
    expect(result.primary).toBe('Drum & Bass')
    expect(result.subgenre).toBe('Liquid DnB')
    expect(result.source).toBe('overlay')
    expect(result.ruleId).toBe('breakbeat-liquid-dnb-mid')
  })

  it('keeps Cosmic Cadillac-class half-time + house hats as Hip-Hop/Trap', () => {
    const result = classifyWithGenreEngine({
      bpm: 123,
      drumFamily: 'half-time',
      bass: { lock: 'offbeat-syncopated' },
      timingFeel: 'half-time',
      percussion: { hatGrid: 'eighths', kickRole: 'syncopated-or-broken-kick', snareRole: 'half-time-beat-3' },
    })
    expect(result.primary).toBe('Hip-Hop')
    expect(result.subgenre).toBe('Trap')
    expect(result.source).toBe('overlay')
  })

  it('scores gold labels and proposes updates from mismatches + guidance', () => {
    const scorecard = scoreGenreEngineAgainstGold(
      [
        {
          id: 'gold-1',
          title: 'Test Liquid',
          primaryGenre: 'Drum & Bass',
          family: 'Drum & Bass',
          drumFamily: 'breakbeat',
          bassLock: 'rolling',
          bpm: 158,
        },
      ],
      {
        'gold-1': {
          bpm: 158,
          drumFamily: 'breakbeat',
          bass: { lock: 'rolling' },
        },
      },
    )
    expect(scorecard.total).toBe(1)
    expect(scorecard.primaryAccuracy).toBe(1)

    const proposals = proposeGenreEngineUpdates({
      scorecard: {
        ...scorecard,
        mismatches: [
          {
            id: 'mismatch-1',
            title: 'Wrong',
            expectedPrimary: 'Breaks',
            predictedPrimary: 'Hip-Hop',
            predictedFamily: 'Hip-Hop',
            okPrimary: false,
            okFamily: false,
            source: 'base',
            confidence: 0.5,
          },
        ],
      },
      adminGuidance: 'this is more of a breaks / slower liquid dnb jungle type beat',
    })
    expect(proposals.some((p) => p.id.startsWith('gold-fix-'))).toBe(true)
    expect(proposals.some((p) => p.id === 'admin-guidance-breaks-liquid')).toBe(true)
  })
})
