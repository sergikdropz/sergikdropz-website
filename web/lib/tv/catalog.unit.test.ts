import { describe, expect, it } from 'vitest'
import { buildTvListen, buildTvReleases, buildTvVideos, formatTvDuration } from '@/lib/tv/catalog'
import type { CatalogVideo } from '@/lib/videos/types'

const video = (overrides: Partial<CatalogVideo> = {}): CatalogVideo => ({
  id: 'utopia',
  title: 'SERGIK - Utopia',
  description: '',
  youtube_id: 'OML1I_V4Dy4',
  category: 'music-video',
  date: '2025',
  published: true,
  ...overrides,
})

describe('buildTvVideos', () => {
  it('keeps published videos and builds a thumbnail list', () => {
    const items = buildTvVideos([
      video(),
      video({ id: 'hidden', title: 'Hidden', published: false, youtube_id: 'dcREFTRdviU' }),
    ])
    expect(items).toHaveLength(1)
    expect(items[0]?.youtubeId).toBe('OML1I_V4Dy4')
    expect(items[0]?.category).toBe('Music Video')
    expect(items[0]?.thumbnails[0]).toContain('OML1I_V4Dy4')
  })
})

describe('buildTvReleases', () => {
  it('keeps the live copy when the same id also exists in the static catalog', () => {
    const items = buildTvReleases({
      today: '2026-11-03',
      live: [
        {
          id: 'soul-candy',
          title: 'Soul Candy Live',
          type: 'ep',
          release_date: '2025-06-01',
          artwork_url: 'https://i.scdn.co/image/ab67616d00001e02deb7fda8d70e348aaa078b3f',
          tracks: [{ title: 'Track One', duration: 185 }],
        },
      ],
      schedule: [
        {
          id: 'future',
          title: 'Not Yet',
          type: 'Ep',
          release_date: '2026-12-01',
          artwork: '/images/audio/artwork/future.jpg',
        },
        {
          id: 'awake',
          title: 'Are We Awake?',
          type: 'Ep',
          release_date: '2026-09-24',
          artwork: '/images/audio/unreleased/eps/SERGIK - Are We Awake/cover.png',
        },
      ],
      staticReleases: [
        {
          id: 'soul-candy',
          title: 'Soul Candy Static',
          type: 'EP',
          year: 2025,
          image: '/images/audio/artwork/soul.jpg',
        },
      ],
    })

    expect(items.map((item) => item.id)).toEqual(['soul-candy', 'awake'])
    expect(items[0]).toMatchObject({
      title: 'Soul Candy Live',
      type: 'EP',
      year: 2025,
      tracks: [{ title: 'Track One', duration: 185, audioUrl: '' }],
    })
    expect(items[0]?.image).toContain('i.scdn.co')
  })

  it('drops artwork hosts that are not reachable', () => {
    const items = buildTvReleases({
      today: '2026-11-03',
      live: [],
      schedule: [],
      staticReleases: [
        {
          id: 'broken',
          title: 'Broken',
          type: 'Single',
          year: 2026,
          image: 'https://storage.local.invalid/not-a-gallery-file.png',
        },
      ],
    })
    expect(items[0]?.image).toBe('')
  })
})

describe('buildTvListen', () => {
  it('keeps playlists that have a stream URL and puts featured first', () => {
    const items = buildTvListen([
      { id: 'empty', title: 'Empty', url: '  ', featured: true },
      { id: 'latest', title: 'Latest', url: 'https://soundcloud.com/sergikdropz/sets/latest' },
      { id: 'all', title: 'All Tracks', url: 'https://soundcloud.com/sergikdropz/tracks', featured: true },
    ])
    expect(items.map((item) => item.id)).toEqual(['all', 'latest'])
  })
})

describe('formatTvDuration', () => {
  it('formats seconds for the release stage', () => {
    expect(formatTvDuration(185)).toBe('3:05')
    expect(formatTvDuration(0)).toBe('')
    expect(formatTvDuration(null)).toBe('')
  })
})
