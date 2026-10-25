import { describe, expect, it } from 'vitest'
import {
  groupLedgerByTrack,
  instagramShortcode,
  matchYouTubeId,
  sortLedgerGroups,
} from '@/lib/studio/royalties/ledger-groups'
import type { RoyaltyLedgerEntry } from '@/lib/studio/royalties/types'

function row(partial: Partial<RoyaltyLedgerEntry>): RoyaltyLedgerEntry {
  return {
    id: partial.id || 'led-1',
    statementId: 'stmt',
    statementLineId: 'line',
    payeeId: 'payee',
    payeeName: 'Nexus Studios AZ LLC',
    isrc: null,
    trackTitle: 'Soul Candy',
    store: 'Apple Music',
    splitPercent: 100,
    amountCents: 1,
    currency: 'USD',
    status: 'owed',
    payoutId: null,
    releaseId: null,
    trackId: null,
    createdAt: '',
    updatedAt: '',
    ...partial,
  }
}

describe('ledger track groups', () => {
  it('folds rows into one track and sums YouTube and Instagram stores', () => {
    const groups = groupLedgerByTrack([
      row({ id: 'a', amountCents: 10, store: 'Apple Music' }),
      row({ id: 'b', amountCents: 4, store: 'Youtube (Contentid)' }),
      row({ id: 'c', amountCents: 2, store: 'Instagram/Facebook' }),
      row({ id: 'd', trackTitle: 'FTP', amountCents: 50, store: 'Apple Music' }),
    ])
    expect(groups.map((group) => group.title)).toEqual(['FTP', 'Soul Candy'])
    expect(groups[1]).toMatchObject({
      amountCents: 16,
      youtubeCents: 4,
      instagramCents: 2,
      rows: [expect.any(Object), expect.any(Object), expect.any(Object)],
    })
  })

  it('attaches one YouTube id when the video title contains the track', () => {
    const id = matchYouTubeId('Soul Candy', [
      { title: 'SERGIK Soul Candy EP Visualizer', youtubeId: 'X0cWv2hIByE' },
      { title: 'SERGIK - Electrify', youtubeId: 'dcREFTRdviU' },
    ])
    expect(id).toBe('X0cWv2hIByE')
    expect(matchYouTubeId('Do', [{ title: 'Do You', youtubeId: 'dcREFTRdviU' }])).toBeNull()
  })

  it('reorders folded tracks by title, lines, and platform amount', () => {
    const groups = groupLedgerByTrack([
      row({ id: 'a', trackTitle: 'Soul Candy', amountCents: 10, store: 'Apple Music' }),
      row({ id: 'b', trackTitle: 'Soul Candy', amountCents: 4, store: 'Youtube (Ads)' }),
      row({ id: 'c', trackTitle: 'Do You', amountCents: 2, store: 'Instagram/Facebook' }),
      row({ id: 'd', trackTitle: 'Do You', amountCents: 1, store: 'Apple Music' }),
      row({ id: 'e', trackTitle: 'FTP', amountCents: 50, store: 'Apple Music' }),
    ])
    expect(sortLedgerGroups(groups, 'title-asc').map((group) => group.title)).toEqual([
      'Do You',
      'FTP',
      'Soul Candy',
    ])
    expect(sortLedgerGroups(groups, 'lines-desc').map((group) => group.title)).toEqual([
      'Soul Candy',
      'Do You',
      'FTP',
    ])
    expect(sortLedgerGroups(groups, 'youtube-desc')[0].title).toBe('Soul Candy')
    expect(sortLedgerGroups(groups, 'instagram-desc')[0].title).toBe('Do You')
    expect(sortLedgerGroups(groups, 'amount-asc').map((group) => group.title)).toEqual([
      'Do You',
      'Soul Candy',
      'FTP',
    ])
  })

  it('reads an Instagram shortcode from a post url', () => {
    expect(instagramShortcode('https://www.instagram.com/p/DB9-VgyvP4g/')).toBe('DB9-VgyvP4g')
    expect(instagramShortcode('https://www.instagram.com/reel/CfeYVfpAC5h/')).toBe('CfeYVfpAC5h')
  })

  it('matches a track inside a video description without confusing mkI and mkII', () => {
    const media = [
      {
        title: 'SERGIK Soul Candy EP Visualizer',
        text: 'Tracklist: Soul Candy, Back to the Basics, 24/7 mkII',
        youtubeId: 'X0cWv2hIByE',
      },
      { title: '24/7 mkI', youtubeId: 'abcdefghijk' },
    ]
    expect(matchYouTubeId('Back to the Basics', media)).toBe('X0cWv2hIByE')
    expect(matchYouTubeId('24/7 mkI', media)).toBe('abcdefghijk')
    expect(matchYouTubeId('24/7 mkII', media)).toBe('X0cWv2hIByE')
  })

  it('keeps Apple Music in its own platform column', () => {
    const [group] = groupLedgerByTrack([
      row({ id: 'a', amountCents: 10, store: 'Apple Music' }),
      row({ id: 'b', amountCents: 4, store: 'Youtube (Ads)' }),
      row({ id: 'c', amountCents: 2, store: 'Luna' }),
    ])
    expect(group.youtubeCents).toBe(4)
    expect(group.platforms).toEqual([
      { id: 'apple_music', label: 'Apple Music', cents: 10 },
      { id: 'luna', label: 'Luna', cents: 2 },
    ])
  })
})
