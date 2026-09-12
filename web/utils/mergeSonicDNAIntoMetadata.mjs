/**
 * Merge scalar analysis results into a track's `metadata` jsonb.
 * JavaScript version for use in .mjs scripts — keep in sync with the .ts twin.
 *
 * The full `sonic_dna` and `waveform_data` blobs are deliberately NOT mirrored
 * here; they live in their own columns and mirroring them bloated `metadata`
 * until list queries hit the Postgres statement timeout.
 */

/**
 * Merges Sonic DNA and analysis data into existing metadata
 * @param {object} existingMetadata - Current metadata object (can be null/undefined)
 * @param {object} sonicDNA - Sonic DNA analysis data
 * @param {object} analysisData - Other analysis data (bpm, key_signature, etc.)
 * @returns {object} Merged metadata object with sonic DNA and analysis data
 */
export function mergeSonicDNAIntoMetadata(
  existingMetadata = {},
  sonicDNA,
  analysisData = {}
) {
  // Start with existing metadata (ensure it's an object)
  const metadata = typeof existingMetadata === 'object' && existingMetadata !== null
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
