import { createSupabaseServerClient } from '@/lib/supabase'

type SonicDNACacheMetadata = {
  bpm?: number | null
  key_signature?: string | null
  energy_level?: number | null
  danceability?: number | null
}

function safeJsonParse(value: any): any {
  if (!value) return null
  if (typeof value !== 'string') return value
  try {
    return JSON.parse(value)
  } catch {
    return null
  }
}

/**
 * Upsert a row in `sonic_dna_cache` for fast lookup at library-load time.
 * This must never throw (cache failures should not break primary flows).
 */
export async function updateSonicDNACache(
  trackId: string,
  audioFileId: string | null,
  sonicDna: any,
  metadata: SonicDNACacheMetadata,
) {
  try {
    if (!trackId || !sonicDna) return

    const supabase = createSupabaseServerClient()
    const dna = safeJsonParse(sonicDna)
    if (!dna) return

    const genresRaw =
      dna?.genres?.primaryGenres ??
      dna?.comprehensive?.genres?.primary ??
      dna?.genres?.primary ??
      []

    const genres = Array.isArray(genresRaw)
      ? genresRaw.filter(Boolean)
      : genresRaw
        ? [genresRaw]
        : []

    const primaryGenre =
      dna?.genres?.primaryGenres?.[0] ??
      dna?.comprehensive?.genres?.primary?.[0] ??
      dna?.genres?.primary?.[0] ??
      dna?.genre ??
      null

    const subgenre =
      dna?.genres?.subgenres?.[0] ??
      dna?.comprehensive?.genres?.subgenres?.[0] ??
      null

    const drumStyle = dna?.drums?.style ?? dna?.technical?.drums?.style ?? null

    const timeSignature =
      dna?.technical?.timeSignature ?? dna?.musical?.timeSignature ?? null

    const key = dna?.harmony?.keySignature ?? dna?.technical?.key?.key ?? null
    const scale = dna?.harmony?.scale ?? dna?.technical?.key?.scale ?? null

    const cacheRow = {
      track_id: trackId,
      audio_file_id: audioFileId,
      sonic_dna: dna,
      bpm: metadata?.bpm ?? null,
      key_signature: metadata?.key_signature ?? null,
      energy_level: metadata?.energy_level ?? null,
      danceability: metadata?.danceability ?? null,
      genres,
      primary_genre: primaryGenre,
      subgenre,
      drum_style: drumStyle,
      time_signature: timeSignature,
      key,
      scale,
      updated_at: new Date().toISOString(),
    }

    await supabase.from('sonic_dna_cache').upsert(cacheRow, {
      onConflict: 'track_id',
    })
  } catch (error) {
    console.error('Error updating sonic_dna_cache:', error)
  }
}

