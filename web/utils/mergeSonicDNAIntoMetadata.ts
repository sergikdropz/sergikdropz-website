/**
 * Helper function to merge Sonic DNA and other analysis data into metadata
 * This ensures all fetched data is preserved in metadata for future use
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

  // Always include sonic DNA if provided
  if (sonicDNA) {
    metadata.sonic_dna = sonicDNA
    // Also store timestamp of when sonic DNA was last updated
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
    if (analysisData.waveform_data !== undefined) {
      metadata.waveform_data = analysisData.waveform_data
    }
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
      if (!['bpm', 'key_signature', 'energy_level', 'danceability', 'waveform_data', 'waveform_samples', 'duration_seconds', 'artwork_url'].includes(key)) {
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
