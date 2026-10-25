import { describe, expect, it } from 'vitest'
import {
  deezerAlbumFromSearch,
  hyperfollowLookupUrl,
  platformEmbedFromUrl,
  releaseUrlsFromOdesliMatches,
  releaseUrlsFromStoreHtml,
  sharePlatformEmbeds,
} from '@/lib/shares/platform-embeds'

describe('share platform embeds', () => {
  it('builds a Spotify album player and ignores artist pages', () => {
    const album = platformEmbedFromUrl('spotify', 'https://open.spotify.com/album/3DftNBfJIqXhjP7i7c7qci')
    expect(album?.embedUrl).toBe(
      'https://open.spotify.com/embed/album/3DftNBfJIqXhjP7i7c7qci?utm_source=generator&theme=0',
    )
    expect(platformEmbedFromUrl('spotify', 'https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H')).toBeNull()
  })

  it('builds an Apple Music album player', () => {
    const embed = platformEmbedFromUrl(
      'apple_music',
      'https://music.apple.com/us/album/staying-a-vibe-ep/6819537007?uo=4',
    )
    expect(embed?.embedUrl).toBe('https://embed.music.apple.com/us/album/staying-a-vibe-ep/6819537007')
  })

  it('builds a YouTube Music playlist player and ignores channel pages', () => {
    const embed = platformEmbedFromUrl(
      'youtube_music',
      'https://music.youtube.com/playlist?list=OLAK5uy_example',
    )
    expect(embed?.embedUrl).toContain('youtube.com/embed/videoseries?list=OLAK5uy_example')
    expect(
      platformEmbedFromUrl('youtube_music', 'https://music.youtube.com/channel/UCBWcROfNv8PeY6KdrnNM_pw'),
    ).toBeNull()
  })

  it('reads a release Spotify URL out of a store page', () => {
    const html =
      'href="https:&#47;&#47;open.spotify.com&#47;album&#47;3DftNBfJIqXhjP7i7c7qci" data-hyperfollow-store="spotify"'
    expect(releaseUrlsFromStoreHtml(html).spotify).toBe(
      'https://open.spotify.com/album/3DftNBfJIqXhjP7i7c7qci',
    )
    expect(hyperfollowLookupUrl('SERGIK', 'Staying A Vibe')).toBe(
      'https://distrokid.com/hyperfollow/sergik/staying-a-vibe',
    )
  })

  it('keeps the main store row and skips artist pages', () => {
    const embeds = sharePlatformEmbeds({
      tidal: 'https://listen.tidal.com/album/567167649',
      deezer: 'https://www.deezer.com/album/1113793662',
      amazon: 'https://music.amazon.com/albums/B0HLZ6NWNB',
      apple_music: 'https://music.apple.com/us/album/staying-a-vibe-ep/6819537007',
      spotify: 'https://open.spotify.com/artist/7MnvMhWoSe4wYXuiI6iQ8H',
      youtube_music: 'https://music.youtube.com/watch?v=abcdefghijk',
      pandora: 'https://www.pandora.com/search/staying%20a%20vibe',
      iheart: 'https://www.iheart.com/artist/id-36587473/',
    })
    expect(embeds.map((embed) => embed.id)).toEqual([
      'apple_music',
      'youtube_music',
      'amazon',
      'deezer',
      'tidal',
    ])
    expect(embeds.find((embed) => embed.id === 'amazon')?.embedUrl).toBeUndefined()
    expect(embeds.find((embed) => embed.id === 'tidal')?.url).toBe('https://tidal.com/album/567167649')
  })

  it('reads Odesli album matches and ignores the iTunes duplicate', () => {
    const urls = releaseUrlsFromOdesliMatches({
      links: {
        spotify: { url: 'https://open.spotify.com/album/3DftNBfJIqXhjP7i7c7qci' },
        appleMusic: { url: 'https://geo.music.apple.com/us/album/_/6819537007?mt=1&app=music' },
        itunes: { url: 'https://geo.music.apple.com/us/album/_/6819537007?mt=1&app=itunes' },
        amazonMusic: { url: 'https://music.amazon.com/albums/B0HLZ6NWNB' },
        tidal: { url: 'https://listen.tidal.com/album/567167649' },
      },
    })
    expect(urls.spotify).toBe('https://open.spotify.com/album/3DftNBfJIqXhjP7i7c7qci')
    expect(urls.apple_music).toBe('https://music.apple.com/us/album/_/6819537007')
    expect(urls.amazon).toBe('https://music.amazon.com/albums/B0HLZ6NWNB')
    expect(urls.tidal).toBe('https://tidal.com/album/567167649')
  })

  it('picks the Deezer album that matches this release', () => {
    const url = deezerAlbumFromSearch(
      {
        data: [
          { title: 'Stay', artist: { name: 'Someone' }, link: 'https://www.deezer.com/album/1' },
          {
            title: 'Staying A Vibe',
            artist: { name: 'Sergik' },
            link: 'https://www.deezer.com/album/1113793662',
          },
        ],
      },
      'Staying A Vibe',
      'SERGIK',
    )
    expect(url).toBe('https://www.deezer.com/album/1113793662')
  })
})
