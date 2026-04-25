/**
 * Track Index Utilities
 * 
 * Functions to build and maintain the metadata index for fast stats.
 * This index allows stats to be calculated without fetching large JSONB columns.
 */

export interface TrackIndexFlags {
  // Boolean flags for fast filtering
  has_bpm: boolean
  has_key: boolean
  has_sonic_dna: boolean
  has_waveform: boolean
  has_artwork: boolean
  has_energy: boolean
  has_danceability: boolean
  is_linked: boolean
  
  // Quick access data
  primary_genre: string | null
  genres: string[] | null
  camelot: string | null
  
  // Index metadata
  indexed_at: string
  index_version: number
}

/**
 * Build index flags from track data
 */
export function buildTrackIndex(track: {
  bpm?: number | null
  key_signature?: string | null
  sonic_dna?: any
  waveform?: any
  artwork_url?: string | null
  artwork?: string | null
  energy_level?: number | null
  danceability?: number | null
  audio_file_id?: string | null
}): TrackIndexFlags {
  // Parse sonic_dna if it's a string
  let sonicDna: any = null
  let hasSonicDna = false
  let primaryGenre: string | null = null
  let allGenres: string[] = []
  let camelot: string | null = null

  if (track.sonic_dna) {
    try {
      sonicDna = typeof track.sonic_dna === 'string' 
        ? JSON.parse(track.sonic_dna) 
        : track.sonic_dna
      
      // Check if it has real sonic DNA data (not just placeholder)
      hasSonicDna = !!(sonicDna?.genres || sonicDna?.technical || sonicDna?.drums || sonicDna?.harmony)
      
      // Extract genre
      primaryGenre = sonicDna?.genres?.primaryGenres?.[0] || 
                     sonicDna?.genres?.primary?.[0] || 
                     sonicDna?.drums?.genreStyles?.[0] || 
                     null
      
      // Collect all genres
      const genreSet = new Set<string>()
      if (sonicDna?.genres?.primaryGenres) sonicDna.genres.primaryGenres.forEach((g: string) => genreSet.add(g))
      if (sonicDna?.genres?.primary) sonicDna.genres.primary.forEach((g: string) => genreSet.add(g))
      if (sonicDna?.genres?.subgenres) sonicDna.genres.subgenres.forEach((g: string) => genreSet.add(g))
      if (sonicDna?.drums?.genreStyles) sonicDna.drums.genreStyles.forEach((g: string) => genreSet.add(g))
      allGenres = Array.from(genreSet).filter(Boolean)
      
      // Extract camelot
      camelot = sonicDna?.harmony?.camelot || sonicDna?.technical?.camelot || null
    } catch {
      // Ignore parse errors
    }
  }

  return {
    has_bpm: !!track.bpm,
    has_key: !!(track.key_signature && track.key_signature !== 'Unknown'),
    has_sonic_dna: hasSonicDna,
    has_waveform: !!track.waveform,
    has_artwork: !!(track.artwork_url || track.artwork),
    has_energy: track.energy_level != null,
    has_danceability: track.danceability != null,
    is_linked: !!track.audio_file_id,
    primary_genre: primaryGenre,
    genres: allGenres.length > 0 ? allGenres : null,
    camelot,
    indexed_at: new Date().toISOString(),
    index_version: 1
  }
}

/**
 * Merge index flags into existing metadata
 */
export function mergeIndexIntoMetadata(
  existingMetadata: Record<string, any> | null | undefined,
  index: TrackIndexFlags
): Record<string, any> {
  return {
    ...(existingMetadata || {}),
    ...index
  }
}

/**
 * Build complete metadata with index from track data
 */
export function buildTrackMetadata(
  track: Parameters<typeof buildTrackIndex>[0],
  existingMetadata?: Record<string, any> | null
): Record<string, any> {
  const index = buildTrackIndex(track)
  return mergeIndexIntoMetadata(existingMetadata, index)
}
