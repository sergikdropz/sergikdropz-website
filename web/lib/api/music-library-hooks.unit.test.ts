import { describe, expect, it } from 'vitest'
import { queryKeys } from '@/lib/api/query-keys'
import { MUSIC_LIBRARY_LEAF_STALE_MS } from '@/lib/api/music-library-hooks'
import { MUSIC_LIBRARY_CACHE_INVALIDATED_EVENT } from '@/utils/musicLibraryApi'

describe('queryKeys.musicLibrary', () => {
  it('nests leaf keys under a shared root for prefix invalidation', () => {
    expect(queryKeys.musicLibrary.root()).toEqual(['musicLibrary'])
    expect(queryKeys.musicLibrary.smartPlaylists(42)[0]).toBe('musicLibrary')
    expect(queryKeys.musicLibrary.playlists(42, true, false)).toEqual([
      'musicLibrary',
      'playlists',
      42,
      true,
      false,
    ])
  })

  it('includes publishVersion so a bump cannot reuse a stale entry', () => {
    const a = queryKeys.musicLibrary.browse(1, 'albums', { sort: 'title' })
    const b = queryKeys.musicLibrary.browse(2, 'albums', { sort: 'title' })
    expect(a).not.toEqual(b)
    expect(a[2]).toBe(1)
    expect(b[2]).toBe(2)
  })
})

describe('music library leaf cache contract', () => {
  it('keeps leaf staleTime short (risk: stale sidebar after publish)', () => {
    expect(MUSIC_LIBRARY_LEAF_STALE_MS).toBeLessThanOrEqual(60_000)
  })

  it('exports the invalidation event the RQ bridge listens for', () => {
    expect(MUSIC_LIBRARY_CACHE_INVALIDATED_EVENT).toBe('sergik:music-library-cache-invalidated')
  })
})
