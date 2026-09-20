import { describe, expect, it } from 'vitest'
import { crossfadeDeckEqAtProgress, styleMixGains } from './curves'

describe('blend automation curves', () => {
  it('linear gain is a straight fader law', () => {
    const mid = styleMixGains('crossfade', 0.5, undefined, {
      gainShape: 'linear',
      bassKnee: 0.5,
      bassKillDb: 24,
      midDuckDb: 8,
    })
    expect(mid.a).toBeCloseTo(0.5, 5)
    expect(mid.b).toBeCloseTo(0.5, 5)
  })

  it('late gain holds outgoing early in the overlap', () => {
    const early = styleMixGains('crossfade', 0.2, undefined, {
      gainShape: 'late',
      bassKnee: 0.5,
      bassKillDb: 24,
      midDuckDb: 0,
    })
    expect(early.a).toBeGreaterThan(0.9)
    expect(early.b).toBeLessThan(0.15)
  })

  it('late bass knee keeps incoming low killed past mid', () => {
    const eq = crossfadeDeckEqAtProgress({
      progress: 0.45,
      style: 'crossfade',
      curve: { gainShape: 'equal-power', bassKnee: 0.72, bassKillDb: 24, midDuckDb: 0 },
    })
    expect(eq.incoming.low).toBeLessThan(-18)
  })
})
