import { describe, expect, it } from 'vitest'
import {
  buildLocalLookupResult,
  createSoundExchangeClient,
  isSergikMintedIsrc,
  latestSubmissionByIsrc,
  mergeRegistryStats,
  normalizeIsrcInput,
  sxDirectAccount,
  trackToSxDirectSubmission,
} from '@/lib/studio/soundexchange'

describe('soundexchange helpers', () => {
  it('normalizes hyphenated ISRCs', () => {
    expect(normalizeIsrcInput('QT-A53-26-00001')).toBe('QTA532600001')
    expect(normalizeIsrcInput('bad')).toBeNull()
  })

  it('merges latest submission per ISRC and stats', () => {
    const map = latestSubmissionByIsrc([
      { isrc: 'QTA532600001', submitted_at: '2026-01-01T00:00:00.000Z', status: 'pending' },
      { isrc: 'QT-A53-26-00001', submitted_at: '2026-02-01T00:00:00.000Z', status: 'submitted' },
    ])
    expect(map.get('QTA532600001')?.status).toBe('submitted')

    const stats = mergeRegistryStats([
      { isrc: 'QTA532600001', submissionStatus: null },
      { isrc: 'QTA532600002', submissionStatus: 'submitted' },
      { isrc: 'QZES72569811', submissionStatus: 'accepted' },
    ])
    expect(stats.minted).toBe(3)
    expect(stats.pending).toBe(1)
    expect(stats.submitted).toBe(1)
    expect(stats.accepted).toBe(1)
    expect(stats.ourPrefix).toBe(2)
  })

  it('builds catalog lookup payload', () => {
    const result = buildLocalLookupResult({
      isrc: 'QT-A53-26-00001',
      hit: {
        trackId: 't1',
        title: 'Elevator Musik',
        artist: 'SERGIK',
        isrc: 'QTA532600001',
        isrcDisplay: 'QT-A53-26-00001',
        submissionStatus: null,
      },
      remoteConfigured: false,
    })
    expect(result.found).toBe(true)
    expect(result.source).toBe('catalog')
    expect(result.isrcDisplay).toBe('QT-A53-26-00001')
    expect(result.publicLookupUrl).toContain('isrc.soundexchange.com')
  })

  it('uses local mode without credentials and can submit', async () => {
    const client = createSoundExchangeClient({} as NodeJS.ProcessEnv)
    expect(client.mode).toBe('local')
    const result = await client.submitISRC({
      isrc: 'QTA532600001',
      title: 'Test',
      artist: 'SERGIK',
    })
    expect(result.success).toBe(true)
    expect(result.mode).toBe('local')
    expect(result.submissionId).toContain('sx-local-')
  })

  it('builds an SX Direct repertoire payload from a minted Catalog track', () => {
    expect(isSergikMintedIsrc('QT-A53-26-00001')).toBe(true)
    expect(isSergikMintedIsrc('QZES72569811')).toBe(false)
    const account = sxDirectAccount()
    expect(account.homeUrl).toContain('sxdirect.soundexchange.com')
    expect(account.registrantId).toBe('2181363681')
    const payload = trackToSxDirectSubmission(
      {
        isrc_full: 'QT-A53-26-00001',
        title: 'Elevator Musik',
        duration: 214,
        explicit: false,
        contributors: [{ name: 'SERGIK', role: 'primary' }],
      },
      { album_artist: 'SERGIK', title: 'UTOPIA', release_date: '2026-10-30', genre: 'House' },
    )
    expect(payload?.isrc).toBe('QTA532600001')
    expect(payload?.releaseTitle).toBe('UTOPIA')
    expect(payload?.sxDirect?.rightsOwnerSxid).toBe('SX1102Q6ZJ')
  })
})
