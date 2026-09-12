import { describe, expect, it, vi } from 'vitest'
import { persistSystemicBeatGrid } from '@/lib/catalog-sync/persist-systemic-beat-grid'
import { isGridManual } from '@/lib/audio/mix-engine/kick-onsets'

type Row = {
  id: string
  sonic_dna?: unknown
  audio_file_id?: string | null
  beat_grid_offset?: number | null
}

const AUDIO_ID = '11111111-1111-1111-1111-111111111111'
const TRACK_ID = '22222222-2222-2222-2222-222222222222'
const TRACK_ID_B = '33333333-3333-3333-3333-333333333333'

function mockSupabase(opts: { audio?: Row | null; library?: Row[] }) {
  const updates: Array<{ table: string; payload: Record<string, unknown>; id: string }> = []

  const from = vi.fn((table: string) => {
    const select = vi.fn(() => {
      const eq = vi.fn((column: string, value: string) => {
        const rows =
          table === 'audio_files'
            ? opts.audio && opts.audio.id === value
              ? [opts.audio]
              : []
            : (opts.library || []).filter((row) =>
                column === 'audio_file_id' ? row.audio_file_id === value : row.id === value,
              )
        const result = { data: rows, error: null }
        return {
          maybeSingle: async () => ({ data: rows[0] || null, error: null }),
          then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
        }
      })
      return { eq }
    })
    const update = vi.fn((payload: Record<string, unknown>) => ({
      eq: async (_column: string, id: string) => {
        updates.push({ table, payload, id })
        return { error: null }
      },
    }))
    return { select, update }
  })

  return { from, updates }
}

describe('persistSystemicBeatGrid', () => {
  it('writes phase + gridManual DNA to audio, all library rows, and cache', async () => {
    const supabase = mockSupabase({
      audio: {
        id: AUDIO_ID,
        sonic_dna: { measured: { bpm: 124, gridOffsetSec: 0.01 } },
      },
      library: [
        {
          id: TRACK_ID,
          audio_file_id: AUDIO_ID,
          beat_grid_offset: 0.01,
          sonic_dna: { measured: { bpm: 124, gridOffsetSec: 0.01 } },
        },
        {
          id: TRACK_ID_B,
          audio_file_id: AUDIO_ID,
          beat_grid_offset: 0.02,
          sonic_dna: { measured: { bpm: 124 } },
        },
      ],
    })

    const result = await persistSystemicBeatGrid(supabase as never, {
      trackId: AUDIO_ID,
      offsetSec: 0.037,
      gridManual: true,
    })

    expect(result.audioFileId).toBe(AUDIO_ID)
    expect(result.libraryTrackIds).toEqual(expect.arrayContaining([TRACK_ID, TRACK_ID_B]))
    expect(result.beatGridOffset).toBe(0.037)

    const audioUpdate = supabase.updates.find((entry) => entry.table === 'audio_files')
    const libraryUpdates = supabase.updates.filter((entry) => entry.table === 'music_library_tracks')
    const cacheUpdates = supabase.updates.filter((entry) => entry.table === 'sonic_dna_cache')

    expect(isGridManual(audioUpdate?.payload.sonic_dna)).toBe(true)
    expect(
      (audioUpdate?.payload.sonic_dna as { measured?: { gridOffsetSec?: number } })?.measured
        ?.gridOffsetSec,
    ).toBe(0.037)
    expect(libraryUpdates).toHaveLength(2)
    expect(libraryUpdates.every((entry) => entry.payload.beat_grid_offset === 0.037)).toBe(true)
    expect(libraryUpdates.every((entry) => isGridManual(entry.payload.sonic_dna))).toBe(true)
    expect(cacheUpdates).toHaveLength(2)
  })

  it('resolves a library track id and defaults gridManual true', async () => {
    const supabase = mockSupabase({
      audio: { id: AUDIO_ID, sonic_dna: { measured: { bpm: 120 } } },
      library: [{ id: TRACK_ID, audio_file_id: AUDIO_ID, sonic_dna: { measured: { bpm: 120 } } }],
    })

    const result = await persistSystemicBeatGrid(supabase as never, {
      trackId: TRACK_ID,
      offsetSec: 0.05,
    })

    expect(result.audioFileId).toBe(AUDIO_ID)
    expect(result.libraryTrackIds).toContain(TRACK_ID)
    const libraryUpdate = supabase.updates.find((entry) => entry.table === 'music_library_tracks')
    expect(libraryUpdate?.payload.beat_grid_offset).toBe(0.05)
    expect(isGridManual(libraryUpdate?.payload.sonic_dna)).toBe(true)
  })
})
