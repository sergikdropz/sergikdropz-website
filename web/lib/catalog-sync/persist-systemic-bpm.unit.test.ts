import { describe, expect, it, vi } from 'vitest'
import { persistSystemicBpm } from '@/lib/catalog-sync/persist-systemic-bpm'
import { applyAdminBpmToTrack, displayTrackBpm } from '@/lib/audio/track-display'

type Row = {
  id: string
  bpm?: number | null
  original_bpm?: number | null
  metadata?: unknown
  sonic_dna?: unknown
  audio_file_id?: string | null
}

const AUDIO_ID = '11111111-1111-1111-1111-111111111111'
const TRACK_ID = '22222222-2222-2222-2222-222222222222'

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

describe('persistSystemicBpm', () => {
  it('writes BPM to audio_files, library rows, catalog lock, and DNA', async () => {
    const supabase = mockSupabase({
      audio: {
        id: AUDIO_ID,
        bpm: 124,
        original_bpm: 124,
        metadata: {},
        sonic_dna: { measured: { bpm: 124, bpmConfidence: 0.8 } },
      },
      library: [
        {
          id: TRACK_ID,
          audio_file_id: AUDIO_ID,
          bpm: 125,
          metadata: { catalog_overrides: { bpm: 125 } },
          sonic_dna: { measured: { bpm: 124 } },
        },
      ],
    })

    const result = await persistSystemicBpm(supabase as never, { trackId: AUDIO_ID, bpm: 126 })
    expect(result).toEqual({ audioFileId: AUDIO_ID, libraryTrackIds: [TRACK_ID], bpm: 126 })

    const audioUpdate = supabase.updates.find((entry) => entry.table === 'audio_files')
    const libraryUpdate = supabase.updates.find((entry) => entry.table === 'music_library_tracks')
    expect(audioUpdate?.payload.bpm).toBe(126)
    expect((audioUpdate?.payload.sonic_dna as { measured?: { bpm?: number } })?.measured?.bpm).toBe(126)
    expect(libraryUpdate?.payload.bpm).toBe(126)
    expect(
      (libraryUpdate?.payload.metadata as { catalog_overrides?: { bpm?: number } })?.catalog_overrides
        ?.bpm,
    ).toBe(126)
  })

  it('resolves a library track id back to the linked audio file', async () => {
    const supabase = mockSupabase({
      audio: { id: AUDIO_ID, bpm: 120, metadata: {} },
      library: [{ id: TRACK_ID, audio_file_id: AUDIO_ID, bpm: 120, metadata: {} }],
    })

    const result = await persistSystemicBpm(supabase as never, { trackId: TRACK_ID, bpm: 128 })
    expect(result.audioFileId).toBe(AUDIO_ID)
    expect(result.libraryTrackIds).toContain(TRACK_ID)
    expect(supabase.updates.some((entry) => entry.table === 'audio_files' && entry.payload.bpm === 128)).toBe(
      true,
    )
  })
})

describe('applyAdminBpmToTrack', () => {
  it('locks catalog + DNA so badge and ORIG resolve to the same BPM', () => {
    const next = applyAdminBpmToTrack(
      {
        bpm: 124,
        metadata: { catalog_overrides: { bpm: 125 } },
        sonic_dna: { measured: { bpm: 124, bpmConfidence: 0.9 } },
      },
      126,
    )
    expect(next.bpm).toBe(126)
    expect(displayTrackBpm(next)).toBe(126)
    expect((next.sonic_dna as { measured?: { bpm?: number } }).measured?.bpm).toBe(126)
  })
})
