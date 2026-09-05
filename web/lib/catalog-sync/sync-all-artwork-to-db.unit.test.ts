import { describe, expect, it, vi } from 'vitest'
import { syncAllArtworkToDatabase } from '@/lib/catalog-sync/sync-all-artwork-to-db'

function mockSupabase(opts: {
  folders: Array<{ id: string; artwork_url: string | null }>
  tracks: Array<{ folder_id: string; artwork_url: string; updated_at?: string }>
}) {
  const folderUpdateEq = vi.fn().mockResolvedValue({ error: null })
  const playlistUpdateEq = vi.fn().mockResolvedValue({ error: null })
  const trackUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({
        data: opts.tracks.map((t, i) => ({ id: `t${i}`, audio_file_id: `a${i}` })),
        error: null,
      }),
    }),
  })
  const audioUpdate = vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({ data: null, error: null, count: opts.tracks.length }),
  })
  return {
    from: vi.fn((table: string) => {
      if (table === 'music_library_folders') {
        return {
          select: vi.fn().mockResolvedValue({ data: opts.folders, error: null }),
          update: vi.fn().mockReturnValue({ eq: folderUpdateEq }),
        }
      }
      if (table === 'music_library_playlists') {
        return { update: vi.fn().mockReturnValue({ eq: playlistUpdateEq }) }
      }
      if (table === 'music_library_tracks') {
        return {
          select: vi.fn().mockReturnValue({
            not: vi.fn().mockReturnValue({
              neq: vi.fn().mockReturnValue({
                order: vi.fn().mockResolvedValue({ data: opts.tracks, error: null }),
              }),
            }),
            in: vi.fn().mockResolvedValue({ data: [], error: null }),
          }),
          update: trackUpdate,
        }
      }
      if (table === 'audio_files') return { update: audioUpdate }
      return {
        select: vi.fn().mockReturnValue({
          in: vi.fn().mockResolvedValue({ data: [], error: null }),
        }),
      }
    }),
  }
}

describe('syncAllArtworkToDatabase', () => {
  it('writes local and folder covers onto every sibling track', async () => {
    const supabase = mockSupabase({
      folders: [
        { id: '1787772055352', artwork_url: null },
        { id: 'empty', artwork_url: null },
      ],
      tracks: [{ folder_id: '1787772055352', artwork_url: '/old.png' }],
    })
    const local = new Map([
      ['1787772055352', '/images/audio/artwork/folder-1787772055352.jpg'],
    ])
    const result = await syncAllArtworkToDatabase(supabase as any, { localByFolderId: local })
    expect(result.foldersWritten).toBe(1)
    expect(result.skipped).toBe(1)
    expect(result.tracksUpdated).toBeGreaterThan(0)
  })

  it('matches local files when the folder id has a trailing hyphen', async () => {
    const supabase = mockSupabase({
      folders: [{ id: 'collection-unreleased-eps-sergik---daze-', artwork_url: null }],
      tracks: [{ folder_id: 'collection-unreleased-eps-sergik---daze-', artwork_url: '/old.png' }],
    })
    const local = new Map([
      ['collection-unreleased-eps-sergik---daze', '/images/audio/artwork/folder-collection-unreleased-eps-sergik---daze.jpg'],
    ])
    const result = await syncAllArtworkToDatabase(supabase as any, { localByFolderId: local })
    expect(result.foldersWritten).toBe(1)
    expect(result.skipped).toBe(0)
  })
})
