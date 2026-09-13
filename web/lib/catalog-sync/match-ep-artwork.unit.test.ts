import { describe, expect, it } from 'vitest'
import {
  applyEpArtworkToFolderTracks,
  applyEpArtworkToTracks,
  buildEpArtworkIndex,
  matchEpArtworkForTrack,
  trackTitleKey,
} from './match-ep-artwork'

const soulCandy = '/images/audio/artwork/folder-soul-candy.jpg'
const smokeBreak = '/images/audio/artwork/folder-1787772055352.jpg'

function indexFrom(eps: Parameters<typeof buildEpArtworkIndex>[0]) {
  return buildEpArtworkIndex(eps)
}

describe('trackTitleKey', () => {
  it('strips artist prefix and VIP / version tails', () => {
    expect(trackTitleKey('SEERGIK - All The Vibes')).toBe('allthevibes')
    expect(trackTitleKey('Everyday Gratitude 1')).toBe('everydaygratitude')
    expect(trackTitleKey('Whats the Reason (Bass VIP 2)')).toBe('whatsthereason')
    expect(trackTitleKey('Bone - Cosmic Cadillac')).toBe('bonecosmiccadillac')
  })
})

describe('matchEpArtworkForTrack', () => {
  const index = indexFrom([
    {
      id: 'soul-candy',
      name: 'Soul Candy',
      artwork: soulCandy,
      tracks: [
        { title: 'SEERGIK - All The Vibes', artwork: soulCandy },
        { title: 'Everyday Gratitude 1', artwork: soulCandy },
        { title: 'Back to The Basics', artwork: soulCandy },
      ],
    },
    {
      id: '1787772055352',
      name: 'Smoke Break',
      artwork: smokeBreak,
      tracks: [{ title: 'Smoke Break', artwork: smokeBreak, audioFileId: 'af-smoke' }],
    },
    {
      id: 'chan-suk',
      name: 'The Chan Suk Legend',
      artwork: '/images/audio/artwork/folder-chan.png',
      tracks: [{ title: 'Bone - Cosmic Cadillac', artwork: '/images/audio/artwork/folder-chan.png' }],
    },
  ])

  it('matches crate titles to the EP cover', () => {
    expect(matchEpArtworkForTrack({ title: 'All The Vibes' }, index)?.epName).toBe('Soul Candy')
    expect(matchEpArtworkForTrack({ title: 'Everyday Gratitude' }, index)?.artwork).toBe(soulCandy)
    expect(matchEpArtworkForTrack({ title: 'Back to The Basics (Instrumental)' }, index)?.epName).toBe(
      'Soul Candy',
    )
    expect(matchEpArtworkForTrack({ title: 'Cosmic Cadillac' }, index)?.epName).toBe('The Chan Suk Legend')
    expect(matchEpArtworkForTrack({ title: 'Javi - Smoke Break at Da Crib VIP.2' }, index)?.epName).toBe(
      'Smoke Break',
    )
  })

  it('does not steal covers from generic overlapping titles', () => {
    const loose = indexFrom([
      {
        id: 'world',
        name: 'The World Dont Stop',
        artwork: '/images/audio/artwork/folder-world.jpg',
        tracks: [{ title: 'The World Dont Stop The Day (Sax)', artwork: '/images/audio/artwork/folder-world.jpg' }],
      },
      {
        id: 'bender',
        name: 'BENDER',
        artwork: '/images/audio/artwork/folder-bender.png',
        tracks: [
          { title: 'After After (All Around Flip) V2', artwork: '/images/audio/artwork/folder-bender.png' },
        ],
      },
    ])
    expect(matchEpArtworkForTrack({ title: 'Dont Stop V3' }, loose)).toBeNull()
    expect(matchEpArtworkForTrack({ title: 'Breauxxx - All Around' }, loose)).toBeNull()
  })

  it('matches by shared audio file id', () => {
    expect(matchEpArtworkForTrack({ title: 'Other Name', audioFileId: 'af-smoke' }, index)?.artwork).toBe(
      smokeBreak,
    )
  })
})

describe('applyEpArtworkToTracks', () => {
  it('stamps EP art and album on crate rows without overwriting uploaded art', () => {
    const index = indexFrom([
      {
        id: 'soul-candy',
        name: 'Soul Candy',
        artwork: soulCandy,
        tracks: [{ title: 'All The Vibes', artwork: soulCandy }],
      },
    ])
    const next = applyEpArtworkToTracks(
      [
        { id: 'a', title: 'All The Vibes', album: 'Deep n Funky', artwork: undefined as unknown as string },
        { id: 'b', title: 'Loose Single', album: 'Deep n Funky' },
        {
          id: 'c',
          title: 'All The Vibes',
          album: 'Deep n Funky',
          artwork: '/images/audio/artwork/folder-own.jpg',
        },
      ],
      index,
      { crateNames: new Set(['Deep n Funky']) },
    )
    expect(next[0].artwork).toBe(soulCandy)
    expect(next[0].album).toBe('Soul Candy')
    expect((next[0] as { albumType?: string }).albumType).toBe('ep')
    expect(next[1].artwork).toBeUndefined()
    expect(next[1].album).toBe('Deep n Funky')
    expect(next[2].artwork).toBe('/images/audio/artwork/folder-own.jpg')
    expect(next[2].album).toBe('Soul Candy')
  })
})

describe('applyEpArtworkToFolderTracks', () => {
  it('only rewrites crate folders', () => {
    const grouped: Record<string, Array<{ title: string; artwork?: string; album?: string }>> = {
      'ep-1': [{ title: 'All The Vibes', artwork: soulCandy }],
      crate: [{ title: 'All The Vibes', album: 'Deep n Funky' }],
    }
    const next = applyEpArtworkToFolderTracks(
      grouped,
      [{ id: 'ep-1', name: 'Soul Candy', type: 'ep', artwork: soulCandy }],
      { crateFolderIds: new Set(['crate']), crateNames: new Set(['Deep n Funky']) },
    )
    expect(next['ep-1'][0].album).toBeUndefined()
    expect(next.crate[0].artwork).toBe(soulCandy)
    expect(next.crate[0].album).toBe('Soul Candy')
  })
})
