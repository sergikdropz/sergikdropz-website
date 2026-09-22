import { describe, expect, it, vi } from 'vitest'
import { persistSystemicCover, resolveTrackCollection } from '@/lib/catalog-sync/persist-systemic-cover'

function mockSupabase(opts?: {
  trackRows?: Array<{ id: string; audio_file_id: string | null }>
  folderName?: string
  releases?: Array<{
    id: string
    title: string
    artwork_url: string | null
    marketing_copy: Record<string, unknown> | null
  }>
}) {
  const trackRows = opts?.trackRows ?? [
    { id: 't1', audio_file_id: 'a1' },
    { id: 't2', audio_file_id: 'a2' },
  ]
  const releases = opts?.releases ?? []

  const folderMaybeSingle = vi.fn().mockResolvedValue({
    data: { id: 'collection-daze', name: opts?.folderName ?? 'Daze' },
    error: null,
  })
  const folderSelect = vi.fn().mockReturnValue({ maybeSingle: folderMaybeSingle })
  const folderEq = vi.fn().mockReturnValue({ select: folderSelect })
  const folderUpdate = vi.fn().mockReturnValue({ eq: folderEq })

  const playlistEq = vi.fn().mockResolvedValue({ error: null })
  const playlistUpdate = vi.fn().mockReturnValue({ eq: playlistEq })

  const trackUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: trackRows, error: null }),
    }),
  })
  const audioUpdate = vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({ data: null, error: null, count: trackRows.length }),
  })

  const releaseIn = vi.fn().mockResolvedValue({ error: null })
  const releaseUpdate = vi.fn().mockReturnValue({ in: releaseIn })
  const releaseLimit = vi.fn().mockResolvedValue({ data: releases, error: null })
  const releaseSelect = vi.fn().mockReturnValue({ limit: releaseLimit })

  return {
    from: vi.fn((table: string) => {
      if (table === 'music_library_folders') return { update: folderUpdate }
      if (table === 'music_library_playlists') return { update: playlistUpdate }
      if (table === 'music_library_tracks') return { update: trackUpdate }
      if (table === 'audio_files') return { update: audioUpdate }
      if (table === 'distribution_releases') {
        return { select: releaseSelect, update: releaseUpdate }
      }
      throw new Error(`unexpected table ${table}`)
    }),
    _folderUpdate: folderUpdate,
    _playlistUpdate: playlistUpdate,
    _trackUpdate: trackUpdate,
    _releaseUpdate: releaseUpdate,
    _releaseIn: releaseIn,
  }
}

describe('persistSystemicCover', () => {
  it('writes folder + playlist covers and stamps sibling tracks', async () => {
    const supabase = mockSupabase()
    const result = await persistSystemicCover(
      supabase as any,
      'collection-daze',
      '/images/audio/artwork/folder-collection-daze.png',
    )
    expect(result.folderId).toBe('collection-daze')
    expect(result.playlistId).toBe('playlist-collection-daze')
    expect(result.tracksUpdated).toBe(2)
    expect(result.releasesUpdated).toBe(0)
    expect(supabase._folderUpdate).toHaveBeenCalledWith({
      artwork_url: '/images/audio/artwork/folder-collection-daze.png',
    })
    expect(supabase._playlistUpdate).toHaveBeenCalledWith({
      artwork_url: '/images/audio/artwork/folder-collection-daze.png',
    })
    expect(supabase.from).toHaveBeenCalledWith('music_library_tracks')
    expect(supabase.from).toHaveBeenCalledWith('audio_files')
  })

  it('updates linked distribution_releases by vault folder and title key', async () => {
    const supabase = mockSupabase({
      folderName: 'SERGIK - Daze',
      releases: [
        {
          id: 'rel-vault',
          title: 'Other',
          artwork_url: '/old-a.png',
          marketing_copy: { _vault: { folderId: 'collection-daze' } },
        },
        {
          id: 'rel-title',
          title: 'Daze EP (Digital Download)',
          artwork_url: '/old-b.png',
          marketing_copy: null,
        },
        {
          id: 'rel-other',
          title: 'FTP',
          artwork_url: '/old-c.png',
          marketing_copy: null,
        },
      ],
    })
    const result = await persistSystemicCover(
      supabase as any,
      'collection-daze',
      '/images/audio/artwork/folder-collection-daze.png',
    )
    expect(result.releasesUpdated).toBe(2)
    expect(supabase._releaseUpdate).toHaveBeenCalledWith({
      artwork_url: '/images/audio/artwork/folder-collection-daze.png',
    })
    expect(supabase._releaseIn).toHaveBeenCalledWith('id', expect.arrayContaining(['rel-vault', 'rel-title']))
  })

  it('no-ops without a folder id', async () => {
    const supabase = mockSupabase()
    const result = await persistSystemicCover(supabase as any, null, '/x.png')
    expect(result).toEqual({
      folderId: null,
      playlistId: null,
      tracksUpdated: 0,
      audioFilesUpdated: 0,
      releasesUpdated: 0,
    })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})

describe('resolveTrackCollection', () => {
  it('resolves folder + audio file from a track id', async () => {
    const maybeSingle = vi.fn().mockResolvedValue({
      data: { id: 't1', folder_id: 'collection-daze', audio_file_id: 'a1' },
    })
    const supabase = {
      from: vi.fn(() => ({
        select: vi.fn().mockReturnValue({
          eq: vi.fn().mockReturnValue({ maybeSingle }),
        }),
      })),
    }
    const result = await resolveTrackCollection(supabase as any, { trackId: 't1' })
    expect(result).toEqual({
      folderId: 'collection-daze',
      audioFileId: 'a1',
      trackId: 't1',
    })
  })
})
