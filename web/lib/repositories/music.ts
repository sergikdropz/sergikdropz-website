import { createSupabaseServerClient } from '@/lib/supabase'
import type { AudioFileSummary, Paginated, RepositoryResult } from './types'

export async function listAudioFiles(params: {
  limit?: number
  offset?: number
  format?: string | null
  folder?: string | null
}): Promise<RepositoryResult<Paginated<AudioFileSummary>>> {
  try {
    const supabase = createSupabaseServerClient()
    const limit = Math.max(1, Math.min(params.limit ?? 100, 2000))
    const offset = Math.max(0, params.offset ?? 0)

    let query = supabase
      .from('audio_files')
      .select(
        'id, title, artist, file_name, file_path, file_url, format, duration_seconds, sonic_dna_status',
        { count: 'exact' }
      )
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1)

    if (params.format) query = query.eq('format', params.format)
    if (params.folder) query = query.eq('folder_path', params.folder)

    const { data, error, count } = await query
    if (error) return { ok: false, error: error.message }

    return {
      ok: true,
      data: {
        items: (data as AudioFileSummary[]) ?? [],
        total: count ?? null,
        offset,
        limit,
      },
    }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function getAudioFileById(id: string): Promise<RepositoryResult<AudioFileSummary | null>> {
  try {
    const supabase = createSupabaseServerClient()
    const { data, error } = await supabase
      .from('audio_files')
      .select(
        'id, title, artist, file_name, file_path, file_url, format, duration_seconds, sonic_dna_status, sonic_dna, bpm, key_signature, energy_level, waveform_json_url, waveform_data, waveform_samples, metadata',
      )
      .eq('id', id)
      .maybeSingle()
    if (error) return { ok: false, error: error.message }
    return { ok: true, data: (data as AudioFileSummary | null) ?? null }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}

export async function updateAudioSonicDnaStatus(params: {
  id: string
  status: string
  sonicDna?: Record<string, unknown> | null
}): Promise<RepositoryResult<{ id: string }>> {
  try {
    const supabase = createSupabaseServerClient()
    const patch: Record<string, unknown> = {
      sonic_dna_status: params.status,
      updated_at: new Date().toISOString(),
    }
    if (params.sonicDna !== undefined) patch.sonic_dna = params.sonicDna

    const { data, error } = await supabase
      .from('audio_files')
      .update(patch)
      .eq('id', params.id)
      .select('id')
      .single()

    if (error) return { ok: false, error: error.message }
    return { ok: true, data: { id: data.id as string } }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : String(error) }
  }
}
