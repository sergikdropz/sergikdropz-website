import { describe, expect, it } from 'vitest'
import { sealShareDownloadCookie, readShareDownloadCookie } from '@/lib/shares/share-download-cookie'
import {
  downloadFileName,
  mp3RelativeCandidates,
  normalizeDownloadEmails,
  parseDownloadSelection,
  shareDownloadPath,
  uniqueDownloadFileName,
  wavRelativeCandidates,
} from '@/lib/shares/share-download'

describe('share download access', () => {
  it('keeps only real email addresses', () => {
    const parsed = normalizeDownloadEmails('DJ@Club.com, nope, dj@club.com\npress@label.co')
    expect(parsed.emails).toEqual(['dj@club.com', 'press@label.co'])
    expect(parsed.rejected).toEqual(['nope'])
  })

  it('builds a restricted link for one track or the whole release', () => {
    expect(
      shareDownloadPath('tok', { format: 'wav', scope: 'track', trackId: 'track-1' }),
    ).toBe('/d/tok?format=wav&scope=track&track=track-1')
    expect(shareDownloadPath('tok', { format: 'mp3', scope: 'release', trackId: '' })).toBe(
      '/d/tok?format=mp3&scope=release',
    )
  })

  it('rejects a track download that is not on the release', () => {
    const parsed = parseDownloadSelection(
      { format: 'mp3', scope: 'track', trackId: 'other' },
      ['track-1'],
    )
    expect(parsed.ok).toBe(false)
  })

  it('prefers a stored WAV master, then the sibling file, then the library master', () => {
    expect(
      wavRelativeCandidates({
        stream: '/api/audio/media/unreleased/eps/Inspire/Da%20Pyramids.mp3',
        hints: ['/api/audio/media/dsp-masters/library/Da%20Pyramids.wav'],
      }),
    ).toEqual([
      'dsp-masters/library/Da Pyramids.wav',
      'unreleased/eps/Inspire/Da Pyramids.wav',
    ])
  })

  it('asks for the mp3 stream, not the wav master', () => {
    expect(mp3RelativeCandidates(['unreleased/eps/Inspire/Da Pyramids.wav'])).toEqual([
      'unreleased/eps/Inspire/Da Pyramids.mp3',
    ])
  })

  it('disambiguates zip entry names', () => {
    const used = new Set<string>()
    expect(uniqueDownloadFileName('SERGIK', 'Lift', 'wav', used)).toBe('SERGIK - Lift.wav')
    expect(uniqueDownloadFileName('SERGIK', 'Lift', 'wav', used)).toBe('SERGIK - Lift (2).wav')
    expect(downloadFileName('SERGIK', 'Inspire', 'zip')).toBe('SERGIK - Inspire.zip')
  })

  it('seals a cookie that only reopens for that email and grant', () => {
    const sealed = sealShareDownloadCookie('fan@example.com', 'grant-1')
    expect(readShareDownloadCookie(sealed.token)).toEqual({
      email: 'fan@example.com',
      grantId: 'grant-1',
    })
    expect(readShareDownloadCookie(`${sealed.token}x`)).toBeNull()
  })
})
