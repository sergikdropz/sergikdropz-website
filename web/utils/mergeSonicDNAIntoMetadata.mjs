/**
 * Helper function to merge Sonic DNA and other analysis data into metadata
 * This ensures all fetched data is preserved in metadata for future use
 * JavaScript version for use in .mjs scripts
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
