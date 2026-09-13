import { describe, expect, it, vi } from 'vitest'
import { propagateFolderArtworkToTracks } from '@/lib/catalog-sync/propagate-folder-artwork'

function mockSupabase(trackRows: Array<{ id: string; audio_file_id: string | null }>) {
  const trackUpdate = vi.fn().mockReturnValue({
    eq: vi.fn().mockReturnValue({
      select: vi.fn().mockResolvedValue({ data: trackRows, error: null }),
    }),
  })
  const audioUpdate = vi.fn().mockReturnValue({
    in: vi.fn().mockResolvedValue({ data: null, error: null, count: trackRows.length }),
  })
  return {
    from: vi.fn((table: string) => {
      if (table === 'music_library_tracks') return { update: trackUpdate }
      if (table === 'audio_files') return { update: audioUpdate }
      throw new Error(`unexpected table ${table}`)
    }),
    _trackUpdate: trackUpdate,
    _audioUpdate: audioUpdate,
  }
}

describe('propagateFolderArtworkToTracks', () => {
  it('updates all folder tracks and linked audio files', async () => {
    const supabase = mockSupabase([
      { id: 't1', audio_file_id: 'a1' },
      { id: 't2', audio_file_id: 'a2' },
      { id: 't3', audio_file_id: 'a1' },
    ])
    const result = await propagateFolderArtworkToTracks(
      supabase as any,
      'collection-daze',
      '/images/audio/artwork/folder-collection-daze.png',
    )
    expect(result.tracksUpdated).toBe(3)
    expect(supabase.from).toHaveBeenCalledWith('music_library_tracks')
    expect(supabase.from).toHaveBeenCalledWith('audio_files')
    expect(result.audioFilesUpdated).toBeGreaterThan(0)
  })

  it('no-ops without folder id', async () => {
    const supabase = mockSupabase([])
    const result = await propagateFolderArtworkToTracks(supabase as any, '', '/x.png')
    expect(result).toEqual({ tracksUpdated: 0, audioFilesUpdated: 0 })
    expect(supabase.from).not.toHaveBeenCalled()
  })
})
