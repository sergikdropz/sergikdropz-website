import { describe, expect, it } from 'vitest'
import {
  appendSonicDnaLookupParams,
  musicLibrarySonicDnaHref,
  parseMusicLibraryDnaQuery,
  sonicDnaLookupPath,
} from '@/lib/audio/sonic-dna-query'
import { resolveMeasuredLookupIds } from '@/lib/audio/load-local-measured'

describe('sonicDnaLookupPath', () => {
  it('unwraps same-origin media proxy URLs to storage keys', () => {
    expect(
      sonicDnaLookupPath(
        '/api/audio/media/unreleased/eps/SERGIK%20-%20FTP/SERGIK%20-%20FTP.mp3',
      ),
    ).toBe('unreleased/eps/SERGIK - FTP/SERGIK - FTP.mp3')
  })

  it('unwraps absolute site URLs that use the media proxy', () => {
    expect(
      sonicDnaLookupPath(
        'http://localhost:3001/api/audio/media/unreleased/eps/SERGIK%20-%20AHA.mp3',
      ),
    ).toBe('unreleased/eps/SERGIK - AHA.mp3')
  })
})

describe('appendSonicDnaLookupParams', () => {
  it('sends library id and audio file id separately', () => {
    const params = appendSonicDnaLookupParams(new URLSearchParams(), {
      libraryTrackId: 'track-unreleased-eps-foo',
      audioFileId: '11111111-1111-1111-1111-111111111111',
      file: 'https://example.supabase.co/storage/v1/object/public/audio-files/unreleased/eps/SERGIK%20-%20AHA.mp3',
      title: 'AHA',
    })
    expect(params.get('trackId')).toBe('track-unreleased-eps-foo')
    expect(params.get('audioFileId')).toBe('11111111-1111-1111-1111-111111111111')
    expect(params.get('title')).toBe('AHA')
    expect(params.get('path')).toContain('unreleased/eps')
    expect(params.get('path')).not.toContain('/api/audio/media')
  })

  it('normalizes proxy playback URLs before path lookup', () => {
    const params = appendSonicDnaLookupParams(new URLSearchParams(), {
      libraryTrackId: 'track-foo',
      file: '/api/audio/media/unreleased/eps/SERGIK%20-%20AHA.mp3',
      title: 'AHA',
    })
    expect(params.get('path')).toBe('unreleased/eps/SERGIK - AHA.mp3')
  })
})

describe('music library Sonic DNA deep link', () => {
  it('builds a shareable fan href from a library track id', () => {
    expect(musicLibrarySonicDnaHref('track-foo')).toBe('/music-library?dna=track-foo')
    expect(musicLibrarySonicDnaHref('a b')).toBe('/music-library?dna=a%20b')
    expect(musicLibrarySonicDnaHref('')).toBe('/music-library')
  })

  it('reads dna from a query string', () => {
    expect(parseMusicLibraryDnaQuery('?dna=track-foo')).toBe('track-foo')
    expect(parseMusicLibraryDnaQuery('dna=track-foo&view=songs')).toBe('track-foo')
    expect(parseMusicLibraryDnaQuery('?q=hello')).toBeNull()
    expect(parseMusicLibraryDnaQuery('')).toBeNull()
  })
})

describe('resolveMeasuredLookupIds', () => {
  it('maps catalog library slugs to audio UUIDs when catalog is present', () => {
    const libraryId =
      'track-unreleased-eps-SERGIK - Soul Candy-seergik---all-the-vibes-in-collection-unreleased-eps-sergik---soul-candy-'
    const ids = resolveMeasuredLookupIds(libraryId, null)
    expect(ids).toContain('41ec1c1e-f508-4773-945b-5f45e380386b')
  })
})
