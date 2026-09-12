/**
 * Merge scalar analysis results into a track's `metadata` jsonb.
 *
 * The full `sonic_dna` and `waveform_data` blobs are deliberately NOT mirrored
 * here. They live in their own columns (`sonic_dna` / `waveform` on
 * music_library_tracks, `sonic_dna` / `waveform_data` on audio_files), and every
 * caller writes those alongside this metadata. Mirroring them grew `metadata`
 * to ~60KB per track, which made any list query that selects the column detoast
 * megabytes and hit the Postgres statement timeout.
 *
 * Keep this function to small, queryable scalars only.
 */

export interface MetadataWithSonicDNA {
  sonic_dna?: any
  bpm?: number | null
  key_signature?: string | null
  energy_level?: number | null
  danceability?: number | null
  waveform_data?: any
  waveform_samples?: number | null
  duration_seconds?: number | null
  artwork_url?: string | null
  [key: string]: any
}

/**
 * Merges Sonic DNA and analysis data into existing metadata
 * @param existingMetadata - Current metadata object (can be null/undefined)
 * @param sonicDNA - Sonic DNA analysis data
 * @param analysisData - Other analysis data (bpm, key_signature, etc.)
 * @returns Merged metadata object with sonic DNA and analysis data
 */
export function mergeSonicDNAIntoMetadata(
  existingMetadata: any = {},
  sonicDNA?: any,
  analysisData?: {
    bpm?: number | null
    key_signature?: string | null
    energy_level?: number | null
    danceability?: number | null
    waveform_data?: any
    waveform_samples?: number | null
    duration_seconds?: number | null
    artwork_url?: string | null
    [key: string]: any
  }
): MetadataWithSonicDNA {
  // Start with existing metadata (ensure it's an object)
  const metadata: MetadataWithSonicDNA = typeof existingMetadata === 'object' && existingMetadata !== null
    ? { ...existingMetadata }
    : {}

  // Blob lives in the `sonic_dna` column — only record that it was refreshed.
  if (sonicDNA) {
    delete metadata.sonic_dna
    metadata.sonic_dna_updated_at = new Date().toISOString()
  }

  // Merge analysis data into metadata
  if (analysisData) {
    if (analysisData.bpm !== undefined && analysisData.bpm !== null) {
      metadata.bpm = analysisData.bpm
    }
    if (analysisData.key_signature !== undefined && analysisData.key_signature !== null) {
      metadata.key_signature = analysisData.key_signature
    }
    if (analysisData.energy_level !== undefined && analysisData.energy_level !== null) {
      metadata.energy_level = analysisData.energy_level
    }
    if (analysisData.danceability !== undefined && analysisData.danceability !== null) {
      metadata.danceability = analysisData.danceability
    }
    // Peaks live in the waveform column; keep only the cheap sample count.
    delete metadata.waveform_data
    if (analysisData.waveform_samples !== undefined && analysisData.waveform_samples !== null) {
      metadata.waveform_samples = analysisData.waveform_samples
    }
    if (analysisData.duration_seconds !== undefined && analysisData.duration_seconds !== null) {
      metadata.duration_seconds = analysisData.duration_seconds
    }
    if (analysisData.artwork_url !== undefined && analysisData.artwork_url !== null) {
      metadata.artwork_url = analysisData.artwork_url
    }

    // Include any other fields from analysisData
    Object.keys(analysisData).forEach(key => {
      if (!['bpm', 'key_signature', 'energy_level', 'danceability', 'waveform_data', 'waveform_samples', 'duration_seconds', 'artwork_url', 'sonic_dna', 'waveform'].includes(key)) {
        metadata[key] = analysisData[key]
      }
    })
  }

  // Store metadata update timestamp
  metadata.metadata_updated_at = new Date().toISOString()

  return metadata
}

/**
 * Extracts Sonic DNA from metadata if it exists
 * @param metadata - Metadata object that may contain sonic_dna
 * @returns Sonic DNA object or null
 */
export function extractSonicDNAFromMetadata(metadata: any): any | null {
  if (!metadata || typeof metadata !== 'object') {
    return null
  }
  return metadata.sonic_dna || null
}
