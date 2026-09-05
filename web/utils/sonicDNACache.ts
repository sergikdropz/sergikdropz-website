import { createSupabaseServerClient } from '@/lib/supabase'
import { isUsableCatalogValue } from '@/lib/music-library-publish'

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

/** Write admin catalog BPM/key/genre onto cache without wiping existing DNA. */
export async function syncCatalogFieldsToCache(
  trackId: string,
  audioFileId: string | null,
  catalog: {
    bpm?: unknown
    key_signature?: unknown
    genre?: unknown
    subgenre?: unknown
    sonic_dna?: unknown
  },
) {
  try {
    if (!trackId) return
    const supabase = createSupabaseServerClient()
    const dna = catalog.sonic_dna ? safeJsonParse(catalog.sonic_dna) : null
    if (dna) {
      await updateSonicDNACache(trackId, audioFileId, dna, {
        bpm: isUsableCatalogValue(catalog.bpm) ? (catalog.bpm as number) : null,
        key_signature: isUsableCatalogValue(catalog.key_signature)
          ? String(catalog.key_signature)
          : null,
      })
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (audioFileId) patch.audio_file_id = audioFileId
    if (isUsableCatalogValue(catalog.bpm)) patch.bpm = catalog.bpm
    if (isUsableCatalogValue(catalog.key_signature)) {
      patch.key_signature = catalog.key_signature
      patch.key = catalog.key_signature
    }
    if (isUsableCatalogValue(catalog.genre)) {
      patch.primary_genre = catalog.genre
      patch.genres = [catalog.genre, catalog.subgenre].filter((value) => isUsableCatalogValue(value))
    }
    if (isUsableCatalogValue(catalog.subgenre)) patch.subgenre = catalog.subgenre

    if (Object.keys(patch).length <= 1) return

    const { data: existing } = await supabase
      .from('sonic_dna_cache')
      .select('track_id')
      .eq('track_id', trackId)
      .maybeSingle()

    if (existing?.track_id) {
      await supabase.from('sonic_dna_cache').update(patch).eq('track_id', trackId)
      return
    }

    await supabase.from('sonic_dna_cache').insert({
      track_id: trackId,
      audio_file_id: audioFileId,
      sonic_dna: dna || {},
      ...patch,
    })
  } catch (error) {
    console.error('Error syncing catalog fields to sonic_dna_cache:', error)
  }
}

